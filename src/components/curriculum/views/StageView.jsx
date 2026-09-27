import { getT } from "@/i18n/server";
import { formatDate, formatNumber } from "@/i18n/format";
import { SectionHeader } from "@/components/ui/Layout";
import { cn } from "@/components/ui/cn";
import { SECTION_GAP } from "@/components/stages/parts";
import { SOURCES_CHECKED, YEAR, TERMS } from "@/lib/curriculum";
import NodeHeader from "../NodeHeader";
import GradeCards from "../GradeCards";
import SubjectMatrix from "../SubjectMatrix";
import OfficialChannels from "../OfficialChannels";
import PlanCard from "../PlanCard";
import { compareGrades, newSubjectsByGrade, subjectMatrix, termsStatusOf, totalPeriods } from "../model";
import { OFFICIAL_LINKS, PLAN_URL, breadcrumbs, channelsCopy, nameOf, titleOf } from "../copy";
import { pageList } from "../parts";

// Card footnote when a grade adds no subject (new subjects are listed instead).
const NOTE = { same: "node.sameAsPrev", periods: "node.samePeriodsDiffer" };

const ART = { elementary: "elementary.hero", middle: "middle.hero" };

/** /curriculum/elementary · /curriculum/middle — grades, what changes between them, and the plan. */
export default async function StageView({ slug, node, trail, locale }) {
  const [t, tc] = await Promise.all([getT("curriculum"), getT("common")]);
  const { items: crumbs } = breadcrumbs(t, slug, trail, locale);
  const grades = node.children || [];
  const newBy = newSubjectsByGrade(grades);
  const matrix = subjectMatrix(grades);
  const pages = [...new Set(grades.flatMap((g) => g.plan?.pages || []))].sort((a, b) => a - b);
  // The plan's "terms" row: the split is stated only once every subject's term is backed by evidence.
  const termsStatus = termsStatusOf(grades.flatMap((g) => g.subjects || []));

  const facts = [
    { key: "grades", value: grades.length, label: t("facts.grades", { count: grades.length }) },
    { key: "subjects", value: matrix.rows.length, label: t("facts.subjects", { count: matrix.rows.length }) },
    { key: "terms", value: TERMS.length, label: t("facts.terms", { count: TERMS.length }) },
  ];

  const cards = grades.map((g, i) => {
    const periods = totalPeriods(g);
    const note = i > 0 ? NOTE[compareGrades(grades[i - 1], g)] : null;
    return {
      key: g.id,
      href: `/curriculum/${node.id}/${g.id}`,
      badge: formatNumber(g.n, locale),
      name: nameOf(g, locale),
      meta: `${t("count.subjects", { count: g.subjects.length })} · ${t("count.periods", { count: periods })}`,
      subjects: g.subjects.map((s) => ({ id: s.id, icon: s.icon, color: s.color })),
      newLabel: t("node.newIn"),
      newSubjects: (newBy[g.id] || []).map((s) => ({ id: s.id, name: nameOf(s, locale) })),
      note: note ? t(note) : null,
    };
  });

  return (
    <div className="pb-6">
      <NodeHeader
        crumbs={crumbs}
        crumbsLabel={tc("a11y.breadcrumb")}
        year={t("year", { year: YEAR })}
        eyebrow={t("node.stageEyebrow")}
        title={titleOf(node, locale)}
        lead={t(`node.leads.${node.id}`)}
        facts={facts}
        factsLabel={t("facts.label")}
        locale={locale}
        art={ART[node.id]}
      />

      <section aria-labelledby="grades-title" className={SECTION_GAP}>
        <SectionHeader id="grades-title" title={t("node.grades.title")} description={t("node.grades.lead")} />
        <GradeCards items={cards} className="mt-7" />
      </section>

      <section aria-labelledby="matrix-title" className={cn(SECTION_GAP, "grid gap-6 xl:grid-cols-12 xl:gap-8")}>
        <div className="min-w-0 xl:col-span-8">
          <SectionHeader id="matrix-title" size="h3" title={t("node.matrix.title")} description={t("node.matrix.lead")} />
          <SubjectMatrix
            className="mt-6"
            locale={locale}
            columns={grades.map((g) => ({ key: g.id, label: nameOf(g, locale) }))}
            rows={matrix.rows.map((r) => ({ key: r.id, name: nameOf(r, locale), subject: r, cells: r.cells }))}
            totals={grades.map((g) => totalPeriods(g))}
            copy={{ caption: t("node.matrix.title"), subject: t("node.matrix.subject"), notTaught: t("node.matrix.notTaught"), total: t("plan.total") }}
          />
        </div>
        <aside className="grid content-start gap-4 md:grid-cols-2 xl:col-span-4 xl:grid-cols-1 xl:pt-2">
          <PlanCard
            title={t("plan.stageTitle")}
            titleId="plan-title"
            rows={[
              { label: t("plan.source"), value: t("plan.guide"), wide: true, hint: t("plan.pages", { count: pages.length, pages: pageList(pages, locale) }) },
              { label: t("plan.checked"), value: formatDate(SOURCES_CHECKED, locale) },
              { label: t("plan.terms"), value: t(termsStatus === "unverified" ? "plan.termsValue" : `plan.termsValueKnown.${termsStatus}`), wide: true },
            ]}
            source={{ href: PLAN_URL, label: t("plan.open"), newTab: t("channels.newTab") }}
            note={t("plan.tahfeez")}
          />
          <OfficialChannels titleId="channels-title" links={OFFICIAL_LINKS} copy={channelsCopy(t, { steps: false })} />
        </aside>
      </section>
    </div>
  );
}
