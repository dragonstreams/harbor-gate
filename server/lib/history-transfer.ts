import { randomBytes } from "node:crypto";
import type { TransferReportItem } from "../../src/types/transfer-report";
import { validatePublicServerUrl } from "./instance-security";
import { normalizeMediaServerUrl } from "./media-server";

type Kind = "emby" | "jellyfin";
type Connection = { type: Kind; url: string; token: string; userId: string; name: string };
type UserData = { Played: boolean; IsFavorite: boolean; PlayCount: number; PlaybackPositionTicks: number; LastPlayedDate: string | null };
type Item = { Id: string; Name: string; Type: string; ProductionYear?: number; SeriesName?: string; ParentIndexNumber?: number; IndexNumber?: number; ProviderIds?: Record<string, string>; UserData?: Partial<UserData> };
type Pair = { source: Item; destination: Item; data: UserData; report: TransferReportItem };
type Plan = { owner: string; expires: number; source: Connection; destination: Connection; pairs: Pair[]; report: TransferReportItem[]; processed: number; transferred: number; failed: number; issues: string[]; unmatched: number; ambiguous: number; running: boolean };
const plans = new Map<string, Plan>();

async function call<T>(connection: Pick<Connection, "type" | "url" | "token">, path: string, body?: unknown): Promise<T> {
  await validatePublicServerUrl(connection.url);
  const auth = 'MediaBrowser Client="HarborGate Transfer", Device="History Transfer", DeviceId="harborgate-transfer", Version="1.0"';
  let response: Response;
  try {
    response = await fetch(`${connection.url}${path}`, {
      method: body === undefined ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(connection.type === "emby" ? { "X-Emby-Authorization": auth, "X-Emby-Token": connection.token } : { Authorization: `${auth}, Token="${connection.token}"` }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    throw new Error(error instanceof Error && error.name === "TimeoutError"
      ? "Media server did not respond within 20 seconds"
      : "Cannot reach the media server. Check its HTTPS API address, TLS certificate, and whether a proxy redirects requests.");
  }
  if (!response.ok) {
    const detail = response.status === 401 ? "Login rejected or session expired. Use the user's local server credentials, not an Emby Connect login."
      : response.status === 403 ? "This user is not permitted to access or update this data."
      : response.status === 404 || response.status === 405 ? "API route unavailable. Check the server type, base URL, and version."
      : [502, 503, 504].includes(response.status) ? "The media-server gateway is unavailable or timed out." : "Media server rejected the request.";
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  const text = (await response.text()).trim();
  if (!text) return undefined as T;
  // Some Emby proxies return a boolean acknowledgement for successful writes.
  if (body !== undefined && !path.includes("AuthenticateByName") && /^\??(?:true|null)$/i.test(text)) return undefined as T;
  try { return JSON.parse(text) as T; } catch { throw new Error("Media server returned non-JSON data. Enter its API base URL, not its web dashboard or a proxy sign-in page."); }
}

async function connect(input: unknown): Promise<Connection> {
  const value = input as Record<string, unknown> | null;
  if (!value || !["emby", "jellyfin"].includes(String(value.type)) || typeof value.url !== "string" || value.url.length > 2048 || typeof value.username !== "string" || !value.username.trim() || value.username.length > 100 || typeof value.password !== "string" || value.password.length > 300) throw new Error("Enter valid server type, URL, username, and password");
  const type = value.type as Kind;
  const url = normalizeMediaServerUrl(type, await validatePublicServerUrl(value.url));
  const result = await call<{ AccessToken: string; User: { Id: string; Name: string } }>({ type, url, token: "" }, "/Users/AuthenticateByName", { Username: value.username.trim(), Pw: value.password });
  if (!result?.AccessToken || !result.User?.Id) throw new Error("Server did not return a user login");
  return { type, url, token: result.AccessToken, userId: result.User.Id, name: result.User.Name };
}

async function queryItems(connection: Connection, filters: Record<string, string>, onProgress: (count: number) => void) {
  const result: Item[] = [];
  for (let start = 0; ; ) {
    onProgress(start);
    const query = new URLSearchParams({ Recursive: "true", StartIndex: String(start), Limit: "500", Fields: "ProviderIds", EnableUserData: "true", EnableImages: "false", EnableTotalRecordCount: "true", CollapseBoxSetItems: "false", IncludeItemTypes: "Movie,Episode,Series,Season,Audio,MusicAlbum,MusicArtist,MusicVideo,Video,Book,BoxSet", ...filters });
    const page = await call<{ Items: Item[]; TotalRecordCount?: number }>(connection, `/Users/${encodeURIComponent(connection.userId)}/Items?${query}`);
    if (!Array.isArray(page?.Items)) throw new Error("Server did not return matching media items");
    result.push(...page.Items);
    start += page.Items.length;
    onProgress(start);
    if (start > 100_000) throw new Error("Filtered results exceed the 100,000-item transfer limit");
    if (!page.Items.length || (page.TotalRecordCount !== undefined ? start >= page.TotalRecordCount : page.Items.length < 500)) break;
  }
  return result;
}

async function concurrent<T, U>(values: T[], action: (value: T, index: number) => Promise<U>): Promise<U[]> {
  const results: U[] = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await action(values[index], index);
    }
  }));
  return results;
}

function chooseMatches(source: Item, candidates: Item[]) {
  const sourceIds = new Set(keys(source));
  const idMatches = candidates.filter((item) => item.Type === source.Type && keys(item).some((key) => sourceIds.has(key)));
  if (idMatches.length) return idMatches;
  const fallback = new Set(fallbackKeys(source));
  return candidates.filter((item) => item.Type === source.Type && !conflictingIds(source, item) && fallbackKeys(item).some((key) => fallback.has(key)));
}

async function findDestination(connection: Connection, source: Item, search: (filters: Record<string, string>) => Promise<Item[]>) {
  if (connection.type === "emby" && keys(source).length) {
    const providerIds = keys(source).map((key) => key.slice(key.indexOf(":") + 1).replace(":", "."));
    const matches = chooseMatches(source, await search({ IncludeItemTypes: source.Type, AnyProviderIdEquals: providerIds.join(",") }));
    if (matches.length) return matches;
  }
  // Jellyfin has no provider-ID equality query; search a narrow title/series scope, then verify IDs locally.
  if (source.Type === "Episode" && source.SeriesName?.trim() && source.ParentIndexNumber !== undefined) {
    const series = await search({ IncludeItemTypes: "Series", SearchTerm: source.SeriesName });
    const episodes: Item[] = [];
    for (const item of series) episodes.push(...await search({ IncludeItemTypes: "Episode", ParentId: item.Id, ParentIndexNumber: String(source.ParentIndexNumber) }));
    return chooseMatches(source, episodes);
  }
  if (!source.Name?.trim()) return [];
  return chooseMatches(source, await search({ IncludeItemTypes: source.Type, SearchTerm: source.Name }));
}

function keys(item: Item) {
  return Object.entries(item.ProviderIds ?? {})
    .filter(([key, value]) => value && ["imdb", "tmdb", "tvdb", "musicbrainztrack", "musicbrainzalbum", "musicbrainzartist"].includes(key.toLowerCase()))
    .map(([key, value]) => `${item.Type}:${key.toLowerCase()}:${value.trim().toLowerCase()}`);
}
function fallbackKeys(item: Item) {
  const name = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  if (item.Type === "Episode" && item.SeriesName && item.ParentIndexNumber !== undefined && item.IndexNumber !== undefined) return [`episode:${name(item.SeriesName)}:${item.ParentIndexNumber}:${item.IndexNumber}`];
  if (["Movie", "Series"].includes(item.Type) && item.ProductionYear) return [`${item.Type}:${name(item.Name)}:${item.ProductionYear}`];
  return [];
}
function conflictingIds(source: Item, destination: Item) {
  const destinationIds = new Map(Object.entries(destination.ProviderIds ?? {}).map(([key, value]) => [key.toLowerCase(), value.trim().toLowerCase()]));
  return Object.entries(source.ProviderIds ?? {}).some(([key, value]) => value && destinationIds.has(key.toLowerCase()) && destinationIds.get(key.toLowerCase()) !== value.trim().toLowerCase());
}
function userData(item: Item): UserData {
  const data = item.UserData!;
  return { Played: Boolean(data.Played), IsFavorite: Boolean(data.IsFavorite), PlayCount: data.PlayCount ?? 0, PlaybackPositionTicks: data.PlaybackPositionTicks ?? 0, LastPlayedDate: data.LastPlayedDate ?? null };
}
async function stage<T>(label: string, action: () => Promise<T>): Promise<T> {
  try { return await action(); } catch (error) {
    const failure = error as { code?: string };
    const message = failure?.code === "ENOTFOUND" || failure?.code === "EAI_AGAIN"
      ? "Cannot resolve the media server's hostname. Check the URL and server DNS."
      : error instanceof Error ? error.message : "Media server request failed";
    throw new Error(`${label}: ${message}`);
  }
}
export async function prepareTransfer(owner: string, sourceInput: unknown, destinationInput: unknown, onProgress: (message: string) => void) {
  for (const [id, plan] of plans) if (plan.expires < Date.now() || (plan.owner === owner && !plan.running)) plans.delete(id);
  if (plans.size >= 20) throw new Error("Transfer capacity reached. Try again later.");
  onProgress("Connecting to source server…");
  const source = await stage("Source login", () => connect(sourceInput));
  onProgress("Connecting to destination server…");
  const destination = await stage("Destination login", () => connect(destinationInput));
  if (source.url === destination.url && source.userId === destination.userId) throw new Error("Source and destination must not be the same user on the same server");
  const sourceCounts = [0, 0, 0];
  const activityFilters = [{ IsPlayed: "true" }, { IsFavorite: "true" }, { Filters: "IsResumable" }];
  const activityResults = await concurrent(activityFilters, (filters, index) => stage("Read source user activity", () => queryItems(source, filters, (count) => {
    sourceCounts[index] = count;
    onProgress(`Reading user activity: ${sourceCounts[0]} watched · ${sourceCounts[1]} favorites · ${sourceCounts[2]} resumable (duplicates removed next)`);
  })));
  const activeItems = new Map<string, Item>();
  for (const item of activityResults.flat()) {
    const data = item.UserData;
    if (data && (data.Played || data.IsFavorite || (data.PlaybackPositionTicks ?? 0) > 0 || (data.PlayCount ?? 0) > 0 || data.LastPlayedDate)) activeItems.set(item.Id, item);
  }
  const sourceItems = [...activeItems.values()];
  let checked = 0;
  const progress = () => onProgress(`Looking up active items on destination: ${checked} / ${sourceItems.length}`);
  progress();
  const searchCache = new Map<string, Promise<Item[]>>();
  const search = (filters: Record<string, string>) => {
    const key = new URLSearchParams(filters).toString();
    let result = searchCache.get(key);
    if (!result) {
      result = queryItems(destination, filters, progress);
      searchCache.set(key, result);
    }
    return result;
  };
  const destinationMatches = await concurrent(sourceItems, async (sourceItem) => {
    progress();
    const matches = await stage(`Look up destination item ${sourceItem.Name}`, () => findDestination(destination, sourceItem, search));
    checked++;
    progress();
    return [...new Map(matches.map((item) => [item.Id, item])).values()];
  });
  const pairs: Pair[] = [];
  const report: TransferReportItem[] = [];
  let unmatched = 0, ambiguous = 0;
  const used = new Set<string>();
  for (let index = 0; index < sourceItems.length; index++) {
    const sourceItem = sourceItems[index];
    const data = userData(sourceItem);
    const entry: TransferReportItem = { id: sourceItem.Id, name: sourceItem.Name, type: sourceItem.Type, seriesName: sourceItem.SeriesName, year: sourceItem.ProductionYear, season: sourceItem.ParentIndexNumber, episode: sourceItem.IndexNumber, data, outcome: "pending", reason: "Awaiting transfer" };
    report.push(entry);
    const matches = destinationMatches[index];
    if (!matches.length) {
      unmatched++; entry.outcome = "unmatched"; entry.reason = "No safe match found in the destination user's accessible media.";
      continue;
    }
    if (matches.length !== 1) {
      ambiguous++; entry.outcome = "ambiguous"; entry.reason = "Multiple destination items matched. Skipped to avoid updating the wrong item.";
      continue;
    }
    const destinationItem = matches[0];
    if (used.has(destinationItem.Id) || conflictingIds(sourceItem, destinationItem)) {
      ambiguous++; entry.outcome = "ambiguous";
      entry.reason = used.has(destinationItem.Id) ? "Another source item already matched this destination item." : "Source and destination metadata IDs conflict.";
      continue;
    }
    used.add(destinationItem.Id);
    if (JSON.stringify(data) !== JSON.stringify(destinationItem.UserData ? userData(destinationItem) : {})) {
      pairs.push({ source: sourceItem, destination: destinationItem, data, report: entry });
    } else {
      entry.outcome = "unchanged"; entry.reason = "Destination user data already matches the source. No write was needed.";
    }
  }
  // Update container favorites after leaf playback data so parent updates cannot undo episode history.
  pairs.sort((a, b) => Number(["Series", "Season", "MusicAlbum", "BoxSet"].includes(a.source.Type)) - Number(["Series", "Season", "MusicAlbum", "BoxSet"].includes(b.source.Type)));
  const id = randomBytes(24).toString("hex");
  plans.set(id, { owner, expires: Date.now() + 30 * 60_000, source, destination, pairs, report, processed: 0, transferred: 0, failed: 0, issues: [], unmatched, ambiguous, running: false });
  const expiry = setInterval(() => {
    const plan = plans.get(id);
    if (!plan || (!plan.running && plan.expires < Date.now())) { plans.delete(id); clearInterval(expiry); }
  }, 60_000);
  expiry.unref();
  return { id, sourceName: source.name, destinationName: destination.name, sourceItems: sourceItems.length, matched: used.size, changes: pairs.length, unmatched, ambiguous, report, samples: pairs.slice(0, 12).map((pair) => ({ name: pair.source.Name, type: pair.source.Type, ...pair.data })) };
}
export async function runTransfer(owner: string, id: string) {
  const plan = plans.get(id);
  if (!plan || plan.owner !== owner || plan.expires < Date.now()) throw new Error("Transfer preview expired. Preview again.");
  if (plan.running) throw new Error("A transfer batch is already running");
  plan.running = true;
  try {
    const container = (pair: Pair) => ["Series", "Season", "MusicAlbum", "BoxSet"].includes(pair.source.Type);
    const batch = plan.pairs.slice(plan.processed, plan.processed + 3).filter((pair) => container(pair) === container(plan.pairs[plan.processed]));
    await Promise.all(batch.map(async (pair) => {
      try {
        const userId = encodeURIComponent(plan.destination.userId);
        const itemId = encodeURIComponent(pair.destination.Id);
        const path = plan.destination.type === "jellyfin" ? `/UserItems/${itemId}/UserData?userId=${userId}` : `/Users/${userId}/Items/${itemId}/UserData`;
        await stage("Save destination data", () => call(plan.destination, path, pair.data));
        const saved = await stage("Verify destination data", () => call<Item>(plan.destination, `/Users/${userId}/Items/${itemId}`));
        const actual = saved?.UserData;
        if (!actual) throw new Error("Verify destination data: server did not return user data");
        const missing: string[] = [];
        if (Boolean(actual.Played) !== pair.data.Played) missing.push("watched status");
        if (Boolean(actual.IsFavorite) !== pair.data.IsFavorite) missing.push("favorite status");
        if ((actual.PlayCount ?? 0) !== pair.data.PlayCount) missing.push("play count");
        if ((actual.PlaybackPositionTicks ?? 0) !== pair.data.PlaybackPositionTicks) missing.push("resume position");
        if ((actual.LastPlayedDate ? Date.parse(actual.LastPlayedDate) : null) !== (pair.data.LastPlayedDate ? Date.parse(pair.data.LastPlayedDate) : null)) missing.push("last-played date");
        if (missing.length) throw new Error(`Destination did not preserve: ${missing.join(", ")}. Other fields may have been saved.`);
        plan.transferred++;
        pair.report.outcome = "transferred";
        pair.report.reason = "Watched status, favorites, play count, resume position, and last-played date saved and verified.";
      } catch (error) {
        plan.failed++;
        pair.report.outcome = "failed";
        pair.report.reason = error instanceof Error ? error.message : "Transfer failed";
        if (plan.issues.length < 20) plan.issues.push(`${pair.source.Name}: ${pair.report.reason}`);
      }
      plan.processed++;
    }));
    plan.expires = Date.now() + 30 * 60_000;
    const done = plan.processed === plan.pairs.length;
    const result = { processed: plan.processed, total: plan.pairs.length, transferred: plan.transferred, failed: plan.failed, issues: plan.issues, done, report: done ? plan.report : undefined };
    if (result.done) plans.delete(id);
    return result;
  } finally { plan.running = false; }
}
export function discardTransfer(owner: string, id: string) {
  const plan = plans.get(id);
  if (plan?.owner === owner && !plan.running) plans.delete(id);
}
