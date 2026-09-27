// ============================================================================
// Exclusion components (docs/CONTENT_ENGINE.md §4.5 step 7, §2.9, §5.6).
//
// Exclusions are explicit conflict edges:
//   related    RELATED pairs (never a `numeric_variant`-only pair)       cuttable
//   member_of  template variant → its template id; declared rewrite →
//              its parent                                                 never cut
// Components are the connected components of this graph. A component with
// more than K = 8 questions is split into pieces of ≤ K: member_of sets are
// contracted first (a template's variants always stay together — that set
// alone is exempt from the cap, its size is `max_variants`), then related
// edges are kept greedily, same-source-page edges first, then by stem
// similarity (strongest first); every edge that would overflow a piece is
// cut (the weakest ones end up cut). `exclusion_group` = `xg-<hex10>` of the
// piece's sorted question ids (template ids are virtual nodes and never part
// of the id). A question with no conflict edge has no group (null).
// Pure and deterministic.
// ============================================================================

import { exclusionGroupId } from "../../../src/lib/content/ids.js";
import { cmpC } from "./shingles.mjs";

export const EXCLUSION_CAP = 8;

class UnionFind {
  constructor() {
    this.parent = new Map();
  }
  find(x) {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let r = x;
    while (this.parent.get(r) !== r) r = this.parent.get(r);
    let c = x;
    while (this.parent.get(c) !== r) {
      const next = this.parent.get(c);
      this.parent.set(c, r);
      c = next;
    }
    return r;
  }
  /** Union keeping the C-order-smallest id as the root (deterministic). */
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return ra;
    const [root, child] = cmpC(ra, rb) <= 0 ? [ra, rb] : [rb, ra];
    this.parent.set(child, root);
    return root;
  }
}
export { UnionFind };

const pairKey = (a, b) => (cmpC(a, b) <= 0 ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/**
 * @param {object} p
 * @param {{id:string, question:boolean, pageKey?:string|null}[]} p.nodes
 *        questions (question: true) and virtual template nodes (question: false)
 * @param {{a:string, b:string, kind:"related"|"member_of", weight?:number, samePage?:boolean}[]} p.edges
 * @param {number} [p.cap]
 * @returns {{ groupOf: Map<string, string|null>, components: object[], splits: object[] }}
 *   groupOf: question id → xg id (or null); components: every group with its
 *   members; splits: the components above the cap, their pieces and cut edges.
 */
export function buildExclusionGroups({ nodes, edges, cap = EXCLUSION_CAP }) {
  const isQuestion = new Map(nodes.map((n) => [n.id, n.question !== false]));
  const known = (id) => isQuestion.has(id);

  // 1. contract member_of sets into super-nodes
  const members = new UnionFind();
  for (const n of nodes) members.find(n.id);
  const hasStructure = new Set();
  for (const e of edges) {
    if (e.kind !== "member_of" || !known(e.a) || !known(e.b) || e.a === e.b) continue;
    hasStructure.add(members.union(e.a, e.b));
  }
  const superOf = (id) => members.find(id);
  const superMembers = new Map();
  for (const n of [...nodes].sort((x, y) => cmpC(x.id, y.id))) {
    const s = superOf(n.id);
    if (!superMembers.has(s)) superMembers.set(s, []);
    superMembers.get(s).push(n.id);
  }
  const structured = new Set([...hasStructure].map(superOf));
  const size = (s) => superMembers.get(s).filter((id) => isQuestion.get(id)).length;

  // 2. related edges between super-nodes (max weight, same page if any original edge was)
  const superEdges = new Map();
  for (const e of edges) {
    if (e.kind !== "related" || !known(e.a) || !known(e.b)) continue;
    const a = superOf(e.a);
    const b = superOf(e.b);
    if (a === b) continue;
    const key = pairKey(a, b);
    const prev = superEdges.get(key);
    const weight = Number.isFinite(e.weight) ? e.weight : 0;
    if (!prev) superEdges.set(key, { a: cmpC(a, b) <= 0 ? a : b, b: cmpC(a, b) <= 0 ? b : a, weight, samePage: Boolean(e.samePage), orig: [[e.a, e.b]] });
    else {
      prev.weight = Math.max(prev.weight, weight);
      prev.samePage ||= Boolean(e.samePage);
      prev.orig.push([e.a, e.b]);
    }
  }

  // 3. connected components over super-nodes
  const comp = new UnionFind();
  for (const s of superMembers.keys()) comp.find(s);
  for (const e of superEdges.values()) comp.union(e.a, e.b);
  const compSupers = new Map();
  for (const s of [...superMembers.keys()].sort(cmpC)) {
    const c = comp.find(s);
    if (!compSupers.has(c)) compSupers.set(c, []);
    compSupers.get(c).push(s);
  }
  const compEdges = new Map();
  for (const e of superEdges.values()) {
    const c = comp.find(e.a);
    if (!compEdges.has(c)) compEdges.set(c, []);
    compEdges.get(c).push(e);
  }

  const groupOf = new Map();
  const components = [];
  const splits = [];
  const emit = (supers, hasEdge) => {
    const ids = supers.flatMap((s) => superMembers.get(s));
    const questions = ids.filter((id) => isQuestion.get(id)).sort(cmpC);
    const grouped = questions.length > 0 && (hasEdge || supers.some((s) => structured.has(s)));
    const xg = grouped ? exclusionGroupId(questions) : null;
    for (const q of questions) groupOf.set(q, xg);
    if (xg) components.push({ id: xg, members: questions, size: questions.length, exempt: questions.length > cap });
    return { xg, questions };
  };

  for (const [c, supers] of [...compSupers].sort((x, y) => cmpC(x[0], y[0]))) {
    const cEdges = (compEdges.get(c) ?? []).sort((x, y) => cmpC(x.a, y.a) || cmpC(x.b, y.b));
    const total = supers.reduce((n, s) => n + size(s), 0);
    if (total <= cap || supers.length === 1) {
      emit(supers, cEdges.length > 0);
      continue;
    }
    // 4. split: Kruskal with a size cap; same-page edges first, then strongest.
    const pieces = new UnionFind();
    const pieceSize = new Map(supers.map((s) => [s, size(s)]));
    const pieceHasEdge = new Set();
    for (const s of supers) pieces.find(s);
    const ordered = [...cEdges].sort(
      (x, y) => Number(y.samePage) - Number(x.samePage) || y.weight - x.weight || cmpC(x.a, y.a) || cmpC(x.b, y.b),
    );
    const cut = [];
    for (const e of ordered) {
      const ra = pieces.find(e.a);
      const rb = pieces.find(e.b);
      if (ra === rb) {
        pieceHasEdge.add(ra);
        continue;
      }
      const merged = pieceSize.get(ra) + pieceSize.get(rb);
      if (merged <= cap) {
        const root = pieces.union(ra, rb);
        pieceSize.set(root, merged);
        pieceHasEdge.add(root);
      } else {
        for (const [oa, ob] of e.orig) cut.push({ a: cmpC(oa, ob) <= 0 ? oa : ob, b: cmpC(oa, ob) <= 0 ? ob : oa, weight: e.weight, same_page: e.samePage });
      }
    }
    const byPiece = new Map();
    for (const s of supers) {
      const r = pieces.find(s);
      if (!byPiece.has(r)) byPiece.set(r, []);
      byPiece.get(r).push(s);
    }
    const out = [];
    for (const [r, ps] of [...byPiece].sort((x, y) => cmpC(x[0], y[0]))) out.push(emit(ps, pieceHasEdge.has(pieces.find(r))));
    const all = supers.flatMap((s) => superMembers.get(s)).filter((id) => isQuestion.get(id)).sort(cmpC);
    splits.push({
      members: all,
      size: all.length,
      pieces: out.map((p) => ({ exclusion_group: p.xg, members: p.questions })),
      cut_edges: cut.sort((x, y) => cmpC(x.a, y.a) || cmpC(x.b, y.b)),
    });
  }
  // questions that never appeared in any component keep null
  for (const n of nodes) if (n.question !== false && !groupOf.has(n.id)) groupOf.set(n.id, null);
  components.sort((x, y) => cmpC(x.id, y.id));
  return { groupOf, components, splits };
}
