// Catalog subject icon id → lucide glyph, for the stage pages. The map itself
// is curriculum/subjectGlyphs.js (the one subject map of the app), so a
// subject gets the same glyph on /elementary…/high-school, /curriculum and
// /exams. Dependency-light: no catalog import.

import { subjectGlyph } from "@/components/curriculum/subjectGlyphs";

/** Catalog subject icon id → lucide glyph (static, no motion). */
export const subjectIcon = (icon) => subjectGlyph({ icon });
