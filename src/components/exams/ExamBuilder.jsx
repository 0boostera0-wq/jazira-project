"use client";

import { useEffect, useId, useReducer, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Crown, Lock, LogIn, Minus, PlayCircle, Plus, Shuffle, UserPlus } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/client";
import { formatRelative } from "@/i18n/format";
import { isDataError, listAttempts, startExam } from "@/lib/data/exams";
import { DIFFICULTIES, EXAMS, LIMITS, PRESETS } from "@/lib/exams/catalog";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import IconTile from "@/components/ui/IconTile";
import { cn } from "@/components/ui/cn";
import EliteBadge from "@/components/subscriptions/EliteBadge";
import UpgradeDialog from "@/components/subscriptions/UpgradeDialog";
import { toLatinDigits } from "@/components/auth/authUtils";
import { useBank } from "./BankProvider";
import { availableCount, totalOf } from "./bank";
import {
  builderReducer, clampMinutes, countLock, effectiveMinutes, estimateMinutes, initialBuilderState, maxQuestionsFor,
  presetLock, toStartConfig,
} from "./builder-logic";
import { handOff } from "./handoff";
import { sectionColor, sectionIcon, sectionLabel, signInHref, topicLabel } from "./labels";
import { attemptsToday } from "./stats-logic";
import { useTier } from "./useTier";

const optionBase =
  "relative flex cursor-pointer select-none rounded-md border border-line/15 bg-surface text-start transition-[border-color,background-color,box-shadow] duration-fast ease-out hover:border-line/30 has-[:checked]:border-gold-500 has-[:checked]:bg-gold-50 has-[:checked]:shadow-[0_0_0_1px_rgb(var(--c-gold-500))] has-[:focus-visible]:shadow-[var(--ring)]";

// An Alert whose action drops below the text on phones (no margin: callers add it).
const ALERT_STACKED = "flex-wrap sm:flex-nowrap [&>div:last-child]:basis-full [&>div:last-child]:ps-[1.875rem] sm:[&>div:last-child]:basis-auto sm:[&>div:last-child]:ps-0";

/**
 * The exam builder (client island). Exam type is fixed by the page; section,
 * level, length and time come from the viewer (and from deep-link params, see
 * builder-logic.js). Start → startExam() → the runner route, with the start
 * payload handed over in memory so the exam shell renders without a second
 * request.
 */
export default function ExamBuilder({ exam }) {
  const t = useT("exams");
  const tc = useT("common");
  const { locale } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const bank = useBank();
  const { isLoaded, isSignedIn, tier } = useTier();
  const uid = useId();

  const [state, dispatch] = useReducer(builderReducer, null, () => initialBuilderState(exam, params));
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null); // { kind: "signIn" } | { kind: "upgrade", feature }
  const [recent, setRecent] = useState(null);

  // Deep links clicked while on the page (section cards, "retry weakest").
  const paramsKey = params?.toString() || "";
  const firstParams = useRef(true);
  useEffect(() => {
    if (firstParams.current) {
      firstParams.current = false;
      return;
    }
    dispatch({ type: "params", value: new URLSearchParams(paramsKey), tier: tier || "elite" });
    setError(null);
  }, [paramsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pull the configuration inside the viewer's limits once auth resolves.
  useEffect(() => {
    if (tier) dispatch({ type: "tier", value: tier });
  }, [tier]);

  // Signed in: today's attempts (free daily limit) and an unfinished exam.
  useEffect(() => {
    if (!isSignedIn) {
      setRecent(null);
      return;
    }
    let alive = true;
    listAttempts({ limit: 10 })
      .then((r) => alive && setRecent(r.mode === "db" ? r.items : null))
      .catch(() => alive && setRecent(null));
    return () => {
      alive = false;
    };
  }, [isSignedIn]);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.prefetch("/exams/attempt/local");
  }, [isLoaded, isSignedIn, router]);

  const effTier = tier || "guest";
  const max = maxQuestionsFor(effTier);
  const sections = EXAMS[exam].sections;
  const many = sections.length > 2;
  const q = (count) => tc("units.questions", { count });
  const m = (count) => tc("units.minutes", { count });

  // What this viewer can actually draw: guests (and anyone when the database
  // is unreachable) practise from the bundled bank.
  const source = isSignedIn && bank.db ? bank.db : bank.local;
  const available = bank.status === "loading" ? undefined : source ? availableCount(source, { exam, section: state.section, topic: state.topic, difficulty: state.difficulty, premium: effTier === "elite" }) : null;
  const sectionTotal = (s) => (bank.status === "loading" || !source ? null : totalOf(s ? source.exams?.[exam]?.sections?.[s] : source.exams?.[exam]));

  const usedToday = effTier === "free" && recent ? attemptsToday(recent) : null;
  const leftToday = usedToday === null ? null : Math.max(0, LIMITS.freeDailyAttempts - usedToday);
  const now = Date.now();
  const open = recent?.find((it) => it.status === "in_progress" && Date.parse(it.expires_at) > now) || null;

  const minutes = effectiveMinutes(state);
  const shownMinutes = minutes ?? estimateMinutes(state.count);

  function lockDialog(lock, feature) {
    if (lock === "signIn") setDialog({ kind: "signIn" });
    else setDialog({ kind: "upgrade", feature });
  }

  function choosePreset(p) {
    const lock = presetLock(p, effTier);
    if (lock) {
      lockDialog(lock, p.premium ? t("builder.upgradeFeature.simulation") : t("builder.upgradeFeature.questions", { questions: q(LIMITS.freeMaxQuestions) }));
      return;
    }
    dispatch({ type: "preset", value: p.id });
  }

  function setCount(n) {
    const lock = countLock(n, effTier);
    if (lock) lockDialog(lock, t("builder.upgradeFeature.questions", { questions: q(LIMITS.freeMaxQuestions) }));
    dispatch({ type: "count", value: Math.min(n, max), tier: effTier });
  }

  async function start() {
    if (starting) return;
    setError(null);
    setStarting(true);
    try {
      const payload = await startExam(toStartConfig(state));
      router.push(handOff(payload));
      // keep the button busy until the runner route takes over
    } catch (e) {
      setStarting(false);
      const code = isDataError(e) ? e.code : "unknown";
      if (code === "premium_required") {
        const n = Number(e.details?.max_questions) || LIMITS.freeMaxQuestions;
        setDialog({ kind: "upgrade", feature: t("builder.upgradeFeature.questions", { questions: q(n) }) });
      }
      setError({ code, details: e?.details || null });
    }
  }

  const sectionName = sectionLabel(t, exam, state.section);
  const sectionField = exam === "achievement" ? "achievement" : "aptitude";

  return (
    <section aria-labelledby={`${uid}-title`} className="surface p-5 sm:p-7">
      {/* ── header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="t-eyebrow">{t("builder.eyebrow")}</p>
          <h2 id={`${uid}-title`} className="t-h3 mt-1.5">{t("builder.title")}</h2>
          <p className="t-small mt-1 text-ink-3">{t("builder.lead")}</p>
        </div>
        <TierNote t={t} q={q} tier={tier} leftToday={leftToday} exam={exam} />
      </div>

      {open && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-md border border-gold-200/70 bg-gold-50 p-3.5">
          <PlayCircle size={20} aria-hidden="true" className="shrink-0 text-gold-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">{t("builder.resume.title")}</p>
            <p className="t-caption">
              {t("builder.resume.body", { exam: `${t(`types.${open.exam}`)} · ${sectionLabel(t, open.exam, open.section)}`, when: formatRelative(open.started_at, locale) })}
            </p>
          </div>
          <Button href={`/exams/attempt/${open.id}`} size="sm" variant="secondary">{t("builder.resume.cta")}</Button>
        </div>
      )}

      <div className="mt-7 space-y-7">
        {/* ── section / subject ── */}
        <fieldset>
          <legend className="text-sm font-medium text-ink">{t(`builder.section.${sectionField}`)}</legend>
          <div className={cn("mt-2.5 grid gap-2", many ? "grid-cols-2 xl:grid-cols-5" : "grid-cols-1 sm:grid-cols-3")}>
            {[null, ...sections].map((s) => {
              const Icon = s ? sectionIcon(s) : Shuffle;
              const total = sectionTotal(s);
              return (
                <label
                  key={s || "mixed"}
                  className={cn(
                    optionBase,
                    "p-3",
                    many ? "flex-row items-center gap-3 xl:flex-col xl:items-start xl:gap-2" : "flex-row items-center gap-3",
                    !s && many && "col-span-2 xl:col-span-1"
                  )}
                >
                  <input
                    type="radio"
                    name={`${uid}-section`}
                    className="sr-only"
                    checked={state.section === s}
                    onChange={() => dispatch({ type: "section", value: s })}
                  />
                  <IconTile icon={Icon} tone="neutral" color={s ? sectionColor(s) : undefined} size="sm" className="!h-8 !w-8" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{s ? t(`sections.${s}`) : t("builder.section.mixed")}</span>
                    <span className="t-caption block truncate leading-snug">
                      {!s ? t(`mixed.${exam}`) : total === null ? " " : q(total)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* ── difficulty ── */}
        <fieldset>
          <legend className="text-sm font-medium text-ink">{t("builder.difficultyLabel")}</legend>
          <div className="mt-2.5 flex gap-1 rounded-full border border-line/12 bg-surface-2/80 p-1">
            {[null, ...DIFFICULTIES].map((d) => (
              <label
                key={d || "any"}
                className="relative flex h-10 flex-auto cursor-pointer items-center justify-center whitespace-nowrap rounded-full px-2.5 text-center text-sm font-medium text-ink-3 transition-colors hover:text-ink has-[:checked]:bg-surface has-[:checked]:text-ink has-[:checked]:shadow-sm has-[:focus-visible]:shadow-[var(--ring)]"
              >
                <input type="radio" name={`${uid}-difficulty`} className="sr-only" checked={state.difficulty === d} onChange={() => dispatch({ type: "difficulty", value: d })} />
                <span className="truncate">{t(`difficulty.${d || "any"}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* ── length ── */}
        <fieldset>
          <legend className="text-sm font-medium text-ink">{t("builder.lengthLabel")}</legend>
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRESETS.map((p) => {
              const lock = tier ? presetLock(p, effTier) : null;
              return (
                <label key={p.id} className={cn(optionBase, "flex-col p-3", lock && "bg-surface-2/50")}>
                  <input type="radio" name={`${uid}-length`} className="sr-only" checked={state.preset === p.id} onChange={() => choosePreset(p)} aria-describedby={lock ? `${uid}-lock-${p.id}` : undefined} />
                  <span className="text-sm font-medium leading-snug text-ink">{t(`builder.presets.${p.id}`)}</span>
                  <span className="t-caption mt-1 leading-snug">
                    <span className="whitespace-nowrap">{q(p.count)}</span>
                    <span> · </span>
                    <span className="whitespace-nowrap">{m(p.minutes)}</span>
                  </span>
                  {lock && (
                    <span id={`${uid}-lock-${p.id}`} className={cn("mt-1.5 inline-flex items-center gap-1 text-[0.75rem] font-medium", lock === "elite" ? "text-gold-700" : "text-ink-3")}>
                      {lock === "elite" ? <Crown size={12} aria-hidden="true" /> : <Lock size={12} aria-hidden="true" />}
                      {t(`builder.locks.${lock}`)}
                    </span>
                  )}
                </label>
              );
            })}
            <label className={cn(optionBase, "flex-col p-3")}>
              <input type="radio" name={`${uid}-length`} className="sr-only" checked={state.preset === "custom"} onChange={() => dispatch({ type: "preset", value: "custom" })} />
              <span className="text-sm font-medium text-ink">{t("builder.presets.custom")}</span>
              <span className="t-caption mt-1 leading-snug">{t("builder.presets.customMeta", { min: LIMITS.minQuestions, max: q(max) })}</span>
            </label>
          </div>

          {state.preset === "custom" && (
            <div className="animate-fade mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-2/70 p-3">
              <label htmlFor={`${uid}-count`} className="text-sm font-medium text-ink">{t("builder.count.label")}</label>
              <Stepper
                id={`${uid}-count`}
                value={state.count}
                min={LIMITS.minQuestions}
                max={max}
                onChange={setCount}
                onOverflow={() => setCount(max + 1)}
                decLabel={t("builder.count.decrease")}
                incLabel={t("builder.count.increase")}
                hint={t("builder.count.hint", { min: LIMITS.minQuestions, max })}
              />
            </div>
          )}
        </fieldset>

        {/* ── time ── */}
        <fieldset>
          <legend className="text-sm font-medium text-ink">{t("builder.time.label")}</legend>
          <div className="mt-2.5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="grid shrink-0 grid-cols-2 gap-1 rounded-full border border-line/12 bg-surface-2/80 p-1 sm:w-64">
              {["auto", "custom"].map((mode) => (
                <label
                  key={mode}
                  className="relative flex h-10 cursor-pointer items-center justify-center rounded-full px-3 text-sm font-medium text-ink-3 transition-colors hover:text-ink has-[:checked]:bg-surface has-[:checked]:text-ink has-[:checked]:shadow-sm has-[:focus-visible]:shadow-[var(--ring)]"
                >
                  <input
                    type="radio"
                    name={`${uid}-time`}
                    className="sr-only"
                    checked={mode === "custom" ? state.timeMode === "custom" : state.timeMode !== "custom"}
                    onChange={() => dispatch(mode === "custom" ? { type: "timeMode", value: "custom" } : state.preset === "custom" ? { type: "timeMode", value: "auto" } : { type: "preset", value: state.preset })}
                  />
                  {t(`builder.time.${mode}`)}
                </label>
              ))}
            </div>
            {state.timeMode === "custom" ? (
              <div className="animate-fade flex flex-1 flex-wrap items-center justify-between gap-3 sm:justify-end">
                <label htmlFor={`${uid}-minutes`} className="text-sm text-ink-2 sm:sr-only">{t("builder.time.minutes")}</label>
                <Stepper
                  id={`${uid}-minutes`}
                  value={state.minutes}
                  min={LIMITS.minMinutes}
                  max={LIMITS.maxMinutes}
                  step={5}
                  onChange={(v) => dispatch({ type: "minutes", value: clampMinutes(v) })}
                  decLabel={t("builder.time.decrease")}
                  incLabel={t("builder.time.increase")}
                  hint={t("builder.time.minutesHint", { min: LIMITS.minMinutes, max: LIMITS.maxMinutes })}
                />
              </div>
            ) : (
              <p className="t-small text-ink-3">
                {state.timeMode === "preset" ? t("builder.time.presetHint", { minutes: m(state.minutes) }) : t("builder.time.autoHint", { minutes: m(estimateMinutes(state.count)) })}
              </p>
            )}
          </div>
        </fieldset>
      </div>

      {state.topic && (
        <Alert
          tone="info"
          className={cn("mt-6", ALERT_STACKED)}
          action={
            <Button size="sm" variant="secondary" onClick={() => dispatch({ type: "topic", value: null })}>
              {t("builder.topicAll", { section: sectionName })}
            </Button>
          }
        >
          {t("builder.topicNote", { topic: topicLabel(t, state.topic), section: sectionName })}
        </Alert>
      )}

      {/* ── summary + start ── */}
      <div className="mt-7 border-t border-line/10 pt-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="sr-only">{t("builder.summary.label")}</p>
            <ul className="flex flex-wrap gap-1.5" aria-label={t("builder.summary.label")}>
              <li><Badge tone="outline">{sectionName}</Badge></li>
              {state.topic && <li><Badge tone="outline">{topicLabel(t, state.topic)}</Badge></li>}
              <li><Badge tone="outline">{t(`difficulty.${state.difficulty || "any"}`)}</Badge></li>
              <li><Badge tone="gold">{q(state.count)}</Badge></li>
              <li><Badge tone="gold">{minutes ? m(shownMinutes) : t("builder.summary.autoMinutes", { minutes: m(shownMinutes) })}</Badge></li>
            </ul>
            <Availability t={t} q={q} available={available} count={state.count} />
          </div>
          <Button
            size="lg"
            onClick={start}
            loading={starting}
            disabled={available === 0 || leftToday === 0}
            iconEnd={starting ? undefined : ArrowRight}
            className="w-full shrink-0 md:w-auto"
          >
            {starting ? t("builder.starting") : t("builder.start")}
          </Button>
        </div>

        {leftToday === 0 && !error && (
          <Alert tone="warning" className={cn("mt-4", ALERT_STACKED)} action={<Button href="/subscriptions" size="sm" variant="gold" iconStart={Crown}>{t("errors.upgrade")}</Button>}>
            {t("builder.tier.free.none", { attempts: t("units.attempts", { count: LIMITS.freeDailyAttempts }) })}
          </Alert>
        )}
        {error && <StartError t={t} q={q} locale={locale} error={error} exam={exam} />}
      </div>

      <UpgradeDialog open={dialog?.kind === "upgrade"} onClose={() => setDialog(null)} feature={dialog?.feature} />
      <Dialog
        open={dialog?.kind === "signIn"}
        onClose={() => setDialog(null)}
        variant="sheet"
        size="sm"
        title={t("builder.signInNeeded.title")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>{t("builder.signInNeeded.later")}</Button>
            <Button href={signInHref(`/exams/${exam}`)} variant="secondary" iconStart={LogIn}>{t("builder.signInNeeded.signIn")}</Button>
            <Button href={signInHref(`/exams/${exam}`, "/sign-up")} iconStart={UserPlus}>{t("builder.signInNeeded.signUp")}</Button>
          </>
        }
      >
        <p className="t-body text-ink-2">
          {t("builder.signInNeeded.body", { questions: q(LIMITS.guestMaxQuestions), free: q(LIMITS.freeMaxQuestions) })}
        </p>
      </Dialog>
    </section>
  );
}

function TierNote({ t, q, tier, leftToday, exam }) {
  if (!tier) return <span aria-hidden="true" className="skeleton hidden h-12 w-48 rounded-md sm:block" />;
  if (tier === "elite") {
    return (
      <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
        <EliteBadge size="sm" />
        <p className="t-caption">{t("builder.tier.elite.body", { questions: q(LIMITS.maxQuestions) })}</p>
      </div>
    );
  }
  if (tier === "free") {
    return (
      <div className="shrink-0 rounded-md bg-surface-2/70 px-3 py-2 sm:max-w-[15rem] sm:text-end">
        <p className="text-sm font-medium text-ink">{t("builder.tier.free.title")}</p>
        <p className="t-caption">
          {leftToday === null
            ? t("builder.tier.free.body", { questions: q(LIMITS.freeMaxQuestions), attempts: t("units.attempts", { count: LIMITS.freeDailyAttempts }) })
            : t("builder.tier.free.left", { left: leftToday, limit: LIMITS.freeDailyAttempts })}
        </p>
      </div>
    );
  }
  return (
    <div className="shrink-0 rounded-md bg-surface-2/70 px-3 py-2 sm:max-w-[16rem] sm:text-end">
      <p className="text-sm font-medium text-ink">{t("builder.tier.guest.title")}</p>
      <p className="t-caption">{t("builder.tier.guest.body", { questions: q(LIMITS.guestMaxQuestions) })}</p>
      <Button href={signInHref(`/exams/${exam}`)} variant="link" size="sm" className="mt-1 text-[0.8125rem]">{t("builder.tier.guest.cta")}</Button>
    </div>
  );
}

function Availability({ t, q, available, count }) {
  if (available === undefined) return <p className="t-caption mt-2.5">{t("builder.available.loading")}</p>;
  if (available === null) return null;
  if (available === 0) return <p className="mt-2.5 text-[0.8125rem] font-medium text-danger">{t("builder.available.none")}</p>;
  if (available < count) return <p className="mt-2.5 text-[0.8125rem] font-medium text-warning">{t("builder.available.fewer", { questions: q(available) })}</p>;
  return <p className="t-caption mt-2.5">{t("builder.available.count", { questions: q(available) })}</p>;
}

function StartError({ t, q, locale, error, exam }) {
  const { code, details } = error;
  let text;
  let action = null;
  if (code === "premium_required") {
    text = t("errors.premium_required", { questions: q(Number(details?.max_questions) || LIMITS.freeMaxQuestions) });
    action = <Button href="/subscriptions" size="sm" variant="gold" iconStart={Crown}>{t("errors.upgrade")}</Button>;
  } else if (code === "daily_limit_reached") {
    const when = details?.resets_at ? formatRelative(details.resets_at, locale) : t("errors.daily_limit_soon");
    text = t("errors.daily_limit_reached", { attempts: t("units.attempts", { count: Number(details?.limit) || LIMITS.freeDailyAttempts }), when });
    action = <Button href="/subscriptions" size="sm" variant="gold" iconStart={Crown}>{t("errors.upgrade")}</Button>;
  } else if (code === "not_authenticated") {
    text = t("errors.not_authenticated");
    action = <Button href={signInHref(`/exams/${exam}`)} size="sm" iconStart={LogIn}>{t("errors.signIn")}</Button>;
  } else {
    text = t(`errors.${t.has(`errors.${code}`) ? code : "unknown"}`);
  }
  const tone = code === "premium_required" || code === "daily_limit_reached" ? "warning" : "danger";
  return (
    <Alert tone={tone} className={cn("mt-4", action && ALERT_STACKED)} action={action}>
      {text}
    </Alert>
  );
}

/** − [ n ] + control (44px targets). Commits typed values on blur / Enter; Arabic-Indic and Persian digits count. */
function Stepper({ id, value, min, max, step = 1, onChange, onOverflow, decLabel, incLabel, hint }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = parseInt(toLatinDigits(draft), 10);
    if (!Number.isFinite(n)) return setDraft(String(value));
    if (n > max && onOverflow) onOverflow();
    onChange(Math.min(max, Math.max(min, n)));
  };
  const btn = "grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line/20 bg-surface text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-40";
  // step to the next multiple of `step` (5 → 10 → 15 minutes; 1 by 1 for counts)
  const up = () => (value >= max ? onOverflow?.() : onChange(Math.min(max, Math.floor(value / step) * step + step)));
  const down = () => onChange(Math.max(min, Math.ceil(value / step) * step - step));
  return (
    <div className="flex items-center gap-3">
      <span className="t-caption hidden xs:inline">{hint}</span>
      <div className="flex items-center gap-1.5" dir="ltr">
        <button type="button" className={btn} onClick={down} disabled={value <= min} aria-label={decLabel}>
          <Minus size={16} aria-hidden="true" />
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 3))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          className="h-11 w-16 rounded-md border border-line/20 bg-surface text-center text-[1rem] font-bold text-ink tabular focus:border-gold-400 focus:outline-none"
        />
        <button type="button" className={btn} onClick={up} aria-label={incLabel} aria-disabled={value >= max && !onOverflow}>
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

