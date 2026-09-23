import type { EmbyPolicy, EmbyUser, ServerId } from "./types";

export function normalizeMediaServerUrl(serverId: ServerId, value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (serverId !== "emby") return trimmed;
  const url = new URL(trimmed);
  if (!url.pathname.toLowerCase().endsWith("/emby")) {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/emby`;
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

const childServerType = process.env.HARBORGATE_MODE === "child" ? process.env.HARBORGATE_SERVER_TYPE as ServerId | undefined : undefined;
const configuredChildServerUrl = process.env.HARBORGATE_SERVER_URL?.trim();
const childServerUrl = childServerType && configuredChildServerUrl ? normalizeMediaServerUrl(childServerType, configuredChildServerUrl) : undefined;

export const MEDIA_SERVERS: Record<ServerId, { label: string; url: string; hostname: string }> = {
  emby: { label: "Emby", url: normalizeMediaServerUrl("emby", "https://33923.brr.savethecdn.com"), hostname: "33923.brr.savethecdn.com" },
  jellyfin: { label: "Jellyfin", url: "https://36213.brr.savethecdn.com", hostname: "36213.brr.savethecdn.com" },
  plex: { label: "Plex", url: childServerUrl || "https://app.plex.tv", hostname: childServerUrl ? new URL(childServerUrl).host : "app.plex.tv" },
};

if (childServerType && childServerUrl && ["emby", "jellyfin", "plex"].includes(childServerType)) {
  MEDIA_SERVERS[childServerType] = {
    ...MEDIA_SERVERS[childServerType],
    url: childServerUrl,
    hostname: new URL(childServerUrl).host,
  };
}

export const CONFIGURED_CHILD_SERVER = childServerType && ["emby", "jellyfin", "plex"].includes(childServerType) ? childServerType : null;

function clientHeader(serverId: ServerId) {
  return `MediaBrowser Client="HarborGate", Device="Secure Control Panel", DeviceId="harborgate-${serverId}", Version="1.0.0"`;
}

function authenticationHeaders(serverId: ServerId, token?: string): Record<string, string> {
  if (serverId === "jellyfin") {
    return { Authorization: `${clientHeader(serverId)}${token ? `, Token="${token}"` : ""}` };
  }
  return {
    "X-Emby-Authorization": clientHeader(serverId),
    ...(token ? { "X-Emby-Token": token } : {}),
  };
}

async function parseResponse<T>(serverId: ServerId, response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    const safeDetail = response.status === 401
      ? "Invalid administrator credentials"
      : detail.trim().toLowerCase() === "true"
        ? `${MEDIA_SERVERS[serverId].label} returned an invalid proxy response. Verify the server address and API path.`
        : detail.slice(0, 180);
    throw new Error(safeDetail || `${MEDIA_SERVERS[serverId].label} request failed (${response.status})`);
  }
  if (response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
  return response.json() as Promise<T>;
}

async function mediaFetch<T>(serverId: ServerId, token: string, path: string, init?: RequestInit, serverUrl = MEDIA_SERVERS[serverId].url): Promise<T> {
  const response = await fetch(`${serverUrl}${path}`, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "Content-Type": "application/json",
      ...authenticationHeaders(serverId, token),
      ...init?.headers,
    },
  });
  return parseResponse<T>(serverId, response);
}

export async function authenticateAt(serverId: ServerId, serverUrl: string, username: string, password: string) {
  const response = await fetch(`${serverUrl}/Users/AuthenticateByName`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", ...authenticationHeaders(serverId) },
    body: JSON.stringify({ Username: username, Pw: password }),
  });
  const result = await parseResponse<unknown>(serverId, response);
  if (!result || typeof result !== "object" || !("AccessToken" in result) || typeof result.AccessToken !== "string" ||
      !("User" in result) || !result.User || typeof result.User !== "object") {
    throw new Error(`${MEDIA_SERVERS[serverId].label} returned an unexpected authentication response. Verify that the server address points directly to the media server.`);
  }
  const authenticated = result as { AccessToken: string; User: EmbyUser };
  if (!authenticated.User.Policy?.IsAdministrator) throw new Error(`This ${MEDIA_SERVERS[serverId].label} account is not an administrator`);
  return authenticated;
}

export function authenticate(serverId: ServerId, username: string, password: string) {
  return authenticateAt(serverId, MEDIA_SERVERS[serverId].url, username, password);
}

export async function listUsers(serverId: ServerId, token: string, serverUrl?: string) {
  if (serverId === "emby") {
    const result = await mediaFetch<{ Items: EmbyUser[] }>(serverId, token, "/Users/Query", undefined, serverUrl);
    return result.Items;
  }
  return mediaFetch<EmbyUser[]>(serverId, token, "/Users", undefined, serverUrl);
}

export async function listLibraries(serverId: ServerId, token: string, serverUrl?: string) {
  const folders = await mediaFetch<{ ItemId?: string; Id?: string; Name?: string; CollectionType?: string }[]>(serverId, token, "/Library/VirtualFolders", undefined, serverUrl);
  return folders
    .filter((folder) => Boolean((folder.ItemId || folder.Id) && folder.Name))
    .map((folder) => ({ id: folder.ItemId || folder.Id!, name: folder.Name!, type: folder.CollectionType ?? "mixed" }));
}

export const listFeatures = (serverId: ServerId, token: string, serverUrl?: string) =>
  mediaFetch<{ Id: string; Name: string; FeatureType?: string }[]>(serverId, token, "/Features", undefined, serverUrl);

export async function createUser(serverId: ServerId, token: string, name: string, password: string, serverUrl?: string) {
  const result = await mediaFetch<unknown>(serverId, token, "/Users/New", {
    method: "POST",
    body: JSON.stringify(serverId === "jellyfin" ? { Name: name, Password: password } : { Name: name }),
  }, serverUrl);
  if (!result || typeof result !== "object" || !("Id" in result) || typeof result.Id !== "string" || !result.Id) {
    throw new Error(`${MEDIA_SERVERS[serverId].label} did not return the newly created user profile. Verify that the server address points directly to the media server API.`);
  }
  return result as EmbyUser;
}

export async function setUserPassword(serverId: ServerId, token: string, userId: string, password: string, serverUrl?: string) {
  return mediaFetch<void>(serverId, token, `/Users/${encodeURIComponent(userId)}/Password`, {
    method: "POST",
    body: JSON.stringify(serverId === "jellyfin"
      ? { CurrentPw: "", NewPw: password }
      : { CurrentPw: "", NewPw: password, ResetPassword: false }),
  }, serverUrl);
}

export async function updateUser(serverId: ServerId, token: string, user: EmbyUser, name: string, policy: EmbyPolicy, serverUrl?: string) {
  if (name !== user.Name) {
    await mediaFetch<void>(serverId, token, `/Users/${encodeURIComponent(user.Id)}`, {
      method: "POST",
      body: JSON.stringify({ ...user, Name: name }),
    }, serverUrl);
  }
  await setPolicy(serverId, token, user.Id, policy, serverUrl);
}

export const setPolicy = (serverId: ServerId, token: string, userId: string, policy: EmbyPolicy, serverUrl?: string) =>
  mediaFetch<void>(serverId, token, `/Users/${encodeURIComponent(userId)}/Policy`, {
    method: "POST",
    body: JSON.stringify(policy),
  }, serverUrl);

export const deleteUser = (serverId: ServerId, token: string, userId: string, serverUrl?: string) =>
  mediaFetch<void>(serverId, token, `/Users/${encodeURIComponent(userId)}`, { method: "DELETE" }, serverUrl);
