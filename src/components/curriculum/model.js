// Pure helpers for the curriculum UI (no React, no catalog import — callers
// pass the catalog in, so client islands can lazy-load it). Unit-tested in
// tests/unit/curriculum.test.js.

/** Case/diacritic-insensitive text for matching Arabic and English. */
export function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[ً-ٰٟـ]/g, "") // tashkeel, superscript alef, tatweel
    .replace(/[̀-ͯ]/g, "") // Latin combining marks
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const isLeaf = (n) => Array.isArray(n?.subjects);

/**
 * Flat search index over the catalog:
 *   { kind: "node" | "subject", key, stage, href, ar, en, trailAr, trailEn, icon, color, subjectId, hay, name }
 * Pending programmes are skipped (they have no content).
 */
export function buildIndex(curriculum) {
  const out = [];
  const walk = (nodes, path, trail) => {
    for (const n of nodes) {
      if (n.pending) continue;
      const p = [...path, n.id];
      const href = `/curriculum/${p.join("/")}`;
      const tr = [...trail, n];
      const trailAr = trail.map((x) => x.name);
      const trailEn = trail.map((x) => x.name_en || x.name);
      const numeric = typeof n.n === "number" ? `${n.n}` : "";
      out.push({
        kind: "node",
        key: href,
        stage: p[0],
        href,
        ar: n.title || n.name,
        en: n.title_en || n.name_en || n.name,
        trailAr,
        trailEn,
        icon: n.icon || "grade",
        depth: p.length,
        name: norm(`${n.name} ${n.name_en || ""} ${n.title || ""} ${n.title_en || ""}`),
        hay: norm(`${n.name} ${n.name_en || ""} ${n.title || ""} ${n.title_en || ""} ${numeric} ${trailAr.join(" ")} ${trailEn.join(" ")}`),
      });
      if (isLeaf(n)) {
        const leafAr = tr.slice(1).map((x) => x.name);
        const leafEn = tr.slice(1).map((x) => x.name_en || x.name);
        for (const s of n.subjects) {
          out.push({
            kind: "subject",
            key: `${href}#${s.id}`,
            stage: p[0],
            href: `${href}?subject=${encodeURIComponent(s.id)}`,
            ar: s.name,
            en: s.name_en || s.name,
            trailAr: [n.title || n.name],
            trailEn: [n.title_en || n.name_en || n.name],
            subjectId: s.id,
            icon: s.icon,
            color: s.color,
            name: norm(`${s.name} ${s.name_en || ""} ${(s.labels || []).join(" ")} ${(s.labels_en || []).join(" ")}`),
            hay: norm(`${s.name} ${s.name_en || ""} ${(s.labels || []).join(" ")} ${(s.labels_en || []).join(" ")} ${n.title || ""} ${n.title_en || ""} ${numeric} ${leafAr.join(" ")} ${leafEn.join(" ")} ${trail[0]?.name || ""} ${trail[0]?.name_en || ""}`),
          });
        }
      }
      if (n.children) walk(n.children, p, tr);
    }
  };
  walk(curriculum, [], []);
  return out;
}

/**
 * Rank index entries for a query. Every token must appear somewhere; names
 * that start with / contain the whole query rank first; grades & tracks come
 * before subjects at the same score. → { nodes, subjects, total }
 */
export function searchIndex(index, query, { stage = "all" } = {}) {
  const q = norm(query);
  if (q.length < 2) return { nodes: [], subjects: [], total: 0 };
  const tokens = q.split(" ").filter(Boolean);
  const scored = [];
  for (const e of index) {
    if (stage !== "all" && e.stage !== stage) continue;
    if (!tokens.every((tk) => e.hay.includes(tk))) continue;
    let score = 0;
    if (e.name.startsWith(q)) score += 60;
    else if (e.name.includes(q)) score += 40;
    score += tokens.filter((tk) => e.name.includes(tk)).length * 10;
    if (e.kind === "node") score += 5 - Math.min(e.depth || 0, 4);
    scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const nodes = scored.filter((x) => x.e.kind === "node").map((x) => x.e);
  const subjects = scored.filter((x) => x.e.kind === "subject").map((x) => x.e);
  return { nodes, subjects, total: nodes.length + subjects.length };
}

/**
 * For each grade (in order), the subjects that were not taught in the
 * previous grade. The first grade reports none.  grades: [{ id, subjects }]
 */
export function newSubjectsByGrade(grades) {
  const out = {};
  let prev = null;
  for (const g of grades) {
    const ids = new Set((g.subjects || []).map((s) => s.id));
    out[g.id] = prev ? (g.subjects || []).filter((s) => !prev.has(s.id)) : [];
    prev = ids;
  }
  return out;
}

/**
 * How a grade's subject list compares with the previous grade's:
 * "same" (same subjects, same periods) · "periods" (same subjects, some
 * period counts differ) · "changed" (subjects added or dropped).
 */
export function compareGrades(prev, next) {
  const a = prev?.subjects || [];
  const b = next?.subjects || [];
  const byId = new Map(b.map((s) => [s.id, s]));
  if (a.length !== b.length || !a.every((s) => byId.has(s.id))) return "changed";
  return a.every((s) => byId.get(s.id).periods === s.periods) ? "same" : "periods";
}

/**
 * Subject × grade matrix of annual periods, in first-appearance order.
 * → { columns: [gradeId], rows: [{ id, name, name_en, icon, color, cells: [periods|null] }] }
 */
export function subjectMatrix(grades) {
  const rows = new Map();
  grades.forEach((g, gi) => {
    for (const s of g.subjects || []) {
      if (!rows.has(s.id)) {
        rows.set(s.id, { id: s.id, name: s.name, name_en: s.name_en, icon: s.icon, color: s.color, cells: grades.map(() => null) });
      }
      rows.get(s.id).cells[gi] = s.periods ?? null;
    }
  });
  return { columns: grades.map((g) => g.id), rows: [...rows.values()] };
}

/** Subjects (by id) taught in every one of the given leaves, in the first leaf's order. */
export function sharedSubjects(leaves) {
  if (!leaves.length) return [];
  const sets = leaves.map((l) => new Set((l.subjects || []).map((s) => s.id)));
  return (leaves[0].subjects || []).filter((s) => sets.every((set) => set.has(s.id)));
}

/** Leaf subjects that are NOT in `shared` (a track's distinctive subjects). */
export function distinctiveSubjects(leaf, shared) {
  const ids = new Set(shared.map((s) => s.id));
  return (leaf.subjects || []).filter((s) => !ids.has(s.id));
}

/** Sum of the leaf's annual subject periods (as printed in the plan). */
export const totalPeriods = (leaf) => (leaf.subjects || []).reduce((n, s) => n + (s.periods || 0), 0);

/**
 * Serializable subject shape for the client explorer. Only hosted resources
 * are passed individually (they get a viewer); the rest is per-type policy:
 * resources: [{ type, base, hosted: [{ term, key, title, title_en }] }].
 */
export function toClientSubject(s, { practice = null, tag = null, art = null } = {}) {
  const types = {};
  for (const r of s.resources || []) {
    // base = the type's availability where no authorised file is hosted.
    const t = (types[r.type] ||= { type: r.type, base: null, hosted: [] });
    if (r.availability === "hosted") t.hosted.push({ term: r.term, key: r.key, title: r.title, title_en: r.title_en });
    else t.base ??= r.availability;
  }
  return {
    id: s.id,
    name: s.name,
    name_en: s.name_en,
    labels: s.labels,
    labels_en: s.labels_en,
    icon: s.icon,
    color: s.color,
    periods: s.periods,
    terms: s.terms,
    notes: s.notes || [],
    resources: Object.values(types).sort((a, b) => order(a.type) - order(b.type)),
    practice,
    tag,
    art,
  };
}
const ORDER = ["student_book", "activity_book", "exam_samples"];
const order = (type) => ORDER.indexOf(type);

/** Library illustration for a subject detail, when one fits (src/lib/assets.js). */
export function subjectArt(stage, subjectId) {
  const MAP = {
    elementary: { math: "elementary.numbers", science: "elementary.science" },
    middle: { math: "middle.math", science: "middle.science" },
    "high-school": {
      math: "high-school.math",
      physics: "high-school.physics",
      chemistry: "high-school.chemistry",
      biology: "high-school.biology",
    },
  };
  return MAP[stage]?.[subjectId] || null;
}

/** Colour per high-school track (tiles only; never the only carrier of meaning). */
export const TRACK_COLOR = {
  "first-year": "#A0672E",
  general: "#9A722C",
  sharia: "#4F7A5E",
  business: "#8C6A2E",
  "cs-eng": "#52709A",
  health: "#3F7F72",
};

const hrefOf = (...segs) => `/curriculum/${segs.join("/")}`;
const aliasOf = (n) => (Array.isArray(n?.children) && n.children.length === 1 && isLeaf(n.children[0]) ? n.children[0] : null);

/** Where a node's own link should go: an alias branch (one leaf child) links to that leaf. */
export function nodeHref(slug, node) {
  const leaf = aliasOf(node);
  return leaf ? hrefOf(...slug, leaf.id) : hrefOf(...slug);
}

/**
 * Sibling navigation for a node page (slug = [stage, grade?, track?]).
 * → { levels: [{ id, n, name, name_en, href, active }] | null,
 *     tracks: [{ id, name, name_en, href, active }] | null }
 * High school keeps the current track when moving between years (when that
 * year has it); year 1 links straight to the common first year.
 */
export function switcherFor(curriculum, slug = []) {
  const stage = curriculum.find((n) => n.id === slug[0]);
  if (!stage || stage.pending || !stage.children?.length || slug.length < 2) return { levels: null, tracks: null };
  const trackId = slug[2] || null;

  const levels = stage.children.map((g) => {
    let href = nodeHref([stage.id, g.id], g);
    if (trackId && !aliasOf(g) && g.children?.some((c) => c.id === trackId)) href = hrefOf(stage.id, g.id, trackId);
    return { id: g.id, n: g.n, name: g.name, name_en: g.name_en, href, active: g.id === slug[1] };
  });

  const grade = stage.children.find((g) => g.id === slug[1]);
  const tracks =
    grade?.children && !aliasOf(grade)
      ? grade.children.map((tr) => ({ id: tr.id, name: tr.name, name_en: tr.name_en, href: hrefOf(stage.id, grade.id, tr.id), active: tr.id === trackId }))
      : null;
  return { levels, tracks };
}

/**
 * Breadcrumb trail for a node: [{ id, name, name_en, href }] (root excluded).
 * The last item is the current page; alias branches get no link of their own.
 */
export function crumbsFor(slug, trail) {
  return trail.map((n, i) => {
    const last = i === trail.length - 1;
    return { id: n.id, name: n.name, name_en: n.name_en, href: last || aliasOf(n) ? null : hrefOf(...slug.slice(0, i + 1)) };
  });
}

/** Resource rows for one subject in a term view ("all" = both terms), in type order. */
export function resourcesForTerm(subject, term = "all") {
  return (subject?.resources || []).map((r) => {
    const hosted = term === "all" ? r.hosted : r.hosted.filter((h) => h.term === term);
    return { type: r.type, availability: hosted.length ? "hosted" : r.base || "unavailable", hosted };
  });
}
