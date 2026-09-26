// Label + icon helpers shared by the exam components (server and client).
import { Brain, FlaskConical } from "lucide-react";
import { EXAMS, SECTIONS } from "@/lib/exams/catalog";
import { subjectGlyph } from "@/components/curriculum/subjectGlyphs";

const EXAM_ICONS = { Brain, FlaskConical };

export const examIcon = (exam) => EXAM_ICONS[EXAMS[exam]?.icon] || Brain;
/** A section's glyph comes from the app's one subject map (Tahsili sections are school subjects). */
export const sectionIcon = (section) => (SECTIONS[section] ? subjectGlyph({ id: section }) : Brain);
export const sectionColor = (section) => SECTIONS[section]?.color;

/** "القسم الكمي" / mixed label of the exam when section is null. */
export const sectionLabel = (t, exam, section) => (section ? t(`sections.${section}`) : t(`mixed.${exam}`));

/** Topic label; falls back to the slug for a topic the catalog doesn't know yet. */
export const topicLabel = (t, topic) => (topic && t.has(`topics.${topic}`) ? t(`topics.${topic}`) : topic || "");

export const difficultyLabel = (t, d) => t(`difficulty.${d || "any"}`);

/** Choice letter for a 0-based index (أ ب ج د / A B C D). */
export function choiceLabel(t, index) {
  const labels = t.raw("choiceLabels");
  return Array.isArray(labels) && labels[index] ? labels[index] : String(index + 1);
}

/** Total topics of an exam (catalog). */
export const topicCount = (exam) => (EXAMS[exam]?.sections || []).reduce((n, s) => n + (SECTIONS[s]?.topics.length || 0), 0);
export const allTopicCount = () => Object.keys(EXAMS).reduce((n, e) => n + topicCount(e), 0);
export const allSectionCount = () => Object.values(EXAMS).reduce((n, e) => n + e.sections.length, 0);

/** Sign-in href that returns to `path` afterwards. */
export const signInHref = (path, page = "/sign-in") => `${page}?next=${encodeURIComponent(path)}`;
