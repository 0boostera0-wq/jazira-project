"use client";

import { memo } from "react";
import { Eraser, Flag } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { choiceLabel, difficultyLabel, topicLabel } from "./labels";
import MixedText from "./MixedText";
import { choiceDir, twoColumnChoices } from "./runner-logic";

/**
 * One question: optional passage · stem · large tappable choices.
 * Question content is Arabic educational content: it keeps lang="ar"
 * dir="rtl" even inside the English UI; each option is isolated (<bdi>) and
 * math-only options ("−11", "−4/5") read left-to-right (runner-logic.choiceDir).
 *
 * The choices are a native radio group (fieldset + legend, one visually hidden
 * radio per option): screen readers announce a single-select group with each
 * option's position ("3 of 4"), Tab enters the group once and the arrow keys
 * move between options. The runner's 1–4 and F shortcuts keep working.
 */
function QuestionCard({ t, question, index, total, answer, onChoose, onClear, onFlag }) {
  const selected = answer?.selected ?? null;
  const flagged = Boolean(answer?.flagged);
  const two = twoColumnChoices(question.choices);
  const stemId = `q-${question.position}-stem`;
  return (
    <article aria-labelledby={stemId} className="surface animate-fade p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="t-eyebrow tabular">{t("runner.questionOf", { current: index + 1, total })}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {flagged && <Badge tone="warning" size="sm" icon={Flag}>{t("runner.flagged")}</Badge>}
          <Badge tone="outline" size="sm">{topicLabel(t, question.topic)}</Badge>
          {question.difficulty ? <Badge tone="neutral" size="sm">{difficultyLabel(t, question.difficulty)}</Badge> : null}
        </div>
      </div>

      {question.passage && (
        <section aria-label={t("runner.passage")} className="mt-5 rounded-md border border-line/10 bg-surface-2/70">
          <p className="border-b border-line/8 px-4 py-2 text-[0.8125rem] font-medium text-ink-3 sm:px-5">{t("runner.passage")}</p>
          <p lang="ar" dir="rtl" className="font-ar max-h-[38vh] overflow-y-auto whitespace-pre-line px-4 py-3.5 text-[1.0625rem] leading-[2] text-ink-2 sm:px-5"><MixedText text={question.passage} /></p>
        </section>
      )}

      {/* a <p>, not a heading: the English heading styles (tight leading, letter-spacing) must never apply to Arabic content */}
      <p id={stemId} tabIndex={-1} lang="ar" dir="rtl" className="font-ar mt-5 whitespace-pre-line text-[1.1875rem] font-medium leading-[1.9] text-ink outline-none sm:text-[1.3125rem]">
        <MixedText text={question.stem} />
      </p>

      <fieldset className="mt-6 min-w-0">
        <legend className="sr-only">{t("runner.choicesLabel")}</legend>
        <ul lang="ar" dir="rtl" className={cn("font-ar grid gap-2.5 sm:gap-3", two && "sm:grid-cols-2")}>
          {question.choices.map((choice, i) => {
            const on = selected === i;
            return (
              <li key={i}>
                <label
                  className={cn(
                    "group relative flex min-h-[3.5rem] w-full cursor-pointer items-center gap-3 rounded-md border px-3.5 py-3 text-start transition-[border-color,background-color,box-shadow] duration-fast ease-out active:scale-[0.99] has-[:focus-visible]:shadow-[var(--ring)]",
                    on
                      ? "border-gold-500 bg-gold-50 shadow-[0_0_0_1px_rgb(var(--c-gold-500))]"
                      : "border-line/15 bg-surface [@media(hover:hover)]:hover:border-line/30 [@media(hover:hover)]:hover:bg-surface-2/60"
                  )}
                >
                  <input
                    type="radio"
                    name={`q-${question.position}-choice`}
                    value={i}
                    checked={on}
                    onChange={() => onChoose(i)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-bold transition-colors",
                      on ? "border-transparent bg-gold-400 text-[#261F14]" : "border-line/20 bg-surface-2 text-ink-2"
                    )}
                  >
                    {choiceLabel(t, i)}
                  </span>
                  <span className="min-w-0 flex-1 text-[1.0625rem] leading-relaxed text-ink"><bdi dir={choiceDir(choice)}>{choice}</bdi></span>
                  <kbd aria-hidden="true" className="hidden h-6 min-w-6 place-items-center rounded-xs border border-line/15 px-1.5 font-sans text-xs text-ink-4 lg:grid">
                    {i + 1}
                  </kbd>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="mt-4 flex min-h-9 flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onFlag}
          aria-pressed={flagged}
          className={cn(
            "hidden h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors lg:inline-flex",
            flagged ? "bg-warning-soft text-warning" : "text-ink-3 hover:bg-surface-2 hover:text-ink"
          )}
        >
          <Flag size={15} aria-hidden="true" className={flagged ? "fill-current" : ""} />
          {flagged ? t("runner.flagged") : t("runner.flag")}
        </button>
        {selected !== null && (
          <button type="button" onClick={onClear} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
            <Eraser size={15} aria-hidden="true" />
            {t("runner.clear")}
          </button>
        )}
      </div>
    </article>
  );
}

export default memo(QuestionCard);
