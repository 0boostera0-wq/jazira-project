"use client";

import { Moon, Sun } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useT } from "@/i18n/client";
import { cn } from "@/components/ui/cn";

export default function ThemeToggle({ className }) {
  const { isDark, toggleTheme, hydrated } = useApp();
  const t = useT("common");
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={t("a11y.toggleTheme")}
      aria-pressed={hydrated ? isDark : undefined}
      className={cn("grid h-10 w-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink", className)}
    >
      {/* Both icons rendered; CSS picks one so SSR and first paint agree. */}
      <Sun size={18} className="hidden dark:block" aria-hidden="true" />
      <Moon size={18} className="block dark:hidden" aria-hidden="true" />
    </button>
  );
}
