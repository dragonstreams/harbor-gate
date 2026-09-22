import { FormEvent, useEffect, useMemo, useState } from "react";
import { Box, ExternalLink, Globe2, KeyRound, Loader2, Plus, ServerCog, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deployInstance, getInstances, type InstancesData, type ServerId } from "@/lib/harborgate";

interface InstanceManagerProps {
  csrf: string;
}

const emptyForm = { name: "", serverId: "emby" as ServerId, serverUrl: "https://", username: "", password: "" };

export function InstanceManager({ csrf }: InstanceManagerProps) {
  const [data, setData] = useState<InstancesData | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setData(await getInstances());
  }

  useEffect(() => { load().catch((reason) => toast.error(reason instanceof Error ? reason.message : "Unable to load instances")); }, []);

  const serverCounts = useMemo(() => ({
    emby: data?.instances.filter((instance) => instance.serverId === "emby").length ?? 0,
    jellyfin: data?.instances.filter((instance) => instance.serverId === "jellyfin").length ?? 0,
    plex: data?.instances.filter((instance) => instance.serverId === "plex").length ?? 0,
  }), [data]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await deployInstance(csrf, form);
      setForm(emptyForm);
      setOpen(false);
      await load();
      toast.success("HarborGate instance deployed");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to deploy instance");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
      <section className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#0F9F8F]">Master control · Fleet</p><h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">HarborGate instances</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Deploy isolated control panels with their own media server connection, storage, and Bunny endpoint.</p></div>
        <Button onClick={() => setOpen(true)} disabled={data ? !data.configuration.ready : true} className="h-11 rounded-xl bg-[#0F9F8F] px-5 font-semibold text-white shadow-lg shadow-teal-800/10 hover:bg-[#0b887b]"><Plus className="mr-2 h-4 w-4" /> Deploy instance</Button>
      </section>

      {data && !data.configuration.ready && <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900"><p className="font-semibold">Deployment configuration is incomplete</p><p className="mt-1 text-amber-800">Add these server environment variables: {data.configuration.missing.join(", ")}.</p></div>}

      <section className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[{ label: "Total instances", value: data?.instances.length ?? 0, icon: Box }, { label: "Emby panels", value: serverCounts.emby, icon: ServerCog }, { label: "Jellyfin panels", value: serverCounts.jellyfin, icon: Globe2 }, { label: "Plex panels", value: serverCounts.plex, icon: ShieldCheck }].map((stat) => <div key={stat.label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40"><div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#e7f8f5] text-[#087d71]"><stat.icon className="h-4 w-4" /></div><p className="text-2xl font-semibold tracking-tight">{stat.value}</p><p className="mt-1 text-xs text-slate-500">{stat.label}</p></div>)}
      </section>

      <section className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white shadow-sm shadow-slate-200/60">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Deployed fleet</h2><p className="mt-1 text-xs text-slate-500">Credentials are encrypted at rest and never displayed here.</p></div>
        {!data ? <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div> : data.instances.length === 0 ? <div className="px-6 py-16 text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e7f8f5] text-[#087d71]"><Box className="h-6 w-6" /></div><h3 className="font-semibold">No child instances yet</h3><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Deploy your first isolated HarborGate panel for an Emby, Jellyfin, or Plex server.</p></div> : <div className="divide-y divide-slate-100">{data.instances.map((instance) => <article key={instance.id} className="grid gap-4 p-5 sm:grid-cols-[1.2fr_1fr_auto] sm:items-center"><div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e7f8f5] text-[#087d71]"><ServerCog className="h-5 w-5" /></div><div className="min-w-0"><p className="truncate font-semibold">{instance.name}</p><p className="mt-1 truncate text-xs text-slate-500">{instance.serverUrl}</p></div></div><div className="flex items-center gap-3"><Badge variant="outline" className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${instance.serverId === "emby" ? "border-emerald-100 bg-emerald-50 text-emerald-700" : instance.serverId === "jellyfin" ? "border-violet-100 bg-violet-50 text-violet-700" : "border-amber-100 bg-amber-50 text-amber-700"}`}>{instance.serverId === "emby" ? "Emby" : instance.serverId === "jellyfin" ? "Jellyfin" : "Plex"}</Badge><span className="text-xs text-slate-400">{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(instance.createdAt))}</span></div><Button asChild variant="outline" className="rounded-xl"><a href={instance.publicUrl} target="_blank" rel="noreferrer">Open panel <ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button></article>)}</div>}
      </section>

      <Dialog open={open} onOpenChange={(next) => { if (!busy) { setOpen(next); setError(""); } }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[1.75rem] p-0 sm:max-w-xl">
          <form onSubmit={submit}>
            <DialogHeader className="border-b border-slate-100 px-6 py-6 text-left"><div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e7f8f5] text-[#087d71]"><ServerCog className="h-5 w-5" /></div><DialogTitle className="text-2xl tracking-tight">Deploy HarborGate</DialogTitle><DialogDescription>Create a dedicated Bunny instance and connect it to a media server.</DialogDescription></DialogHeader>
            <div className="space-y-5 px-6 py-6">
              <div className="space-y-2"><Label htmlFor="instance-name">Instance name</Label><Input id="instance-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={80} placeholder="Family media" className="h-11 rounded-xl" /></div>
              <div className="space-y-2"><Label>Media server</Label><Select value={form.serverId} onValueChange={(serverId: ServerId) => setForm({ ...form, serverId })}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="emby">Emby</SelectItem><SelectItem value="jellyfin">Jellyfin 12+</SelectItem><SelectItem value="plex">Plex</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="server-address">Server address</Label><Input id="server-address" type="url" value={form.serverUrl} onChange={(event) => setForm({ ...form, serverUrl: event.target.value })} required placeholder="https://media.example.com" className="h-11 rounded-xl" /><p className="text-xs text-slate-500">Only public HTTPS addresses are accepted.</p></div>
              {form.serverId !== "plex" && <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="server-username">Administrator username</Label><Input id="server-username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required autoComplete="username" maxLength={100} className="h-11 rounded-xl" /></div><div className="space-y-2"><Label htmlFor="server-password">Password</Label><Input id="server-password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required autoComplete="new-password" maxLength={300} className="h-11 rounded-xl" /></div></div>}
              <div className="flex gap-3 rounded-2xl bg-[#effaf8] p-4 text-xs leading-5 text-[#116b63]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>{form.serverId === "plex" ? "The child panel will use Plex's secure browser authorization flow. No Plex password or token is stored in the deployment configuration." : "HarborGate validates administrator access before deployment. The password is encrypted with AES-256-GCM on the master and is never sent back to the browser."}</p></div>
              {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
            </div>
            <DialogFooter className="border-t border-slate-100 bg-slate-50/70 px-6 py-4"><Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button><Button disabled={busy} className="rounded-xl bg-[#0F9F8F] px-6 text-white hover:bg-[#0b887b]">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}{busy ? "Validating & deploying…" : "Deploy securely"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
