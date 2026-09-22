import { FormEvent, useEffect, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EmbyUser } from "@/lib/harborgate";

interface PlexExpirationDialogProps {
  open: boolean;
  user: EmbyUser | null;
  onOpenChange: (open: boolean) => void;
  onSave: (expiration: string | null) => Promise<void>;
}

function toDateValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function PlexExpirationDialog({ open, user, onOpenChange, onSave }: PlexExpirationDialogProps) {
  const [expiration, setExpiration] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setExpiration(toDateValue(user?.expiration ?? null));
  }, [user, open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSave(expiration ? new Date(`${expiration}T23:59:59`).toISOString() : null);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[1.75rem] border-0 p-0 sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader className="border-b border-slate-100 px-6 py-6 text-left">
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><CalendarClock className="h-5 w-5" /></div>
            <DialogTitle className="text-2xl tracking-[-0.025em]">Plex access expiration</DialogTitle>
            <DialogDescription>Automatically disable library access for {user?.Name ?? "this shared user"} at the end of the selected day.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-6 py-6">
            <Label htmlFor="plex-expiration">Expiration date</Label>
            <Input id="plex-expiration" type="date" value={expiration} onChange={(event) => setExpiration(event.target.value)} min={new Date().toISOString().slice(0, 10)} className="h-11 rounded-xl focus-visible:ring-[#0F9F8F]" />
            <p className="text-xs leading-5 text-slate-500">Leave the date empty to remove expiration. Extending or removing an automatically expired date restores the previous Plex library access.</p>
          </div>
          <DialogFooter className="border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:justify-between">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)} className="rounded-xl">Cancel</Button>
            <Button disabled={busy} className="rounded-xl bg-[#0F9F8F] px-6 text-white hover:bg-[#0b887b]">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save expiration</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
