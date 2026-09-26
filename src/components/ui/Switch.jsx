"use client";

import { useId } from "react";
import { cn } from "./cn";

/** Accessible toggle (role="switch"). Controlled: checked + onChange(bool). */
export default function Switch({ checked, onChange, label, description, disabled, className }) {
  const id = useId();
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      {(label || description) && (
        <label htmlFor={id} className="min-w-0 cursor-pointer">
          {label && <span className="block text-[0.9375rem] font-medium text-ink">{label}</span>}
          {description && <span className="mt-0.5 block text-sm text-ink-3">{description}</span>}
        </label>
      )}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={!!checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration ease-out disabled:opacity-50",
          // off track: field-token ring (≥3:1) so the control is identifiable (WCAG 1.4.11);
          // focus is the global :focus-visible outline, which ring/shadow utilities can't override
          checked ? "bg-green-500" : "bg-surface-3 ring-1 ring-inset ring-field"
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration ease-spring",
            checked ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1"
          )}
        />
      </button>
    </div>
  );
}
