import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "./cn";

/**
 * items: [{ label, href? }] — last item is the current page (no href).
 * Chevron points in the reading direction (left in RTL, right in LTR).
 */
export default function Breadcrumbs({ items, label, className }) {
  return (
    <nav aria-label={label} className={cn("text-sm", className)}>
      <ol className="flex flex-wrap items-center gap-1.5 text-ink-3">
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${it.label}-${i}`} className="flex items-center gap-1.5">
              {it.href && !last ? (
                // after: pseudo-element extends the hit area to ≥44px tall without changing the row's height
                <Link href={it.href} className="relative rounded-xs transition-colors after:absolute after:-inset-y-3 after:inset-x-0 after:content-[''] hover:text-ink">{it.label}</Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn(last && "font-medium text-ink-2")}>{it.label}</span>
              )}
              {!last && <ChevronLeft size={14} className="text-ink-3 ltr:rotate-180" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
