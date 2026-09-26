"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CloudOff, Flag, Info, Keyboard, LayoutGrid, RotateCcw, Send } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { formatNumber } from "@/i18n/format";
import { saveAnswer, submitExam } from "@/lib/data/exams";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import IconTile from "@/components/ui/IconTile";
import { ProgressBar } from "@/components/ui/Progress";
import Spinner from "@/components/ui/Spinner";
import { cn } from "@/components/ui/cn";
import { createAutosave } from "./autosave";
import { clearDraft, writeDraft } from "./handoff";
import { examIcon, sectionLabel } from "./labels";
import QuestionCard from "./QuestionCard";
import QuestionNavigator, { NavigatorLegend } from "./QuestionNavigator";
import RunnerTimer from "./RunnerTimer";
import { answersPayload, keyAction, runnerReducer, summarize } from "./runner-logic";

const MAX_SPENT = 14400;

/**
 * The exam runner. Renders immediately from a normalised session
 * (runner-logic.toRunnerSession), tracks answers / flags / per-question time,
 * autosaves (debounced, retried, offline-tolerant, mirrored to a local draft),
 * guards against leaving, and submits — manually or at 0:00.
 *
 * props: session, isSignedIn, onResult(result), onReload() (attempt closed elsewhere)
 */
export default function ExamRunner({ session, isSignedIn, onResult, onReload }) {
  const t = useT("exams");
  const tc = useT("common");
  const { locale, isRTL } = useLocale();
  const isLocal = session.mode === "local";

  const positions = useMemo(() => session.questions.map((q) => q.position), [session]);
  const byPos = useMemo(() => Object.fromEntries(session.questions.map((q) => [q.position, q])), [session]);
  const [state, dispatch] = useReducer(runnerReducer, null, () => ({ answers: session.answers, current: session.current, positions }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const spentRef = useRef({ ...session.spent });
  const draftRef = useRef({});
  const autosaveRef = useRef(null);
  const submittingRef = useRef(false);
  const leavingRef = useRef(false);

  const [saveStatus, setSaveStatus] = useState("idle");
  const [navOpen, setNavOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submit, setSubmit] = useState({ status: "idle", auto: false, code: null });
  const [leaveHref, setLeaveHref] = useState(null);
  const leaveLinkRef = useRef(null);

  const summary = summarize(state.answers, positions);
  const index = positions.indexOf(state.current);
  const question = byPos[state.current];
  const isLast = index === positions.length - 1;

  // ── autosave (created in an effect so StrictMode remounts get a live queue) ──
  useEffect(() => {
    const q = createAutosave({
      save: (pos, p) => saveAnswer(session.id, pos, p.selected, { timeSpentSeconds: p.spent, flagged: p.flagged }),
      getPayload: (pos) => ({
        selected: stateRef.current.answers[pos]?.selected ?? null,
        flagged: Boolean(stateRef.current.answers[pos]?.flagged),
        spent: Math.min(MAX_SPENT, Math.round(spentRef.current[pos] || 0)),
      }),
      delay: isLocal ? 120 : 700,
      onStatus: setSaveStatus,
      onSaved: (pos) => {
        if (isLocal || !draftRef.current[pos]) return;
        delete draftRef.current[pos];
        writeDraft(session.id, draftRef.current);
      },
      onClosed: () => {
        if (!submittingRef.current) onReload?.();
      },
    });
    autosaveRef.current = q;
    for (const p of session.dirty || []) {
      draftRef.current[p] = { ...stateRef.current.answers[p], spent: spentRef.current[p] || 0 };
      q.queue(p);
    }
    return () => {
      q.flush(); // hand pending answers to the data layer (local mode writes synchronously)
      q.cancel();
      if (autosaveRef.current === q) autosaveRef.current = null;
    };
  }, [session.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = useCallback(
    (action) => {
      const prev = stateRef.current;
      const next = runnerReducer(prev, action);
      if (next === prev) return;
      stateRef.current = next;
      dispatch(action);
      if (action.position === undefined) return;
      if (!isLocal) {
        draftRef.current[action.position] = { ...next.answers[action.position], spent: Math.round(spentRef.current[action.position] || 0) };
        writeDraft(session.id, draftRef.current);
      }
      autosaveRef.current?.queue(action.position);
    },
    [isLocal, session.id]
  );

  const go = useCallback((position) => {
    dispatch({ type: "goto", position });
    setNavOpen(false);
  }, []);
  const next = () => (isLast ? setConfirmOpen(true) : dispatch({ type: "next" }));
  const prev = () => dispatch({ type: "prev" });
  const flag = () => change({ type: "flag", position: stateRef.current.current });

  // Move focus to the new question for keyboard / screen-reader users.
  const currentPos = state.current;
  const shownPos = useRef(currentPos); // StrictMode-safe "did the question change?"
  useEffect(() => {
    if (shownPos.current === currentPos) return;
    shownPos.current = currentPos;
    document.getElementById(`q-${currentPos}-stem`)?.focus({ preventScroll: true });
    const top = document.getElementById("runner-question");
    // bring the new question's start below the sticky headers when it is scrolled away
    if (top && top.getBoundingClientRect().top < 140) top.scrollIntoView({ block: "start" });
  }, [currentPos]);

  // ── per-question time (visible tab only) ──
  useEffect(() => {
    const iv = setInterval(() => {
      if (document.visibilityState !== "visible" || submittingRef.current) return;
      const c = stateRef.current.current;
      spentRef.current[c] = Math.min(MAX_SPENT, (spentRef.current[c] || 0) + 1);
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // ── connectivity ──
  useEffect(() => {
    const online = () => autosaveRef.current?.online();
    const offline = () => setSaveStatus((s) => (s === "idle" || s === "saved" ? s : "offline"));
    const hidden = () => document.visibilityState === "hidden" && autosaveRef.current?.flush();
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);

  // ── submit ──
  const doSubmit = useCallback(
    async (auto = false) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmit({ status: "submitting", auto, code: null });
      try {
        const result = await submitExam(session.id, answersPayload(positions, stateRef.current.answers, spentRef.current));
        autosaveRef.current?.cancel();
        clearDraft(session.id);
        onResult(result);
      } catch (e) {
        submittingRef.current = false;
        const code = e?.code || "unknown";
        if (code === "attempt_closed") {
          onReload?.();
          return;
        }
        setSubmit({ status: "error", auto, code });
      }
    },
    [session.id, positions, onResult, onReload]
  );

  const onExpire = useCallback(() => {
    setConfirmOpen(false);
    setNavOpen(false);
    setLeaveHref(null);
    doSubmit(true);
  }, [doSubmit]);

  // Time ran out while offline: retry as soon as the connection is back.
  useEffect(() => {
    if (submit.status !== "error" || !submit.auto) return;
    const retry = () => doSubmit(true);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [submit, doSubmit]);

  // ── keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || submittingRef.current) return;
      if (e.target?.closest?.("input, textarea, select, [contenteditable='true'], dialog")) return;
      if (document.querySelector("dialog[open]")) return;
      const q = byPos[stateRef.current.current];
      const a = keyAction(e, { rtl: isRTL, choices: q?.choices.length || 4 });
      if (!a) return;
      e.preventDefault();
      if (a.type === "choose") change({ type: "select", position: stateRef.current.current, index: a.index });
      else if (a.type === "flag") change({ type: "flag", position: stateRef.current.current });
      else if (a.type === "next") dispatch({ type: "next" });
      else if (a.type === "prev") dispatch({ type: "prev" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [byPos, isRTL, change]);

  // ── leave guard: reload/close + in-app links ──
  useEffect(() => {
    const beforeUnload = (e) => {
      if (submittingRef.current || leavingRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e) => {
      if (submittingRef.current || leavingRef.current) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target?.closest?.("a[href]");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      leaveLinkRef.current = a;
      setLeaveHref(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("click", onClick, true);
    };
  }, []);

  const leave = () => {
    leavingRef.current = true;
    autosaveRef.current?.flush();
    const href = leaveHref;
    const link = leaveLinkRef.current;
    leaveLinkRef.current = null;
    setLeaveHref(null);
    // Replay the original click once the modal has closed, so the app's own
    // <Link> navigates client-side (no full reload). The captured href is
    // already localized; it is only the fallback for a link that has left
    // the DOM in the meantime.
    requestAnimationFrame(() => {
      if (link?.isConnected) link.click();
      else window.location.assign(href);
    });
  };
  const stay = () => {
    leaveLinkRef.current = null;
    setLeaveHref(null);
  };

  const Icon = examIcon(session.exam);
  const title = `${t(`types.${session.exam}`)} · ${sectionLabel(t, session.exam, session.section)}`;
  const progress = (summary.answered / summary.total) * 100;
  const submitting = submit.status === "submitting";

  return (
    <div className="pb-4">
      {/* ── sticky exam header ── */}
      <div className="sticky top-[var(--topbar-h)] z-20 -mx-[var(--gutter)] -mt-6 border-b border-line/10 bg-canvas/95 px-[var(--gutter)] backdrop-blur-sm sm:-mt-8">
        <div className="flex h-16 items-center gap-3">
          <IconTile icon={Icon} tone="gold" size="sm" className="hidden xs:inline-grid" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[0.9375rem] font-bold text-ink">{title}</h1>
            <p className="t-caption truncate tabular">
              {t("runner.questionOf", { current: index + 1, total: summary.total })}
              <span className="hidden sm:inline"> · {t("runner.answeredOf", { answered: summary.answered, total: summary.total })}</span>
            </p>
          </div>
          {isLocal && <Badge tone="info" size="sm" icon={Info} className="hidden md:inline-flex">{t("runner.practice.badge")}</Badge>}
          {!isLocal && <SaveIndicator t={t} status={saveStatus} compact />}
          <RunnerTimer deadline={session.deadline} limit={session.timeLimitSeconds} onExpire={onExpire} />
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line/15 bg-surface text-ink-2 hover:bg-surface-2 lg:hidden"
            aria-label={t("runner.navigator.open")}
          >
            <LayoutGrid size={18} aria-hidden="true" />
          </button>
        </div>
        <ProgressBar value={progress} tone="green" size="sm" label={t("runner.answeredOf", { answered: summary.answered, total: summary.total })} className="!h-[3px] !rounded-none !bg-transparent" />
      </div>

      {isLocal && (
        <Alert tone="info" className="mt-5">
          {t("runner.practice.body")}
          {!isSignedIn && session.limited && session.requested ? ` ${t("runner.practice.limited", { requested: tc("units.questions", { count: session.requested }), questions: tc("units.questions", { count: summary.total }) })}` : ""}
        </Alert>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_17.5rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div id="runner-question" className="min-w-0 scroll-mt-40">
          <QuestionCard
            key={state.current}
            t={t}
            question={question}
            index={index}
            total={summary.total}
            answer={state.answers[state.current]}
            onChoose={(i) => change({ type: "select", position: state.current, index: i })}
            onClear={() => change({ type: "clear", position: state.current })}
            onFlag={flag}
          />
          {/* desktop step buttons */}
          <div className="mt-4 hidden items-center justify-between gap-3 lg:flex">
            <Button variant="secondary" onClick={prev} disabled={index === 0}>
              <ArrowLeft size={18} aria-hidden="true" className="flip-rtl" />
              {t("runner.previous")}
            </Button>
            <Button variant={isLast ? "primary" : "secondary"} onClick={next} iconEnd={isLast ? Send : ArrowRight}>
              {isLast ? t("runner.finish") : t("runner.next")}
            </Button>
          </div>
        </div>

        {/* desktop rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-[calc(var(--topbar-h)+5.5rem)] space-y-4">
            <section aria-labelledby="map-title" className="surface p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="map-title" className="t-h4">{t("runner.navigator.title")}</h2>
                <span className="t-caption tabular">{t("runner.answeredOf", { answered: summary.answered, total: summary.total })}</span>
              </div>
              <QuestionNavigator t={t} positions={positions} answers={state.answers} current={state.current} onGo={go} className="mt-4 max-h-[40vh] overflow-y-auto p-1" />
              <NavigatorLegend t={t} className="mt-4" />
              <Button block className="mt-5" onClick={() => setConfirmOpen(true)} iconStart={Send}>{t("runner.submit")}</Button>
              {!isLocal && <SaveIndicator t={t} status={saveStatus} className="mt-3 justify-center" />}
            </section>
            <section aria-labelledby="keys-title" className="surface-tint p-4">
              <h2 id="keys-title" className="flex items-center gap-2 text-sm font-medium text-ink">
                <Keyboard size={16} aria-hidden="true" className="text-ink-3" />
                {t("runner.shortcuts.title")}
              </h2>
              <dl className="mt-3 space-y-2 text-[0.8125rem] text-ink-2">
                <Shortcut keys={["1", "2", "3", "4"]} label={t("runner.shortcuts.choose")} />
                <Shortcut keys={isRTL ? ["→", "←"] : ["←", "→"]} label={t("runner.shortcuts.move")} />
                <Shortcut keys={["F"]} label={t("runner.shortcuts.flag")} />
              </dl>
            </section>
          </div>
        </aside>
      </div>

      {/* mobile action bar (covers the tab bar while the exam runs) */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line/12 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden">
        <div className="mx-auto flex h-bottomnav max-w-2xl items-center gap-2 px-[var(--gutter)]">
          <button
            type="button"
            onClick={prev}
            disabled={index === 0}
            aria-label={t("runner.previous")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line/20 bg-surface text-ink-2 disabled:opacity-40"
          >
            <ArrowLeft size={18} aria-hidden="true" className="flip-rtl" />
          </button>
          <button
            type="button"
            onClick={flag}
            aria-pressed={Boolean(state.answers[state.current]?.flagged)}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium",
              state.answers[state.current]?.flagged ? "border-warning/30 bg-warning-soft text-warning" : "border-line/20 bg-surface text-ink-2"
            )}
          >
            <Flag size={16} aria-hidden="true" className={state.answers[state.current]?.flagged ? "fill-current" : ""} />
            <span className="max-[359px]:sr-only">{state.answers[state.current]?.flagged ? t("runner.flagged") : t("runner.flag")}</span>
          </button>
          <Button onClick={next} className="flex-1" iconEnd={isLast ? Send : ArrowRight}>
            {isLast ? t("runner.finish") : t("runner.next")}
          </Button>
        </div>
      </div>

      {/* mobile question map */}
      <Dialog open={navOpen} onClose={() => setNavOpen(false)} variant="sheet" title={t("runner.navigator.title")} description={t("runner.answeredOf", { answered: summary.answered, total: summary.total })}>
        <QuestionNavigator t={t} positions={positions} answers={state.answers} current={state.current} onGo={go} columns={6} className="p-1" />
        <NavigatorLegend t={t} className="mt-4" />
        <Button block className="mt-5" onClick={() => { setNavOpen(false); setConfirmOpen(true); }} iconStart={Send}>
          {t("runner.submit")}
        </Button>
        {!isLocal && <SaveIndicator t={t} status={saveStatus} className="mt-3 justify-center" />}
      </Dialog>

      {/* confirm submit */}
      <Dialog
        open={confirmOpen || (submit.status !== "idle" && !submit.auto)}
        onClose={submitting ? undefined : () => { setConfirmOpen(false); setSubmit({ status: "idle", auto: false, code: null }); }}
        size="sm"
        variant="sheet"
        title={t("runner.confirm.title")}
        description={t("runner.confirm.body")}
        footer={
          <>
            <Button variant="ghost" disabled={submitting} onClick={() => { setConfirmOpen(false); setSubmit({ status: "idle", auto: false, code: null }); }}>
              {t("runner.confirm.keep")}
            </Button>
            <Button onClick={() => doSubmit(false)} loading={submitting} iconStart={submitting ? undefined : submit.status === "error" ? RotateCcw : Send}>
              {submitting ? t("runner.confirm.submitting") : submit.status === "error" ? t("runner.confirm.retry") : t("runner.confirm.submit")}
            </Button>
          </>
        }
      >
        <dl className="grid grid-cols-3 gap-2">
          {[
            ["answered", summary.answered, "text-green-700"],
            ["unanswered", summary.unanswered, summary.unanswered ? "text-danger" : "text-ink"],
            ["flagged", summary.flagged, summary.flagged ? "text-warning" : "text-ink"],
          ].map(([k, v, cls]) => (
            <div key={k} className="flex flex-col-reverse rounded-md bg-surface-2/80 px-3 py-3 text-center">
              <dt className="t-caption mt-0.5">{t(`runner.confirm.${k}`)}</dt>
              <dd className={cn("text-2xl font-bold tabular", cls)}>{formatNumber(v, locale)}</dd>
            </div>
          ))}
        </dl>
        {summary.unanswered > 0 && <p className="t-small mt-4 text-ink-2">{t("runner.confirm.unansweredWarn")}</p>}
        <div className="mt-3 flex flex-col items-start gap-1">
          {summary.firstUnanswered !== null && (
            <Button variant="link" size="sm" onClick={() => { setConfirmOpen(false); go(summary.firstUnanswered); }}>{t("runner.confirm.reviewUnanswered")}</Button>
          )}
          {summary.firstFlagged !== null && (
            <Button variant="link" size="sm" onClick={() => { setConfirmOpen(false); go(summary.firstFlagged); }}>{t("runner.confirm.reviewFlagged")}</Button>
          )}
        </div>
        {submit.status === "error" && (
          <Alert tone="danger" className="mt-4">{submit.code === "network" ? t("errors.network") : t("runner.confirm.failed")}</Alert>
        )}
      </Dialog>

      {/* time's up */}
      <Dialog open={submit.auto && submit.status !== "idle"} size="sm" title={t("runner.timeUp.title")}>
        {submit.status === "error" ? (
          <>
            <p className="t-body text-ink-2">{t("runner.timeUp.failed")}</p>
            <Button className="mt-5" onClick={() => doSubmit(true)} iconStart={RotateCcw}>{t("runner.confirm.retry")}</Button>
          </>
        ) : (
          <p className="t-body flex items-center gap-3 text-ink-2">
            <Spinner size={20} className="text-gold-600" />
            {t("runner.timeUp.body")}
          </p>
        )}
      </Dialog>

      {/* leave guard */}
      <Dialog
        open={Boolean(leaveHref)}
        onClose={stay}
        size="sm"
        variant="sheet"
        title={t("runner.leave.title")}
        footer={
          <>
            <Button variant="ghost" onClick={leave}>{t("runner.leave.leave")}</Button>
            <Button onClick={stay}>{t("runner.leave.stay")}</Button>
          </>
        }
      >
        <p className="t-body text-ink-2">{isLocal ? t("runner.leave.bodyLocal") : t("runner.leave.body")}</p>
      </Dialog>
    </div>
  );
}

function Shortcut({ keys, label }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt>{label}</dt>
      <dd className="flex gap-1" dir="ltr">
        {keys.map((k) => (
          <kbd key={k} className="grid h-6 min-w-6 place-items-center rounded-xs border border-line/20 bg-surface px-1.5 font-sans text-xs text-ink-2">{k}</kbd>
        ))}
      </dd>
    </div>
  );
}

const SAVE = {
  pending: { Icon: null, cls: "text-ink-3" },
  saving: { Icon: null, cls: "text-ink-3" },
  saved: { Icon: Check, cls: "text-green-700" },
  offline: { Icon: CloudOff, cls: "text-warning" },
  error: { Icon: AlertTriangle, cls: "text-danger" },
};

/** Autosave status: compact (header, icon + short word) or full (rail). */
function SaveIndicator({ t, status, compact = false, className }) {
  if (status === "idle") return compact ? null : <p className={cn("t-caption flex items-center gap-1.5", className)}>&nbsp;</p>;
  const { Icon, cls } = SAVE[status] || SAVE.saved;
  const icon = status === "saving" ? <Spinner size={14} /> : status === "pending" ? <span className="h-2 w-2 rounded-full bg-gold-400" /> : <Icon size={15} aria-hidden="true" />;
  // Offline / failing saves must be visible on phones too (icon only there);
  // routine states stay out of the crowded mobile header.
  const attention = status === "offline" || status === "error";
  if (compact) {
    return (
      <span
        className={cn("shrink-0 items-center gap-1.5 text-[0.8125rem] font-medium", attention ? "inline-flex" : "hidden sm:inline-flex", cls, className)}
        title={t(`runner.save.${status}`)}
      >
        {icon}
        <span className={attention ? "sr-only md:not-sr-only" : "hidden md:inline"}>{t(`runner.save.short.${status}`)}</span>
      </span>
    );
  }
  return (
    <p role="status" className={cn("flex items-center gap-1.5 text-[0.8125rem] font-medium", cls, className)}>
      {icon}
      <span>{t(`runner.save.${status}`)}</span>
    </p>
  );
}
