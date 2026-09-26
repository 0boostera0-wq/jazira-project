import { ArrowRight, BadgeCheck, CalendarClock, Check, Crown, LockKeyhole } from "lucide-react";
import { getLocale, getT } from "@/i18n/server";
import { intlLocale } from "@/i18n/config";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Container, Section } from "@/components/ui/Layout";
import { cn } from "@/components/ui/cn";
import { AI_FREE_LIMIT, AI_WINDOW_MS, ELITE } from "@/lib/constants";
import { LIMITS, PRESETS } from "@/lib/exams/catalog";
import { ArrowLink, Intro, Point } from "./parts";

// Every number below is interpolated from the code that enforces it
// (ELITE / AI_* in lib/constants, LIMITS / PRESETS in lib/exams/catalog) —
// the same sources the /subscriptions page reads, so the two can't disagree.
const FREE_PERKS = ["curriculum", "practice", "assistant", "community", "progress"];
const ELITE_PERKS = ["questions", "daily", "simulation", "assistant", "analytics", "badge"];
const FACTS = [
  ["renewal", CalendarClock],
  ["activation", BadgeCheck],
  ["checkout", LockKeyhole],
];

/** Split a SAR price into locale-ordered parts so the number can be set large. */
function priceParts(amount, locale) {
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "SAR", maximumFractionDigits: 0 })
    .formatToParts(amount)
    .map((p) => ({ ...p, value: p.value.replace(/[‎‏]/g, "").trim() }))
    .filter((p) => p.value);
}

/**
 * Plans teaser — tint band.
 *   lg: intro + billing facts in the start column, Free vs Elite spanning the end.
 *   <lg: intro → plan cards → facts, so the plans come first on phones.
 */
export default async function PlansTeaser() {
  const [t, locale] = [await getT("landing"), getLocale()];
  const full = PRESETS.find((p) => p.id === "full") || PRESETS[PRESETS.length - 1];
  const freeVars = {
    questions: t("units.questions", { count: LIMITS.freeMaxQuestions }),
    attempts: t("units.attempts", { count: LIMITS.freeDailyAttempts }),
    messages: t("units.messages", { count: AI_FREE_LIMIT }),
    hours: t("units.hours", { count: Math.round(AI_WINDOW_MS / 3_600_000) }),
  };
  const eliteVars = {
    questions: t("units.questions", { count: LIMITS.maxQuestions }),
    simQuestions: t("units.questions", { count: full.count }),
    simMinutes: t("units.minutes", { count: full.minutes }),
  };

  return (
    <Section id="plans" tone="tint" aria-labelledby="plans-title">
      <Container className="grid gap-10 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-9">
        <div className="lg:col-span-4 lg:col-start-1 lg:row-start-1 lg:pt-2">
          <Intro id="plans-title" eyebrow={t("plans.eyebrow")} title={t("plans.title")} lead={t("plans.lead")} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:col-span-8 lg:col-start-5 lg:row-span-2 lg:row-start-1">
          {/* Free */}
          <article className="flex flex-col rounded-lg border border-line/15 bg-surface p-6 shadow-sm sm:p-7">
            <h3 className="t-h3">{t("plans.free.name")}</h3>
            <p className="t-small mt-1 text-ink-3">{t("plans.free.tagline")}</p>
            <Price parts={priceParts(0, locale)} note={t("plans.free.priceNote")} />
            <ul className="mt-7 flex-1 space-y-3.5 border-t border-line/10 pt-6">
              {FREE_PERKS.map((k) => (
                <Perk key={k}>{t(`plans.free.perks.${k}`, freeVars)}</Perk>
              ))}
            </ul>
            <Button href="/sign-up" variant="secondary" block className="mt-8">{t("plans.free.cta")}</Button>
          </article>

          {/* Elite */}
          <article className="relative flex flex-col rounded-lg border border-gold-300/70 bg-surface p-6 shadow-md ring-1 ring-inset ring-gold-200/50 sm:p-7">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h3 className="t-h3 flex items-center gap-2">
                <Crown size={20} className="text-gold-500" aria-hidden="true" />
                {t("plans.elite.name")}
              </h3>
              <Badge tone="gold" size="sm" className="shrink-0">{t("plans.elite.badge")}</Badge>
            </div>
            <p className="t-small mt-1 text-ink-3">{t("plans.elite.tagline")}</p>
            <Price parts={priceParts(ELITE.priceSAR, locale)} note={t("plans.elite.period")} />
            <ul className="mt-7 flex-1 space-y-3.5 border-t border-gold-200/60 pt-6">
              {ELITE_PERKS.map((k) => (
                <Perk key={k} gold>
                  {t(`plans.elite.perks.${k}`, k === "simulation" ? { questions: eliteVars.simQuestions, minutes: eliteVars.simMinutes } : eliteVars)}
                </Perk>
              ))}
            </ul>
            <Button href="/subscriptions" variant="gold" block iconEnd={ArrowRight} className="mt-8">{t("plans.elite.cta")}</Button>
          </article>
        </div>

        {/* billing facts — the things people want to know before paying */}
        <div className="lg:col-span-4 lg:col-start-1 lg:row-start-2">
          <ul aria-label={t("plans.facts.label")} className="grid gap-5 sm:grid-cols-3 sm:gap-6 lg:grid-cols-1 lg:gap-5 lg:border-t lg:border-line/10 lg:pt-8">
            {FACTS.map(([k, icon]) => (
              <Point key={k} icon={icon} title={t(`plans.facts.${k}.title`)} body={t(`plans.facts.${k}.body`)} />
            ))}
          </ul>
          <ArrowLink href="/subscriptions" className="mt-5">{t("plans.compare")}</ArrowLink>
        </div>
      </Container>
    </Section>
  );
}

/** Large amount + currency in locale order, then a short note (period / "no card"). */
function Price({ parts, note }) {
  return (
    <p className="mt-6 flex flex-wrap items-baseline gap-x-1.5">
      {parts.map((p, i) =>
        p.type === "integer" || p.type === "group" ? (
          <span key={i} className="num text-[2.5rem] font-bold leading-none text-ink tabular">{p.value}</span>
        ) : p.type === "currency" ? (
          <span key={i} className="text-lg font-medium text-ink-2">{p.value}</span>
        ) : null
      )}
      <span className="t-small ms-1 text-ink-3">{note}</span>
    </p>
  );
}

function Perk({ gold = false, children }) {
  return (
    <li className="flex items-start gap-2.5 text-[0.9375rem] text-ink-2">
      <span
        className={cn(
          "mt-[0.2rem] grid h-5 w-5 shrink-0 place-items-center rounded-full ring-1 ring-inset",
          gold ? "bg-gold-50 text-gold-600 ring-gold-200/80" : "bg-green-50 text-green-600 ring-green-100"
        )}
      >
        <Check size={12} strokeWidth={2.75} aria-hidden="true" />
      </span>
      <span>{children}</span>
    </li>
  );
}
