import { ArrowRight, Check, Timer } from "lucide-react";
import { getT } from "@/i18n/server";
import Button from "@/components/ui/Button";
import IconTile from "@/components/ui/IconTile";
import PageHero from "@/components/ui/PageHero";
import AssistantAvatar from "@/components/brand/AssistantAvatar";
import { PRESETS } from "@/lib/exams/catalog";

const TRUST = ["free", "arabic", "stages"];

/**
 * Landing hero: the island campus full-bleed under the header with the promise
 * on a framed panel over it (PageHero, the page's LCP image); the calls to
 * action, the trust points and two product chips (previews of the quick test
 * and the assistant) follow under the band.
 */
export default async function Hero() {
  const t = await getT("landing");
  const quick = PRESETS.find((p) => p.id === "quick") || PRESETS[0];

  return (
    <PageHero
      variant="site"
      display
      id="hero-title"
      image="landing.hero"
      eyebrow={
        <>
          <span className="sm:hidden">{t("hero.eyebrowShort")}</span>
          <span className="hidden sm:inline">{t("hero.eyebrow")}</span>
        </>
      }
      title={
        <>
          {t("hero.title")} <span className="block pb-1 text-gold-grad lg:bg-none lg:text-[#A8E6DA]">{t("hero.titleAccent")}</span>
        </>
      }
      lead={t("hero.lead")}
      className="animate-in pb-10 sm:pb-12 lg:pb-14"
    >
      <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button href="/sign-up" size="lg" iconEnd={ArrowRight}>{t("hero.primary")}</Button>
            <Button href="/curriculum" size="lg" variant="secondary">{t("hero.secondary")}</Button>
          </div>
          <ul aria-label={t("hero.trustLabel")} className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
            {TRUST.map((k) => (
              <li key={k} className="flex items-center gap-2 text-sm font-medium text-ink-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green-50 text-green-600 ring-1 ring-inset ring-green-100">
                  <Check size={12} strokeWidth={2.75} aria-hidden="true" />
                </span>
                {t(`hero.trust.${k}`)}
              </li>
            ))}
          </ul>
        </div>

        {/* product chips: decorative previews of real features */}
        <div aria-hidden="true" className="hidden gap-3 sm:flex">
          <div className="flex items-center gap-3 rounded-lg border border-line/10 bg-surface py-2.5 pe-4 ps-2.5 shadow-sm">
            <IconTile icon={Timer} tone="green" size="sm" />
            <div className="leading-tight">
              <p className="text-sm font-medium text-ink">{t("hero.chips.quickTitle")}</p>
              <p className="t-caption mt-0.5">
                {t("hero.chips.quickBody", {
                  questions: t("units.questions", { count: quick.count }),
                  minutes: t("units.minutes", { count: quick.minutes }),
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border border-line/10 bg-surface py-2 pe-4 ps-2 shadow-sm">
            <AssistantAvatar size={36} />
            <div className="leading-tight">
              <p className="text-sm font-medium text-ink">{t("hero.chips.assistantTitle")}</p>
              <p className="t-caption mt-0.5">{t("hero.chips.assistantBody")}</p>
            </div>
          </div>
        </div>
      </div>
    </PageHero>
  );
}
