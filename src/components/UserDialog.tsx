import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, Download, KeyRound, Link2Off, Loader2, Radio, Share2, ShieldCheck, Tv, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { EmbyUser, MediaLibrary, ServerId, UserPolicy } from "@/lib/harborgate";

interface UserDialogProps {
  open: boolean;
  user: EmbyUser | null;
  serverId: ServerId;
  libraries: MediaLibrary[];
  onOpenChange: (open: boolean) => void;
  onSave: (payload: { operation: "create" | "update"; id?: string; name: string; password?: string; maxSimultaneousStreams?: number; expiration: string | null; policy?: UserPolicy }) => Promise<void>;
}

const policyOptions: { key: keyof UserPolicy; label: string; description: string }[] = [
  { key: "EnableAllDevices", label: "All devices", description: "Allow login from any registered device" },
  { key: "EnableAllChannels", label: "All channels", description: "Grant access to every configured channel" },
  { key: "EnableContentDeletion", label: "Delete media", description: "Permit deletion of library content" },
  { key: "EnableRemoteControlOfOtherUsers", label: "Remote control", description: "Control sessions belonging to other users" },
  { key: "EnableLiveTvManagement", label: "Manage live TV", description: "Manage live TV and recordings" },
];

function toDateValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function UserDialog({ open, user, serverId, libraries, onOpenChange, onSave }: UserDialogProps) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [maxStreams, setMaxStreams] = useState("1");
  const [expiration, setExpiration] = useState("");
  const [policy, setPolicy] = useState<UserPolicy>({});
  const [libraryError, setLibraryError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(user?.Name ?? "");
    setPassword("");
    const currentLimit = serverId === "emby" ? user?.Policy?.SimultaneousStreamLimit : user?.Policy?.MaxActiveSessions;
    setMaxStreams(String(currentLimit && currentLimit >= 1 ? currentLimit : 1));
    setExpiration(toDateValue(user?.expiration ?? null));
    setPolicy(user?.Policy ?? { EnableAllDevices: true, EnableAllFolders: true, EnabledFolders: [], EnableAllChannels: true, IsDisabled: false });
    setLibraryError("");
  }, [user, open, serverId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (policy.EnableAllFolders === false && !policy.EnabledFolders?.length) {
      setLibraryError("Choose at least one library, or enable access to all libraries.");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        operation: user ? "update" : "create",
        id: user?.Id,
        name,
        password: user ? undefined : password,
        maxSimultaneousStreams: Number(maxStreams),
        expiration: expiration ? new Date(`${expiration}T23:59:59`).toISOString() : null,
        policy,
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[1.75rem] border-0 p-0 sm:max-w-xl">
        <form onSubmit={submit}>
          <DialogHeader className="border-b border-slate-100 px-6 py-6 text-left">
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e7f8f5] text-[#087d71]">{user ? <ShieldCheck className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}</div>
            <DialogTitle className="text-2xl tracking-[-0.025em]">{user ? "Edit user profile" : "Create user profile"}</DialogTitle>
            <DialogDescription>{user ? "Update access, status, and account lifecycle settings." : `Add a new profile to your ${serverId === "emby" ? "Emby" : "Jellyfin"} server.`}</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 px-6 py-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="profile-name">{user ? "Profile name" : "Username"}</Label><Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} autoComplete={user ? "off" : "username"} className="h-11 rounded-xl focus-visible:ring-[#0F9F8F]" placeholder={user ? "e.g. Alex" : "Choose a username"} /></div>
              {!user && <div className="space-y-2"><Label htmlFor="profile-password">Password</Label><div className="relative"><KeyRound className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><Input id="profile-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={4} maxLength={200} autoComplete="new-password" className="h-11 rounded-xl pl-10 focus-visible:ring-[#0F9F8F]" placeholder="At least 4 characters" /></div></div>}
              <div className="space-y-2"><Label htmlFor="expiration">Expiration date</Label><div className="relative"><CalendarDays className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><Input id="expiration" type="date" value={expiration} onChange={(event) => setExpiration(event.target.value)} min={new Date().toISOString().slice(0, 10)} className="h-11 rounded-xl pl-10 focus-visible:ring-[#0F9F8F]" /></div></div>
              <div className="space-y-2"><Label htmlFor="max-streams">{serverId === "emby" ? "Max simultaneous streams" : "Max active sessions"}</Label><div className="relative"><Radio className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><Input id="max-streams" type="number" value={maxStreams} onChange={(event) => setMaxStreams(event.target.value)} required min={1} max={100} className="h-11 rounded-xl pl-10 focus-visible:ring-[#0F9F8F]" /></div></div>
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-5 rounded-2xl bg-[#effaf8] px-4 py-4">
                <div><Label htmlFor="all-libraries" className="font-semibold text-[#102a43]">All libraries</Label><p className="mt-1 text-xs text-[#356a65]">Grant access to every current and future media library</p></div>
                <Switch id="all-libraries" checked={policy.EnableAllFolders !== false} onCheckedChange={(checked) => { setPolicy((current) => ({ ...current, EnableAllFolders: checked, EnabledFolders: checked ? [] : current.EnabledFolders ?? [] })); setLibraryError(""); }} className="data-[state=checked]:bg-[#0F9F8F]" />
              </div>
              {policy.EnableAllFolders === false && <div className="rounded-2xl border border-slate-200 p-4"><p className="mb-3 text-sm font-semibold text-[#102a43]">Choose accessible libraries</p>{libraries.length ? <div className="grid gap-2 sm:grid-cols-2">{libraries.map((library) => { const checked = policy.EnabledFolders?.includes(library.id) ?? false; return <label key={library.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition-colors ${checked ? "border-[#79cfc3] bg-[#f0fbf9]" : "border-slate-200 hover:bg-slate-50"}`}><Checkbox checked={checked} onCheckedChange={(value) => { setPolicy((current) => ({ ...current, EnabledFolders: value ? [...new Set([...(current.EnabledFolders ?? []), library.id])] : (current.EnabledFolders ?? []).filter((id) => id !== library.id) })); setLibraryError(""); }} className="border-slate-300 data-[state=checked]:border-[#0F9F8F] data-[state=checked]:bg-[#0F9F8F]" /><span><span className="block text-sm font-medium text-[#102a43]">{library.name}</span><span className="block text-xs capitalize text-slate-500">{library.type}</span></span></label>; })}</div> : <p className="rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-800">No libraries were returned by this server.</p>}{libraryError && <p className="mt-3 text-sm font-medium text-rose-600">{libraryError}</p>}</div>}
            </div>
            {!user && <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"><div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#0F9F8F]" /><p className="text-sm font-semibold text-[#102a43]">Secure access defaults</p></div><div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2"><div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5"><Download className="h-3.5 w-3.5 text-rose-500" /><span>Media downloads disabled</span></div><div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5"><Radio className="h-3.5 w-3.5 text-rose-500" /><span>Transcoded downloads disabled</span></div><div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5"><Share2 className="h-3.5 w-3.5 text-rose-500" /><span>Social sharing disabled</span></div><div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5"><Tv className="h-3.5 w-3.5 text-rose-500" /><span>Live TV disabled</span></div><div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5"><Tv className="h-3.5 w-3.5 text-rose-500" /><span>Live TV recording management disabled</span></div>{serverId === "emby" && <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5"><Link2Off className="h-3.5 w-3.5 text-rose-500" /><span>Trakt feature restricted</span></div>}</div></div>}
            <p className="rounded-xl bg-[#effaf8] px-4 py-3 text-xs leading-5 text-[#116b63]">Profiles expire at 11:59 PM on the selected date. Extending an automatically disabled profile re-enables it.</p>
            {user && <>
              <Separator />
              <div><h3 className="font-semibold text-[#102a43]">Access policies</h3><p className="mt-1 text-sm text-slate-500">Choose what this profile can access and manage.</p></div>
              <div className="space-y-1">
                {policyOptions.map((option) => <div key={option.key} className="flex items-center justify-between gap-5 rounded-xl px-3 py-3 hover:bg-slate-50"><div><Label htmlFor={option.key} className="font-medium">{option.label}</Label><p className="mt-0.5 text-xs text-slate-500">{option.description}</p></div><Switch id={option.key} checked={Boolean(policy[option.key])} onCheckedChange={(checked) => setPolicy((current) => ({ ...current, [option.key]: checked }))} className="data-[state=checked]:bg-[#0F9F8F]" /></div>)}
              </div>
            </>}
          </div>
          <DialogFooter className="border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">Cancel</Button>
            <Button disabled={busy} className="rounded-xl bg-[#0F9F8F] px-6 text-white hover:bg-[#0b887b]">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{user ? "Save changes" : "Create profile"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
