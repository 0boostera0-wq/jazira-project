import { useId } from "react";
import { cn } from "@/components/ui/cn";
import { sparkline } from "./stats-logic";

/** Default viewBox (the dashboard card); /exams/history passes a wider one. */
export const SPARK_SIZE = Object.freeze({ width: 320, height: 96, pad: 8 });

/**
 * The accuracy-over-time sparkline (0–100) — one component for the dashboard
 * and /exams/history. Inline SVG, no chart library: a soft green area,
 * gap-aware segments (or, with connectGaps, one line across the practice
 * days), a hollow dot per practice day, the newest one filled, dashed guides
 * at 100 % and 50 % and a solid base line. Geometry comes from
 * stats-logic.sparkline(), so callers can place scale labels on the same grid.
 *
 *   values      accuracy per day, oldest first (null = no graded attempt)
 *   label       accessible description of the whole figure
 *   pointLabel  optional (index) → title for that day's dot
 *
 * Time runs in the reading direction: the SVG holds no text, so it is simply
 * mirrored in RTL (`flip-rtl`).
 */
export default function Sparkline({ values, label, pointLabel, size = SPARK_SIZE, connectGaps = false, className }) {
  const fillId = `spark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const g = sparkline(values, { ...size, connectGaps });
  const r = Math.max(2.5, g.height * 0.03);
  const last = g.points[g.points.length - 1];
  // With connectGaps every practice day gets a dot; otherwise only isolated
  // days do (inside a segment the line shows the value). The newest is always marked.
  const marks = connectGaps ? g.points : g.dots;
  const dots = last && !marks.includes(last) ? [...marks, last] : marks;
  const guide = (y, key, solid = false) => (
    <line
      key={key}
      x1={g.pad}
      x2={g.width - g.pad}
      y1={y}
      y2={y}
      stroke={`rgb(var(--c-line) / ${solid ? 0.2 : 0.12})`}
      strokeWidth="1"
      strokeDasharray={solid ? undefined : "3 4"}
      vectorEffect="non-scaling-stroke"
    />
  );
  return (
    <svg viewBox={`0 0 ${g.width} ${g.height}`} role="img" aria-label={label} className={cn("block h-auto w-full overflow-visible flip-rtl", className)}>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--c-green-500))" stopOpacity="0.22" />
          <stop offset="100%" stopColor="rgb(var(--c-green-500))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {guide(g.topY, "top")}
      {guide(g.midY, "mid")}
      {guide(g.baseY, "base", true)}
      {g.area.map((d, i) => <path key={`a${i}`} d={d} fill={`url(#${fillId})`} />)}
      {g.segments.map((d, i) => (
        <path key={`s${i}`} d={d} fill="none" stroke="rgb(var(--c-green-500))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}
      {dots.map((p) => (
        <circle
          key={p.i}
          cx={p.x}
          cy={p.y}
          r={p === last ? r * 1.4 : r}
          fill={p === last ? "rgb(var(--c-green-600))" : "rgb(var(--c-surface))"}
          stroke="rgb(var(--c-green-600))"
          strokeWidth="1.75"
          vectorEffect="non-scaling-stroke"
        >
          {pointLabel && <title>{pointLabel(p.i)}</title>}
        </circle>
      ))}
    </svg>
  );
}
