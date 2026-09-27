"use client";

import { useId, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { parseNumber } from "@/lib/content/answers";
import { cn } from "@/components/ui/cn";
import { MAX_NUMERIC_CHARS, numericIssue, numericResponse } from "../question-logic";

/**
 * Numeric answer: inputmode="decimal", either digit set (0–9 or ٠–٩), `.` or
 * `٫` as the decimal mark and `a/b` fractions when the item allows them. The
 * value is typed left-to-right. Before saving, the same parser the server
 * grades with (src/lib/content/answers.js) flags a value it would refuse
 * (e.g. "0,125": is it 0.125 or 125?). A required unit is chosen from a
 * select; an optional one is shown next to the field.
 */
export default function NumericInput({ t, question, response, onRespond, disabled = false }) {
  const id = useId();
  const unit = question.public?.unit ?? null;
  const input = question.public?.input ?? null;
  const value = response?.value ?? "";
  // a unit picked before the value is typed is kept here until there is a value to save
  const [pendingUnit, setPendingUnit] = useState("");
  const chosenUnit = response?.unit ?? (value ? "" : pendingUnit);
  const issue = value ? numericIssue(parseNumber(value), input) : null;
  const units = unit ? [unit.text, ...(Array.isArray(unit.accepted) ? unit.accepted : [])].filter((u, i, a) => typeof u === "string" && u && a.indexOf(u) === i) : [];
  const set = (patch) => onRespond(numericResponse({ value, unit: chosenUnit || pendingUnit || null, ...patch }));
  const hintId = `${id}-hint`;
  const issueId = `${id}-issue`;

  return (
    <div className="mt-6">
      <label htmlFor={id} className="t-small font-medium text-ink-2">{t("runner.numeric.label")}</label>
      <div className="mt-2 flex flex-wrap items-stretch gap-2.5">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          maxLength={MAX_NUMERIC_CHARS}
          value={value}
          disabled={disabled}
          onChange={(e) => set({ value: e.target.value })}
          aria-invalid={issue ? true : undefined}
          aria-describedby={issue ? `${hintId} ${issueId}` : hintId}
          placeholder={input?.allow_fraction === false ? t("runner.numeric.placeholderDecimal") : t("runner.numeric.placeholder")}
          className="num h-14 min-w-0 flex-1 basis-40 rounded-md border border-line/20 bg-surface px-4 text-[1.25rem] text-ink placeholder:text-ink-4 focus-visible:border-gold-500 focus-visible:shadow-[var(--ring)] focus-visible:outline-none disabled:bg-surface-2 aria-[invalid=true]:border-warning"
        />
        {unit && unit.required ? (
          <select
            aria-label={t("runner.numeric.unit")}
            value={chosenUnit}
            disabled={disabled}
            onChange={(e) => {
              setPendingUnit(e.target.value);
              set({ unit: e.target.value || null });
            }}
            className="h-14 min-w-[7rem] rounded-md border border-line/20 bg-surface px-3 text-[1rem] text-ink focus-visible:shadow-[var(--ring)] focus-visible:outline-none"
          >
            <option value="">{t("runner.numeric.chooseUnit")}</option>
            {units.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        ) : unit ? (
          <span className="grid h-14 place-items-center rounded-md bg-surface-2 px-4 text-[1rem] text-ink-2"><bdi>{unit.text}</bdi></span>
        ) : null}
      </div>
      <p id={hintId} className="t-caption mt-1.5">
        {input?.allow_fraction === false ? t("runner.numeric.hintNoFraction") : t("runner.numeric.hint")}
        {Number.isInteger(input?.max_decimals) ? ` ${t("runner.numeric.maxDecimals", { count: input.max_decimals })}` : ""}
      </p>
      {issue && (
        <p id={issueId} role="status" className="mt-2 flex items-start gap-1.5 text-[0.8125rem] font-medium text-warning">
          <AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          {t(`runner.numeric.issues.${issue}`)}
        </p>
      )}
      {unit?.required && value && !chosenUnit && <p className="t-caption mt-1.5 text-warning">{t("runner.numeric.unitNeeded")}</p>}
    </div>
  );
}
