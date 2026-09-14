import { randomUUID } from "node:crypto";
import { listUsers, setPolicy } from "./emby";
import { readData, updateData } from "./store";

let running = false;

export async function enforceExpirations(token: string) {
  if (running) return;
  running = true;
  try {
    const [data, users] = await Promise.all([readData(), listUsers(token)]);
    const now = Date.now();
    for (const user of users) {
      const record = data.expirations[user.Id];
      if (!record?.expiresAt) continue;
      const expired = new Date(record.expiresAt).getTime() <= now;
      if (expired && !user.Policy?.IsDisabled) {
        await setPolicy(token, user.Id, { ...user.Policy, IsDisabled: true });
        await updateData((next) => {
          next.expirations[user.Id] = { ...record, disabledByHarborGate: true };
          next.events.unshift({ id: randomUUID(), userId: user.Id, userName: user.Name, occurredAt: new Date().toISOString(), action: "expired" });
        });
      }
    }
  } finally {
    running = false;
  }
}
