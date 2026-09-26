"use client";

import { useMemo } from "react";
import { History, MessageSquareText, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import { formatDate } from "@/i18n/format";
import { bucketSessions } from "@/lib/chatStore";
import { textDirection } from "./markdown-parser";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { textProps } from "@/components/community/text";

function timeLabel(iso, bucket, locale) {
  if (bucket === "today" || bucket === "yesterday") return formatDate(iso, locale, { hour: "numeric", minute: "2-digit" });
  if (bucket === "week") return formatDate(iso, locale, { weekday: "long" });
  return formatDate(iso, locale, { day: "numeric", month: "short" });
}

/**
 * Past conversations grouped by day. `variant="rail"` fills the desktop rail
 * (list scrolls inside); `variant="sheet"` flows inside the mobile sheet.
 */
export default function HistoryPanel({ sessions, activeId, onOpen, onNew, onDelete, isLoaded, isSignedIn, variant = "rail", className }) {
  const t = useT("assistant");
  const { locale, isRTL } = useLocale();
  const groups = useMemo(() => bucketSessions(sessions.items), [sessions.items]);
  const rail = variant === "rail";

  let body;
  if (!isLoaded || sessions.status === "loading" || (isSignedIn && sessions.status === "idle")) {
    body = (
      <div aria-hidden="true" className="space-y-1 px-2 py-2">
        <Skeleton className="mx-2 mb-3 mt-1 h-3 w-16" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-md px-2 py-2.5">
            <Skeleton className="h-4 flex-1" style={{ maxWidth: `${88 - i * 7}%` }} />
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
    );
  } else if (!isSignedIn) {
    body = <PanelNote icon={History} text={t("history.guest")} />;
  } else if (sessions.status === "unavailable") {
    body = <PanelNote icon={History} text={t("history.unavailable")} />;
  } else if (sessions.status === "error") {
    body = (
      <PanelNote icon={History} text={t("history.error")}>
        <Button size="sm" variant="secondary" iconStart={RotateCcw} onClick={sessions.reload} className="mt-3">{t("history.retry")}</Button>
      </PanelNote>
    );
  } else if (!sessions.items.length) {
    body = <PanelNote icon={MessageSquareText} title={t("history.empty")} text={t("history.emptyBody")} />;
  } else {
    body = (
      <nav aria-label={t("history.title")} className="px-2 pb-3">
        {groups.map((g) => (
          <div key={g.key} className="mt-2 first:mt-1">
            <h3 className="px-2 pb-1 pt-2 text-xs font-medium text-ink-3">{t(`history.groups.${g.key}`)}</h3>
            <ul className="space-y-0.5">
              {g.items.map((s) => {
                const active = s.id === activeId;
                const title = s.title || t("history.untitled");
                return (
                  <li key={s.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onOpen(s)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex min-h-[44px] w-full items-center gap-2 rounded-md py-2 pe-11 ps-2.5 text-start transition-colors",
                        active ? "bg-gold-50 text-ink ring-1 ring-inset ring-gold-200/70" : "text-ink-2 hover:bg-surface-2"
                      )}
                    >
                      <span {...textProps(title, cn("min-w-0 flex-1 truncate text-sm", isRTL ? "text-right" : "text-left"))} dir={textDirection(title)}>{title}</span>
                      <span className="t-caption shrink-0 text-xs">{timeLabel(s.lastAt, g.key, locale)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(s)}
                      aria-label={`${t("history.delete")}: ${title}`}
                      title={t("history.delete")}
                      className="absolute end-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-ink-3 opacity-100 transition-[opacity,color,background-color] hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {sessions.nextCursor && (
          <div className="px-1 pt-3">
            <Button size="sm" variant="ghost" block loading={sessions.loadingMore} onClick={sessions.loadMore}>{t("history.loadMore")}</Button>
          </div>
        )}
      </nav>
    );
  }

  return (
    <section aria-labelledby={`jz-history-${variant}`} className={cn(rail ? "surface-flat flex min-h-0 flex-col" : "", className)}>
      <div className={cn("flex items-center justify-between gap-2", rail ? "border-b border-line/10 px-4 py-3" : "mb-1")}>
        <h2 id={`jz-history-${variant}`} className="text-sm font-medium text-ink">{t("history.title")}</h2>
        {isSignedIn && (
          <Button size="sm" variant="ghost" iconStart={Plus} onClick={onNew} className="-me-2 h-8 px-3">{t("history.new")}</Button>
        )}
      </div>
      <div className={cn(rail && "min-h-0 flex-1 overflow-y-auto overscroll-contain", !rail && "-mx-2")}>{body}</div>
    </section>
  );
}

function PanelNote({ icon: Icon, title, text, children }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-md bg-surface-2 text-ink-3">
        <Icon size={20} aria-hidden="true" />
      </span>
      {title && <p className="mt-3 text-sm font-medium text-ink">{title}</p>}
      <p className={cn("t-caption max-w-[240px]", title ? "mt-1" : "mt-3")}>{text}</p>
      {children}
    </div>
  );
}
