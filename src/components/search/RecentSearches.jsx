"use client";

import { History, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/components/ui/cn";
import Skeleton from "@/components/ui/Skeleton";
import { textProps } from "@/components/community/text";

/**
 * "Remove “q” from history" as the button's text (screen readers only), with
 * the query in its own lang-tagged run — an aria-label string can't say that
 * an Arabic query sits inside the English sentence (or the reverse).
 */
function RemoveLabel({ t, q }) {
  const MARK = "\uE000"; // private-use placeholder, never in a query
  const [before, after = ""] = t("recent.remove", { query: MARK }).split(MARK);
  return (
    <span className="sr-only">
      {before}
      <bdi {...textProps(q)}>{q}</bdi>
      {after}
    </span>
  );
}

/**
 * Recent searches (this device only). `variant="card"` for the desktop rail,
 * `variant="chips"` for the top of the page on phones.
 */
export default function RecentSearches({ items, ready, onPick, onRemove, onClear, variant = "card", className }) {
  const t = useT("search");

  if (variant === "chips") {
    if (!ready || !items.length) return null;
    return (
      <section aria-labelledby="jz-recent-chips" className={className}>
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h2 id="jz-recent-chips" className="flex items-center gap-2 text-[0.9375rem] font-bold text-ink">
            <History size={16} aria-hidden="true" className="text-gold-600" />
            {t("recent.title")}
          </h2>
          <button type="button" onClick={onClear} className="h-9 rounded-full px-2 text-sm font-medium text-ink-3 hover:text-ink">
            {t("recent.clear")}
          </button>
        </div>
        <ul className="flex flex-wrap gap-2">
          {items.map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => onPick(q)}
                className="inline-flex h-11 max-w-[16rem] items-center gap-2 rounded-full border border-line/15 bg-surface px-3.5 text-sm text-ink-2 shadow-xs transition-colors hover:bg-surface-2 hover:text-ink focus-visible:[box-shadow:var(--ring)] sm:h-10"
              >
                <History size={14} aria-hidden="true" className="shrink-0 text-ink-4" />
                <span {...textProps(q, "truncate")}>{q}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section aria-labelledby="jz-recent" className={cn("surface p-4 sm:p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="jz-recent" className="flex items-center gap-2 text-[0.9375rem] font-bold text-ink">
          <History size={16} aria-hidden="true" className="text-gold-600" />
          {t("recent.title")}
        </h2>
        {ready && items.length > 0 && (
          <button type="button" onClick={onClear} className="h-8 rounded-full px-2 text-sm font-medium text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
            {t("recent.clear")}
          </button>
        )}
      </div>
      {!ready ? (
        <div className="mt-4 space-y-3" aria-hidden="true">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : items.length ? (
        <ul className="-mx-2 mt-3 space-y-0.5">
          {items.map((q) => (
            <li key={q} className="group flex items-center gap-1 rounded-md transition-colors hover:bg-surface-2">
              <button type="button" onClick={() => onPick(q)} className="flex min-h-10 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 text-start text-sm text-ink-2 hover:text-ink">
                <History size={15} aria-hidden="true" className="shrink-0 text-ink-4" />
                <span {...textProps(q, "truncate")}>{q}</span>
              </button>
              <button
                type="button"
                onClick={() => onRemove(q)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-4 opacity-70 transition hover:bg-surface-3 hover:text-ink group-hover:opacity-100"
              >
                <X size={15} aria-hidden="true" />
                <RemoveLabel t={t} q={q} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-small mt-2 text-ink-3">{t("recent.empty")}</p>
      )}
      <p className="t-caption mt-3 border-t border-line/10 pt-3">{t("recent.note")}</p>
    </section>
  );
}
