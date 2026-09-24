import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#eef4f6] px-5 text-[#102a43] dark:bg-[#091925] dark:text-slate-100">
      <div className="absolute right-5 top-5"><ThemeToggle /></div>
      <div className="rounded-[2rem] border border-slate-200 bg-white p-10 text-center shadow-xl shadow-slate-200/50 dark:border-slate-700 dark:bg-[#10283a] dark:shadow-none">
        <img src="/assets/harborgate-logo.png" alt="HarborGate" className="mx-auto mb-6 h-14 w-14 rounded-2xl" />
        <h1 className="mb-3 text-5xl font-semibold tracking-tight">404</h1>
        <p className="mb-6 text-slate-500 dark:text-slate-400">This harbor could not be found.</p>
        <a href="/" className="font-semibold text-[#087d71] hover:text-[#065f57] dark:text-[#55d7c6] dark:hover:text-[#80e4d8]">
          Return to HarborGate
        </a>
      </div>
    </div>
  );
};

export default NotFound;
