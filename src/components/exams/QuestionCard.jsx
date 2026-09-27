"use client";

import { memo, useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, CircleCheck, CircleDashed, Eraser, Flag, Lock, MinusCircle, XCircle } from "lucide-react";
import { useLocale } from "@/i18n/client";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import ExplainToggle from "./ExplainToggle";
import { difficultyLabel, topicLabel } from "./labels";
import MixedText from "./MixedText";
import {
  contentLang, explanationOf, hasReveal, isChoiceType, isTemplateItem, matchingRows, orderingRows, responseIssue, responseOf, reviewCorrect, reviewResponse, typeOf,
  valueText,
} from "./question-logic";
import { choiceDir } from "./runner-logic";
import { inputFor } from "./questions";

export const VERDICT_STYLE = {
  correct: { tone: "green", Icon: CheckCircle2 },
  incorrect: { tone: "danger", Icon: XCircle },
  partial: { tone: "warning", Icon: MinusCircle },
  unanswered: { tone: "neutral", Icon: CircleDashed },
  voided: { tone: "neutral", Icon: AlertTriangle },
};

/**
 * One question: optional passage · stem · the answer input for its type.
 *
 * Legacy items (the Qudurat/Tahsili bank) render exactly as before: Arabic
 * content (lang="ar" dir="rtl" even inside the English UI), topic and
 * difficulty badges, and the mcq radio group (questions/McqInput).
 * Template items take their content language from the item (§7), show their
 * lesson, and use the input of their type (mcq, true/false, matching,
 * ordering, short answer, numeric). With immediate feedback a "Check" button
 * grades the item on the server, locks it and shows صح / خطأ with «شرح السبب».
 */
function QuestionCard({
  t, question, index, total, answer, onChoose, onClear, onFlag, onRespond,
  feedback = "end", onCheck, checking = false, checkError = null,
}) {
  const selected = answer?.selected ?? null;
  const flagged = Boolean(answer?.flagged);
  const template = isTemplateItem(question);
  const type = typeOf(question);
  const { lang, dir } = contentLang(question);
  const font = lang === "ar" ? "font-ar" : "font-en";
  const locked = Boolean(answer?.locked);
  const check = answer?.check ?? null;
  const response = responseOf(question, answer);
  // a number the server would refuse is flagged by its input; checking it would only fail
  const unreadable = template && !locked && response !== null && responseIssue(question, response) !== null;
  const passage = question.passage ?? question.stimulus?.text ?? null;
  const stemId = `q-${question.position}-stem`;
  const Input = inputFor(type);
  const reveal = locked && check && isChoiceType(type)
    ? { correct: check.correct_response?.option_index ?? null, verdict: check.voided ? "voided" : check.verdict ?? null }
    : null;

  // "Check" unmounts its own button once the item locks: hand focus to the
  // verdict so keyboard and screen-reader users are not dropped on <body>.
  const checkRequested = useRef(false);
  const resultRef = useRef(null);
  const cardRef = useRef(null);
  useEffect(() => {
    if (!locked || !checkRequested.current) return;
    checkRequested.current = false;
    const active = typeof document !== "undefined" ? document.activeElement : null;
    // Focus left on <body>, on the removed button, on an input the lock just
    // disabled, or anywhere else inside this card moves to the verdict; focus
    // the user already took elsewhere (Next, the navigator) stays put.
    const stranded = !active || active === document.body || !active.isConnected || active.disabled || cardRef.current?.contains(active);
    if (stranded) resultRef.current?.focus({ preventScroll: true });
  }, [locked]);
  useEffect(() => {
    checkRequested.current = false;
  }, [question.position]);

  return (
    <article ref={cardRef} aria-labelledby={stemId} className="surface animate-fade p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="t-eyebrow tabular">{t("runner.questionOf", { current: index + 1, total })}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {flagged && <Badge tone="warning" size="sm" icon={Flag}>{t("runner.flagged")}</Badge>}
          {template ? (
            <>
              {locked && <Badge tone="neutral" size="sm" icon={Lock}>{t("runner.check.locked")}</Badge>}
              {question.lesson?.title ? (
                <Badge tone="outline" size="sm" className="max-w-[16rem] truncate"><bdi lang="ar" dir="rtl" className="truncate">{question.lesson.title}</bdi></Badge>
              ) : null}
            </>
          ) : (
            <>
              <Badge tone="outline" size="sm">{topicLabel(t, question.topic)}</Badge>
              {question.difficulty ? <Badge tone="neutral" size="sm">{difficultyLabel(t, question.difficulty)}</Badge> : null}
            </>
          )}
        </div>
      </div>

      {passage && (
        <section aria-label={t("runner.passage")} className="mt-5 rounded-md border border-line/10 bg-surface-2/70">
          <p className="border-b border-line/8 px-4 py-2 text-[0.8125rem] font-medium text-ink-3 sm:px-5">{t("runner.passage")}</p>
          <p lang={lang} dir={dir} className={cn(font, "max-h-[38vh] overflow-y-auto whitespace-pre-line px-4 py-3.5 text-[1.0625rem] leading-[2] text-ink-2 sm:px-5")}><MixedText text={passage} /></p>
        </section>
      )}

      {/* a <p>, not a heading: the English heading styles (tight leading, letter-spacing) must never apply to Arabic content */}
      <p id={stemId} tabIndex={-1} lang={lang} dir={dir} className={cn(font, "mt-5 whitespace-pre-line text-[1.1875rem] font-medium leading-[1.9] text-ink outline-none sm:text-[1.3125rem]")}>
        <MixedText text={question.stem} />
      </p>

      {isChoiceType(type) ? (
        <Input t={t} question={question} selected={selected} onChoose={onChoose} lang={lang} dir={dir} disabled={locked} reveal={reveal} />
      ) : (
        <Input t={t} question={question} response={response} onRespond={onRespond} lang={lang} dir={dir} disabled={locked} />
      )}

      {template && feedback === "immediate" && (
        <div className="mt-5">
          {locked ? (
            <div ref={resultRef} tabIndex={-1} className="outline-none">
              <CheckResult t={t} question={question} response={response} check={check} lang={lang} dir={dir} />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  checkRequested.current = true;
                  onCheck?.();
                }}
                loading={checking} disabled={response === null || unreadable} iconStart={CircleCheck}>
                {t("runner.check.cta")}
              </Button>
              <p className="t-caption">{response === null ? t("runner.check.needAnswer") : t("runner.check.hint")}</p>
            </div>
          )}
          {checkError && !locked && (
            <p role="alert" className="mt-2 text-[0.8125rem] font-medium text-danger">{checkError}</p>
          )}
        </div>
      )}

      <div className="mt-4 flex min-h-9 flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onFlag}
          aria-pressed={flagged}
          className={cn(
            "hidden h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors lg:inline-flex",
            flagged ? "bg-warning-soft text-warning" : "text-ink-3 hover:bg-surface-2 hover:text-ink"
          )}
        >
          <Flag size={15} aria-hidden="true" className={flagged ? "fill-current" : ""} />
          {flagged ? t("runner.flagged") : t("runner.flag")}
        </button>
        {response !== null && !locked && (
          <button type="button" onClick={onClear} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
            <Eraser size={15} aria-hidden="true" />
            {t("runner.clear")}
          </button>
        )}
      </div>
    </article>
  );
}

export default memo(QuestionCard);

/**
 * The inline result of an immediate check: صح / خطأ (or partial), the
 * correct answer for typed items (choices are coloured in place) and
 * «شرح السبب». A database attempt resumed after a check only knows the item
 * is locked; past the key-reveal cap only the verdict is shown.
 */
function CheckResult({ t, question, response, check, lang, dir }) {
  if (check?.voided) {
    // the question changed after it was served: it is not graded (§5.8)
    return <p className="t-small flex items-center gap-2 text-ink-2"><AlertTriangle size={15} aria-hidden="true" />{t("results.review.voided")}</p>;
  }
  if (!check || !check.verdict) {
    return <p className="t-small flex items-center gap-2 text-ink-2"><Lock size={15} aria-hidden="true" />{t("runner.check.lockedBody")}</p>;
  }
  const verdict = VERDICT_STYLE[check.verdict] ? check.verdict : "incorrect";
  const { tone, Icon } = VERDICT_STYLE[verdict];
  const item = { ...question, response, correct_response: check.correct_response ?? null };
  return (
    <div role="status" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone} icon={Icon}>{t(`results.review.verdict.${verdict}`)}</Badge>
        {typeof check.score === "number" && verdict === "partial" ? (
          <span className="t-caption tabular">{t("results.review.partialScore", { percent: Math.round(check.score * 100) })}</span>
        ) : null}
      </div>
      {!isChoiceType(typeOf(question)) && check.correct_response ? <TypedAnswerReview t={t} item={item} lang={lang} dir={dir} /> : null}
      {hasReveal(check) ? (
        <ExplainToggle t={t} explanation={explanationOf(check)} objective={check.objective} lang={lang} dir={dir} defaultOpen={verdict !== "correct"} />
      ) : (
        <p className="t-caption">{t("results.review.keyLimit")}</p>
      )}
    </div>
  );
}

/**
 * Your answer vs the correct answer for matching, ordering, short answer and
 * numeric items (the results review and the immediate check). Choice items
 * are shown as coloured option rows by their callers.
 */
export function TypedAnswerReview({ t, item, lang = "ar", dir = "rtl" }) {
  const type = typeOf(item);
  const font = lang === "ar" ? "font-ar" : "font-en";
  const revealed = reviewCorrect(item) !== null;
  if (type === "matching") {
    return (
      <ul lang={lang} dir={dir} className={cn(font, "space-y-2")}>
        {matchingRows(item).map((r) => (
          <li key={r.index} className={cn("rounded-md border px-3.5 py-2.5 text-[0.9375rem]", r.ok === true ? "border-green-200 bg-green-50" : r.ok === false ? "border-danger/25 bg-danger-soft" : "border-line/10")}>
            <p className="font-medium text-ink"><bdi dir={choiceDir(r.left)}>{r.left}</bdi></p>
            <p className="mt-1 text-ink-2">
              <UiLabel t={t} k="yourAnswer" /> <bdi dir={choiceDir(r.chosen ?? "")}>{r.chosen ?? "—"}</bdi>
            </p>
            {revealed && r.ok === false ? (
              <p className="mt-0.5 text-green-700">
                <UiLabel t={t} k="correctAnswer" /> <bdi dir={choiceDir(r.correct ?? "")}>{r.correct ?? "—"}</bdi>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }
  if (type === "ordering") {
    const rows = orderingRows(item);
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[0.8125rem] font-medium text-ink-3">{t("results.review.yourOrder")}</p>
          <ol lang={lang} dir={dir} className={cn(font, "mt-1.5 space-y-1.5")}>
            {rows.map((r) => (
              <li key={r.position} className={cn("flex gap-2 rounded-md border px-3 py-2 text-[0.9375rem]", r.ok === true ? "border-green-200 bg-green-50" : r.ok === false ? "border-danger/25 bg-danger-soft" : "border-line/10")}>
                <span className="tabular text-ink-3">{r.position + 1}.</span>
                <bdi dir={choiceDir(r.chosen ?? "")} className="min-w-0 flex-1 text-ink">{r.chosen ?? "—"}</bdi>
              </li>
            ))}
          </ol>
        </div>
        {revealed ? (
          <div>
            <p className="text-[0.8125rem] font-medium text-green-700">{t("results.review.correctOrder")}</p>
            <ol lang={lang} dir={dir} className={cn(font, "mt-1.5 space-y-1.5")}>
              {rows.map((r) => (
                <li key={r.position} className="flex gap-2 rounded-md border border-line/10 px-3 py-2 text-[0.9375rem]">
                  <span className="tabular text-ink-3">{r.position + 1}.</span>
                  <bdi dir={choiceDir(r.correct ?? "")} className="min-w-0 flex-1 text-ink">{r.correct ?? "—"}</bdi>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    );
  }
  const mine = valueText(reviewResponse(item));
  const right = valueText(reviewCorrect(item));
  const numeric = type === "numeric";
  return (
    <dl className="space-y-1.5 text-[0.9375rem]">
      <div className="flex flex-wrap gap-x-2">
        <dt className="text-ink-3">{t("results.review.yourAnswer")}</dt>
        <dd lang={numeric ? undefined : lang} dir={numeric ? "ltr" : dir} className={cn(numeric ? "num" : font, "font-medium text-ink")}>{mine ?? "—"}</dd>
      </div>
      {right !== null ? (
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-green-700">{t("results.review.correctAnswer")}</dt>
          <dd lang={numeric ? undefined : lang} dir={numeric ? "ltr" : dir} className={cn(numeric ? "num" : font, "font-medium text-ink")}>{right}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** A UI label inside a content-language block (keeps its own language). */
function UiLabel({ t, k }) {
  const { locale } = useLocale();
  return <span className={cn("text-[0.8125rem] font-medium text-ink-3", locale === "en" && "font-en")} lang={locale}>{t(`results.review.${k}`)}</span>;
}
