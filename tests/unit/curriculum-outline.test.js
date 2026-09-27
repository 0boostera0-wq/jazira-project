import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveCurriculum } from "@/lib/curriculum";
import {
  OUTLINE_LEAVES,
  createOutlineTree,
  leafOf,
  loadOutline,
  lessonsUnder,
  nodeById,
  outlineFile,
  outlineFor,
  parseScope,
  subjectOutline,
  subjectTerms,
} from "@/lib/curriculum-outline";

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const fixture = JSON.parse(readFileSync(root("tests/fixtures/content/outline-tree.json"), "utf8"));
const registry = JSON.parse(readFileSync(root("data/staging/sources/registry.json"), "utf8"));
const SOURCES = new Set(registry.map((s) => s.id));
const TERMS = [null, "t1", "t2", "both"];

describe("node-tree interface (tests/fixtures/content/outline-tree.json)", () => {
  const tree = createOutlineTree({ leaf: fixture.leaf, nodes: fixture.nodes, subject_terms: fixture.subject_terms });
  const E = fixture.expected;

  it("answers every pinned query exactly", () => {
    for (const [leaf, want] of Object.entries(E.outlineFor)) expect(tree.outlineFor(leaf)).toEqual(want);
    for (const [id, want] of Object.entries(E.subjectOutline)) expect(tree.subjectOutline(id)).toEqual(want);
    for (const [id, want] of Object.entries(E.lessonsUnder)) expect(tree.lessonsUnder(id)).toEqual(want);
    for (const [id, want] of Object.entries(E.nodeById)) expect(tree.nodeById(id)).toEqual(want);
    for (const [id, want] of Object.entries(E.subjectTerms)) expect(tree.subjectTerms(id)).toEqual(want);
    for (const [scope, want] of Object.entries(E.eligibleLessons)) expect(tree.eligibleLessons(scope), scope).toEqual(want);
  });

  it("returns empty answers for unknown ids and scopes", () => {
    expect(tree.outlineFor("middle/grade-9")).toBeNull();
    expect(tree.subjectOutline("middle/grade-1/math/n53")).toBeNull(); // not a subject
    expect(tree.lessonsUnder("nope")).toEqual([]);
    expect(tree.eligibleLessons("prep:achievement/math")).toEqual([]);
    expect(tree.eligibleLessons("middle/grade-1/math@t3")).toEqual([]);
    expect(parseScope("middle/grade-1/math@t2")).toEqual({ nodeId: "middle/grade-1/math", term: "t2" });
    expect(parseScope("../etc@t1")).toBeNull();
  });
});

describe("leaf addressing", () => {
  it("maps node ids to catalog leaves by allow-list only", () => {
    expect(OUTLINE_LEAVES).toHaveLength(20);
    expect(leafOf("middle/grade-1/math/n91")).toBe("middle/grade-1");
    expect(leafOf("high-school/grade-2/general/math@t1")).toBe("high-school/grade-2/general");
    expect(leafOf("high-school/grade-2")).toBeNull(); // a grade with tracks is not a leaf
    expect(leafOf("../../etc/passwd")).toBeNull();
    expect(outlineFile("high-school/grade-3/cs-eng")).toBe("high-school/grade-3-cs-eng");
  });

  it("refuses unknown leaves", async () => {
    expect(await loadOutline("middle/grade-9")).toBeNull();
    expect(await loadOutline("../middle/grade-1")).toBeNull();
    expect(await nodeById("nope/x")).toBeNull();
  });
});

describe("generated outlines (src/content/curriculum/outline)", () => {
  it("covers every catalog leaf; catalog subjects resolve in the catalog, source-only subjects never do", async () => {
    for (const leaf of OUTLINE_LEAVES) {
      const tree = await loadOutline(leaf);
      const catalogLeaf = resolveCurriculum(leaf.split("/"))?.node;
      expect(catalogLeaf?.subjects, leaf).toBeTruthy();
      const out = tree.outlineFor(leaf);
      expect(out?.subjects.length, leaf).toBeGreaterThan(0);
      const catalogIds = new Set(catalogLeaf.subjects.map((s) => `${leaf}/${s.id}`));
      for (const id of out.subjects) {
        const n = tree.nodeById(id);
        if (n.status === "source_only") expect(catalogIds.has(id), id).toBe(false);
        else expect(catalogIds.has(id), id).toBe(true);
      }
      // Every catalog subject is in the outline (mapped, or catalog-only with no units).
      for (const id of catalogIds) expect(out.subjects, id).toContain(id);
      for (const id of catalogIds) expect(tree.subjectTerms(id).map((r) => r.term)).toEqual(["t1", "t2"]);
    }
  });

  it("keeps terms in range, orders contiguous, pages ascending and inside the book, and a source on every node", async () => {
    for (const leaf of OUTLINE_LEAVES) {
      const tree = await loadOutline(leaf);
      const nodes = tree.nodes();
      const ids = new Set(nodes.map((n) => n.id));
      const pageCount = new Map();
      for (const s of tree.outlineFor(leaf).subjects) for (const r of tree.resourcesFor(s)) pageCount.set(r.id, r.page_count);
      const siblings = new Map();
      for (const n of nodes) {
        expect(TERMS, n.id).toContain(n.term);
        expect(n.source_ref, n.id).toBeTruthy();
        expect(SOURCES.has(n.source_ref.source_id), n.id).toBe(true);
        if (n.kind !== "stage") expect(ids.has(n.parent_id), `${n.id} parent`).toBe(true);
        for (const p of n.pages) {
          expect(p.pdf_start).toBeLessThanOrEqual(p.pdf_end);
          const count = pageCount.get(p.resource_id);
          if (count) expect(p.pdf_end).toBeLessThanOrEqual(count);
        }
        // Sibling sets are complete from the leaf down (a leaf file holds only its own ancestors).
        if (n.parent_id !== leaf && !n.parent_id?.startsWith(`${leaf}/`)) continue;
        if (!siblings.has(n.parent_id)) siblings.set(n.parent_id, []);
        siblings.get(n.parent_id).push(n.order);
      }
      for (const [parent, orders] of siblings) {
        expect([...orders].sort((a, b) => a - b), parent).toEqual(orders.map((_, i) => i + 1));
      }
    }
  });

  it("carries the catalog's English names into subject and unit titles (never Arabic in title_en)", async () => {
    const AR = /[؀-ۿ]/;
    for (const leaf of OUTLINE_LEAVES) {
      const tree = await loadOutline(leaf);
      for (const s of resolveCurriculum(leaf.split("/")).node.subjects) {
        const n = tree.nodeById(`${leaf}/${s.id}`);
        expect(n.title_en, n.id).toBe(AR.test(s.name_en) ? null : s.name_en);
      }
      for (const n of tree.nodes()) if (n.title_en) expect(n.title_en, n.id).not.toMatch(AR);
    }
    // A unit or source-only subject titled like a catalog subject or plan label takes its English name.
    expect(await nodeById("middle/grade-1/math/n4225")).toMatchObject({ kind: "unit", title_ar: "الإحصاء", title_en: "Statistics" });
    expect(await nodeById("high-school/grade-1/first-year/ien-31578")).toMatchObject({ kind: "subject", status: "source_only", title_en: "Health and PE 2" });
    // None in the catalog: no English title (the UI falls back to the Arabic one with its own lang/dir).
    expect((await nodeById("middle/grade-1/ien-54709")).title_en).toBeNull();
  });

  it("applies the same page rules to the interface fixture", () => {
    for (const n of fixture.nodes) {
      for (const p of n.pages) expect(p.pdf_start).toBeLessThanOrEqual(p.pdf_end);
      expect(TERMS).toContain(n.term);
    }
  });

  it("serves the pilot subject from iEN (middle/grade-1 math: 84 lessons, unit n91 first)", async () => {
    const math = await nodeById("middle/grade-1/math");
    expect(math).toMatchObject({ kind: "subject", title_ar: "الرياضيات", status: "verified", source_ref: { source_id: "ien", ien_id: 90 } });
    expect(await lessonsUnder("middle/grade-1/math")).toHaveLength(84);
    const outline = await subjectOutline("middle/grade-1/math");
    expect(outline.children[0].id).toBe("middle/grade-1/math/n91");
    expect(await nodeById("middle/grade-1/math/n53")).toMatchObject({ kind: "lesson", parent_id: "middle/grade-1/math/n91", order: 1 });
    expect((await outlineFor("middle/grade-1")).subjects[0]).toBe("middle/grade-1/islamic");
    // No verified term evidence yet: both memberships need review (the expected outcome, §0).
    expect((await subjectTerms("middle/grade-1/math")).map((r) => r.status)).toEqual(["needs_review", "needs_review"]);
  });
});
