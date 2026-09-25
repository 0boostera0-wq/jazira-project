// Locale-aware formatting. Pure functions usable on server and client.
// Always pass the active locale ("ar" | "en"); never hardcode digits or dates.

import { intlLocale } from "./config";

const cache = new Map();
function fmt(kind, locale, opts) {
  const key = `${kind}|${locale}|${JSON.stringify(opts || {})}`;
  if (!cache.has(key)) {
    const L = intlLocale(locale);
    cache.set(
      key,
      kind === "n" ? new Intl.NumberFormat(L, opts)
        : kind === "d" ? new Intl.DateTimeFormat(L, opts)
        : new Intl.RelativeTimeFormat(L, opts)
    );
  }
  return cache.get(key);
}

export const formatNumber = (n, locale, opts) => fmt("n", locale, opts).format(Number(n) || 0);

export const formatPercent = (ratio, locale, digits = 0) =>
  fmt("n", locale, { style: "percent", maximumFractionDigits: digits }).format(Number(ratio) || 0);

export function formatDate(value, locale, opts = { day: "numeric", month: "long", year: "numeric" }) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return fmt("d", locale, opts).format(d);
}

/** "منذ ٣ دقائق" / "3 minutes ago" — replaces the old Arabic-only timeAgo. */
export function formatRelative(value, locale, now = Date.now()) {
  const d = value instanceof Date ? value : new Date(value);
  const diff = (d.getTime() - now) / 1000; // negative = past
  const abs = Math.abs(diff);
  const rtf = fmt("r", locale, { numeric: "auto" });
  if (abs < 45) return rtf.format(0, "second");
  if (abs < 60 * 45) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 3600 * 22) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 6) return rtf.format(Math.round(diff / 86400), "day");
  if (abs < 86400 * 27) return rtf.format(Math.round(diff / (86400 * 7)), "week");
  return formatDate(d, locale, { day: "numeric", month: "short", year: "numeric" });
}

/** mm:ss (or h:mm:ss) — timers always use Western digits for legibility. */
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${String(m).padStart(2, "0")}:${sec}`;
}

/** Price with currency, e.g. 19 SAR → "19 ر.س" / "SAR 19". */
export const formatPrice = (amount, locale, currency = "SAR") =>
  fmt("n", locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
