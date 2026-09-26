// ============================================================================
// Curriculum search index — shared, lazily imported, pure.
//
//   const index = await loadCurriculumIndex();          // catalog chunk loads here
//   const hits = rankEntries(index, "رياضيات متوسط");   // [{ entry, score }]
//
// Used by /search (src/components/search). The command palette
// (src/components/shell/CommandPalette.jsx) and the curriculum finder can use
// the same index instead of building their own.
//
// Matching is Arabic-aware (see normalizeText): diacritics and tatweel are
// ignored, alef forms (أ إ آ ٱ) → ا, ة → ه, ى/ئ → ي, ؤ → و, Arabic-Indic
// digits → 0-9, case and Latin accents are ignored. Every query token must
// appear somewhere in the entry; a leading "ال" on a long token is optional
// ("الرياضيات" finds "رياضيات" and vice versa).
//
// No React, no browser APIs, no network: safe on the server, the client and in
// unit tests (tests/unit/search.test.js).
// ============================================================================

// ── normalisation ───────────────────────────────────────────────────────────
// Harakat, tanween, shadda, sukun, superscript alef, Quranic annotation marks,
// tatweel, and Latin combining marks.
const MARK_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u0300-\u036F]/;
const LATIN_MARKS_RE = /[\u0300-\u036F]/g;
const NON_WORD_RE = /[^\p{L}\p{N}]/u;
const FOLD = {
  "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",
  "ة": "ه",
  "ى": "ي", "ئ": "ي", "ی": "ي",
  "ؤ": "و",
  "ک": "ك",
};

/** Folded form of one code point: "" (dropped), " " (separator) or 1+ chars. */
function foldChar(ch) {
  if (MARK_RE.test(ch)) return "";
  const mapped = FOLD[ch];
  if (mapped !== undefined) return mapped;
  const cp = ch.codePointAt(0);
  if (cp >= 0x660 && cp <= 0x669) return String(cp - 0x660); // ٠-٩
  if (cp >= 0x6f0 && cp <= 0x6f9) return String(cp - 0x6f0); // ۰-۹
  if (NON_WORD_RE.test(ch)) return " ";
  return ch.toLowerCase().normalize("NFD").replace(LATIN_MARKS_RE, "");
}

/**
 * Fold `text` and keep, for every output character, the UTF-16 range of the
 * source character it came from — so matches can be highlighted in the
 * original (unnormalised) text. Whitespace is collapsed and trimmed.
 * @returns {{ text: string, start: number[], end: number[] }}
 */
export function foldWithMap(text) {
  const src = String(text ?? "");
  let out = "";
  const start = [];
  const end = [];
  let i = 0;
  for (const ch of src) {
    const f = foldChar(ch);
    const s = i;
    i += ch.length;
    for (const c of f) {
      if (c === " " && (out === "" || out.endsWith(" "))) continue;
      out += c;
      start.push(s);
      end.push(i);
    }
  }
  if (out.endsWith(" ")) {
    out = out.slice(0, -1);
    start.pop();
    end.pop();
  }
  return { text: out, start, end };
}

/** Arabic-aware, case/diacritic-insensitive text for matching. */
export function normalizeText(text) {
  return foldWithMap(text).text;
}

/**
 * Query → tokens. `full` is the folded word, `stem` drops a leading "ال" when
 * at least 3 letters remain. Longest first (highlighting prefers long hits).
 * @returns {{ full: string, stem: string }[]}
 */
export function queryTokens(query) {
  const seen = new Set();
  const out = [];
  for (const full of normalizeText(query).split(" ")) {
    if (!full || seen.has(full)) continue;
    seen.add(full);
    const stem = full.startsWith("ال") && full.length >= 5 ? full.slice(2) : full;
    out.push({ full, stem });
  }
  return out.sort((a, b) => b.full.length - a.full.length);
}

// ── ranking ─────────────────────────────────────────────────────────────────
const KIND_BONUS = { stage: 8, grade: 6, track: 5, page: 4, section: 4, subject: 0, topic: 0 };

/**
 * Rank entries that carry pre-normalised `name` (the entry's own labels) and
 * `hay` (everything it can be found by). Every token must be in `hay`.
 * Ties keep the index order (stages → grades → subjects, in catalog order).
 * @returns {{ entry: object, score: number }[]}
 */
export function rankEntries(entries, query, { limit = Infinity } = {}) {
  const q = normalizeText(query);
  if (q.length < 2 || !Array.isArray(entries)) return [];
  const tokens = queryTokens(q);
  const out = [];
  entries.forEach((entry, order) => {
    const { name = "", hay = "" } = entry;
    if (!tokens.every((t) => hay.includes(t.stem))) return;
    let score = 0;
    if (name === q) score += 100;
    else if (name.startsWith(q)) score += 70;
    else if (name.includes(q)) score += 45;
    for (const t of tokens) {
      if (name.includes(t.full)) score += 14;
      else if (name.includes(t.stem)) score += 12;
      if (` ${name}`.includes(` ${t.stem}`) || ` ${name}`.includes(` ال${t.stem}`)) score += 4;
    }
    score += KIND_BONUS[entry.kind] || 0;
    out.push({ entry, score, order });
  });
  out.sort((a, b) => b.score - a.score || a.order - b.order);
  return (limit === Infinity ? out : out.slice(0, limit)).map(({ entry, score }) => ({ entry, score }));
}

// ── curriculum index ────────────────────────────────────────────────────────
const isLeaf = (n) => Array.isArray(n?.subjects);
const titleAr = (n) => n.title || n.name;
const titleEn = (n) => n.title_en || n.name_en || n.title || n.name;

// stage → grade (elementary/middle grades, high-school years) → track
const nodeKind = (depth) => (depth === 1 ? "stage" : depth === 2 ? "grade" : "track");

/**
 * Flat, searchable list of the curriculum catalog (src/lib/curriculum.js):
 *   { id, kind: "stage"|"grade"|"track"|"subject", href, stage, ar, en,
 *     trailAr, trailEn, icon, color, subjectId, pending, name, hay }
 * `ar`/`en` are display labels; `trail*` is where it sits (e.g. the grade of
 * a subject). Pending programmes are kept (they have an honest page of their
 * own) and flagged `pending: true`.
 */
export function buildCurriculumIndex(curriculum) {
  const out = [];
  const walk = (nodes, path, ancestors) => {
    for (const n of nodes || []) {
      const p = [...path, n.id];
      const href = `/curriculum/${p.map(encodeURIComponent).join("/")}`;
      const stageId = p[0];
      const kind = nodeKind(p.length);
      const numeric = typeof n.n === "number" ? String(n.n) : "";
      // Tracks show their own name; their grade goes in the trail.
      const ar = kind === "track" ? n.name : titleAr(n);
      const en = kind === "track" ? n.name_en || n.name : titleEn(n);
      const trailAr = kind === "stage" ? [] : kind === "track" ? [ancestors[ancestors.length - 1]?.name].filter(Boolean) : [ancestors[0]?.name].filter(Boolean);
      const trailEn = kind === "stage" ? [] : kind === "track" ? [ancestors[ancestors.length - 1]?.name_en].filter(Boolean) : [ancestors[0]?.name_en].filter(Boolean);
      const ancestry = ancestors.flatMap((a) => [a.name, a.name_en, a.title, a.title_en]);
      out.push({
        id: href,
        kind,
        href,
        stage: stageId,
        ar,
        en,
        trailAr,
        trailEn,
        icon: n.icon || "grade",
        color: null,
        subjectId: null,
        pending: Boolean(n.pending),
        name: normalizeText(`${n.name} ${n.name_en || ""} ${n.title || ""} ${n.title_en || ""}`),
        hay: normalizeText(`${n.name} ${n.name_en || ""} ${n.title || ""} ${n.title_en || ""} ${n.sub || ""} ${n.sub_en || ""} ${numeric} ${ancestry.join(" ")}`),
      });
      if (isLeaf(n)) {
        const leafAr = kind === "track" ? `${n.name} · ${ancestors[ancestors.length - 1]?.name || ""}` : titleAr(n);
        const leafEn = kind === "track" ? `${n.name_en || n.name} · ${ancestors[ancestors.length - 1]?.name_en || ""}` : titleEn(n);
        for (const s of n.subjects) {
          out.push({
            id: `${href}#${s.id}`,
            kind: "subject",
            href: `${href}?subject=${encodeURIComponent(s.id)}`,
            stage: stageId,
            ar: s.name,
            en: s.name_en || s.name,
            trailAr: [leafAr],
            trailEn: [leafEn],
            icon: s.icon,
            color: s.color || null,
            subjectId: s.id,
            pending: false,
            name: normalizeText(`${s.name} ${s.name_en || ""} ${(s.labels || []).join(" ")} ${(s.labels_en || []).join(" ")}`),
            hay: normalizeText(
              `${s.name} ${s.name_en || ""} ${(s.labels || []).join(" ")} ${(s.labels_en || []).join(" ")} ` +
                `${n.name} ${n.name_en || ""} ${n.title || ""} ${n.title_en || ""} ${numeric} ${ancestry.join(" ")}`
            ),
          });
        }
      }
      if (n.children) walk(n.children, p, [...ancestors, n]);
    }
  };
  walk(curriculum, [], []);
  return out;
}

/** Ranked curriculum matches (entries only). */
export function searchCurriculum(index, query, opts) {
  return rankEntries(index, query, opts).map((h) => h.entry);
}

let indexPromise = null;
/** The catalog is imported (as its own chunk) the first time this is called. */
export function loadCurriculumIndex() {
  if (!indexPromise) {
    indexPromise = import("@/lib/curriculum")
      .then((m) => buildCurriculumIndex(m.CURRICULUM))
      .catch((e) => {
        indexPromise = null;
        throw e;
      });
  }
  return indexPromise;
}
