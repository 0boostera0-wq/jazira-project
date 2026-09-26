import { ArrowRight, CalendarClock, ClipboardCheck, Sparkles, TrendingUp } from "lucide-react";
import { getT } from "@/i18n/server";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import { cn } from "@/components/ui/cn";
import { PLATE } from "@/components/stages/parts";

const STEPS = [
  { key: "exam", icon: ClipboardCheck },
  { key: "correct", icon: Sparkles },
  { key: "level", icon: TrendingUp },
];

/**
 * Rail card for /competitions: how XP is actually earned (the server-side
 * award in supabase/migrations/0010 — keep the copy in sync with it) and the
 * honest status of prize seasons. There is no competition backend (no season
 * table, entry rules or prize fulfilment), so nothing here may read as an
 * active draw. When a real season exists, replace the footer with its data.
 */
export default async function ClimbCard({ className }) {
  const t = await getT("achievements");
  // Stacked in the xl rail; from sm to xl it spans the page width, so the art sits beside the text.
  return (
    <section aria-labelledby="climb-title" className={cn("surface overflow-hidden sm:grid sm:grid-cols-5 xl:block", className)}>
      <div className={cn("flex items-center justify-center px-8 pt-4 sm:col-span-2 sm:px-5 sm:pt-0 xl:px-8 xl:pt-4", PLATE)}>
        <Illustration id="brand.island-achievement" className="w-full max-w-[200px] sm:max-w-[240px]" />
      </div>
      <div className="p-5 sm:col-span-3 sm:p-6">
        <h2 id="climb-title" className="t-h4">{t("competitions.climb.title")}</h2>
        <ol className="mt-4 space-y-3.5">
          {STEPS.map(({ key, icon: Icon }) => (
            <li key={key} className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-50 text-gold-600 ring-1 ring-inset ring-gold-200/70">
                <Icon size={15} aria-hidden="true" />
              </span>
              <p className="t-small pt-1 text-ink-2">{t(`competitions.climb.steps.${key}`)}</p>
            </li>
          ))}
        </ol>
        <Button href="/exams" variant="secondary" size="sm" iconEnd={ArrowRight} className="mt-5">
          {t("competitions.climb.cta")}
        </Button>

        <div className="mt-5 border-t border-line/10 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-ink">{t("competitions.season.title")}</h3>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line/15 bg-surface-2 px-2.5 text-[0.8125rem] font-medium text-ink-2">
              <CalendarClock size={14} aria-hidden="true" className="text-ink-3" />
              {t("competitions.season.status")}
            </span>
          </div>
          <p className="t-caption mt-2">{t("competitions.season.body")}</p>
        </div>
      </div>
    </section>
  );
}
