"use client";

import { ArrowRight, BadgeCheck, CalendarCheck, Crown, IdCard, ImageUp, LifeBuoy } from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import { formatDate } from "@/i18n/format";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import Skeleton from "@/components/ui/Skeleton";
import { PLAN } from "@/components/subscriptions/plan";
import { cn } from "@/components/ui/cn";
import { useLoad, useSettingsApi, useSettingsAuth } from "./SettingsContext";

/** Subscription: plan status (DB-verified) and the Elite differences that show up in settings. */
export default function SubscriptionSection() {
  const t = useT("settings");
  const tc = useT("common");
  const { locale } = useLocale();
  const auth = useSettingsAuth();
  const api = useSettingsApi();
  const elite = Boolean(auth.isElite);
  const sub = useLoad(elite && auth.userId ? `subscription:${auth.userId}` : null, () => api.getSubscription(auth.userId));

  const periodEnd = sub.data?.status === "active" && sub.data?.current_period_end ? sub.data.current_period_end : null;
  const perks = [
    { key: "name", icon: IdCard, text: t("subscription.perks.name", { elite: t("units.hours", { count: PLAN.profile.eliteNameHours }), free: tc("units.days", { count: PLAN.profile.freeNameDays }) }) },
    { key: "avatar", icon: ImageUp, text: t("subscription.perks.avatar", { free: tc("units.days", { count: PLAN.profile.freeAvatarDays }) }) },
    { key: "badge", icon: BadgeCheck, text: t("subscription.perks.badge") },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="surface grid overflow-hidden md:grid-cols-[minmax(0,1fr)_240px] xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="p-5 sm:p-7">
          <p className="t-caption">{t("subscription.current")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {elite && (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-50 text-gold-600 ring-1 ring-inset ring-gold-200/60">
                <Crown size={18} aria-hidden="true" />
              </span>
            )}
            <h3 className="t-h3">{t(elite ? "subscription.elite.title" : "subscription.free.title")}</h3>
            {elite && <Badge size="sm" tone="green" icon={BadgeCheck}>{t("subscription.active")}</Badge>}
          </div>
          <p className="t-small mt-2 max-w-xl text-ink-3">{t(elite ? "subscription.elite.body" : "subscription.free.body")}</p>

          {elite && (
            <div className="mt-3 min-h-[1.5rem]">
              {sub.status === "loading" ? (
                <Skeleton className="h-4 w-56" />
              ) : periodEnd ? (
                <p className="t-small inline-flex items-center gap-1.5 text-ink-2">
                  <CalendarCheck size={16} aria-hidden="true" className="text-green-600" />
                  {t("subscription.elite.periodEnd", { date: formatDate(periodEnd, locale) })}
                </p>
              ) : null}
            </div>
          )}

          <p className="t-h4 mt-6">{t(elite ? "subscription.elite.perksTitle" : "subscription.free.perksTitle")}</p>
          <ul className="mt-3 space-y-2.5">
            {perks.map((p) => (
              <li key={p.key} className="flex items-start gap-3">
                <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full", elite ? "bg-green-50 text-green-600" : "bg-gold-50 text-gold-600")}>
                  <p.icon size={15} aria-hidden="true" />
                </span>
                <span className="t-small text-ink-2">{p.text}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap gap-2.5">
            {elite ? (
              <Button href="/subscriptions" variant="secondary" iconEnd={ArrowRight}>{t("subscription.compare")}</Button>
            ) : (
              <>
                <Button href="/subscriptions" variant="gold" iconStart={Crown}>{t("subscription.free.cta")}</Button>
                <Button href="/subscriptions#compare" variant="ghost">{t("subscription.compare")}</Button>
              </>
            )}
          </div>
        </div>
        {/* The plan's art as the card's end column (both plans; the crown is the Elite mark). */}
        <div className="hidden items-center justify-center bg-[#F7F0E3] p-5 dark:bg-surface-2 md:flex">
          <Illustration id="subscriptions.premium" className="w-full max-w-[230px]" />
        </div>
      </section>

      <div className="surface-tint flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="t-small flex items-start gap-2.5 text-ink-2">
          <LifeBuoy size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
          {t("subscription.help")}
        </p>
        <Button href="/contact" variant="secondary" size="sm" className="shrink-0 self-start sm:self-auto">{t("subscription.support")}</Button>
      </div>
    </div>
  );
}
