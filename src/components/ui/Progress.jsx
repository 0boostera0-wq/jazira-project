import { cn } from "./cn";

/** Linear progress (0–100). */
export function ProgressBar({ value = 0, tone = "gold", size = "md", label, className }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const fill = { gold: "bg-gold-400", green: "bg-green-500", ink: "bg-primary", danger: "bg-danger" }[tone];
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={label}
      className={cn("w-full overflow-hidden rounded-full bg-surface-3/70", size === "sm" ? "h-1.5" : size === "lg" ? "h-3" : "h-2", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-slow ease-out", fill)} style={{ width: `${v}%` }} />
    </div>
  );
}

/** Circular progress ring (0–100) with centred content. */
export function ProgressRing({ value = 0, size = 72, stroke = 7, tone = "gold", label, children, className }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = { gold: "rgb(var(--c-gold-400))", green: "rgb(var(--c-green-500))", ink: "rgb(var(--c-ink))" }[tone];
  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--c-surface-3))" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: "stroke-dashoffset 600ms var(--ease-out)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
