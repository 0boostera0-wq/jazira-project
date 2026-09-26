"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Clock, Crown, LayoutDashboard, Lock, RotateCcw } from "lucide-react";
import { useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import { useAuthUser } from "@/context/AuthProvider";
import { getSupabase } from "@/lib/supabase-lazy";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import Skeleton from "@/components/ui/Skeleton";
import Spinner from "@/components/ui/Spinner";
import { cn } from "@/components/ui/cn";

// Confirmation window: poll quickly for ~60 s, then keep checking slowly while
// the page stays open so a late webhook still flips the page to "active".
const FIRST_CHECK_MS = 1500;
const FAST_MS = 4000;
const FAST_WINDOW_MS = 60000;
const SLOW_MS = 20000;
const SLOW_WINDOW_MS = 10 * 60000;

/** The member's own DB-verified Elite flag (set only by the payment webhook). null = couldn't tell. */
async function readEliteFlag(userId) {
  try {
    const supabase = await getSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.from("profiles").select("is_elite").eq("id", userId).maybeSingle();
    return error ? null : !!data?.is_elite;
  } catch {
    return null; // transient network error — keep polling
  }
}

/**
 * Post-payment status. Reads ONLY the DB-verified flag (profiles.is_elite) —
 * it never marks Elite on the client. It polls that one column (cheap, and a
 * transient error can't sign the user out); once it flips, refreshUser()
 * propagates the new status to the rest of the app. Phases:
 *   confirming → active (celebration)   or   confirming → pending (honest wait)
 */
export default function ActivationStatus() {
  const { isLoaded, isSignedIn, isElite, userId, refreshUser } = useAuthUser();
  const [phase, setPhase] = useState("confirming"); // confirming | pending | active
  const [checking, setChecking] = useState(true); // false once the polling window has closed
  const [round, setRound] = useState(0);
  const eliteRef = useRef(isElite);
  eliteRef.current = isElite;

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId || eliteRef.current) return;
    let alive = true;
    let timer;
    const started = Date.now();
    setPhase("confirming");
    setChecking(true);

    const tick = async () => {
      const elite = await readEliteFlag(userId);
      if (!alive || eliteRef.current) return;
      if (elite) {
        setPhase("active");
        refreshUser().catch(() => {});
        return;
      }
      const elapsed = Date.now() - started;
      if (elapsed >= FAST_WINDOW_MS) setPhase("pending");
      if (elapsed >= FAST_WINDOW_MS + SLOW_WINDOW_MS) {
        setChecking(false); // stop implying a live check; "Check again" restarts it
        return;
      }
      timer = window.setTimeout(tick, elapsed >= FAST_WINDOW_MS ? SLOW_MS : FAST_MS);
    };
    timer = window.setTimeout(tick, FIRST_CHECK_MS);
    return () => { alive = false; window.clearTimeout(timer); };
    // refreshUser is stable (useCallback in AuthProvider); `round` restarts polling.
  }, [isLoaded, isSignedIn, userId, refreshUser, round]);

  const view = !isLoaded ? "loading" : !isSignedIn ? "signedOut" : isElite ? "active" : phase;
  return <ActivationView view={view} checking={checking} onCheck={() => setRound((r) => r + 1)} />;
}

/**
 * Pure presentation of each status (loading · signedOut · confirming · pending · active).
 * `checking` = a background check is still scheduled (drives the step spinner).
 */
export function ActivationView({ view, onCheck, checking = true }) {
  const t = useT("subscriptions");
  const tc = useT("common");

  if (view === "loading") {
    return (
      <div aria-busy="true" className="surface p-6 sm:p-8">
        <Skeleton rounded="full" className="h-16 w-16" />
        <Skeleton className="mt-6 h-7 w-2/3" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-4/5" />
      </div>
    );
  }

  if (view === "signedOut") {
    return (
      <StatusCard
        visual={<Orb tone="neutral"><Lock size={26} aria-hidden="true" /></Orb>}
        title={t("success.signedOut.title")}
        body={t("success.signedOut.body")}
      >
        <Button href={`/sign-in?next=${encodeURIComponent("/checkout/success")}`}>{tc("actions.signIn")}</Button>
      </StatusCard>
    );
  }

  if (view === "active") {
    return (
      <StatusCard
        live
        art
        eyebrow={t("success.active.eyebrow")}
        visual={<Orb tone="gold" celebrate><Crown size={28} aria-hidden="true" /></Orb>}
        title={t("success.active.title")}
        body={t("success.active.body")}
        steps={<Steps t={t} done={3} />}
      >
        <Button href="/exams" variant="gold" size="lg" iconEnd={ArrowRight}>{t("success.active.cta")}</Button>
        <Button href="/subscriptions" variant="secondary" size="lg">{t("success.active.secondary")}</Button>
      </StatusCard>
    );
  }

  if (view === "pending") {
    return (
      <StatusCard
        live
        eyebrow={t("success.pending.eyebrow")}
        visual={<Orb tone="warning"><Clock size={26} aria-hidden="true" /></Orb>}
        title={t("success.pending.title")}
        body={t("success.pending.body")}
        steps={<Steps t={t} done={1} active={2} spinning={checking} />}
        footer={
          <>
            <p className="t-small text-ink-3">
              {t("success.pending.notPaid")}{" "}
              <Link href="/checkout" className="font-medium text-gold-600 underline-offset-4 hover:underline">
                {t("success.pending.backToCheckout")}
              </Link>
            </p>
            <p className="t-small mt-1.5 text-ink-3">
              {t("success.pending.support")}{" "}
              <Link href="/support" className="font-medium text-gold-600 underline-offset-4 hover:underline">
                {tc("actions.contactSupport")}
              </Link>
            </p>
          </>
        }
      >
        <Button onClick={onCheck} iconStart={RotateCcw}>{t("success.pending.check")}</Button>
        <Button href="/dashboard" variant="secondary" iconStart={LayoutDashboard}>{t("success.pending.dashboard")}</Button>
      </StatusCard>
    );
  }

  return (
    <StatusCard
      live
      eyebrow={t("success.confirming.eyebrow")}
      visual={<Orb tone="gold"><Spinner size={30} /></Orb>}
      title={t("success.confirming.title")}
      body={t("success.confirming.body")}
      steps={<Steps t={t} done={1} active={2} />}
    />
  );
}

function StatusCard({ eyebrow, visual, title, body, steps, children, footer, art = false, live = false }) {
  return (
    <section
      aria-live={live ? "polite" : undefined}
      className={cn("surface overflow-hidden", art && "animate-scale")}
    >
      {art && (
        <div className="bg-[#F7F0E3] dark:bg-surface-2 px-6 pt-6">
          <Illustration id="subscriptions.premium" className="mx-auto w-full max-w-[210px] sm:max-w-[300px]" />
        </div>
      )}
      <div className="p-6 sm:p-8">
        {!art && visual}
        {eyebrow && <p className={cn("t-eyebrow", !art && "mt-6")}>{eyebrow}</p>}
        <h1 className="t-h2 mt-2">{title}</h1>
        {body && <p className="t-body mt-3 max-w-prose text-ink-2">{body}</p>}
        {steps && <div className="mt-7">{steps}</div>}
        {children && <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">{children}</div>}
        {footer && <div className="mt-6 border-t border-line/10 pt-5">{footer}</div>}
      </div>
    </section>
  );
}

const ORB = {
  gold: "bg-gold-50 text-gold-600 ring-gold-200/70",
  warning: "bg-warning-soft text-warning ring-warning/20",
  neutral: "bg-surface-2 text-ink-2 ring-line/15",
};

function Orb({ tone, celebrate = false, children }) {
  return (
    <span className={cn("relative grid h-16 w-16 place-items-center rounded-full ring-1 ring-inset", ORB[tone], celebrate && "animate-scale")}>
      {children}
    </span>
  );
}

/** Three-step activation tracker. `done` = completed steps, `active` = in-progress step (1-based). */
function Steps({ t, done, active, spinning = true }) {
  const keys = ["received", "confirm", "activate"];
  return (
    <ol aria-label={t("success.steps.label")} className="space-y-3">
      {keys.map((key, i) => {
        const n = i + 1;
        const isDone = n <= done;
        const isActive = n === active;
        return (
          <li key={key} className="flex items-center gap-3">
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ring-1 ring-inset tabular",
                isDone ? "bg-green-50 text-green-600 ring-green-100" : isActive ? "bg-gold-50 text-gold-600 ring-gold-200" : "bg-surface-2 text-ink-4 ring-line/15"
              )}
            >
              {isDone ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : isActive && spinning ? <Spinner size={14} /> : n}
            </span>
            <span className={cn("text-sm", isDone ? "text-ink" : isActive ? "font-medium text-ink" : "text-ink-3")}>{t(`success.steps.${key}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}
