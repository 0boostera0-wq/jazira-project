"use client";

import { useState } from "react";
import { CheckCircle2, CircleDashed, Flag, Lightbulb, XCircle } from "lucide-react";
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

const STATUS = {
  correct: { tone: "green", Icon: CheckCircle2 },
  incorrect: { tone: "danger", Icon: XCircle },
  unanswered: { tone: "neutral", Icon: CircleDashed },
};

/**
 * Answer review with filters (all / incorrect / unanswered / flagged). Each
 * item shows the chosen vs the correct answer and the explanation. Long lists
 * stay cheap with content-visibility (off-screen items skip layout/paint).
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
          {list.map((it) => <ReviewItem key={it.position} t={t} item={it} />)}
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
