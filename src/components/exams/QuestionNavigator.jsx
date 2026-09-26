"use client";

import { Flag } from "lucide-react";
import { cn } from "@/components/ui/cn";

/**
 * Question map: one numbered button per question showing answered /
 * unanswered / flagged / current. Used in the desktop rail and the mobile sheet.
 */
export default function QuestionNavigator({ t, positions, answers, current, onGo, columns = 5, className }) {
  return (
    <div className={className}>
      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {positions.map((p, i) => {
          const a = answers[p];
          const answered = a?.selected !== null && a?.selected !== undefined;
          const flagged = Boolean(a?.flagged);
          const isCurrent = p === current;
          const label = answered && flagged
            ? t("runner.navigator.itemAnsweredFlagged", { n: i + 1 })
            : answered
              ? t("runner.navigator.itemAnswered", { n: i + 1 })
              : flagged
                ? t("runner.navigator.itemFlagged", { n: i + 1 })
                : t("runner.navigator.item", { n: i + 1 });
          return (
            <li key={p}>
              <button
                type="button"
                onClick={() => onGo(p)}
                aria-label={label}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "relative grid h-11 w-full place-items-center rounded-sm border text-sm font-medium tabular transition-[background-color,border-color,box-shadow] duration-fast",
                  answered ? "border-gold-300/70 bg-gold-100 text-gold-800" : "border-line/15 bg-surface text-ink-3 hover:border-line/30 hover:text-ink",
                  isCurrent && "shadow-[0_0_0_2px_rgb(var(--c-surface)),0_0_0_4px_rgb(var(--c-ink))]"
                )}
              >
                {i + 1}
                {flagged && (
                  <span aria-hidden="true" className="absolute -end-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-warning text-surface ring-2 ring-surface">
                    <Flag size={9} className="fill-current" />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Legend for the map. */
export function NavigatorLegend({ t, className }) {
  const items = [
    ["answered", "border-gold-300/70 bg-gold-100"],
    ["unanswered", "border-line/20 bg-surface"],
    ["flagged", "border-transparent bg-warning"],
    ["current", "border-ink bg-surface border-2"],
  ];
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5", className)}>
      {items.map(([k, cls]) => (
        <li key={k} className="t-caption flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("h-3 w-3 rounded-[4px] border", cls)} />
          {t(`runner.navigator.legend.${k}`)}
        </li>
      ))}
    </ul>
  );
}
