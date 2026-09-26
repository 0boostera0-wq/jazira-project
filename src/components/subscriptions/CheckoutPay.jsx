"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ArrowRight, Clock, LifeBuoy, Lock, RotateCcw, ShieldCheck, TriangleAlert, WifiOff } from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import { useAuthUser } from "@/context/AuthProvider";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { PAYMENT_PROVIDER } from "./plan";

// Panel actions: 44px tap targets on phones, compact from sm up.
const ACTION = "max-sm:h-11";
const LINK = "text-gold-600 underline underline-offset-2";

/**
 * Render one translated sentence whose {slot} placeholders are React nodes, so
 * each language keeps its own word order: "… agree to the {terms} and the {refund}."
 */
function withLinks(message, slots) {
  return String(message || "").split(/\{(\w+)\}/).map((part, i) =>
    i % 2 === 1 ? <Fragment key={i}>{slots[part] ?? `{${part}}`}</Fragment> : part
  );
}

// Only ever navigate to an https URL returned by our own API.
const isSafeCheckoutUrl = (u) => {
  try { return new URL(u).protocol === "https:"; } catch { return false; }
};

/**
 * The checkout action. Asks /api/checkout for a hosted checkout URL and sends
 * the browser there. Never marks anything as paid — Elite is granted only by
 * the verified payment webhook.
 *
 * States: idle · submitting · redirecting · notConfigured · error · network ·
 *         rateLimited · elite · signedOut
 */
export default function CheckoutPay() {
  const { locale } = useLocale();
  const { isLoaded, isSignedIn, isElite, refreshUser } = useAuthUser();
  const [state, setState] = useState("idle");

  // Back/forward cache: returning from the provider's page restores this page
  // mid-"redirecting" — reset so the button works again.
  useEffect(() => {
    const onShow = (e) => { if (e.persisted) setState("idle"); };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const pay = useCallback(async () => {
    setState("submitting");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.configured && isSafeCheckoutUrl(data.url)) {
        setState("redirecting");
        window.location.assign(data.url);
        return;
      }
      if (res.ok && data.configured === false) return setState("notConfigured");
      if (res.status === 401) return setState("signedOut");
      if (res.status === 409 || data.error === "already_elite") {
        refreshUser?.().catch(() => {});
        return setState("elite");
      }
      if (res.status === 429) return setState("rateLimited");
      if (res.status === 503) return setState("notConfigured");
      setState("error");
    } catch {
      setState("network");
    }
  }, [locale, refreshUser]);

  const view = !isLoaded ? "loading"
    : isElite || state === "elite" ? "elite"
    : !isSignedIn || state === "signedOut" ? "signedOut"
    : state;
  return <CheckoutPayView view={view} onPay={pay} />;
}

/** Pure presentation of every checkout state (container above picks `view`). */
export function CheckoutPayView({ view, onPay }) {
  const t = useT("subscriptions");
  const tc = useT("common");

  if (view === "loading") {
    return (
      <div aria-hidden="true" className="space-y-3">
        <Skeleton rounded="full" className="h-12 w-full" />
        <Skeleton className="h-3.5 w-3/4" />
      </div>
    );
  }

  if (view === "elite") {
    return (
      <Panel tone="green" icon={ShieldCheck} title={t("checkout.states.eliteTitle")} body={t("checkout.states.eliteBody")}>
        <Button href="/exams" size="sm" iconEnd={ArrowRight} className={ACTION}>{t("status.startExam")}</Button>
        <Button href="/subscriptions" size="sm" variant="secondary" className={ACTION}>{t("checkout.states.viewPlan")}</Button>
      </Panel>
    );
  }

  if (view === "signedOut") {
    return (
      <Panel tone="neutral" icon={Lock} title={t("checkout.states.signedOutTitle")} body={t("checkout.states.signedOutBody")}>
        <Button href={`/sign-in?next=${encodeURIComponent("/checkout")}`} size="sm" className={ACTION}>{tc("actions.signIn")}</Button>
      </Panel>
    );
  }

  if (view === "notConfigured") {
    return (
      <Panel tone="gold" icon={Clock} title={t("checkout.states.notConfiguredTitle")} body={t("checkout.states.notConfiguredBody")}>
        <Button href="/support" size="sm" variant="secondary" iconStart={LifeBuoy} className={ACTION}>{tc("actions.contactSupport")}</Button>
        <Button href="/subscriptions" size="sm" variant="ghost" className={ACTION}>{t("checkout.states.viewPlan")}</Button>
      </Panel>
    );
  }

  const busy = view === "submitting" || view === "redirecting";
  const problem =
    view === "error" ? { icon: TriangleAlert, title: t("checkout.states.errorTitle"), body: t("checkout.states.errorBody") }
    : view === "network" ? { icon: WifiOff, title: t("checkout.states.errorTitle"), body: tc("states.networkError") }
    : view === "rateLimited" ? { icon: Clock, tone: "gold", title: t("checkout.states.rateLimitedTitle"), body: t("checkout.states.rateLimitedBody") }
    : null;

  return (
    <div>
      {problem && (
        <Panel tone={problem.tone || "danger"} icon={problem.icon} title={problem.title} body={problem.body} className="mb-4">
          {/* ghost pulled back by its own padding so the icon lines up with the text above */}
          <Button href="/support" size="sm" variant="ghost" iconStart={LifeBuoy} className={cn(ACTION, "-ms-4")}>{tc("actions.contactSupport")}</Button>
        </Panel>
      )}

      <Button
        onClick={onPay}
        variant="gold"
        size="lg"
        block
        loading={busy}
        iconStart={problem ? RotateCcw : undefined}
        iconEnd={busy || problem ? undefined : ArrowRight}
      >
        {view === "submitting" ? t("checkout.pay.preparing")
          : view === "redirecting" ? t("checkout.pay.redirecting")
          : problem ? tc("actions.retry")
          : t("checkout.pay.cta")}
      </Button>
      <p className="sr-only" role="status" aria-live="polite">
        {view === "submitting" ? t("checkout.pay.preparing") : view === "redirecting" ? t("checkout.pay.redirecting") : ""}
      </p>

      <p className="t-caption mt-3.5 text-center">
        {withLinks(t("checkout.pay.agree"), {
          terms: <Link href="/terms" className={LINK}>{t("checkout.pay.agreeTerms")}</Link>,
          refund: <Link href="/refund" className={LINK}>{t("checkout.pay.agreeRefund")}</Link>,
        })}
      </p>
      <p className="t-caption mt-2 flex items-center justify-center gap-1.5">
        <Lock size={13} aria-hidden="true" />
        {t("checkout.pay.secure", { provider: PAYMENT_PROVIDER })}
      </p>
    </div>
  );
}

const TONES = {
  green: "border-green-100 bg-green-50 [--icon:rgb(var(--c-green-600))]",
  gold: "border-gold-200/70 bg-gold-50 [--icon:rgb(var(--c-gold-600))]",
  danger: "border-danger/20 bg-danger-soft [--icon:rgb(var(--c-danger))]",
  neutral: "border-line/15 bg-surface-2 [--icon:rgb(var(--c-ink-2))]",
};

/** A state panel: icon · title · honest explanation · actions. */
export function Panel({ tone = "neutral", icon: Icon, title, body, children, className }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-md border p-4 sm:p-5", TONES[tone], className)}>
      <div className="flex items-start gap-3">
        <Icon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-[color:var(--icon)]" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{title}</p>
          {body && <p className="t-small mt-1 text-ink-2">{body}</p>}
          {children && <div className="mt-3.5 flex flex-wrap gap-2">{children}</div>}
        </div>
      </div>
    </div>
  );
}
