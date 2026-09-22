import { randomBytes } from "node:crypto";
import type { EmbyUser } from "./types";

const PLEX_TV = "https://plex.tv";
const CLIENT_ID = process.env.HARBORGATE_PLEX_CLIENT_ID?.trim() || "harborgate-control-panel";
const PRODUCT = "HarborGate";

type PendingPin = { serverUrl: string; state: string; expiresAt: number };
type PlexPin = { id: number; code: string; authToken?: string | null; expiresAt?: string };
type PlexAccount = {
  id?: number;
  username?: string;
  email?: string;
  subscription?: { active?: boolean; status?: string; plan?: string };
};
type PlexResource = { name?: string; provides?: string; owned?: boolean; clientIdentifier?: string };

export type PlexShare = {
  id: string;
  invitedId: string;
  name: string;
  email: string;
  librarySectionIds: number[];
};

const pendingPins = new Map<number, PendingPin>();

function headers(token?: string): Record<string, string> {
  return {
    Accept: "application/json",
    "X-Plex-Product": PRODUCT,
    "X-Plex-Version": "1.0.0",
    "X-Plex-Client-Identifier": CLIENT_ID,
    ...(token ? { "X-Plex-Token": token } : {}),
  };
}

async function plexResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = (await response.text()).replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, 180);
    throw new Error(detail || `Plex request failed (${response.status})`);
  }
  if (response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
  return response.json() as Promise<T>;
}

export async function createPlexPin(serverUrl: string) {
  const pin = await plexResponse<PlexPin>(await fetch(`${PLEX_TV}/api/v2/pins?strong=true`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: headers(),
  }));
  const state = randomBytes(24).toString("base64url");
  pendingPins.set(pin.id, { serverUrl, state, expiresAt: Date.now() + 5 * 60_000 });
  return {
    pinId: pin.id,
    state,
    authUrl: `https://app.plex.tv/auth#?clientID=${encodeURIComponent(CLIENT_ID)}&code=${encodeURIComponent(pin.code)}&context%5Bdevice%5D%5Bproduct%5D=${encodeURIComponent(PRODUCT)}`,
  };
}

async function serverMachineIdentifier(serverUrl: string, token: string) {
  const response = await fetch(`${serverUrl}/identity`, {
    signal: AbortSignal.timeout(15_000),
    headers: headers(token),
  });
  if (!response.ok) throw new Error(`Unable to verify the Plex server (${response.status})`);
  const text = await response.text();
  try {
    const data = JSON.parse(text) as { MediaContainer?: { machineIdentifier?: string }; machineIdentifier?: string };
    const identifier = data.MediaContainer?.machineIdentifier ?? data.machineIdentifier;
    if (identifier) return identifier;
  } catch {
    const identifier = text.match(/machineIdentifier=["']([^"']+)["']/i)?.[1];
    if (identifier) return identifier;
  }
  throw new Error("The server address did not return a valid Plex identity");
}

export async function completePlexPin(pinId: number, state: string) {
  const pending = pendingPins.get(pinId);
  if (!pending || pending.expiresAt < Date.now() || pending.state !== state) {
    if (pending?.expiresAt && pending.expiresAt < Date.now()) pendingPins.delete(pinId);
    throw new Error("Plex authorization expired. Please try again.");
  }
  const pin = await plexResponse<PlexPin>(await fetch(`${PLEX_TV}/api/v2/pins/${pinId}`, {
    signal: AbortSignal.timeout(15_000),
    headers: headers(),
  }));
  if (!pin.authToken) return null;
  pendingPins.delete(pinId);

  const account = await plexResponse<PlexAccount>(await fetch(`${PLEX_TV}/api/v2/user`, {
    signal: AbortSignal.timeout(15_000),
    headers: headers(pin.authToken),
  }));
  const subscription = account.subscription;
  const hasPlexPass = subscription?.active === true || subscription?.status?.toLowerCase() === "active" || subscription?.plan?.toLowerCase() === "lifetime";
  if (!hasPlexPass) throw new Error("An active Plex Pass owner account is required");

  const machineIdentifier = await serverMachineIdentifier(pending.serverUrl, pin.authToken);
  const resources = await plexResponse<PlexResource[]>(await fetch(`${PLEX_TV}/api/v2/resources?includeHttps=1&includeRelay=1`, {
    signal: AbortSignal.timeout(15_000),
    headers: headers(pin.authToken),
  }));
  const ownedServer = resources.find((resource) => resource.clientIdentifier === machineIdentifier && resource.owned === true && resource.provides?.split(",").includes("server"));
  if (!ownedServer) throw new Error("The authorized Plex account does not own this Plex server");

  return {
    token: pin.authToken,
    adminName: account.username || account.email || "Plex owner",
    serverUrl: pending.serverUrl,
    machineIdentifier,
  };
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function sectionIds(value: Record<string, unknown>) {
  const sections = arrayValue(value.Section ?? value.sections ?? value.librarySections);
  return sections.map((section) => {
    if (typeof section === "number") return section;
    if (typeof section === "string") return Number(section);
    if (section && typeof section === "object") {
      const item = section as Record<string, unknown>;
      return Number(item.id ?? item.key ?? item.sectionId);
    }
    return NaN;
  }).filter(Number.isFinite);
}

export async function listPlexShares(token: string, machineIdentifier: string): Promise<PlexShare[]> {
  const data = await plexResponse<Record<string, unknown>>(await fetch(`${PLEX_TV}/api/servers/${encodeURIComponent(machineIdentifier)}/shared_servers`, {
    signal: AbortSignal.timeout(15_000),
    headers: headers(token),
  }));
  const container = (data.MediaContainer ?? data) as Record<string, unknown>;
  return arrayValue(container.SharedServer ?? container.sharedServers ?? container).map((raw) => {
    const share = raw as Record<string, unknown>;
    return {
      id: String(share.id ?? share.shareId),
      invitedId: String(share.userID ?? share.userId ?? share.invitedId),
      name: String(share.username ?? share.title ?? share.email ?? "Plex user"),
      email: String(share.email ?? ""),
      librarySectionIds: sectionIds(share),
    };
  }).filter((share) => share.id !== "undefined" && share.invitedId !== "undefined");
}

export async function listPlexLibraryIds(token: string, serverUrl: string) {
  const response = await fetch(`${serverUrl}/library/sections`, {
    signal: AbortSignal.timeout(15_000),
    headers: headers(token),
  });
  if (!response.ok) throw new Error(`Unable to read Plex libraries (${response.status})`);
  const text = await response.text();
  try {
    const data = JSON.parse(text) as { MediaContainer?: { Directory?: Array<{ key?: string | number }> } };
    return (data.MediaContainer?.Directory ?? []).map((section) => Number(section.key)).filter(Number.isFinite);
  } catch {
    return [...text.matchAll(/<Directory\b[^>]*\bkey=["'](\d+)["']/gi)].map((match) => Number(match[1]));
  }
}

export async function revokePlexShare(token: string, machineIdentifier: string, shareId: string) {
  await plexResponse<void>(await fetch(`${PLEX_TV}/api/servers/${encodeURIComponent(machineIdentifier)}/shared_servers/${encodeURIComponent(shareId)}`, {
    method: "DELETE",
    signal: AbortSignal.timeout(15_000),
    headers: headers(token),
  }));
}

export async function restorePlexShare(token: string, machineIdentifier: string, invitedId: string, librarySectionIds: number[]) {
  if (!librarySectionIds.length) throw new Error("The previous Plex library permissions could not be restored safely");
  return plexResponse<Record<string, unknown>>(await fetch(`${PLEX_TV}/api/servers/${encodeURIComponent(machineIdentifier)}/shared_servers`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      server_id: machineIdentifier,
      shared_server: { invited_id: Number(invitedId), library_section_ids: librarySectionIds },
    }),
  }));
}

export function plexShareUser(share: PlexShare, disabled = false): EmbyUser {
  return {
    Id: share.invitedId,
    Name: share.name,
    HasPassword: true,
    Policy: { IsAdministrator: false, IsDisabled: disabled },
  };
}
