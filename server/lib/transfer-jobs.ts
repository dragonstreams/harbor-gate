import { randomBytes } from "node:crypto";
import { discardTransfer, prepareTransfer, runTransfer } from "./history-transfer";

type Preview = Awaited<ReturnType<typeof prepareTransfer>>;
type Result = Awaited<ReturnType<typeof runTransfer>>;
type Status = "previewing" | "ready" | "transferring" | "completed" | "failed" | "cancelled";
type Job = {
  id: string;
  owner: string;
  status: Status;
  message: string;
  expires: number;
  busy: boolean;
  preview?: Preview;
  result?: Result;
  error?: string;
};
const jobs = new Map<string, Job>();
const lifetime = 30 * 60_000;

function snapshot(job: Job) {
  return { id: job.id, status: job.status, message: job.message, preview: job.preview, result: job.result, error: job.error };
}
function remove(job: Job) {
  if (job.preview) discardTransfer(job.owner, job.preview.id);
  jobs.delete(job.id);
}
function getJob(owner: string, id: string) {
  const job = jobs.get(id);
  if (!job || job.owner !== owner || (!job.busy && job.expires < Date.now())) {
    throw new Error("Transfer job expired or HarborGate restarted. Create a new preview.");
  }
  job.expires = Date.now() + lifetime;
  return job;
}
function fail(job: Job, error: unknown) {
  if (job.status === "cancelled") return;
  job.status = "failed";
  job.error = error instanceof Error ? error.message : "Transfer job failed";
  job.message = "Transfer stopped";
}

export function startTransferPreview(owner: string, source: unknown, destination: unknown) {
  const existing = [...jobs.values()].find((job) => job.owner === owner && job.busy);
  if (existing) {
    if (existing.status === "cancelled") throw new Error("Your previous transfer is still stopping. Wait a moment before starting another preview.");
    // Recover the job if the gateway lost the initial acceptance response.
    return snapshot(existing);
  }
  for (const job of jobs.values()) {
    if (!job.busy && (job.expires < Date.now() || job.owner === owner)) remove(job);
  }
  if (jobs.size >= 20) throw new Error("Transfer capacity reached. Try again later.");
  const job: Job = { id: randomBytes(24).toString("hex"), owner, status: "previewing", message: "Connecting to source server…", expires: Date.now() + lifetime, busy: true };
  jobs.set(job.id, job);
  const timer = setTimeout(() => {
    void (async () => {
      try {
        const preview = await prepareTransfer(owner, source, destination, (message) => {
          if (job.status === "cancelled") throw new Error("Preview cancelled");
          job.message = message;
        });
        if (job.status === "cancelled") {
          discardTransfer(owner, preview.id);
          return;
        }
        job.preview = preview;
        job.status = "ready";
        job.message = "Preview ready. No destination data has been changed.";
      } catch (error) { fail(job, error); }
      finally { job.busy = false; job.expires = Date.now() + lifetime; }
    })();
  }, 0);
  timer.unref();
  return snapshot(job);
}

export function transferJobStatus(owner: string, id: string) {
  return snapshot(getJob(owner, id));
}

export function startTransferJob(owner: string, id: string) {
  const job = getJob(owner, id);
  // Retrying a start after a lost response must not launch duplicate writes.
  if (job.status === "transferring" || job.status === "completed") return snapshot(job);
  if (job.status !== "ready" || !job.preview) throw new Error("Create a successful preview before starting the transfer.");
  job.status = "transferring";
  job.message = "Saving and verifying destination data…";
  job.busy = true;
  const previewId = job.preview.id;
  const timer = setTimeout(() => {
    void (async () => {
      try {
        while (job.status === "transferring") {
          job.result = await runTransfer(owner, previewId);
          job.expires = Date.now() + lifetime;
          if (job.status !== "transferring") break;
          job.message = `${job.result.processed} / ${job.result.total} items processed`;
          if (job.result.done) {
            job.status = "completed";
            job.message = job.result.failed ? "Transfer finished with item failures. Review the results below." : "Transfer completed and verified.";
          }
          // Allow short status requests to be served between items.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      } catch (error) { fail(job, error); }
      finally {
        discardTransfer(owner, previewId);
        job.busy = false;
        job.expires = Date.now() + lifetime;
      }
    })();
  }, 0);
  timer.unref();
  return snapshot(job);
}

export function cancelTransferJob(owner: string, id: string) {
  const existing = jobs.get(id);
  if (!existing) return { id, status: "cancelled", message: "Transfer no longer active" };
  if (existing.owner !== owner) throw new Error("Transfer job not found");
  existing.expires = Date.now() + lifetime;
  existing.status = "cancelled";
  existing.message = "Cancelled. Any item already being saved may finish; completed changes are not rolled back.";
  if (existing.preview) discardTransfer(owner, existing.preview.id);
  return snapshot(existing);
}

const cleanup = setInterval(() => {
  for (const job of jobs.values()) if (!job.busy && job.expires < Date.now()) remove(job);
}, 60_000);
cleanup.unref();
