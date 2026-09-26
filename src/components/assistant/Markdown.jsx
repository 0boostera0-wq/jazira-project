"use client";

import { memo, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useT } from "@/i18n/client";
import { cn } from "@/components/ui/cn";
import { textProps } from "@/components/community/text";
import { parseMarkdown, textDirection } from "./markdown-parser";

/** Plain text of inline nodes (to tag each block with its own language). */
function textOf(nodes) {
  let out = "";
  for (const n of nodes || []) {
    if (n.type === "text" || n.type === "code") out += n.text || "";
    else if (n.children) out += textOf(n.children);
    if (out.length > 200) break; // the first strong letter decides
  }
  return out;
}

/** lang + dir="auto" + font for one block (an Arabic paragraph in an English reply, or the reverse). */
const blockProps = (nodes, className) => textProps(textOf(nodes), className);

/**
 * Renders an assistant reply from the safe Markdown subset (./markdown-parser.js).
 * React elements only; internal links use the locale-aware Link. Every text
 * block is dir="auto" and the reply takes the direction of its first letter,
 * so an Arabic answer in the English UI (or the other way round) — lists and
 * quotes included — still reads naturally.
 */
function Markdown({ text, streaming = false, className }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  const dir = useMemo(() => textDirection(text), [text]);
  return (
    <div dir={dir} lang={dir === "rtl" ? "ar" : dir === "ltr" ? "en" : undefined} className={cn("jz-md break-words text-[0.98rem] leading-[1.85] text-ink-2", className)}>
      {blocks.map((b, i) => (
        <Block key={i} block={b} caret={streaming && i === blocks.length - 1} />
      ))}
      {streaming && blocks.length === 0 && <Caret />}
    </div>
  );
}

export default memo(Markdown);

function Caret() {
  return <span aria-hidden="true" className="ms-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] rounded-full bg-gold-500" style={{ animation: "jz-pulse-soft 1s ease-in-out infinite" }} />;
}

function Block({ block, caret }) {
  switch (block.type) {
    case "p":
      return (
        <p {...blockProps(block.children, "my-3 first:mt-0 last:mb-0")}>
          <Inline nodes={block.children} />
          {caret && <Caret />}
        </p>
      );
    case "h":
      return (
        <p {...blockProps(block.children, "mb-2 mt-5 font-bold text-ink first:mt-0")}>
          <Inline nodes={block.children} />
          {caret && <Caret />}
        </p>
      );
    case "quote":
      return (
        <blockquote {...blockProps(block.children, "my-3 border-s-2 border-gold-300 ps-4 text-ink-3 first:mt-0 last:mb-0")}>
          <Inline nodes={block.children} />
          {caret && <Caret />}
        </blockquote>
      );
    case "hr":
      return <hr className="my-5 border-line/15" />;
    case "code":
      return <CodeBlock lang={block.lang} code={block.text} open={block.open} />;
    case "ul":
    case "ol":
      return <List block={block} caret={caret} />;
    default:
      return null;
  }
}

function List({ block, caret, nested = false }) {
  const Tag = block.type === "ol" ? "ol" : "ul";
  return (
    <Tag
      start={block.type === "ol" && block.start > 1 ? block.start : undefined}
      className={cn(
        "space-y-1.5 ps-6 marker:text-gold-600",
        block.type === "ol" ? "list-decimal marker:font-medium" : "list-disc",
        nested ? "mt-1.5" : "my-3 first:mt-0 last:mb-0"
      )}
    >
      {block.items.map((item, i) => (
        <li key={i} {...blockProps(item.children, "ps-1")}>
          <Inline nodes={item.children} />
          {item.sub && <List block={item.sub} nested />}
          {caret && i === block.items.length - 1 && !item.sub && <Caret />}
        </li>
      ))}
    </Tag>
  );
}

function Inline({ nodes }) {
  return nodes.map((n, i) => {
    switch (n.type) {
      case "text":
        return <span key={i}>{n.text}</span>;
      case "br":
        return <br key={i} />;
      case "strong":
        return <strong key={i} className="font-bold text-ink"><Inline nodes={n.children} /></strong>;
      case "em":
        return <em key={i}><Inline nodes={n.children} /></em>;
      case "span":
        return <span key={i}><Inline nodes={n.children} /></span>;
      case "code":
        return (
          <code key={i} dir="ltr" className="ltr rounded-xs border border-line/10 bg-surface-2 px-1.5 py-0.5 font-mono text-[0.86em] text-ink">
            {n.text}
          </code>
        );
      case "link":
        return (
          <Link key={i} href={n.href} className="font-medium text-gold-600 underline decoration-gold-300 underline-offset-4 transition-colors hover:text-gold-700 hover:decoration-gold-500">
            <Inline nodes={n.children} />
          </Link>
        );
      default:
        return null;
    }
  });
}

function CodeBlock({ lang, code, open }) {
  const t = useT("assistant");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };
  return (
    <div className="my-3 overflow-hidden rounded-md border border-line/15 bg-surface-2/70 first:mt-0 last:mb-0">
      <div className="flex items-center justify-between gap-2 border-b border-line/10 px-3 py-1.5">
        <span className="ltr font-mono text-xs text-ink-3">{lang || t("message.code")}</span>
        {!open && (
          <button type="button" onClick={copy} className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium text-ink-3 transition-colors hover:bg-surface-3/60 hover:text-ink">
            {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
            {copied ? t("message.copied") : t("message.copyCode")}
          </button>
        )}
      </div>
      <pre dir="ltr" className="max-h-[420px] overflow-auto px-4 py-3 text-start font-mono text-[13px] leading-6 text-ink">
        <code>{code}</code>
      </pre>
    </div>
  );
}
