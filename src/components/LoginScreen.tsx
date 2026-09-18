import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, Server, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ServerId } from "@/lib/harborgate";

interface LoginScreenProps {
  onLogin: (serverId: ServerId, username: string, password: string) => Promise<void>;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [serverId, setServerId] = useState<ServerId>("emby");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onLogin(serverId, username, password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0b1f33] text-white">
      <img src="/assets/harborgate-login-bg.png" alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
      <div className="absolute inset-0 bg-[#0b1f33]/35" />
      <div className="relative z-10 mx-auto grid min-h-screen max-w-7xl items-center px-5 py-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:px-12">
        <section className="order-2 hidden lg:block">
          <div className="mb-8 flex items-center gap-3">
            <div className="rounded-2xl bg-white/10 p-2 ring-1 ring-white/15 backdrop-blur">
              <img src="/assets/harborgate-logo.png" alt="HarborGate" className="h-12 w-12 rounded-xl" />
            </div>
            <span className="text-xl font-semibold tracking-tight">HarborGate</span>
          </div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-[#55d7c6]">Secure media administration</p>
          <h1 className="max-w-xl text-5xl font-semibold leading-[1.08] tracking-[-0.04em]">Your media community,<br />safely managed.</h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">Manage Emby and Jellyfin profiles, access policies, and account lifecycles from one calm, secure workspace.</p>
          <div className="mt-10 flex gap-6 text-sm text-slate-300">
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#55d7c6]" /> Credentials stay server-side</span>
            <span className="flex items-center gap-2"><Server className="h-4 w-4 text-[#55d7c6]" /> Direct server connection</span>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md lg:order-1 lg:mx-0">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/assets/harborgate-logo.png" alt="HarborGate" className="h-12 w-12 rounded-2xl" />
            <div><p className="text-lg font-semibold">HarborGate</p><p className="text-xs text-slate-400">Secure control panel</p></div>
          </div>
          <div className="rounded-[2rem] border border-white/15 bg-white p-6 text-[#102a43] shadow-2xl shadow-[#06121f]/40 sm:p-9">
            <div className="mb-8 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e7f8f5] text-[#087d71]"><LockKeyhole className="h-5 w-5" /></div>
            <h2 className="text-3xl font-semibold tracking-[-0.035em]">Welcome back</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Choose a server and sign in with its administrator account.</p>
            <form onSubmit={submit} className="mt-8 space-y-5">
              <fieldset className="space-y-2"><legend className="text-sm font-medium">Media server</legend><div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">{(["emby", "jellyfin"] as ServerId[]).map((id) => <button key={id} type="button" onClick={() => { setServerId(id); setError(""); }} className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${serverId === id ? "bg-white text-[#087d71] shadow-sm" : "text-slate-500 hover:text-slate-800"}`}><span className={`mr-2 inline-block h-2 w-2 rounded-full ${id === "emby" ? "bg-emerald-500" : "bg-violet-500"}`} />{id === "emby" ? "Emby" : "Jellyfin"}</button>)}</div></fieldset>
              <div className="space-y-2"><Label htmlFor="username">{serverId === "emby" ? "Emby" : "Jellyfin"} username</Label><Input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required className="h-12 rounded-xl border-slate-200 bg-slate-50 px-4 focus-visible:ring-[#0F9F8F]" placeholder="Administrator" /></div>
              <div className="space-y-2"><Label htmlFor="password">Password</Label><div className="relative"><Input id="password" value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" required className="h-12 rounded-xl border-slate-200 bg-slate-50 px-4 pr-12 focus-visible:ring-[#0F9F8F]" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
              {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              <Button disabled={busy} className="h-12 w-full rounded-xl bg-[#0F9F8F] font-semibold text-white shadow-lg shadow-teal-700/15 hover:bg-[#0b887b]">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{busy ? "Connecting…" : "Sign in securely"}<ArrowRight className="ml-2 h-4 w-4" /></Button>
            </form>
            <p className="mt-6 text-center text-xs leading-5 text-slate-400">Your credentials are sent through HarborGate's secure server proxy and are never stored in the browser.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
