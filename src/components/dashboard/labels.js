// Label helpers for exam vocabulary. `t` is a `dashboard` translator (server
// getT or client useT). Unknown slugs fall back to a neutral label instead of
// leaking a raw key.

export function examName(t, exam) {
  return exam && t.has(`exam.types.${exam}`) ? t(`exam.types.${exam}`) : "";
}

export function sectionName(t, section) {
  return section && t.has(`exam.sections.${section}`) ? t(`exam.sections.${section}`) : t("exam.mixed");
}

/** "القدرات · الكمي" / "Qudurat · Quantitative" (mixed attempts → "all sections"). */
export function attemptTitle(t, exam, section) {
  const e = examName(t, exam);
  const s = sectionName(t, section);
  return e ? t("exam.title", { exam: e, section: s }) : s;
}

export function topicName(t, topic) {
  return topic && t.has(`exam.topics.${topic}`) ? t(`exam.topics.${topic}`) : "";
}
