import { ArrowUpRight, KeyRound, Landmark } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { ExternalLink } from "./parts";

/**
 * "Where the official textbooks are" — Madrasati (Muqarrarati) first, iEN as
 * the alternative channel. Presentational and hook-free, so both the server
 * pages and the subject drawer (client) render it. All copy arrives as props:
 *   copy:  { title, body, steps[], open, about, ien, account, noDeepLinks, newTab }
 *   links: { madrasati, service, ien }
 * `compact` drops the steps (the drawer already explains the context).
 */
export default function OfficialChannels({ copy, links, compact = false, as: Tag = "section", className, titleId }) {
  const Heading = compact ? "h3" : "h2";
  return (
    <Tag aria-labelledby={titleId} className={cn("rounded-lg border border-line/15 bg-surface p-5 sm:p-6", className)}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-green-50 text-green-700 ring-1 ring-inset ring-green-100">
          <Landmark size={19} />
        </span>
        <div className="min-w-0">
          <Heading id={titleId} className="t-h4">{copy.title}</Heading>
          <p className="t-small mt-1 text-ink-3">{copy.body}</p>
        </div>
      </div>

      {!compact && copy.steps?.length > 0 && (
        <ol className="mt-5 space-y-3">
          {copy.steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-bold text-ink-2 tabular">
                {i + 1}
              </span>
              <span className="t-small text-ink-2">{step}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <a
          href={links.madrasati}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses({ variant: "secondary", size: "md", block: true, className: "justify-between" })}
        >
          <span className="truncate">{copy.open}</span>
          <ArrowUpRight size={17} aria-hidden="true" className="shrink-0 text-ink-3 flip-rtl" />
          <span className="sr-only">({copy.newTab})</span>
        </a>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <ExternalLink href={links.service} newTabLabel={copy.newTab} className="min-h-11 text-sm font-medium text-gold-600 hover:text-gold-700">
            {copy.about}
          </ExternalLink>
          <ExternalLink href={links.ien} newTabLabel={copy.newTab} className="min-h-11 text-sm font-medium text-ink-3 hover:text-ink">
            {copy.ien}
          </ExternalLink>
        </div>
      </div>

      <p className="t-caption mt-3 flex items-start gap-2 border-t border-line/10 pt-3">
        <KeyRound size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
        <span>
          {copy.account} {copy.noDeepLinks}
        </span>
      </p>
    </Tag>
  );
}
