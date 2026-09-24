import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dashboard } from "@/components/Dashboard";
import { LoginScreen } from "@/components/LoginScreen";
import { completePlexSignIn, createPlexPin, getDashboard, getRuntimeConfig, mutateUser, signIn, signOut, type DashboardData, type PlexAuthorization, type RuntimeConfig, type ServerId } from "@/lib/harborgate";

const Index = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [runtime, setRuntime] = useState<RuntimeConfig | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const dashboard = await getDashboard();
    setData(dashboard);
  }

  useEffect(() => {
    Promise.all([
      refresh().catch(() => setData(null)),
      getRuntimeConfig().then(setRuntime),
    ]).finally(() => setLoading(false));
  }, []);

  async function login(serverId: ServerId, serverUrl: string, username: string, password: string) {
    await signIn(serverId, serverUrl, username, password);
    await refresh();
  }

  async function plexLogin(): Promise<PlexAuthorization> {
    const popup = window.open("about:blank", "harborgate-plex-auth", "popup,width=720,height=760");
    try {
      const pin = await createPlexPin();
      if (popup) popup.location.href = pin.authUrl;
      else window.open(pin.authUrl, "_blank", "noopener,noreferrer");
      for (let attempt = 0; attempt < 150; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        const result = await completePlexSignIn(pin.pinId, pin.state);
        if (!result.pending) {
          popup?.close();
          return { pinId: pin.pinId, state: pin.state, servers: result.servers };
        }
      }
      throw new Error("Plex authorization timed out. Please try again.");
    } catch (error) {
      popup?.close();
      throw error;
    }
  }

  async function selectPlexServer(authorization: PlexAuthorization, machineIdentifier: string) {
    await completePlexSignIn(authorization.pinId, authorization.state, machineIdentifier);
    await refresh();
  }

  async function logout() {
    if (data) await signOut(data.csrf).catch(() => undefined);
    setData(null);
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#eaf2f5] text-[#102a43] dark:bg-[#071521] dark:text-white"><div className="text-center"><img src="/assets/harborgate-logo.png" alt="HarborGate" className="mx-auto mb-5 h-16 w-16 rounded-2xl" /><Loader2 className="mx-auto h-5 w-5 animate-spin text-[#0F9F8F] dark:text-[#55d7c6]" /><p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Securing your harbor…</p></div></div>;
  }

  if (!data) return <LoginScreen runtime={runtime} onLogin={login} onPlexLogin={plexLogin} onPlexServerSelect={selectPlexServer} />;

  return <Dashboard data={data} onRefresh={refresh} onMutate={async (body) => { await mutateUser(data.csrf, body); }} onLogout={logout} />;
};

export default Index;
