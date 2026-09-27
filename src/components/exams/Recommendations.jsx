"use client";

import { useEffect, useState } from "react";
import { BookOpen, ClipboardCheck, Lightbulb, Target } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/client";
import { formatPercent } from "@/i18n/format";
import { getSupabase } from "@/lib/supabase-lazy";
import { startExam } from "@/lib/data/exams";
import Button from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { handOff } from "./handoff";
import { safeAppPath } from "./question-logic";
import { errorMessage } from "./results-logic";
import { ListCardSkeleton } from "./skeletons";
import { recommendationRows } from "./stats-logic";

const MISSING = new Set(["PGRST202", "PGRST205", "42P01", "42883"]);
const KIND = {
  lesson_quiz: { Icon: ClipboardCheck, tone: "text-gold-600" },
  lesson_review: { Icon: BookOpen, tone: "text-info" },
  weakness_review: { Icon: Target, tone: "text-danger" },
};

/**
 * get_practice_recommendations(p_limit) for the signed-in member, or
 * { status: "unavailable" } when the database (or 0014) is not there.
 */
async function loadRecommendations(limit) {
  const supabase = await getSupabase().catch(() => null);
  if (!supabase) return { status: "unavailable", rows: [] };
  const { data, error } = await supabase.rpc("get_practice_recommendations", { p_limit: limit });
  if (error) {
    if (MISSING.has(error.code) || /could not find the function|schema cache/i.test(error.message || "")) return { status: "unavailable", rows: [] };
    throw error;
  }
  return { status: "ready", rows: recommendationRows(data) };
}

/**
 * "What to practise next" (§7 history): a lesson quiz for a lesson not yet
 * practised, a lesson to review, or a weakness review of the weakest lesson
 * (started right here). Honest states: loading skeleton, nothing yet, not
 * available (no database), failed with retry. Signed-in members only.
 */
export default function Recommendations({ limit = 5, className }) {
  const t = useT("exams");
  const tc = useT("common");
  const { locale } = useLocale();
  const router = useRouter();
  const [state, setState] = useState({ status: "loading", rows: [] });
  const [nonce, setNonce] = useState(0);
  const [starting, setStarting] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    loadRecommendations(limit)
      .then((r) => alive && setState(r))
      .catch(() => alive && setState({ status: "error", rows: [] }));
    return () => {
      alive = false;
    };
  }, [limit, nonce]);

  async function review(node) {
    if (starting) return;
    setStarting(node);
    setError(null);
    try {
      const payload = await startExam({ template: "weakness-review", scope: `weak:${node}` });
      router.push(handOff(payload));
    } catch (e) {
      setStarting(null);
      setError(errorMessage(t, e?.code || "unknown", e?.details, tc));
    }
  }

  if (state.status === "loading") return <ListCardSkeleton rows={3} />;
  if (state.status === "unavailable") return null;

  return (
    <section aria-labelledby="recs-title" className={cn("surface p-5 sm:p-6", className)}>
      <h2 id="recs-title" className="t-h4 flex items-center gap-2">
        <Lightbulb size={17} aria-hidden="true" className="text-gold-600" />
        {t("history.recommendations.title")}
      </h2>
      {state.status === "error" ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="t-small text-ink-3">{t("history.recommendations.failed")}</p>
          <Button size="sm" variant="secondary" onClick={() => { setState({ status: "loading", rows: [] }); setNonce((n) => n + 1); }}>
            {t("history.unavailable.retry")}
          </Button>
        </div>
      ) : state.rows.length === 0 ? (
        <p className="t-small mt-3 text-ink-3">{t("history.recommendations.empty")}</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {state.rows.map((r) => {
            const { Icon, tone } = KIND[r.kind];
            const acc = r.reason?.accuracy;
            const answered = Number(r.reason?.answered) || 0;
            return (
              <li key={`${r.kind}-${r.node}`} className="flex items-center gap-3 rounded-md bg-surface-2/70 px-3 py-2.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-surface">
                  <Icon size={18} aria-hidden="true" className={tone} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink"><bdi lang="ar" dir="rtl">{r.title || r.node}</bdi></p>
                  <p className="t-caption truncate">
                    {t(`history.recommendations.kinds.${r.kind}`)}
                    {" · "}
                    {answered > 0 && acc !== null && acc !== undefined
                      ? t("history.recommendations.reason", { accuracy: formatPercent(Number(acc), locale), answered })
                      : t("history.recommendations.new")}
                  </p>
                </div>
                {r.kind === "weakness_review" ? (
                  <Button size="sm" variant="secondary" className="shrink-0" loading={starting === r.node} disabled={Boolean(starting)} onClick={() => review(r.node)}>
                    {t("history.recommendations.start")}
                  </Button>
                ) : safeAppPath(r.href) ? (
                  <Button size="sm" variant="secondary" className="shrink-0" href={safeAppPath(r.href)}>
                    {t("history.recommendations.open")}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 text-[0.8125rem] text-danger">{error}</p>}
    </section>
  );
}
