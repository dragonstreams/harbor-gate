import { randomUUID } from "node:crypto";
import { listUsers, setPolicy } from "./media-server";
import { listPlexLibraryIds, listPlexShares, revokePlexShare } from "./plex";
import { expirationKey, getExpiration, readData, updateData } from "./store";
import type { ServerId } from "./types";

const running = new Set<string>();

export async function enforceExpirations(serverId: ServerId, token: string, serverUrl?: string, machineIdentifier?: string) {
  const connectionKey = `${serverId}:${machineIdentifier ?? serverUrl ?? "default"}`;
  if (running.has(connectionKey)) return;
  running.add(connectionKey);
  try {
    if (serverId === "plex") {
      if (!serverUrl || !machineIdentifier) return;
      const [data, shares] = await Promise.all([readData(), listPlexShares(token, machineIdentifier)]);
      for (const share of shares) {
        const record = getExpiration(data, serverId, share.invitedId, machineIdentifier);
        if (!record?.expiresAt || new Date(record.expiresAt).getTime() > Date.now()) continue;
        const librarySectionIds = share.librarySectionIds.length
          ? share.librarySectionIds
          : await listPlexLibraryIds(token, serverUrl);
        if (!librarySectionIds.length) continue;
        await revokePlexShare(token, machineIdentifier, share.id);
        await updateData((next) => {
          next.expirations[expirationKey(serverId, share.invitedId, machineIdentifier)] = { ...record, disabledByHarborGate: true };
          next.plexShares[`${machineIdentifier}:${share.invitedId}`] = {
            machineIdentifier,
            invitedId: share.invitedId,
            name: share.name,
            email: share.email,
            librarySectionIds,
            enabled: false,
          };
          next.events.unshift({ id: randomUUID(), serverId, serverScope: machineIdentifier, userId: share.invitedId, userName: share.name, occurredAt: new Date().toISOString(), action: "expired" });
        });
      }
      return;
    }

    const [data, users] = await Promise.all([readData(), listUsers(serverId, token, serverUrl)]);
    const now = Date.now();
    for (const user of users) {
      const record = getExpiration(data, serverId, user.Id);
      if (!record?.expiresAt) continue;
      const expired = new Date(record.expiresAt).getTime() <= now;
      if (expired && !user.Policy?.IsDisabled) {
        await setPolicy(serverId, token, user.Id, { ...user.Policy, IsDisabled: true }, serverUrl);
        await updateData((next) => {
          next.expirations[expirationKey(serverId, user.Id)] = { ...record, disabledByHarborGate: true };
          if (serverId === "emby") delete next.expirations[user.Id];
          next.events.unshift({ id: randomUUID(), serverId, userId: user.Id, userName: user.Name, occurredAt: new Date().toISOString(), action: "expired" });
        });
      }
    }
  } finally {
    running.delete(connectionKey);
  }
}
