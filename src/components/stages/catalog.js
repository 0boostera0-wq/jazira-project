// Read-only selectors over the curriculum catalog (src/lib/curriculum.js) for
// the /elementary /middle /high-school overview pages. Every count shown on
// those pages is derived here, so the pages can never drift from the catalog.

import { CURRICULUM, ACADEMIC_YEAR, TERMS } from "@/lib/curriculum";

/** "1447هـ" → "1447" (digits only; the suffix comes from the message file). */
export const academicYear = () => String(ACADEMIC_YEAR).replace(/\D/g, "");

const stageNode = (id) => CURRICULUM.find((n) => n.id === id) || null;

/** Minimal, serialisable subject shape (safe to pass to client components). */
const slimSubject = (s) => ({ id: s.id, name: s.name, name_en: s.name_en || null, icon: s.icon, color: s.color || null });

/** Grades of a flat stage (elementary / middle): [{ id, n, href, subjects }]. */
export function flatStageGrades(stageId) {
  const stage = stageNode(stageId);
  if (!stage?.children) return [];
  return stage.children.map((g, i) => ({
    id: g.id,
    n: i + 1,
    href: `/curriculum/${stageId}/${g.id}`,
    subjects: (g.subjects || []).map(slimSubject),
  }));
}

/** Unique subjects across a stage's grades, in catalog order. */
export function stageSubjects(grades) {
  const seen = new Map();
  for (const g of grades) for (const s of g.subjects) if (!seen.has(s.id)) seen.set(s.id, s);
  return [...seen.values()];
}

/**
 * High school: the common first year + the track grades.
 * → { grades: [{ id, n, href, subjects?, tracks? }], tracks: [{ id, icon, subjects, grade2Href, grade3Href }] }
 */
export function highSchoolCatalog() {
  const stage = stageNode("high-school");
  const grades = (stage?.children || []).map((g, i) => {
    const kids = g.children || [];
    const common = kids.length === 1 && kids[0].subjects ? kids[0] : null;
    return {
      id: g.id,
      n: i + 1,
      // A single-child grade (the common first year) links straight to its subjects.
      href: common ? `/curriculum/high-school/${g.id}/${common.id}` : `/curriculum/high-school/${g.id}`,
      subjects: common ? common.subjects.map(slimSubject) : null,
      trackCount: common ? 0 : kids.length,
    };
  });

  const g2 = stage?.children?.find((g) => g.id === "grade-2");
  const g3 = stage?.children?.find((g) => g.id === "grade-3");
  const tracks = (g2?.children || []).map((tr) => ({
    id: tr.id,
    icon: tr.icon,
    name: tr.name,
    name_en: tr.name_en || null,
    subjects: (tr.subjects || []).map(slimSubject),
    grade2Href: `/curriculum/high-school/grade-2/${tr.id}`,
    grade3Href: g3?.children?.some((x) => x.id === tr.id) ? `/curriculum/high-school/grade-3/${tr.id}` : null,
  }));

  return { grades, tracks };
}

/** Terms in the school year (1447H: two semesters). */
export const termCount = () => TERMS.length;
