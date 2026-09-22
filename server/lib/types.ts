export type ServerId = "emby" | "jellyfin" | "plex";

export type EmbyPolicy = {
  IsAdministrator?: boolean;
  IsDisabled?: boolean;
  EnableAllDevices?: boolean;
  EnableAllChannels?: boolean;
  EnableAllFolders?: boolean;
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
  [key: string]: unknown;
};

export type EmbyUser = {
  Id: string;
  Name: string;
  HasPassword?: boolean;
  LastLoginDate?: string;
  LastActivityDate?: string;
  Policy?: EmbyPolicy;
};

export type ExpirationRecord = {
  expiresAt: string | null;
  disabledByHarborGate: boolean;
  adminName?: string;
  notes?: string;
};

export type ExpirationEvent = {
  id: string;
  serverId?: ServerId;
  serverScope?: string;
  userId: string;
  userName: string;
  occurredAt: string;
  action: "expired" | "reactivated";
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
  encryptedCredentials: {
    iv: string;
    tag: string;
    ciphertext: string;
  };
};

export type PlexShareRecord = {
  machineIdentifier: string;
  invitedId: string;
  name: string;
  email: string;
  librarySectionIds: number[];
  enabled: boolean;
};

export type HarborData = {
  expirations: Record<string, ExpirationRecord>;
  events: ExpirationEvent[];
  instances: ManagedInstance[];
  plexShares: Record<string, PlexShareRecord>;
};
