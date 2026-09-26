import { FileText } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { subjectIcon } from "./icons";
import { CatalogName } from "./parts";

/** Every subject taught in a stage (from the catalog), as a compact two-column index. */
export default function SubjectIndex({ title, note, resourcesNote, subjects, locale, className }) {
  return (
    <section aria-label={title} className={cn("surface-flat flex h-full flex-col p-5 sm:p-6", className)}>
      <h3 className="t-h4">{title}</h3>
      <p className="t-small mt-1 text-ink-3">{note}</p>
      <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-3 sm:gap-x-4">
        {subjects.map((s) => {
          const Icon = subjectIcon(s.icon);
          return (
            <li key={s.id} className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-surface-2 text-ink-2 ring-1 ring-inset ring-line/10">
                <Icon size={16} />
              </span>
              <CatalogName node={s} locale={locale} className="t-small min-w-0 font-medium leading-snug text-ink" />
            </li>
          );
        })}
      </ul>
      {resourcesNote && (
        <div className="mt-auto pt-6">
          <p className="t-caption flex items-start gap-2 border-t border-line/10 pt-4">
            <FileText size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-gold-600" />
            {resourcesNote}
          </p>
        </div>
      )}
    </section>
  );
}
