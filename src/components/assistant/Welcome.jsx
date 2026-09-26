"use client";

import { useT } from "@/i18n/client";
import Illustration from "@/components/ui/Illustration";

// Capability → illustration (src/lib/assets.js: ai.* + achievement.review).
const CAPABILITIES = [
  { key: "explain", art: "ai.tutoring" },
  { key: "summarize", art: "ai.feedback" },
  { key: "quiz", art: "achievement.review" },
  { key: "plan", art: "ai.study-plan" },
];

/**
 * Empty-conversation state: greeting (split with the assistant island on
 * wider screens), four capability cards that start a prompt, and suggested
 * questions (hidden when the member turned assistant suggestions off).
 */
export default function Welcome({ name, showSuggestions = true, disabled = false, onTemplate, onAsk }) {
  const t = useT("assistant");
  const first = (name || "").trim().split(/\s+/)[0];
  const suggestions = t.raw("welcome.suggestions") || [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col py-5 sm:py-7">
      <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_170px] lg:grid-cols-[minmax(0,1fr)_190px]">
        <div className="animate-in">
          <h2 className="t-h2">{first ? t("welcome.greeting", { name: first }) : t("welcome.greetingGuest")}</h2>
          <p className="t-body mt-2 max-w-xl text-ink-3">{t("welcome.lead")}</p>
        </div>
        <div className="hidden md:block">
          <Illustration id="brand.island-ai" priority className="w-full" />
        </div>
      </div>

      <h3 className="t-caption mt-6 font-medium text-ink-3">{t("welcome.capabilitiesLabel")}</h3>
      <ul className="mt-2.5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {CAPABILITIES.map(({ key, art }, i) => (
          <li key={key} className="animate-in" style={{ animationDelay: `${60 + i * 50}ms` }}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onTemplate(t(`welcome.capabilities.${key}.template`))}
              className="group flex h-full w-full flex-col rounded-md border border-line/15 bg-surface p-2 text-start transition-[border-color,box-shadow,transform] duration ease-out enabled:hover:-translate-y-0.5 enabled:hover:border-gold-300/70 enabled:hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60 sm:p-2.5"
            >
              <span className="flex h-16 items-center justify-center overflow-hidden rounded-sm bg-[#F7F0E3] ring-1 ring-inset ring-[#7A623A]/10 sm:h-[88px]">
                <Illustration id={art} className="h-full w-auto max-w-none" />
              </span>
              <span className="mt-2 block px-1 text-sm font-medium leading-snug text-ink sm:mt-2.5 sm:text-[0.9375rem]">
                {t(`welcome.capabilities.${key}.title`)}
              </span>
              <span className="mt-0.5 hidden px-1 pb-0.5 text-[0.8125rem] leading-snug text-ink-3 sm:block">
                {t(`welcome.capabilities.${key}.body`)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {showSuggestions && suggestions.length > 0 && (
        <>
          <h3 className="t-caption mt-5 font-medium text-ink-3">{t("welcome.suggestionsLabel")}</h3>
          {/* one swipeable row on phones, wrapped chips from sm up */}
          <ul className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
            {suggestions.map((s) => (
              <li key={s} className="shrink-0">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onAsk(s)}
                  dir="auto"
                  className="min-h-11 whitespace-nowrap rounded-full border border-line/15 bg-surface-2/60 px-3.5 py-1.5 text-sm text-ink-2 transition-colors enabled:hover:border-gold-300/70 enabled:hover:bg-gold-50 enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
