"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Info } from "lucide-react";
import { useT } from "@/i18n/client";
import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";
import MessageItem from "./MessageItem";

/**
 * Scrollable conversation. Sticks to the newest message while the reader is
 * at the bottom; if they scroll up to re-read, streaming never yanks them
 * down — a "latest" button appears instead.
 */
export default function Conversation({ messages, busy, exhausted = false, onRetry, welcome, loading, truncated }) {
  const t = useT("assistant");
  const scroller = useRef(null);
  const stick = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const lastCount = useRef(messages.length);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    stick.current = near;
    setAtBottom(near);
  };

  // A new turn by the member always scrolls to the bottom.
  useLayoutEffect(() => {
    const grew = messages.length > lastCount.current;
    lastCount.current = messages.length;
    const el = scroller.current;
    if (!el) return;
    if (!messages.length) return; // the welcome state starts at the top
    if (grew && messages[messages.length - 2]?.role === "user") stick.current = true;
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Opening a stored conversation starts at its end.
  useEffect(() => {
    if (!loading && messages.length) {
      stick.current = true;
      const el = scroller.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
    // only when a load finishes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const jump = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  const lastAssistant = messages.length ? messages[messages.length - 1] : null;

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain px-4 sm:px-6">
        {loading ? (
          <ThreadSkeleton />
        ) : messages.length === 0 ? (
          <div className="flex min-h-full flex-col"><div className="my-auto">{welcome}</div></div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-6 py-6 sm:py-8">
            {truncated && (
              <p className="t-caption flex items-center justify-center gap-1.5 text-center">
                <Info size={14} aria-hidden="true" />
                {t("history.truncated")}
              </p>
            )}
            {messages.map((m) => (
              <MessageItem key={m.id} message={m} onRetry={onRetry} canRetry={!busy && m === lastAssistant} exhausted={exhausted} />
            ))}
          </div>
        )}
      </div>
      {!atBottom && messages.length > 0 && !loading && (
        <button
          type="button"
          onClick={jump}
          aria-label={t("page.jumpToLatest")}
          className="animate-fade absolute bottom-3 start-1/2 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full border border-line/15 bg-surface text-ink-2 shadow-md transition-colors hover:text-ink rtl:translate-x-1/2"
        >
          <ArrowDown size={17} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-3xl space-y-7 py-8">
      <div className="flex justify-end"><Skeleton rounded="lg" className="h-11 w-2/3 sm:w-1/2" /></div>
      <div className="flex gap-3">
        <Skeleton rounded="full" className="h-8 w-8 shrink-0" />
        <SkeletonText lines={4} className="flex-1 pt-1.5" />
      </div>
      <div className="flex justify-end"><Skeleton rounded="lg" className="h-11 w-1/2 sm:w-2/5" /></div>
      <div className="flex gap-3">
        <Skeleton rounded="full" className="h-8 w-8 shrink-0" />
        <SkeletonText lines={3} className="flex-1 pt-1.5" />
      </div>
    </div>
  );
}
