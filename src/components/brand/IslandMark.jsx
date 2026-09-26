import { cn } from "@/components/ui/cn";
import { BRAND_COLORS, MARK } from "./geometry";

/**
 * Transform that fits the stroked mark's tight bounds into a `size` square at
 * (x, y) — the same placement the brand-kit builder uses for every file
 * (src/app/icon.svg, public/images/brand/*), so inline and static marks match.
 */
export function markTransform(x, y, size) {
  const { box } = MARK;
  const s = size / Math.max(box.w, box.h);
  const ox = x + (size - box.w * s) / 2 - box.x * s;
  const oy = y + (size - box.h * s) / 2 - box.y * s;
  return `translate(${ox.toFixed(2)} ${oy.toFixed(2)}) scale(${s.toFixed(4)})`;
}

/** The mark's stroke (currentColor) and gold dot, on its 64-unit grid. */
export function MarkShape({ dot = BRAND_COLORS.gold }) {
  return (
    <>
      <path d={MARK.d} fill="none" stroke="currentColor" strokeWidth={MARK.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={MARK.dot.cx} cy={MARK.dot.cy} r={MARK.dot.r} fill={dot} />
    </>
  );
}

const TONE = { auto: "text-[#1F4F45] dark:text-[#F3ECDD]", onDark: "text-[#F3ECDD]", onLight: "text-[#1F4F45]" };

/**
 * The Jazira mark — the letter ج (the first letter of جزيرة) drawn as one
 * stroke: its head is the horizon, its bowl the sea's sheltering curve, and
 * the gold dot the island at its heart. See docs/BRAND.md.
 * Inline SVG (no request, crisp from 16px). The stroke follows currentColor;
 * the dot is always gold.
 *   tone  "auto" (teal; ivory in dark mode) · "onDark" (always ivory: dark bands) · "onLight" (always teal)
 *   tile  the app-icon form: ivory mark on the teal rounded tile (= favicon).
 */
export default function IslandMark({ size = 36, tile = false, tone = "auto", className, title }) {
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true };
  if (tile) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" className={cn("shrink-0", className)} {...a11y}>
        <rect width="64" height="64" rx="14.4" fill={BRAND_COLORS.teal} />
        <g transform={markTransform(12, 12, 40)} style={{ color: BRAND_COLORS.ivory }}>
          <MarkShape />
        </g>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cn("shrink-0", TONE[tone] || TONE.auto, className)} {...a11y}>
      <g transform={markTransform(0, 0, 64)}>
        <MarkShape />
      </g>
    </svg>
  );
}
