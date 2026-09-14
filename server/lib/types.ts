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
};

export type ExpirationEvent = {
  id: string;
  userId: string;
  userName: string;
  occurredAt: string;
  action: "expired" | "reactivated";
};

export type HarborData = {
  expirations: Record<string, ExpirationRecord>;
  events: ExpirationEvent[];
};
