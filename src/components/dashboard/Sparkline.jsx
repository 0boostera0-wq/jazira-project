import { sparklineGeometry } from "./model";
import { cn } from "@/components/ui/cn";

/**
 * Inline-SVG accuracy sparkline (no chart library). Time runs in the reading
 * direction: oldest at the start, today at the end (mirrored in RTL).
 * Pure presentation — `series` comes from dailySeries(), labels are passed in.
 *   pointLabel(point) → accessible title for each practice day
 */
export const SPARK_SIZE = Object.freeze({ width: 320, height: 96, pad: 8 });

export default function Sparkline({ series, label, pointLabel, className }) {
  const g = sparklineGeometry(series, SPARK_SIZE);
  const last = g.points[g.points.length - 1];
  return (
    <svg
      viewBox={`0 0 ${g.width} ${g.height}`}
      role="img"
      aria-label={label}
      className={cn("block h-auto w-full overflow-visible flip-rtl", className)}
    >
      <line x1={g.pad} x2={g.width - g.pad} y1={g.topY} y2={g.topY} stroke="rgb(var(--c-line) / 0.12)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <line x1={g.pad} x2={g.width - g.pad} y1={g.midY} y2={g.midY} stroke="rgb(var(--c-line) / 0.12)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <line x1={g.pad} x2={g.width - g.pad} y1={g.baseY} y2={g.baseY} stroke="rgb(var(--c-line) / 0.2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {g.area && <path d={g.area} fill="rgb(var(--c-gold-400) / 0.14)" />}
      {g.points.length > 1 && (
        <path d={g.path} fill="none" stroke="rgb(var(--c-gold-500))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      )}
      {g.points.map((p) => (
        <circle
          key={p.day}
          cx={p.x}
          cy={p.y}
          r={p === last ? 4 : 2.75}
          fill={p === last ? "rgb(var(--c-gold-500))" : "rgb(var(--c-surface))"}
          stroke="rgb(var(--c-gold-500))"
          strokeWidth="1.75"
        >
          {pointLabel && <title>{pointLabel(p)}</title>}
        </circle>
      ))}
    </svg>
  );
}
