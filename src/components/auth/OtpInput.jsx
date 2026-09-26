"use client";

import { useRef } from "react";
import { useT } from "@/i18n/client";
import { cn } from "@/components/ui/cn";
import { OTP_LENGTH, toLatinDigits } from "./authUtils";

/**
 * Six single-digit boxes. Always laid out LTR (codes read left→right in both
 * languages). Handles typing, paste, iOS/Android one-time-code autofill (the
 * whole code lands in one box), Backspace and arrow keys. Arabic-Indic digits
 * are converted. `onComplete(code)` fires when the last digit is filled.
 */
export default function OtpInput({ value, onChange, onComplete, disabled, invalid, describedBy, labelledBy }) {
  const t = useT("auth");
  const refs = useRef([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] || "");

  const focusAt = (i) => {
    const el = refs.current[Math.max(0, Math.min(OTP_LENGTH - 1, i))];
    el?.focus();
    el?.select?.();
  };

  const commit = (next) => {
    const code = next.join("").slice(0, OTP_LENGTH);
    onChange(code);
    if (code.length === OTP_LENGTH && !next.includes("")) onComplete?.(code);
  };

  // Fill from `start` with a run of digits (paste / autofill / fast typing).
  const fillFrom = (start, raw) => {
    const incoming = toLatinDigits(raw).replace(/\D/g, "");
    if (!incoming) return;
    const from = incoming.length >= OTP_LENGTH ? 0 : start; // a full code always starts at box 1
    const next = [...digits];
    for (let k = 0; k < incoming.length && from + k < OTP_LENGTH; k += 1) next[from + k] = incoming[k];
    commit(next);
    focusAt(Math.min(from + incoming.length, OTP_LENGTH - 1));
  };

  const handleChange = (i, e) => {
    const raw = e.target.value;
    if (!raw) {
      const next = [...digits];
      next[i] = "";
      commit(next);
      return;
    }
    // A single box keeps its old digit plus the new one — take what was added.
    const added = raw.length > 1 && digits[i] && raw.includes(digits[i]) ? raw.replace(digits[i], "") : raw;
    fillFrom(i, added);
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      const next = [...digits];
      next[i - 1] = "";
      commit(next);
      focusAt(i - 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusAt(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusAt(i + 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusAt(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusAt(OTP_LENGTH - 1);
    }
  };

  const handlePaste = (i, e) => {
    const text = e.clipboardData?.getData("text") || "";
    if (!text) return;
    e.preventDefault();
    fillFrom(i, text);
  };

  return (
    <div dir="ltr" role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} className="flex justify-between gap-2 sm:gap-3">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={i === 0 ? OTP_LENGTH : 2}
          value={d}
          disabled={disabled}
          aria-label={t("verify.digit", { n: i + 1 })}
          aria-invalid={invalid || undefined}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.target.select()}
          className={cn(
            "tabular h-14 w-full min-w-0 max-w-[3.5rem] rounded-md border bg-surface text-center text-2xl font-medium text-ink shadow-xs",
            "transition-[border-color,box-shadow] duration-fast ease-out",
            "focus:border-gold-400 focus:shadow-[0_0_0_3px_rgb(var(--c-gold-400)/0.18)] focus:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60",
            invalid ? "border-danger/60" : d ? "border-line/30" : "border-line/20"
          )}
        />
      ))}
    </div>
  );
}
