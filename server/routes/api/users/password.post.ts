import { defineHandler } from "nitro";
import { createError, readBody, setResponseHeader } from "nitro/h3";
import { getUser, setUserPassword } from "../../../lib/media-server";
import { decryptProfilePassword, encryptProfilePassword, profilePasswordKey } from "../../../lib/profile-passwords";
import { requireSession } from "../../../lib/session";
import { readData, updateData } from "../../../lib/store";

export default defineHandler(async (event) => {
  setResponseHeader(event, "Cache-Control", "no-store, private, max-age=0");
  const session = requireSession(event, true);
  if (session.serverId === "plex") throw createError({ statusCode: 400, statusMessage: "Plex passwords are managed by Plex" });
  const body = await readBody<{ id?: string; operation?: string; password?: string }>(event);
  if (!body || typeof body.id !== "string" || !body.id || body.id.length > 80 || !["reveal", "reset"].includes(body.operation ?? "")) {
    throw createError({ statusCode: 400, statusMessage: "Invalid password request" });
  }
  const user = await getUser(session.serverId, session.token, body.id, session.serverUrl);
  if (!user || user.Id !== body.id) throw createError({ statusCode: 404, statusMessage: "Profile not found" });
  if (user.Policy?.IsAdministrator) throw createError({ statusCode: 403, statusMessage: "Administrator passwords cannot be managed here" });
  const scope = profilePasswordKey(session.serverId, session.serverUrl, user.Id);
  if (body.operation === "reset") {
    if (typeof body.password !== "string" || body.password.length < 4 || body.password.length > 200) {
      throw createError({ statusCode: 400, statusMessage: "Password must be between 4 and 200 characters" });
    }
    const encrypted = await encryptProfilePassword(body.password, scope);
    await setUserPassword(session.serverId, session.token, user.Id, body.password, session.serverUrl);
    await updateData((data) => { data.profilePasswords[scope] = encrypted; });
    return { ok: true };
  }
  const secret = (await readData()).profilePasswords[scope];
  if (!secret || !user.HasPassword) throw createError({ statusCode: 404, statusMessage: "No saved password. Reset this profile’s password through HarborGate first." });
  return { password: await decryptProfilePassword(secret, scope) };
});
