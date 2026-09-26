"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { formatNumber } from "@/i18n/format";
import { ProgressBar } from "@/components/ui/Progress";
import Tabs from "@/components/ui/Tabs";
import { cn } from "@/components/ui/cn";
import BadgeMedal from "./BadgeMedal";
import { useProgress } from "./ProgressProvider";

/**
 * One badge. Phones: a compact row (medal beside the text). From `sm`: a
 * trophy-case tile (medal on top, centred text, full-width progress).
 */
function BadgeCard({ badge, status }) {
  const t = useT("achievements");
  const { locale } = useLocale();
  const name = t(`badges.items.${badge.id}.name`);
  const goal = t(`badges.items.${badge.id}.goal`);
  const tracked = status === "ready" && badge.available;
  const progress = t("badges.state.progress", { value: formatNumber(badge.value, locale), goal: formatNumber(badge.goal, locale) });

  return (
    <li
      className={cn(
        "flex gap-3.5 rounded-lg border p-4 sm:flex-col sm:items-center sm:gap-3 sm:px-3.5 sm:pb-4 sm:pt-5 sm:text-center",
        badge.unlocked ? "border-gold-200/70 bg-gold-50/60" : "border-line/15 bg-surface"
      )}
    >
      <BadgeMedal icon={badge.icon} unlocked={badge.unlocked} />
      <div className="flex min-w-0 flex-1 flex-col sm:w-full">
        <p className="font-medium leading-snug text-ink">
          {name}
          <span className="sr-only"> ({t(badge.unlocked ? "badges.state.unlocked" : "badges.state.locked")})</span>
        </p>
        <p className="t-small mt-0.5 text-ink-3">{goal}</p>
        {badge.unlocked ? (
          <p aria-hidden="true" className="mt-auto inline-flex items-center gap-1 pt-2.5 text-xs font-medium text-green-700 sm:justify-center sm:pt-3">
            <Check size={13} strokeWidth={2.5} />
            {t("badges.state.unlocked")}
          </p>
        ) : status === "ready" ? (
          tracked ? (
            <div className="mt-auto flex items-center gap-3 pt-3 sm:flex-col sm:items-stretch sm:gap-1.5">
              <ProgressBar value={badge.pct} size="sm" className="flex-1 sm:flex-none" label={`${name}: ${progress}`} />
              <span className="shrink-0 text-xs font-medium text-ink-3 tabular">{progress}</span>
            </div>
          ) : (
            <p className="mt-auto pt-2.5 text-xs text-ink-3 sm:pt-3">{t("badges.state.notTracked")}</p>
          )
        ) : null}
      </div>
    </li>
  );
}

/**
 * Every badge, grouped (exams · consistency · XP · community). On phones one
 * group shows at a time behind a segmented control; from md all groups show.
 */
export default function BadgeGallery() {
  const t = useT("achievements");
  const p = useProgress();
  const { groups } = p.badges;
  const [active, setActive] = useState(groups[0].key);

  const counts = Object.fromEntries(groups.map((g) => [g.key, g.items.filter((b) => b.unlocked).length]));

  return (
    <div>
      <Tabs
        className="mb-4 md:hidden"
        label={t("badges.tabsLabel")}
        value={active}
        onChange={setActive}
        items={groups.map((g) => ({
          value: g.key,
          label: t(`badges.groups.${g.key}.title`),
        }))}
      />
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.key} aria-labelledby={`badges-${g.key}`} className={cn(active !== g.key && "hidden md:block")}>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div className="min-w-0">
                {/* On phones the active tab already names the group. */}
                <h3 id={`badges-${g.key}`} className="t-h4 max-md:sr-only">{t(`badges.groups.${g.key}.title`)}</h3>
                <p className="t-caption md:mt-0.5">{t(`badges.groups.${g.key}.body`)}</p>
              </div>
              {p.status === "ready" && (
                <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-ink-2 tabular">
                  {t("badges.groupCount", { unlocked: counts[g.key], total: g.items.length })}
                </span>
              )}
            </div>
            <ul className="grid gap-3 sm:grid-cols-3">
              {g.items.map((b) => <BadgeCard key={b.id} badge={b} status={p.status} />)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
