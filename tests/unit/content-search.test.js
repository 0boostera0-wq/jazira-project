// Content search without a database (docs/CONTENT_ENGINE.md §7 "Search", §6.2
// search_content): the normalized in-memory outline index, strict parameter
// parsing, pagination and caps, the < 50 ms budget over 10k+ lessons, the
// GET /api/content/search route (database first, index fallback, never a
// question group for anonymous callers), and the client data layer.
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("@/lib/supabase-admin", () => ({ createAdminClient: () => globalThis.__jzAdmin ?? null }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: async () => Boolean(globalThis.__jzLimited) }));
vi.mock("@/lib/supabase-lazy", () => ({ getSupabase: async () => globalThis.__jzBrowser ?? null }));

import {
  CONTENT_KINDS, buildContentIndex, getContentIndex, parseContentQuery, resetContentIndex, searchContentIndex,
} from "@/lib/search/content-search";
import { GET } from "@/app/api/content/search/route";
import { clearSearchCache, createContentSearcher, searchContent } from "@/lib/data/search";
import { resetRuntimeBank } from "@/lib/exams/engine/runtime-bank.server";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const FIXTURE = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/content/outline-tree.json"), "utf8"));
const BANK = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/engine/runtime-bank/index.json"), "utf8"));
const M = "middle/grade-1/math";
const RESOURCES = [
  { id: "ien-120607", subject_node_id: M, kind: "student_book", title: "مقرر الرياضيات /كتاب الطالب الجزء الأول", part: 1, availability: "external_official",
    url: "https://iencontent.ien.edu.sa/books/1448-GE-ME-K07-SM1-math-part1.pdf", status: "active" },
  { id: "ien-bank-90", subject_node_id: M, kind: "question_bank_external", title: "الرياضيات", availability: "external_official",
    url: "https://www.ien.edu.sa/?choice=2#/subjectselfassessments/90", external_count: 545, status: "active" },
];
const HIDDEN = [
  { id: "middle/grade-1/ien-7846", parent_id: "middle/grade-1", kind: "subject", order: 9, title_ar: "اللغة الصينية", status: "source_only" },
  { id: "middle/grade-1/ien-7846/n1", parent_id: "middle/grade-1/ien-7846", kind: "lesson", order: 1, title_ar: "الأسس الصينية", status: "source_only" },
];
const OUTLINE = { leaf: FIXTURE.leaf, nodes: [...FIXTURE.nodes, ...HIDDEN], resources: [...RESOURCES, { ...RESOURCES[0], id: "ien-9", subject_node_id: HIDDEN[0].id }] };
const index = buildContentIndex([OUTLINE], { bankNodes: BANK.nodes });
const ids = (g) => g.items.map((x) => x.id);

describe("parseContentQuery", () => {
  const p = (o) => parseContentQuery(new URLSearchParams(o));
  it("accepts a normal query with defaults", () => {
    expect(p({ q: "  الأسس   والقوى " })).toEqual({ ok: true, value: { q: "الأسس والقوى", kinds: null, node: null, limit: 10, offset: 0 } });
    expect(p({ q: "ab", kinds: "exam,node", node: "middle/grade-1", limit: "20", offset: "100" }).value).toEqual({
      q: "ab", kinds: ["node", "exam"], node: "middle/grade-1", limit: 20, offset: 100,
    });
  });
  it("rejects bad input with the field", () => {
    expect(p({ q: "ا" })).toMatchObject({ ok: false, error: "invalid_argument", field: "q" });
    expect(p({ q: "x".repeat(101) }).field).toBe("q");
    expect(p({}).field).toBe("q");
    expect(p({ q: "ab", kinds: "question" }).field).toBe("kinds"); // never a question group here
    expect(p({ q: "ab", kinds: "node,node,node,node" }).field).toBe("kinds");
    for (const node of ["../etc", "Middle", "a//b", "a/b/", "x".repeat(161)]) expect(p({ q: "ab", node }).field).toBe("node");
    for (const limit of ["0", "21", "-1", "1.5", "abc", "99999"]) expect(p({ q: "ab", limit }).field).toBe("limit");
    for (const offset of ["101", "-1", "x"]) expect(p({ q: "ab", offset }).field).toBe("offset");
  });
});

describe("the outline index", () => {
  it("finds lessons, units and subjects with Arabic normalization", () => {
    const r = searchContentIndex(index, { q: "الاسس" }); // no hamza → matches «القوى و الأسس»
    expect(r.query).toBe("الاسس");
    expect(ids(r.groups.node)).toEqual([`${M}/n54`]);
    expect(r.groups.node.items[0]).toMatchObject({ kind: "lesson", title: "القوى و الأسس", subject: M, subject_title: "الرياضيات", href: `/learn/${M}/n54`, parent_title: "الجبر و الدوال" });
    expect(Object.keys(r.groups)).toEqual(["node", "resource", "exam"]);
    expect(r.groups.question).toBeUndefined();
    // A subject ranks before its lessons; a grade word narrows by place.
    const math = searchContentIndex(index, { q: "الرياضيات", kinds: ["node"] });
    expect(math.groups.node.items[0].id).toBe(M);
    expect(ids(searchContentIndex(index, { q: "العلوم الصف الاول" }).groups.node)[0]).toBe("middle/grade-1/science");
    expect(searchContentIndex(index, { q: "Mathematics" }).groups.node.items[0].id).toBe(M);
  });

  it("never indexes source-only subjects, their lessons or files, or term nodes", () => {
    expect(searchContentIndex(index, { q: "الصينية" }).groups.node.total).toBe(0);
    expect(ids(searchContentIndex(index, { q: "الفصل الدراسي" }).groups.node)).toEqual([]);
    expect(index.entries.some((e) => e.item.id === "ien-9")).toBe(false);
  });

  it("lists official files as link-outs to the subject page", () => {
    const r = searchContentIndex(index, { q: "كتاب الطالب", kinds: ["resource"] });
    expect(Object.keys(r.groups)).toEqual(["resource"]);
    expect(r.groups.resource.items).toEqual([
      expect.objectContaining({ id: "ien-120607", kind: "student_book", part: 1, url: RESOURCES[0].url, href: `/learn/${M}`, subject: M }),
    ]);
    expect(searchContentIndex(index, { q: "الرياضيات", kinds: ["resource"] }).groups.resource.items.map((x) => x.id)).toEqual(["ien-bank-90", "ien-120607"]); // an exact title match ranks first
  });

  it("offers quizzes only where published questions reach the template minimum", () => {
    const r = searchContentIndex(index, { q: "الرياضيات", kinds: ["exam"] });
    const byScope = Object.fromEntries(r.groups.exam.items.map((x) => [x.scope, x]));
    expect(byScope[M]).toMatchObject({ template: "subject-quiz", kind: "subject-quiz", href: `/learn/${M}`, count: 31 });
    const lessons = searchContentIndex(index, { q: "الاسس", kinds: ["exam"] }).groups.exam.items;
    expect(lessons).toEqual([expect.objectContaining({ id: `lesson-quiz:${M}/n54`, template: "lesson-quiz", count: 6 })]);
    // An opener or a lesson being verified never leads to a quiz even with items.
    expect(searchContentIndex(index, { q: "مدخل وحدة", kinds: ["exam"] }).groups.exam.total).toBe(0);
    expect(searchContentIndex(index, { q: "مراجعة تراكمية", kinds: ["exam"] }).groups.exam.total).toBe(0);
    // No bank → no exam group entries at all.
    expect(buildContentIndex([OUTLINE]).entries.some((e) => e.group === "exam")).toBe(false);
  });

  it("filters by subtree and kinds, and pages", () => {
    expect(searchContentIndex(index, { q: "ال", node: "middle/grade-1/science", kinds: ["node"] }).groups.node.items.every((x) => x.subject === "middle/grade-1/science")).toBe(true);
    expect(searchContentIndex(index, { q: "الاسس", node: "middle/grade-1/science" }).groups.node.total).toBe(0);
    // A lesson filter keeps its subject's files (search_content: p_node like subject || '/%'), never another subject's.
    expect(ids(searchContentIndex(index, { q: "كتاب الطالب", kinds: ["resource"], node: `${M}/n54` }).groups.resource)).toEqual(["ien-120607"]);
    expect(searchContentIndex(index, { q: "كتاب الطالب", kinds: ["resource"], node: "middle/grade-1/science/n1" }).groups.resource.total).toBe(0);
    const all = searchContentIndex(index, { q: "ال", kinds: ["node"], limit: 20 }).groups.node;
    const page2 = searchContentIndex(index, { q: "ال", kinds: ["node"], limit: 3, offset: 3 }).groups.node;
    expect(page2.total).toBe(all.total);
    expect(ids(page2)).toEqual(ids(all).slice(3, 6));
    expect(searchContentIndex(index, { q: "a" }).groups.node.total).toBe(0); // < 2 chars after normalization
  });
});

/** A synthetic curriculum of `lessons` lessons (Arabic titles) across 120 subjects. */
function syntheticOutlines(lessons) {
  const words = ["الكسور", "الجمع", "الطرح", "القسمة", "المعادلات", "الهندسة", "الزوايا", "المساحة", "الحجم", "الإحصاء", "الاحتمالات", "النسبة", "التناسب", "الدوال", "المتباينات"];
  const outlines = [];
  let made = 0;
  for (let g = 0; made < lessons; g++) {
    const leaf = `stage${g}/grade-1`;
    const nodes = [
      { id: `stage${g}`, parent_id: null, kind: "stage", order: 1, title_ar: `المرحلة ${g}`, status: "verified" },
      { id: leaf, parent_id: `stage${g}`, kind: "grade", order: 1, title_ar: `الصف ${g}`, title_en: `Grade ${g}`, status: "verified" },
    ];
    for (let s = 0; s < 6 && made < lessons; s++) {
      const sid = `${leaf}/subject-${s}`;
      nodes.push({ id: sid, parent_id: leaf, kind: "subject", order: s + 1, title_ar: `الرياضيات ${s}`, title_en: `Math ${s}`, status: "verified" });
      for (let u = 0; u < 10 && made < lessons; u++) {
        const uid = `${sid}/n${u + 1}`;
        nodes.push({ id: uid, parent_id: sid, kind: "unit", order: u + 1, title_ar: `الوحدة ${words[u % words.length]}`, status: "verified" });
        for (let l = 0; l < 14 && made < lessons; l++, made++) {
          nodes.push({ id: `${sid}/n${1000 + made}`, parent_id: uid, kind: "lesson", order: l + 1, title_ar: `${words[(made * 7) % words.length]} والتطبيقات ${made}`, status: "verified" });
        }
      }
    }
    outlines.push({ leaf, nodes, resources: [] });
  }
  return outlines;
}

describe("performance", () => {
  it("answers over 10k lessons in < 50 ms with pagination (index in memory)", () => {
    const big = buildContentIndex(syntheticOutlines(10500));
    expect(big.entries.filter((e) => e.item.kind === "lesson")).toHaveLength(10500);
    const queries = ["الكسور", "المعادلات والتطبيقات", "الرياضيات 3", "Math", "الهندسه", "التطبيقات 9999", "zz"];
    searchContentIndex(big, { q: "warm up" });
    // Median of 5 runs per query: one GC pause on a busy machine is not the search.
    const median = (f) => {
      const times = [];
      let out;
      for (let k = 0; k < 5; k++) {
        const t0 = performance.now();
        out = f();
        times.push(performance.now() - t0);
      }
      return { out, ms: times.sort((x, y) => x - y)[2] };
    };
    for (const q of queries) {
      const { out: r, ms } = median(() => searchContentIndex(big, { q, limit: 20, offset: 20 }));
      expect({ q, fast: ms < 50 }).toEqual({ q, fast: true });
      expect(r.groups.node.items.length).toBeLessThanOrEqual(20);
      expect(r.groups.node.total).toBeLessThanOrEqual(100);
    }
    const capped = searchContentIndex(big, { q: "التطبيقات" }).groups.node;
    expect(capped).toMatchObject({ total: 100, capped: true });
    expect(capped.items).toHaveLength(10);
  });

  it("indexes every generated leaf (the real 10,102 lessons) and stays fast", async () => {
    resetContentIndex();
    const real = await getContentIndex({ bankIndex: null });
    const lessons = real.entries.filter((e) => e.group === "node" && e.item.kind === "lesson").length;
    expect(lessons).toBeGreaterThan(9000);
    const t0 = performance.now();
    const r = searchContentIndex(real, { q: "الكسور" });
    expect(performance.now() - t0).toBeLessThan(50);
    expect(r.groups.node.total).toBeGreaterThan(0);
    expect(r.groups.node.items.every((x) => x.href.startsWith("/learn/"))).toBe(true);
    // Memoized per instance (same bank revision → same index object).
    expect(await getContentIndex({ bankIndex: null })).toBe(real);
  });
});

describe("GET /api/content/search", () => {
  const call = (qs) => GET(new Request(`http://localhost/api/content/search?${qs}`));
  beforeEach(() => {
    globalThis.__jzAdmin = null;
    globalThis.__jzLimited = false;
    process.env.RUNTIME_BANK_DIR = path.join(ROOT, "tests/fixtures/engine/runtime-bank");
    resetRuntimeBank();
    resetContentIndex();
  });
  afterAll(() => {
    delete process.env.RUNTIME_BANK_DIR;
    resetRuntimeBank();
    resetContentIndex();
  });

  it("answers from the outline index without a database", async () => {
    const res = await call(new URLSearchParams({ q: "الكسور", limit: "5" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.source).toBe("index");
    expect(Object.keys(body.groups)).toEqual(CONTENT_KINDS);
    expect(body.groups.node.items.length).toBeGreaterThan(0);
    expect(body.groups.node.items.length).toBeLessThanOrEqual(5);
    expect(JSON.stringify(body)).not.toMatch(/"stem"|"answer"|"explanation"/);
  });

  it("validates input and rate-limits", async () => {
    expect((await call("q=a")).status).toBe(400);
    expect(await (await call("q=ab&kinds=question")).json()).toEqual({ error: "invalid_argument", field: "kinds" });
    expect((await call("q=ab&node=../x")).status).toBe(400);
    globalThis.__jzLimited = true;
    const limited = await call("q=abc");
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
  });

  it("asks search_content with the service role as anonymous, and drops any question group", async () => {
    const calls = [];
    globalThis.__jzAdmin = {
      rpc: async (fn, args) => {
        calls.push([fn, args]);
        return {
          data: {
            query: "الاسس",
            groups: {
              node: { total: 1, items: [{ id: `${M}/n54`, kind: "lesson", title: "القوى و الأسس", subject: M, href: `/learn/${M}/n54` }] },
              resource: { total: 0, items: [] },
              exam: { total: 0, items: [] },
              question: { total: 1, items: [{ lesson: `${M}/n54`, count: 4 }] },
            },
          },
          error: null,
        };
      },
    };
    const body = await (await call(new URLSearchParams({ q: "الأسس", kinds: "node,exam", node: "middle/grade-1", limit: "3", offset: "3" }))).json();
    expect(calls).toEqual([["search_content", { p_q: "الأسس", p_kinds: ["node", "exam"], p_node: "middle/grade-1", p_limit: 3, p_offset: 3, p_anon: true }]]);
    expect(body.source).toBe("db");
    expect(Object.keys(body.groups)).toEqual(["node", "exam"]);
    expect(body.groups.question).toBeUndefined();
    expect(body.groups.node.items[0].id).toBe(`${M}/n54`);
  });

  it("answers search_content exam rows in the index's shape, and never queries for punctuation-only input", async () => {
    const calls = [];
    globalThis.__jzAdmin = {
      rpc: async (fn, args) => {
        calls.push(fn);
        return {
          data: {
            query: "الرياضيات",
            groups: {
              exam: { total: 2, items: [
                { node: M, kind: "subject", title: "الرياضيات", template: "subject-quiz", count: 30, href: `/learn/${M}` },
                { node: `${M}/n54`, kind: "lesson", title: "القوى و الأسس", template: "lesson-quiz", count: 4, href: `/learn/${M}/n54` },
              ] },
            },
          },
          error: null,
        };
      },
    };
    const body = await (await call(new URLSearchParams({ q: "الرياضيات", kinds: "exam", limit: "1" }))).json();
    expect(body.source).toBe("db");
    expect(body.groups.exam.items).toEqual([
      { id: `subject-quiz:${M}`, kind: "subject-quiz", template: "subject-quiz", scope: M, node_kind: "subject", title: "الرياضيات", count: 30, href: `/learn/${M}` },
    ]); // at most `limit` rows, same shape as the outline index
    const punct = await call(new URLSearchParams({ q: "؟؟ !!" }));
    expect(punct.status).toBe(200);
    expect((await punct.json()).groups.node).toEqual({ total: 0, capped: false, items: [] });
    expect(calls).toEqual(["search_content"]);
  });

  it("falls back to the index when search_content is not deployed", async () => {
    globalThis.__jzAdmin = { rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }) };
    const body = await (await call(new URLSearchParams({ q: "الرياضيات", kinds: "exam" }))).json();
    expect(body.source).toBe("index");
    // The fixture bank has published items for middle/grade-1/math → a subject quiz entry.
    expect(body.groups.exam.items.map((x) => x.id)).toContain(`subject-quiz:${M}`);
  });
});

describe("client data layer: searchContent", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    clearSearchCache();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock;
    globalThis.__jzBrowser = null;
  });

  it("sends guests to the route with the paging, kinds and subtree", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ query: "الاسس", source: "index", groups: { node: { total: 1, items: [{ id: "a" }] } } }), { status: 200 }));
    const r = await searchContent("  الأسس ", { kinds: ["node", "question"], node: "middle/grade-1", limit: 10, offset: 10 });
    const url = new URL(fetchMock.mock.calls[0][0], "http://x");
    expect(url.pathname).toBe("/api/content/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "الأسس", limit: "10", offset: "10", kinds: "node", node: "middle/grade-1" });
    expect(r).toEqual({ query: "الاسس", available: true, source: "index", groups: { node: { total: 1, capped: false, items: [{ id: "a" }] } } });
    // cached per viewer
    await searchContent("الأسس", { kinds: ["node", "question"], node: "middle/grade-1", limit: 10, offset: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never sends short queries and validates options", async () => {
    expect(await searchContent("ا")).toEqual({ query: "ا", available: true, source: null, groups: {} });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(searchContent("abc", { limit: 0 })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(searchContent("abc", { offset: 101 })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(searchContent("abc", { kinds: ["stems"] })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(searchContent("abc", { node: "../x" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect((await searchContent("abc", { kinds: ["question"] })).groups).toEqual({}); // anonymous: no question group, no request
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps route errors", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }));
    await expect(searchContent("abc")).rejects.toMatchObject({ code: "rate_limited" });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "unavailable" }), { status: 503 }));
    expect((await searchContent("abcd")).available).toBe(false);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(searchContent("abcde")).rejects.toMatchObject({ code: "network" });
  });

  it("asks search_content directly when signed in, falling back to the route when it is missing", async () => {
    const rpc = vi.fn();
    const chain = (result) => ({ abortSignal: () => Promise.resolve(result), then: (f, r) => Promise.resolve(result).then(f, r) });
    globalThis.__jzBrowser = {
      auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }), onAuthStateChange: () => {} },
      rpc: (fn, args) => chain(rpc(fn, args)),
    };
    rpc.mockReturnValueOnce({ data: { query: "الاسس", groups: { question: { total: 1, items: [{ lesson: `${M}/n54`, count: 4, href: `/learn/${M}/n54` }] } } }, error: null });
    const r = await searchContent("الأسس", { kinds: ["question"] });
    expect(rpc).toHaveBeenCalledWith("search_content", { p_q: "الأسس", p_kinds: ["question"], p_node: null, p_limit: 5, p_offset: 0 });
    expect(r.source).toBe("db");
    expect(r.groups.question.items[0]).toEqual({ lesson: `${M}/n54`, count: 4, href: `/learn/${M}/n54` });
    expect(fetchMock).not.toHaveBeenCalled();

    rpc.mockReturnValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find the function public.search_content" } });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ query: "x", source: "index", groups: { node: { total: 0, items: [] } } }), { status: 200 }));
    const fb = await searchContent("كسور");
    expect(fb.source).toBe("index");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("debounces and cancels stale typeahead requests", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(async (url) => new Response(JSON.stringify({ query: new URL(url, "http://x").searchParams.get("q"), groups: {} }), { status: 200 }));
      const s = createContentSearcher({ delay: 250 });
      const first = s.search("الكس");
      const second = s.search("الكسور");
      await expect(first).rejects.toMatchObject({ code: "aborted" });
      await vi.advanceTimersByTimeAsync(260);
      expect((await second).query).toBe("الكسور");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((await s.search("a")).groups).toEqual({});
      s.cancel();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("search page helpers for content groups", () => {
  it("links only to /learn/<node id> (a database row can't point elsewhere)", async () => {
    const { contentHref, contentHasMore, contentCount, contentGroupsWithRows, CONTENT_SEARCH_GROUPS } = await import("@/components/search/model");
    expect(CONTENT_SEARCH_GROUPS).toEqual(["node", "exam", "resource", "question"]);
    expect(contentHref("node", { id: `${M}/n54`, href: `/learn/${M}/n54` })).toBe(`/learn/${M}/n54`);
    expect(contentHref("node", { id: `${M}/n54`, href: "https://evil.example/x" })).toBe(`/learn/${M}/n54`);
    expect(contentHref("node", { id: "../../etc", href: "//evil.example" })).toBeNull();
    expect(contentHref("exam", { scope: `${M}@t1` })).toBe(`/learn/${M}`);
    expect(contentHref("resource", { id: "ien-1", subject: M, url: "https://iencontent.ien.edu.sa/books/a.pdf" })).toBe(`/learn/${M}`);
    expect(contentHref("question", { lesson: `${M}/n54`, count: 4 })).toBe(`/learn/${M}/n54`);
    expect(contentHref("question", { lesson: "javascript:alert(1)" })).toBeNull();
    // search_content rows: exam { template, node } (no id), and catalog nodes, which have no learn page.
    const { contentKey } = await import("@/components/search/model");
    const dbExams = [{ node: M, template: "subject-quiz", kind: "subject" }, { node: `${M}/n54`, template: "lesson-quiz", kind: "lesson" }];
    expect(dbExams.map((x) => contentHref("exam", { ...x, href: undefined }))).toEqual([`/learn/${M}`, `/learn/${M}/n54`]);
    expect(new Set(dbExams.map((x) => contentKey("exam", x))).size).toBe(2);
    expect(contentHref("node", { id: "middle/grade-1", kind: "grade", href: null })).toBe("/curriculum/middle/grade-1");
    expect(contentHref("node", { id: "middle", kind: "stage" })).toBe("/curriculum/middle");
    expect(contentHref("node", { id: "middle", kind: "lesson" })).toBeNull(); // /learn/middle is not a page
    expect(contentHref("node", { id: "x", kind: "grade", href: "/learn/a/b/c" })).toBe("/curriculum/x");
    const res = { groups: { node: { total: 100, capped: true, items: [] }, exam: { total: 3, capped: false, items: [{ id: "a" }] } } };
    expect(contentCount(res, "node")).toEqual({ n: 100, capped: true });
    expect(contentCount(res, "resource")).toBeNull();
    expect(contentHasMore(res, "node", 100)).toBe(true);
    expect(contentHasMore(res, "node", 120)).toBe(false); // search_content accepts offsets up to 100
    expect(contentHasMore(res, "exam", 3)).toBe(false);
    expect(contentHasMore(res, "exam", 2)).toBe(true);
    expect(contentGroupsWithRows(res)).toEqual(["exam"]);
  });

  it("lists subject learn pages in the sitemap (never source-only subjects)", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/learn/middle/grade-1/math"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/en/learn/middle/grade-1/math"))).toBe(true);
    expect(urls.some((u) => /\/learn\/middle\/grade-1\/ien-\d+$/.test(u))).toBe(false);
    expect(urls.some((u) => /\/learn\/.+\/n\d+$/.test(u))).toBe(false); // lessons are reached from their subject
  });
});

describe("the /search page renders the content groups (wiring)", () => {
  // No DOM in this suite: the client island is checked at the source level, the
  // behaviour of every piece it uses (searcher, route, helpers) is tested above.
  const src = readFileSync(path.join(ROOT, "src/components/search/SearchExperience.jsx"), "utf8");

  it("searches content server-side with the debounced, cancelling searcher (one request per query)", () => {
    expect(src).toMatch(/createContentSearcher\(\{ limit: CONTENT_PAGE \}\)/);
    expect(src).toMatch(/contentSearcherRef\.current\?\.cancel\(\)/);
    expect(src).not.toMatch(/loadOutline|curriculum-outline|content-search"/); // never a client-side scan of the outline
  });

  it("shows lessons & units, quizzes, books (and lesson-level counts) in 'all' and pages them in 'curriculum'", () => {
    expect(src).toMatch(/const CONTENT_ICONS = \{ node: \w+, exam: \w+, resource: \w+, question: \w+ \}/);
    expect(src).toMatch(/<ContentRow key=\{contentKey\(g, item\)\}/);
    expect(src).toMatch(/contentSection\(false\)/); // "all" tab preview
    expect(src).toMatch(/contentSection\(true\)/); // curriculum tab, every row
    expect(src).toMatch(/searchContent\(q, \{ kinds: \[g\], limit: CONTENT_PAGE, offset \}\)/); // "show more"
    // "No results" is never claimed while the content search is pending or failed.
    expect(src).toMatch(/const zero = [^;]*contentSettled[^;]*!contentFailed/);
  });
});
