import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, Library, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlexLibrary } from "@/lib/harborgate";

interface PlexInviteDialogProps {
  open: boolean;
  libraries: PlexLibrary[];
  onOpenChange: (open: boolean) => void;
  onInvite: (payload: { operation: "invite"; username: string; librarySectionIds: number[]; expiration: string | null }) => Promise<void>;
}

export function PlexInviteDialog({ open, libraries, onOpenChange, onInvite }: PlexInviteDialogProps) {
  const [username, setUsername] = useState("");
  const [selectedLibraries, setSelectedLibraries] = useState<number[]>([]);
  const [expiration, setExpiration] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUsername("");
    setSelectedLibraries([]);
    setExpiration("");
  }, [open]);

  function toggleLibrary(id: number, checked: boolean) {
    setSelectedLibraries((current) => checked ? [...current, id] : current.filter((libraryId) => libraryId !== id));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedLibraries.length) return;
    setBusy(true);
    try {
      await onInvite({
        operation: "invite",
        username: username.trim(),
        librarySectionIds: selectedLibraries,
        expiration: expiration ? new Date(`${expiration}T23:59:59`).toISOString() : null,
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[1.75rem] border-0 p-0 sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader className="border-b border-slate-100 px-6 py-6 text-left">
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><UserPlus className="h-5 w-5" /></div>
            <DialogTitle className="text-2xl tracking-[-0.025em]">Invite a Plex user</DialogTitle>
            <DialogDescription>Grant managed access to selected libraries using their Plex username.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 px-6 py-6">
            <div className="space-y-2">
              <Label htmlFor="plex-username">Plex username</Label>
              <Input id="plex-username" value={username} onChange={(event) => setUsername(event.target.value)} required minLength={1} maxLength={100} pattern="[A-Za-z0-9._-]+" autoComplete="off" placeholder="plex_username" className="h-11 rounded-xl focus-visible:ring-[#0F9F8F]" />
              <p className="text-xs text-slate-500">HarborGate grants library access only. It does not send a Plex social friend request.</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2"><Library className="h-4 w-4 text-[#0F9F8F]" /><Label>Library access</Label></div>
              <div className="grid gap-2 sm:grid-cols-2">
                {libraries.map((library) => {
                  const id = `plex-library-${library.id}`;
                  return <label key={library.id} htmlFor={id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 transition hover:border-teal-200 hover:bg-[#effaf8]">
                    <Checkbox id={id} checked={selectedLibraries.includes(library.id)} onCheckedChange={(checked) => toggleLibrary(library.id, checked === true)} className="data-[state=checked]:border-[#0F9F8F] data-[state=checked]:bg-[#0F9F8F]" />
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{library.title}</span><span className="block text-xs capitalize text-slate-500">{library.type}</span></span>
                  </label>;
                })}
              </div>
              {!libraries.length && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">No Plex libraries are currently available.</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="plex-invite-expiration">Expiration date <span className="font-normal text-slate-400">(optional)</span></Label>
              <div className="relative"><CalendarDays className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><Input id="plex-invite-expiration" type="date" value={expiration} onChange={(event) => setExpiration(event.target.value)} min={new Date().toISOString().slice(0, 10)} className="h-11 rounded-xl pl-10 focus-visible:ring-[#0F9F8F]" /></div>
              <p className="text-xs text-slate-500">Library access is automatically disabled at 11:59 PM on this date.</p>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:justify-between">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)} className="rounded-xl">Cancel</Button>
            <Button disabled={busy || !username.trim() || !selectedLibraries.length} className="rounded-xl bg-[#0F9F8F] px-6 text-white hover:bg-[#0b887b]">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}{busy ? "Sending invitation…" : "Invite with access"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
