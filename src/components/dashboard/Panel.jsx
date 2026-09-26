import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ui/cn";

/**
 * Dashboard card frame (server-safe): a titled surface whose heading paints
 * with the shell while the body (usually a client island) loads on its own.
 */
export default function Panel({ id, title, eyebrow, action, tone = "surface", className, bodyClassName, children }) {
  return (
    <section
      aria-labelledby={id}
      className={cn(tone === "tint" ? "surface-tint" : "surface", "min-w-0 p-5 sm:p-6", className)}
    >
      <header className={cn("flex justify-between gap-3", eyebrow ? "items-end" : "items-center")}>
        <div className="min-w-0">
          {eyebrow && <p className="t-eyebrow mb-1">{eyebrow}</p>}
          <h2 id={id} className="t-h4">{title}</h2>
        </div>
        {action}
      </header>
      <div className={cn("mt-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Small "view all →" link for a panel header. The arrow follows the reading direction. */
export function PanelLink({ href, children, className }) {
  return (
    <Link
      href={href}
      className={cn(
        "-my-2 -me-1 inline-flex h-10 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-gold-600 transition-colors hover:bg-gold-50",
        className
      )}
    >
      {children}
      <ArrowRight size={15} aria-hidden="true" className="flip-rtl" />
    </Link>
  );
}
