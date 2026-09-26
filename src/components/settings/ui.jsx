"use client";

import { useId } from "react";
import { AlertCircle, Check, Clock } from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import { formatDate } from "@/i18n/format";
import Switch from "@/components/ui/Switch";
import Spinner from "@/components/ui/Spinner";
import Skeleton from "@/components/ui/Skeleton";
import IconTile from "@/components/ui/IconTile";
import { cn } from "@/components/ui/cn";
import { splitDuration } from "./model";

/** A titled group of settings rows. */
export function SettingsCard({ icon, tone = "gold", title, desc, aside, children, footer, className, id }) {
  const hid = useId();
  return (
    <section aria-labelledby={title ? hid : undefined} id={id} className={cn("surface overflow-hidden", className)}>
      {(title || desc) && (
        <header className="flex items-start gap-3.5 border-b border-line/10 px-5 py-4 sm:px-6">
          {icon && <IconTile icon={icon} tone={tone} size="sm" className="mt-0.5" />}
          <div className="min-w-0 flex-1">
            {title && <h3 id={hid} className="t-h4">{title}</h3>}
            {desc && <p className="t-small mt-0.5 text-ink-3">{desc}</p>}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </header>
      )}
      <div className="divide-y divide-line/10">{children}</div>
      {footer && <div className="border-t border-line/10 bg-surface-2/50 px-5 py-3.5 sm:px-6">{footer}</div>}
    </section>
  );
}

/**
 * A form row: label + help on the start column, the control on the end column
 * (stacked on phones). Pass `labelFor` to bind the label to an input.
 */
export function FieldRow({ label, labelFor, desc, children, className }) {
  return (
    <div className={cn("px-5 py-5 sm:px-6 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-8", className)}>
      <div className="mb-3 min-w-0 md:mb-0">
        {labelFor ? (
          <label htmlFor={labelFor} className="block text-[0.9375rem] font-medium text-ink">{label}</label>
        ) : (
          <p className="text-[0.9375rem] font-medium text-ink">{label}</p>
        )}
        {desc && <div className="t-small mt-1 text-ink-3">{desc}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A switch row with its own inline save state. */
export function ToggleRow({ title, desc, checked, onChange, disabled, saver, errorText, note, className }) {
  return (
    <div className={cn("px-5 py-4 sm:px-6", className)}>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={title} description={desc} />
      {note && <div className="t-caption mt-1.5 max-w-xl">{note}</div>}
      {saver && <SaveStatus status={saver.status} error={saver.error} errorText={errorText} className="mt-1.5" />}
    </div>
  );
}

/** Inline, polite status: saving… · saved ✓ · error. */
export function SaveStatus({ status, error, savedText, errorText, className }) {
  const t = useT("settings");
  const msg =
    status === "saving" ? t("status.saving")
      : status === "saved" ? savedText || t("status.saved")
      : status === "error" ? errorText || errorMessage(t, error)
      : "";
  return (
    <p aria-live="polite" className={cn("t-caption flex min-h-[1.25rem] items-center gap-1.5", status === "error" && "text-danger", status === "saved" && "text-green-600", !msg && "sr-only", className)}>
      {status === "saving" && <Spinner size={13} />}
      {status === "saved" && <Check size={14} aria-hidden="true" />}
      {status === "error" && <AlertCircle size={14} aria-hidden="true" />}
      <span>{msg}</span>
    </p>
  );
}

/** settings.errors.* text for a SettingsError (unknown codes → generic). */
export function errorMessage(t, error) {
  const code = error?.code;
  return code && t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic");
}

/** Text for a failed READ (never the "couldn't save" wording). */
const LOAD_CODES = new Set(["unavailable", "network", "sessionExpired", "forbidden"]);
export function loadErrorMessage(t, error) {
  return t(`errors.${LOAD_CODES.has(error?.code) ? error.code : "loadFailed"}`);
}

/** Segmented single choice (role="radiogroup"). options: [{ value, label, icon }] */
export function Choice({ value, onChange, options, label, className }) {
  const onKey = (e, i) => {
    const rtl = document.documentElement.dir === "rtl";
    const fwd = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    let next = null;
    if (e.key === fwd || e.key === "ArrowDown") next = (i + 1) % options.length;
    if (e.key === back || e.key === "ArrowUp") next = (i - 1 + options.length) % options.length;
    if (next === null) return;
    e.preventDefault();
    onChange(options[next].value);
    e.currentTarget.parentElement?.children[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex max-w-full gap-1 rounded-full border border-line/10 bg-surface-2/80 p-1", className)}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            lang={o.lang}
            className={cn(
              "inline-flex h-10 min-w-[6.5rem] items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-fast",
              on ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"
            )}
          >
            {o.icon && <o.icon size={16} aria-hidden="true" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** "2 days and 5 hours" / "يومان و5 ساعات" from milliseconds. */
export function useDurationText() {
  const t = useT("settings");
  const tc = useT("common");
  return (ms) => {
    const { days, hours, minutes } = splitDuration(ms);
    const d = days ? tc("units.days", { count: days }) : null;
    const h = hours ? t("units.hours", { count: hours }) : null;
    const m = minutes ? tc("units.minutes", { count: minutes }) : null;
    const parts = days ? [d, h] : [h, m];
    const [a, b] = parts.filter(Boolean);
    if (!a) return tc("units.minutes", { count: 1 });
    return b ? t("cooldown.join", { a, b }) : a;
  };
}

/** Cooldown line: "You can change it again in 3 days and 4 hours · Available again on 28 September, 14:00". */
export function CooldownNote({ endsAt, now, className }) {
  const t = useT("settings");
  const { locale } = useLocale();
  const duration = useDurationText();
  if (!endsAt || endsAt <= now) return null;
  const date = formatDate(endsAt, locale, { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
  return (
    <p className={cn("t-caption flex items-start gap-1.5", className)}>
      <Clock size={14} aria-hidden="true" className="mt-[3px] shrink-0 text-gold-600" />
      <span>
        <span className="block text-gold-700">{t("cooldown.availableIn", { time: duration(endsAt - now) })}</span>
        <span className="block">{t("cooldown.availableOn", { date })}</span>
      </span>
    </p>
  );
}

// ── skeletons ────────────────────────────────────────────────────────────
export function RowsSkeleton({ rows = 3, field = false }) {
  return (
    <div aria-hidden="true" className="divide-y divide-line/10">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cn("px-5 py-5 sm:px-6", field ? "md:grid md:grid-cols-[2fr_3fr] md:gap-8" : "flex items-center justify-between gap-6")}>
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-full max-w-[260px]" />
          </div>
          {field ? <Skeleton rounded="md" className="mt-3 h-11 w-full md:mt-0" /> : <Skeleton rounded="full" className="h-7 w-12 shrink-0" />}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ rows = 3, field = false, className }) {
  return (
    <div aria-hidden="true" className={cn("surface overflow-hidden", className)}>
      <div className="flex items-center gap-3.5 border-b border-line/10 px-5 py-4 sm:px-6">
        <Skeleton rounded="sm" className="h-9 w-9" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
      </div>
      <RowsSkeleton rows={rows} field={field} />
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div aria-busy="true" className="space-y-5">
      <CardSkeleton rows={3} field />
      <CardSkeleton rows={2} field />
    </div>
  );
}
