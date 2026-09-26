import { ScrollText } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { ExternalLink } from "./parts";

/**
 * "About this grade's plan" — where the subject list comes from and what the
 * plan does (and doesn't) say. rows: [{ label, value, hint?, wide? }]. Server-safe.
 */
export default function PlanCard({ title, titleId, rows, source, note, className }) {
  return (
    <section aria-labelledby={titleId} className={cn("rounded-lg border border-line/15 bg-surface-2/70 p-5 sm:p-6", className)}>
      <div className="flex items-center gap-2.5">
        <ScrollText size={18} aria-hidden="true" className="shrink-0 text-gold-600" />
        <h2 id={titleId} className="t-h4">{title}</h2>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4">
        {rows.map((r) => (
          <div key={r.label} className={cn("min-w-0", r.wide && "col-span-2")}>
            <dt className="t-caption">{r.label}</dt>
            <dd className="t-small mt-0.5 font-medium text-ink">{r.value}</dd>
            {r.hint && <dd className="t-caption">{r.hint}</dd>}
          </div>
        ))}
      </dl>

      {source && (
        <ExternalLink href={source.href} newTabLabel={source.newTab} className="mt-2 min-h-11 text-sm font-medium text-gold-600 hover:text-gold-700">
          {source.label}
        </ExternalLink>
      )}
      {note && <p className="t-caption mt-1 border-t border-line/10 pt-3">{note}</p>}
    </section>
  );
}
