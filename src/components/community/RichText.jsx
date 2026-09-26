import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ui/cn";
import { normalizeUsername, scriptOf, tokenizePost } from "./model";
import { textProps } from "./text";

/**
 * User text rendered as plain React text (never HTML): #tags → tag pages,
 * @handles → profiles, https links → new tab with nofollow. `dir="auto"` lets
 * an Arabic post read correctly inside the English UI and vice versa; Arabic
 * text keeps its taller Arabic line-height there too.
 */
export default function RichText({ text, className, as: Tag = "p" }) {
  const tokens = tokenizePost(text);
  if (!tokens.length) return null;
  return (
    <Tag {...textProps(text, cn("whitespace-pre-wrap break-words [overflow-wrap:anywhere]", className, scriptOf(text) === "ar" && "[html[lang=en]_&]:!leading-[1.8]"))}>
      {tokens.map((tok, i) => {
        if (tok.t === "tag") {
          return (
            <Link key={i} href={`/tags/${encodeURIComponent(tok.tag)}`} {...textProps(tok.tag, "font-medium text-gold-600 hover:underline hover:underline-offset-4")}>
              {tok.v}
            </Link>
          );
        }
        // Only handles that can exist (3–40 chars) become profile links.
        if (tok.t === "mention" && normalizeUsername(tok.handle)) {
          return (
            <Link key={i} dir="ltr" href={`/u/${encodeURIComponent(tok.handle)}`} className="font-medium text-green-600 hover:underline hover:underline-offset-4">
              {tok.v}
            </Link>
          );
        }
        if (tok.t === "url") {
          return (
            <a key={i} dir="ltr" href={tok.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-gold-600 underline decoration-gold-300 underline-offset-4 hover:decoration-gold-600">
              {tok.v}
            </a>
          );
        }
        return tok.t === "text" ? tok.v : <bdi key={i} dir="ltr">{tok.v}</bdi>;
      })}
    </Tag>
  );
}
