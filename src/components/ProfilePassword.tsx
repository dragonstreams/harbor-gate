import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { EmbyUser } from "@/lib/harborgate";

export function ProfilePassword({ user, csrf, onReset }: { user: EmbyUser; csrf: string; onReset?: () => void }) {
  const [password, setPassword] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hide = () => { setRevealed(false); setPassword(null); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);

  useEffect(() => {
    if (!revealed) return;
    const controller = new AbortController();
    setBusy(true);
    fetch("/api/users/password", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-HarborGate-CSRF": csrf },
      body: JSON.stringify({ operation: "reveal", id: user.Id }),
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.statusMessage || data.message || "Unable to reveal password");
      if (!controller.signal.aborted) setPassword(data.password);
    }).catch((error) => {
      if (!controller.signal.aborted) {
        toast.error(error instanceof Error ? error.message : "Unable to reveal password");
        setRevealed(false);
      }
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    const timer = window.setTimeout(() => { setRevealed(false); setPassword(null); }, 30_000);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [revealed, user.Id, csrf]);

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2">
        <KeyRound className="h-3.5 w-3.5 shrink-0 text-[#0F9F8F]" />
        <Input aria-label={`Password for ${user.Name}`} readOnly type={revealed && password !== null ? "text" : "password"} value={revealed && password !== null ? password : "••••••••"} className="h-8 min-w-0 rounded-lg border-slate-200 bg-slate-50 px-2.5 text-xs dark:border-slate-700 dark:bg-[#0b1f2e]" />
        {busy && revealed && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#0F9F8F]" />}
      </div>
      {user.hasSavedPassword ? <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><Checkbox checked={revealed} onCheckedChange={(value) => { setRevealed(value === true); setPassword(null); }} className="rounded border-slate-300 data-[state=checked]:bg-[#0F9F8F]" />Unhide password</label> : <p className="text-xs text-slate-500 dark:text-slate-400">Password unavailable.{onReset && <button type="button" onClick={onReset} className="ml-1 font-semibold text-[#087d71] dark:text-[#55d7c6]">Reset to save</button>}</p>}
      {revealed && <p className="text-[10px] text-slate-500">Hides automatically after 30 seconds. May be outdated if changed outside HarborGate.</p>}
    </div>
  );
}
