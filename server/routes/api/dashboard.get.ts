import { defineHandler } from "nitro";
import { enforceExpirations } from "../../lib/expiration";
import { listUsers } from "../../lib/emby";
import { requireSession } from "../../lib/session";
import { readData } from "../../lib/store";

export default defineHandler(async (event) => {
  const session = requireSession(event);
  await enforceExpirations(session.token);
  const [users, data] = await Promise.all([listUsers(session.token), readData()]);
  return {
    adminName: session.adminName,
    csrf: session.csrf,
    users: users.map((user) => ({
      ...user,
      expiration: data.expirations[user.Id]?.expiresAt ?? null,
    })),
    events: data.events,
  };
});
