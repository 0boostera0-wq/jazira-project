"use client";

import { useState } from "react";
import { BookOpen, CheckCircle2, CircleDashed, ExternalLink, Flag, Lightbulb, XCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useLocale } from "@/i18n/client";
import { formatClock } from "@/i18n/format";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Tabs from "@/components/ui/Tabs";
import { cn } from "@/components/ui/cn";
import { choiceLabel, topicLabel } from "./labels";
import MixedText from "./MixedText";
import { REVIEW_FILTERS, filterReview, itemStatus, reviewCounts } from "./results-logic";
import { choiceDir, twoColumnChoices } from "./runner-logic";
import ExplainToggle from "./ExplainToggle";
import { TypedAnswerReview, VERDICT_STYLE } from "./QuestionCard";
import { contentLang, explanationOf, isChoiceType, isTemplateItem, optionRows, pagesLabel, safeAppPath, safeHttps, typeOf } from "./question-logic";

const STATUS = {
  correct: { tone: "green", Icon: CheckCircle2 },
  incorrect: { tone: "danger", Icon: XCircle },
  unanswered: { tone: "neutral", Icon: CircleDashed },
};

/**
 * Answer review with filters (all / incorrect / unanswered / flagged). Each
 * item shows the chosen vs the correct answer and the explanation. Long lists
 * stay cheap with content-visibility (off-screen items skip layout/paint).
 * Template items (every question type) get TemplateReviewItem: صح / خطأ /
 * partial, «شرح السبب» with the steps and objective, the related lesson and
 * the book reference (link-out).
 */
export default function ReviewList({ t, items }) {
  const [filter, setFilter] = useState("all");
  const counts = reviewCounts(items);
  const list = filterReview(items, filter);
  return (
    <section aria-labelledby="review-title">
      <div>
        <h2 id="review-title" className="t-h3">{t("results.review.title")}</h2>
        <p className="t-small mt-1 text-ink-3">{t("results.review.lead")}</p>
        <Tabs
          className="mt-4 w-fit"
          label={t("results.review.filtersLabel")}
          value={filter}
          onChange={setFilter}
          size="sm"
          items={REVIEW_FILTERS.map((f) => ({ value: f, label: t(`results.review.filters.${f}`), count: counts[f] }))}
        />
      </div>
      {list.length === 0 ? (
        <div className="surface-flat mt-5">
          <EmptyState compact image="achievement.review" title={t(`results.review.empty.${filter}`)} />
        </div>
      ) : (
        <ol className="mt-5 space-y-4">
          {list.map((it) => (isTemplateItem(it) ? <TemplateReviewItem key={it.position} t={t} item={it} /> : <ReviewItem key={it.position} t={t} item={it} />))}
        </ol>
      )}
    </section>
  );
}

function ReviewItem({ t, item }) {
  const { locale } = useLocale();
  const status = itemStatus(item);
  const { tone, Icon } = STATUS[status];
  const two = twoColumnChoices(item.choices);
  return (
    <li className="surface-flat p-5 sm:p-6" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 380px" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-ink tabular">{t("results.review.question", { n: item.position })}</span>
        <Badge tone={tone} size="sm" icon={Icon}>{t(`results.review.status.${status}`)}</Badge>
        <Badge tone="outline" size="sm">{topicLabel(t, item.topic)}</Badge>
        {item.flagged && <Badge tone="warning" size="sm" icon={Flag}>{t("results.review.flagged")}</Badge>}
        {item.time_spent_seconds > 0 && (
          <span className="t-caption ms-auto">{t("results.review.spent", { time: formatClock(item.time_spent_seconds) })}</span>
        )}
      </div>

      {item.passage && (
        <details className="group mt-4 rounded-md border border-line/10 bg-surface-2/60">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium text-gold-700 marker:hidden">{t("results.review.showPassage")}</summary>
          <p lang="ar" dir="rtl" className="font-ar whitespace-pre-line border-t border-line/8 px-4 py-3 text-[0.9375rem] leading-[2] text-ink-2"><MixedText text={item.passage} /></p>
        </details>
      )}

      <p lang="ar" dir="rtl" className="font-ar mt-3.5 whitespace-pre-line text-[1.0625rem] font-medium leading-[1.9] text-ink"><MixedText text={item.stem} /></p>

      <ul lang="ar" dir="rtl" className={cn("font-ar mt-4 grid gap-2", two && "sm:grid-cols-2")}>
        {item.choices.map((c, i) => {
          const isCorrect = i === item.correct_index;
          const isChosen = i === item.selected_index;
          const state = isCorrect ? "correct" : isChosen ? "wrong" : "idle";
          return (
            <li
              key={i}
              className={cn(
                "flex items-center gap-3 rounded-md border px-3 py-2.5",
                state === "correct" && "border-green-200 bg-green-50",
                state === "wrong" && "border-danger/30 bg-danger-soft",
                state === "idle" && "border-line/10"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[0.8125rem] font-bold",
                  state === "correct" && "bg-green-500 text-surface",
                  state === "wrong" && "bg-danger text-surface",
                  state === "idle" && "bg-surface-2 text-ink-3"
                )}
              >
                {choiceLabel(t, i)}
              </span>
              <span className={cn("min-w-0 flex-1 text-[0.9375rem] leading-relaxed", state === "idle" ? "text-ink-3" : "text-ink")}><bdi dir={choiceDir(c)}>{c}</bdi></span>
              {(isCorrect || isChosen) && (
                <span lang={locale} className={cn("shrink-0 text-xs font-medium", locale === "en" && "font-en", isCorrect ? "text-green-700" : "text-danger")}>
                  {isChosen && isCorrect ? t("results.review.yourAnswer") : isCorrect ? t("results.review.correctAnswer") : t("results.review.yourAnswer")}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {status === "unanswered" && <p className="t-caption mt-2">{t("results.review.noAnswer")}</p>}

      {item.explanation && (
        <div className="mt-4 rounded-md bg-surface-2/80 p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <Lightbulb size={15} aria-hidden="true" className="text-gold-600" />
            {t("results.review.explanation")}
          </p>
          <p lang="ar" dir="rtl" className="font-ar mt-1.5 whitespace-pre-line text-[0.9375rem] leading-[1.9] text-ink-2"><MixedText text={item.explanation} /></p>
        </div>
      )}
    </li>
  );
}

/**
 * One template item in the review (§7): the verdict badge (صح / خطأ /
 * partial / unanswered, or "question updated" for a voided item), the stem,
 * the learner's vs the correct answer for its type, «شرح السبب» (explanation,
 * steps, objective), the related lesson and the book reference as a link-out.
 */
function TemplateReviewItem({ t, item }) {
  const status = itemStatus(item);
  const { tone, Icon } = VERDICT_STYLE[status] || VERDICT_STYLE.unanswered;
  const { lang, dir } = contentLang(item);
  const font = lang === "ar" ? "font-ar" : "font-en";
  const type = typeOf(item);
  const explanation = explanationOf(item);
  const source = item.source || null;
  const sourceUrl = safeHttps(source?.url);
  const pages = pagesLabel(source);
  const lessonLink = safeAppPath(item.lesson?.href);
  const { locale } = useLocale();
  return (
    <li className="surface-flat p-5 sm:p-6" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 420px" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-ink tabular">{t("results.review.question", { n: item.position })}</span>
        <Badge tone={tone} size="sm" icon={Icon}>{t(`results.review.verdict.${status}`)}</Badge>
        {status === "partial" && typeof item.score === "number" ? (
          <span className="t-caption tabular">{t("results.review.partialScore", { percent: Math.round(item.score * 100) })}</span>
        ) : null}
        {item.flagged && <Badge tone="warning" size="sm" icon={Flag}>{t("results.review.flagged")}</Badge>}
        {item.time_spent_seconds > 0 && (
          <span className="t-caption ms-auto">{t("results.review.spent", { time: formatClock(item.time_spent_seconds) })}</span>
        )}
      </div>

      {status === "voided" && <p className="t-small mt-3 rounded-md bg-surface-2/80 px-3.5 py-2.5 text-ink-2">{t("results.review.voided")}</p>}

      {item.stimulus?.text && (
        <details className="group mt-4 rounded-md border border-line/10 bg-surface-2/60">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium text-gold-700 marker:hidden">{t("results.review.showPassage")}</summary>
          <p lang={lang} dir={dir} className={cn(font, "whitespace-pre-line border-t border-line/8 px-4 py-3 text-[0.9375rem] leading-[2] text-ink-2")}><MixedText text={item.stimulus.text} /></p>
        </details>
      )}

      <p lang={lang} dir={dir} className={cn(font, "mt-3.5 whitespace-pre-line text-[1.0625rem] font-medium leading-[1.9] text-ink")}><MixedText text={item.stem} /></p>

      {isChoiceType(type) ? (
        <ul lang={lang} dir={dir} className={cn(font, "mt-4 grid gap-2", type === "true_false" ? "grid-cols-2" : twoColumnChoices(item.choices) && "sm:grid-cols-2")}>
          {optionRows(item).map((o) => {
            // past the key-reveal cap (no correct option) the chosen one carries the verdict; voided stays neutral
            const state = o.state;
            return (
              <li
                key={o.index}
                className={cn(
                  "flex items-center gap-3 rounded-md border px-3 py-2.5",
                  state === "correct" && "border-green-200 bg-green-50",
                  state === "wrong" && "border-danger/30 bg-danger-soft",
                  state === "chosen" && "border-line/25 bg-surface-2/70",
                  state === "idle" && "border-line/10"
                )}
              >
                {type === "mcq" && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[0.8125rem] font-bold",
                      state === "correct" && "bg-green-500 text-surface",
                      state === "wrong" && "bg-danger text-surface",
                      state === "chosen" && "bg-ink-3 text-surface",
                      state === "idle" && "bg-surface-2 text-ink-3"
                    )}
                  >
                    {choiceLabel(t, o.index)}
                  </span>
                )}
                <span className={cn("min-w-0 flex-1 text-[0.9375rem] leading-relaxed", state === "idle" ? "text-ink-3" : "text-ink")}><bdi dir={choiceDir(o.text)}>{o.text}</bdi></span>
                {(o.correct || o.chosen) && (
                  <span lang={locale} className={cn("shrink-0 text-xs font-medium", locale === "en" && "font-en", state === "correct" ? "text-green-700" : state === "wrong" ? "text-danger" : "text-ink-3")}>
                    {o.chosen ? t("results.review.yourAnswer") : t("results.review.correctAnswer")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-4"><TypedAnswerReview t={t} item={item} lang={lang} dir={dir} /></div>
      )}
      {status === "unanswered" && <p className="t-caption mt-2">{t("results.review.noAnswer")}</p>}

      {status !== "voided" && (explanation || item.objective?.text) ? (
        <ExplainToggle t={t} explanation={explanation} objective={item.objective} lang={lang} dir={dir} defaultOpen={status !== "correct"} className="mt-4" />
      ) : status !== "voided" && !item.correct_response ? (
        <p className="t-caption mt-3">{t("results.review.keyLimit")}</p>
      ) : null}

      {(lessonLink || sourceUrl || source?.title) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line/10 pt-3.5 text-[0.8125rem]">
          {lessonLink ? (
            <Link href={lessonLink} className="inline-flex items-center gap-1.5 font-medium text-gold-700 hover:underline">
              <BookOpen size={14} aria-hidden="true" />
              {t("results.review.lesson")} <bdi lang="ar" dir="rtl">{item.lesson.title || ""}</bdi>
            </Link>
          ) : null}
          {source?.title ? (
            sourceUrl ? (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-ink-2 hover:text-ink hover:underline">
                <ExternalLink size={14} aria-hidden="true" />
                <span>
                  {t("results.review.source")} <bdi lang="ar" dir="rtl">{source.title}</bdi>
                  {pages ? ` · ${t("results.review.pages", { pages })}` : ""}
                </span>
                <span className="sr-only">{t("results.review.opensNewTab")}</span>
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-ink-2">
                {t("results.review.source")} <bdi lang="ar" dir="rtl">{source.title}</bdi>
                {pages ? ` · ${t("results.review.pages", { pages })}` : ""}
              </span>
            )
          ) : null}
        </div>
      )}
    </li>
  );
}
