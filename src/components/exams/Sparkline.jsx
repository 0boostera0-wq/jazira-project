import { sparkline } from "./stats-logic";

/**
 * Inline-SVG accuracy sparkline (0–100) with a soft area, gap-aware segments
 * for days without exams, dots for isolated days and a 50% guide line.
 * With connectGaps, days without exams are skipped (points keep their true
 * x position) and every day with data gets a dot. No chart library. The figure is described by `label`; exact values live in
 * the surrounding text. Time runs in the reading direction (mirrored in RTL
 * by the caller with `flip-rtl`; the SVG has no text, so mirroring is safe).
 */
export default function Sparkline({ values, label, width = 600, height = 170, connectGaps = false, className }) {
  const pad = 10;
  const { segments, area, dots, points } = sparkline(values, { width, height, pad, connectGaps });
  const mid = pad + (height - 2 * pad) / 2;
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className={className}>
      <defs>
        <linearGradient id="jz-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--c-green-500))" stopOpacity="0.22" />
          <stop offset="100%" stopColor="rgb(var(--c-green-500))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={pad} x2={width - pad} y1={mid} y2={mid} stroke="rgb(var(--c-line))" strokeOpacity="0.18" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
      <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="rgb(var(--c-line))" strokeOpacity="0.14" vectorEffect="non-scaling-stroke" />
      {area.map((d, i) => <path key={`a${i}`} d={d} fill="url(#jz-spark-fill)" />)}
      {segments.map((d, i) => (
        <path key={`s${i}`} d={d} fill="none" stroke="rgb(var(--c-green-500))" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}
      {(connectGaps ? points : dots).map((p) => <circle key={`d${p.i}`} cx={p.x} cy={p.y} r="5" fill="rgb(var(--c-green-500))" />)}
      {last && <circle cx={last.x} cy={last.y} r="6.5" fill="rgb(var(--c-surface))" stroke="rgb(var(--c-green-600))" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
