import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ui/cn";
import { SubjectTile } from "./SubjectIcon";
import { Chevron } from "./parts";

/**
 * Grade cards for a stage page (server-safe). Each card links to the grade.
 *   items: [{ key, href, badge, name, meta, subjects: [{ id, icon, color }], newLabel, newSubjects: [{ id, name }], note? }]
 */
export default function GradeCards({ items, className }) {
  return (
    <ol className={cn("grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3", className)}>
      {items.map((g, i) => (
        // An odd last card spans the row in the two-column layout (no orphan beside empty space).
        <li key={g.key} className={cn(items.length % 2 === 1 && i === items.length - 1 && "sm:col-span-2 xl:col-span-1")}>
          <Link
            href={g.href}
            className="group flex h-full flex-col rounded-lg border border-line/15 bg-surface p-4 shadow-xs transition-[transform,box-shadow,border-color] duration ease-out hover:-translate-y-0.5 hover:border-line/20 hover:shadow-md"
          >
            <div className="flex items-center gap-3.5">
              <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-gold-50 text-lg font-bold text-gold-700 ring-1 ring-inset ring-gold-200/60 tabular">
                {g.badge}
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-h4 block">{g.name}</span>
                <span className="t-caption block">{g.meta}</span>
              </span>
              <Chevron />
            </div>

            <ul aria-hidden="true" className="mt-4 flex flex-wrap gap-1">
              {g.subjects.map((s) => (
                <li key={s.id}>
                  <SubjectTile subject={s} size="xs" />
                </li>
              ))}
            </ul>

            {g.note && !g.newSubjects?.length && <p className="t-caption mt-auto pt-4">{g.note}</p>}
            {g.newSubjects?.length > 0 && (
              <div className="mt-auto pt-4">
                <p className="t-caption font-medium text-gold-600">{g.newLabel}</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {g.newSubjects.map((s) => (
                    <li key={s.id} className="inline-flex h-7 items-center rounded-full border border-gold-200/70 bg-gold-50 px-2.5 text-[0.8125rem] font-medium text-gold-700">
                      {s.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Link>
        </li>
      ))}
    </ol>
  );
}
