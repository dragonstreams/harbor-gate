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
  const response = await fetch(`${connection.url}${path}`, {
    method: body === undefined ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(connection.type === "emby" ? { "X-Emby-Authorization": auth, "X-Emby-Token": connection.token } : { Authorization: `${auth}, Token="${connection.token}"` }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`Media server request failed (${response.status})`);
  const text = await response.text();
  if (!text.trim()) return undefined as T;
  try { return JSON.parse(text) as T; } catch { throw new Error("Media server returned an invalid JSON response"); }
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

async function items(connection: Connection) {
  const result: Item[] = [];
  for (let start = 0; ; ) {
    const query = new URLSearchParams({ Recursive: "true", StartIndex: String(start), Limit: "500", Fields: "ProviderIds", EnableUserData: "true", EnableImages: "false", IncludeItemTypes: "Movie,Episode,Series,Season,Audio,MusicAlbum,MusicArtist,MusicVideo,Video,Book,BoxSet" });
    const page = await call<{ Items: Item[]; TotalRecordCount: number }>(connection, `/Users/${encodeURIComponent(connection.userId)}/Items?${query}`);
    if (!Array.isArray(page?.Items)) throw new Error("Server did not return a media library");
    result.push(...page.Items);
    start += page.Items.length;
    if (!page.Items.length || start >= page.TotalRecordCount) break;
    if (start > 100_000) throw new Error("Library exceeds the 100,000-item transfer limit");
  }
  return result;
}

function keys(item: Item) {
  const ids = Object.entries(item.ProviderIds ?? {}).filter(([key, value]) => value && ["imdb", "tmdb", "tvdb", "musicbrainztrack", "musicbrainzalbum", "musicbrainzartist"].includes(key.toLowerCase()));
  if (ids.length) return ids.map(([key, value]) => `${item.Type}:${key.toLowerCase()}:${value.toLowerCase()}`);
  const name = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  if (item.Type === "Episode" && item.SeriesName && item.ParentIndexNumber !== undefined && item.IndexNumber !== undefined) return [`episode:${name(item.SeriesName)}:${item.ParentIndexNumber}:${item.IndexNumber}`];
  if (item.Type === "Movie" && item.ProductionYear) return [`movie:${name(item.Name)}:${item.ProductionYear}`];
  return [];
}
function userData(item: Item): UserData {
  const data = item.UserData!;
  return { Played: Boolean(data.Played), IsFavorite: Boolean(data.IsFavorite), PlayCount: data.PlayCount ?? 0, PlaybackPositionTicks: data.PlaybackPositionTicks ?? 0, LastPlayedDate: data.LastPlayedDate ?? null };
}
export async function prepareTransfer(owner: string, sourceInput: unknown, destinationInput: unknown) {
  for (const [id, plan] of plans) if (plan.expires < Date.now() || (plan.owner === owner && !plan.running)) plans.delete(id);
  if (plans.size >= 20) throw new Error("Transfer capacity reached. Try again later.");
  const source = await connect(sourceInput);
  const destination = await connect(destinationInput);
  if (source.url === destination.url && source.userId === destination.userId) throw new Error("Source and destination must not be the same user on the same server");
  const [sourceItems, destinationItems] = await Promise.all([items(source), items(destination)]);
  const index = new Map<string, Item[]>();
  for (const item of destinationItems) for (const key of keys(item)) index.set(key, [...(index.get(key) ?? []), item]);
  const pairs: Pair[] = [];
  let unmatched = 0, ambiguous = 0;
  const used = new Set<string>();
  for (const sourceItem of sourceItems) {
    if (!sourceItem.UserData) { unmatched++; continue; }
    const matches = new Map<string, Item>();
    for (const key of keys(sourceItem)) for (const item of index.get(key) ?? []) matches.set(item.Id, item);
    if (!matches.size) { unmatched++; continue; }
    if (matches.size !== 1) { ambiguous++; continue; }
    const destinationItem = [...matches.values()][0];
    if (used.has(destinationItem.Id)) { ambiguous++; continue; }
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
    const batch = plan.pairs.slice(plan.processed, plan.processed + 5);
    for (const pair of batch) {
      try {
        const userId = encodeURIComponent(plan.destination.userId);
        const itemId = encodeURIComponent(pair.destination.Id);
        const path = plan.destination.type === "jellyfin" ? `/UserItems/${itemId}/UserData?userId=${userId}` : `/Users/${userId}/Items/${itemId}/UserData`;
        await call(plan.destination, path, pair.data);
        const saved = await call<Item>(plan.destination, `/Users/${userId}/Items/${itemId}`);
        const actual = saved.UserData;
        if (!actual || actual.Played !== pair.data.Played || actual.IsFavorite !== pair.data.IsFavorite || (actual.PlayCount ?? 0) !== pair.data.PlayCount || (actual.PlaybackPositionTicks ?? 0) !== pair.data.PlaybackPositionTicks || (actual.LastPlayedDate ? Date.parse(actual.LastPlayedDate) : null) !== (pair.data.LastPlayedDate ? Date.parse(pair.data.LastPlayedDate) : null)) throw new Error("Server did not preserve all requested user-data fields");
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
