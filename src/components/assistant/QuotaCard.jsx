"use client";

import { Check, Crown, Gift, Info, LogIn } from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import { formatDate } from "@/i18n/format";
import { AI_FREE_LIMIT, AI_WINDOW_MS } from "@/lib/constants";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { ProgressBar } from "@/components/ui/Progress";
import EliteBadge from "@/components/subscriptions/EliteBadge";
import { cn } from "@/components/ui/cn";

const WINDOW_HOURS = Math.round(AI_WINDOW_MS / 3600000);

/** "5 messages every 8 hours" in the active locale. */
export function useAllowance() {
  const t = useT("assistant");
  return {
    messages: t("units.messages", { count: AI_FREE_LIMIT }),
    hours: t("units.hours", { count: WINDOW_HOURS }),
  };
}

const clock = (iso, locale) => (iso ? formatDate(iso, locale, { hour: "numeric", minute: "2-digit" }) : null);

/**
 * Message balance from the server quota (never a local guess):
 * free → remaining / limit + when the next message frees up; Elite →
 * unlimited; guests → what signing in gives; unknown → honest note.
 */
export default function QuotaCard({ quota, isLoaded, isSignedIn, next = "%2Fassistant", guestActions = false, upgrade = true, className }) {
  const t = useT("assistant");
  const { locale } = useLocale();
  const allowance = useAllowance();

  if (isLoaded && !isSignedIn) return <GuestCard next={next} actions={guestActions} className={className} />;

  const data = quota.data;
  const loading = !isLoaded || quota.status === "loading" || quota.status === "idle";

  return (
    <section aria-labelledby="jz-quota-title" className={cn("surface-flat p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="jz-quota-title" className="text-sm font-medium text-ink">{t("quota.title")}</h2>
        {data?.unlimited ? <EliteBadge size="xs" /> : data ? <Badge tone="neutral" size="sm">{t("quota.free")}</Badge> : null}
      </div>

      {loading ? (
        <div aria-hidden="true" className="mt-4 space-y-3">
          <Skeleton className="h-7 w-28" />
          <Skeleton rounded="full" className="h-2 w-full" />
          <Skeleton className="h-3.5 w-40" />
        </div>
      ) : data?.unlimited ? (
        <div className="mt-3">
          <p className="flex items-center gap-2 text-lg font-bold text-ink">
            <Crown size={18} className="text-gold-600" aria-hidden="true" />
            {t("quota.unlimited")}
          </p>
          <p className="t-caption mt-1">{t("quota.unlimitedBody")}</p>
        </div>
      ) : data ? (
        <div className="mt-3">
          <p className="text-2xl font-bold leading-tight text-ink">
            <span className="num tabular">{data.remaining}</span>
            <span className="text-base font-medium text-ink-3"> / <span className="num tabular">{data.limit}</span></span>
          </p>
          <p className="t-caption">{t("quota.remainingLabel")}</p>
          <ProgressBar
            value={data.limit ? (Math.min(data.used, data.limit) / data.limit) * 100 : 0}
            tone={data.remaining === 0 ? "danger" : "gold"}
            size="sm"
            label={t("quota.usedLabel")}
            className="mt-3"
          />
          <ul className="mt-3 space-y-1">
            {data.resets_at && <li className="t-caption">{t("quota.resetsAt", { time: clock(data.resets_at, locale) })}</li>}
            <li className="t-caption">{t("quota.window", { messages: t("units.messages", { count: data.limit }), hours: t("units.hours", { count: data.window_hours || WINDOW_HOURS }) })}</li>
            {data.referral_bonus && (
              <li className="t-caption flex items-center gap-1.5 text-green-700"><Gift size={13} aria-hidden="true" />{t("quota.bonus")}</li>
            )}
          </ul>
          {upgrade && data.remaining === 0 && (
            <Button href="/subscriptions" variant="gold" size="sm" iconStart={Crown} block className="mt-4">{t("quota.upgrade")}</Button>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          <p className="t-caption">{t("quota.window", allowance)}</p>
          {quota.status === "error" && <p className="t-caption">{t("quota.unknown")}</p>}
        </div>
      )}
    </section>
  );
}

/** Compact one-liner under the composer (phones, and while a balance exists). */
export function QuotaInline({ quota }) {
  const t = useT("assistant");
  const data = quota.data;
  if (!data || data.unlimited) return null;
  return (
    <span className={cn("t-caption whitespace-nowrap", data.remaining <= 1 && "font-medium text-warning")}>
      {t("quota.remainingShort", { count: data.remaining, limit: data.limit })}
    </span>
  );
}

/**
 * What an account gives. The composer spot (GuestBar) carries the sign-in
 * action, so the desktop rail repeats no buttons; the mobile sheet does
 * (`actions`), because it covers that bar.
 */
function GuestCard({ next, actions, className }) {
  const t = useT("assistant");
  const allowance = useAllowance();
  const perks = ["allowance", "saved", "bilingual", "guide"];
  return (
    <section aria-labelledby="jz-guest-title" className={cn("surface-flat overflow-hidden", className)}>
      <div className="border-b border-line/10 bg-gold-50/70 px-5 py-4">
        <h2 id="jz-guest-title" className="t-h4">{t("guest.railTitle")}</h2>
      </div>
      <div className="p-5">
        <ul className="space-y-2.5">
          {perks.map((k) => (
            <li key={k} className="flex items-start gap-2.5 text-sm text-ink-2">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green-50 text-green-600"><Check size={12} aria-hidden="true" /></span>
              {t(`guest.perks.${k}`, allowance)}
            </li>
          ))}
        </ul>
        {actions && (
          <div className="mt-5 grid gap-2">
            <Button href={`/sign-in?next=${next}`} iconStart={LogIn} block>{t("guest.signIn")}</Button>
            <Button href={`/sign-up?next=${next}`} variant="secondary" block>{t("guest.signUp")}</Button>
          </div>
        )}
      </div>
    </section>
  );
}

/** Short, practical prompting tips (rail for visitors, sheet on phones). */
export function TipsCard({ className }) {
  const t = useT("assistant");
  const items = ["grade", "full", "steps", "check"];
  return (
    <section aria-labelledby="jz-tips-title" className={cn("surface-tint p-5", className)}>
      <h2 id="jz-tips-title" className="text-sm font-medium text-ink">{t("tips.title")}</h2>
      <ol className="mt-3 space-y-2.5">
        {items.map((k, i) => (
          <li key={k} className="flex items-start gap-2.5 text-sm text-ink-2">
            <span className="num mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface text-xs font-bold text-gold-700 ring-1 ring-gold-200/70">{i + 1}</span>
            {t(`tips.items.${k}`)}
          </li>
        ))}
      </ol>
      <p className="t-caption mt-4 flex items-start gap-2 border-t border-line/10 pt-3.5">
        <Info size={14} className="mt-[3px] shrink-0" aria-hidden="true" />
        {t("composer.disclaimer")}
      </p>
    </section>
  );
}
