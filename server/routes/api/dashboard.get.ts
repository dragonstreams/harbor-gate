import { defineHandler } from "nitro";
import { enforceExpirations } from "../../lib/expiration";
import { listUsers, MEDIA_SERVERS } from "../../lib/media-server";
import { requireSession } from "../../lib/session";
import { getExpiration, readData } from "../../lib/store";

export default defineHandler(async (event) => {
  const session = requireSession(event);
  await enforceExpirations(session.serverId, session.token);
  const [users, data] = await Promise.all([listUsers(session.serverId, session.token), readData()]);
  const server = MEDIA_SERVERS[session.serverId];
  return {
    adminName: session.adminName,
    csrf: session.csrf,
    serverId: session.serverId,
    serverLabel: server.label,
    serverHostname: server.hostname,
    isMaster: process.env.HARBORGATE_MODE !== "child",
    users: users.map((user) => {
      const expiration = getExpiration(data, session.serverId, user.Id);
      return { ...user, expiration: expiration?.expiresAt ?? null, admin: expiration?.adminName ?? "" };
    }),
    events: data.events.filter((item) => (item.serverId ?? "emby") === session.serverId),
  };
});
