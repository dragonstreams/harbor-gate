import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfilePasswordReset({ userId, csrf, onSaved }: { userId: string; csrf: string; onSaved: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reset() {
    if (password.length < 4) return;
    setBusy(true);
    try {
      const response = await fetch("/api/users/password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-HarborGate-CSRF": csrf },
        body: JSON.stringify({ operation: "reset", id: userId, password }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.statusMessage || data.message || "Unable to reset password");
      setPassword("");
      setVisible(false);
      toast.success("Password reset and saved securely");
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reset password");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-3 rounded-2xl border border-border bg-muted/50 p-4">
    <Label htmlFor={`reset-password-${userId}`} className="font-semibold">Reset password</Label>
    <p className="text-xs leading-5 text-muted-foreground">Replaces this user’s current password and saves an encrypted copy in HarborGate.</p>
    <Input id={`reset-password-${userId}`} type={visible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} maxLength={200} autoComplete="new-password" placeholder="New password (at least 4 characters)" className="h-11 rounded-xl" />
    <label className="flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={visible} disabled={busy} onCheckedChange={(value) => setVisible(value === true)} className="rounded data-[state=checked]:bg-[#0F9F8F]" />Unhide new password</label>
    <Button type="button" disabled={busy || password.length < 4} onClick={reset} className="rounded-xl bg-[#0F9F8F] text-white hover:bg-[#0b887b]">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Reset & save password</Button>
  </div>;
}
