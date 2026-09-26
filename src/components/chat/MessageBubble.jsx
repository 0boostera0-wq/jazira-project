"use client";

/* eslint-disable @next/next/no-img-element */
import { memo, useState } from "react";
import { AlertCircle, Ban, Check, CheckCheck, Clock3, Copy, MoreHorizontal, RotateCcw, Trash2, X } from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import { formatDate } from "@/i18n/format";
import { cn } from "@/components/ui/cn";
import { canDeleteForAll, tickState } from "./messaging";

const TICKS = {
  sending: { Icon: Clock3, cls: "text-ink-3" },
  sent: { Icon: Check, cls: "text-ink-3" },
  delivered: { Icon: CheckCheck, cls: "text-ink-3" },
  read: { Icon: CheckCheck, cls: "text-green-600" },
  failed: { Icon: AlertCircle, cls: "text-danger" },
};

const safeMedia = (url) => typeof url === "string" && /^https:\/\//i.test(url);

/**
 * One message. Mine sit at the end side (left in Arabic, right in English),
 * theirs at the start. Tap (touch) or the ⋯ button (mouse) reveals actions.
 */
function MessageBubble({ item, me, selected, onSelect, onDelete, onResend, onDiscard }) {
  const t = useT("chat");
  const { locale } = useLocale();
  const [copied, setCopied] = useState(false);
  const { message: m, mine, groupStart, groupEnd } = item;
  const deleted = m.deleted_for_all;
  const tick = mine ? tickState(m) : null;
  const deletable = canDeleteForAll(m, me);
  const actionable = !deleted && !m.pending && !m.failed;
  const clock = formatDate(m.created_at, locale, { hour: "numeric", minute: "2-digit" });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.content || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const onBubbleClick = () => {
    if (!actionable) return;
    try {
      if (window.matchMedia("(hover: none)").matches) onSelect(selected ? null : m.id);
    } catch {}
  };

  const TickIcon = tick ? TICKS[tick].Icon : null;

  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start", groupStart ? "mt-3" : "mt-1")}>
      <div className={cn("group flex max-w-[86%] items-center gap-1 sm:max-w-[72%]", mine && "flex-row-reverse")}>
        <div
          onClick={onBubbleClick}
          className={cn(
            "relative min-w-0 rounded-lg px-3.5 pb-1.5 pt-2 text-[0.9688rem] leading-relaxed",
            deleted
              ? "border border-dashed border-line/25 bg-transparent text-ink-3"
              : mine
                ? "bg-gold-100 text-ink"
                : "border border-line/15 bg-surface text-ink shadow-xs",
            groupEnd && (mine ? "rounded-ee-xs" : "rounded-es-xs"),
            m.failed && "ring-1 ring-danger/40",
            selected && "ring-2 ring-gold-300"
          )}
        >
          {deleted ? (
            <p className="flex items-center gap-1.5 text-sm italic">
              <Ban size={14} aria-hidden="true" />
              {t("thread.deleted")}
            </p>
          ) : (
            <>
              {m.media_url && m.media_type === "image" && safeMedia(m.media_url) ? (
                <img src={m.media_url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="mb-1.5 max-h-72 w-full max-w-[260px] rounded-md object-cover" />
              ) : m.media_url ? (
                <p className="mb-1 text-sm italic text-ink-3">{t("thread.attachment")}</p>
              ) : null}
              {m.content && <p dir="auto" className="whitespace-pre-wrap break-words">{m.content}</p>}
            </>
          )}
          <span className="mt-0.5 flex items-center justify-end gap-1 text-[0.75rem] leading-none text-ink-3">
            <time dateTime={m.created_at} className="num">{clock}</time>
            {TickIcon && (
              <span title={t(`thread.status.${tick}`)} className={cn("inline-flex", TICKS[tick].cls)}>
                <TickIcon size={14} aria-hidden="true" />
                <span className="sr-only">{t(`thread.status.${tick}`)}</span>
              </span>
            )}
          </span>
        </div>
        {actionable && (
          <button
            type="button"
            onClick={() => onSelect(selected ? null : m.id)}
            aria-label={t("thread.actions.label")}
            aria-expanded={selected}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 opacity-0 transition-opacity hover:bg-surface-2 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:hidden"
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {selected && actionable && (
        <div className="animate-fade mt-1.5 flex items-center gap-1 rounded-full border border-line/15 bg-surface p-1 shadow-sm">
          <button type="button" onClick={copy} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium text-ink-2 hover:bg-surface-2">
            <Copy size={14} aria-hidden="true" />
            {copied ? t("thread.actions.copied") : t("thread.actions.copy")}
          </button>
          {deletable && (
            <button type="button" onClick={() => onDelete(m)} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium text-danger hover:bg-danger-soft">
              <Trash2 size={14} aria-hidden="true" />
              {t("thread.actions.deleteForAll")}
            </button>
          )}
        </div>
      )}

      {m.failed && (
        <div className="mt-1 flex items-center gap-1 text-[0.8125rem]">
          <span className="text-danger">{t("thread.status.failed")}</span>
          <span aria-hidden="true" className="text-ink-4">·</span>
          <button type="button" onClick={() => onResend(m)} className="inline-flex h-8 items-center gap-1 rounded-full px-2 font-medium text-ink-2 hover:bg-surface-2">
            <RotateCcw size={13} aria-hidden="true" />
            {t("thread.retrySend")}
          </button>
          <button type="button" onClick={() => onDiscard(m)} className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-ink-3 hover:bg-surface-2">
            <X size={13} aria-hidden="true" />
            {t("thread.discard")}
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(MessageBubble);
