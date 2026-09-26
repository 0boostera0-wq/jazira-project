import { ArrowDown, ArrowRight, Award, Brain, ClipboardCheck, FlaskConical, Sparkles, Users } from "lucide-react";
import { setRequestLocale, getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { Link } from "@/i18n/navigation";
import { buildMetadata } from "@/lib/seo";
import Button from "@/components/ui/Button";
import IconTile from "@/components/ui/IconTile";
import { SectionHeader } from "@/components/ui/Layout";
import StageHero from "@/components/stages/StageHero";
import GradeCard from "@/components/stages/GradeCard";
import SubjectFeature from "@/components/stages/SubjectFeature";
import TracksExplorer from "@/components/stages/TracksExplorer";
import { ArrowLink, LinkCard, TipsCard } from "@/components/stages/parts";
import { StageEmpty, StageJsonLd, StageSection } from "@/components/stages/StageShell";
import { academicYear, highSchoolCatalog } from "@/components/stages/catalog";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "highSchool", path: "/high-school" });
}

const TAHSILI = [
  ["math", "high-school.math"],
  ["physics", "high-school.physics"],
  ["chemistry", "high-school.chemistry"],
  ["biology", "high-school.biology"],
];

// Layout note: the app sidebar takes 272px from `lg`, so the content column is
// only ~690px wide at 1024 — multi-column splits start at `xl`, not `lg`.
export default async function HighSchoolPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const { locale } = params;
  const [t, tn, tc] = await Promise.all([getT("stages"), getT("nav"), getT("common")]);

  const { grades, tracks } = highSchoolCatalog();
  const common = grades.find((g) => g.subjects);
  const crumbs = [{ label: tn("items.curriculum"), href: "/curriculum" }, { label: tn("items.highSchool") }];
  const facts = [
    { value: grades.length, label: t("shared.facts.years", { count: grades.length }) },
    common && { value: common.subjects.length, label: t("shared.facts.commonSubjects", { count: common.subjects.length }) },
    tracks.length > 0 && { value: tracks.length, label: t("shared.facts.tracks", { count: tracks.length }) },
  ].filter(Boolean);

  const exams = [
    { key: "aptitude", href: "/exams/aptitude", icon: Brain },
    { key: "achievement", href: "/exams/achievement", icon: FlaskConical },
  ];
  const tools = [
    { key: "assistant", href: "/assistant", icon: Sparkles, badge: t("shared.signInRequired") },
    { key: "community", href: "/community", icon: Users, tone: "green" },
    { key: "achievements", href: "/achievements", icon: Award, tone: "green" },
  ];

  return (
    <>
      <StageJsonLd
        locale={locale}
        items={[
          { name: tn("items.curriculum"), path: "/curriculum" },
          { name: tn("items.highSchool"), path: "/high-school" },
        ]}
      />

      <StageHero
        locale={locale}
        crumbs={crumbs}
        crumbsLabel={tc("a11y.breadcrumb")}
        year={t("shared.year", { year: academicYear() })}
        eyebrow={t("highSchool.hero.eyebrow")}
        title={t("highSchool.hero.title")}
        lead={t("highSchool.hero.lead")}
        facts={grades.length ? facts : []}
        factsLabel={t("shared.factsLabel")}
        illustration="high-school.hero"
        actions={
          <>
            <Button href="#tracks" variant="primary" size="lg" iconEnd={ArrowDown}>
              {t("highSchool.hero.primary")}
            </Button>
            <Button href="/exams" variant="secondary" size="lg" iconStart={ClipboardCheck}>
              {t("highSchool.hero.secondary")}
            </Button>
          </>
        }
      />

      {/* ── Journey: common first year → track years ── */}
      <StageSection id="grades" labelledBy="journey-title">
        <SectionHeader
          id="journey-title"
          eyebrow={t("highSchool.journey.eyebrow")}
          title={t("highSchool.journey.title")}
          description={t("highSchool.journey.lead")}
          actions={<ArrowLink href="/curriculum/high-school">{t("highSchool.journey.all")}</ArrowLink>}
        />
        {grades.length === 0 ? (
          <div className="mt-8">
            <StageEmpty t={t} />
          </div>
        ) : (
          <ol className="mt-8 grid gap-4 xl:grid-cols-3 xl:gap-5">
            {grades.map((gr) => {
              const key = `highSchool.journey.grades.g${gr.n}`;
              const meta = gr.subjects ? tc("units.subjects", { count: gr.subjects.length }) : t("shared.tracksCount", { count: gr.trackCount });
              return (
                <li key={gr.id}>
                  <GradeCard
                    href={gr.href}
                    tone={gr.subjects ? "green" : "gold"}
                    badge={gr.n}
                    locale={locale}
                    tag={t(`${key}.tag`)}
                    name={t(`${key}.name`)}
                    meta={meta}
                    body={t(`${key}.body`)}
                  />
                </li>
              );
            })}
          </ol>
        )}
      </StageSection>

      {/* ── Tracks explorer (client island) ── */}
      {tracks.length > 0 && (
        <StageSection id="tracks" labelledBy="tracks-title">
          <SectionHeader id="tracks-title" eyebrow={t("highSchool.tracks.eyebrow")} title={t("highSchool.tracks.title")} description={t("highSchool.tracks.lead")} />
          <div className="mt-8">
            <Messages ns={["stages"]}>
              <TracksExplorer tracks={tracks} />
            </Messages>
          </div>
        </StageSection>
      )}

      {/* ── Tahsili subjects ── */}
      <StageSection id="tahsili" labelledBy="tahsili-title">
        <SectionHeader
          id="tahsili-title"
          eyebrow={t("highSchool.tahsili.eyebrow")}
          title={t("highSchool.tahsili.title")}
          description={t("highSchool.tahsili.lead")}
          actions={<ArrowLink href="/exams/achievement">{t("highSchool.tahsili.cta")}</ArrowLink>}
        />
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
          {TAHSILI.map(([k, art]) => (
            <li key={k}>
              <SubjectFeature
                compact
                illustration={art}
                title={t(`highSchool.tahsili.items.${k}.title`)}
                body={t(`highSchool.tahsili.items.${k}.body`)}
              />
            </li>
          ))}
        </ul>
      </StageSection>

      {/* ── Exam preparation + tips ── */}
      <StageSection id="exams" labelledBy="exams-title">
        <div className="grid gap-8 xl:grid-cols-12 xl:gap-6">
          <div className="xl:col-span-8">
            <SectionHeader id="exams-title" eyebrow={t("highSchool.exams.eyebrow")} title={t("highSchool.exams.title")} description={t("highSchool.exams.lead")} />
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 xl:gap-5">
              {exams.map((e) => (
                <li key={e.key}>
                  <Link
                    href={e.href}
                    className="group flex h-full flex-col rounded-lg border border-gold-200/60 bg-gold-50/70 p-5 shadow-xs transition-[transform,box-shadow,border-color] duration ease-out hover:-translate-y-0.5 hover:border-gold-300/80 hover:shadow-md sm:p-6"
                  >
                    <div className="flex items-center gap-3.5 sm:block">
                      <IconTile icon={e.icon} tone="gold" size="lg" />
                      <h3 className="t-h3 sm:mt-5">{t(`highSchool.exams.${e.key}.title`)}</h3>
                    </div>
                    <p className="t-small mt-3 text-ink-2 sm:mt-1.5">{t(`highSchool.exams.${e.key}.body`)}</p>
                    <span className="mt-auto inline-flex min-h-11 items-center gap-1.5 pt-4 text-[0.9375rem] font-medium text-gold-700">
                      {t(`highSchool.exams.${e.key}.cta`)}
                      <ArrowRight
                        size={16}
                        aria-hidden="true"
                        className="flip-rtl transition-transform duration-fast ease-out group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <ArrowLink href="/exams" className="mt-4">{t("highSchool.exams.all")}</ArrowLink>
          </div>
          <TipsCard className="self-start xl:col-span-4" title={t("highSchool.tips.title")} items={t.raw("highSchool.tips.items") || []} />
        </div>
      </StageSection>

      {/* ── Tools ── */}
      <StageSection id="more" labelledBy="more-title">
        <SectionHeader id="more-title" eyebrow={t("highSchool.more.eyebrow")} title={t("highSchool.more.title")} />
        <ul className="mt-8 grid gap-4 md:grid-cols-3 xl:gap-5">
          {tools.map((it) => (
            <li key={it.key}>
              <LinkCard
                href={it.href}
                icon={it.icon}
                tone={it.tone || "gold"}
                title={t(`shared.tools.${it.key}.title`)}
                body={t(`shared.tools.${it.key}.body`)}
                badge={it.badge}
              />
            </li>
          ))}
        </ul>
      </StageSection>
    </>
  );
}
