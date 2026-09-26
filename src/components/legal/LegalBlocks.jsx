import { Info } from "lucide-react";
import { Link } from "@/i18n/navigation";

// Renders legal document bodies from the `legal` message files.
//   "text"            → <p>
//   ["a", "b"]        → <ul>
//   { note: "text" }  → highlighted note
// Inline markup (our own static copy only — never user content):
//   **bold**   [label](/internal/path#anchor)   [label](#anchor)   [label](https://…)

const TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;
const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

export function Inline({ text }) {
  return String(text)
    .split(TOKEN)
    .map((part, i) => {
      if (!part) return null;
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
      const m = part.match(LINK);
      if (!m) return part;
      const [, label, href] = m;
      if (href.startsWith("/")) return <Link key={i} href={href}>{label}</Link>;
      if (href.startsWith("#")) return <a key={i} href={href}>{label}</a>;
      if (href.startsWith("https://")) {
        return <a key={i} href={href} target="_blank" rel="noopener noreferrer">{label}</a>;
      }
      return label;
    });
}

export default function LegalBlocks({ blocks = [] }) {
  return blocks.map((b, i) => {
    if (Array.isArray(b)) {
      return (
        <ul key={i} className="marker:text-gold-500">
          {b.map((li, j) => (
            <li key={j} className="ps-1">
              <Inline text={li} />
            </li>
          ))}
        </ul>
      );
    }
    if (b && typeof b === "object" && b.note) {
      return (
        <p key={i} className="flex gap-3 rounded-md border border-gold-200/60 bg-gold-50 px-4 py-3.5 text-[0.9375rem] text-ink-2">
          <Info size={18} aria-hidden="true" className="mt-[0.3em] shrink-0 text-gold-600" />
          <span>
            <Inline text={b.note} />
          </span>
        </p>
      );
    }
    return (
      <p key={i}>
        <Inline text={b} />
      </p>
    );
  });
}

/** Plain text of a block list (markup stripped) — used for reading-time estimates. */
export function blocksText(blocks = []) {
  return blocks
    .flatMap((b) => (Array.isArray(b) ? b : b && typeof b === "object" ? [b.note || ""] : [b]))
    .join(" ")
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}
