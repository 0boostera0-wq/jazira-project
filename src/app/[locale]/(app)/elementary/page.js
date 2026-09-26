import { Award, ArrowDown, ClipboardCheck, Library, Puzzle, Sparkles } from "lucide-react";
import { setRequestLocale, getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import { SectionHeader } from "@/components/ui/Layout";
import StageHero from "@/components/stages/StageHero";
import GradeCard from "@/components/stages/GradeCard";
import SubjectFeature from "@/components/stages/SubjectFeature";
import SubjectIndex from "@/components/stages/SubjectIndex";
import LearningGames from "@/components/stages/LearningGames";
import GamesRail from "@/components/stages/GamesRail";
import { ArrowLink, LinkCard, TipsCard } from "@/components/stages/parts";
import { StageEmpty, StageJsonLd, StageSection } from "@/components/stages/StageShell";
import { academicYear, flatStageGrades, stageSubjects, termCount } from "@/components/stages/catalog";

export async function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "elementary", path: "/elementary" });
}

// Early grades (الصفوف الأولية) 1–3 and upper grades (الصفوف العليا) 4–6.
const GROUPS = [
  { key: "early", from: 1, to: 3 },
  { key: "upper", from: 4, to: 6 },
];

// Layout note: the app sidebar takes 272px from `lg`, so the content column is
// only ~690px wide at 1024 — multi-column splits start at `xl`, not `lg`.
export default async function ElementaryPage({ params }) {
  setRequestLocale(params.locale);
  const { locale } = params;
  const [t, tn, tc] = await Promise.all([getT("stages"), getT("nav"), getT("common")]);

  const grades = flatStageGrades("elementary");
  const subjects = stageSubjects(grades);
  const byId = Object.fromEntries(subjects.map((s) => [s.id, s]));
  const terms = termCount();

  const crumbs = [{ label: tn("items.curriculum"), href: "/curriculum" }, { label: tn("items.elementary") }];
  const facts = [
    { value: grades.length, label: t("shared.facts.grades", { count: grades.length }) },
    { value: subjects.length, label: t("shared.facts.subjects", { count: subjects.length }) },
    terms > 0 && { value: terms, label: t("shared.facts.terms", { count: terms }) },
  ].filter(Boolean);

  const tools = [
    { key: "curriculum", href: "/curriculum", icon: Library, tone: "green" },
    { key: "assistant", href: "/assistant", icon: Sparkles, badge: t("shared.signInRequired") },
    { key: "achievements", href: "/achievements", icon: Award, tone: "green" },
    { key: "exams", href: "/exams", icon: ClipboardCheck, body: t("elementary.more.examsBody") },
  ];

  return (
    <>
      <StageJsonLd
        locale={locale}
        items={[
          { name: tn("items.curriculum"), path: "/curriculum" },
          { name: tn("items.elementary"), path: "/elementary" },
        ]}
      />

      <StageHero
        locale={locale}
        crumbs={crumbs}
        crumbsLabel={tc("a11y.breadcrumb")}
        year={t("shared.year", { year: academicYear() })}
        eyebrow={t("elementary.hero.eyebrow")}
        title={t("elementary.hero.title")}
        lead={t("elementary.hero.lead")}
        facts={grades.length ? facts : []}
        factsLabel={t("shared.factsLabel")}
        illustration="elementary.classroom"
        actions={
          <>
            <Button href="#grades" variant="primary" size="lg" iconEnd={ArrowDown}>
              {t("elementary.hero.primary")}
            </Button>
            <Button href="#games" variant="secondary" size="lg" iconStart={Puzzle}>
              {t("elementary.hero.secondary")}
            </Button>
          </>
        }
      />

      {/* ── Grades ── */}
      <StageSection id="grades" labelledBy="grades-title">
        <SectionHeader
          id="grades-title"
          eyebrow={t("elementary.grades.eyebrow")}
          title={t("elementary.grades.title")}
          description={t("elementary.grades.lead")}
          actions={<ArrowLink href="/curriculum/elementary">{t("elementary.grades.all")}</ArrowLink>}
        />
        {grades.length === 0 ? (
          <div className="mt-8">
            <StageEmpty t={t} />
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {GROUPS.map((g) => {
              const list = grades.filter((gr) => gr.n >= g.from && gr.n <= g.to);
              if (!list.length) return null;
              return (
                <div key={g.key}>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-ink-2">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    {t(`elementary.grades.groups.${g.key}`)}
                  </h3>
                  <ul className="grid gap-2.5 sm:grid-cols-3 sm:gap-3 xl:gap-4">
                    {list.map((gr) => (
                      <li key={gr.id}>
                        <GradeCard
                          dense
                          as="h4"
                          href={gr.href}
                          badge={gr.n}
                          locale={locale}
                          name={t(`elementary.grades.names.g${gr.n}`)}
                          meta={tc("units.subjects", { count: gr.subjects.length })}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </StageSection>

      {/* ── Subjects ── */}
      {subjects.length > 0 && (
        <StageSection id="subjects" labelledBy="subjects-title">
          <SectionHeader
            id="subjects-title"
            eyebrow={t("elementary.subjects.eyebrow")}
            title={t("elementary.subjects.title")}
            description={t("elementary.subjects.lead")}
          />
          <div className="mt-8 grid gap-4 xl:grid-cols-12 xl:gap-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:col-span-7 xl:gap-5">
              {byId.math && (
                <SubjectFeature grow="art" illustration="elementary.numbers" title={t("elementary.subjects.items.math.title")} body={t("elementary.subjects.items.math.body")} />
              )}
              {byId.science && (
                <SubjectFeature grow="art" illustration="elementary.science" title={t("elementary.subjects.items.science.title")} body={t("elementary.subjects.items.science.body")} />
              )}
            </div>
            <SubjectIndex
              className="xl:col-span-5"
              locale={locale}
              subjects={subjects}
              title={t("elementary.subjects.index.title")}
              note={t("elementary.subjects.index.note")}
              resourcesNote={t("shared.resourcesNote")}
            />
          </div>
        </StageSection>
      )}

      {/* ── Learning games (client island, each game loads on demand) ── */}
      <StageSection id="games" labelledBy="games-title">
        <div className="grid items-end gap-6 xl:grid-cols-12">
          <SectionHeader
            id="games-title"
            className="xl:col-span-8"
            eyebrow={t("elementary.games.eyebrow")}
            title={t("elementary.games.title")}
            description={t("elementary.games.lead")}
          />
          <div className="hidden xl:col-span-4 xl:block">
            <Illustration id="elementary.games" className="-mb-2 ms-auto max-w-[240px]" />
          </div>
        </div>
        <div className="mt-8 grid gap-6 xl:grid-cols-12">
          <div className="min-w-0 xl:col-span-8">
            <Messages ns={["stages"]}>
              <LearningGames />
            </Messages>
          </div>
          <aside className="xl:col-span-4">
            <GamesRail t={t} />
          </aside>
        </div>
      </StageSection>

      {/* ── Keep learning: tools + tips for parents ── */}
      <StageSection id="more" labelledBy="more-title">
        <SectionHeader id="more-title" eyebrow={t("elementary.more.eyebrow")} title={t("elementary.more.title")} />
        <div className="mt-8 grid gap-4 xl:grid-cols-12 xl:gap-5">
          <ul className="grid gap-4 md:grid-cols-2 xl:col-span-8 xl:gap-5">
            {tools.map((it) => (
              <li key={it.key}>
                <LinkCard
                  href={it.href}
                  icon={it.icon}
                  tone={it.tone || "gold"}
                  title={t(`shared.tools.${it.key}.title`)}
                  body={it.body || t(`shared.tools.${it.key}.body`)}
                  badge={it.badge}
                />
              </li>
            ))}
          </ul>
          <TipsCard className="xl:col-span-4" title={t("elementary.tips.title")} items={t.raw("elementary.tips.items") || []} />
        </div>
      </StageSection>
    </>
  );
}
