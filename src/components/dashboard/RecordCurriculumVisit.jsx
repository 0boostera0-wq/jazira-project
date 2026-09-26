"use client";

import { useEffect } from "react";
import { useLocale } from "@/i18n/client";
import { rememberCurriculumVisit } from "./lastVisit";

/**
 * Drop-in for curriculum pages so the dashboard can offer "continue where you
 * left off". Renders nothing; stores the visit on this device only.
 *
 *   <RecordCurriculumVisit path="/curriculum/high-school/first-year" title={node.name} context={trailText} />
 *
 * `path` must be the unprefixed /curriculum/… path (no locale prefix). The
 * current UI language is stored with the title (see lastVisit.js).
 */
export default function RecordCurriculumVisit({ path, title, context }) {
  const { locale } = useLocale();
  useEffect(() => {
    rememberCurriculumVisit({ path, title, context, lang: locale });
  }, [path, title, context, locale]);
  return null;
}
