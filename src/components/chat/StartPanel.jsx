"use client";

import { ArrowLeft, MessageCircle } from "lucide-react";
import { useT } from "@/i18n/client";
import Avatar from "@/components/Avatar";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import EliteBadge from "@/components/subscriptions/EliteBadge";
import { textProps } from "@/components/community/text";
import { displayName } from "./ConversationRow";

/**
 * /chat?to=<member> when there is no conversation with them yet. Nothing is
 * written until the member presses "Start conversation": a link alone must
 * never create a conversation or touch a message request (start_conversation()
 * would accept a request the visitor had ignored).
 */
export default function StartPanel({ other, busy, error, onStart, onCancel }) {
  const t = useT("chat");
  const name = displayName(other, t);
  const inText = `⁨${name}⁩`; // isolated inside the sentence (FSI … PDI)
  return (
    <section aria-labelledby="chat-start-title" className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-line/10 px-2 py-2 md:hidden">
        <Button variant="ghost" size="icon" onClick={onCancel} aria-label={t("thread.back")}>
          <ArrowLeft size={20} className="flip-rtl" aria-hidden="true" />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-surface-2/40 p-6 sm:p-8">
        <div className="w-full max-w-md text-center">
          <span className="inline-flex rounded-full ring-4 ring-surface">
            <Avatar src={other?.avatar_url} name={name} alt="" size={72} />
          </span>
          <p className="mt-3 flex items-center justify-center gap-1.5 font-bold text-ink">
            <span {...textProps(name, "truncate")}>{name}</span>
            {other?.is_elite && other?.show_elite_badge !== false && <EliteBadge size="xs" iconOnly />}
          </p>
          {other?.username && <p dir="ltr" className="ltr t-caption">@{other.username}</p>}
          <h2 id="chat-start-title" className="t-h3 mt-5">{t("start.title", { name: inText })}</h2>
          <p className="t-small mx-auto mt-1.5 max-w-sm text-ink-3">{t("start.body", { name: inText })}</p>
          {error && <Alert tone="warning" className="mt-5 text-start">{error}</Alert>}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button iconStart={MessageCircle} onClick={onStart} loading={busy}>{t("start.cta")}</Button>
            <Button variant="ghost" onClick={onCancel} disabled={busy}>{t("start.cancel")}</Button>
          </div>
        </div>
      </div>
    </section>
  );
}
