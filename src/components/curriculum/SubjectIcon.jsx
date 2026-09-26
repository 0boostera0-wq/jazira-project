import { cn } from "@/components/ui/cn";
import { subjectGlyph } from "./subjectGlyphs";

// Subject glyphs and colour tiles. Server-safe (no hooks, no motion). The
// glyph map itself is ./subjectGlyphs.js — the one map the whole app uses.
export { subjectGlyph };

/** Bare glyph. */
export default function SubjectIcon({ id, icon, size = 20, className }) {
  const Icon = subjectGlyph({ id, icon });
  return <Icon size={size} aria-hidden="true" className={className} />;
}

const TILE = {
  xs: ["h-7 w-7 rounded-sm", 14],
  sm: ["h-8 w-8 rounded-sm", 16],
  md: ["h-11 w-11 rounded-md", 20],
  lg: ["h-14 w-14 rounded-lg", 26],
};

/**
 * Subject colour tile. The subject colour is a CSS variable; the tint and the
 * glyph colour are mixed per theme so contrast holds in light and dark mode.
 */
export function SubjectTile({ subject, size = "md", className }) {
  const [box, px] = TILE[size] || TILE.md;
  const Icon = subjectGlyph(subject || {});
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center ring-1 ring-inset",
        "bg-[color-mix(in_srgb,var(--subj)_11%,transparent)] text-[color:var(--subj)] ring-[color:color-mix(in_srgb,var(--subj)_22%,transparent)]",
        "dark:bg-[color-mix(in_srgb,var(--subj)_24%,transparent)] dark:text-[color:color-mix(in_srgb,var(--subj)_45%,white)] dark:ring-[color:color-mix(in_srgb,var(--subj)_40%,transparent)]",
        box,
        className
      )}
      style={{ "--subj": subject?.color || "#9A722C" }}
    >
      <Icon size={px} />
    </span>
  );
}
