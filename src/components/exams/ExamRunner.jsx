"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpenCheck, Check, CloudOff, Flag, Hourglass, Info, Keyboard, LayoutGrid, RotateCcw, Send } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { formatNumber } from "@/i18n/format";
import { saveAnswer, submitExam } from "@/lib/data/exams";
import { checkItem } from "@/lib/data/exam-sessions";
import { localizeHref } from "@/i18n/config";
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
import { examIcon, sectionLabel, topicLabel } from "./labels";
import { BEFORE_NAVIGATE_EVENT, RUNNER_FLAG } from "./leaveGuard";
import QuestionCard from "./QuestionCard";
import QuestionNavigator, { NavigatorLegend } from "./QuestionNavigator";
import RunnerTimer from "./RunnerTimer";
import { answersPayload, keyAction, runnerReducer, summarize } from "./runner-logic";
import { choicesOf, emptyResponse, isChoiceType, responseOf, typeOf } from "./question-logic";
import { preloadInputs } from "./questions";
import { errorMessage, sessionLessonTitle, templateName } from "./results-logic";

const MAX_SPENT = 14400;

/**
 * Browser Back past the runner: history.back() until the URL changes — it
 * skips our same-URL sentinel entries (a runner that mounted twice on one entry
 * may have left two). With nothing to go back to, fall back to the exam hub.
 */
function backToPreviousPage(fallbackHref) {
  const here = window.location.pathname + window.location.search;
  let steps = 0;
  const done = () => window.removeEventListener("popstate", onPop);
  function onPop() {
    if (window.location.pathname + window.location.search !== here) return done();
    if (steps++ < 4) window.history.back();
    else done();
  }
  window.addEventListener("popstate", onPop);
  setTimeout(() => {
    done();
    if (window.location.pathname + window.location.search === here) window.location.assign(fallbackHref);
  }, 2500);
  window.history.back();
}

/** Does the offline draft of a question hold exactly what was just saved? */
const sameAnswer = (draft, saved) =>
  Boolean(draft && saved) &&
  (draft.selected ?? null) === (saved.selected ?? null) &&
  JSON.stringify(draft.response ?? null) === JSON.stringify(saved.response ?? null) &&
  Boolean(draft.flagged) === Boolean(saved.flagged);

/** Errors a save can end with that retrying never fixes (the autosave queue drops "invalid_argument"). */
function settleSaveError(e) {
  if (e?.code === "item_locked") return null; // checked in the meantime: the checked answer is final
  if (e?.code === "invalid_response") {
    const x = new Error("invalid_argument");
    x.code = "invalid_argument";
    x.details = e.details ?? null;
    throw x;
  }
  throw e;
}

/**
 * The exam runner. Renders immediately from a normalised session
 * (runner-logic.toRunnerSession), tracks answers / flags / per-question time,
 * autosaves (debounced, retried, offline-tolerant, mirrored to a local draft),
 * guards against leaving (links, browser Back, code-driven navigation via
 * leaveGuard.confirmNavigation, reload/close), and submits — manually or at 0:00.
 *
 * props: session, isSignedIn, onResult(result), onReload() (attempt closed elsewhere)
 */
export default function ExamRunner({ session, isSignedIn, onResult, onReload }) {
  const t = useT("exams");
  const tc = useT("common");
  const { locale, isRTL } = useLocale();
  const isLocal = session.mode === "local";
  // guest template sessions keep their answers in this browser (exam-sessions.js) — nothing to draft or sync
  const ephemeral = session.mode !== "db";
  const isTemplate = Boolean(session.template);

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
  // Is the current history entry our same-URL Back sentinel? Tracked here, not
  // only in history.state: Next's router rewrites the entry's state on later
  // router updates, which drops custom keys.
  const onSentinelRef = useRef(false);

  const [saveStatus, setSaveStatus] = useState("idle");
  const [navOpen, setNavOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submit, setSubmit] = useState({ status: "idle", auto: false, code: null });
  // What the member asked to do while the exam runs:
  //   { kind: "link", href, link } | { kind: "back" } | { kind: "nav", proceed }
  const [leaveTarget, setLeaveTarget] = useState(null);
  // immediate feedback: the position being checked and the last error per position
  const [checking, setChecking] = useState(null);
  const [checkErrors, setCheckErrors] = useState({});

  const summary = summarize(state.answers, positions, isTemplate ? byPos : null);
  // "Guests can take up to N": a template session names its tier cap (max_questions) —
  // it can also be short because the pool is small, which is not the guest cap.
  const guestCap = isTemplate ? session.maxQuestions : summary.total;
  const index = positions.indexOf(state.current);
  const question = byPos[state.current];
  const isLast = index === positions.length - 1;

  // ── autosave (created in an effect so StrictMode remounts get a live queue) ──
  useEffect(() => {
    const q = createAutosave({
      save: (pos, p) => {
        if (!isTemplate) return saveAnswer(session.id, pos, p.selected, { timeSpentSeconds: p.spent, flagged: p.flagged });
        // template sessions save display responses; a cleared answer is an explicit empty response in the database
        const q = byPos[pos];
        const value = responseOf(q, p) ?? (session.mode === "db" ? emptyResponse(typeOf(q)) : null);
        return saveAnswer(session.id, pos, value, { timeSpentSeconds: p.spent, flagged: p.flagged }).catch(settleSaveError);
      },
      getPayload: (pos) => {
        const a = stateRef.current.answers[pos];
        return {
          selected: a?.selected ?? null,
          ...(a && "response" in a ? { response: a.response ?? null } : {}),
          flagged: Boolean(a?.flagged),
          spent: Math.min(MAX_SPENT, Math.round(spentRef.current[pos] || 0)),
        };
      },
      delay: ephemeral ? 120 : 700,
      onStatus: setSaveStatus,
      onSaved: (pos, saved) => {
        // Forget the device copy only when it holds exactly what the server now
        // has: a newer change made while this save was in flight stays in the
        // draft (and in the queue) until it is sent.
        if (ephemeral || !sameAnswer(draftRef.current[pos], saved)) return;
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
      // Leaving the runner (Leave, language switch, any navigation): send EVERY
      // pending answer now, in parallel — not just the first one. Unsent ones
      // also stay in the offline draft (DB mode) for the next visit.
      q.drain();
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
      if (!ephemeral) {
        draftRef.current[action.position] = { ...next.answers[action.position], spent: Math.round(spentRef.current[action.position] || 0) };
        writeDraft(session.id, draftRef.current);
      }
      autosaveRef.current?.queue(action.position);
    },
    [ephemeral, session.id]
  );

  // ── immediate feedback: save the latest answer, grade it on the server, lock it ──
  const checkCurrent = useCallback(
    async (position) => {
      if (checking !== null) return;
      const q = byPos[position];
      const a = stateRef.current.answers[position];
      const response = responseOf(q, a);
      if (!q || !response || a?.locked) return;
      setChecking(position);
      setCheckErrors((e) => ({ ...e, [position]: null }));
      try {
        await saveAnswer(session.id, position, response, {
          timeSpentSeconds: Math.min(MAX_SPENT, Math.round(spentRef.current[position] || 0)),
          flagged: Boolean(a.flagged),
        }).catch(settleSaveError);
        const result = await checkItem(session.id, position);
        change({ type: "lock", position, check: result });
      } catch (e) {
        const code = e?.code || "unknown";
        if (code === "item_locked") change({ type: "lock", position, check: null });
        else if (code === "attempt_closed") onReload?.();
        else if (code === "invalid_response" || code === "invalid_argument") {
          const reason = e.details?.reason;
          setCheckErrors((x) => ({ ...x, [position]: reason && t.has(`runner.numeric.issues.${reason}`) ? t(`runner.numeric.issues.${reason}`) : t("runner.check.invalid") }));
        } else setCheckErrors((x) => ({ ...x, [position]: errorMessage(t, code, e?.details, tc) }));
      } finally {
        setChecking(null);
      }
    },
    [checking, byPos, session.id, change, onReload, t, tc]
  );

  // matching / ordering inputs are a separate chunk: fetch the ones this session uses right away
  useEffect(() => {
    preloadInputs(session.questions.map((q) => q.type).filter(Boolean));
  }, [session.questions]);

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
        const result = await submitExam(session.id, answersPayload(positions, stateRef.current.answers, spentRef.current, isTemplate ? byPos : null));
        autosaveRef.current?.cancel();
        clearDraft(session.id);
        // Drop the Back sentinel (same URL) so Back from the results leaves the page at once.
        if (onSentinelRef.current) {
          onSentinelRef.current = false;
          window.history.back();
        }
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
    [session.id, positions, onResult, onReload, isTemplate, byPos]
  );

  const onExpire = useCallback(() => {
    setConfirmOpen(false);
    setNavOpen(false);
    setLeaveTarget(null);
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
      // The answer choices are radios: their shortcuts (1–4, F) still apply,
      // but the arrow keys belong to the radio group (move between options).
      const onChoice = e.target?.type === "radio";
      if (!onChoice && e.target?.closest?.("input, textarea, select, [contenteditable='true'], dialog")) return;
      if (document.querySelector("dialog[open]")) return;
      const q = byPos[stateRef.current.current];
      // digits choose options of choice items only (typed answers have no 1–6)
      const a = keyAction(e, { rtl: isRTL, choices: q ? (isChoiceType(typeOf(q)) ? choicesOf(q).length : 0) : 4 });
      if (!a) return;
      if (onChoice && (a.type === "next" || a.type === "prev")) return;
      e.preventDefault();
      if (a.type === "choose") change({ type: "select", position: stateRef.current.current, index: a.index });
      else if (a.type === "flag") change({ type: "flag", position: stateRef.current.current });
      else if (a.type === "next") dispatch({ type: "next" });
      else if (a.type === "prev") dispatch({ type: "prev" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [byPos, isRTL, change]);

  // ── while the runner is mounted: flag for the shell (the mobile tab bar
  // sits under the runner's action bar and must leave the tab order) ──
  useEffect(() => {
    const root = document.documentElement;
    root.dataset[RUNNER_FLAG] = "running";
    return () => {
      delete root.dataset[RUNNER_FLAG];
    };
  }, []);

  // ── leave guard: browser / Android Back ──
  // A same-URL sentinel entry turns the first Back into the "leave?" question
  // (Next's router restores the same page for it, so nothing re-renders).
  const pushSentinel = useCallback(() => {
    window.history.pushState({ jzExamGuard: session.id }, "");
    onSentinelRef.current = true;
  }, [session.id]);
  useEffect(() => {
    // Once per runner (StrictMode re-runs effects with the same refs); none
    // when we arrived on an existing sentinel (Back then Forward).
    if (window.history.state?.jzExamGuard === session.id) onSentinelRef.current = true;
    else if (!onSentinelRef.current) pushSentinel();
    const onPop = (e) => {
      if (e.state?.jzExamGuard === session.id) {
        onSentinelRef.current = true; // moved forward onto the sentinel
        return;
      }
      onSentinelRef.current = false;
      if (submittingRef.current || leavingRef.current) return;
      setLeaveTarget({ kind: "back" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [session.id, pushSentinel]);

  // ── leave guard: code-driven navigation (language switch, command palette) ──
  useEffect(() => {
    const onNavigate = (e) => {
      if (submittingRef.current || leavingRef.current || typeof e.detail?.proceed !== "function") return;
      e.preventDefault();
      setLeaveTarget({ kind: "nav", proceed: e.detail.proceed });
    };
    window.addEventListener(BEFORE_NAVIGATE_EVENT, onNavigate);
    return () => window.removeEventListener(BEFORE_NAVIGATE_EVENT, onNavigate);
  }, []);

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
      setLeaveTarget({ kind: "link", href: url.pathname + url.search + url.hash, link: a });
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("click", onClick, true);
    };
  }, []);

  const leave = () => {
    const target = leaveTarget;
    leavingRef.current = true;
    autosaveRef.current?.drain(); // every pending answer, not just the first
    setLeaveTarget(null);
    // Continue once the modal has closed. A link replays the original click, so
    // the app's own <Link> navigates client-side (no full reload); its captured
    // href is already localized and only the fallback for a link that has left
    // the DOM in the meantime.
    requestAnimationFrame(() => {
      if (target?.kind === "back") backToPreviousPage(localizeHref("/exams", locale));
      else if (target?.kind === "nav") target.proceed();
      else if (target?.link?.isConnected) target.link.click();
      else if (target?.href) window.location.assign(target.href);
    });
  };
  const stay = () => {
    // Back already left the sentinel entry: put it back for the next Back.
    if (leaveTarget?.kind === "back") pushSentinel();
    setLeaveTarget(null);
  };

  const Icon = isTemplate ? BookOpenCheck : examIcon(session.exam);
  const title = isTemplate
    ? templateName(t, session.template.id, session.mini)
    : [t(`types.${session.exam}`), sectionLabel(t, session.exam, session.section), session.topic ? topicLabel(t, session.topic) : null]
      .filter(Boolean)
      .join(" · ");
  // the lesson (or the one lesson every question belongs to) names the scope of a template session
  const scopeTitle = isTemplate ? sessionLessonTitle(session.questions) : null;
  const progress = (summary.answered / summary.total) * 100;
  const submitting = submit.status === "submitting";

  return (
    <div className="pb-4">
      {/* ── sticky exam header ── */}
      <div className="sticky top-[var(--topbar-h)] z-20 -mx-[var(--gutter)] -mt-6 border-b border-line/10 bg-canvas/95 px-[var(--gutter)] backdrop-blur-sm sm:-mt-8">
        <div className="flex h-16 items-center gap-3">
          <IconTile icon={Icon} tone="gold" size="sm" className="hidden xs:inline-grid" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[0.9375rem] font-bold text-ink">
              {title}
              {scopeTitle ? <span className="font-normal text-ink-2"> · <bdi lang="ar" dir="rtl">{scopeTitle}</bdi></span> : null}
            </h1>
            <p className="t-caption truncate tabular" aria-live="off">
              {t("runner.questionOf", { current: index + 1, total: summary.total })}
              <span className="hidden sm:inline"> · {t("runner.answeredOf", { answered: summary.answered, total: summary.total })}</span>
              <span> · {t("runner.unansweredCount", { count: summary.unanswered })}</span>
              {summary.flagged > 0 && <span className="hidden sm:inline"> · {t("runner.flaggedCount", { count: summary.flagged })}</span>}
            </p>
          </div>
          {ephemeral && <Badge tone="info" size="sm" icon={Info} className="hidden md:inline-flex">{t("runner.practice.badge")}</Badge>}
          {!ephemeral && <SaveIndicator t={t} status={saveStatus} compact />}
          {session.timed ? (
            <RunnerTimer deadline={session.deadline} limit={session.timeLimitSeconds} onExpire={onExpire} />
          ) : (
            <Badge tone="neutral" icon={Hourglass} className="shrink-0"><span className="sr-only sm:not-sr-only">{t("runner.untimed")}</span></Badge>
          )}
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

      {ephemeral && (
        <Alert tone="info" className="mt-5">
          {t("runner.practice.body")}
          {!isSignedIn && session.limited && session.requested && guestCap && guestCap < session.requested
            ? ` ${t("runner.practice.limited", { requested: tc("units.questions", { count: session.requested }), questions: tc("units.questions", { count: guestCap }) })}`
            : ""}
        </Alert>
      )}
      {isTemplate && (session.mini || session.reused || session.short) && (
        <Alert tone={session.short ? "warning" : "info"} className="mt-3">
          {[
            session.mini ? t("runner.notices.mini") : null,
            session.reused ? t("runner.notices.reused") : null,
            session.short ? t("runner.notices.short", { questions: tc("units.questions", { count: summary.total }) }) : null,
          ].filter(Boolean).join(" ")}
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
            onRespond={(response) => change({ type: "respond", position: state.current, response })}
            onFlag={flag}
            feedback={session.feedbackMode}
            onCheck={() => checkCurrent(state.current)}
            checking={checking === state.current}
            checkError={checkErrors[state.current] ?? null}
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
              {!ephemeral && <SaveIndicator t={t} status={saveStatus} className="mt-3 justify-center" />}
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
        {!ephemeral && <SaveIndicator t={t} status={saveStatus} className="mt-3 justify-center" />}
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
        {summary.invalid > 0 && (
          <p role="status" className="t-small mt-3 flex items-start gap-1.5 font-medium text-warning">
            <AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
            {t("runner.confirm.invalidWarn", { count: summary.invalid })}
          </p>
        )}
        <div className="mt-3 flex flex-col items-start gap-1">
          {summary.firstInvalid !== null && (
            <Button variant="link" size="sm" onClick={() => { setConfirmOpen(false); go(summary.firstInvalid); }}>{t("runner.confirm.reviewInvalid")}</Button>
          )}
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
        open={Boolean(leaveTarget)}
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
        <p className="t-body text-ink-2">{isLocal ? t("runner.leave.bodyLocal") : session.mode === "guest" ? t("runner.leave.bodyGuest") : t("runner.leave.body")}</p>
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
