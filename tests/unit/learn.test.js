// Learn UI (docs/CONTENT_ENGINE.md §7, WP9): routing and node resolution, term
// badges, book-page link-outs, the three resource states (nothing embedded),
// pool counts, and the entry-point rules (pool rule, tiers, mini versions,
// term exams only on verified or inferred membership).
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  compactOutline, createPoolIndex, crumbHref, entryPointsFor, learnHref, learnPageModel, lessonPages, likePrefix, loadSubjectPool, offerForTier,
  parseLearnPath, pdfHref, poolFromScopeCounts, resolveLearnNode, resourceView, scopeLessonIds, sortResources, termBadge, termMembership,
} from "@/components/learn/learn-logic";
import ResourceState from "@/components/learn/ResourceState";
import SubjectOutline from "@/components/learn/SubjectOutline";
import { contentLang } from "@/components/learn/ContentText";
import ResourceList from "@/components/learn/ResourceList";
import ExamEntryPoints from "@/components/learn/ExamEntryPoints";
import LearnPathLayout from "@/app/[locale]/(app)/learn/[...path]/layout";
import { createOutlineTree, loadOutline } from "@/lib/curriculum-outline";
import { createRuntimeBank } from "@/lib/exams/engine/runtime-bank.server";
import { parseScope, resolveScope } from "@/lib/exams/engine/scope";
import { loadMessages } from "@/i18n/messages";
import { createTranslator } from "@/i18n/translator";

// Link needs the app router; a plain anchor is enough to render the outline rows.
vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  return { Link: ({ href, children, ...rest }) => h("a", { href, ...rest }, children), useRouter: () => ({ push() {} }) };
});
// The ExamEntryPoints island reads the UI language and the viewer tier from hooks.
const ui = vi.hoisted(() => ({ locale: "en", t: (k) => k }));
vi.mock("@/i18n/client", () => ({ useLocale: () => ({ locale: ui.locale }), useT: () => ui.t }));
vi.mock("@/components/exams/useTier", () => ({ useTier: () => ({ isLoaded: true, tier: "guest" }) }));

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const FIXTURE = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/content/outline-tree.json"), "utf8"));
const BANK_DIR = path.join(ROOT, "tests/fixtures/engine/runtime-bank");
const M = "middle/grade-1/math";
const S = "middle/grade-1/science";

const RESOURCES = [
  { id: "ien-120607", subject_node_id: M, kind: "student_book", title: "مقرر الرياضيات /كتاب الطالب الجزء الأول", part: 1, year_label: "1448",
    url: "https://iencontent.ien.edu.sa/books/1448-GE-ME-K07-SM1-math-part1.pdf", file_type: "pdf", page_count: 183, external_count: null,
    availability: "external_official", term: null, term_status: "needs_review", term_basis: null, status: "active" },
  { id: "ien-121391", subject_node_id: M, kind: "student_book", title: "مقرر الرياضيات /كتاب الطالب الجزء الثاني", part: 2, year_label: "1448",
    url: null, file_type: "pdf", page_count: null, external_count: null, availability: "unavailable", term: null, term_status: "needs_review", status: "unavailable" },
  { id: "ien-121500", subject_node_id: M, kind: "activity_book", title: "كتاب النشاط", part: null, year_label: "1488",
    url: "https://iencontent.ien.edu.sa/books/1488-x.pdf", file_type: "pdf", page_count: 90, availability: "needs_review", term: "t1", term_status: "inferred",
    term_basis: "owner_decision", status: "needs_review" },
  { id: "ien-bank-90", subject_node_id: M, kind: "question_bank_external", title: "الرياضيات", part: null, year_label: null,
    url: "https://www.ien.edu.sa/?choice=2#/subjectselfassessments/90", file_type: "other", page_count: null, external_count: 545,
    availability: "external_official", term: null, term_status: "unknown", status: "active" },
];
const tree = createOutlineTree({ leaf: FIXTURE.leaf, nodes: FIXTURE.nodes, subject_terms: FIXTURE.subject_terms, resources: RESOURCES });
const bank = createRuntimeBank({ dir: BANK_DIR });
const rowsOf = async (id) => (await bank.rowsForNode(id)) ?? [];

describe("learn routing", () => {
  it("parses /learn/<subject>[/<local id>] into a node id", () => {
    expect(parseLearnPath(["middle", "grade-1", "math"])).toEqual({ nodeId: M });
    expect(parseLearnPath(["middle", "grade-1", "math", "n54"])).toEqual({ nodeId: `${M}/n54` });
    expect(parseLearnPath(["high-school", "grade-2", "general", "physics", "x3fa9c21b"])).toEqual({ nodeId: "high-school/grade-2/general/physics/x3fa9c21b" });
    expect(parseLearnPath("middle/grade-1/math/n54")).toEqual({ nodeId: `${M}/n54` });
  });

  it("rejects malformed paths (404, never a file path)", () => {
    for (const bad of [[], ["middle"], ["middle", "grade-1"], ["middle", "grade-1", "..", "x"], ["middle", "Grade-1", "math"], ["middle", "grade-1", "math", ""],
      ["a", "b", "c", "d", "e", "f", "g"], ["middle", "grade-1", "math@t1"], ["middle", "grade-1", "ma th"], null, 42, ["middle", "grade-1", "x".repeat(65)]]) {
      expect(parseLearnPath(bad)).toBeNull();
    }
  });

  it("links learn pages and crumbs", () => {
    expect(learnHref(`${M}@t1`)).toBe(`/learn/${M}`);
    expect(crumbHref({ kind: "grade", id: "middle/grade-1" })).toBe("/curriculum/middle/grade-1");
    expect(crumbHref({ kind: "lesson", id: `${M}/n54` })).toBe(`/learn/${M}/n54`);
    expect(crumbHref({ kind: "term", id: "middle/grade-1/t1" })).toBeNull();
  });

  it("resolves subjects, units, chapters and lessons with their context", () => {
    const s = resolveLearnNode(tree, M);
    expect(s.node.kind).toBe("subject");
    expect(s.leaf.id).toBe("middle/grade-1");
    expect(s.trail.map((n) => n.kind)).toEqual(["stage", "grade", "subject"]);
    const l = resolveLearnNode(tree, `${M}/n54`);
    expect([l.subject.id, l.unit.id, l.chapter]).toEqual([M, `${M}/n91`, null]);
    const c = resolveLearnNode(tree, `${S}/xe389fa43`);
    expect([c.unit.id, c.chapter.id]).toEqual([`${S}/x9368a8a7`, `${S}/xc8b1a031`]);
    expect(resolveLearnNode(tree, `${M}/n91`).unit.id).toBe(`${M}/n91`);
  });

  it("never resolves term, catalog, unknown or hidden nodes", () => {
    for (const id of ["middle/grade-1/t1", "middle/grade-1", "middle", `${M}/n999`, "nope"]) expect(resolveLearnNode(tree, id)).toBeNull();
    const hidden = createOutlineTree({
      nodes: [
        ...FIXTURE.nodes.slice(0, 2),
        { id: "middle/grade-1/ien-7846", parent_id: "middle/grade-1", kind: "subject", order: 9, title_ar: "الصينية", status: "source_only" },
        { id: "middle/grade-1/ien-7846/n1", parent_id: "middle/grade-1/ien-7846", kind: "lesson", order: 1, title_ar: "درس", status: "verified" },
      ],
    });
    expect(resolveLearnNode(hidden, "middle/grade-1/ien-7846")).toBeNull();
    expect(resolveLearnNode(hidden, "middle/grade-1/ien-7846/n1")).toBeNull();
  });
});

describe("terms, pages and resource states", () => {
  it("badges terms from evidence only", () => {
    expect(termBadge({ term: "t1", term_status: "verified" })).toEqual({ state: "verified", term: "t1" });
    expect(termBadge({ term: "t2", term_status: "inferred" })).toEqual({ state: "inferred", term: "t2" });
    expect(termBadge({ term: "t1", term_status: "inferred", term_basis: "owner_decision" })).toEqual({ state: "unconfirmed", term: "t1" });
    expect(termBadge({ term: null, term_status: "needs_review" })).toEqual({ state: "needs_review", term: null });
    expect(termBadge({ term: "t1", term_status: "needs_review" })).toEqual({ state: "needs_review", term: null });
    expect(termMembership(FIXTURE.subject_terms.filter((r) => r.subject_node_id === M), "t1")).toEqual({ status: "inferred", ok: true });
    expect(termMembership(FIXTURE.subject_terms.filter((r) => r.subject_node_id === S), "t2")).toEqual({ status: "needs_review", ok: false });
    expect(termMembership([], "t1").ok).toBe(false);
  });

  it("links out to the official PDF at #page=<n> (https only)", () => {
    expect(pdfHref("https://iencontent.ien.edu.sa/books/a.pdf", 14)).toBe("https://iencontent.ien.edu.sa/books/a.pdf#page=14");
    expect(pdfHref("https://iencontent.ien.edu.sa/books/a.pdf")).toBe("https://iencontent.ien.edu.sa/books/a.pdf");
    expect(pdfHref("https://iencontent.ien.edu.sa/books/a.pdf", 0)).toBe("https://iencontent.ien.edu.sa/books/a.pdf");
    for (const bad of ["http://x/a.pdf", "javascript:alert(1)", "//x/a.pdf", "/books/a.pdf", null, 'https://x/a"onload=1']) expect(pdfHref(bad, 3)).toBeNull();
  });

  it("maps lesson pages to link-outs with printed pages", () => {
    const byId = new Map(RESOURCES.map((r) => [r.id, r]));
    const pages = lessonPages(tree.nodeById(`${M}/n54`), byId);
    expect(pages).toEqual([
      { resource_id: "ien-120607", title: RESOURCES[0].title, part: 1, printed: { start: 12, end: 14 }, pdf: { start: 14, end: 16 },
        href: "https://iencontent.ien.edu.sa/books/1448-GE-ME-K07-SM1-math-part1.pdf#page=14", status: "needs_review" },
    ]);
    // An unknown or unavailable resource keeps the page reference without a link.
    expect(lessonPages({ pages: [{ resource_id: "ien-121391", pdf_start: 3, pdf_end: 4, status: "verified" }] }, byId)[0]).toMatchObject({ href: null, printed: null, status: "verified" });
    expect(lessonPages({ pages: [{ resource_id: "nope", pdf_start: 3 }] }, byId)[0].href).toBeNull();
    expect(lessonPages({ pages: [{ resource_id: "ien-120607", pdf_start: 0 }] }, byId)).toEqual([]);
  });

  it("gives every resource one of the three states", () => {
    const [book, missing, review, qbank] = RESOURCES.map(resourceView);
    expect(book).toMatchObject({ state: "external_official", href: RESOURCES[0].url, part: 1, year: "1448", pages: 183, review: false, term: { state: "needs_review" } });
    expect(missing).toMatchObject({ state: "unavailable", reason: "unavailable", href: null });
    expect(review).toMatchObject({ state: "needs_review", review: true, href: RESOURCES[2].url, term: { state: "unconfirmed", term: "t1" }, year: "1488" });
    expect(qbank).toMatchObject({ state: "external_official", bank: true, externalCount: 545, term: null });
    // "Official" without a usable https link is shown as unavailable, never as a dead button.
    expect(resourceView({ ...RESOURCES[0], url: "http://insecure/a.pdf" })).toMatchObject({ state: "unavailable", reason: "no_link", href: null });
    expect(resourceView({ id: "x", availability: "weird" }).state).toBe("unavailable");
    expect(sortResources([qbank, review, book]).map((r) => r.id)).toEqual(["ien-120607", "ien-121500", "ien-bank-90"]);
  });

  it("renders the three states as link-outs only (nothing embedded)", async () => {
    const messages = await loadMessages("en", ["learn"]);
    const t = createTranslator("en", messages, "learn");
    const items = sortResources(RESOURCES.map(resourceView));
    const html = renderToStaticMarkup(createElement(ResourceList, { items, t, locale: "en", titleId: "r" }));
    expect(html).not.toMatch(/<(iframe|embed|object|frame)\b/i);
    expect(html.match(/data-resource-state="external_official"/g)).toHaveLength(2);
    expect(html.match(/data-resource-state="unavailable"/g)).toHaveLength(1);
    expect(html.match(/data-resource-state="needs_review"/g)).toHaveLength(1);
    const anchors = html.match(/<a [^>]*>/g) || [];
    expect(anchors).toHaveLength(3); // the unavailable file has no link
    for (const a of anchors) {
      expect(a).toMatch(/href="https:\/\//);
      expect(a).toMatch(/target="_blank"/);
      expect(a).toMatch(/rel="noopener noreferrer"/);
    }
    expect(html).toContain("Open on iEN");
    expect(html).toContain("File not available");
    expect(html).toContain("Details not confirmed yet");
    expect(html).toContain("545 questions on iEN");
    const one = renderToStaticMarkup(createElement(ResourceState, { item: resourceView(RESOURCES[0]), t, locale: "en" }));
    expect(one).toContain("Part 1");
    expect(one).toContain("1448 AH edition");
    expect(one).toContain("183 pages");
    expect(one).toContain("Term not confirmed");
  });
});

describe("pools", () => {
  it("resolves scopes exactly like the exam engine", async () => {
    const scopes = [M, `${M}@t1`, `${M}@t2`, `${M}@year`, `${M}/n91`, `${M}/n92`, `${M}/n54`, `${M}/x5a3afdd4`, S, `${S}@t1`, `${S}@year`,
      `${S}/x9368a8a7`, `${S}/xc8b1a031`, `${M}/n91@t1`, "middle/grade-1/t1", "nope/x"];
    for (const scope of scopes) {
      const engine = await resolveScope(tree, parseScope(scope));
      expect({ scope, ids: scopeLessonIds(tree, scope) }).toEqual({ scope, ids: engine.ok ? engine.lessonIds : [] });
    }
    expect(scopeLessonIds(tree, `${M}@t1`)).toEqual([`${M}/n53`, `${M}/n54`, `${M}/n55`]);
    expect(scopeLessonIds(tree, `${M}/x5a3afdd4`)).toEqual([]); // unit opener
  });

  it("counts published items, exclusion groups and non-premium groups per scope", async () => {
    const rows = await rowsOf(M);
    const pool = createPoolIndex(tree, rows);
    expect(pool.source).toBe("bank");
    const eligible = new Set(scopeLessonIds(tree, M));
    const mine = rows.filter((r) => eligible.has(r.lesson));
    const groups = new Set(mine.map((r) => r.component ?? r.key));
    const free = new Set(mine.filter((r) => !r.premium).map((r) => r.component ?? r.key));
    const s = pool.stats(M);
    expect(s.total).toBe(mine.length);
    expect([s.counts[1] + s.counts[2] + s.counts[3], s.groups, s.free_groups]).toEqual([mine.length, groups.size, free.size]);
    expect(s.free_groups).toBeLessThan(s.groups); // the fixture has premium items
    expect(pool.stats(`${M}/n54`).total).toBe(rows.filter((r) => r.lesson === `${M}/n54`).length);
    expect(pool.stats(`${M}/x5a3afdd4`).total).toBe(0); // openers never enter a pool
    expect(createPoolIndex(tree, []).stats(M)).toMatchObject({ total: 0, groups: 0 });
  });

  it("loads the pool from the database first, the runtime bank second, empty last", async () => {
    // ce_refresh_aggregates rows: one per node and band (0 = all bands), plus <subject>@t1|@t2.
    const dbRows = [
      { node_id: `${M}/n54`, band: 0, published_count: 6, group_count: 4, free_count: 5, free_group_count: 3 },
      { node_id: `${M}/n54`, band: 1, published_count: 4, group_count: 3, free_count: 3, free_group_count: 2 },
      { node_id: `${M}/n54`, band: 2, published_count: 2, group_count: 2, free_count: 2, free_group_count: 2 },
      { node_id: `${M}/n91`, band: 0, published_count: 9, group_count: 7, free_count: 8, free_group_count: 6 },
      { node_id: M, band: 0, published_count: 40, group_count: 30, free_count: 33, free_group_count: 24 },
      { node_id: `${M}@t1`, band: 0, published_count: 22, group_count: 21, free_count: 20, free_group_count: 19 },
      { node_id: "middle/grade-1/mathx", band: 0, published_count: 999, group_count: 999, free_count: 999, free_group_count: 999 }, // another subject's prefix
    ];
    const calls = [];
    const db = {
      from: (table) => ({
        select: () => ({
          like: (col, pat) => ({
            limit: async () => {
              calls.push([table, col, pat]);
              return { data: dbRows, error: null };
            },
          }),
        }),
      }),
    };
    const fromDb = await loadSubjectPool({ tree, subjectId: M, db, bank });
    expect(fromDb.source).toBe("db");
    expect(calls).toEqual([["scope_pool_counts", "node_id", `${M}%`]]);
    // Each scope reads its own node row (never a sum over lessons: components span lessons), with the premium split.
    expect(fromDb.stats(`${M}/n54`)).toEqual({ counts: { 1: 4, 2: 2, 3: 0 }, total: 6, groups: 4, free_groups: 3, free_total: 5 });
    expect(fromDb.stats(`${M}/n91`)).toMatchObject({ total: 9, groups: 7, free_groups: 6 });
    expect(fromDb.stats(M)).toMatchObject({ groups: 30, free_groups: 24 });
    expect(fromDb.stats(`${M}@year`)).toMatchObject({ groups: 30, free_groups: 24 }); // @year = the subject row (as get_scope_availability)
    expect(fromDb.stats(`${M}@t1`)).toMatchObject({ groups: 21, free_groups: 19 });
    expect(fromDb.stats(`${M}@t2`)).toMatchObject({ total: 0, groups: 0 }); // no row → nothing offered
    expect(fromDb.stats(`${M}/x5a3afdd4`).total).toBe(0); // unit opener: never a pool
    // Free users and guests are judged on non-premium groups: 24 < 25 (free mini full-year), 24 ≥ 20 (guest mini).
    const fy = entryPointsFor(tree, resolveLearnNode(tree, M), fromDb, tree.subjectTerms(M)).primary.find((e) => e.template === "full-year");
    expect([fy.offers.premium.offered, fy.offers.free.offered, fy.offers.guest.offered]).toEqual([true, false, true]);
    expect(likePrefix("a_b%c\\d")).toBe("a\\_b\\%c\\\\d%");

    const missing = { from: () => ({ select: () => ({ like: () => ({ limit: async () => ({ data: null, error: { code: "42P01" } }) }) }) }) };
    expect((await loadSubjectPool({ tree, subjectId: M, db: missing, bank })).source).toBe("bank");
    const throwing = {
      rowsForNode: async () => {
        throw new Error("ENOENT");
      },
    };
    expect((await loadSubjectPool({ tree, subjectId: M, db: null, bank: throwing })).source).toBe("none");
    expect((await loadSubjectPool({ tree, subjectId: M })).stats(M).total).toBe(0);
    expect(poolFromScopeCounts(tree, [{ node_id: "x", band: 1, published_count: 1, group_count: 1 }]).source).toBe("none");
  });
});

describe("entry points (pool rule)", () => {
  const byKey = (list) => Object.fromEntries(list.map((e) => [e.key, e]));

  it("offers templates only when the pool has enough exclusion groups", async () => {
    const pool = createPoolIndex(tree, await rowsOf(M));
    const ctx = resolveLearnNode(tree, `${M}/n54`);
    const { primary, related } = entryPointsFor(tree, ctx, pool, tree.subjectTerms(M));
    expect(primary.map((e) => e.key)).toEqual([`lesson-quiz:${M}/n54`, `practice:${M}/n54`]);
    expect(related.map((e) => e.key)).toEqual([`chapter-quiz:${M}/n91`, `subject-quiz:${M}`, `term-exam:${M}@t1`, `term-exam:${M}@t2`, `full-year:${M}@year`]);
    const e = byKey([...primary, ...related]);
    const lessonGroups = pool.stats(`${M}/n54`);
    expect(e[`lesson-quiz:${M}/n54`].offers.premium).toMatchObject({ offered: true, mini: false, required: 3, available: lessonGroups.groups });
    expect(e[`lesson-quiz:${M}/n54`].offers.guest).toMatchObject({ offered: true, available: lessonGroups.free_groups, count: Math.min(10, lessonGroups.free_groups) });
    expect(e[`lesson-quiz:${M}/n54`].feedback).toBe("immediate");
    // Term 1 membership is inferred (allowed) but its pool is below the minimum of 20 → the honest reason.
    expect(pool.stats(`${M}@t1`).groups).toBeLessThan(20);
    expect(e[`term-exam:${M}@t1`].offers.premium).toMatchObject({ offered: false, reason: "insufficient_pool", required: 20 });
    expect(e[`term-exam:${M}@t1`].term).toBe("t1");
    for (const x of [...primary, ...related]) {
      for (const tier of ["guest", "free", "premium"]) {
        const o = x.offers[tier];
        if (o.offered) expect(o.available).toBeGreaterThanOrEqual(o.required);
        else expect(o.count).toBeNull();
      }
    }
  });

  it("gives free users and guests the mini full-year when the tier cap is below the template minimum", async () => {
    const pool = createPoolIndex(tree, await rowsOf(M));
    const e = byKey(entryPointsFor(tree, resolveLearnNode(tree, M), pool, tree.subjectTerms(M)).primary)[`full-year:${M}@year`];
    const s = pool.stats(`${M}@year`);
    expect(s.groups).toBeLessThan(30);
    expect(e.offers.premium).toMatchObject({ offered: false, mini: false, required: 30, reason: "insufficient_pool" });
    expect(e.offers.free).toMatchObject({ offered: s.free_groups >= 25, mini: true, required: 25 });
    expect(e.offers.guest).toMatchObject({ offered: s.free_groups >= 20, mini: true, required: 20 });
    expect(offerForTier(e, "elite")).toBe(e.offers.premium);
    expect(offerForTier(e, "nope")).toBe(e.offers.guest);
  });

  it("offers a term exam only for verified or inferred membership", () => {
    // Science: membership needs_review in both terms → blocked whatever the pool.
    const huge = { stats: () => ({ counts: { 1: 90, 2: 90, 3: 90 }, total: 270, groups: 270, free_groups: 270, free_total: 270 }) };
    const sci = byKey(entryPointsFor(tree, resolveLearnNode(tree, S), huge, tree.subjectTerms(S)).primary);
    for (const term of ["t1", "t2"]) {
      for (const tier of ["guest", "free", "premium"]) expect(sci[`term-exam:${S}@${term}`].offers[tier]).toMatchObject({ offered: false, reason: "term_unverified" });
    }
    expect(sci[`subject-quiz:${S}`].offers.premium.offered).toBe(true);
    const math = byKey(entryPointsFor(tree, resolveLearnNode(tree, M), huge, tree.subjectTerms(M)).primary);
    expect(math[`term-exam:${M}@t1`].offers.premium).toMatchObject({ offered: true, mini: false });
    expect(math[`term-exam:${M}@t2`].offers.free).toMatchObject({ offered: true, count: 25 }); // clamped to the free cap
    const verified = [{ subject_node_id: S, term: "t1", status: "verified" }];
    const sv = byKey(entryPointsFor(tree, resolveLearnNode(tree, S), huge, verified).primary);
    expect(sv[`term-exam:${S}@t1`].offers.premium.offered).toBe(true);
    expect(sv[`term-exam:${S}@t2`].offers.premium.reason).toBe("term_unverified");
  });

  it("lists unit entry points, and nothing is offered without a pool", () => {
    const empty = createPoolIndex(tree, []);
    const { primary, related } = entryPointsFor(tree, resolveLearnNode(tree, `${S}/x9368a8a7`), empty, tree.subjectTerms(S));
    expect(primary.map((e) => e.template)).toEqual(["chapter-quiz", "practice"]);
    expect(related.map((e) => e.template)).toEqual(["subject-quiz", "term-exam", "term-exam", "full-year"]);
    for (const e of [...primary, ...related]) for (const o of Object.values(e.offers)) expect(o.offered).toBe(false);
    expect(primary[0].offers.guest.reason).toBe("insufficient_pool");
  });
});

describe("outline and page model", () => {
  it("builds the compact subject outline (term badges, printed pages, pool sizes)", async () => {
    const pool = createPoolIndex(tree, await rowsOf(M));
    const o = compactOutline(tree, M, pool);
    expect(o.lessons).toBe(7);
    expect(o.units.map((u) => [u.id, u.term, u.lessons.length])).toEqual([
      [`${M}/n91`, { state: "inferred", term: "t1" }, 4],
      [`${M}/n92`, { state: "inferred", term: "t2" }, 3],
    ]);
    const n54 = o.units[0].lessons[1];
    expect(n54).toMatchObject({ id: `${M}/n54`, pages: { start: 12, end: 14 }, pool: pool.stats(`${M}/n54`).total, opener: false, review: false });
    expect(o.units[1].lessons[0]).toMatchObject({ opener: true, review: true, pool: 0, pages: null });
    const sci = compactOutline(tree, S, pool);
    expect(sci.units[0].lessons.map((l) => [l.id.split("/").pop(), l.chapter])).toEqual([
      ["xe389fa43", "تركيب المادة"],
      ["xc241a07b", "تركيب المادة"],
      ["xa3e7e839", null],
    ]);
    expect(JSON.parse(JSON.stringify(o))).toEqual(o);
    expect(compactOutline(tree, "nope", pool)).toBeNull();
  });

  it("models lesson, unit and subject pages", async () => {
    const pool = createPoolIndex(tree, await rowsOf(M));
    const lesson = learnPageModel(tree, resolveLearnNode(tree, `${M}/n54`), pool);
    expect(lesson.kind).toBe("lesson");
    expect(lesson.trail.map((n) => n.href)).toEqual(["/curriculum/middle", "/curriculum/middle/grade-1", `/learn/${M}`, `/learn/${M}/n91`, null]);
    expect(lesson.lesson.pages[0].href).toMatch(/#page=14$/);
    expect(lesson.lesson.prev.id).toBe(`${M}/n53`);
    expect(lesson.lesson.next.id).toBe(`${M}/n55`);
    expect(lesson.lesson.pool.total).toBe(pool.stats(`${M}/n54`).total);
    expect(lesson.lesson.unit.id).toBe(`${M}/n91`);
    expect(lesson.lesson.objectives).toEqual([]);
    expect(lesson.resources.map((r) => r.state)).toEqual(["external_official", "unavailable", "needs_review", "external_official"]);
    expect(lesson.counts).toEqual({ units: 2, lessons: 7 });
    expect(lesson.term).toEqual({ state: "inferred", term: "t1" });
    expect(JSON.parse(JSON.stringify(lesson))).toEqual(lesson);

    const withObjectives = createOutlineTree({
      nodes: FIXTURE.nodes.map((n) => (n.id === `${M}/n54` ? { ...n, objectives: [{ id: "obj-0123456789", text_ar: "يكتب القوى", text_en: null }, { text_ar: " " }] } : n)),
    });
    expect(learnPageModel(withObjectives, resolveLearnNode(withObjectives, `${M}/n54`), pool).lesson.objectives).toEqual([
      { id: "obj-0123456789", text: "يكتب القوى", text_en: null },
    ]);

    const unit = learnPageModel(tree, resolveLearnNode(tree, `${M}/n92`), pool);
    expect(unit.outline.units).toHaveLength(1);
    expect(unit.outline.units[0].lessons.map((l) => l.id)).toEqual([`${M}/x5a3afdd4`, `${M}/n61`, `${M}/n62`]);
    expect(unit.lesson).toBeNull();
    const subject = learnPageModel(tree, resolveLearnNode(tree, M), pool);
    expect(subject.outline.units).toHaveLength(2);
    expect(subject.entries.primary.map((e) => e.template)).toEqual(["subject-quiz", "term-exam", "term-exam", "full-year", "practice"]);
  });

  it("resolves the generated outline of a real leaf", async () => {
    const real = await loadOutline("middle/grade-1");
    const ctx = resolveLearnNode(real, "middle/grade-1/math");
    expect(ctx?.node.kind).toBe("subject");
    const model = learnPageModel(real, ctx, createPoolIndex(real, []));
    expect(model.outline.units.length).toBeGreaterThan(3);
    expect(model.counts.lessons).toBeGreaterThan(50);
    expect(model.resources.every((r) => r.href === null || r.href.startsWith("https://"))).toBe(true);
    // No pool yet → every quiz says "not enough questions" (never a fake count).
    for (const e of model.entries.primary) for (const o of Object.values(e.offers)) expect(o.offered).toBe(false);
    const lessonId = model.outline.units[0].lessons.find((l) => !l.opener)?.id;
    expect(resolveLearnNode(real, lessonId)?.node.kind).toBe("lesson");
    expect(resolveLearnNode(real, "middle/grade-1/ien-7846")).toBeNull(); // source-only subject
    expect(parseLearnPath(lessonId.split("/"))).toEqual({ nodeId: lessonId });
  });
});

describe("content titles take their language from the data (§7)", () => {
  it("reads the language of a title from its own text", () => {
    expect(contentLang("Then and Now")).toEqual({ lang: "en", dir: "ltr", font: "font-en" });
    expect(contentLang("الكسور العشرية")).toEqual({ lang: "ar", dir: "rtl", font: "font-ar" });
    expect(contentLang("3. Unit (2024)")).toMatchObject({ lang: "en" }); // digits and marks are neutral: the first letter decides
    expect(contentLang("123")).toMatchObject({ lang: "ar" }); // no letters → the listing's language
    expect(contentLang("123", "en")).toMatchObject({ lang: "en" });
    expect(contentLang(null)).toMatchObject({ lang: "ar" });
  });

  it("never forces an English lesson, unit or file title right-to-left (Arabic UI)", async () => {
    const t = createTranslator("ar", await loadMessages("ar", ["learn"]), "learn");
    const outline = {
      units: [
        { id: `${M}/u1`, title: "Then and Now", title_en: "Then and Now", term: null, pool: 0,
          lessons: [{ id: `${M}/n1`, title: "What Are You Doing?", title_en: null, chapter: "Unit 1", pages: null, pool: 0 }] },
        { id: `${M}/u2`, title: "الكسور", title_en: null, term: null, pool: 0,
          lessons: [{ id: `${M}/n2`, title: "جمع الكسور", title_en: null, chapter: null, pages: null, pool: 0 }] },
      ],
      lessons: 2,
    };
    const html = renderToStaticMarkup(createElement(SubjectOutline, { outline, t, locale: "ar", openFirst: 9 }));
    expect(html).toMatch(/<span lang="en" dir="ltr" class="[^"]*font-en[^"]*">What Are You Doing\?<\/span>/);
    expect(html).toMatch(/<span lang="en" dir="ltr" class="[^"]*">Then and Now<\/span>/);
    expect(html).toMatch(/<span lang="en" dir="ltr" class="[^"]*">Unit 1<\/span>/);
    expect(html).toMatch(/<span lang="ar" dir="rtl" class="[^"]*font-ar[^"]*">جمع الكسور<\/span>/);
    expect(html).not.toMatch(/lang="ar" dir="rtl"[^>]*>(What Are You Doing|Then and Now|Unit 1)/);
    const file = renderToStaticMarkup(createElement(ResourceState, { item: resourceView({ ...RESOURCES[0], title: "Super Goal 1 / Student's Book" }), t, locale: "ar" }));
    expect(file).toMatch(/<p lang="en" dir="ltr" class="[^"]*">Super Goal 1 \/ Student&#x27;s Book<\/p>/);
    const ar = renderToStaticMarkup(createElement(ResourceState, { item: resourceView(RESOURCES[0]), t, locale: "en" }));
    expect(ar).toMatch(/<p lang="ar" dir="rtl" class="[^"]*font-ar/);
  });

  it("names the quiz scope in the UI language when the outline has an English title (ExamEntryPoints)", async () => {
    const entry = (title, title_en) => ({
      key: `subject-quiz:${M}`, template: "subject-quiz", scope: M, title, title_en, term: null, timed: true, feedback: "end",
      offers: { guest: { offered: false, reason: "insufficient_pool", required: 10, available: 0 } },
    });
    const render = async (locale, e) => {
      ui.locale = locale;
      ui.t = createTranslator(locale, await loadMessages(locale, ["learn"]), "learn");
      return renderToStaticMarkup(createElement(ExamEntryPoints, { primary: [e] }));
    };
    const en = await render("en", entry("الرياضيات", "Mathematics"));
    expect(en).toMatch(/<span lang="en" dir="ltr" class="[^"]*font-en[^"]*">Mathematics<\/span>/);
    expect(en).not.toContain("الرياضيات");
    // No English title: the listed Arabic title, marked with its own language and direction.
    const fallback = await render("en", entry("التجويد (التحفيظ)", null));
    expect(fallback).toMatch(/<span lang="ar" dir="rtl" class="[^"]*font-ar[^"]*">التجويد \(التحفيظ\)<\/span>/);
    const ar = await render("ar", entry("الرياضيات", "Mathematics"));
    expect(ar).toMatch(/<span lang="ar" dir="rtl" class="[^"]*">الرياضيات<\/span>/);
    expect(ar).not.toContain("Mathematics");
  });
});

describe("unknown learn paths are a real 404 (layout.js, outside the loading boundary)", () => {
  const layout = (path) => LearnPathLayout({ children: "page", params: Promise.resolve({ locale: "en", path }) });

  it("renders the page for every kind of outline node", async () => {
    expect(await layout(["middle", "grade-1", "math"])).toBe("page");
    expect(await layout(["middle", "grade-1", "math", "n91"])).toBe("page");
    expect(await layout(["middle", "grade-1", "math", "n54"])).toBe("page");
  });

  it("calls notFound() for malformed, unknown-leaf, unknown-subject and unknown-node paths", async () => {
    for (const path of [["nonsense"], ["middle", "grade-1", "nonsense"], ["middle", "grade-9", "math"], ["middle", "grade-1", "math", "zzz"], ["..", "x"]]) {
      await expect(layout(path), path.join("/")).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    }
  });
});

describe("GET /api/content/outline (the subject drawer's lazy payload)", () => {
  const call = async (query) => {
    const { GET } = await import("@/app/api/content/outline/route");
    const res = await GET(new Request(`http://localhost/api/content/outline${query}`));
    return { status: res.status, cache: res.headers.get("cache-control"), body: await res.json() };
  };

  it("rejects malformed ids and answers only for visible subject nodes", async () => {
    for (const q of ["", "?subject=", "?subject=middle", "?subject=middle/grade-1", "?subject=..%2F..%2Fetc%2Fpasswd", "?subject=middle/grade-1/Math", `?subject=${"a/".repeat(8)}a`]) {
      const r = await call(q);
      expect(r.status, q).toBe(400);
      expect(r.body).toEqual({ error: "invalid_argument", field: "subject" });
      expect(r.cache).toBe("no-store");
    }
    const real = await loadOutline("middle/grade-1");
    const unit = real.childrenOf("middle/grade-1/math").map((id) => real.nodeById(id)).find((n) => n.kind === "unit");
    for (const id of ["middle/grade-1/nope", "middle/grade-1/ien-7846", unit.id, "elementary/grade-9/math"]) {
      const r = await call(`?subject=${encodeURIComponent(id)}`);
      expect(r.status, id).toBe(404);
      expect(r.body).toEqual({ error: "not_found" });
    }
  });

  it("serves one subject's outline, entry points and files, CDN-cacheable and much smaller than the leaf", async () => {
    const r = await call("?subject=middle/grade-1/math");
    expect(r.status).toBe(200);
    expect(r.cache).toMatch(/public/);
    expect(r.cache).toMatch(/s-maxage=\d+/);
    expect(r.body).toMatchObject({ subject: "middle/grade-1/math", href: "/learn/middle/grade-1/math" });
    expect(r.body.outline.units.length).toBeGreaterThan(3);
    expect(r.body.outline.lessons).toBeGreaterThan(50);
    expect(Array.isArray(r.body.entries.primary)).toBe(true);
    expect(r.body.books.length).toBeGreaterThan(0);
    expect(r.body.books.every((b) => b.href === null || b.href.startsWith("https://"))).toBe(true);
    // Same shape the drawer used to receive eagerly (compactOutline / entryPointsFor / resourceView).
    const real = await loadOutline("middle/grade-1");
    const ctx = resolveLearnNode(real, "middle/grade-1/math");
    expect(r.body.outline.units.map((u) => u.id)).toEqual(compactOutline(real, ctx.node.id, createPoolIndex(real, [])).units.map((u) => u.id));
    // One subject is a fraction of the whole leaf the page used to embed.
    const leafBytes = real.outlineFor("middle/grade-1").subjects
      .map((id) => JSON.stringify(compactOutline(real, id, createPoolIndex(real, []))).length)
      .reduce((a, b) => a + b, 0);
    expect(JSON.stringify(r.body).length).toBeLessThan(leafBytes / 2);
  });
});
