import { defineHandler } from "nitro";
import { createError, readBody } from "nitro/h3";
import { validatePublicServerUrl } from "../../lib/instance-security";
import { authenticateAt, CONFIGURED_CHILD_SERVER, MEDIA_SERVERS, normalizeMediaServerUrl } from "../../lib/media-server";
import { createSession } from "../../lib/session";
import type { ServerId } from "../../lib/types";

export default defineHandler(async (event) => {
  const body = await readBody<{ username?: string; password?: string; serverId?: ServerId; serverUrl?: string }>(event);
  const username = body?.username?.trim();
  const serverId = body?.serverId;
  if (!username || !body?.password || username.length > 100 || body.password.length > 300 || !serverId || !["emby", "jellyfin"].includes(serverId)) {
    throw createError({ statusCode: 400, statusMessage: serverId === "plex" ? "Use Sign in with Plex to continue" : "Enter valid administrator credentials and choose a server" });
  }
  const isChild = process.env.HARBORGATE_MODE === "child";
  if (CONFIGURED_CHILD_SERVER && serverId !== CONFIGURED_CHILD_SERVER) {
    throw createError({ statusCode: 400, statusMessage: "This HarborGate instance is not configured for that server type" });
  }
  if (isChild && !body.serverUrl?.trim()) {
    throw createError({ statusCode: 400, statusMessage: "Enter the media server address" });
  }
  try {
    const serverUrl = isChild
      ? normalizeMediaServerUrl(serverId, await validatePublicServerUrl(body.serverUrl!))
      : MEDIA_SERVERS[serverId].url;
    const auth = await authenticateAt(serverId, serverUrl, username, body.password);
    return createSession(event, auth.AccessToken, auth.User.Name, serverId, serverUrl);
  } catch (error) {
    throw createError({
      statusCode: 401,
      statusMessage: error instanceof Error ? error.message : "Unable to sign in to the media server",
    });
  }
});
