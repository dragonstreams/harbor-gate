import type { EmbyPolicy, EmbyUser } from "./types";

const EMBY_URL = "https://33923.brr.savethecdn.com";
const clientHeader = 'MediaBrowser Client="HarborGate", Device="Secure Control Panel", DeviceId="harborgate-server", Version="1.0.0"';

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    const safeDetail = response.status === 401 ? "Invalid administrator credentials" : detail.slice(0, 180);
    throw new Error(safeDetail || `Emby request failed (${response.status})`);
  }
  if (response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
  return response.json() as Promise<T>;
}

export async function authenticate(username: string, password: string) {
  const response = await fetch(`${EMBY_URL}/Users/AuthenticateByName`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Emby-Authorization": clientHeader },
    body: JSON.stringify({ Username: username, Pw: password }),
  });
  const result = await parseResponse<{ AccessToken: string; User: EmbyUser }>(response);
  if (!result.User.Policy?.IsAdministrator) throw new Error("This Emby account is not an administrator");
  return result;
}

async function embyFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${EMBY_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Emby-Token": token,
      "X-Emby-Authorization": clientHeader,
      ...init?.headers,
    },
  });
  return parseResponse<T>(response);
}

export const listUsers = (token: string) => embyFetch<EmbyUser[]>(token, "/Users");

export const listFeatures = (token: string) =>
  embyFetch<{ Id: string; Name: string; FeatureType?: string }[]>(token, "/Features");

export async function createUser(token: string, name: string) {
  return embyFetch<EmbyUser>(token, `/Users/New?Name=${encodeURIComponent(name)}`, { method: "POST" });
}

export async function setUserPassword(token: string, userId: string, password: string) {
  return embyFetch<void>(token, `/Users/${encodeURIComponent(userId)}/Password`, {
    method: "POST",
    body: JSON.stringify({ NewPw: password, ResetPassword: false }),
  });
}

export async function updateUser(token: string, user: EmbyUser, name: string, policy: EmbyPolicy) {
  if (name !== user.Name) {
    await embyFetch<void>(token, `/Users/${encodeURIComponent(user.Id)}`, {
      method: "POST",
      body: JSON.stringify({ ...user, Name: name }),
    });
  }
  await setPolicy(token, user.Id, policy);
}

export const setPolicy = (token: string, userId: string, policy: EmbyPolicy) =>
  embyFetch<void>(token, `/Users/${encodeURIComponent(userId)}/Policy`, {
    method: "POST",
    body: JSON.stringify(policy),
  });

export const deleteUser = (token: string, userId: string) =>
  embyFetch<void>(token, `/Users/${encodeURIComponent(userId)}`, { method: "DELETE" });
