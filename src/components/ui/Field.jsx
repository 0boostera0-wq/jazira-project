"use client";

import { forwardRef, useId } from "react";
import { cn } from "./cn";

// Server-safe form primitives. Inputs are 44px tall (comfortable tap target),
// 16px text (prevents iOS zoom), logical padding (RTL-safe).
// Boundaries use the `field` token (≥3:1 against surface and canvas, WCAG
// 1.4.11); focus darkens the border to gold-700 and adds the global 2px
// gold-700 outline (5.98:1, survives forced-colors mode).

export const inputClasses = (invalid) =>
  cn(
    "block w-full rounded-md border bg-surface px-3.5 text-[1rem] text-ink shadow-xs",
    "transition-[border-color,box-shadow] duration-fast ease-out",
    "placeholder:text-ink-4 hover:border-ink-3",
    "focus:border-gold-700",
    "disabled:cursor-not-allowed disabled:border-field/60 disabled:bg-surface-2 disabled:text-ink-4",
    invalid ? "border-danger" : "border-field"
  );

export function Label({ htmlFor, children, optional, optionalText, className }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 flex items-baseline justify-between gap-2 text-sm font-medium text-ink", className)}>
      <span>{children}</span>
      {optional && <span className="text-xs font-normal text-ink-3">{optionalText}</span>}
    </label>
  );
}

/**
 * Field = label + control + hint/error, wired with aria-describedby.
 *   <Field label="البريد" error={err} hint="…">{(p) => <Input {...p} type="email" />}</Field>
 * The render-prop receives { id, "aria-invalid", "aria-describedby" }.
 */
export function Field({ label, hint, error, optional, optionalText, className, children, id: idProp }) {
  const auto = useId();
  const id = idProp || auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const control = children({
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": [errId, hintId].filter(Boolean).join(" ") || undefined,
  });
  return (
    <div className={className}>
      {label && <Label htmlFor={id} optional={optional} optionalText={optionalText}>{label}</Label>}
      {control}
      {error ? (
        <p id={errId} className="mt-1.5 text-[0.8125rem] text-danger">{error}</p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-[0.8125rem] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} className={cn(inputClasses(invalid || rest["aria-invalid"]), "h-11", className)} {...rest} />;
});

export const Textarea = forwardRef(function Textarea({ className, invalid, rows = 4, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(inputClasses(invalid || rest["aria-invalid"]), "py-2.5 leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef(function Select({ className, invalid, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        inputClasses(invalid || rest["aria-invalid"]),
        "h-11 appearance-none bg-no-repeat pe-10",
        "bg-[length:16px] bg-[position:left_14px_center] rtl:bg-[position:left_14px_center] ltr:bg-[position:right_14px_center]",
        className
      )}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23706454' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...rest}
    >
      {children}
    </select>
  );
});

/** Checkbox with label (RTL-safe). */
export function Checkbox({ label, description, className, ...rest }) {
  const id = useId();
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <input
        id={rest.id || id}
        type="checkbox"
        className="mt-1 h-[18px] w-[18px] shrink-0 cursor-pointer rounded-[5px] border-field accent-[rgb(var(--c-gold-600))]"
        {...rest}
      />
      {(label || description) && (
        <label htmlFor={rest.id || id} className="cursor-pointer text-sm">
          {label && <span className="font-medium text-ink">{label}</span>}
          {description && <span className="mt-0.5 block text-ink-3">{description}</span>}
        </label>
      )}
    </div>
  );
}
