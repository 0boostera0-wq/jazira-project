"use client";

import { ChevronRight } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { formatPercent, formatRelative } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import Badge from "@/components/ui/Badge";
import IconTile from "@/components/ui/IconTile";
import Skeleton from "@/components/ui/Skeleton";
import { examIcon } from "@/components/exams/labels";
import { scoreTone } from "@/components/exams/results-logic";
import { useDashboard, useResource } from "./DashboardProvider";
import CardNotice from "./CardNotice";
import Panel, { PanelLink } from "./Panel";
import { attemptTitle } from "./labels";
import { EXAM_HISTORY_HREF, attemptHref, attemptRow } from "./model";

function Row({ a, now }) {
  const t = useT("dashboard");
  const tc = useT("common");
  const { locale } = useLocale();
  const title = attemptTitle(t, a.exam, a.section);
  const meta = [
    tc("units.questions", { count: a.questions }),
    a.at && now !== null ? formatRelative(a.at, locale, now) : null,
    a.status === "expired" ? t("recent.status.expired") : null,
  ].filter(Boolean).join(" · ");
  const score = a.score === null ? null : formatPercent(a.score / 100, locale);

  return (
    <li>
      <Link
        href={attemptHref(a.id)}
        className="group -mx-2 flex min-h-[60px] items-center gap-2.5 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-2/70 sm:gap-3"
      >
        <IconTile icon={examIcon(a.exam)} tone={a.exam === "achievement" ? "green" : "gold"} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium leading-snug text-ink sm:truncate">{title}</span>
          <span className="t-caption mt-0.5 block sm:truncate">{meta}</span>
        </span>
        {score !== null ? (
          <Badge tone={scoreTone(a.score)} aria-label={t("recent.scoreAria", { score })}>
            <span className="num tabular">{score}</span>
          </Badge>
        ) : (
          <Badge tone={a.status === "in_progress" ? "info" : "neutral"}>
            {a.status === "in_progress" ? t("recent.resume") : t(`recent.status.${a.status}`)}
          </Badge>
        )}
        <ChevronRight size={16} aria-hidden="true" className="flip-rtl hidden shrink-0 text-ink-4 transition-colors group-hover:text-ink-2 sm:block" />
      </Link>
    </li>
  );
}

/**
 * The five newest attempts with score and date, each linking to its result
 * (or back into the runner while in progress). Hidden for members with no
 * attempts — the first-steps panel covers that case.
 */
export default function RecentAttempts({ title, viewAll }) {
  const t = useT("dashboard");
  const { now } = useDashboard();
  const r = useResource("attempts");
  const frame = (body) => (
    <Panel id="dash-recent" title={title} action={<PanelLink href={EXAM_HISTORY_HREF}>{viewAll}</PanelLink>} bodyClassName="mt-2">
      {body}
    </Panel>
  );

  if (r.status === "loading") {
    return frame(
      <ul aria-hidden="true" className="divide-y divide-line/10">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="flex items-center gap-3 py-3">
            <Skeleton rounded="sm" className="h-9 w-9 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton rounded="full" className="h-7 w-14" />
          </li>
        ))}
      </ul>
    );
  }
  if (r.status === "unavailable") return frame(<CardNotice status="unavailable" message={t("recent.unavailable")} />);
  if (r.status === "error") return frame(<CardNotice status="error" onRetry={r.reload} />);
  if (!r.data.length) return null;

  return frame(
    <ul className="divide-y divide-line/10">
      {r.data.map((raw) => {
        const a = attemptRow(raw);
        return a.id ? <Row key={a.id} a={a} now={now} /> : null;
      })}
    </ul>
  );
}
