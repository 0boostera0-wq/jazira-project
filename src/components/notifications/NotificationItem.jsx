"use client";

import { memo } from "react";
import {
  AtSign, Bell, Check, ClipboardCheck, Heart, MailCheck, MailQuestion, MessageCircle, MessagesSquare,
  Repeat2, Sparkles, Trophy, UserPlus, UserRound,
} from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import { formatRelative } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import Avatar from "@/components/Avatar";
import { cn } from "@/components/ui/cn";
import { describe, isolateHandles, textDir } from "./model";

// Type → small badge on the avatar (colour used sparingly: meaning, not decoration).
const TYPE = {
  like: { icon: Heart, cls: "text-danger" },
  repost: { icon: Repeat2, cls: "text-green-600" },
  comment: { icon: MessageCircle, cls: "text-info" },
  follow: { icon: UserPlus, cls: "text-green-600" },
  mention: { icon: AtSign, cls: "text-info" },
  message: { icon: MessagesSquare, cls: "text-gold-600" },
  message_request: { icon: MailQuestion, cls: "text-gold-600" },
  request_accepted: { icon: MailCheck, cls: "text-green-600" },
  exam_result: { icon: ClipboardCheck, cls: "text-green-600" },
  achievement: { icon: Trophy, cls: "text-gold-600" },
  system: { icon: Sparkles, cls: "text-gold-600" },
};
const TILE_TYPES = { exam_result: "bg-green-50 text-green-600 ring-green-100", achievement: "bg-gold-50 text-gold-600 ring-gold-200/60", system: "bg-gold-50 text-gold-600 ring-gold-200/60" };
// Title/body of these come from the row's data (server-authored, any language):
// isolate them so punctuation never jumps to the wrong end inside the other script.
const DATA_TEXT = new Set(["achievement", "system"]);

function ActorAvatar({ actor, size }) {
  if (!actor || actor.anonymous) {
    return (
      <span style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-full bg-surface-3 text-ink-3">
        <UserRound size={Math.round(size * 0.5)} aria-hidden="true" />
      </span>
    );
  }
  return <Avatar src={actor.avatar_url} name={actor.full_name || ""} size={size} alt="" />;
}

function Leading({ group }) {
  const meta = TYPE[group.type] || { icon: Bell, cls: "text-ink-3" };
  if (TILE_TYPES[group.type] || !group.actors.length) {
    return (
      <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full ring-1 ring-inset", TILE_TYPES[group.type] || "bg-surface-2 text-ink-3 ring-line/10")}>
        <meta.icon size={20} aria-hidden="true" />
      </span>
    );
  }
  const [a, b] = group.actors;
  return (
    <span className="relative h-11 w-11 shrink-0">
      {b ? (
        <>
          <span className="absolute end-0 top-0 rounded-full ring-2 ring-surface"><ActorAvatar actor={b} size={30} /></span>
          <span className="absolute bottom-0 start-0 rounded-full ring-2 ring-surface"><ActorAvatar actor={a} size={30} /></span>
        </>
      ) : (
        <ActorAvatar actor={a} size={44} />
      )}
      <span className={cn("absolute -bottom-1 -end-1 grid h-5 w-5 place-items-center rounded-full bg-surface shadow-xs ring-1 ring-line/10", meta.cls)}>
        <meta.icon size={11} strokeWidth={2.4} aria-hidden="true" />
      </span>
    </span>
  );
}

/** Bold the actors phrase inside the sentence (it may sit anywhere in Arabic). */
function Sentence({ text, emphasis }) {
  if (!emphasis) return text;
  const i = text.indexOf(emphasis);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <strong className="font-medium text-ink">{emphasis}</strong>
      {text.slice(i + emphasis.length)}
    </>
  );
}

/**
 * One (possibly aggregated) notification row. The whole row is the link
 * (stretched), opening marks it read; the dot is a separate "mark as read".
 */
function NotificationItem({ group, now, onOpen, onMarkRead }) {
  const t = useT("notifications");
  const { locale } = useLocale();
  const { text, detail, emphasis } = describe(group, t, locale);
  const unread = !group.read;
  const time = formatRelative(group.created_at, locale, now);
  const kind = t(`kinds.${TYPE[group.type] ? group.type : "unknown"}`);
  const iso = DATA_TEXT.has(group.type);
  const sentence = <Sentence text={text} emphasis={emphasis} />;
  const snippetDir = group.snippet ? textDir(group.snippet) : null;

  return (
    <li className={cn("group relative flex gap-3.5 px-4 py-4 transition-colors sm:gap-4 sm:px-5", unread ? "bg-gold-50/70 hover:bg-gold-50" : "hover:bg-surface-2/60")}>
      <Leading group={group} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-[0.9375rem] leading-relaxed", unread ? "text-ink" : "text-ink-2")}>
          {group.href ? (
            <Link href={group.href} onClick={() => onOpen(group)} className="outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-gold-400">
              {iso ? <bdi>{sentence}</bdi> : sentence}
            </Link>
          ) : iso ? (
            <bdi>{sentence}</bdi>
          ) : (
            sentence
          )}
          {unread && <span className="sr-only"> · {t("item.unread")}</span>}
        </p>
        {detail && <p className="t-small mt-0.5 text-ink-3">{iso ? <bdi>{detail}</bdi> : detail}</p>}
        {group.snippet && (
          // Quote bar on the page's start side; the post keeps its own direction inside.
          <p className="t-small mt-1.5 line-clamp-2 border-s-2 border-line/15 ps-2.5 text-ink-3">
            <span dir={snippetDir} lang={snippetDir === "rtl" ? "ar" : undefined}>{isolateHandles(group.snippet)}</span>
          </p>
        )}
        <p className="t-caption mt-1.5">
          <time dateTime={group.created_at}>{time}</time>
          <span aria-hidden="true" className="mx-1.5 text-ink-4">·</span>
          {kind}
        </p>
      </div>
      {unread && (
        <button
          type="button"
          onClick={() => onMarkRead(group)}
          aria-label={t("actions.markRead")}
          title={t("actions.markRead")}
          className="relative z-10 -me-1.5 -mt-1 grid h-9 w-9 shrink-0 place-items-center self-start rounded-full text-gold-600 transition-colors hover:bg-surface hover:shadow-xs"
        >
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-gold-500 group-focus-within:hidden group-hover:hidden" />
          <Check size={16} aria-hidden="true" className="hidden group-focus-within:block group-hover:block" />
        </button>
      )}
    </li>
  );
}

export default memo(NotificationItem);
