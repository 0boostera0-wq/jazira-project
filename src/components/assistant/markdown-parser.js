// ============================================================================
// Safe, lightweight Markdown subset for assistant replies.
//
// Parses text into a plain data tree that <Markdown> renders with React
// elements only — never an HTML string, never dangerouslySetInnerHTML.
//
//   blocks:  p · ul/ol (one nested level) · code (fenced) · quote · h · hr
//   inline:  text · br · strong (**x** / __x__) · em (*x*) · code (`x`) ·
//            link — ONLY internal app paths ([text](/exams)); any other link
//            keeps its text and drops the URL.
// Anything else (tables, HTML, images) stays literal text. Streaming-safe: an
// unclosed code fence becomes an open code block, unclosed markers stay text.
// ============================================================================

// First path segment of pages a reply may link to.
const INTERNAL_ROOTS = new Set([
  "exams", "curriculum", "elementary", "middle", "high-school", "community", "competitions",
  "subscriptions", "settings", "assistant", "achievements", "dashboard", "support", "faq",
  "contact", "about", "notifications", "chat", "profile", "search", "reviews", "privacy",
  "terms", "u", "tags",
]);

const HREF_RE = /^\/(?!\/)[A-Za-z0-9\-._~/]*(?:\?[A-Za-z0-9\-._~=&%+]*)?(?:#[A-Za-z0-9\-_]*)?$/;

/** "/exams/aptitude" → same string; anything that isn't a known in-app path → null. */
export function safeInternalHref(href) {
  if (typeof href !== "string") return null;
  const h = href.trim();
  if (h.length > 200 || !HREF_RE.test(h)) return null;
  const path = h.split(/[?#]/)[0];
  if (path.includes("..") || path.includes("//")) return null;
  if (path === "/") return "/";
  const root = path.split("/")[1];
  return INTERNAL_ROOTS.has(root) ? h : null;
}

const MAX_DEPTH = 4;
const isSpace = (c) => c === undefined || /\s/.test(c);
const isWordChar = (c) => c !== undefined && /[\p{L}\p{N}_]/u.test(c);

function pushText(out, text) {
  if (!text) return;
  const parts = text.split("\n");
  parts.forEach((part, i) => {
    if (i > 0) out.push({ type: "br" });
    if (part) {
      const prev = out[out.length - 1];
      if (prev && prev.type === "text") prev.text += part;
      else out.push({ type: "text", text: part });
    }
  });
}

/** Inline Markdown → nodes. */
export function parseInline(text, depth = 0) {
  const src = String(text ?? "");
  const out = [];
  if (depth > MAX_DEPTH) {
    pushText(out, src);
    return out;
  }
  let buf = "";
  const flush = () => {
    pushText(out, buf);
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    // `code`
    if (ch === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i + 1 && !src.slice(i + 1, end).includes("\n")) {
        flush();
        out.push({ type: "code", text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // **strong** / __strong__
    if ((ch === "*" || ch === "_") && src[i + 1] === ch) {
      const marker = ch + ch;
      const end = src.indexOf(marker, i + 2);
      if (end > i + 2 && !isSpace(src[i + 2]) && !isSpace(src[end - 1])) {
        flush();
        out.push({ type: "strong", children: parseInline(src.slice(i + 2, end), depth + 1) });
        i = end + 2;
        continue;
      }
    }

    // *em*
    if (ch === "*" && src[i + 1] !== "*" && !isWordChar(src[i - 1]) && src[i - 1] !== "*" && !isSpace(src[i + 1])) {
      let end = -1;
      for (let j = i + 1; j < src.length && src[j] !== "\n"; j++) {
        if (src[j] === "*" && src[j + 1] !== "*" && src[j - 1] !== "*" && !isSpace(src[j - 1]) && !isWordChar(src[j + 1])) {
          end = j;
          break;
        }
      }
      if (end > i + 1) {
        flush();
        out.push({ type: "em", children: parseInline(src.slice(i + 1, end), depth + 1) });
        i = end + 1;
        continue;
      }
    }

    // [label](href)
    if (ch === "[") {
      const close = src.indexOf("]", i + 1);
      if (close > i + 1 && src[close + 1] === "(") {
        const end = src.indexOf(")", close + 2);
        const label = src.slice(i + 1, close);
        const href = end > close + 1 ? src.slice(close + 2, end).trim() : "";
        if (end > close + 1 && !label.includes("\n") && href && !/\s/.test(href)) {
          flush();
          const safe = safeInternalHref(href);
          const children = parseInline(label, depth + 1);
          out.push(safe ? { type: "link", href: safe, children } : { type: "span", children });
          i = end + 1;
          continue;
        }
      }
    }

    buf += ch;
    i++;
  }
  flush();
  return out;
}

const LIST_RE = /^(\s*)([-*+•]|[0-9٠-٩]{1,3}[.)])\s+(.*)$/;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const HR_RE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const HEADING_RE = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const QUOTE_RE = /^\s{0,3}>\s?/;

const toNumber = (s) => Number(String(s).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)));
const isOrderedMarker = (m) => /^[0-9٠-٩]/.test(m);

function parseList(lines, start) {
  const first = LIST_RE.exec(lines[start]);
  const ordered = isOrderedMarker(first[2]);
  const baseIndent = first[1].length;
  const list = { type: ordered ? "ol" : "ul", start: ordered ? toNumber(first[2].slice(0, -1)) || 1 : undefined, items: [] };
  let i = start;
  let current = null; // { lines: [], sub: null }
  let sub = null; // { ordered, items: [{ lines }] }

  const finishSub = () => {
    if (sub && current) current.sub = sub;
    sub = null;
  };

  while (i < lines.length) {
    const line = lines[i];
    const m = LIST_RE.exec(line);
    if (m) {
      const indent = m[1].length;
      if (indent > baseIndent + 1 && current) {
        const subOrdered = isOrderedMarker(m[2]);
        if (!sub) sub = { type: subOrdered ? "ol" : "ul", items: [] };
        sub.items.push({ lines: [m[3]] });
        i++;
        continue;
      }
      if (isOrderedMarker(m[2]) !== ordered) break; // a different list starts
      finishSub();
      current = { lines: [m[3]], sub: null };
      list.items.push(current);
      i++;
      continue;
    }
    if (/^\s*$/.test(line)) {
      // blank line: the list continues only if the next content line is an item
      let j = i + 1;
      while (j < lines.length && /^\s*$/.test(lines[j])) j++;
      const next = j < lines.length ? LIST_RE.exec(lines[j]) : null;
      if (next && (next[1].length > baseIndent + 1 || isOrderedMarker(next[2]) === ordered)) {
        i = j;
        continue;
      }
      break;
    }
    // indented continuation of the current item (or its last sub item)
    if (/^\s{2,}\S/.test(line) && current) {
      const target = sub ? sub.items[sub.items.length - 1] : current;
      target.lines.push(line.trim());
      i++;
      continue;
    }
    break;
  }
  finishSub();
  list.items = list.items.map((it) => ({
    children: parseInline(it.lines.join("\n")),
    sub: it.sub ? { type: it.sub.type, items: it.sub.items.map((s) => ({ children: parseInline(s.lines.join("\n")) })) } : null,
  }));
  return { block: list, next: i };
}

/** Markdown text → block nodes. */
export function parseMarkdown(input) {
  const lines = String(input ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let para = [];
  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", children: parseInline(para.join("\n")) });
    para = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const fence = FENCE_RE.exec(line);
    if (fence) {
      flushPara();
      const marker = fence[1][0];
      const size = fence[1].length;
      const body = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        const close = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(lines[i]);
        if (close && close[1][0] === marker && close[1].length >= size) {
          closed = true;
          i++;
          break;
        }
        body.push(lines[i]);
        i++;
      }
      blocks.push({ type: "code", lang: fence[2] || "", text: body.join("\n"), open: !closed });
      continue;
    }

    if (/^\s*$/.test(line)) {
      flushPara();
      i++;
      continue;
    }
    if (HR_RE.test(line)) {
      flushPara();
      blocks.push({ type: "hr" });
      i++;
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushPara();
      blocks.push({ type: "h", children: parseInline(heading[1]) });
      i++;
      continue;
    }
    if (QUOTE_RE.test(line)) {
      flushPara();
      const body = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        body.push(lines[i].replace(QUOTE_RE, ""));
        i++;
      }
      blocks.push({ type: "quote", children: parseInline(body.join("\n")) });
      continue;
    }
    if (LIST_RE.test(line)) {
      flushPara();
      const { block, next } = parseList(lines, i);
      blocks.push(block);
      i = next;
      continue;
    }
    para.push(line);
    i++;
  }
  flushPara();
  return blocks;
}

/** Plain text of inline nodes (for copy / accessible labels). */
export function inlineText(nodes) {
  return (nodes || []).map((n) => (n.type === "text" || n.type === "code" ? n.text : n.type === "br" ? "\n" : inlineText(n.children))).join("");
}

/** Base direction from the first strongly-directional letter ("rtl" | "ltr" | undefined). */
export function textDirection(text) {
  const m = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]|[֐-ࣿיִ-﷿ﹰ-﻿]/.exec(String(text ?? ""));
  if (!m) return undefined;
  return /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(m[0]) ? "rtl" : "ltr";
}
