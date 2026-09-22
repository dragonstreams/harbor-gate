export type ServerId = "emby" | "jellyfin" | "plex";

export type UserPolicy = {
  IsAdministrator?: boolean;
  IsDisabled?: boolean;
  EnableAllDevices?: boolean;
  EnableAllChannels?: boolean;
  EnableAllFolders?: boolean;
  EnabledFolders?: string[];
  EnableContentDeletion?: boolean;
  EnableContentDownloading?: boolean;
  EnableSyncTranscoding?: boolean;
  EnablePublicSharing?: boolean;
  RestrictedFeatures?: string[];
  EnableRemoteControlOfOtherUsers?: boolean;
  EnableLiveTvAccess?: boolean;
  EnableLiveTvManagement?: boolean;
  SimultaneousStreamLimit?: number;
  MaxActiveSessions?: number;
};

export type EmbyUser = {
  Id: string;
  Name: string;
  HasPassword?: boolean;
  LastLoginDate?: string;
  LastActivityDate?: string;
  Policy?: UserPolicy;
  expiration: string | null;
  admin: string;
  notes: string;
};

export type ExpirationEvent = {
  id: string;
  userId: string;
  userName: string;
  occurredAt: string;
  action: "expired" | "reactivated";
};

export type PlexLibrary = {
  id: number;
  title: string;
  type: string;
};

export type MediaLibrary = {
  id: string;
  name: string;
  type: string;
};

export type DashboardData = {
  adminName: string;
  csrf: string;
  serverId: ServerId;
  serverLabel: string;
  serverHostname: string;
  isMaster: boolean;
  users: EmbyUser[];
  events: ExpirationEvent[];
  plexLibraries: PlexLibrary[];
  mediaLibraries: MediaLibrary[];
};

export type RuntimeConfig = {
  mode: "master" | "child";
  serverId: ServerId | null;
  serverLabel: string | null;
  serverHostname: string | null;
  serverUrl: string | null;
};

export type ManagedInstance = {
  id: string;
  name: string;
  slug: string;
  serverId: ServerId;
  serverUrl: string;
  bunnyAppId: string;
  publicUrl: string;
  bunnyHostname: string;
  createdAt: string;
  status: "active" | "failed";
};

export type InstancesData = {
  configuration: { ready: boolean; missing: string[] };
  instances: ManagedInstance[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string; statusMessage?: string; message?: string; data?: { message?: string } } | null;
    throw new Error(error?.error || error?.data?.message || error?.statusMessage || error?.message || "Something went wrong");
  }
  return response.json() as Promise<T>;
}

export const getRuntimeConfig = () => request<RuntimeConfig>("/api/config");

export const getDashboard = () => request<DashboardData>("/api/dashboard");

export const getInstances = () => request<InstancesData>("/api/instances");

export const deployInstance = (csrf: string, body: { name: string; serverId: ServerId; serverUrl: string; username: string; password: string }) =>
  request<{ instance: ManagedInstance }>("/api/instances", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-HarborGate-CSRF": csrf },
    body: JSON.stringify(body),
  });

export const signIn = (serverId: ServerId, serverUrl: string, username: string, password: string) => request<{ adminName: string; csrf: string; serverId: ServerId }>("/api/session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ serverId, serverUrl, username, password }),
});

export type PlexServerOption = { machineIdentifier: string; name: string };
export type PlexAuthorization = { pinId: number; state: string; servers: PlexServerOption[] };

export const createPlexPin = () => request<{ pinId: number; state: string; authUrl: string }>("/api/plex/pin", {
  method: "POST",
});

export const completePlexSignIn = (pinId: number, state: string, machineIdentifier?: string) => request<{ pending: boolean; servers: PlexServerOption[]; adminName?: string; csrf?: string; serverId?: ServerId }>("/api/plex/session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ pinId, state, machineIdentifier }),
});

export const mutateUser = (csrf: string, body: object) => request<{ ok: boolean }>("/api/users", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-HarborGate-CSRF": csrf },
  body: JSON.stringify(body),
});

export const signOut = (csrf: string) => request<{ ok: boolean }>("/api/session", {
  method: "DELETE",
  headers: { "X-HarborGate-CSRF": csrf },
});
