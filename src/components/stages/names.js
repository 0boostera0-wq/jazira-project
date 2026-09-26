// Catalog name helpers — dependency-free so client components can use them.

const ARABIC = /[؀-ۿ]/;

/** True when the catalog carries a real English name (the catalog falls back to the Arabic one). */
export const hasEnglishName = (node) => Boolean(node?.name_en) && !ARABIC.test(node.name_en);

/**
 * Localised catalog label. English uses `name_en` when the catalog provides a
 * real English rendering; otherwise it falls back to the Arabic name and flags
 * it so the caller can mark it lang="ar" dir="rtl".
 */
export function catalogLabel(node, locale) {
  if (locale === "en" && hasEnglishName(node)) return { text: node.name_en, lang: null };
  return { text: node?.name || "", lang: locale === "en" ? "ar" : null };
}
