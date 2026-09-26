"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, LogIn, RotateCcw } from "lucide-react";
import { usePathname } from "@/i18n/navigation";
import { useT } from "@/i18n/client";
import { useAuthUser } from "@/context/AuthProvider";
import { getAttempt, isLocalAttemptId } from "@/lib/data/exams";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import ExamResults from "./ExamResults";
import ExamRunner from "./ExamRunner";
import { getLocalPointer, readDraft, takeAttempt } from "./handoff";
import { mergeDrafts, toRunnerSession } from "./runner-logic";
import { RunnerSkeleton } from "./skeletons";
import { signInHref } from "./labels";

/**
 * /exams/attempt/[id] — one route for the whole attempt lifecycle:
 *   loading → running (runner) → results, plus honest error states.
 * id "local" resolves to this tab's latest local practice attempt.
 *
 * Instant start: the builder stashes the start payload in memory, so a
 * client-side navigation renders the runner without another request.
 * Resume: getAttempt() returns saved answers + seconds_remaining; unsent
 * answers kept on the device (offline drafts) are merged back and re-sent.
 */
export default function AttemptView({ id }) {
  const t = useT("exams");
  const path = usePathname();
  const { isLoaded, isSignedIn } = useAuthUser();
  // Always start in "loading" so the server HTML and the first client render
  // match (the stash and sessionStorage only exist in the browser).
  const [view, setView] = useState({ phase: "loading" });
  const [nonce, setNonce] = useState(0);

  const withDrafts = useCallback((session) => {
    if (session.mode === "local") return session;
    const { answers, spent, dirty } = mergeDrafts(session.answers, session.spent, readDraft(session.id));
    return { ...session, answers, spent, dirty };
  }, []);

  useEffect(() => {
    if (view.phase !== "loading") return;
    const resolved = id === "local" ? getLocalPointer() : id;
    if (!resolved) {
      setView({ phase: "noLocal" });
      return;
    }
    const stashed = takeAttempt(resolved);
    const fromStash = stashed ? toRunnerSession(stashed) : null;
    if (fromStash) {
      setView({ phase: "running", session: withDrafts(fromStash) });
      return;
    }
    // Saved attempts need the session: wait for auth before asking the database.
    if (!isLocalAttemptId(resolved) && !isLoaded) return;
    let alive = true;
    getAttempt(resolved)
      .then((payload) => {
        if (!alive) return;
        if (payload.status === "in_progress") {
          const session = toRunnerSession(payload);
          setView(session ? { phase: "running", session: withDrafts(session) } : { phase: "failed" });
        } else {
          setView({ phase: "results", result: payload });
        }
      })
      .catch((e) => {
        if (!alive) return;
        const code = e?.code;
        if (code === "attempt_not_found" || code === "invalid_argument") setView({ phase: id === "local" || isLocalAttemptId(resolved) ? "noLocal" : "notFound" });
        else if (code === "not_authenticated" || (!isSignedIn && !isLocalAttemptId(resolved))) setView({ phase: "signIn" });
        else setView({ phase: "failed", code });
      });
    return () => {
      alive = false;
    };
  }, [id, view.phase, isLoaded, isSignedIn, nonce, withDrafts]);

  const onResult = useCallback((result) => setView({ phase: "results", result }), []);
  const reload = useCallback(() => {
    setView({ phase: "loading" });
    setNonce((n) => n + 1);
  }, []);

  if (view.phase === "loading") return <RunnerSkeleton />;
  if (view.phase === "running") return <ExamRunner session={view.session} isSignedIn={isSignedIn} onResult={onResult} onReload={reload} />;
  if (view.phase === "results") return <ExamResults result={view.result} isSignedIn={isSignedIn} path={path} />;

  const states = {
    noLocal: { image: "aptitude.timed", action: <Button href="/exams" iconStart={ClipboardCheck}>{t("runner.states.noLocal.cta")}</Button> },
    notFound: { image: "system.not-found", action: <Button href="/exams" iconStart={ClipboardCheck}>{t("runner.states.notFound.cta")}</Button> },
    signIn: { image: "support.empty", action: <Button href={signInHref(path)} iconStart={LogIn}>{t("runner.states.signIn.cta")}</Button> },
    failed: {
      image: "system.offline",
      action: <Button onClick={reload} iconStart={RotateCcw}>{t("runner.states.failed.retry")}</Button>,
      secondary: <Button href="/exams" variant="secondary">{t("runner.states.failed.hub")}</Button>,
    },
  };
  const s = states[view.phase] || states.failed;
  const key = states[view.phase] ? view.phase : "failed";
  return (
    <section role={key === "failed" ? "alert" : undefined} className="surface-flat animate-fade mx-auto flex max-w-2xl flex-col items-center px-6 py-10 text-center sm:py-14">
      <Illustration id={s.image} className="w-full max-w-[220px]" />
      <h1 className="t-h3 mt-5">{t(`runner.states.${key}.title`)}</h1>
      <p className="t-body mt-2 max-w-md text-ink-3">{t(`runner.states.${key}.body`)}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        {s.action}
        {s.secondary}
      </div>
    </section>
  );
}
