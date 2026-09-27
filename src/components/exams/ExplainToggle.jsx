"use client";

import { useId, useState } from "react";
import { ChevronDown, Lightbulb, Target } from "lucide-react";
import { cn } from "@/components/ui/cn";
import MixedText from "./MixedText";

/**
 * «شرح السبب» / "Why" disclosure: the explanation text, its numbered steps
 * and the objective the question practises. A real button with
 * aria-expanded / aria-controls (keyboard and screen-reader friendly). The
 * content is educational content in the item's language (`lang` / `dir`).
 */
export default function ExplainToggle({ t, explanation, objective = null, lang = "ar", dir = "rtl", defaultOpen = false, className }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  if (!explanation && !objective) return null;
  const font = lang === "ar" ? "font-ar" : "font-en";
  return (
    <div className={cn("rounded-md bg-surface-2/80", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 rounded-md px-4 py-2.5 text-start text-sm font-medium text-ink focus-visible:shadow-[var(--ring)] focus-visible:outline-none"
      >
        <Lightbulb size={15} aria-hidden="true" className="shrink-0 text-gold-600" />
        <span className="flex-1">{t("results.review.why")}</span>
        <ChevronDown size={16} aria-hidden="true" className={cn("shrink-0 text-ink-3 transition-transform duration-fast", open && "rotate-180")} />
      </button>
      <div id={id} hidden={!open} className="border-t border-line/8 px-4 pb-4 pt-3">
        {explanation?.text ? (
          <p lang={lang} dir={dir} className={cn(font, "whitespace-pre-line text-[0.9375rem] leading-[1.9] text-ink-2")}><MixedText text={explanation.text} /></p>
        ) : null}
        {explanation?.steps?.length ? (
          <div className="mt-3">
            <p className="text-[0.8125rem] font-medium text-ink-3">{t("results.review.steps")}</p>
            <ol lang={lang} dir={dir} className={cn(font, "mt-1.5 list-decimal space-y-1 ps-5 text-[0.9375rem] leading-[1.8] text-ink-2")}>
              {explanation.steps.map((s, i) => (
                <li key={i}><MixedText text={s} /></li>
              ))}
            </ol>
          </div>
        ) : null}
        {objective?.text ? (
          <p className="mt-3 flex items-start gap-2 text-[0.875rem] text-ink-2">
            <Target size={15} aria-hidden="true" className="mt-1 shrink-0 text-green-600" />
            <span>
              <span className="font-medium text-ink">{t("results.review.objective")}</span>{" "}
              {/* objectives are served as their Arabic text (objective@1 text_ar), whatever the item's language */}
              <bdi lang={objective.language === "en" ? "en" : "ar"} dir={objective.language === "en" ? "ltr" : "rtl"} className={objective.language === "en" ? "font-en" : "font-ar"}>{objective.text}</bdi>
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
