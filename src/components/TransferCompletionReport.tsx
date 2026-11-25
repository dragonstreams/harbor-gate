import { useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, CircleMinus, ClipboardList, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TransferReportItem, TransferReportPage } from "@/types/transfer-report";

type Group = "transferred" | "notTransferred" | "unchanged";
const labels = { transferred: "Successfully transferred", failed: "Failed / not fully verified", unmatched: "No safe match", ambiguous: "Ambiguous match", unchanged: "Already up to date", pending: "Not processed" };

function DataDetails({ item }: { item: TransferReportItem }) {
  const seconds = Math.floor(item.data.PlaybackPositionTicks / 10_000_000);
  const position = `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const values = [item.data.Played ? "Watched" : "Unwatched", item.data.IsFavorite ? "Favorite" : "Not a favorite", `${item.data.PlayCount} plays`, `Resume: ${position}`, `Last played: ${item.data.LastPlayedDate ? new Date(item.data.LastPlayedDate).toLocaleString() : "none"}`];
  return <div className="mt-3 flex flex-wrap gap-2">{values.map((value) => <span key={value} className="rounded-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground">{value}</span>)}</div>;
}

export function TransferCompletionReport({ csrf, jobId }: { csrf: string; jobId: string }) {
  const [group, setGroup] = useState<Group>("transferred");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TransferReportPage | null>(null);
  const [counts, setCounts] = useState<TransferReportPage["counts"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null);
    void (async () => {
      try {
        const response = await fetch("/api/transfers", {
          method: "POST", cache: "no-store", signal: controller.signal,
          headers: { Accept: "application/json", "Content-Type": "application/json", "X-HarborGate-CSRF": csrf },
          body: JSON.stringify({ operation: "report", id: jobId, group, page }),
        });
        const text = await response.text();
        let payload: TransferReportPage & { statusMessage?: string; message?: string };
        try { payload = JSON.parse(text); } catch { throw new Error(`Report request returned a non-JSON response (HTTP ${response.status}). Try loading the report again.`); }
        if (!payload || typeof payload !== "object") throw new Error("HarborGate returned an invalid report response");
        if (!response.ok) throw new Error(payload.statusMessage || payload.message || `Unable to load report (HTTP ${response.status})`);
        if (!Array.isArray(payload.items) || !payload.counts) throw new Error("HarborGate returned an invalid report response");
        if (!controller.signal.aborted) { setData(payload); setCounts(payload.counts); }
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load transfer report");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [csrf, jobId, group, page, retry]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return <section className="space-y-5 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7" aria-label="Transfer completion report">
    <div className="flex items-start gap-3"><div className="rounded-2xl bg-secondary p-3 text-secondary-foreground"><ClipboardList className="h-5 w-5" /></div><div><h2 className="text-xl font-semibold tracking-tight">Transfer results</h2><p className="mt-1 text-sm text-muted-foreground">Every active source item is accounted for. Successful items were saved and verified; unchanged items needed no write.</p><p className="mt-2 text-xs text-muted-foreground">This report stays available for this temporary job, until reset, expiry, or a HarborGate restart.</p></div></div>
    <Tabs value={group} onValueChange={(value) => { setGroup(value as Group); setPage(1); }}>
      <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-2xl bg-muted/70 p-2 sm:grid-cols-3">
        <TabsTrigger value="transferred" className="justify-start gap-2 rounded-xl px-4 py-3 data-[state=active]:bg-emerald-700 data-[state=active]:text-white"><CheckCircle2 className="h-4 w-4" />Transferred <span className="ml-auto font-semibold">{counts?.transferred ?? "—"}</span></TabsTrigger>
        <TabsTrigger value="notTransferred" className="justify-start gap-2 rounded-xl px-4 py-3 data-[state=active]:bg-rose-700 data-[state=active]:text-white"><TriangleAlert className="h-4 w-4" />Not transferred <span className="ml-auto font-semibold">{counts?.notTransferred ?? "—"}</span></TabsTrigger>
        <TabsTrigger value="unchanged" className="justify-start gap-2 rounded-xl px-4 py-3 data-[state=active]:bg-sky-700 data-[state=active]:text-white"><CircleMinus className="h-4 w-4" />Already up to date <span className="ml-auto font-semibold">{counts?.unchanged ?? "—"}</span></TabsTrigger>
      </TabsList>
    </Tabs>
    {group === "notTransferred" && <p className="text-sm text-muted-foreground">Includes failed writes, incomplete verification, missing matches, and ambiguous matches. A failed verification can mean some fields were saved; see each reason below.</p>}
    {loading && <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading itemized results…</p>}
    {error && <div role="alert" className="space-y-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4"><p className="text-sm text-rose-700 dark:text-rose-300">{error}</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)} className="rounded-xl">Retry report</Button></div>}
    {!loading && data && <>
      {!data.items.length ? <p className="rounded-2xl bg-muted/60 p-5 text-sm text-muted-foreground">{group === "transferred" ? "No items were written and fully verified in this transfer." : group === "notTransferred" ? "No failed or skipped items." : "No items were already up to date."}</p> : <ul className="space-y-3">{data.items.map((item) => <li key={item.id} className="rounded-2xl border border-border p-4">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><h3 className="break-words text-sm font-semibold">{item.name}</h3><p className="mt-1 text-xs text-muted-foreground">{item.type}{item.year ? ` · ${item.year}` : ""}{item.type === "Episode" && item.seriesName ? ` · ${item.seriesName}` : ""}{item.type === "Episode" && item.season !== undefined && item.episode !== undefined ? ` · S${String(item.season).padStart(2, "0")}E${String(item.episode).padStart(2, "0")}` : ""}</p></div><span className={`w-fit shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${item.outcome === "transferred" ? "bg-emerald-100 text-emerald-800" : item.outcome === "unchanged" ? "bg-sky-100 text-sky-800" : "bg-rose-100 text-rose-800"}`}>{labels[item.outcome]}</span></div>
        <p className="mt-3 break-words text-sm text-muted-foreground">{item.reason}</p>
        <p className="mt-3 text-xs font-medium">{item.outcome === "transferred" ? "Verified destination data" : item.outcome === "unchanged" ? "Already matching data" : "Requested source data (not confirmed transferred)"}</p>
        <DataDetails item={item} />
      </li>)}</ul>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-xs text-muted-foreground">{data.total ? `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total} items` : "0 items"} · Page {data.page} of {pages}</p><div className="flex gap-2"><Button variant="outline" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} className="rounded-xl"><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button><Button variant="outline" disabled={data.page >= pages} onClick={() => setPage(data.page + 1)} className="rounded-xl">Next<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
    </>}
  </section>;
}
