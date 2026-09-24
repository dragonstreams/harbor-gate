import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle({ inverted = false }: { inverted?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "light" ? "dark" : "light";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
      className={inverted ? "h-10 w-10 rounded-xl text-slate-200 hover:bg-white/10 hover:text-white" : "h-10 w-10 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-[#0F9F8F] dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-[#55d7c6]"}
    >
      {theme === "light" ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
    </Button>
  );
}
