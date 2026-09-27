// ============================================================================
// The content cache (docs/CONTENT_ENGINE.md §3): one layout shared by every
// tool, OUTSIDE the repo. Textbook PDFs, page text, page renders, vision
// transcripts and evidence quotes live here and are never committed.
//
//   root: $CONTENT_CACHE_DIR or C:/jazira/content-cache
//   ien/api/                       crawler response cache           (ien-crawl)
//   ien/pdf/<file>.pdf             the only PDF store               (fetch-queue ensurePdf)
//   ien/text/<stem>/pNNN.txt       raw text-layer page text         (pdf-frontmatter, extract-pdf)
//   ien/pages/<stem>/pNNN.jpg      1100 px page renders             (pdf-render)
//   extract/<resource>/pages.jsonl repaired text + vision transcripts (extract-pdf, vision)
//   evidence/<shard>.jsonl         evidence quote sidecar           (ingest-candidates)
//   fetch/queue.jsonl              the persisted fetch queue        (fetch-queue)
//   packets/<run>/, llm/<run>/, import/<target>/
//
// Every name is sanitized and every path is resolved and verified to stay
// under the cache root before use. API-supplied PDF names must match
// ^[A-Za-z0-9._-]+\.pdf$ (case-insensitive extension); anything else makes
// the resource `needs_review` (the caller decides) and throws here.
// ============================================================================

import { isAbsolute, relative, resolve, sep } from "node:path";

export const DEFAULT_CACHE_DIR = "C:/jazira/content-cache";

export class CachePathError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "CachePathError";
    this.code = code;
  }
}

/** Cache root (absolute, resolved). */
export function cacheRoot(env = process.env) {
  return resolve(env.CONTENT_CACHE_DIR || DEFAULT_CACHE_DIR);
}

// Windows reserved device names (with or without an extension).
const RESERVED = /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)(?:\..*)?$/i;
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

/** A single safe path segment (no separators, no traversal, no device names). */
export function safeSegment(name, what = "segment") {
  const s = String(name ?? "");
  if (!s || s.length > 180 || !SAFE_NAME.test(s) || s === "." || s === ".." || s.startsWith(".") || s.endsWith(".") || RESERVED.test(s)) {
    throw new CachePathError("unsafe_name", `${what} ${JSON.stringify(s)}`);
  }
  return s;
}

/** Validate an API-supplied PDF file name (e.g. "1448-GE-ME-K07-SM1-math-part1.pdf"). */
export function safePdfName(name) {
  const s = String(name ?? "");
  if (!/^[A-Za-z0-9._-]+\.pdf$/i.test(s)) throw new CachePathError("unsafe_pdf_name", JSON.stringify(s));
  return safeSegment(s, "pdf name");
}

export const isSafePdfName = (name) => {
  try {
    safePdfName(name);
    return true;
  } catch {
    return false;
  }
};

/** File stem of a PDF name: the name without its `.pdf` extension. */
export const pdfStem = (name) => safePdfName(name).replace(/\.pdf$/i, "");

/** pNNN (1-based; 4 digits above 999). */
export function pageName(page) {
  if (!Number.isInteger(page) || page < 1 || page > 99999) throw new CachePathError("bad_page", String(page));
  return `p${String(page).padStart(3, "0")}`;
}

/**
 * Resolve segments under the cache root and verify containment (after
 * normalization, case-insensitively on Windows).
 */
export function resolveInCache(root, ...segments) {
  const base = resolve(root);
  for (const s of segments) {
    if (typeof s !== "string" || !s || isAbsolute(s) || s.includes("\0")) throw new CachePathError("unsafe_path", String(s));
  }
  const target = resolve(base, ...segments);
  const rel = relative(base, target);
  const outside = rel === "" ? false : rel.split(sep)[0] === ".." || isAbsolute(rel);
  const caseCheck = process.platform === "win32" ? !target.toLowerCase().startsWith(base.toLowerCase()) : !target.startsWith(base);
  if (outside || caseCheck) throw new CachePathError("outside_cache", target);
  return target;
}

/** Path helpers bound to one cache root (default: cacheRoot()). */
export function cachePaths(root = cacheRoot()) {
  const at = (...s) => resolveInCache(root, ...s);
  return {
    root: resolve(root),
    ienApiDir: () => at("ien", "api"),
    pdf: (fileName) => at("ien", "pdf", safePdfName(fileName)),
    textDir: (fileName) => at("ien", "text", pdfStem(fileName)),
    textPage: (fileName, page) => at("ien", "text", pdfStem(fileName), `${pageName(page)}.txt`),
    pagesDir: (fileName) => at("ien", "pages", pdfStem(fileName)),
    pageImage: (fileName, page) => at("ien", "pages", pdfStem(fileName), `${pageName(page)}.jpg`),
    extractPages: (resourceId) => at("extract", safeSegment(resourceId, "resource id"), "pages.jsonl"),
    evidence: (shard) => at("evidence", `${safeSegment(shard, "evidence shard")}.jsonl`),
    fetchQueue: () => at("fetch", "queue.jsonl"),
    fetchDir: () => at("fetch"),
    packetsDir: (runId) => at("packets", safeSegment(runId, "run id")),
    llmDir: (runId) => at("llm", safeSegment(runId, "run id")),
    importDir: (target) => at("import", safeSegment(target, "import target")),
  };
}

/**
 * Evidence sidecar shard for a question id: the same shard name for every
 * question of a subject (`q-m1-math-…` → `q-m1-math`), legacy keys by prefix.
 */
export function evidenceShard(questionId) {
  const m = /^([qtv]-[a-z0-9]+-[a-z0-9-]+?)-[0-9a-f]{10}(?:-\d{2})?$/.exec(questionId);
  if (m) return m[1];
  const legacy = /^([a-z]{2})-\d+$/.exec(questionId);
  if (legacy) return `legacy-${legacy[1]}`;
  throw new CachePathError("bad_question_id", questionId);
}

/** True when `path` lies inside the repository (used to refuse cache writes into the repo). */
export function isInside(parent, path) {
  const rel = relative(resolve(parent), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
