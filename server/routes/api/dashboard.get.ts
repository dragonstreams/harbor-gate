import { defineHandler } from "nitro";
import { enforceExpirations } from "../../lib/expiration";
import { listLibraries, listUsers, MEDIA_SERVERS } from "../../lib/media-server";
import { listPlexLibraries, listPlexShares, plexShareUser, type PlexLibrary } from "../../lib/plex";
import { requireSession } from "../../lib/session";
import { getExpiration, readData, updateData } from "../../lib/store";

export default defineHandler(async (event) => {
  const session = requireSession(event);
  let users;
  let data;
  let plexLibraries: PlexLibrary[] = [];
  let mediaLibraries: { id: string; name: string; type: string }[] = [];
  if (session.serverId === "plex") {
    if (!session.machineIdentifier) throw new Error("Plex server identity is missing from this session");
    await enforceExpirations(session.serverId, session.token, session.serverUrl, session.machineIdentifier);
    const [activeShares, libraries] = await Promise.all([
      listPlexShares(session.token, session.machineIdentifier),
      listPlexLibraries(session.token, session.serverUrl),
    ]);
    plexLibraries = libraries;
    data = await updateData((current) => {
      for (const share of activeShares) {
        current.plexShares[`${session.machineIdentifier}:${share.invitedId}`] = {
          machineIdentifier: session.machineIdentifier!,
          invitedId: share.invitedId,
          name: share.name,
          email: share.email,
          librarySectionIds: share.librarySectionIds,
          enabled: true,
        };
      }
    });
    const activeIds = new Set(activeShares.map((share) => share.invitedId));
    const disabledShares = Object.values(data.plexShares).filter((share) => share.machineIdentifier === session.machineIdentifier && !share.enabled && !activeIds.has(share.invitedId));
    users = [
      ...activeShares.map((share) => plexShareUser(share)),
      ...disabledShares.map((share) => plexShareUser({ id: share.invitedId, invitedId: share.invitedId, name: share.name, email: share.email, librarySectionIds: share.librarySectionIds }, true)),
    ];
  } else {
    await enforceExpirations(session.serverId, session.token, session.serverUrl);
    [users, mediaLibraries, data] = await Promise.all([
      listUsers(session.serverId, session.token, session.serverUrl),
      listLibraries(session.serverId, session.token, session.serverUrl),
      readData(),
    ]);
  }
  const server = MEDIA_SERVERS[session.serverId];
  return {
    adminName: session.adminName,
    csrf: session.csrf,
    serverId: session.serverId,
    serverLabel: server.label,
    serverHostname: new URL(session.serverUrl).host,
    isMaster: process.env.HARBORGATE_MODE !== "child",
    users: users.map((user) => {
      const expiration = getExpiration(data, session.serverId, user.Id, session.serverId === "plex" ? session.machineIdentifier : undefined);
      return { ...user, expiration: expiration?.expiresAt ?? null, admin: expiration?.adminName ?? "", notes: expiration?.notes ?? "" };
    }),
    events: data.events.filter((item) =>
      (item.serverId ?? "emby") === session.serverId &&
      (session.serverId !== "plex" || item.serverScope === session.machineIdentifier)),
    plexLibraries,
    mediaLibraries,
  };
});
