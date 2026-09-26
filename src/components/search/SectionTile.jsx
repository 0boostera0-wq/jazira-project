import { cn } from "@/components/ui/cn";
import { sectionColor, sectionIcon } from "@/components/exams/labels";

/**
 * Exam-section glyph on a tile tinted with the section colour (mixed per theme
 * so the glyph keeps its contrast in dark mode). Server-safe.
 */
export default function SectionTile({ section, size = "sm" }) {
  const Icon = sectionIcon(section);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center ring-1 ring-inset",
        "bg-[color-mix(in_srgb,var(--subj)_11%,transparent)] text-[color:var(--subj)] ring-[color:color-mix(in_srgb,var(--subj)_22%,transparent)]",
        "dark:bg-[color-mix(in_srgb,var(--subj)_24%,transparent)] dark:text-[color:color-mix(in_srgb,var(--subj)_45%,white)] dark:ring-[color:color-mix(in_srgb,var(--subj)_40%,transparent)]",
        size === "md" ? "h-11 w-11 rounded-md" : "h-8 w-8 rounded-sm"
      )}
      style={{ "--subj": sectionColor(section) || "#9A722C" }}
    >
      <Icon size={size === "md" ? 20 : 16} />
    </span>
  );
}
