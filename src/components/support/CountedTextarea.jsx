"use client";

import { forwardRef, useId } from "react";
import { Label, Textarea } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";

/**
 * Labelled textarea with one footer row: the error (or hint) on the start
 * side and a live character counter on the end side, both wired to the
 * control with aria-describedby. `unicode-bidi: plaintext` lets each
 * paragraph take the direction of its own text, so an English message in the
 * Arabic UI (or the reverse) reads correctly.
 */
const CountedTextarea = forwardRef(function CountedTextarea(
  { label, optionalText, error, hint, count, max, counterText, className, ...rest },
  ref
) {
  const id = useId();
  const errId = error ? `${id}-err` : undefined;
  const hintId = !error && hint ? `${id}-hint` : undefined;
  const countId = `${id}-count`;
  return (
    <div className={className}>
      {label && <Label htmlFor={id} optional={Boolean(optionalText)} optionalText={optionalText}>{label}</Label>}
      <Textarea
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={[errId, hintId, countId].filter(Boolean).join(" ")}
        className="min-h-[9rem] resize-y [unicode-bidi:plaintext]"
        {...rest}
      />
      <div className="mt-1.5 flex items-start justify-between gap-3">
        {error ? (
          <p id={errId} className="text-[0.8125rem] text-danger">{error}</p>
        ) : hint ? (
          <p id={hintId} className="text-[0.8125rem] text-ink-3">{hint}</p>
        ) : (
          <span />
        )}
        <p id={countId} className={cn("num shrink-0 text-xs tabular", count > max ? "text-danger" : "text-ink-3")}>
          {counterText}
        </p>
      </div>
    </div>
  );
});

export default CountedTextarea;
