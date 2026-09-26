"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Gift, RotateCcw, Share2, Sparkles } from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import { localizeHref } from "@/i18n/config";
import { useAuthUser } from "@/context/AuthProvider";
import { getSupabase } from "@/lib/supabase-lazy";
import Button from "@/components/ui/Button";
import IconTile from "@/components/ui/IconTile";
import Skeleton from "@/components/ui/Skeleton";
import { ProgressBar } from "@/components/ui/Progress";
import { cn } from "@/components/ui/cn";
import { PLAN, planVars } from "./plan";

/**
 * Invite programme. Real mechanics (see ReferralCapture + public.referrals):
 * a friend opens the personal link (?ref=<inviter id>), signs in with a
 * DIFFERENT account, and one row is recorded per invited account. Reaching
 * REFERRAL_TARGET unlocks a limited bonus — never Elite, never the badge.
 *
 * The count shown is ONLY the one the database returns for the signed-in
 * account (RLS: rows where I'm the referrer). Nothing is read from or written to
 * browser storage, so a shared computer never shows another student's invites,
 * and "bonus unlocked" is never derived from an unverified number.
 */
export default function ReferralPanel({ className }) {
  const t = useT("subscriptions");
  const tc = useT("common");
  const { locale } = useLocale();
  const { isLoaded, isSignedIn, userId } = useAuthUser();
  // Verified invite count for `uid` (null until the database answers).
  const [invites, setInvites] = useState({ uid: null, count: null, status: "loading" }); // loading | ready | error
  const [copy, setCopy] = useState("idle"); // idle | copied | failed
  const [link, setLink] = useState("");
  const [canShare, setCanShare] = useState(false);
  const inputRef = useRef(null);
  const target = PLAN.referral.target;

  // Build the link on the client (needs the real origin) — stable per account.
  useEffect(() => {
    if (!userId) return;
    setLink(`${window.location.origin}${localizeHref("/", locale)}?ref=${encodeURIComponent(userId)}`);
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, [userId, locale]);

  // Authoritative count of successful invites. A newer request (or another
  // account signing in) supersedes an older one, so a late answer never lands
  // on the wrong account.
  const requestRef = useRef(0);
  const refresh = useCallback(async () => {
    if (!userId) return;
    const req = ++requestRef.current;
    setInvites({ uid: userId, count: null, status: "loading" });
    let next;
    try {
      const supabase = await getSupabase();
      if (!supabase) throw new Error("unavailable");
      const { count, error } = await supabase
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", userId);
      if (error || typeof count !== "number") throw error || new Error("no count");
      next = { uid: userId, count: Math.max(0, count), status: "ready" };
    } catch {
      next = { uid: userId, count: null, status: "error" };
    }
    if (req === requestRef.current) setInvites(next);
  }, [userId]);

  useEffect(() => {
    refresh();
    return () => { requestRef.current += 1; };
  }, [refresh]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopy("copied");
    } catch {
      inputRef.current?.select();
      setCopy("failed");
    }
    window.setTimeout(() => setCopy("idle"), 2200);
  };

  const onShare = async () => {
    try {
      await navigator.share({ title: t("referral.shareTitle"), text: t("referral.shareText"), url: link });
    } catch {
      /* dismissed */
    }
  };

  const header = (
    <div className="flex items-start gap-3">
      <IconTile icon={Gift} tone="gold" />
      <div className="min-w-0">
        <p className="t-eyebrow">{t("referral.eyebrow")}</p>
        <h3 className="t-h4 mt-0.5">{t("referral.title")}</h3>
      </div>
    </div>
  );

  if (!isLoaded) {
    return (
      <section aria-busy="true" className={cn("surface p-5 sm:p-6", className)}>
        {header}
        <Skeleton className="mt-5 h-3.5 w-full" />
        <Skeleton className="mt-2 h-3.5 w-2/3" />
        <Skeleton rounded="md" className="mt-5 h-20 w-full" />
      </section>
    );
  }

  if (!isSignedIn) {
    return (
      <section className={cn("surface p-5 sm:p-6", className)}>
        {header}
        <p className="t-small mt-4 text-ink-2">{t("referral.body")}</p>
        <RewardList t={t} tc={tc} className="mt-4" />
        <div className="mt-5 rounded-md bg-surface-2 p-4">
          <p className="text-sm font-medium text-ink">{t("referral.signedOutTitle")}</p>
          <p className="t-caption mt-1">{t("referral.signedOutBody")}</p>
          <Button href={`/sign-in?next=${encodeURIComponent("/subscriptions")}`} size="sm" variant="secondary" className="mt-3 max-sm:h-11">
            {t("referral.signIn")}
          </Button>
        </div>
      </section>
    );
  }

  // Only a count fetched for THIS account is ever shown.
  const mine = invites.uid === userId;
  const status = mine ? invites.status : "loading";
  const count = mine && status === "ready" ? invites.count : null;
  const verified = count !== null;
  const unlocked = verified && count >= target;
  const left = verified ? Math.max(0, target - count) : 0;
  const pct = verified ? Math.min(100, Math.round((count / target) * 100)) : 0;

  return (
    <section className={cn("surface p-5 sm:p-6", className)}>
      {header}
      <p className="t-small mt-4 text-ink-2">{t("referral.body")}</p>

      <div className="mt-5 rounded-md bg-surface-2 p-4" aria-busy={status === "loading" || undefined}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-ink">{t("referral.progressLabel")}</p>
          <p className="text-sm text-ink-2 tabular">
            {verified ? t("referral.progress", { count, target })
              : status === "error" ? <span aria-hidden="true">—</span>
              : <span aria-hidden="true" className="skeleton inline-block h-3.5 w-12 rounded-sm align-middle" />}
          </p>
        </div>
        {verified ? (
          <>
            <ProgressBar value={pct} tone={unlocked ? "green" : "gold"} className="mt-2.5" label={t("referral.progressLabel")} />
            {unlocked ? (
              <p className="mt-2.5 flex items-center gap-1.5 text-sm font-medium text-green-700">
                <Sparkles size={15} aria-hidden="true" /> {t("referral.unlocked")}
              </p>
            ) : (
              <p className="t-caption mt-2.5">{t("referral.remaining", { invites: t("units.invites", { count: left }) })}</p>
            )}
          </>
        ) : status === "error" ? (
          <div>
            <p role="status" className="t-caption mt-2.5 text-warning">{t("referral.countError")}</p>
            <Button onClick={refresh} variant="ghost" size="sm" iconStart={RotateCcw} className="-ms-4 mt-1.5 max-sm:h-11">
              {tc("actions.retry")}
            </Button>
          </div>
        ) : (
          <>
            <Skeleton rounded="full" className="mt-2.5 h-2 w-full" />
            <Skeleton className="mt-3 h-3 w-1/2" />
          </>
        )}
      </div>

      <RewardList t={t} tc={tc} className="mt-5" />

      <div className="mt-5">
        <label htmlFor="jz-invite-link" className="mb-1.5 block text-sm font-medium text-ink">
          {t("referral.linkLabel")}
        </label>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            id="jz-invite-link"
            readOnly
            dir="ltr"
            value={link}
            onFocus={(e) => e.target.select()}
            className="h-11 min-w-0 flex-1 truncate rounded-md border border-line/20 bg-surface-2/60 px-3 text-sm text-ink-2 focus:border-gold-400 focus:outline-none"
          />
          <Button
            onClick={onCopy}
            variant="secondary"
            size="md"
            iconStart={copy === "copied" ? Check : Copy}
            disabled={!link}
            className="shrink-0 px-4"
          >
            {copy === "copied" ? t("referral.copied") : t("referral.copy")}
          </Button>
        </div>
        <p className="sr-only" role="status">{copy === "copied" ? t("referral.copied") : ""}</p>
        {copy === "failed" && <p className="t-caption mt-1.5 text-warning" role="alert">{t("referral.copyFailed")}</p>}
        {canShare && (
          <Button onClick={onShare} variant="ghost" size="sm" iconStart={Share2} className="-ms-4 mt-2 max-sm:h-11">
            {t("referral.share")}
          </Button>
        )}
      </div>
    </section>
  );
}

function RewardList({ t, tc, className }) {
  const v = planVars(t, tc);
  return (
    <div className={className}>
      <p className="text-sm font-medium text-ink">{t("referral.rewardTitle", { invites: v.referralInvites })}</p>
      <p className="t-small mt-2 flex items-start gap-2 text-ink-2">
        <Check size={16} aria-hidden="true" className="mt-1 shrink-0 text-green-600" />
        {t("referral.reward", { total: v.referralTotal, hours: v.windowHours, free: v.freeMessages })}
      </p>
      <p className="t-caption mt-2">{t("referral.notElite")}</p>
    </div>
  );
}
