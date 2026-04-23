import {
  SunIcon,
  MoonIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "../../context/ThemeContext";

export function Header() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
      <div className="header-accent h-0.5" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-display tracking-tight text-primary">
            ddx.care
          </span>
          <span className="hidden sm:inline text-sm text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-700 pl-3">
            Differential Diagnosis
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700">
            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              Research Demo — NOT HIPAA Compliant
            </span>
            <span className="sm:hidden">Not Clinical Use</span>
          </span>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? (
              <MoonIcon className="h-5 w-5 text-slate-600" />
            ) : (
              <SunIcon className="h-5 w-5 text-slate-300" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
