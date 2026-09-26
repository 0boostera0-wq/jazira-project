// Curated starter topics and composer prompts. The `tag` values are the
// canonical hashtags (community content is Arabic-first, so the tag is the
// same in both UI languages and every post lands on one tag page). Labels
// live in the `community` namespace: topics.<id> / composer.kinds.<id>.
import { BookMarked, HelpCircle, Lightbulb, Trophy } from "lucide-react";

/** Composer prompts — each one adds its tag when the post is published. */
export const POST_KINDS = [
  { id: "question", tag: "سؤال", icon: HelpCircle },
  { id: "win", tag: "إنجاز", icon: Trophy },
  { id: "resource", tag: "مصدر", icon: BookMarked },
  { id: "tip", tag: "نصيحة", icon: Lightbulb },
];

/** Subjects and exams students most often talk about. */
export const STARTER_TOPICS = [
  { id: "qudurat", tag: "القدرات" },
  { id: "tahsili", tag: "التحصيلي" },
  { id: "math", tag: "رياضيات" },
  { id: "physics", tag: "فيزياء" },
  { id: "chemistry", tag: "كيمياء" },
  { id: "biology", tag: "أحياء" },
  { id: "english", tag: "إنجليزي" },
  { id: "studying", tag: "مذاكرة" },
];

const BY_TAG = new Map([...POST_KINDS, ...STARTER_TOPICS].map((x) => [x.tag, x]));

/** Curated entry for a tag (for a translated label), or null. */
export const curatedFor = (tag) => BY_TAG.get(tag) || null;

/**
 * How to show a tag in lists: Arabic UI shows the tag itself; English UI shows
 * the translated name of a curated tag (other tags are community content and
 * stay as written).
 */
export function tagLabel(t, tag, locale) {
  const c = curatedFor(tag);
  if (!c || locale === "ar") return tag;
  return POST_KINDS.includes(c) ? t(`filters.kinds.${c.id}`) : t(`topics.${c.id}`);
}

/**
 * The same, for use inside a sentence: "#tag", or the translated name of a
 * curated tag in English. Wrapped in Unicode isolates (FSI…PDI) so an Arabic
 * tag inside English text (and a Latin tag inside Arabic) keeps its "#" on
 * the correct side.
 */
export function tagInline(t, tag, locale) {
  const c = curatedFor(tag);
  return `⁨${c && locale !== "ar" ? tagLabel(t, tag, locale) : `#${tag}`}⁩`;
}
