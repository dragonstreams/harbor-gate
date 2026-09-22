import { defineHandler } from "nitro";
import { createError, readBody } from "nitro/h3";
import { validatePublicServerUrl } from "../../../lib/instance-security";
import { createPlexPin } from "../../../lib/plex";

export default defineHandler(async (event) => {
  const body = await readBody<{ serverUrl?: string }>(event);
  if (!body?.serverUrl?.trim()) {
    throw createError({ statusCode: 400, statusMessage: "Enter the Plex server address" });
  }
  try {
    const serverUrl = await validatePublicServerUrl(body.serverUrl);
    return await createPlexPin(serverUrl);
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : "Unable to start Plex authorization",
    });
  }
});
