"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, ListChecks } from "lucide-react";
import Button from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { choiceDir } from "../runner-logic";
import { itemsOf, moveItem, orderResponse, workingOrder } from "../question-logic";

/**
 * Ordering without drag-only interaction (§7): every row has move-up /
 * move-down buttons, and its handle moves it with ↑ / ↓ (focus follows the
 * item; a live region announces the new position). Until the learner moves
 * something the shown order is not an answer — "Keep this order" confirms it.
 * The client sees and sends display indexes only.
 */
export default function OrderingInput({ t, question, response, onRespond, lang = "ar", dir = "rtl", disabled = false }) {
  const items = itemsOf(question);
  const textOf = (i) => items.find((x) => x.index === i)?.text ?? "";
  const order = workingOrder(question, response);
  const [announce, setAnnounce] = useState("");
  const handles = useRef(new Map());
  const focusNext = useRef(null);

  useEffect(() => {
    if (focusNext.current === null) return;
    handles.current.get(focusNext.current)?.focus();
    focusNext.current = null;
  });

  const move = (from, to) => {
    if (disabled || to < 0 || to >= order.length || from === to) return;
    const next = moveItem(order, from, to);
    focusNext.current = order[from];
    onRespond(orderResponse(next));
    setAnnounce(t("runner.ordering.moved", { item: textOf(order[from]), position: to + 1, total: order.length }));
  };

  const criterion = question.public?.criterion;
  const hint = criterion && t.has(`runner.ordering.criteria.${criterion}`) ? t(`runner.ordering.criteria.${criterion}`) : null;

  return (
    <fieldset className="mt-6 min-w-0" disabled={disabled || undefined}>
      <legend className="t-small text-ink-3">{hint || t("runner.ordering.instructions")}</legend>
      <p className="sr-only">{t("runner.ordering.keyboard")}</p>
      <ol lang={lang} dir={dir} className={cn(lang === "ar" ? "font-ar" : "font-en", "mt-4 space-y-2.5")}>
        {order.map((itemIndex, pos) => {
          const text = textOf(itemIndex);
          return (
            <li key={itemIndex} className={cn("flex items-center gap-2 rounded-md border px-2 py-2 sm:px-3", response ? "border-gold-300/70 bg-gold-50/50" : "border-line/15 bg-surface")}>
              <button
                type="button"
                ref={(el) => (el ? handles.current.set(itemIndex, el) : handles.current.delete(itemIndex))}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    move(pos, pos - 1);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    move(pos, pos + 1);
                  }
                }}
                aria-label={t("runner.ordering.handle", { item: text, position: pos + 1, total: order.length })}
                className="grid h-10 w-8 shrink-0 cursor-grab place-items-center rounded-sm text-ink-4 hover:bg-surface-2 hover:text-ink-2 focus-visible:shadow-[var(--ring)] focus-visible:outline-none"
              >
                <GripVertical size={18} aria-hidden="true" />
              </button>
              <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[0.8125rem] font-bold text-ink-2 tabular">{pos + 1}</span>
              <span className="min-w-0 flex-1 py-1 text-[1.0625rem] leading-relaxed text-ink"><bdi dir={choiceDir(text)}>{text}</bdi></span>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => move(pos, pos - 1)}
                  disabled={pos === 0}
                  aria-label={t("runner.ordering.up", { item: text })}
                  className="grid h-10 w-10 place-items-center rounded-full border border-line/15 text-ink-2 hover:bg-surface-2 disabled:opacity-35 focus-visible:shadow-[var(--ring)] focus-visible:outline-none"
                >
                  <ArrowUp size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => move(pos, pos + 1)}
                  disabled={pos === order.length - 1}
                  aria-label={t("runner.ordering.down", { item: text })}
                  className="grid h-10 w-10 place-items-center rounded-full border border-line/15 text-ink-2 hover:bg-surface-2 disabled:opacity-35 focus-visible:shadow-[var(--ring)] focus-visible:outline-none"
                >
                  <ArrowDown size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {!response && !disabled && order.length > 0 && (
        <Button variant="secondary" size="sm" className="mt-3" iconStart={ListChecks} onClick={() => onRespond(orderResponse(order))}>
          {t("runner.ordering.keep")}
        </Button>
      )}
      <p className="sr-only" aria-live="polite">{announce}</p>
    </fieldset>
  );
}
