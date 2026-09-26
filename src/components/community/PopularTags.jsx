"use client";

import { useEffect, useState } from "react";
import { Hash } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { STARTER_TOPICS, tagLabel } from "./topics";
import { useApi } from "./context";
import { useMediaQuery } from "./useMediaQuery";

/**
 * Most-used hashtags with their real post counts. `current` highlights the
 * tag page you're on. With no active tags yet (or counts unavailable) it
 * becomes "Start with a subject": the curated starter topics as plain links,
 * never with invented numbers. `gate` (a media query) keeps a copy that CSS
 * hides from fetching until the query matches (see WhoToFollow).
 */
export default function PopularTags({ source, current = null, limit = 8, gate = null, className }) {
  const t = useT("community");
  const { locale } = useLocale();
  const api = useApi(source);
  const [state, setState] = useState({ status: "loading", items: [] });
  const gateMatches = useMediaQuery(gate || "all");
  const enabled = !gate || gateMatches;

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    api.getPopularTags({ limit })
      .then((res) => alive && setState({ status: res.available ? "ready" : "unavailable", items: res.items || [] }))
      .catch(() => alive && setState({ status: "unavailable", items: [] }));
    return () => { alive = false; };
  }, [api, limit, enabled]);

  const max = Math.max(1, ...state.items.map((x) => x.post_count || 0));
  const starters = state.status !== "loading" && !state.items.length;

  return (
    <section aria-labelledby="pt-title" className={cn("surface p-5", className)}>
      <h2 id="pt-title" className="t-h4">{starters ? t("rail.topics.start.title") : t("rail.topics.title")}</h2>
      <p className="t-caption mt-0.5">
        {starters ? t(state.status === "unavailable" ? "rail.topics.start.unavailable" : "rail.topics.start.empty") : t("rail.topics.subtitle")}
      </p>
      {state.status === "loading" ? (
        <div className="mt-4 space-y-3" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-9" rounded="md" />)}
        </div>
      ) : starters ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {STARTER_TOPICS.map((s) => (
            <li key={s.id}>
              <Link
                href={`/tags/${encodeURIComponent(s.tag)}`}
                aria-current={current === s.tag ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-1 rounded-full border px-3 text-sm transition-colors duration-fast",
                  current === s.tag ? "border-gold-300 bg-gold-50 font-medium text-ink" : "border-line/15 text-ink-2 hover:border-line/30 hover:text-ink"
                )}
              >
                <Hash size={13} aria-hidden="true" className="text-gold-600" />
                {t(`topics.${s.id}`)}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ol className="mt-3 space-y-0.5">
          {state.items.map((x) => {
            const active = current === x.tag;
            return (
              <li key={x.tag}>
                <Link
                  href={`/tags/${encodeURIComponent(x.tag)}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-2.5 overflow-hidden rounded-sm px-2.5 pb-3 pt-2 transition-colors duration-fast",
                    active ? "bg-gold-50" : "hover:bg-surface-2"
                  )}
                >
                  <span aria-hidden="true" className="absolute inset-x-2.5 bottom-1.5 h-[3px] overflow-hidden rounded-full bg-surface-3/70">
                    <span className="block h-full rounded-full bg-gold-300" style={{ width: `${Math.max(4, Math.round(((x.post_count || 0) / max) * 100))}%` }} />
                  </span>
                  <Hash size={14} aria-hidden="true" className="relative shrink-0 text-gold-600" />
                  <span className="relative min-w-0 flex-1 truncate text-start text-sm font-medium text-ink">
                    <bdi>{tagLabel(t, x.tag, locale)}</bdi>
                  </span>
                  <span className="relative shrink-0 text-xs text-ink-3">{t("rail.topics.count", { count: x.post_count || 0 })}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
