"use client";

import { memo, useState } from "react";
import { AlertCircle, Check, Copy, Crown, Hourglass, RotateCcw, CircleStop } from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import { formatDate } from "@/i18n/format";
import Button from "@/components/ui/Button";
import AssistantAvatar from "@/components/brand/AssistantAvatar";
import { cn } from "@/components/ui/cn";
import Markdown from "./Markdown";

/** One turn of the conversation. Mine = end side; the assistant = start side. */
function MessageItem({ message, onRetry, canRetry, exhausted }) {
  if (message.role === "user") return <UserMessage text={message.content} />;
  return <AssistantMessage message={message} onRetry={onRetry} canRetry={canRetry} exhausted={exhausted} />;
}

export default memo(MessageItem);

function UserMessage({ text }) {
  const t = useT("assistant");
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] sm:max-w-[80%]">
        <p className="sr-only">{t("message.you")}:</p>
        <div dir="auto" className="whitespace-pre-wrap break-words rounded-lg rounded-se-xs border border-gold-200/60 bg-gold-50 px-4 py-2.5 text-[0.98rem] leading-[1.75] text-ink">
          {text}
        </div>
      </div>
    </div>
  );
}

// A failed reply can always be retried (the server doesn't charge the same
// unanswered message twice); a message refused by the quota only once it frees up.
function AssistantMessage({ message, onRetry, canRetry, exhausted }) {
  const t = useT("assistant");
  const { status, content, error } = message;
  const pending = status === "pending";
  const streaming = status === "streaming";
  const hasText = content.trim().length > 0;

  return (
    <div className="flex gap-3">
      <AssistantAvatar size={32} status={pending || streaming ? "thinking" : undefined} className="mt-0.5" />
      <div className="min-w-0 flex-1 pt-1">
        <p className="sr-only">{t("message.assistant")}:</p>
        {pending && <Thinking label={t("message.thinking")} />}
        {hasText && <Markdown text={content} streaming={streaming} />}

        {status === "stopped" && (
          <p className="t-caption mt-2 inline-flex items-center gap-1.5">
            <CircleStop size={14} aria-hidden="true" />
            {t("message.stopped")}
          </p>
        )}

        {/* The upgrade prompt itself sits in the composer spot; here, just why it wasn't sent. */}
        {status === "error" && error === "quota" && (
          <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-gold-200/70 bg-gold-50 px-3.5 py-2.5 text-sm text-ink-2">
            <span className="inline-flex min-w-0 flex-1 basis-60 items-start gap-2">
              <Hourglass size={16} className="mt-0.5 shrink-0 text-gold-600" aria-hidden="true" />
              <span>{t("quota.notSent")}</span>
            </span>
            {canRetry && !exhausted && (
              <Button size="sm" variant="secondary" iconStart={RotateCcw} onClick={() => onRetry(message.id)}>{t("message.retry")}</Button>
            )}
          </div>
        )}
        {status === "error" && error !== "quota" && (
          <div role="alert" className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-danger/20 bg-danger-soft px-3.5 py-2.5 text-sm text-danger", hasText && "mt-3")}>
            <span className="inline-flex min-w-0 flex-1 basis-60 items-start gap-2">
              <AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{t(`errors.${error || "generic"}`)}</span>
            </span>
            {error === "signedOut" ? (
              <Button href="/sign-in?next=/assistant" size="sm" variant="secondary">{t("errors.signIn")}</Button>
            ) : canRetry && error !== "invalid" ? (
              <Button size="sm" variant="secondary" iconStart={RotateCcw} onClick={() => onRetry(message.id)}>{t("message.retry")}</Button>
            ) : null}
          </div>
        )}

        {(status === "done" || status === "stopped") && hasText && <CopyButton text={content} />}
      </div>
    </div>
  );
}

function Thinking({ label }) {
  return (
    <span role="status" className="inline-flex h-7 items-center gap-1.5" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <span key={i} aria-hidden="true" className="h-2 w-2 rounded-full bg-gold-400" style={{ animation: "jz-pulse-soft 1.1s ease-in-out infinite", animationDelay: `${i * 160}ms` }} />
      ))}
    </span>
  );
}

function CopyButton({ text }) {
  const t = useT("assistant");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };
  return (
    <div className="mt-2 flex items-center gap-1">
      <button
        type="button"
        onClick={copy}
        className="-ms-2 inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[0.8125rem] font-medium text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        {copied ? <Check size={14} aria-hidden="true" className="text-green-600" /> : <Copy size={14} aria-hidden="true" />}
        <span aria-live="polite">{copied ? t("message.copied") : t("message.copy")}</span>
      </button>
    </div>
  );
}

/** Friendly 429 state: when it frees up + the Elite path. */
export function QuotaReached({ quota, className }) {
  const t = useT("assistant");
  const { locale } = useLocale();
  const time = quota?.resetsAt ? formatDate(quota.resetsAt, locale, { hour: "numeric", minute: "2-digit" }) : null;
  return (
    <div className={cn("rounded-lg border border-gold-200/70 bg-gold-50 p-4 sm:flex sm:items-center sm:gap-4", className)}>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{t("quota.exhaustedTitle")}</p>
        <p className="t-small mt-1 text-ink-3">
          {time ? t("quota.exhaustedBody", { time }) : t("quota.exhaustedBodyLater")}
        </p>
      </div>
      <Button href="/subscriptions" variant="gold" size="sm" iconStart={Crown} className="mt-3 shrink-0 sm:mt-0">
        {t("quota.upgrade")}
      </Button>
    </div>
  );
}
