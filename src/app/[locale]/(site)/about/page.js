import {
  ArrowRight, BadgeCheck, Check, ClipboardCheck, Clock, Eye, FilePenLine, Layers,
  Library, Lock, MessageSquareWarning, ScanSearch, Users,
} from "lucide-react";
import { getT, setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import { Link } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import IconTile from "@/components/ui/IconTile";
import { SectionHeader } from "@/components/ui/Layout";
import { cn } from "@/components/ui/cn";
import AssistantAvatar from "@/components/brand/AssistantAvatar";
import SupportHero from "@/components/support/SupportHero";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "about", path: "/about" });
}

const APPROACH = ["structure", "practice", "help"];
const STAGES = [
  { key: "elementary", href: "/elementary", grades: 6 },
  { key: "middle", href: "/middle", grades: 3 },
  { key: "highSchool", href: "/high-school", grades: 3 },
];
const EXAMS = [
  { key: "aptitude", href: "/exams/aptitude" },
  { key: "achievement", href: "/exams/achievement" },
];
const SOURCING = [
  { key: "original", icon: FilePenLine },
  { key: "structure", icon: Layers },
  { key: "numbers", icon: BadgeCheck },
  { key: "corrections", icon: MessageSquareWarning, href: "/contact?topic=content" },
];
const VALUES = [
  { key: "clarity", icon: Eye },
  { key: "honesty", icon: ScanSearch },
  { key: "time", icon: Clock },
  { key: "privacy", icon: Lock },
];

function CardLink({ href, children }) {
  return (
    <Link
      href={href}
      className="group/link inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-xs text-sm font-medium text-gold-600 underline-offset-4 hover:underline"
    >
      {children}
      <ArrowRight size={15} aria-hidden="true" className="flip-rtl transition-transform group-hover/link:translate-x-0.5 rtl:group-hover/link:-translate-x-0.5" />
    </Link>
  );
}

function Point({ children }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green-50 text-green-600" aria-hidden="true">
        <Check size={12} strokeWidth={2.5} />
      </span>
      <span className="t-small text-ink-2">{children}</span>
    </li>
  );
}

export default async function AboutPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const [t, tn, tc] = await Promise.all([getT("support"), getT("nav"), getT("common")]);

  return (
    <>
      <SupportHero
        eyebrow={t("about.eyebrow")}
        title={t("about.title")}
        lead={t("about.lead")}
        art="landing.about"
        actions={
          <>
            <Button href="/sign-up" size="lg" iconEnd={ArrowRight}>{t("about.primaryCta")}</Button>
            <Button href="/curriculum" size="lg" variant="secondary">{t("about.secondaryCta")}</Button>
          </>
        }
        footer={
          <ul aria-label={t("about.factsLabel")} className="flex flex-wrap gap-x-5 gap-y-2.5">
            {["stages", "exams", "languages", "free"].map((k) => (
              <li key={k} className="flex items-center gap-2 text-sm text-ink-2">
                <Check size={16} className="text-green-600" aria-hidden="true" />
                {t(`about.facts.${k}`)}
              </li>
            ))}
          </ul>
        }
      />

      {/* ── Mission & approach — editorial split ─────────────────────────── */}
      <section className="pb-12 pt-6 sm:pb-16 sm:pt-8 lg:pb-16 lg:pt-10">
        <div className="container-jz grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <p className="t-eyebrow">{t("about.mission.eyebrow")}</p>
            <h2 className="t-h2 mt-2.5">{t("about.mission.title")}</h2>
            <p className="t-body mt-5 text-ink-2">{t("about.mission.body")}</p>
          </div>
          <ol className="divide-y divide-line/10 border-y border-line/15 lg:col-span-7">
            {APPROACH.map((k, i) => (
              <li key={k} className="grid grid-cols-[2.75rem_1fr] gap-4 py-6 sm:gap-6 sm:py-7">
                <span className="num pt-1 text-sm font-medium tabular text-gold-600">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="t-h3">{t(`about.approach.${k}.title`)}</h3>
                  <p className="t-body mt-2 text-ink-3">{t(`about.approach.${k}.body`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── What Jazira offers — bento ───────────────────────────────────── */}
      <section className="section-y bg-surface-2/60">
        <div className="container-jz">
          <SectionHeader eyebrow={t("about.offer.eyebrow")} title={t("about.offer.title")} description={t("about.offer.lead")} />
          <div className="mt-10 grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-12">
            {/* Curriculum — wide */}
            <Card pad="lg" className="grid gap-8 sm:grid-cols-[1.15fr_1fr] md:col-span-2 lg:col-span-7">
              <div className="flex flex-col">
                <IconTile icon={Library} />
                <h3 className="t-h3 mt-5">{t("about.offer.curriculum.title")}</h3>
                <p className="t-body mt-2 text-ink-3">{t("about.offer.curriculum.body")}</p>
                <ul className="mt-5 space-y-2.5">
                  {["a", "b", "c"].map((k) => <Point key={k}>{t(`about.offer.curriculum.points.${k}`)}</Point>)}
                </ul>
                <div className="mt-auto hidden pt-5 sm:block"><CardLink href="/curriculum">{t("about.offer.curriculum.cta")}</CardLink></div>
              </div>
              <ul className="-mt-2 self-center overflow-hidden rounded-md border border-line/15 bg-surface-2/70 sm:mt-0">
                {STAGES.map((s, i) => (
                  <li key={s.key} className={i ? "border-t border-line/10" : undefined}>
                    <Link href={s.href} className="group/stage flex min-h-[4.25rem] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface">
                      <span className="num grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-surface text-sm font-medium tabular text-gold-600 shadow-xs">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.9375rem] font-medium text-ink">{tn(`items.${s.key}`)}</span>
                        <span className="t-caption block">{tc("units.grades", { count: s.grades })}</span>
                      </span>
                      <ArrowRight size={16} aria-hidden="true" className="flip-rtl shrink-0 text-ink-4 transition-colors group-hover/stage:text-ink" />
                    </Link>
                  </li>
                ))}
              </ul>
              {/* Phones: the link follows the stage list instead of splitting the card. */}
              <div className="-mt-6 sm:hidden"><CardLink href="/curriculum">{t("about.offer.curriculum.cta")}</CardLink></div>
            </Card>

            {/* Exams */}
            <Card pad="lg" className="flex flex-col md:col-span-2 lg:col-span-5">
              <IconTile icon={ClipboardCheck} />
              <h3 className="t-h3 mt-5">{t("about.offer.exams.title")}</h3>
              <p className="t-body mt-2 text-ink-3">{t("about.offer.exams.body")}</p>
              <ul className="mt-5 overflow-hidden rounded-md border border-line/15 bg-surface-2/70">
                {EXAMS.map((e, i) => (
                  <li key={e.key} className={i ? "border-t border-line/10" : undefined}>
                    <Link href={e.href} className="group/exam flex min-h-[4rem] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.9375rem] font-medium text-ink">{tn(`items.${e.key}`)}</span>
                        <span className="t-caption block">{t(`about.offer.exams.sections.${e.key}`)}</span>
                      </span>
                      <ArrowRight size={16} aria-hidden="true" className="flip-rtl shrink-0 text-ink-4 transition-colors group-hover/exam:text-ink" />
                    </Link>
                  </li>
                ))}
              </ul>
              <ul className="mt-4 flex flex-wrap gap-2">
                {["a", "b", "c"].map((k) => (
                  <li key={k} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line/15 bg-surface-2/70 px-3 text-sm text-ink-2">
                    <Check size={14} className="text-green-600" aria-hidden="true" />
                    {t(`about.offer.exams.points.${k}`)}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-5"><CardLink href="/exams">{t("about.offer.exams.cta")}</CardLink></div>
            </Card>

            {/* Community */}
            <Card pad="lg" className="flex flex-col lg:col-span-5">
              <IconTile icon={Users} tone="green" />
              <h3 className="t-h3 mt-5">{t("about.offer.community.title")}</h3>
              <p className="t-body mt-2 text-ink-3">{t("about.offer.community.body")}</p>
              <div className="mt-auto pt-5"><CardLink href="/community">{t("about.offer.community.cta")}</CardLink></div>
            </Card>

            {/* Assistant — wide */}
            {/* Tablet: community + assistant share a row, so the assistant stacks. */}
            <Card pad="lg" tone="gold" className="flex flex-col gap-6 sm:flex-row sm:items-center md:flex-col md:items-start lg:col-span-7 lg:flex-row lg:items-center">
              <AssistantAvatar size={88} className="shadow-gold" />
              <div className="min-w-0 flex-1">
                <h3 className="t-h3">{t("about.offer.assistant.title")}</h3>
                <p className="t-body mt-2 text-ink-2">{t("about.offer.assistant.body")}</p>
                <div className="mt-3"><CardLink href="/assistant">{t("about.offer.assistant.cta")}</CardLink></div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* ── How content is made — honesty ────────────────────────────────── */}
      <section className="section-y">
        <div className="container-jz grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
            <p className="t-eyebrow">{t("about.sourcing.eyebrow")}</p>
            <h2 className="t-h2 mt-2.5">{t("about.sourcing.title")}</h2>
            <p className="t-lead mt-4">{t("about.sourcing.lead")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:col-span-8">
            {SOURCING.map(({ key, icon, href }) => (
              <Card key={key} tone="flat" className="flex gap-4 sm:flex-col sm:gap-0">
                <IconTile icon={icon} tone="neutral" size="sm" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <h3 className="t-h4 sm:mt-4">{t(`about.sourcing.${key}.title`)}</h3>
                  <p className="t-small mt-1.5 text-ink-3">{t(`about.sourcing.${key}.body`)}</p>
                  {href && <div className="mt-auto pt-2"><CardLink href={href}>{t(`about.sourcing.${key}.cta`)}</CardLink></div>}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Values ───────────────────────────────────────────────────────── */}
      <section className="border-t border-line/10 section-y-sm">
        <div className="container-jz">
          <SectionHeader eyebrow={t("about.values.eyebrow")} title={t("about.values.title")} description={t("about.values.lead")} />
          <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-7 sm:mt-10 sm:gap-x-8 lg:grid-cols-4 lg:gap-x-0">
            {VALUES.map(({ key, icon: Icon }, i) => (
              <li
                key={key}
                className={cn(i > 0 && "lg:border-s lg:border-line/15 lg:ps-8", i < VALUES.length - 1 && "lg:pe-8")}
              >
                <Icon size={22} className="text-gold-600" aria-hidden="true" />
                <h3 className="t-h4 mt-3">{t(`about.values.${key}.title`)}</h3>
                <p className="t-small mt-1.5 text-ink-3">{t(`about.values.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <section className="pb-16 pt-4 sm:pb-20">
        <div className="container-jz">
          <div className="grid items-center gap-8 rounded-xl bg-primary px-6 py-10 text-primary-fg sm:px-10 lg:grid-cols-12 lg:px-14 lg:py-14">
            <div className="lg:col-span-7">
              <h2 className="t-h2 !text-primary-fg">{t("about.cta.title")}</h2>
              <p className="t-body mt-3 max-w-[56ch] text-primary-fg/75">{t("about.cta.body")}</p>
            </div>
            <div className="flex flex-wrap gap-3 lg:col-span-5 lg:justify-end">
              <Button href="/sign-up" variant="gold" size="lg">{t("about.cta.primary")}</Button>
              <Button
                href="/contact"
                variant="ghost"
                size="lg"
                className="border border-primary-fg/25 !text-primary-fg hover:!bg-primary-fg/10"
              >
                {t("about.cta.secondary")}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
