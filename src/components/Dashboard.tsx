import { useMemo, useState } from "react";
import { Activity, Boxes, CalendarClock, ChevronDown, CircleUserRound, Clock3, History, LayoutDashboard, LogOut, Menu, MoreHorizontal, Plus, Search, Server, ShieldCheck, Trash2, UserRoundCheck, UsersRound, UserX, X } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { DashboardData, EmbyUser } from "@/lib/harborgate";
import { InstanceManager } from "./InstanceManager";
import { PlexExpirationDialog } from "./PlexExpirationDialog";
import { PlexInviteDialog } from "./PlexInviteDialog";
import { UserDialog } from "./UserDialog";

interface DashboardProps {
  data: DashboardData;
  onRefresh: () => Promise<void>;
  onMutate: (body: object) => Promise<void>;
  onLogout: () => Promise<void>;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function expirationState(user: EmbyUser, isPlex = false) {
  if (user.Policy?.IsDisabled) return { label: "Disabled", tone: "bg-rose-50 text-rose-700 border-rose-100" };
  if (isPlex) return { label: "Active", tone: "bg-emerald-50 text-emerald-700 border-emerald-100" };
  if (!user.expiration) return { label: "No expiry", tone: "bg-slate-100 text-slate-600 border-slate-200" };
  const days = Math.ceil((new Date(user.expiration).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return { label: "Expired", tone: "bg-rose-50 text-rose-700 border-rose-100" };
  if (days <= 7) return { label: `${days}d left`, tone: "bg-amber-50 text-amber-700 border-amber-100" };
  return { label: "Active", tone: "bg-emerald-50 text-emerald-700 border-emerald-100" };
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function connectionLimit(user: EmbyUser, serverId: DashboardData["serverId"]) {
  const limit = serverId === "emby" ? user.Policy?.SimultaneousStreamLimit : user.Policy?.MaxActiveSessions;
  if (!limit || limit < 1) return "Unlimited";
  return `${limit} ${limit === 1 ? "connection" : "connections"}`;
}

export function Dashboard({ data, onRefresh, onMutate, onLogout }: DashboardProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<EmbyUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmbyUser | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [view, setView] = useState<"users" | "instances">("users");

  const manageable = data.users.filter((user) => !user.Policy?.IsAdministrator);
  const filtered = useMemo(() => manageable.filter((user) => {
    const query = search.toLowerCase();
    const matchesSearch = user.Name.toLowerCase().includes(query) || user.admin.toLowerCase().includes(query);
    const state = expirationState(user, data.serverId === "plex").label;
    const matchesFilter = filter === "all" || (filter === "active" && !user.Policy?.IsDisabled) || (filter === "disabled" && Boolean(user.Policy?.IsDisabled)) || (filter === "expiring" && state.endsWith("d left"));
    return matchesSearch && matchesFilter;
  }), [manageable, search, filter, data.serverId]);
  const activeCount = manageable.filter((user) => !user.Policy?.IsDisabled).length;
  const expiringCount = manageable.filter((user) => expirationState(user, data.serverId === "plex").label.endsWith("d left")).length;

  async function saveUser(payload: object) {
    try {
      await onMutate(payload);
      toast.success(selectedUser ? "Profile updated" : "Profile created");
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save profile");
      throw error;
    }
  }

  async function invitePlexUser(payload: { operation: "invite"; username: string; librarySectionIds: number[]; expiration: string | null }) {
    try {
      await onMutate(payload);
      await onRefresh();
      toast.success(`Library invitation sent to ${payload.username}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to invite Plex user");
      throw error;
    }
  }

  async function toggleUser(user: EmbyUser, enabled: boolean) {
    setBusyId(user.Id);
    try {
      await onMutate({ operation: "update", id: user.Id, name: user.Name, expiration: user.expiration, policy: { ...user.Policy, IsDisabled: !enabled } });
      await onRefresh();
      toast.success(data.serverId === "plex" ? (enabled ? `${user.Name}'s Plex share restored` : `${user.Name}'s Plex share revoked`) : (enabled ? `${user.Name} enabled` : `${user.Name} disabled`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update profile");
    } finally {
      setBusyId("");
    }
  }

  async function saveNotes(user: EmbyUser, value: string) {
    const notes = value.trim();
    if (notes === user.notes) return;
    setBusyId(user.Id);
    try {
      await onMutate({ operation: "notes", id: user.Id, notes });
      await onRefresh();
      toast.success(`Notes saved for ${user.Name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save notes");
    } finally {
      setBusyId("");
    }
  }

  async function saveAdmin(user: EmbyUser, value: string) {
    const admin = value.trim();
    if (admin === user.admin) return;
    setBusyId(user.Id);
    try {
      await onMutate({ operation: "update", id: user.Id, name: user.Name, admin, expiration: user.expiration, policy: user.Policy ?? {} });
      await onRefresh();
      toast.success(`Admin saved for ${user.Name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save admin");
    } finally {
      setBusyId("");
    }
  }

  async function removeUser() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.Id);
    try {
      await onMutate({ operation: "delete", id: deleteTarget.Id });
      await onRefresh();
      toast.success("Profile deleted");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete profile");
    } finally {
      setBusyId("");
    }
  }

  const Navigation = () => <nav className="space-y-2">
    <button onClick={() => setView("users")} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${view === "users" ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}><LayoutDashboard className={`h-4 w-4 ${view === "users" ? "text-[#55d7c6]" : ""}`} /> {data.serverId === "plex" ? "Shared users" : "User profiles"}</button>
    {data.isMaster && <button onClick={() => setView("instances")} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${view === "instances" ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}><Boxes className={`h-4 w-4 ${view === "instances" ? "text-[#55d7c6]" : ""}`} /> HarborGate instances</button>}
    {data.serverId !== "plex" && <button onClick={() => setHistoryOpen(true)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"><History className="h-4 w-4" /> Expiration history</button>}
  </nav>;

  return (
    <div className="min-h-screen bg-[#f4f7f9] text-[#102a43]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-[#0b2135] px-4 py-6 text-white lg:flex">
        <div className="flex items-center gap-3 px-2"><img src="/assets/harborgate-logo.png" alt="" className="h-11 w-11 rounded-2xl" /><div><p className="font-semibold tracking-tight">HarborGate</p><p className="text-xs text-slate-400">{data.serverLabel} control panel</p></div></div>
        <div className="mt-10"><Navigation /></div>
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex items-center gap-2 text-xs text-slate-400"><span className={`h-2 w-2 rounded-full shadow-[0_0_0_4px_rgba(85,215,198,.12)] ${data.serverId === "emby" ? "bg-[#55d7c6]" : "bg-violet-400"}`} /> {data.serverLabel} connected</div><p className="mt-2 truncate text-xs font-medium text-slate-200">{data.serverHostname}</p></div>
      </aside>

      <main className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-xl sm:px-7 lg:px-10">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div className="flex items-center gap-3 lg:hidden"><Sheet><SheetTrigger asChild><Button variant="ghost" size="icon" className="rounded-xl"><Menu className="h-5 w-5" /></Button></SheetTrigger><SheetContent side="left" className="w-72 border-0 bg-[#0b2135] text-white"><SheetHeader className="mb-8 text-left"><SheetTitle className="flex items-center gap-3 text-white"><img src="/assets/harborgate-logo.png" alt="" className="h-10 w-10 rounded-xl" /> HarborGate</SheetTitle></SheetHeader><Navigation /></SheetContent></Sheet><span className="font-semibold">{view === "instances" ? "HarborGate instances" : "User profiles"}</span></div>
            <div className="hidden items-center gap-2 text-sm text-slate-500 lg:flex"><Server className="h-4 w-4 text-[#0F9F8F]" /> {view === "instances" ? "Master control panel" : `${data.serverLabel} server`} <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Online</span></div>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-11 gap-3 rounded-xl px-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e7f8f5] text-xs font-bold text-[#087d71]">{initials(data.adminName)}</div><div className="hidden text-left sm:block"><p className="text-sm font-semibold">{data.adminName}</p><p className="text-xs text-slate-500">{data.serverLabel} administrator</p></div><ChevronDown className="h-4 w-4 text-slate-400" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48 rounded-xl"><DropdownMenuItem onClick={onLogout} className="rounded-lg text-rose-600"><LogOut className="mr-2 h-4 w-4" /> Switch server</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          </div>
        </header>

        {view === "instances" ? <InstanceManager csrf={data.csrf} /> : <div className="mx-auto max-w-7xl px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
          <section className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#0F9F8F]">{data.serverLabel} · People & access</p><h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{data.serverId === "plex" ? "Shared users" : "User profiles"}</h1><p className="mt-2 text-sm text-slate-500">{data.serverId === "plex" ? "Invite people and manage access to selected Plex libraries." : `Manage who can access your ${data.serverLabel} media server.`}</p></div>
            {data.serverId === "plex" ? <Button onClick={() => setInviteOpen(true)} className="h-11 rounded-xl bg-[#0F9F8F] px-5 font-semibold text-white shadow-lg shadow-teal-800/10 hover:bg-[#0b887b]"><Plus className="mr-2 h-4 w-4" /> Invite Plex user</Button> : <Button onClick={() => { setSelectedUser(null); setDialogOpen(true); }} className="h-11 rounded-xl bg-[#0F9F8F] px-5 font-semibold text-white shadow-lg shadow-teal-800/10 hover:bg-[#0b887b]"><Plus className="mr-2 h-4 w-4" /> New profile</Button>}
          </section>

          <section className={`mb-7 grid grid-cols-2 gap-3 ${data.serverId === "plex" ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
            {(data.serverId === "plex" ? [{ label: "Shared users", value: manageable.length, icon: UsersRound, color: "bg-[#eaf2f8] text-[#24618b]" }, { label: "Access enabled", value: activeCount, icon: UserRoundCheck, color: "bg-emerald-50 text-emerald-700" }, { label: "Access disabled", value: manageable.length - activeCount, icon: UserX, color: "bg-rose-50 text-rose-700" }] : [{ label: "Total profiles", value: manageable.length, icon: UsersRound, color: "bg-[#eaf2f8] text-[#24618b]" }, { label: "Active", value: activeCount, icon: UserRoundCheck, color: "bg-emerald-50 text-emerald-700" }, { label: "Expiring soon", value: expiringCount, icon: CalendarClock, color: "bg-amber-50 text-amber-700" }, { label: "Disabled", value: manageable.length - activeCount, icon: UserX, color: "bg-rose-50 text-rose-700" }]).map((stat) => <div key={stat.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40 sm:p-5"><div className={`mb-4 flex h-9 w-9 items-center justify-center rounded-xl ${stat.color}`}><stat.icon className="h-4 w-4" /></div><p className="text-2xl font-semibold tracking-tight">{stat.value}</p><p className="mt-1 text-xs text-slate-500">{stat.label}</p></div>)}
          </section>

          <section className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white shadow-sm shadow-slate-200/60">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="relative w-full sm:max-w-sm"><Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={data.serverId === "plex" ? "Search shared users…" : "Search profiles…"} className="h-10 rounded-xl bg-slate-50 pl-10 focus-visible:ring-[#0F9F8F]" />{search && <button onClick={() => setSearch("")} className="absolute right-3 top-3 text-slate-400"><X className="h-4 w-4" /></button>}</div><Select value={filter} onValueChange={setFilter}><SelectTrigger className="h-10 w-full rounded-xl sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All {data.serverId === "plex" ? "users" : "profiles"}</SelectItem><SelectItem value="active">Active</SelectItem>{data.serverId !== "plex" && <SelectItem value="expiring">Expiring soon</SelectItem>}<SelectItem value="disabled">Disabled</SelectItem></SelectContent></Select></div>

            {filtered.length === 0 ? <div className="flex flex-col items-center px-6 py-14 text-center"><img src="/assets/harborgate-empty.png" alt="No matching users" className="mb-5 h-32 w-32 object-contain" /><h3 className="font-semibold">No {data.serverId === "plex" ? "shared users" : "profiles"} found</h3><p className="mt-1 max-w-sm text-sm text-slate-500">Try another search or filter{data.serverId === "plex" ? ", or invite a Plex username to selected libraries." : `, or create a new ${data.serverLabel} profile.`}</p></div> : <div className="divide-y divide-slate-100">{filtered.map((user) => {
              const status = expirationState(user, data.serverId === "plex");
              return <article key={user.Id} className={`group grid gap-4 p-4 transition hover:bg-slate-50/70 sm:items-center sm:px-5 ${data.serverId === "plex" ? "sm:grid-cols-[minmax(220px,1.5fr)_minmax(100px,.7fr)_minmax(110px,.75fr)_130px]" : "sm:grid-cols-[minmax(220px,1.5fr)_minmax(100px,.65fr)_minmax(110px,.7fr)_minmax(110px,.75fr)_105px_38px]"}`}>
                <div className="flex min-w-0 items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e7f8f5] text-sm font-bold text-[#087d71]">{initials(user.Name)}</div><div className="min-w-0 flex-1"><button onClick={() => { setSelectedUser(user); setDialogOpen(true); }} className="block max-w-full text-left"><p className="truncate font-semibold">{user.Name}</p><p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">{data.serverId === "plex" ? <ShieldCheck className="h-3.5 w-3.5 text-amber-500" /> : user.HasPassword ? <ShieldCheck className="h-3.5 w-3.5 text-[#0F9F8F]" /> : <CircleUserRound className="h-3.5 w-3.5" />}{data.serverId === "plex" ? "Plex shared account" : user.HasPassword ? "Password protected" : "No password"}</p></button><div className="mt-2 flex items-center gap-2"><label htmlFor={`notes-${user.Id}`} className="shrink-0 text-xs font-semibold text-slate-500">Notes:</label><Input key={`${user.Id}-${user.notes}`} id={`notes-${user.Id}`} defaultValue={user.notes} maxLength={100} disabled={busyId === user.Id} onBlur={(event) => saveNotes(user, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} placeholder="Add a note" className="h-7 min-w-0 rounded-lg border-slate-200 bg-white px-2.5 text-xs focus-visible:ring-[#0F9F8F]" /></div>{data.serverId !== "plex" && <div className="mt-2 flex items-center gap-2"><label htmlFor={`admin-${user.Id}`} className="shrink-0 text-xs font-semibold text-slate-500">Admin:</label><Input key={`${user.Id}-${user.admin}`} id={`admin-${user.Id}`} defaultValue={user.admin} maxLength={100} disabled={busyId === user.Id} onBlur={(event) => saveAdmin(user, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} placeholder="Owner name" className="h-7 min-w-0 rounded-lg border-slate-200 bg-white px-2.5 text-xs focus-visible:ring-[#0F9F8F]" /></div>}</div></div>
                <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:hidden">Status</p><Badge variant="outline" className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.tone}`}>{status.label}</Badge></div>
                <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:hidden">Expires</p><p className="flex items-center gap-1.5 text-sm text-slate-600"><Clock3 className="h-3.5 w-3.5 text-slate-400" />{formatDate(user.expiration)}</p></div>
                {data.serverId !== "plex" && <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Connections</p><p className="text-sm font-semibold text-[#24618b]">{connectionLimit(user, data.serverId)}</p></div>}
                <div className="flex items-center gap-2"><Switch disabled={busyId === user.Id} checked={!user.Policy?.IsDisabled} onCheckedChange={(checked) => toggleUser(user, checked)} className="data-[state=checked]:bg-[#0F9F8F]" /><span className="text-xs text-slate-500">Access enabled</span></div>
                {data.serverId !== "plex" && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="rounded-xl"><DropdownMenuItem onClick={() => { setSelectedUser(user); setDialogOpen(true); }}>Edit profile</DropdownMenuItem><DropdownMenuItem onClick={() => setDeleteTarget(user)} className="text-rose-600"><Trash2 className="mr-2 h-4 w-4" /> Delete profile</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
              </article>;
            })}</div>}
          </section>
          <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-slate-400"><Activity className="h-3.5 w-3.5" /> Expirations are checked every minute while an administrator session is active.</p>
        </div>}
      </main>

      {data.serverId === "plex" ? <PlexExpirationDialog open={dialogOpen} user={selectedUser} onOpenChange={setDialogOpen} onSave={(expiration) => saveUser({ operation: "update", id: selectedUser?.Id, name: selectedUser?.Name, expiration })} /> : <UserDialog open={dialogOpen} user={selectedUser} serverId={data.serverId} libraries={data.mediaLibraries} onOpenChange={setDialogOpen} onSave={saveUser} />}
      {data.serverId === "plex" && <PlexInviteDialog open={inviteOpen} libraries={data.plexLibraries} onOpenChange={setInviteOpen} onInvite={invitePlexUser} />}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}><SheetContent className="w-full overflow-y-auto sm:max-w-md"><SheetHeader className="text-left"><SheetTitle className="text-2xl tracking-tight">Expiration history</SheetTitle></SheetHeader><div className="mt-7 space-y-3">{data.events.length === 0 ? <div className="rounded-2xl bg-slate-50 p-8 text-center"><History className="mx-auto mb-3 h-8 w-8 text-slate-300" /><p className="text-sm text-slate-500">No automatic expiration events yet.</p></div> : data.events.map((event) => <div key={event.id} className="flex gap-3 rounded-2xl border border-slate-100 p-4"><div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${event.action === "expired" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>{event.action === "expired" ? <UserX className="h-4 w-4" /> : <UserRoundCheck className="h-4 w-4" />}</div><div><p className="text-sm font-medium">{event.userName} was {event.action}</p><p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurredAt))}</p></div></div>)}</div></SheetContent></Sheet>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}><AlertDialogContent className="rounded-[1.5rem]"><AlertDialogHeader><AlertDialogTitle>Delete {deleteTarget?.Name}?</AlertDialogTitle><AlertDialogDescription>This permanently removes the profile from {data.serverLabel}. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="rounded-xl">Keep profile</AlertDialogCancel><AlertDialogAction onClick={removeUser} className="rounded-xl bg-rose-600 text-white hover:bg-rose-700">Delete profile</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
