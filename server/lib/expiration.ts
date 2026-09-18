import { randomUUID } from "node:crypto";
import { listUsers, setPolicy } from "./media-server";
import { expirationKey, getExpiration, readData, updateData } from "./store";
import type { ServerId } from "./types";

const running = new Set<ServerId>();

export async function enforceExpirations(serverId: ServerId, token: string) {
  if (running.has(serverId)) return;
  running.add(serverId);
  try {
    const [data, users] = await Promise.all([readData(), listUsers(serverId, token)]);
    const now = Date.now();
    for (const user of users) {
      const record = getExpiration(data, serverId, user.Id);
      if (!record?.expiresAt) continue;
      const expired = new Date(record.expiresAt).getTime() <= now;
      if (expired && !user.Policy?.IsDisabled) {
        await setPolicy(serverId, token, user.Id, { ...user.Policy, IsDisabled: true });
        await updateData((next) => {
          next.expirations[expirationKey(serverId, user.Id)] = { ...record, disabledByHarborGate: true };
          if (serverId === "emby") delete next.expirations[user.Id];
          next.events.unshift({ id: randomUUID(), serverId, userId: user.Id, userName: user.Name, occurredAt: new Date().toISOString(), action: "expired" });
        });
      }
    }
  } finally {
    running.delete(serverId);
  }
}
