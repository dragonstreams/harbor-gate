import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { EmbyUser, UserPolicy } from "@/lib/harborgate";

interface UserDialogProps {
  open: boolean;
  user: EmbyUser | null;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: { operation: "create" | "update"; id?: string; name: string; expiration: string | null; policy?: UserPolicy }) => Promise<void>;
}

const policyOptions: { key: keyof UserPolicy; label: string; description: string }[] = [
  { key: "EnableAllDevices", label: "All devices", description: "Allow login from any registered device" },
  { key: "EnableAllFolders", label: "All libraries", description: "Grant access to every media library" },
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

export function UserDialog({ open, user, onOpenChange, onSave }: UserDialogProps) {
  const [name, setName] = useState("");
  const [expiration, setExpiration] = useState("");
  const [policy, setPolicy] = useState<UserPolicy>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(user?.Name ?? "");
    setExpiration(toDateValue(user?.expiration ?? null));
    setPolicy(user?.Policy ?? { EnableAllDevices: true, EnableAllFolders: true, EnableAllChannels: true, IsDisabled: false });
  }, [user, open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSave({
        operation: user ? "update" : "create",
        id: user?.Id,
        name,
        expiration: expiration ? new Date(`${expiration}T23:59:59`).toISOString() : null,
        policy: user ? policy : undefined,
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
            <DialogDescription>{user ? "Update access, status, and account lifecycle settings." : "Add a new profile to your Emby server."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 px-6 py-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="profile-name">Profile name</Label><Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} className="h-11 rounded-xl focus-visible:ring-[#0F9F8F]" placeholder="e.g. Alex" /></div>
              <div className="space-y-2"><Label htmlFor="expiration">Expiration date</Label><div className="relative"><CalendarDays className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><Input id="expiration" type="date" value={expiration} onChange={(event) => setExpiration(event.target.value)} min={new Date().toISOString().slice(0, 10)} className="h-11 rounded-xl pl-10 focus-visible:ring-[#0F9F8F]" /></div></div>
            </div>
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
