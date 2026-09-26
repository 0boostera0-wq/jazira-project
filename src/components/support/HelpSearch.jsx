"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useT } from "@/i18n/client";
import Button from "@/components/ui/Button";

const SUGGESTIONS = ["password", "payment", "deleteAccount", "assistant"];

/** Support-center search: hands the query to the FAQ page, which filters instantly. */
export default function HelpSearch() {
  const t = useT("support");
  const router = useRouter();
  const [q, setQ] = useState("");

  const go = (value) => {
    const v = value.trim().slice(0, 80);
    router.push(v ? `/faq?q=${encodeURIComponent(v)}` : "/faq");
  };

  return (
    <div>
      <form
        role="search"
        onSubmit={(e) => { e.preventDefault(); go(q); }}
        className="flex items-center gap-2 rounded-full border border-line/20 bg-surface p-1.5 shadow-sm transition-[border-color,box-shadow] duration-fast focus-within:border-gold-400 focus-within:shadow-[0_0_0_3px_rgb(var(--c-gold-400)/0.18)]"
      >
        <label htmlFor="help-search" className="sr-only">{t("center.search.label")}</label>
        <Search size={20} className="ms-3 shrink-0 text-ink-4" aria-hidden="true" />
        <input
          id="help-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("center.search.placeholder")}
          maxLength={80}
          autoComplete="off"
          enterKeyHint="search"
          className="h-11 min-w-0 flex-1 bg-transparent text-[1rem] text-ink placeholder:text-ink-4 focus:shadow-none focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        <Button type="submit" className="shrink-0">{t("center.search.submit")}</Button>
      </form>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="t-small text-ink-3">{t("center.search.suggestions")}</span>
        {SUGGESTIONS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => go(t(`center.search.terms.${k}`))}
            className="inline-flex h-10 items-center rounded-full border border-line/15 bg-surface/80 px-3.5 text-sm text-ink-2 transition-colors hover:border-line/30 hover:bg-surface hover:text-ink"
          >
            {t(`center.search.terms.${k}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
