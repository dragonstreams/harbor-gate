export type UserPolicy = {
  IsAdministrator?: boolean;
  IsDisabled?: boolean;
  EnableAllDevices?: boolean;
  EnableAllChannels?: boolean;
  EnableAllFolders?: boolean;
  EnableContentDeletion?: boolean;
  EnableContentDownloading?: boolean;
  EnableSyncTranscoding?: boolean;
  EnablePublicSharing?: boolean;
  EnableRemoteControlOfOtherUsers?: boolean;
  EnableLiveTvManagement?: boolean;
  SimultaneousStreamLimit?: number;
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
};

export type ExpirationEvent = {
  id: string;
  userId: string;
  userName: string;
  occurredAt: string;
  action: "expired" | "reactivated";
};

export type DashboardData = {
  adminName: string;
  csrf: string;
  users: EmbyUser[];
  events: ExpirationEvent[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { statusMessage?: string; message?: string } | null;
    throw new Error(error?.statusMessage || error?.message || "Something went wrong");
  }
  return response.json() as Promise<T>;
}

export const getDashboard = () => request<DashboardData>("/api/dashboard");

export const signIn = (username: string, password: string) => request<{ adminName: string; csrf: string }>("/api/session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, password }),
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
