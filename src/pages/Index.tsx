import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dashboard } from "@/components/Dashboard";
import { LoginScreen } from "@/components/LoginScreen";
import { getDashboard, mutateUser, signIn, signOut, type DashboardData, type ServerId } from "@/lib/harborgate";

const Index = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const dashboard = await getDashboard();
    setData(dashboard);
  }

  useEffect(() => {
    refresh().catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

  async function login(serverId: ServerId, username: string, password: string) {
    await signIn(serverId, username, password);
    await refresh();
  }

  async function logout() {
    if (data) await signOut(data.csrf).catch(() => undefined);
    setData(null);
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#0b2135] text-white"><div className="text-center"><img src="/assets/harborgate-logo.png" alt="HarborGate" className="mx-auto mb-5 h-16 w-16 rounded-2xl" /><Loader2 className="mx-auto h-5 w-5 animate-spin text-[#55d7c6]" /><p className="mt-3 text-sm text-slate-400">Securing your harbor…</p></div></div>;
  }

  if (!data) return <LoginScreen onLogin={login} />;

  return <Dashboard data={data} onRefresh={refresh} onMutate={async (body) => { await mutateUser(data.csrf, body); }} onLogout={logout} />;
};

export default Index;
