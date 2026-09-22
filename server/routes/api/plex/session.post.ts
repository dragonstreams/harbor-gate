import { defineHandler } from "nitro";
import { createError, readBody } from "nitro/h3";
import { completePlexPin } from "../../../lib/plex";
import { createSession } from "../../../lib/session";

export default defineHandler(async (event) => {
  const body = await readBody<{ pinId?: number; state?: string }>(event);
  if (!Number.isInteger(body?.pinId) || !body?.state || body.state.length > 100) {
    throw createError({ statusCode: 400, statusMessage: "Invalid Plex authorization request" });
  }
  try {
    const authorization = await completePlexPin(body.pinId!, body.state);
    if (!authorization) return { pending: true as const };
    const session = createSession(
      event,
      authorization.token,
      authorization.adminName,
      "plex",
      authorization.serverUrl,
      authorization.machineIdentifier,
    );
    return { pending: false as const, ...session };
  } catch (error) {
    throw createError({
      statusCode: 401,
      statusMessage: error instanceof Error ? error.message : "Unable to authorize Plex",
    });
  }
});
