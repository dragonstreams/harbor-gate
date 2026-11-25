import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowRightLeft, CheckCircle2, Film, Heart, History, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

type Login = { type: "emby" | "jellyfin"; url: string; username: string; password: string };
type Preview = { id: string; sourceName: string; destinationName: string; sourceItems: number; matched: number; changes: number; unmatched: number; ambiguous: number; samples: { name: string; type: string; Played: boolean; IsFavorite: boolean }[] };
type Result = { processed: number; total: number; transferred: number; failed: number; issues: string[]; done: boolean };
type Job = { id: string; status: "previewing" | "ready" | "transferring" | "completed" | "failed" | "cancelled"; message: string; preview?: Preview; result?: Result; error?: string };
const emptyLogin: Login = { type: "emby", url: "", username: "", password: "" };

function ServerFields({ side, login, setLogin, disabled }: { side: string; login: Login; setLogin: (value: Login) => void; disabled: boolean }) {
  return <section className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-sm">
    <div className="flex items-center gap-3"><div className="rounded-2xl bg-secondary p-3 text-secondary-foreground">{side === "Source" ? <History className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}</div><div><h2 className="text-lg font-semibold">{side} account</h2><p className="text-xs text-muted-foreground">{side === "Source" ? "Read history and favorites" : "Replace matched media’s user data"}</p></div></div>
    <div className="space-y-2"><Label htmlFor={`${side}-type`}>Server type</Label><Select disabled={disabled} value={login.type} onValueChange={(type: Login["type"]) => setLogin({ ...login, type })}><SelectTrigger id={`${side}-type`} className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="emby">Emby</SelectItem><SelectItem value="jellyfin">Jellyfin</SelectItem></SelectContent></Select></div>
    <div className="space-y-2"><Label htmlFor={`${side}-url`}>{side} server URL</Label><Input id={`${side}-url`} required type="url" value={login.url} disabled={disabled} onChange={(event) => setLogin({ ...login, url: event.target.value })} placeholder="https://media.example.com" className="h-11 rounded-xl" /></div>
    <div className="space-y-2"><Label htmlFor={`${side}-username`}>{side} username</Label><Input id={`${side}-username`} required maxLength={100} autoComplete="off" disabled={disabled} value={login.username} onChange={(event) => setLogin({ ...login, username: event.target.value })} placeholder="User whose data should transfer" className="h-11 rounded-xl" /></div>
    <div className="space-y-2"><Label htmlFor={`${side}-password`}>{side} password</Label><Input id={`${side}-password`} type="password" maxLength={300} autoComplete="off" disabled={disabled} value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} className="h-11 rounded-xl" /></div>
  </section>;
}

export function HistoryTransfer({ csrf }: { csrf: string }) {
  const [source, setSource] = useState<Login>({ ...emptyLogin });
  const [destination, setDestination] = useState<Login>({ ...emptyLogin });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const active = useRef(true);
  const jobId = useRef<string | null>(null);
  const generation = useRef(0);

  async function request<T>(body: object): Promise<T> {
    const response = await fetch("/api/transfers", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-HarborGate-CSRF": csrf }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      if ([502, 503, 504].includes(response.status)) {
        throw new Error(`HarborGate’s gateway could not complete the transfer request (HTTP ${response.status}). The server may be unavailable or the request timed out. Try again; if it persists, check the hosting gateway’s timeout settings.`);
      }
      throw new Error(`HarborGate’s transfer API returned a non-JSON response (HTTP ${response.status}). Check that this instance is running the latest HarborGate backend and that /api/transfers reaches HarborGate rather than a proxy or sign-in page.`);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("HarborGate returned an invalid transfer response. Check that the current backend is deployed.");
    if (!response.ok) {
      const error = data as { statusMessage?: unknown; message?: unknown };
      throw new Error(typeof error.statusMessage === "string" ? error.statusMessage : typeof error.message === "string" ? error.message : `Transfer request failed (HTTP ${response.status})`);
    }
    return data as T;
  }
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      generation.current++;
      if (jobId.current) void request({ operation: "discard", id: jobId.current }).catch(() => undefined);
    };
  }, [csrf]);

  async function monitor(initial: Job, currentGeneration: number) {
    let current = initial;
    while (active.current && generation.current === currentGeneration && jobId.current === current.id) {
      setJob(current);
      if (current.preview) setPreview(current.preview);
      if (current.result) setResult(current.result);
      if (current.status === "failed") throw new Error(current.error || "Transfer stopped");
      if (["ready", "completed", "cancelled"].includes(current.status)) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      if (!active.current || generation.current !== currentGeneration) return;
      current = await request<Job>({ operation: "status", id: current.id });
    }
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    const currentGeneration = ++generation.current;
    setBusy(true); setError(""); setResult(null); setConfirmed(false); setJob(null);
    try {
      const data = await request<Job>({ operation: "preview", source, destination });
      if (!active.current || generation.current !== currentGeneration) {
        void request({ operation: "discard", id: data.id }).catch(() => undefined);
        return;
      }
      jobId.current = data.id;
      setSource((current) => ({ ...current, password: "" })); setDestination((current) => ({ ...current, password: "" }));
      await monitor(data, currentGeneration);
    } catch (reason) { if (active.current && generation.current === currentGeneration) setError(reason instanceof Error ? reason.message : "Unable to preview transfer"); }
    finally { if (active.current && generation.current === currentGeneration) setBusy(false); }
  }
  async function resumeStatus() {
    if (!jobId.current) return;
    const currentGeneration = ++generation.current;
    setBusy(true); setError("");
    try { await monitor(await request<Job>({ operation: "status", id: jobId.current }), currentGeneration); }
    catch (reason) { if (active.current && generation.current === currentGeneration) setError(reason instanceof Error ? reason.message : "Unable to check transfer status"); }
    finally { if (active.current && generation.current === currentGeneration) setBusy(false); }
  }
  async function transfer() {
    if (!preview || !confirmed || !jobId.current) return;
    const currentGeneration = ++generation.current;
    setBusy(true); setError("");
    try { await monitor(await request<Job>({ operation: "run", id: jobId.current }), currentGeneration); }
    catch (reason) { if (active.current && generation.current === currentGeneration) setError(reason instanceof Error ? reason.message : "Transfer interrupted"); }
    finally { if (active.current && generation.current === currentGeneration) setBusy(false); }
  }
  async function startOver() {
    if (jobId.current) {
      try { await request({ operation: "discard", id: jobId.current }); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to cancel transfer"); return; }
    }
    generation.current++;
    jobId.current = null; setJob(null); setBusy(false); setPreview(null); setResult(null); setConfirmed(false); setError("");
  }

  return <div className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-7 lg:px-10">
    <div className="flex items-center gap-4"><div className="rounded-3xl bg-secondary p-4 text-secondary-foreground"><ArrowRightLeft className="h-7 w-7" /></div><div><p className="text-xs font-semibold uppercase tracking-widest text-[#0F9F8F]">Emby · Jellyfin</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Transfer history & favorites</h1><p className="mt-2 text-sm text-muted-foreground">Bring watched status, favorites, play counts, last-played dates, and resume positions to another account.</p></div></div>
    <div className="flex gap-3 rounded-2xl border border-border bg-secondary/50 p-4 text-sm"><ShieldCheck className="h-5 w-5 shrink-0 text-[#0F9F8F]" /><p>Use each user’s own login. Public HTTPS servers only. Passwords are not saved; temporary tokens stay on HarborGate’s server. Only matching media changes; the source is never modified.</p></div>
    {job && <div className="space-y-3 rounded-2xl border border-border bg-card p-4"><p role="status" className="flex items-center gap-2 text-sm font-medium">{busy && <Loader2 className="h-4 w-4 animate-spin text-[#0F9F8F]" />}{job.message}</p><p className="text-xs text-muted-foreground">Work runs in the background; progress requests return immediately. Leaving this screen requests cancellation. Already saved changes are not rolled back.</p><div className="flex flex-wrap gap-3">{!busy && !["completed", "failed", "cancelled"].includes(job.status) && <Button type="button" variant="outline" onClick={resumeStatus} className="rounded-xl">Check / resume progress</Button>}<Button type="button" variant="outline" onClick={startOver} className="rounded-xl">{job.status === "transferring" ? "Stop and reset" : "Reset preview"}</Button></div></div>}
    {!preview ? <form onSubmit={prepare} className="space-y-6"><div className="grid gap-5 md:grid-cols-2"><ServerFields side="Source" login={source} setLogin={setSource} disabled={busy || !!jobId.current} /><ServerFields side="Destination" login={destination} setLogin={setDestination} disabled={busy || !!jobId.current} /></div><Button disabled={busy || !!jobId.current} className="h-12 rounded-xl bg-[#0F9F8F] px-7 font-semibold text-white hover:bg-[#0b887b]">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}{busy ? "Preparing preview in background…" : "Preview transfer"}</Button></form> : <section className="space-y-6 rounded-3xl border border-border bg-card p-6 sm:p-8">
      <h2 className="text-xl font-semibold">{preview.sourceName} <ArrowRight className="mx-2 inline h-4 w-4" /> {preview.destinationName}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[{ label: "Active source items", value: preview.sourceItems }, { label: "Matching items", value: preview.matched }, { label: "Items to overwrite", value: preview.changes }, { label: "No safe match", value: preview.unmatched }, { label: "Ambiguous (skipped)", value: preview.ambiguous }].map((stat) => <div key={stat.label} className="rounded-2xl bg-muted p-4"><p className="text-2xl font-semibold">{stat.value}</p><p className="mt-1 text-xs text-muted-foreground">{stat.label}</p></div>)}</div>
      <p className="text-xs leading-5 text-muted-foreground">Only watched, favorited, or resumable source items are fetched; duplicates are removed. Destination lookups target their metadata IDs or titles/series, then verify matches by IDs, title/year, or episode numbering. Repeated lookups are cached. Conflicts, duplicates, and unchanged data are skipped; neither full library is listed.</p>
      {!preview.changes && <p role="status" className="rounded-2xl bg-secondary p-4 text-sm text-secondary-foreground">{!preview.sourceItems ? "This source user has no watched, favorited, or resumable items to transfer. Destination data will not be changed." : preview.matched ? "All safely matched active items already have the same user data. No overwrite is needed; skipped items have not been transferred." : "No safely matching media with source activity was found. Check that both users can access the same media and that its metadata IDs, titles, years, and episode numbering are correct."}</p>}
      {preview.samples.length > 0 && <div className="divide-y divide-border rounded-2xl border border-border">{preview.samples.map((sample, index) => <div key={index} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span>{sample.name}<span className="ml-2 text-xs text-muted-foreground">{sample.type}</span></span><span className="flex items-center gap-2 text-xs text-muted-foreground">{sample.Played ? "Watched" : "Unwatched"}{sample.IsFavorite && <Heart className="h-4 w-4 fill-rose-400 text-rose-400" />}</span></div>)}</div>}
      {!result?.done && <label className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm"><Checkbox disabled={busy} checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} className="mt-0.5 rounded" /><span>I understand user data on matching active items will be replaced by the source data, which can clear individual fields on those items. Items with no source activity and unmatched destination items are left untouched. Up to three items are saved and verified concurrently.</span></label>}
      {result && <div className="space-y-3" role="status"><Progress value={result.total ? result.processed / result.total * 100 : 100} className="h-2 rounded-full" /><p className="flex items-center gap-2 text-sm font-medium">{result.done && <CheckCircle2 className="h-4 w-4 text-[#0F9F8F]" />}{result.processed} / {result.total} processed · {result.transferred} verified · {result.failed} failed or not fully preserved</p>{result.issues.length > 0 && <ul className="space-y-1 text-xs text-rose-600 dark:text-rose-300">{result.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}</div>}
      <div className="flex flex-wrap gap-3"><Button type="button" disabled={busy} variant="outline" onClick={startOver} className="rounded-xl">{result?.done ? "New transfer" : "Change accounts"}</Button>{!result?.done && <Button disabled={busy || !confirmed || !preview.changes || job?.status === "failed" || job?.status === "cancelled"} onClick={transfer} className="rounded-xl bg-[#0F9F8F] text-white hover:bg-[#0b887b]">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{busy ? "Transferring in background…" : result ? "Resume transfer progress" : "Overwrite destination data"}</Button>}</div>
    </section>}
    {error && <p role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">{error}{jobId.current && " A lost progress response does not cancel the background job. Check / resume progress to see its latest state, or reset to cancel it."}</p>}
  </div>;
}
