import { defineHandler } from "nitro";
import { removeSession, requireSession } from "../../lib/session";

export default defineHandler((event) => {
  requireSession(event, true);
  removeSession(event);
  return { ok: true };
});
