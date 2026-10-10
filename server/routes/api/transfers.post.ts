import { defineHandler } from "nitro";
import { createError, readBody, setResponseHeader } from "nitro/h3";
import { discardTransfer, prepareTransfer, runTransfer } from "../../lib/history-transfer";
import { requireSession } from "../../lib/session";

export default defineHandler(async (event) => {
  const session = requireSession(event, true);
  setResponseHeader(event, "Cache-Control", "no-store, private");
  const body = await readBody<{ operation?: string; source?: unknown; destination?: unknown; id?: string }>(event);
  try {
    if (body?.operation === "preview") return await prepareTransfer(session.csrf, body.source, body.destination);
    if (typeof body?.id === "string" && /^[a-f0-9]{48}$/.test(body.id)) {
      if (body.operation === "run") return await runTransfer(session.csrf, body.id);
      if (body.operation === "discard") { discardTransfer(session.csrf, body.id); return { ok: true }; }
    }
    throw new Error("Invalid transfer request");
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : "Unable to transfer user data" });
  }
});
