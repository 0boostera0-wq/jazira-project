import { cn } from "@/components/ui/cn";
import { ArrowLink } from "@/components/stages/parts";

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

/** "View all →" for a panel header: the app's one arrow link, header size (the arrow follows the reading direction). */
export function PanelLink({ href, children, className }) {
  return (
    <ArrowLink href={href} size="sm" className={cn("-my-2 shrink-0", className)}>
      {children}
    </ArrowLink>
  );
}
