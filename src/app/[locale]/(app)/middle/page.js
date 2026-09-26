import { Award, ArrowDown, ClipboardCheck, Sparkles, Users } from "lucide-react";
import { setRequestLocale, getT } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import { SectionHeader } from "@/components/ui/Layout";
import { cn } from "@/components/ui/cn";
import StageHero from "@/components/stages/StageHero";
import GradeCard from "@/components/stages/GradeCard";
import SubjectFeature from "@/components/stages/SubjectFeature";
import SubjectIndex from "@/components/stages/SubjectIndex";
import { ArrowLink, LinkCard } from "@/components/stages/parts";
import { StageEmpty, StageJsonLd, StageSection } from "@/components/stages/StageShell";
import { hasEnglishName } from "@/components/stages/names";
import { academicYear, flatStageGrades, stageSubjects, termCount } from "@/components/stages/catalog";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "middle", path: "/middle" });
}

// Layout note: the app sidebar takes 272px from `lg`, so the content column is
// only ~690px wide at 1024 — multi-column splits start at `xl`, not `lg`.
export default async function MiddlePage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const { locale } = params;
  const [t, tn, tc] = await Promise.all([getT("stages"), getT("nav"), getT("common")]);

  const grades = flatStageGrades("middle");
  const subjects = stageSubjects(grades);
  const has = new Set(subjects.map((s) => s.id));
  const terms = termCount();
  // Subject chips on the grade cards are a preview, not content: in English
  // they only show when the catalog carries real English names.
  const showPreview = locale !== "en" || subjects.every(hasEnglishName);

  const crumbs = [{ label: tn("items.curriculum"), href: "/curriculum" }, { label: tn("items.middle") }];
  const facts = [
    { value: grades.length, label: t("shared.facts.grades", { count: grades.length }) },
    { value: subjects.length, label: t("shared.facts.subjects", { count: subjects.length }) },
    terms > 0 && { value: terms, label: t("shared.facts.terms", { count: terms }) },
  ].filter(Boolean);

  const steps = t.raw("middle.plan.steps") || [];
  const tools = [
    { key: "exams", href: "/exams", icon: ClipboardCheck },
    { key: "community", href: "/community", icon: Users, tone: "green" },
    { key: "achievements", href: "/achievements", icon: Award, tone: "green" },
  ];

  return (
    <>
      <StageJsonLd
        locale={locale}
        items={[
          { name: tn("items.curriculum"), path: "/curriculum" },
          { name: tn("items.middle"), path: "/middle" },
        ]}
      />

      <StageHero
        locale={locale}
        crumbs={crumbs}
        crumbsLabel={tc("a11y.breadcrumb")}
        year={t("shared.year", { year: academicYear() })}
        eyebrow={t("middle.hero.eyebrow")}
        title={t("middle.hero.title")}
        lead={t("middle.hero.lead")}
        facts={grades.length ? facts : []}
        factsLabel={t("shared.factsLabel")}
        illustration="middle.hero"
        actions={
          <>
            <Button href="#grades" variant="primary" size="lg" iconEnd={ArrowDown}>
              {t("middle.hero.primary")}
            </Button>
            <Button href="/exams" variant="secondary" size="lg" iconStart={ClipboardCheck}>
              {t("middle.hero.secondary")}
            </Button>
          </>
        }
      />

      {/* ── Grades ── */}
      <StageSection id="grades" labelledBy="grades-title">
        <SectionHeader
          id="grades-title"
          eyebrow={t("middle.grades.eyebrow")}
          title={t("middle.grades.title")}
          description={t("middle.grades.lead")}
          actions={<ArrowLink href="/curriculum/middle">{t("middle.grades.all")}</ArrowLink>}
        />
        {grades.length === 0 ? (
          <div className="mt-8">
            <StageEmpty t={t} />
          </div>
        ) : (
          <ul className={cn("mt-8 grid", showPreview ? "gap-4 xl:grid-cols-3 xl:gap-5" : "gap-2.5 sm:grid-cols-3 sm:gap-3 xl:gap-4")}>
            {grades.map((gr) => (
              <li key={gr.id}>
                <GradeCard
                  dense={!showPreview}
                  href={gr.href}
                  badge={gr.n}
                  locale={locale}
                  name={t(`middle.grades.names.g${gr.n}`)}
                  meta={tc("units.subjects", { count: gr.subjects.length })}
                  preview={showPreview ? gr.subjects : null}
                  moreLabel={(n) => t("shared.moreSubjects", { count: n })}
                />
              </li>
            ))}
          </ul>
        )}
      </StageSection>

      {/* ── Subjects bento: maths · science, then physics/chemistry beside the full index ── */}
      {subjects.length > 0 && (
        <StageSection id="subjects" labelledBy="subjects-title">
          <SectionHeader
            id="subjects-title"
            eyebrow={t("middle.subjects.eyebrow")}
            title={t("middle.subjects.title")}
            description={t("middle.subjects.lead")}
          />
          <div className="mt-8 grid gap-4 xl:grid-cols-12 xl:gap-5">
            {has.has("math") && (
              <SubjectFeature
                layout="row"
                className="xl:col-span-6"
                illustration="middle.math"
                title={t("middle.subjects.items.math.title")}
                body={t("middle.subjects.items.math.body")}
              />
            )}
            {has.has("science") && (
              <SubjectFeature
                layout="row"
                className="xl:col-span-6"
                illustration="middle.science"
                title={t("middle.subjects.items.science.title")}
                body={t("middle.subjects.items.science.body")}
              />
            )}
            {has.has("science") && (
              <div className="grid gap-4 md:grid-cols-2 xl:col-span-6 xl:auto-rows-fr xl:grid-cols-1 xl:gap-5">
                {[
                  ["physics", "middle.physics"],
                  ["chemistry", "middle.chemistry"],
                ].map(([k, art]) => (
                  <SubjectFeature
                    key={k}
                    layout="row"
                    compact
                    illustration={art}
                    tag={t("middle.subjects.partOfScience")}
                    title={t(`middle.subjects.items.${k}.title`)}
                    body={t(`middle.subjects.items.${k}.body`)}
                  />
                ))}
              </div>
            )}
            <SubjectIndex
              className="xl:col-span-6"
              locale={locale}
              subjects={subjects}
              title={t("middle.subjects.index.title")}
              note={t("middle.subjects.index.note")}
              resourcesNote={t("shared.resourcesNote")}
            />
          </div>
        </StageSection>
      )}

      {/* ── Study plan: steps + assistant ── */}
      <StageSection id="plan" labelledBy="plan-title">
        <div className="grid gap-8 xl:grid-cols-12 xl:gap-10">
          <div className="xl:col-span-7">
            <SectionHeader id="plan-title" eyebrow={t("middle.plan.eyebrow")} title={t("middle.plan.title")} description={t("middle.plan.lead")} />
            <ol className="mt-8 grid gap-x-6 gap-y-6 sm:grid-cols-2">
              {steps.map((step, i) => (
                <li key={i} className="flex gap-3.5">
                  <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green-50 text-sm font-bold text-green-700 ring-1 ring-inset ring-green-100 tabular">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-medium leading-snug text-ink">{step.title}</h3>
                    <p className="t-small mt-1 text-ink-3">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <aside aria-labelledby="plan-assistant" className="xl:col-span-5">
            <div className="overflow-hidden rounded-lg border border-line/12 bg-surface shadow-sm sm:flex xl:block">
              <div aria-hidden="true" className="relative aspect-[16/9] sm:aspect-auto sm:min-h-[12rem] sm:w-2/5 xl:aspect-[16/9] xl:min-h-0 xl:w-auto">
                <Illustration id="assistant.plan" fill sizes="(min-width: 1280px) 420px, (min-width: 640px) 40vw, 100vw" />
              </div>
              <div className="p-5 sm:flex sm:flex-1 sm:flex-col sm:justify-center sm:p-6">
                <h3 id="plan-assistant" className="t-h4">{t("middle.plan.assistant.title")}</h3>
                <p className="t-small mt-1.5 text-ink-3">{t("middle.plan.assistant.body")}</p>
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Button href="/assistant" variant="secondary" iconStart={Sparkles}>
                    {t("middle.plan.assistant.cta")}
                  </Button>
                  <span className="t-caption">{t("shared.signInRequired")}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </StageSection>

      {/* ── Practice & progress ── */}
      <StageSection id="practice" labelledBy="practice-title">
        <SectionHeader
          id="practice-title"
          eyebrow={t("middle.practice.eyebrow")}
          title={t("middle.practice.title")}
          actions={<ArrowLink href="/high-school">{t("middle.practice.next")}</ArrowLink>}
        />
        <ul className="mt-8 grid gap-4 md:grid-cols-3 xl:gap-5">
          {tools.map((it) => (
            <li key={it.key}>
              <LinkCard href={it.href} icon={it.icon} tone={it.tone || "gold"} title={t(`shared.tools.${it.key}.title`)} body={t(`shared.tools.${it.key}.body`)} />
            </li>
          ))}
        </ul>
      </StageSection>
    </>
  );
}
