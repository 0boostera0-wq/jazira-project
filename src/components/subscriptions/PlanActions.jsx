"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CalendarCheck, Crown, LifeBuoy, Lock, ShieldCheck } from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/i18n/format";
import { useAuthUser } from "@/context/AuthProvider";
import { getSupabase } from "@/lib/supabase-lazy";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { PAYMENT_PROVIDER } from "./plan";

const CHECKOUT = "/checkout";

/**
 * The plan card's call to action, resolved from the (DB-verified) auth state:
 *   loading → skeleton · guest → sign in / create account · free → Get Elite
 *   Elite member → membership status (renewal date) instead of a buy button.
 */
export default function PlanActions({ className }) {
  const { isLoaded, isSignedIn, isElite, userId } = useAuthUser();
  const [periodEnd, setPeriodEnd] = useState(null);

  // Elite only: read the renewal date from the member's own subscription row (RLS: own row).
  useEffect(() => {
    if (!isElite || !userId) return;
    let alive = true;
    (async () => {
      try {
        const supabase = await getSupabase();
        if (!supabase) return;
        const { data } = await supabase
          .from("subscriptions")
          .select("current_period_end, status")
          .eq("user_id", userId)
          .maybeSingle();
        if (alive && data?.status === "active" && data.current_period_end) setPeriodEnd(data.current_period_end);
      } catch {
        /* no row / table missing → status without a date */
      }
    })();
    return () => { alive = false; };
  }, [isElite, userId]);

  const view = !isLoaded ? "loading" : isElite ? "elite" : isSignedIn ? "free" : "guest";
  return <PlanActionsView view={view} periodEnd={periodEnd} className={className} />;
}

/** Pure presentation: loading · guest · free · elite (with optional renewal date). */
export function PlanActionsView({ view, periodEnd, className }) {
  const t = useT("subscriptions");
  const { locale } = useLocale();

  if (view === "loading") {
    return (
      <div aria-hidden="true" className={cn("space-y-3.5", className)}>
        <Skeleton rounded="full" className="h-12 w-full" />
        <Skeleton className="mx-auto h-3.5 w-40" />
      </div>
    );
  }

  if (view === "elite") {
    const date = periodEnd ? formatDate(periodEnd, locale) : "";
    return (
      <div className={cn("rounded-md border border-green-100 bg-green-50 p-4", className)} role="status">
        <p className="flex items-center gap-2 font-medium text-green-700">
          <ShieldCheck size={18} aria-hidden="true" className="shrink-0" />
          {t("status.title")}
        </p>
        <p className="t-small mt-1.5 text-ink-2">
          {date ? (
            <span className="inline-flex items-center gap-1.5">
              <CalendarCheck size={15} aria-hidden="true" className="shrink-0 text-ink-3" />
              {t("status.renews", { date })}
            </span>
          ) : (
            t("status.active")
          )}
        </p>
        <p className="t-caption mt-2">{t("status.manage")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button href="/exams" size="sm" iconEnd={ArrowRight} className="max-sm:h-11">{t("status.startExam")}</Button>
          <Button href="/support" size="sm" variant="secondary" iconStart={LifeBuoy} className="max-sm:h-11">{t("status.support")}</Button>
        </div>
      </div>
    );
  }

  const secure = (
    <p className="t-caption mt-3.5 flex items-center justify-center gap-1.5 text-center">
      <Lock size={13} aria-hidden="true" className="shrink-0" />
      {t("hero.secureNote", { provider: PAYMENT_PROVIDER })}
    </p>
  );

  if (view === "guest") {
    const next = `?next=${encodeURIComponent(CHECKOUT)}`;
    return (
      <div className={className}>
        <Button href={`/sign-in${next}`} variant="gold" size="lg" block iconStart={Crown}>
          {t("cta.signIn")}
        </Button>
        <p className="t-small mt-3 text-center text-ink-3">
          {t("cta.noAccount")}{" "}
          <Link href={`/sign-up${next}`} className="font-medium text-gold-600 underline-offset-4 hover:underline">
            {t("cta.createAccount")}
          </Link>
        </p>
        {secure}
      </div>
    );
  }

  return (
    <div className={className}>
      <Button href={CHECKOUT} variant="gold" size="lg" block iconStart={Crown}>
        {t("cta.subscribe")}
      </Button>
      {secure}
    </div>
  );
}
