"use client";

import { Check } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/components/ui/cn";
import { passwordRules, passwordScore, strengthLevel } from "./authUtils";

const BAR = { weak: "bg-danger", fair: "bg-warning", good: "bg-green-400", strong: "bg-green-600" };
const TEXT = { weak: "text-danger", fair: "text-warning", good: "text-green-700", strong: "text-green-700" };

/** 4-step strength meter + live requirements for new passwords. */
export default function PasswordStrength({ id, password }) {
  const t = useT("auth");
  const rules = passwordRules(password);
  const score = passwordScore(password);
  const level = strengthLevel(score);
  const typed = password.length > 0;

  return (
    <div id={id} className="mt-2.5">
      <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn("h-1 rounded-full transition-colors duration", typed && score >= step ? BAR[level] : "bg-surface-3")}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {[
            ["length", t("password.ruleLength")],
            ["mix", t("password.ruleMix")],
          ].map(([key, label]) => (
            <li key={key} className={cn("flex items-center gap-1.5 text-[0.8125rem] transition-colors", rules[key] ? "text-green-700" : "text-ink-3")}>
              {/* Met → green check; not yet → a quiet dot (never an empty circle that reads as a radio button). */}
              <span
                className={cn("grid h-4 w-4 place-items-center rounded-full transition-colors", rules[key] && "bg-green-100 text-green-700")}
                aria-hidden="true"
              >
                {rules[key] ? <Check size={11} strokeWidth={3} /> : <span className="h-1 w-1 rounded-full bg-ink-4" />}
              </span>
              <span>
                {label}
                <span className="sr-only">{rules[key] ? ` — ${t("password.ruleMet")}` : ` — ${t("password.ruleUnmet")}`}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className={cn("text-[0.8125rem] font-medium", TEXT[level], !typed && "invisible")} aria-live="polite">
          {typed ? t("password.strength", { level: t(`password.levels.${level}`) }) : ""}
        </p>
      </div>
    </div>
  );
}
