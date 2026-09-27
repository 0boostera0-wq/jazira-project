"use client";

import { useId } from "react";
import { cn } from "@/components/ui/cn";
import { textResponse } from "../question-logic";

/**
 * Short answer: one text field (max_chars from the item). The text is kept
 * as typed; grading on the server normalizes it (§2.8). The runner's
 * shortcuts are off while typing (they skip inputs).
 */
export default function ShortAnswerInput({ t, question, response, onRespond, lang = "ar", dir = "rtl", disabled = false }) {
  const id = useId();
  const max = Number.isInteger(question.public?.max_chars) && question.public.max_chars > 0 ? question.public.max_chars : 80;
  // controlled by the runner state (updated synchronously), so "clear" resets it too
  const text = response?.text ?? "";

  return (
    <div className="mt-6">
      <label htmlFor={id} className="t-small font-medium text-ink-2">{t("runner.shortAnswer.label")}</label>
      <input
        id={id}
        type="text"
        lang={lang}
        dir={dir}
        value={text}
        maxLength={max}
        disabled={disabled}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
        onChange={(e) => onRespond(textResponse(e.target.value, max))}
        aria-describedby={`${id}-count`}
        className={cn(
          lang === "ar" ? "font-ar" : "font-en",
          "mt-2 h-14 w-full rounded-md border border-line/20 bg-surface px-4 text-[1.125rem] text-ink placeholder:text-ink-4 focus-visible:border-gold-500 focus-visible:shadow-[var(--ring)] focus-visible:outline-none disabled:bg-surface-2"
        )}
        placeholder={t("runner.shortAnswer.placeholder")}
      />
      <p id={`${id}-count`} className="t-caption mt-1.5 text-end tabular">{t("runner.shortAnswer.count", { used: text.length, max })}</p>
    </div>
  );
}
