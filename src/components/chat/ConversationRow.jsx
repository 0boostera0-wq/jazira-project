"use client";

import { memo } from "react";
import { useT, useLocale } from "@/i18n/client";
import { formatDate } from "@/i18n/format";
import Avatar from "@/components/Avatar";
import Button from "@/components/ui/Button";
import EliteBadge from "@/components/subscriptions/EliteBadge";
import { cn } from "@/components/ui/cn";
import { dirOfText, isUnread, listTimeFormat, previewOf } from "./messaging";

// Truncated one-liners take the text's own direction (so an English line in
// the Arabic UI is cut at its end) but stay aligned to the UI's start edge.
// The alignment must come from the UI locale: `text-start` or the rtl:/ltr:
// variants would follow the span's own dir.
function useLine() {
  const { isRTL } = useLocale();
  return cn("truncate", isRTL ? "text-right" : "text-left");
}

export function displayName(profile, t) {
  return profile?.full_name || t("unknownUser");
}

export function ListTime({ iso, className }) {
  const { locale } = useLocale();
  const f = iso ? listTimeFormat(iso) : null;
  if (!f) return null;
  return (
    <time dateTime={iso} className={cn("shrink-0 text-xs text-ink-3", className)}>
      {formatDate(iso, locale, f.opts)}
    </time>
  );
}

/** "You: " stays at the UI's start; the message text truncates in its own direction. */
function Preview({ conv, me, className }) {
  const t = useT("chat");
  const LINE = useLine();
  const p = previewOf(conv.last, me);
  const declined = conv.isRequest && conv.request?.status === "rejected";
  let body;
  if (declined) body = <span className={cn(LINE, "text-ink-3")}>{t("list.declined")}</span>;
  else if (p.kind === "none") body = <span className={cn(LINE, "text-ink-3")}>{conv.isRequest ? t("list.requestSent") : t("list.noMessages")}</span>;
  else if (p.kind === "deleted") body = <span className={cn(LINE, "italic text-ink-3")}>{t("list.deleted")}</span>;
  else if (p.kind === "media") body = <span className={LINE}>{t("list.attachment")}</span>;
  else body = <span dir={dirOfText(p.text)} className={cn(LINE, "min-w-0")}>{p.text}</span>;
  return (
    <span className={cn("flex min-w-0 flex-1 text-sm", className)}>
      {p.mine && !declined && p.kind !== "none" && <span className="shrink-0 whitespace-pre">{t("list.you")}</span>}
      {body}
    </span>
  );
}

/** Inbox row: avatar · name (+ Elite) · time · preview · unread dot / request state. */
function ConversationRowBase({ conv, me, active, onOpen }) {
  const t = useT("chat");
  const LINE = useLine();
  const name = displayName(conv.other, t);
  const unread = isUnread(conv, me);
  const pendingOut = conv.isRequest && conv.request?.status === "pending" && conv.request?.requesterId === me;
  return (
    <button
      type="button"
      onClick={() => onOpen(conv)}
      aria-current={active ? "true" : undefined}
      className={cn(
        "relative flex w-full items-center gap-3 px-4 py-3 text-start transition-colors sm:px-5",
        active ? "bg-gold-50" : "hover:bg-surface-2/70"
      )}
    >
      {active && <span aria-hidden="true" className="absolute inset-y-2 start-0 w-[3px] rounded-e-full bg-gold-500" />}
      <Avatar src={conv.other?.avatar_url} name={name} alt="" size={46} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span dir={dirOfText(name)} className={cn(LINE, "text-[0.9375rem]", unread ? "font-bold text-ink" : "font-medium text-ink")}>{name}</span>
          {conv.other?.is_elite && conv.other?.show_elite_badge !== false && <EliteBadge size="xs" iconOnly />}
          <ListTime iso={conv.last?.created_at || conv.createdAt} className="ms-auto" />
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <Preview conv={conv} me={me} className={unread ? "font-medium text-ink-2" : "text-ink-3"} />
          {pendingOut && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-3">{t("list.requestSent")}</span>}
          {unread && (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold-500 ring-2 ring-gold-100">
              <span className="sr-only">{t("list.unread")}</span>
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export const ConversationRow = memo(ConversationRowBase);

/** Incoming request row: who, first words, accept / ignore. */
function RequestRowBase({ req, active, busy, onOpen, onAccept, onIgnore }) {
  const t = useT("chat");
  const LINE = useLine();
  const name = displayName(req.other, t);
  const p = previewOf(req.last, null);
  return (
    <div className={cn("px-4 py-3 transition-colors sm:px-5", active ? "bg-gold-50" : "hover:bg-surface-2/70")}>
      <button type="button" onClick={() => onOpen(req)} className="flex w-full items-center gap-3 text-start">
        <Avatar src={req.other?.avatar_url} name={name} alt="" size={46} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span dir={dirOfText(name)} className={cn(LINE, "text-[0.9375rem] font-medium text-ink")}>{name}</span>
            {req.other?.is_elite && req.other?.show_elite_badge !== false && <EliteBadge size="xs" iconOnly />}
            <ListTime iso={req.last?.created_at || req.createdAt} className="ms-auto" />
          </span>
          <span dir={p.kind === "text" ? dirOfText(p.text) : undefined} className={cn(LINE, "mt-0.5 block text-sm text-ink-3")}>
            {p.kind === "text" ? p.text : t("requests.wantsToMessage")}
          </span>
        </span>
      </button>
      <div className="mt-2.5 flex gap-2 ps-[58px]">
        <Button size="sm" onClick={() => onAccept(req)} loading={busy === "accept"} disabled={Boolean(busy)} className="h-8 px-4">{t("requests.accept")}</Button>
        <Button size="sm" variant="secondary" onClick={() => onIgnore(req)} loading={busy === "ignore"} disabled={Boolean(busy)} className="h-8 px-4">{t("requests.ignore")}</Button>
      </div>
    </div>
  );
}

export const RequestRow = memo(RequestRowBase);
