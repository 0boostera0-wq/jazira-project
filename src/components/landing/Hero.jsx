import { ArrowRight, Check, Timer } from "lucide-react";
import { getT } from "@/i18n/server";
import Button from "@/components/ui/Button";
import IconTile from "@/components/ui/IconTile";
import Illustration from "@/components/ui/Illustration";
import { SIZES } from "@/lib/assets";
import { Container } from "@/components/ui/Layout";
import AssistantAvatar from "@/components/brand/AssistantAvatar";
import IslandMark from "@/components/brand/IslandMark";
import { PRESETS } from "@/lib/exams/catalog";

const TRUST = ["free", "arabic", "stages"];

/**
 * Split hero: copy + CTAs at the start, the signature island painting (the LCP
 * image) at the end in a large rounded frame. Two anchored product chips
 * preview real features (the quick-test preset and the assistant) from sm up.
 */
export default async function Hero() {
  const t = await getT("landing");
  const quick = PRESETS.find((p) => p.id === "quick") || PRESETS[0];

  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <Container className="grid items-center gap-5 pb-12 pt-6 sm:gap-6 sm:pb-14 sm:pt-10 lg:grid-cols-12 lg:gap-10 lg:pb-16 lg:pt-12">
        {/* copy */}
        <div className="animate-in lg:col-span-6">
          <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-gold-200/70 bg-surface/80 py-1 pe-3.5 ps-1 text-[0.8125rem] font-medium text-ink-2 shadow-xs">
            <IslandMark size={24} />
            <span className="truncate sm:hidden">{t("hero.eyebrowShort")}</span>
            <span className="hidden truncate sm:inline">{t("hero.eyebrow")}</span>
          </p>

          <h1 id="hero-title" className="t-display mt-6">
            {t("hero.title")} <span className="block pb-1 text-gold-grad">{t("hero.titleAccent")}</span>
          </h1>

          <p className="t-lead mt-5 max-w-[35rem]">{t("hero.lead")}</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button href="/sign-up" size="lg" iconEnd={ArrowRight}>{t("hero.primary")}</Button>
            <Button href="/curriculum" size="lg" variant="secondary">{t("hero.secondary")}</Button>
          </div>

          <ul aria-label={t("hero.trustLabel")} className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
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

        {/* art */}
        <div className="relative mx-auto w-full max-w-[560px] sm:px-6 lg:col-span-6 lg:max-w-none lg:px-0">
          <div className="art-frame rounded-[1.75rem] shadow-lg sm:rounded-[2.25rem]">
            <Illustration id="landing.hero" priority sizes={SIZES.hero} className="aspect-[4/3] object-cover lg:aspect-[5/4]" />
          </div>

          {/* anchored product chips (decorative previews of real features) */}
          <div aria-hidden="true" className="absolute bottom-[9%] start-0 hidden items-center gap-3 rounded-lg border border-line/10 bg-surface py-2.5 pe-4 ps-2.5 shadow-md sm:flex xl:-start-4">
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

          <div aria-hidden="true" className="absolute end-0 top-[21%] hidden items-center gap-2.5 rounded-lg border border-line/10 bg-surface py-2 pe-4 ps-2 shadow-md sm:flex xl:-end-3">
            <AssistantAvatar size={36} />
            <div className="leading-tight">
              <p className="text-sm font-medium text-ink">{t("hero.chips.assistantTitle")}</p>
              <p className="t-caption mt-0.5">{t("hero.chips.assistantBody")}</p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
