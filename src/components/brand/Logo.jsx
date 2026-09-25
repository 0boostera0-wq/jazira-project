import IslandMark from "./IslandMark";
import { cn } from "@/components/ui/cn";

/**
 * Mark + wordmark. The wordmark is real text (localized via `name`), so it is
 * selectable, translatable and crisp. Server-safe (no hooks beyond useId).
 *   <Logo name={t("brand.name")} />            (inside a Link where needed)
 */
export default function Logo({ name, size = "md", subtitle, className }) {
  const mark = { sm: 30, md: 36, lg: 44 }[size];
  const text = { sm: "text-[1.0625rem]", md: "text-[1.1875rem]", lg: "text-2xl" }[size];
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <IslandMark size={mark} />
      <span className="flex flex-col leading-none">
        <span className={cn("font-bold text-ink", text)}>{name}</span>
        {subtitle && <span className="mt-1 text-[0.6875rem] font-medium text-ink-3">{subtitle}</span>}
      </span>
    </span>
  );
}
