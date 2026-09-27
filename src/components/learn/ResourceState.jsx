import { ArrowUpRight, BadgeCheck, BookOpen, CircleHelp, FileQuestion, FileX2, Headphones, NotebookPen } from "lucide-react";
import { formatNumber } from "@/i18n/format";
import Badge from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { ALIGN_UI, contentProps } from "./ContentText";

// Server-safe (no hooks): used by the learn pages (server) and the curriculum
// subject drawer (client). All copy comes through `t` (the "learn" namespace).
// No Link / Button import: the link-out is a plain <a> styled like a secondary button.

const LINK_OUT =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line/20 bg-surface px-4 text-sm font-medium text-ink shadow-xs " +
  "transition-colors duration-fast hover:border-line/30 hover:bg-surface-2 max-sm:h-11";

const TERM_TONE = { verified: "green", inferred: "info", unconfirmed: "gold", needs_review: "neutral" };

/**
 * Term badge (§7): verified · inferred · unconfirmed (owner decision) · needs
 * review. badge = termBadge(node); the hint explains where the term comes from.
 */
export function TermBadge({ badge, t, size = "sm", className }) {
  if (!badge) return null;
  const term = badge.term ? t(`term.${badge.term}`) : null;
  const label = badge.state === "needs_review" ? t("term.needs_review") : t(`term.${badge.state}`, { term });
  return (
    <Badge size={size} tone={TERM_TONE[badge.state] || "neutral"} icon={badge.state === "verified" ? BadgeCheck : badge.state === "needs_review" ? CircleHelp : undefined} title={t(`term.hint.${badge.state}`)} className={className}>
      {label}
    </Badge>
  );
}

const ICONS = { student_book: BookOpen, activity_book: NotebookPen, audio: Headphones, question_bank_external: FileQuestion };

/**
 * One official resource in its §7 state (item = resourceView()):
 *   external_official → "Open on iEN" link-out (new tab, noopener noreferrer) with
 *                       part, edition, term badge and page count — nothing embedded;
 *   unavailable       → an inline empty state with the reason;
 *   needs_review      → a badge saying the details (term, part, edition) aren't confirmed.
 */
export default function ResourceState({ item, t, locale, className }) {
  const Icon = item.state === "unavailable" ? FileX2 : ICONS[item.kind] || BookOpen;
  const kind = t(`resources.kinds.${item.kind}`);
  const meta = [
    item.part ? t("resources.part", { part: formatNumber(item.part, locale) }) : null,
    item.year ? t("resources.edition", { year: item.year }) : null,
    item.pages ? t("resources.pages", { count: item.pages }) : null,
    item.bank && item.externalCount !== null ? t("resources.bankCount", { count: item.externalCount }) : null,
  ].filter(Boolean);

  return (
    <div data-resource-state={item.state} className={cn("flex items-start gap-3 py-3.5", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-sm ring-1 ring-inset",
          item.state === "unavailable" ? "bg-surface-2 text-ink-4 ring-line/10" : "bg-green-50 text-green-700 ring-green-100"
        )}
      >
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="t-caption">{kind}</p>
        <p {...contentProps(item.title, cn("mt-0.5 break-words text-[0.9375rem] font-medium text-ink", ALIGN_UI))}>{item.title}</p>
        {meta.length > 0 && <p className="t-caption mt-1 tabular">{meta.join(" · ")}</p>}
        {(item.term || item.review) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.term && <TermBadge badge={item.term} t={t} />}
            {item.review && (
              <Badge size="sm" tone="warning" icon={CircleHelp} title={t("resources.reviewHint")}>
                {t("resources.review")}
              </Badge>
            )}
          </div>
        )}
        {item.bank && item.state !== "unavailable" && <p className="t-caption mt-1.5">{t("resources.bankNote")}</p>}
        {item.state === "unavailable" && (
          <div role="note" className="mt-2 rounded-md border border-dashed border-line/20 bg-surface-2/60 px-3 py-2.5">
            <p className="t-small font-medium text-ink-2">{t("resources.unavailable.title")}</p>
            <p className="t-caption mt-0.5">{t(`resources.unavailable.${item.reason || "unavailable"}`)}</p>
          </div>
        )}
      </div>
      {item.href && (
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_OUT}
        >
          <span>{t("resources.open")}</span>
          <ArrowUpRight size={16} aria-hidden="true" className="flip-rtl" />
          <span className="sr-only">({t("resources.newTab")})</span>
        </a>
      )}
    </div>
  );
}
