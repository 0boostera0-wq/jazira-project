"use client";

import { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { useT } from "@/i18n/client";
import { formatClock } from "@/i18n/format";
import { cn } from "@/components/ui/cn";
import { TIMER_ANNOUNCEMENTS, timerTone } from "./runner-logic";

const TONES = {
  normal: "bg-surface-2 text-ink border-line/12",
  warning: "bg-warning-soft text-warning border-warning/25",
  danger: "bg-danger-soft text-danger border-danger/25 [animation:jz-pulse-soft_1.4s_ease-in-out_infinite]",
};

/**
 * Countdown pill. Owns its own interval so the rest of the runner doesn't
 * re-render every second. `deadline` is a local epoch (ms) derived from the
 * server clock; onExpire fires once at 0. Screen readers hear 10 / 5 / 1
 * minute warnings (polite), never a per-second stream.
 */
export default function RunnerTimer({ deadline, limit, onExpire, className }) {
  const t = useT("exams");
  const tc = useT("common");
  const secondsLeft = () => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const [left, setLeft] = useState(secondsLeft);
  const [announce, setAnnounce] = useState("");
  const fired = useRef(false);
  const spoken = useRef(new Set());
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    // already past a threshold on resume → don't announce it
    const start = secondsLeft();
    for (const s of TIMER_ANNOUNCEMENTS) if (start <= s) spoken.current.add(s);
    const tick = () => {
      const s = secondsLeft();
      setLeft((prev) => (prev === s ? prev : s));
      for (const mark of TIMER_ANNOUNCEMENTS) {
        if (s <= mark && !spoken.current.has(mark)) {
          spoken.current.add(mark);
          setAnnounce(mark === 60 ? t("runner.announce.lastMinute") : t("runner.announce.minutes", { minutes: tc("units.minutes", { count: mark / 60 }) }));
        }
      }
      if (s <= 0 && !fired.current) {
        fired.current = true;
        expireRef.current?.();
      }
    };
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [deadline]); // eslint-disable-line react-hooks/exhaustive-deps

  const tone = timerTone(left, limit);
  return (
    <>
      <div role="timer" className={cn("inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[0.9375rem] font-bold transition-colors", TONES[tone], className)}>
        <Timer size={16} aria-hidden="true" />
        <span className="sr-only">{t("runner.timeLeft")}</span>
        <span className="num tabular">{formatClock(left)}</span>
      </div>
      <span className="sr-only" aria-live="polite">{announce}</span>
    </>
  );
}
