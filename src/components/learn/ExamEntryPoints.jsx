"use client";

import { useState } from "react";
import { ClipboardCheck, Lock, PlayCircle, Timer, Zap } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/client";
import { formatNumber } from "@/i18n/format";
import { isDataError, startExam } from "@/lib/data/exams";
import { handOff } from "@/components/exams/handoff";
import { useTier } from "@/components/exams/useTier";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import ContentText from "./ContentText";

const TIER = { guest: "guest", free: "free", elite: "premium" };
const KNOWN_ERRORS = new Set(["insufficient_pool", "premium_required", "daily_limit_reached", "scope_too_large", "rate_limited", "network", "unavailable"]);

/**
 * "Test yourself" (§7): one row per template × scope. The server computed the
 * offers for every tier (learn-logic entryPointsFor, pool rule); this island
 * picks the viewer's tier, labels mini versions and starts the session
 * (startExam → start_template_attempt, or a guest session) then opens the runner.
 * A template that is not offered stays visible, disabled, with the honest reason.
 *   primary / related: entry objects · titleId: heading id (null = no heading)
 */
export default function ExamEntryPoints({ primary = [], related = [], titleId = "test-yourself", heading = true, className }) {
  const t = useT("learn");
  const { locale } = useLocale();
  const router = useRouter();
  const { isLoaded, tier: rawTier } = useTier();
  const tier = TIER[rawTier] || "guest";
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function start(e) {
    if (busy) return;
    setBusy(e.key);
    setError(null);
    try {
      const payload = await startExam({ template: e.template, scope: e.scope });
      // handOff also points /exams/attempt/local at a guest session (mode "guest").
      router.push(handOff(payload));
      // stay busy until the runner route takes over
    } catch (err) {
      setBusy(null);
      const code = isDataError(err) && KNOWN_ERRORS.has(err.code) ? err.code : "unknown";
      setError({ key: e.key, code });
    }
  }

  const row = (e) => {
    const offer = e.offers?.[tier] ?? e.offers?.guest;
    const label = t(`entry.templates.${e.template}`, { term: e.term && e.term !== "year" ? t(`term.${e.term}`) : "" });
    const disabled = !offer?.offered;
    const reason = disabled ? offer?.reason || "insufficient_pool" : null;
    const hint = reason && (reason === "insufficient_pool" || reason === "term_unverified")
      ? t(`entry.reasonHint.${reason}`, { required: formatNumber(offer?.required ?? 0, locale), available: formatNumber(offer?.available ?? 0, locale) })
      : null;
    const errId = `${titleId}-${e.key.replace(/[^a-z0-9-]/gi, "-")}-err`;
    return (
      <li key={e.key} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center">
        <span
          aria-hidden="true"
          className={cn("hidden h-10 w-10 shrink-0 place-items-center rounded-md ring-1 ring-inset xs:grid", disabled ? "bg-surface-2 text-ink-4 ring-line/10" : "bg-gold-50 text-gold-700 ring-gold-200/60")}
        >
          {disabled ? <Lock size={17} /> : <ClipboardCheck size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-ink">{label}</span>
            {offer?.mini && (
              <Badge size="sm" tone="gold" title={t("entry.miniHint")}>
                {t("entry.mini")}
              </Badge>
            )}
          </p>
          <p className="t-caption mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {/* The scope title in the UI language when the outline has one, else the listed title in its own lang/dir. */}
            <ContentText text={e.title} textEn={e.title_en} locale={locale} className="min-w-0 truncate" />
            {offer?.count ? <span className="tabular">· {t("entry.count", { count: offer.count })}</span> : null}
            <span className="inline-flex items-center gap-1">
              · {e.timed ? <Timer size={12} aria-hidden="true" /> : null}
              {e.timed ? t("entry.timed") : t("entry.untimed")}
            </span>
            {e.feedback === "immediate" && (
              <span className="inline-flex items-center gap-1">
                · <Zap size={12} aria-hidden="true" />
                {t("entry.immediate")}
              </span>
            )}
          </p>
          {disabled && (
            <p className="t-caption mt-1 text-ink-2">
              <span className="font-medium">{t(`entry.reasons.${reason}`)}</span>
              {hint ? <span className="text-ink-3"> — {hint}</span> : null}
            </p>
          )}
          {error?.key === e.key && (
            <p id={errId} role="alert" className="t-small mt-1.5 text-danger">
              {t(`entry.errors.${error.code}`)}
            </p>
          )}
        </div>
        {!disabled && (
          <Button
            size="sm"
            variant={busy === e.key ? "primary" : "secondary"}
            iconStart={PlayCircle}
            loading={busy === e.key}
            disabled={!isLoaded || (busy !== null && busy !== e.key)}
            onClick={() => start(e)}
            aria-describedby={error?.key === e.key ? errId : undefined}
            aria-label={`${t("entry.start")}: ${label}`}
            className="shrink-0 self-start max-sm:h-11 sm:self-auto"
          >
            {t("entry.start")}
          </Button>
        )}
      </li>
    );
  };

  if (!primary.length && !related.length) return null;
  return (
    <section aria-labelledby={heading ? titleId : undefined} className={className}>
      {heading && (
        <>
          <h2 id={titleId} className="t-h4">{t("entry.title")}</h2>
          <p className="t-caption mt-0.5">{t("entry.lead")}</p>
        </>
      )}
      <ul className="mt-1 divide-y divide-line/10">{primary.map(row)}</ul>
      {related.length > 0 && (
        <>
          <h3 className="t-caption mt-4 font-medium uppercase tracking-wide text-ink-3">{t("entry.related")}</h3>
          <ul className="divide-y divide-line/10">{related.map(row)}</ul>
        </>
      )}
      {isLoaded && tier === "guest" && <p className="t-caption mt-3">{t("entry.guestNote")}</p>}
    </section>
  );
}
