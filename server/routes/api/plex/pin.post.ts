import { defineHandler } from "nitro";
import { createError } from "nitro/h3";
import { createPlexPin } from "../../../lib/plex";

export default defineHandler(async () => {
  try {
    return await createPlexPin();
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: error instanceof Error ? error.message : "Unable to start Plex authorization",
    });
  }
});
