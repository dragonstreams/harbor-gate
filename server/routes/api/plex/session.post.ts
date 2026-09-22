import { defineHandler } from "nitro";
import { createError, readBody } from "nitro/h3";
import { completePlexPin, selectPlexServer } from "../../../lib/plex";
import { createSession } from "../../../lib/session";

export default defineHandler(async (event) => {
  const body = await readBody<{ pinId?: number; state?: string; machineIdentifier?: string }>(event);
  if (!Number.isInteger(body?.pinId) || !body?.state || body.state.length > 100 || (body.machineIdentifier && body.machineIdentifier.length > 200)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid Plex authorization request" });
  }
  try {
    if (!body.machineIdentifier) {
      const servers = await completePlexPin(body.pinId!, body.state);
      return servers ? { pending: false as const, servers } : { pending: true as const, servers: [] };
    }
    const authorization = await selectPlexServer(body.pinId!, body.state, body.machineIdentifier);
    const session = createSession(
      event,
      authorization.token,
      authorization.adminName,
      "plex",
      authorization.serverUrl,
      authorization.machineIdentifier,
    );
    return { pending: false as const, servers: [], ...session };
  } catch (error) {
    throw createError({
      statusCode: 401,
      statusMessage: error instanceof Error ? error.message : "Unable to authorize Plex",
    });
  }
});
