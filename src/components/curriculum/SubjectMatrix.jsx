import { formatNumber } from "@/i18n/format";
import { cn } from "@/components/ui/cn";
import { SubjectTile } from "./SubjectIcon";

/**
 * Subject × grade table of annual periods (the plan's maximum), server-safe.
 *   columns: [{ key, label, href }] · rows: [{ key, name, subject, cells: [number|null] }]
 *   totals: [number] (optional footer) · copy: { caption, subject, notTaught, total }
 * On narrow screens the table scrolls inside its own frame (the page never does);
 * the frame is a named, focusable region so keyboard users can scroll it too.
 */
export default function SubjectMatrix({ columns, rows, totals, copy, locale, className }) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-line/15 bg-surface", className)}>
      <div role="region" aria-label={copy.caption} tabIndex={0} className="overflow-x-auto rounded-lg [scrollbar-width:thin] focus-visible:[outline-offset:-2px]">
        <table className="w-full border-collapse text-start" style={{ minWidth: `calc(10rem + ${columns.length} * 4rem)` }}>
          <caption className="sr-only">{copy.caption}</caption>
          <thead>
            <tr className="border-b border-line/15 bg-surface-2/70">
              <th scope="col" className="sticky start-0 z-10 bg-surface-2 px-4 py-3 text-start text-[0.8125rem] font-medium text-ink-3">
                {copy.subject}
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className="px-2 py-3 text-center text-[0.8125rem] font-medium text-ink-3">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-line/10 last:border-b-0">
                <th scope="row" className="sticky start-0 z-10 bg-surface px-4 py-2.5 text-start font-normal">
                  <span className="flex min-w-[8.5rem] items-center gap-2.5 sm:min-w-[12rem]">
                    <SubjectTile subject={r.subject} size="sm" />
                    <span className="text-sm font-medium leading-snug text-ink">{r.name}</span>
                  </span>
                </th>
                {r.cells.map((v, i) => (
                  <td key={columns[i].key} className="px-2 py-2.5 text-center">
                    {v == null ? (
                      <span className="text-ink-3" aria-label={copy.notTaught} title={copy.notTaught}>
                        —
                      </span>
                    ) : (
                      <span className="text-sm text-ink-2 tabular">{formatNumber(v, locale)}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot>
              <tr className="border-t border-line/15 bg-surface-2/50">
                <th scope="row" className="sticky start-0 z-10 bg-surface-2 px-4 py-3 text-start text-[0.8125rem] font-medium text-ink-2">
                  {copy.total}
                </th>
                {totals.map((v, i) => (
                  <td key={columns[i].key} className="px-2 py-3 text-center text-sm font-bold text-ink tabular">
                    {formatNumber(v, locale)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
