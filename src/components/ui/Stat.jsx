import { cn } from "./cn";

const SURFACE = {
  flat: "surface-flat",                                          // standalone tile on canvas
  tint: "rounded-md border border-line/10 bg-surface-2/70",       // inset tile inside a card
  plain: "bg-surface",                                            // joined grids (gap-px dividers)
};
const PAD = { sm: "px-3.5 py-3", md: "p-4 sm:p-5" };
const VALUE = { sm: "text-lg", md: "text-2xl" };
const ICON_TONE = { gold: "text-gold-600", green: "text-green-600", neutral: "text-ink-3" };

/**
 * KPI tile — the one "number + label" pattern (dashboard performance, exam
 * history, achievements summary). Values are pre-formatted strings.
 * Renders a <dt>/<dd> group, so tiles always sit inside a <dl>: use <StatList>.
 *
 *   <StatList className="grid-cols-2 lg:grid-cols-4">
 *     <Stat label="…" value="82%" hint="…" icon={Target} tone="green" />
 *   </StatList>
 *
 * size: "md" (text-2xl value) | "sm" (text-lg, compact inset)
 * surface: "flat" | "tint" | "plain"
 * icon: optional lucide icon shown inline before the label, coloured by `tone`
 * ltr: isolate the value as an LTR run (times, ratios); muted: de-emphasised value ("—")
 */
export default function Stat({ label, value, hint, icon: Icon, tone = "gold", size = "md", surface = "flat", ltr = false, muted = false, className }) {
  return (
    <div className={cn("flex min-w-0 flex-col", SURFACE[surface], PAD[size], className)}>
      <dt className={cn("t-caption", Icon && "flex items-start gap-1.5")}>
        {Icon && <Icon size={size === "sm" ? 14 : 15} aria-hidden="true" className={cn("mt-[3px] shrink-0", ICON_TONE[tone] || ICON_TONE.gold)} />}
        <span>{label}</span>
      </dt>
      <dd className={cn("mt-1 font-bold leading-tight tabular", muted ? "text-sm font-medium text-ink-3" : cn("text-ink", VALUE[size]), ltr && "num")}>
        {value}
      </dd>
      {hint && <dd className="t-caption mt-1 truncate">{hint}</dd>}
    </div>
  );
}

/** The <dl> grid that holds <Stat> tiles. Pass the column classes. */
export function StatList({ className, children }) {
  return <dl className={cn("grid gap-3 lg:gap-4", className)}>{children}</dl>;
}
