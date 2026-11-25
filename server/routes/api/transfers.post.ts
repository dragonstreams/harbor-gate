import { defineHandler } from "nitro";
import { readBody, setResponseHeader, setResponseStatus } from "nitro/h3";
import { cancelTransferJob, startTransferJob, startTransferPreview, transferJobReport, transferJobStatus } from "../../lib/transfer-jobs";
import { requireSession } from "../../lib/session";

export default defineHandler(async (event) => {
  setResponseHeader(event, "Cache-Control", "no-store, private");
  setResponseHeader(event, "Content-Type", "application/json; charset=utf-8");
  try {
    const session = requireSession(event, true);
    const body = await readBody<{ operation?: string; source?: unknown; destination?: unknown; id?: string; group?: string; page?: number }>(event);
    if (body?.operation === "preview") {
      const job = startTransferPreview(session.csrf, body.source, body.destination);
      setResponseStatus(event, 202);
      return job;
    }
    if (typeof body?.id === "string" && /^[a-f0-9]{48}$/.test(body.id)) {
      if (body.operation === "status") return transferJobStatus(session.csrf, body.id);
      if (body.operation === "report") return transferJobReport(session.csrf, body.id, body.group, body.page);
      if (body.operation === "run") return startTransferJob(session.csrf, body.id);
      if (body.operation === "discard") return cancelTransferJob(session.csrf, body.id);
    }
    throw new Error("Invalid transfer request");
  } catch (error) {
    const failure = error as { statusCode?: number; statusMessage?: string } | null;
    const statusCode = [400, 401, 403].includes(failure?.statusCode ?? 0) ? failure!.statusCode! : 400;
    setResponseStatus(event, statusCode);
    return { statusCode, statusMessage: failure?.statusMessage || (error instanceof Error ? error.message : "Unable to transfer user data") };
  }
});
