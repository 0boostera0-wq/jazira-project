"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { choiceState, choicesOf } from "../question-logic";

/**
 * True / false: two large radios side by side (the option texts come from
 * the item — «صح / خطأ» or True / False in its content language). The order
 * is fixed (§5.4), so the first option is "true". Keys 1 and 2 choose.
 * `reveal` / `disabled` as in McqInput.
 */
export default function TrueFalseInput({ t, question, selected, onChoose, lang = "ar", dir = "rtl", disabled = false, reveal = null }) {
  const choices = choicesOf(question).slice(0, 2);
  return (
    <fieldset className="mt-6 min-w-0" disabled={disabled || undefined}>
      <legend className="sr-only">{t("runner.choicesLabel")}</legend>
      <ul lang={lang} dir={dir} className={cn(lang === "ar" ? "font-ar" : "font-en", "grid grid-cols-2 gap-2.5 sm:gap-3")}>
        {choices.map((choice, i) => {
          const on = selected === i;
          const state = reveal ? choiceState(i, selected, reveal) : null;
          const Icon = i === 0 ? Check : X;
          return (
            <li key={i}>
              <label
                className={cn(
                  "relative flex min-h-[4.25rem] w-full flex-col items-center justify-center gap-1.5 rounded-md border px-3 py-3 text-center transition-[border-color,background-color,box-shadow] duration-fast ease-out has-[:focus-visible]:shadow-[var(--ring)]",
                  disabled ? "cursor-default" : "cursor-pointer active:scale-[0.99]",
                  state === "correct"
                    ? "border-green-300 bg-green-50"
                    : state === "wrong"
                      ? "border-danger/40 bg-danger-soft"
                      : on
                        ? "border-gold-500 bg-gold-50 shadow-[0_0_0_1px_rgb(var(--c-gold-500))]"
                        : cn("border-line/15 bg-surface", !disabled && "[@media(hover:hover)]:hover:border-line/30 [@media(hover:hover)]:hover:bg-surface-2/60")
                )}
              >
                <input type="radio" name={`q-${question.position}-choice`} value={i} checked={on} onChange={() => onChoose(i)} className="sr-only" />
                <Icon size={20} aria-hidden="true" className={cn(on || state === "correct" ? "text-ink" : "text-ink-4")} />
                <span className="text-[1.0625rem] font-medium leading-snug text-ink">{choice}</span>
                {state === "correct" && <span className="sr-only">{t("runner.check.correctOption")}</span>}
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
