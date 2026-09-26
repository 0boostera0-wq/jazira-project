import { EyeOff, MonitorSmartphone, UserRoundCog, UserRoundX } from "lucide-react";
import { getT } from "@/i18n/server";
import Illustration from "@/components/ui/Illustration";
import { Container, Section } from "@/components/ui/Layout";
import { ArrowLink, Intro, Point } from "./parts";

const POINTS = [
  ["hidden", EyeOff],
  ["control", UserRoundCog],
  ["devices", MonitorSmartphone],
  ["delete", UserRoundX],
];

/** Privacy & trust — one wide card: the private glass study room at the start, commitments at the end. */
export default async function PrivacyTrust() {
  const t = await getT("landing");
  return (
    <Section id="privacy" size="sm" aria-labelledby="privacy-title">
      <Container>
        <div className="grid items-center gap-8 rounded-xl border border-line/15 bg-surface p-6 shadow-sm sm:p-10 lg:grid-cols-12 lg:gap-12 lg:p-12">
          <div className="lg:col-span-4">
            <div className="art-frame rounded-xl">
              <Illustration id="landing.privacy" sizes="(min-width: 1024px) 30vw, 100vw" className="aspect-[16/9] object-cover lg:aspect-[4/5]" />
            </div>
          </div>
          <div className="lg:col-span-8">
            <Intro id="privacy-title" eyebrow={t("privacy.eyebrow")} title={t("privacy.title")} lead={t("privacy.lead")} />
            <ul className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {POINTS.map(([k, icon]) => (
                <Point key={k} icon={icon} tone="green" title={t(`privacy.points.${k}.title`)} body={t(`privacy.points.${k}.body`)} />
              ))}
            </ul>
            <ArrowLink href="/privacy" className="mt-6">{t("privacy.cta")}</ArrowLink>
          </div>
        </div>
      </Container>
    </Section>
  );
}
