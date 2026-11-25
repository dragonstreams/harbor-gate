import { randomBytes } from "node:crypto";
import { validatePublicServerUrl } from "./instance-security";
import { normalizeMediaServerUrl } from "./media-server";

type Kind = "emby" | "jellyfin";
type Connection = { type: Kind; url: string; token: string; userId: string; name: string };
type UserData = { Played: boolean; IsFavorite: boolean; PlayCount: number; PlaybackPositionTicks: number; LastPlayedDate: string | null };
type Item = { Id: string; Name: string; Type: string; ProductionYear?: number; SeriesName?: string; ParentIndexNumber?: number; IndexNumber?: number; ProviderIds?: Record<string, string>; UserData?: Partial<UserData> };
type Pair = { source: Item; destination: Item; data: UserData };
type Plan = { owner: string; expires: number; source: Connection; destination: Connection; pairs: Pair[]; processed: number; transferred: number; failed: number; issues: string[]; unmatched: number; ambiguous: number; running: boolean };
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

async function items(connection: Connection, onProgress: (count: number) => void) {
  const result: Item[] = [];
  for (let start = 0; ; ) {
    const query = new URLSearchParams({ Recursive: "true", StartIndex: String(start), Limit: "500", Fields: "ProviderIds", EnableUserData: "true", EnableImages: "false", IncludeItemTypes: "Movie,Episode,Series,Season,Audio,MusicAlbum,MusicArtist,MusicVideo,Video,Book,BoxSet" });
    const page = await call<{ Items: Item[]; TotalRecordCount: number }>(connection, `/Users/${encodeURIComponent(connection.userId)}/Items?${query}`);
    if (!Array.isArray(page?.Items)) throw new Error("Server did not return a media library");
    result.push(...page.Items);
    start += page.Items.length;
    onProgress(start);
    if (!page.Items.length || start >= page.TotalRecordCount) break;
    if (start > 100_000) throw new Error("Library exceeds the 100,000-item transfer limit");
  }
  return result;
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
  let sourceCount = 0, destinationCount = 0;
  const progress = () => onProgress(`Reading libraries: ${sourceCount} source items · ${destinationCount} destination items`);
  progress();
  const [sourceItems, destinationItems] = await Promise.all([
    stage("Read source library", () => items(source, (count) => { sourceCount = count; progress(); })),
    stage("Read destination library", () => items(destination, (count) => { destinationCount = count; progress(); })),
  ]);
  onProgress("Matching media between servers…");
  const index = new Map<string, Item[]>();
  const fallbackIndex = new Map<string, Item[]>();
  for (const item of destinationItems) {
    for (const key of keys(item)) index.set(key, [...(index.get(key) ?? []), item]);
    for (const key of fallbackKeys(item)) fallbackIndex.set(key, [...(fallbackIndex.get(key) ?? []), item]);
  }
  const pairs: Pair[] = [];
  let unmatched = 0, ambiguous = 0;
  const used = new Set<string>();
  for (const sourceItem of sourceItems) {
    if (!sourceItem.UserData) { unmatched++; continue; }
    const matches = new Map<string, Item>();
    for (const key of keys(sourceItem)) for (const item of index.get(key) ?? []) matches.set(item.Id, item);
    if (!matches.size) {
      for (const key of fallbackKeys(sourceItem)) for (const item of fallbackIndex.get(key) ?? []) {
        if (!conflictingIds(sourceItem, item)) matches.set(item.Id, item);
      }
    }
    if (!matches.size) { unmatched++; continue; }
    if (matches.size !== 1) { ambiguous++; continue; }
    const destinationItem = [...matches.values()][0];
    if (used.has(destinationItem.Id) || conflictingIds(sourceItem, destinationItem)) { ambiguous++; continue; }
    used.add(destinationItem.Id);
    const data = userData(sourceItem);
    if (JSON.stringify(data) !== JSON.stringify(destinationItem.UserData ? userData(destinationItem) : {})) pairs.push({ source: sourceItem, destination: destinationItem, data });
  }
  // Update container favorites after leaf playback data so parent updates cannot undo episode history.
  pairs.sort((a, b) => Number(["Series", "Season", "MusicAlbum", "BoxSet"].includes(a.source.Type)) - Number(["Series", "Season", "MusicAlbum", "BoxSet"].includes(b.source.Type)));
  const id = randomBytes(24).toString("hex");
  plans.set(id, { owner, expires: Date.now() + 30 * 60_000, source, destination, pairs, processed: 0, transferred: 0, failed: 0, issues: [], unmatched, ambiguous, running: false });
  const expiry = setInterval(() => {
    const plan = plans.get(id);
    if (!plan || (!plan.running && plan.expires < Date.now())) { plans.delete(id); clearInterval(expiry); }
  }, 60_000);
  expiry.unref();
  return { id, sourceName: source.name, destinationName: destination.name, sourceItems: sourceItems.length, matched: used.size, changes: pairs.length, unmatched, ambiguous, samples: pairs.slice(0, 12).map((pair) => ({ name: pair.source.Name, type: pair.source.Type, ...pair.data })) };
}
export async function runTransfer(owner: string, id: string) {
  const plan = plans.get(id);
  if (!plan || plan.owner !== owner || plan.expires < Date.now()) throw new Error("Transfer preview expired. Preview again.");
  if (plan.running) throw new Error("A transfer batch is already running");
  plan.running = true;
  try {
    // Keep each request to one write/read pair instead of up to ten slow API calls.
    const batch = plan.pairs.slice(plan.processed, plan.processed + 1);
    for (const pair of batch) {
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
      } catch (error) {
        plan.failed++;
        if (plan.issues.length < 20) plan.issues.push(`${pair.source.Name}: ${error instanceof Error ? error.message : "Transfer failed"}`);
      }
      plan.processed++;
    }
    plan.expires = Date.now() + 30 * 60_000;
    const result = { processed: plan.processed, total: plan.pairs.length, transferred: plan.transferred, failed: plan.failed, issues: plan.issues, done: plan.processed === plan.pairs.length };
    if (result.done) plans.delete(id);
    return result;
  } finally { plan.running = false; }
}
export function discardTransfer(owner: string, id: string) {
  const plan = plans.get(id);
  if (plan?.owner === owner && !plan.running) plans.delete(id);
}
