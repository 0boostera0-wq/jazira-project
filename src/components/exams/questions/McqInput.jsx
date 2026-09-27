"use client";

import { cn } from "@/components/ui/cn";
import { choiceLabel } from "../labels";
import { choiceDir, twoColumnChoices } from "../runner-logic";
import { choiceState, choicesOf } from "../question-logic";

const LABEL = "group relative flex min-h-[3.5rem] w-full items-center gap-3 rounded-md border px-3.5 py-3 text-start transition-[border-color,background-color,box-shadow] duration-fast ease-out";
const ON = "border-gold-500 bg-gold-50 shadow-[0_0_0_1px_rgb(var(--c-gold-500))]";
const OFF = "border-line/15 bg-surface";
const HOVER = "[@media(hover:hover)]:hover:border-line/30 [@media(hover:hover)]:hover:bg-surface-2/60";

/** Option label classes; an interactive item keeps the legacy class string exactly. */
function labelClass(on, state, disabled) {
  if (!disabled && !state) {
    return cn(
      "group relative flex min-h-[3.5rem] w-full cursor-pointer items-center gap-3 rounded-md border px-3.5 py-3 text-start transition-[border-color,background-color,box-shadow] duration-fast ease-out active:scale-[0.99] has-[:focus-visible]:shadow-[var(--ring)]",
      on ? ON : `${OFF} ${HOVER}`
    );
  }
  return cn(
    LABEL,
    "has-[:focus-visible]:shadow-[var(--ring)]",
    disabled ? "cursor-default" : "cursor-pointer active:scale-[0.99]",
    state === "correct" ? "border-green-300 bg-green-50" : state === "wrong" ? "border-danger/40 bg-danger-soft" : on ? ON : cn(OFF, !disabled && HOVER)
  );
}

/**
 * Single-answer choices (mcq): a native radio group (fieldset + legend, one
 * visually hidden radio per option). Screen readers announce a single-select
 * group with each option's position ("3 of 4"), Tab enters the group once and
 * the arrow keys move between options; the runner's 1–6 and F shortcuts keep
 * working. Each option is isolated (<bdi>) and math-only options ("−11",
 * "−4/5") read left-to-right (runner-logic.choiceDir).
 *
 * This is the legacy QuestionCard markup, unchanged for legacy attempts
 * (Arabic content: lang="ar" dir="rtl"); template items pass their own
 * content language.
 *
 * `reveal` (immediate feedback, after the item is checked and locked):
 * { correct: displayIndex|null, verdict } — the correct option turns green, a
 * wrong choice red; without the correct option (key-reveal cap) the chosen
 * one takes the verdict (question-logic.choiceState). `disabled` locks the group.
 */
export default function McqInput({ t, question, selected, onChoose, lang = "ar", dir = "rtl", disabled = false, reveal = null }) {
  const choices = choicesOf(question);
  const two = twoColumnChoices(choices);
  return (
    <fieldset className="mt-6 min-w-0" disabled={disabled || undefined}>
      <legend className="sr-only">{t("runner.choicesLabel")}</legend>
      <ul lang={lang} dir={dir} className={cn(lang === "ar" ? "font-ar" : "font-en", "grid gap-2.5 sm:gap-3", two && "sm:grid-cols-2")}>
        {choices.map((choice, i) => {
          const on = selected === i;
          const state = reveal ? choiceState(i, selected, reveal) : null;
          return (
            <li key={i}>
              <label className={labelClass(on, state, disabled)}>
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
                    state === "correct"
                      ? "border-transparent bg-green-500 text-surface"
                      : state === "wrong"
                        ? "border-transparent bg-danger text-surface"
                        : on
                          ? "border-transparent bg-gold-400 text-[#261F14]"
                          : "border-line/20 bg-surface-2 text-ink-2"
                  )}
                >
                  {choiceLabel(t, i)}
                </span>
                <span className="min-w-0 flex-1 text-[1.0625rem] leading-relaxed text-ink"><bdi dir={choiceDir(choice)}>{choice}</bdi></span>
                {state === "correct" && <span className="sr-only">{t("runner.check.correctOption")}</span>}
                {!disabled && (
                  <kbd aria-hidden="true" className="hidden h-6 min-w-6 place-items-center rounded-xs border border-line/15 px-1.5 font-sans text-xs text-ink-4 lg:grid">
                    {i + 1}
                  </kbd>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
