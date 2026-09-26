import { Link } from "@/i18n/navigation";
import Illustration from "@/components/ui/Illustration";
import { cn } from "@/components/ui/cn";
import { subjectGlyph } from "./SubjectIcon";
import { Chevron } from "./parts";

// Stage cards for the curriculum hub. The whole card links to the stage;
// the grade / track chips inside are their own targets (44px tall on touch screens).

const chip =
  "relative z-10 inline-flex h-11 min-w-11 items-center justify-center whitespace-nowrap rounded-full border border-line/15 bg-surface px-3 text-sm font-medium text-ink-2 transition-colors duration-fast hover:border-gold-300 hover:bg-gold-50 hover:text-ink sm:h-9 sm:min-w-9";

// Full-bleed image band (the card clips it to its radius).
function ArtBand({ art, sizes, className }) {
  return (
    <div aria-hidden="true" className={cn("relative overflow-hidden", className)}>
      <Illustration id={art} fill sizes={sizes} />
    </div>
  );
}

/** Elementary / middle: art band on top, copy, grade chips. */
export default function StageCard({ href, art, name, range, body, meta, gradesLabel, grades, className }) {
  return (
    <article className={cn("group relative flex h-full flex-col overflow-hidden rounded-xl border border-line/15 bg-surface shadow-sm transition-[box-shadow,border-color] duration ease-out hover:border-line/20 hover:shadow-md", className)}>
      <ArtBand art={art} sizes="(min-width: 1024px) 50vw, 100vw" className="h-36 sm:h-52" />
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="t-caption font-medium text-gold-600">{range}</p>
            <h3 className="t-h3 mt-0.5">
              <Link href={href} className="rounded-xs after:absolute after:inset-0 after:content-['']">
                {name}
              </Link>
            </h3>
          </div>
          <Chevron className="mt-1" />
        </div>
        <p className="t-small mt-2 text-ink-3">{body}</p>
        <div className="mt-auto pt-5">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <p className="t-caption font-medium">{gradesLabel}</p>
            {meta && <p className="t-caption">{meta}</p>}
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {grades.map((g) => (
              <li key={g.key}>
                <Link href={g.href} className={chip} aria-label={g.aria}>
                  {g.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}

/**
 * High school: art beside the copy; the common first year, then a compact
 * track × year table (each cell a link).
 *   tracks: [{ key, name, icon, id, cells: [{ key, label, href, aria }] }]
 */
export function HighSchoolCard({ href, art, name, range, body, meta, common, yearHeads, trackLabel, tracks, className }) {
  return (
    <article className={cn("group relative grid overflow-hidden rounded-xl border border-line/15 bg-surface shadow-sm transition-[box-shadow,border-color] duration ease-out hover:border-line/20 hover:shadow-md md:grid-cols-12", className)}>
      <ArtBand art={art} sizes="(min-width: 768px) 34vw, 100vw" className="h-40 sm:h-56 md:col-span-4 md:h-full md:min-h-[18rem]" />
      <div className="flex flex-col p-5 sm:p-6 md:col-span-8 lg:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="t-caption font-medium text-gold-600">{range}</p>
            <h3 className="t-h3 mt-0.5">
              <Link href={href} className="rounded-xs after:absolute after:inset-0 after:content-['']">
                {name}
              </Link>
            </h3>
          </div>
          <Chevron className="mt-1" />
        </div>
        <p className="t-small mt-2 max-w-2xl text-ink-3">{body}</p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line/10 pt-4">
          {common ? (
            <Link href={common.href} className={chip}>
              {common.label}
            </Link>
          ) : (
            <span />
          )}
          {meta && <p className="t-caption">{meta}</p>}
        </div>

        <table className="mt-3 w-full border-separate border-spacing-y-1.5 text-start">
          <thead>
            <tr>
              <th scope="col" className="t-caption pb-1 text-start font-medium">{trackLabel}</th>
              {yearHeads.map((h) => (
                <th key={h} scope="col" className="t-caption w-[5.5rem] pb-1 text-center font-medium sm:w-28">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tracks.map((tr) => {
              const Icon = subjectGlyph({ icon: tr.icon });
              return (
                <tr key={tr.key}>
                  <th scope="row" className="pe-2 text-start font-normal">
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon size={16} aria-hidden="true" className="shrink-0 text-ink-3" />
                      <span className="text-sm font-medium leading-snug text-ink">{tr.name}</span>
                    </span>
                  </th>
                  {tr.cells.map((c) => (
                    <td key={c.key} className="text-center">
                      {c.href ? (
                        <Link href={c.href} aria-label={c.aria} className={cn(chip, "w-full px-2 text-[0.8125rem] tabular")}>
                          {c.label}
                        </Link>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}
