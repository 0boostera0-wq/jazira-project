import { ArrowRight, ChevronDown } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ui/cn";

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Wrap literal (case-insensitive) occurrences of the search terms in <mark>. */
function highlight(text, terms) {
  const list = (terms || []).filter((w) => w.length > 1);
  if (!list.length) return text;
  const re = new RegExp(`(${list.map(escapeRe).join("|")})`, "gi");
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-[3px] bg-gold-100 text-ink shadow-[0_0_0_2px_rgb(var(--c-gold-100))]">{part}</mark>
    ) : (
      part
    )
  );
}

/**
 * Accessible FAQ accordion built on native <details>/<summary>: keyboard and
 * screen-reader support for free, works without JavaScript, and every answer
 * is in the HTML for search engines. Server-safe (no hooks).
 *
 * items: [{ id, q, a, href?, link? }] · terms: words to highlight · openFirst/openAll
 */
export default function FaqList({ items, terms, openFirst = false, openAll = false, className }) {
  return (
    <div className={cn("divide-y divide-line/10", className)}>
      {items.map((it, i) => (
        <details key={it.id} id={`q-${it.id}`} open={openAll || (openFirst && i === 0) ? true : undefined} className="group scroll-mt-28">
          <summary
            className={cn(
              "flex min-h-[3.5rem] cursor-pointer list-none items-start justify-between gap-4 py-4 text-start",
              "[&::-webkit-details-marker]:hidden"
            )}
          >
            <span className="pt-0.5 text-[1rem] font-medium leading-relaxed text-ink transition-colors group-hover:text-gold-700 sm:text-[1.0625rem]">
              {highlight(it.q, terms)}
            </span>
            <span
              aria-hidden="true"
              className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3 transition-[transform,background-color,color] duration ease-out group-open:rotate-180 group-open:bg-gold-50 group-open:text-gold-600"
            >
              <ChevronDown size={16} />
            </span>
          </summary>
          <div className="animate-fade pb-5 pe-2 sm:pe-12">
            <p className="t-body max-w-prose text-ink-2">{highlight(it.a, terms)}</p>
            {it.href && it.link && (
              <Link
                href={it.href}
                className="mt-3 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-xs text-sm font-medium text-gold-600 underline-offset-4 hover:underline"
              >
                {it.link}
                <ArrowRight size={15} className="flip-rtl" aria-hidden="true" />
              </Link>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
