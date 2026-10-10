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
  const active = useRef(true);
  const planId = useRef<string | null>(null);

  async function request<T>(body: object): Promise<T> {
    const response = await fetch("/api/transfers", { method: "POST", headers: { "Content-Type": "application/json", "X-HarborGate-CSRF": csrf }, body: JSON.stringify(body), cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.statusMessage || data.message || "Transfer request failed");
    return data as T;
  }
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; if (planId.current) void request({ operation: "discard", id: planId.current }).catch(() => undefined); };
  }, [csrf]);

  async function prepare(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setResult(null); setConfirmed(false);
    try {
      const data = await request<Preview>({ operation: "preview", source, destination });
      if (!active.current) { void request({ operation: "discard", id: data.id }); return; }
      planId.current = data.id; setPreview(data);
      setSource((current) => ({ ...current, password: "" })); setDestination((current) => ({ ...current, password: "" }));
    } catch (reason) { if (active.current) setError(reason instanceof Error ? reason.message : "Unable to preview transfer"); }
    finally { if (active.current) setBusy(false); }
  }
  async function transfer() {
    if (!preview || !confirmed) return;
    setBusy(true); setError("");
    try {
      while (active.current) {
        const data = await request<Result>({ operation: "run", id: preview.id });
        if (!active.current) break;
        setResult(data);
        if (data.done) { planId.current = null; break; }
      }
    } catch (reason) { if (active.current) setError(reason instanceof Error ? reason.message : "Transfer interrupted"); }
    finally { if (active.current) setBusy(false); }
  }
  function startOver() {
    if (planId.current) void request({ operation: "discard", id: planId.current }).catch(() => undefined);
    planId.current = null; setPreview(null); setResult(null); setConfirmed(false); setError("");
  }

  return <div className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-7 lg:px-10">
    <div className="flex items-center gap-4"><div className="rounded-3xl bg-secondary p-4 text-secondary-foreground"><ArrowRightLeft className="h-7 w-7" /></div><div><p className="text-xs font-semibold uppercase tracking-widest text-[#0F9F8F]">Emby · Jellyfin</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Transfer history & favorites</h1><p className="mt-2 text-sm text-muted-foreground">Bring watched status, favorites, play counts, last-played dates, and resume positions to another account.</p></div></div>
    <div className="flex gap-3 rounded-2xl border border-border bg-secondary/50 p-4 text-sm"><ShieldCheck className="h-5 w-5 shrink-0 text-[#0F9F8F]" /><p>Use each user’s own login. Public HTTPS servers only. Passwords are not saved; temporary tokens stay on HarborGate’s server. Only matching media changes; the source is never modified.</p></div>
    {!preview ? <form onSubmit={prepare} className="space-y-6"><div className="grid gap-5 md:grid-cols-2"><ServerFields side="Source" login={source} setLogin={setSource} disabled={busy} /><ServerFields side="Destination" login={destination} setLogin={setDestination} disabled={busy} /></div><Button disabled={busy} className="h-12 rounded-xl bg-[#0F9F8F] px-7 font-semibold text-white hover:bg-[#0b887b]">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}{busy ? "Connecting & matching libraries…" : "Preview transfer"}</Button></form> : <section className="space-y-6 rounded-3xl border border-border bg-card p-6 sm:p-8">
      <h2 className="text-xl font-semibold">{preview.sourceName} <ArrowRight className="mx-2 inline h-4 w-4" /> {preview.destinationName}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[{ label: "Matching items", value: preview.matched }, { label: "Items to overwrite", value: preview.changes }, { label: "No safe match", value: preview.unmatched }, { label: "Ambiguous (skipped)", value: preview.ambiguous }].map((stat) => <div key={stat.label} className="rounded-2xl bg-muted p-4"><p className="text-2xl font-semibold">{stat.value}</p><p className="mt-1 text-xs text-muted-foreground">{stat.label}</p></div>)}</div>
      <p className="text-xs leading-5 text-muted-foreground">Matches use external metadata IDs, or movie title/year and episode series/season/number when IDs are absent. Other items without stable IDs are skipped. Media files and detailed playback-session logs are not copied.</p>
      {preview.samples.length > 0 && <div className="divide-y divide-border rounded-2xl border border-border">{preview.samples.map((sample, index) => <div key={index} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span>{sample.name}<span className="ml-2 text-xs text-muted-foreground">{sample.type}</span></span><span className="flex items-center gap-2 text-xs text-muted-foreground">{sample.Played ? "Watched" : "Unwatched"}{sample.IsFavorite && <Heart className="h-4 w-4 fill-rose-400 text-rose-400" />}</span></div>)}</div>}
      {!result?.done && <label className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm"><Checkbox disabled={busy} checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} className="mt-0.5 rounded" /><span>I understand matching destination data will be overwritten, including clearing favorites, watched status, and progress where the source has none. Unmatched destination items are left untouched.</span></label>}
      {result && <div className="space-y-3" role="status"><Progress value={result.total ? result.processed / result.total * 100 : 100} className="h-2 rounded-full" /><p className="flex items-center gap-2 text-sm font-medium">{result.done && <CheckCircle2 className="h-4 w-4 text-[#0F9F8F]" />}{result.processed} / {result.total} processed · {result.transferred} verified · {result.failed} failed or not fully preserved</p>{result.issues.length > 0 && <ul className="space-y-1 text-xs text-rose-600 dark:text-rose-300">{result.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}</div>}
      <div className="flex flex-wrap gap-3"><Button type="button" disabled={busy} variant="outline" onClick={startOver} className="rounded-xl">{result?.done ? "New transfer" : "Change accounts"}</Button>{!result?.done && <Button disabled={busy || !confirmed || !preview.changes} onClick={transfer} className="rounded-xl bg-[#0F9F8F] text-white hover:bg-[#0b887b]">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{busy ? "Transferring… Keep this page open" : result ? "Resume transfer" : "Overwrite destination data"}</Button>}</div>
    </section>}
    {error && <p role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
  </div>;
}
