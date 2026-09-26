// Server-only data for /search, derived from the catalogs (never hand-typed):
// curriculum stage summaries, the practice catalog with labels in BOTH
// locales (so either language finds a topic), and scope numbers.
import { CURRICULUM, curriculumStats } from "@/lib/curriculum";
import { EXAMS, SECTIONS } from "@/lib/exams/catalog";
import { getT } from "@/i18n/server";

export const STAGE_ART = {
  elementary: "elementary.classroom",
  middle: "middle.study-plan",
  "high-school": "high-school.hero",
};

/** Stages that have content: { id, name, sub, grades, subjects, href } in `locale`. */
export function stageSummaries(locale) {
  return CURRICULUM.filter((s) => !s.pending).map((s) => {
    const names = new Set();
    const walk = (nodes) => {
      for (const n of nodes || []) {
        for (const sub of n.subjects || []) names.add(sub.name);
        walk(n.children);
      }
    };
    walk(s.children);
    return {
      id: s.id,
      href: `/curriculum/${s.id}`,
      name: locale === "en" ? s.name_en || s.name : s.name,
      sub: locale === "en" ? s.sub_en || s.sub : s.sub,
      grades: (s.children || []).length,
      subjects: names.size,
    };
  });
}

export const scopeStats = () => curriculumStats();

/**
 * { types: { aptitude: { ar, en } }, sections: [{ id, exam, ar, en, topics }], topics: [{ id, section, exam, ar, en }] }
 */
export async function practiceCatalog() {
  const [ar, en] = await Promise.all([getT("exams", "ar"), getT("exams", "en")]);
  const label = (key, fallback) => ({ ar: ar.has(key) ? ar(key) : fallback, en: en.has(key) ? en(key) : fallback });
  const types = Object.fromEntries(Object.keys(EXAMS).map((exam) => [exam, label(`types.${exam}`, exam)]));
  const sections = [];
  const topics = [];
  for (const exam of Object.keys(EXAMS)) {
    for (const id of EXAMS[exam].sections) {
      const def = SECTIONS[id];
      sections.push({ id, exam, ...label(`sections.${id}`, id), topics: def.topics.length });
      for (const tp of def.topics) topics.push({ id: tp, section: id, exam, ...label(`topics.${tp}`, tp) });
    }
  }
  return { types, sections, topics };
}
