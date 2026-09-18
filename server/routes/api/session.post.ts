import { defineHandler } from "nitro";
import { createError, readBody } from "nitro/h3";
import { authenticate } from "../../lib/media-server";
import { createSession } from "../../lib/session";
import type { ServerId } from "../../lib/types";

export default defineHandler(async (event) => {
  const body = await readBody<{ username?: string; password?: string; serverId?: ServerId }>(event);
  const username = body?.username?.trim();
  const serverId = body?.serverId;
  if (!username || !body?.password || username.length > 100 || body.password.length > 300 || !serverId || !["emby", "jellyfin"].includes(serverId)) {
    throw createError({ statusCode: 400, statusMessage: "Enter valid administrator credentials and choose a server" });
  }
  try {
    const auth = await authenticate(serverId, username, body.password);
    return createSession(event, auth.AccessToken, auth.User.Name, serverId);
  } catch (error) {
    throw createError({
      statusCode: 401,
      statusMessage: error instanceof Error ? error.message : "Unable to sign in to the media server",
    });
  }
});
