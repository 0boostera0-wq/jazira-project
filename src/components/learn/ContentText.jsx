import { scriptOf } from "@/components/community/model";
import { cn } from "@/components/ui/cn";

// Server-safe (no hooks): educational content — lesson, unit, chapter, book and
// scope titles, objectives — rendered inside either UI language (§7). The
// outline carries no language field, so the language comes from the text
// itself: its first strong letter (Arabic → ar/rtl, Latin → en/ltr). An
// English-titled lesson (the English course's units, "Then and Now") is
// therefore never forced right-to-left, and an Arabic title inside the English
// UI keeps its Arabic face and direction. `fallback` covers text with no
// letters at all (digits, symbols): the official listing is Arabic.

/**
 * Block-level content text aligns with the UI, not with its own direction: an
 * English lesson title in an Arabic list starts at the right edge like its
 * neighbours (text-start would follow the element's own dir="ltr").
 */
export const ALIGN_UI = "[html[dir=rtl]_&]:text-right [html[dir=ltr]_&]:text-left";

/** { lang, dir, font } of a run of content text. */
export function contentLang(text, fallback = "ar") {
  const lang = scriptOf(typeof text === "string" ? text : "") || fallback;
  return { lang, dir: lang === "ar" ? "rtl" : "ltr", font: lang === "ar" ? "font-ar" : "font-en" };
}

/** Spread props for an element holding content text: lang, dir and the matching face. */
export function contentProps(text, className, fallback = "ar") {
  const { lang, dir, font } = contentLang(text, fallback);
  return { lang, dir, className: cn(font, className) };
}

/**
 * One content title in the active UI: the English title in the English UI when
 * the listing has one, else the listed title — each marked with its own
 * language. `as` picks the element (span by default; p for block titles).
 */
export default function ContentText({ text, textEn, locale, className, as: Tag = "span" }) {
  const shown = locale === "en" && textEn ? textEn : text ?? "";
  return <Tag {...contentProps(shown, className, shown === textEn && textEn ? "en" : "ar")}>{shown}</Tag>;
}
