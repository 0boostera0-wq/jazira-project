"use client";

import { ArrowRight, PartyPopper, Target } from "lucide-react";
import { useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import { ProgressBar } from "@/components/ui/Progress";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import BadgeMedal from "./BadgeMedal";
import { useProgress } from "./ProgressProvider";

/**
 * Rail card: the (up to) three locked badges the member is closest to. Guests
 * see the three quickest goals in the catalogue instead (no progress shown).
 */
export default function NextBadges({ className }) {
  const t = useT("achievements");
  const p = useProgress();

  if (p.status === "unavailable") return null;

  const { next, unlocked, total, groups } = p.badges;

  if (p.status === "guest") {
    const starters = groups.flatMap((g) => g.items).filter((b) => b.goal <= 3).sort((a, b) => a.goal - b.goal).slice(0, 3);
    // Not on phones: there the gallery right below shows the same badges.
    return (
      <section aria-labelledby="next-title" className={cn("surface hidden p-5 sm:p-6 md:block", className)}>
        <h2 id="next-title" className="flex items-center gap-2 t-h4">
          <Target size={18} aria-hidden="true" className="text-gold-600" />
          {t("next.guestTitle")}
        </h2>
        <p className="t-caption mt-1">{t("next.guestLead")}</p>
        <ul className="mt-4 space-y-3.5">
          {starters.map((b) => (
            <li key={b.id} className="flex items-center gap-3">
              <BadgeMedal icon={b.icon} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{t(`badges.items.${b.id}.name`)}</p>
                <p className="text-[0.8125rem] leading-snug text-ink-3">{t(`badges.items.${b.id}.goal`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section aria-labelledby="next-title" className={cn("surface p-5 sm:p-6", className)}>
      <h2 id="next-title" className="flex items-center gap-2 t-h4">
        <Target size={18} aria-hidden="true" className="text-gold-600" />
        {t("next.title")}
      </h2>

      {p.status === "loading" ? (
        <div aria-hidden="true" className="mt-4 space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton rounded="full" className="h-10 w-10 shrink-0" />
              <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-2/3" /><Skeleton rounded="full" className="h-1.5 w-full" /></div>
            </div>
          ))}
        </div>
      ) : unlocked === total ? (
        <p className="t-small mt-3 flex items-start gap-2 text-ink-2">
          <PartyPopper size={16} aria-hidden="true" className="mt-1 shrink-0 text-gold-600" />
          {t("next.done")}
        </p>
      ) : next.length === 0 ? (
        <p className="t-small mt-3 text-ink-3">{t("next.empty")}</p>
      ) : (
        <>
          <p className="t-caption mt-1">{t("next.lead")}</p>
          <ul className="mt-4 space-y-4">
            {next.map((b, i) => {
              const left = b.goal - b.value;
              // One link per destination (exam and XP badges both lead to /exams).
              const firstForHref = next.findIndex((o) => o.href === b.href) === i;
              const cta = b.href && firstForHref && t.has(`next.cta.${b.group}`) ? t(`next.cta.${b.group}`) : null;
              return (
                <li key={b.id} className="flex items-start gap-3">
                  <BadgeMedal icon={b.icon} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium text-ink">{t(`badges.items.${b.id}.name`)}</p>
                      <p className="shrink-0 text-xs text-ink-3 tabular">{t(`next.remaining.${b.metric}`, { count: left })}</p>
                    </div>
                    <ProgressBar value={b.pct} size="sm" className="mt-2" label={t(`badges.items.${b.id}.goal`)} />
                    {cta && (
                      <Link
                        href={b.href}
                        className="-mb-2.5 mt-0.5 inline-flex min-h-[44px] items-center gap-1 text-[0.8125rem] font-medium text-gold-600 underline-offset-4 hover:underline"
                      >
                        {cta}
                        <ArrowRight size={14} aria-hidden="true" className="flip-rtl" />
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
