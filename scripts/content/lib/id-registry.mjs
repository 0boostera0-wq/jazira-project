// ============================================================================
// Id registry (docs/CONTENT_ENGINE.md §2.2): hash-derived `x…` node ids and
// `obj-…` objective ids are minted ONCE and reused on later runs.
//
//   const reg = IdRegistry.load("data/staging/curriculum/id-registry.jsonl");
//   reg.resolve({ kind: "x_node", scope: subjectNode, nodeKind: "lesson", title, taken })
//     → { id, match: "exact" | "alias" | "minted" }
//   reg.save(path)
//
// Matching (same kind and scope; x-nodes also the same node kind): normalized
// equality with the first title or an alias, then trigram Jaccard ≥ 0.85 (a
// typo fix adds an alias instead of a new id); otherwise a new id is minted.
// `taken` (a Set of ids already assigned in this run) keeps two different
// TOC nodes with the same title from sharing an id: the second one gets the
// hash of "<title> #2". The registry is append-only; validate-staging fails if
// an id disappears.
// ============================================================================

import { existsSync } from "node:fs";
import { normalizeTitle, searchNormalize, trigramJaccard } from "../../../src/lib/content/normalize.js";
import { objectiveId, xNodeId } from "../../../src/lib/content/ids.js";
import { compareC } from "../../../src/lib/content/prng.js";
import { readJsonl, writeJsonl } from "./jsonl.mjs";
import { stringifyRecord } from "./schemas.mjs";

export const FUZZY_THRESHOLD = 0.85;
const MAX_OCCURRENCE = 20;

const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const titleWithOccurrence = (norm, k) => (k === 1 ? norm : `${norm} #${k}`);

export class IdRegistry {
  /** @param {object[]} entries id-registry@1 rows  @param {{now?: () => string}} [o] */
  constructor(entries = [], { now = isoNow } = {}) {
    this.now = now;
    this.byId = new Map();
    for (const e of entries) {
      if (this.byId.has(e.id)) throw new Error(`id registry: duplicate id ${e.id}`);
      this.byId.set(e.id, { ...e, aliases: [...(e.aliases ?? [])] });
    }
    this.dirty = false;
  }

  static load(path, options) {
    return new IdRegistry(existsSync(path) ? readJsonl(path) : [], options);
  }

  get size() {
    return this.byId.size;
  }

  get(id) {
    return this.byId.get(id) ?? null;
  }

  has(id) {
    return this.byId.has(id);
  }

  /** Entries sorted by id (C order), as written to disk. */
  entries() {
    return [...this.byId.values()].sort((a, b) => compareC(a.id, b.id));
  }

  /** Occurrence number k (1 = plain title) whose mint equals the entry id, or 0. */
  occurrenceOf(entry, nodeKind) {
    for (let k = 1; k <= MAX_OCCURRENCE; k++) {
      if (this.mint(entry.kind, entry.scope, nodeKind, entry.first_title_norm, k) === entry.id) return k;
    }
    return 0;
  }

  /**
   * The id a title gets at first assignment (§2.2). x-nodes hash
   * normalizeTitle(title) (idempotent, so the stored norm reproduces it);
   * objectives hash searchNormalize(text) exactly like objectiveId(lesson, text)
   * — never the lam_order_folded matching key, which would give a different id
   * for most Arabic texts («الأعداد» folds to «االعداد»).
   */
  mint(kind, scope, nodeKind, title, k = 1) {
    if (kind === "x_node") return xNodeId(scope, nodeKind, titleWithOccurrence(normalizeTitle(title), k));
    if (kind === "objective") return objectiveId(scope, titleWithOccurrence(searchNormalize(title), k));
    throw new Error(`id registry: unknown kind ${kind}`);
  }

  /**
   * Resolve a title to a frozen id, minting (and recording) a new one when
   * nothing matches. `taken` ids are never reused (x-nodes only).
   */
  resolve({ kind, scope, nodeKind = null, title, taken = null }) {
    if (kind === "x_node" && !nodeKind) throw new Error("id registry: x_node needs nodeKind");
    const norm = normalizeTitle(title);
    if (!norm) throw new Error("id registry: empty title");
    const blocked = (id) => kind === "x_node" && taken?.has(id);
    const candidates = [];
    for (const e of this.byId.values()) {
      if (e.kind !== kind || e.scope !== scope || blocked(e.id)) continue;
      const occurrence = kind === "x_node" ? this.occurrenceOf(e, nodeKind) : 1;
      if (occurrence) candidates.push({ e, occurrence });
    }
    const done = (id, match) => {
      if (kind === "x_node" && taken) taken.add(id);
      return { id, match };
    };

    const exact = candidates
      .filter(({ e }) => e.first_title_norm === norm || e.aliases.includes(norm))
      .sort((a, b) => a.occurrence - b.occurrence || compareC(a.e.id, b.e.id));
    if (exact.length) return done(exact[0].e.id, "exact");

    let best = null;
    for (const c of candidates) {
      const score = Math.max(...[c.e.first_title_norm, ...c.e.aliases].map((t) => trigramJaccard(norm, t, { normalized: true })));
      if (score >= FUZZY_THRESHOLD && (!best || score > best.score || (score === best.score && compareC(c.e.id, best.e.id) < 0))) {
        best = { e: c.e, score };
      }
    }
    if (best) {
      if (!best.e.aliases.includes(norm)) {
        best.e.aliases.push(norm);
        best.e.aliases.sort(compareC);
        this.dirty = true;
      }
      return done(best.e.id, "alias");
    }

    for (let k = 1; k <= MAX_OCCURRENCE; k++) {
      const id = this.mint(kind, scope, nodeKind, title, k);
      if (this.byId.has(id)) continue; // taken in this run, or a 10/8-hex prefix collision
      this.byId.set(id, { schema: "id-registry@1", id, kind, scope, first_title_norm: norm, aliases: [], assigned_at: this.now() });
      this.dirty = true;
      return done(id, "minted");
    }
    throw new Error(`id registry: no free id for ${JSON.stringify(norm)} in ${scope}`);
  }

  /** Ids of `baselineIds` that are missing here (the registry is append-only). */
  missingFrom(baselineIds) {
    return [...baselineIds].filter((id) => !this.byId.has(id)).sort(compareC);
  }

  /** Write sorted by id with schema key order; returns the write result. */
  save(path) {
    const result = writeJsonl(path, this.entries(), { serialize: (r) => stringifyRecord("id-registry", r) });
    this.dirty = false;
    return result;
  }
}
