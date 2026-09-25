"use client";

import { Languages } from "lucide-react";
import { usePreferences } from "@/context/PreferencesProvider";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/components/ui/cn";

/** Switches between العربية and English on the same page (keeps path & query). */
export default function LanguageSwitch({ variant = "icon", className }) {
  const { setLanguage } = usePreferences();
  const { locale } = useLocale();
  const t = useT("common");
  const target = locale === "ar" ? "en" : "ar";
  const label = t(`languages.${target}`);

  if (variant === "text") {
    return (
      <button
        type="button"
        onClick={() => setLanguage(target)}
        lang={target}
        className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink", className)}
      >
        <Languages size={16} aria-hidden="true" />
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setLanguage(target)}
      aria-label={`${t("a11y.switchLanguage")}: ${label}`}
      title={label}
      className={cn("inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-full px-2.5 text-[0.8125rem] font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink", className)}
    >
      <Languages size={17} aria-hidden="true" />
      <span lang={target}>{target === "en" ? "EN" : "ع"}</span>
    </button>
  );
}
