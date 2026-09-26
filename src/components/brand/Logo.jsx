import { cn } from "@/components/ui/cn";
import { BRAND_COLORS, LOCKUPS } from "./geometry";
import { MarkShape, markTransform } from "./IslandMark";

// Mark height in px per size; the wordmark scales with it (one SVG, one lockup).
const HEIGHT = { sm: 30, md: 36, lg: 46 };

/**
 * The Jazira lockup: mark + outlined wordmark (Alexandria Bold) — the same
 * artwork as public/images/brand/jazira-lockup-{ar,en}.svg, inline so it is
 * crisp, request-free and follows the theme (currentColor: brand teal, ivory
 * in dark mode; the gold dots stay gold). Arabic shows «جزيرة» with the mark on
 * the right, English «Jazira» with the mark on the left.
 *   <Logo name={t("brand.full")} />     `name` is the accessible name; its script
 *                                       picks the lockup unless `lang` is given.
 */
export default function Logo({ name, lang, size = "md", subtitle, className }) {
  const L = LOCKUPS[lang || (/[\u0600-\u06FF]/.test(name || "") ? "ar" : "en")];
  const [, , width, height] = L.viewBox.split(" ").map(Number);
  const h = (HEIGHT[size] || HEIGHT.md) * (height / L.mark.size);
  const svg = (
    <svg
      role="img"
      aria-label={name}
      viewBox={L.viewBox}
      height={Math.round(h)}
      width={Math.round((h * width) / height)}
      className={cn("block shrink-0 text-[#1F4F45] dark:text-[#F3ECDD]", !subtitle && className)}
    >
      <g transform={markTransform(L.mark.x, 0, L.mark.size)}>
        <MarkShape />
      </g>
      <g transform={`translate(${L.word.x} ${L.word.y})`}>
        <path d={L.word.body} fill="currentColor" />
        {L.word.accent && <path d={L.word.accent} fill={BRAND_COLORS.gold} />}
      </g>
    </svg>
  );
  if (!subtitle) return svg;
  return (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      {svg}
      <span className="text-xs font-medium text-ink-3">{subtitle}</span>
    </span>
  );
}
