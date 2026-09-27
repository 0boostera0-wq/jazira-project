"use client";

import { useId, useState } from "react";
import { Link2, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { choiceLabel } from "../labels";
import { choiceDir } from "../runner-logic";
import { leftOf, matchingProgress, pairFor, rightOf, setPair } from "../question-logic";

/**
 * Matching (display indexes only — the client never sees item ids):
 *   phones   one native <select> per left item (keyboard and screen-reader
 *            friendly by construction);
 *   desktop  two columns: pick an item on the start side, then its match on
 *            the other side (buttons with aria-pressed; Esc cancels). A
 *            matched pair shows as a chip with an "unmatch" button.
 * A right item is used once: matching it again moves it. Partial answers
 * count (graded per pair when the item allows partial credit).
 */
export default function MatchingInput({ t, question, response, onRespond, lang = "ar", dir = "rtl", disabled = false }) {
  const left = leftOf(question);
  const right = rightOf(question);
  const [active, setActive] = useState(null);
  const uid = useId();
  const { done, total } = matchingProgress(question, response);
  const rightText = (ri) => right.find((r) => r.index === ri)?.text ?? "";
  const usedBy = (ri) => (response?.pairs ?? []).find((p) => p[1] === ri)?.[0] ?? null;
  const pair = (li, ri) => onRespond(setPair(response, li, ri));
  const font = lang === "ar" ? "font-ar" : "font-en";

  return (
    <fieldset className="mt-6 min-w-0" disabled={disabled || undefined}>
      <legend className="t-small text-ink-3">{t("runner.matching.instructions")}</legend>
      <p className="t-caption mt-1 tabular" aria-live="polite">{t("runner.matching.progress", { done, total })}</p>

      {/* phones: a select per left item */}
      <ol lang={lang} dir={dir} className={cn(font, "mt-4 space-y-3 md:hidden")}>
        {left.map((l, n) => {
          const selId = `${uid}-sel-${l.index}`;
          const value = pairFor(response, l.index);
          return (
            <li key={l.index} className="rounded-md border border-line/15 bg-surface p-3.5">
              <label htmlFor={selId} className="flex items-start gap-2.5 text-[1.0625rem] leading-relaxed text-ink">
                <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[0.8125rem] font-bold text-ink-2 tabular">{n + 1}</span>
                <bdi dir={choiceDir(l.text)} className="min-w-0 flex-1">{l.text}</bdi>
              </label>
              <select
                id={selId}
                value={value === null ? "" : String(value)}
                onChange={(e) => pair(l.index, e.target.value === "" ? null : Number(e.target.value))}
                className="mt-2.5 h-11 w-full rounded-sm border border-line/20 bg-surface px-3 text-[1rem] text-ink focus-visible:shadow-[var(--ring)] focus-visible:outline-none"
              >
                <option value="">{t("runner.matching.choose")}</option>
                {right.map((r, k) => (
                  <option key={r.index} value={String(r.index)}>
                    {`${choiceLabel(t, k)}. ${r.text}`}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ol>

      {/* desktop: two columns */}
      <div lang={lang} dir={dir} className={cn(font, "mt-4 hidden gap-4 md:grid md:grid-cols-2")} onKeyDown={(e) => e.key === "Escape" && setActive(null)}>
        <ol className="space-y-2.5" aria-label={t("runner.matching.leftColumn")}>
          {left.map((l, n) => {
            const matched = pairFor(response, l.index);
            const on = active === l.index;
            return (
              <li key={l.index} className={cn("rounded-md border transition-colors", on ? "border-gold-500 bg-gold-50" : "border-line/15 bg-surface")}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setActive(on ? null : l.index)}
                  className="flex min-h-[3.25rem] w-full items-center gap-2.5 rounded-md px-3.5 py-2.5 text-start text-[1.0625rem] leading-relaxed text-ink focus-visible:shadow-[var(--ring)] focus-visible:outline-none"
                >
                  <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[0.8125rem] font-bold text-ink-2 tabular">{n + 1}</span>
                  <bdi dir={choiceDir(l.text)} className="min-w-0 flex-1">{l.text}</bdi>
                  <span className="sr-only">{matched === null ? t("runner.matching.unmatched") : t("runner.matching.matchedWith", { item: rightText(matched) })}</span>
                </button>
                {matched !== null && (
                  <div className="flex items-center gap-2 border-t border-line/10 px-3.5 py-2">
                    <Link2 size={14} aria-hidden="true" className="shrink-0 text-gold-600" />
                    <span className="min-w-0 flex-1 truncate text-[0.9375rem] text-ink-2"><bdi dir={choiceDir(rightText(matched))}>{rightText(matched)}</bdi></span>
                    <button
                      type="button"
                      onClick={() => pair(l.index, null)}
                      aria-label={t("runner.matching.unmatch", { n: n + 1 })}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:shadow-[var(--ring)] focus-visible:outline-none"
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <ul className="space-y-2.5" aria-label={t("runner.matching.rightColumn")}>
          {right.map((r, k) => {
            const owner = usedBy(r.index);
            const ownerN = owner === null ? null : left.findIndex((l) => l.index === owner) + 1;
            return (
              <li key={r.index}>
                <button
                  type="button"
                  disabled={active === null}
                  onClick={() => {
                    pair(active, r.index);
                    setActive(null);
                  }}
                  aria-label={active === null ? undefined : t("runner.matching.matchTo", { item: r.text, n: left.findIndex((l) => l.index === active) + 1 })}
                  className={cn(
                    "flex min-h-[3.25rem] w-full items-center gap-2.5 rounded-md border px-3.5 py-2.5 text-start text-[1.0625rem] leading-relaxed transition-colors focus-visible:shadow-[var(--ring)] focus-visible:outline-none",
                    owner !== null ? "border-gold-300/70 bg-gold-50/60 text-ink" : "border-line/15 bg-surface text-ink",
                    active !== null ? "cursor-pointer hover:border-gold-400" : "cursor-default"
                  )}
                >
                  <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[0.8125rem] font-bold text-ink-2">{choiceLabel(t, k)}</span>
                  <bdi dir={choiceDir(r.text)} className="min-w-0 flex-1">{r.text}</bdi>
                  {ownerN ? <span className="t-caption shrink-0 tabular" aria-hidden="true">{ownerN}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="t-caption mt-3 hidden md:block" aria-live="polite">
        {active === null ? t("runner.matching.pickLeft") : t("runner.matching.pickRight", { n: left.findIndex((l) => l.index === active) + 1 })}
      </p>
    </fieldset>
  );
}
