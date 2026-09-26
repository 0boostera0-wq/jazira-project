import { cn } from "@/components/ui/cn";
import { scriptOf } from "./model";

/**
 * Attributes for a run of member-written text (posts, comments, names, bios):
 * `lang` + `dir="auto"` + the matching font, so Arabic content inside the
 * English UI (and English inside the Arabic UI) renders in the right face
 * and direction.
 *   <p {...textProps(post.content, "t-body")}>
 */
export function textProps(text, className) {
  const lang = scriptOf(text) || undefined;
  return {
    lang,
    dir: "auto",
    className: cn(className, lang === "ar" ? "font-ar" : lang === "en" ? "font-en" : null),
  };
}
