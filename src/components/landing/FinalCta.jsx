import { ArrowRight } from "lucide-react";
import { getT } from "@/i18n/server";
import { Link } from "@/i18n/navigation";
import Button, { buttonClasses } from "@/components/ui/Button";
import { Container, Section } from "@/components/ui/Layout";
import IslandMark from "@/components/brand/IslandMark";

/** Closing call to action — a deep ink band with the brand mark (inverts in dark mode). */
export default async function FinalCta() {
  const t = await getT("landing");
  return (
    <Section size="sm" aria-labelledby="cta-title" className="!pt-0">
      <Container>
        <div className="relative overflow-hidden rounded-xl bg-primary px-6 py-10 text-primary-fg sm:px-10 sm:py-12 lg:px-14 lg:py-14">
          {/* quiet wave motif */}
          <svg aria-hidden="true" viewBox="0 0 600 120" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full text-primary-fg opacity-[0.06]">
            <path d="M0 70 C 75 40 150 40 225 70 S 375 100 450 70 S 560 40 600 60 V120 H0Z" fill="currentColor" />
            <path d="M0 92 C 90 70 170 70 260 92 S 430 114 520 92 S 580 80 600 86 V120 H0Z" fill="currentColor" />
          </svg>

          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
            <div className="flex max-w-2xl flex-col gap-5 sm:flex-row sm:items-start">
              <IslandMark size={52} tone="onDark" className="shrink-0" />
              <div>
                <h2 id="cta-title" className="t-h2 text-primary-fg">{t("cta.title")}</h2>
                <p className="t-lead mt-3 text-primary-fg/75">{t("cta.body")}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              <Button href="/sign-up" variant="gold" size="lg" iconEnd={ArrowRight}>{t("cta.primary")}</Button>
              <Link
                href="/curriculum"
                className={buttonClasses({ variant: "none", size: "lg", className: "border border-primary-fg/25 text-primary-fg hover:bg-primary-fg/10" })}
              >
                {t("cta.secondary")}
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
