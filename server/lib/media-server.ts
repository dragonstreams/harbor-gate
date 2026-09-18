import type { EmbyPolicy, EmbyUser, ServerId } from "./types";

export const MEDIA_SERVERS: Record<ServerId, { label: string; url: string; hostname: string }> = {
  emby: { label: "Emby", url: "https://33923.brr.savethecdn.com", hostname: "33923.brr.savethecdn.com" },
  jellyfin: { label: "Jellyfin", url: "https://36213.brr.savethecdn.com", hostname: "36213.brr.savethecdn.com" },
};

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
    const safeDetail = response.status === 401 ? "Invalid administrator credentials" : detail.slice(0, 180);
    throw new Error(safeDetail || `${MEDIA_SERVERS[serverId].label} request failed (${response.status})`);
  }
  if (response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
  return response.json() as Promise<T>;
}

async function mediaFetch<T>(serverId: ServerId, token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${MEDIA_SERVERS[serverId].url}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authenticationHeaders(serverId, token),
      ...init?.headers,
    },
  });
  return parseResponse<T>(serverId, response);
}

export async function authenticate(serverId: ServerId, username: string, password: string) {
  const response = await fetch(`${MEDIA_SERVERS[serverId].url}/Users/AuthenticateByName`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authenticationHeaders(serverId) },
    body: JSON.stringify({ Username: username, Pw: password }),
  });
  const result = await parseResponse<{ AccessToken: string; User: EmbyUser }>(serverId, response);
  if (!result.User.Policy?.IsAdministrator) throw new Error(`This ${MEDIA_SERVERS[serverId].label} account is not an administrator`);
  return result;
}

export const listUsers = (serverId: ServerId, token: string) => mediaFetch<EmbyUser[]>(serverId, token, "/Users");

export const listFeatures = (serverId: ServerId, token: string) =>
  mediaFetch<{ Id: string; Name: string; FeatureType?: string }[]>(serverId, token, "/Features");

export async function createUser(serverId: ServerId, token: string, name: string, password: string) {
  if (serverId === "jellyfin") {
    return mediaFetch<EmbyUser>(serverId, token, "/Users/New", {
      method: "POST",
      body: JSON.stringify({ Name: name, Password: password }),
    });
  }
  return mediaFetch<EmbyUser>(serverId, token, `/Users/New?Name=${encodeURIComponent(name)}`, { method: "POST" });
}

export async function setUserPassword(serverId: ServerId, token: string, userId: string, password: string) {
  return mediaFetch<void>(serverId, token, `/Users/${encodeURIComponent(userId)}/Password`, {
    method: "POST",
    body: JSON.stringify(serverId === "jellyfin"
      ? { CurrentPw: "", NewPw: password }
      : { NewPw: password, ResetPassword: false }),
  });
}

export async function updateUser(serverId: ServerId, token: string, user: EmbyUser, name: string, policy: EmbyPolicy) {
  if (name !== user.Name) {
    await mediaFetch<void>(serverId, token, `/Users/${encodeURIComponent(user.Id)}`, {
      method: "POST",
      body: JSON.stringify({ ...user, Name: name }),
    });
  }
  await setPolicy(serverId, token, user.Id, policy);
}

export const setPolicy = (serverId: ServerId, token: string, userId: string, policy: EmbyPolicy) =>
  mediaFetch<void>(serverId, token, `/Users/${encodeURIComponent(userId)}/Policy`, {
    method: "POST",
    body: JSON.stringify(policy),
  });

export const deleteUser = (serverId: ServerId, token: string, userId: string) =>
  mediaFetch<void>(serverId, token, `/Users/${encodeURIComponent(userId)}`, { method: "DELETE" });
