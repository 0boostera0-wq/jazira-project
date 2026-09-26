import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import Badge from "@/components/ui/Badge";
import IconTile from "@/components/ui/IconTile";
import { cn } from "@/components/ui/cn";

// Small building blocks shared by the landing sections (server-safe, no JS).

/** Section intro: eyebrow · title · lead. `id` goes on the heading (aria-labelledby). */
export function Intro({ id, eyebrow, title, lead, className, children }) {
  return (
    <div className={className}>
      {eyebrow && <p className="t-eyebrow">{eyebrow}</p>}
      <h2 id={id} className="t-h2 mt-2.5">{title}</h2>
      {lead && <p className="t-lead mt-4 max-w-[38rem]">{lead}</p>}
      {children}
    </div>
  );
}

/** Text link with an arrow that points in the reading direction. */
export function ArrowLink({ href, tone = "gold", children, className }) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex min-h-11 items-center gap-1.5 rounded-xs text-[0.9375rem] font-medium transition-colors",
        tone === "gold" ? "text-gold-600 hover:text-gold-700" : "text-ink-2 hover:text-ink",
        className
      )}
    >
      {children}
      <span className="inline-flex transition-transform duration-fast ease-out group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5">
        <ArrowRight size={16} aria-hidden="true" className="flip-rtl" />
      </span>
    </Link>
  );
}

/** Icon tile + title + one line — used in feature lists. Render inside a <ul>. */
export function Point({ icon, title, body, tone = "gold" }) {
  return (
    <li className="flex gap-3.5">
      <IconTile icon={icon} tone={tone} size="sm" className="mt-0.5" />
      <div className="min-w-0">
        <p className="font-medium leading-snug text-ink">{title}</p>
        <p className="t-small mt-1 text-ink-3">{body}</p>
      </div>
    </li>
  );
}

/** "Illustrative example" pill that marks product mocks as non-real data (a design-system Badge). */
export function MockTag({ children, className }) {
  return (
    <Badge tone="outline" size="sm" className={cn("shrink-0", className)}>
      {children}
    </Badge>
  );
}
