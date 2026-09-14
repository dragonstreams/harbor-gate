import { defineHandler } from "nitro";
import { createError, readBody } from "nitro/h3";
import { authenticate } from "../../lib/emby";
import { createSession } from "../../lib/session";

export default defineHandler(async (event) => {
  const body = await readBody<{ username?: string; password?: string }>(event);
  const username = body?.username?.trim();
  if (!username || !body?.password || username.length > 100 || body.password.length > 300) {
    throw createError({ statusCode: 400, statusMessage: "Enter valid Emby administrator credentials" });
  }
  try {
    const auth = await authenticate(username, body.password);
    return createSession(event, auth.AccessToken, auth.User.Name);
  } catch (error) {
    throw createError({
      statusCode: 401,
      statusMessage: error instanceof Error ? error.message : "Unable to sign in to Emby",
    });
  }
});
