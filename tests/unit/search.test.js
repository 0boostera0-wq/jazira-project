import { describe, it, expect } from "vitest";
import {
  foldWithMap,
  normalizeText,
  queryTokens,
  rankEntries,
  buildCurriculumIndex,
  searchCurriculum,
  loadCurriculumIndex,
} from "@/lib/search/curriculum-index";
import { CURRICULUM } from "@/lib/curriculum";
import {
  addRecent,
  removeRecent,
  parseRecent,
  highlightParts,
  buildPracticeIndex,
  buildPagesIndex,
  searchLocal,
  questionHref,
  postAuthor,
  linkablePeople,
  tabCounts,
  totalCount,
  countLabel,
  searchHref,
  searchKey,
  parseTab,
  cleanQuery,
  RECENT_MAX,
} from "@/components/search/model";
import { EXAMS, SECTIONS } from "@/lib/exams/catalog";
import { parseBuilderParams } from "@/components/exams/builder-logic";
import searchAr from "@/i18n/messages/ar/search";
import searchEn from "@/i18n/messages/en/search";
import examsAr from "@/i18n/messages/ar/exams";
import examsEn from "@/i18n/messages/en/exams";

const joined = (parts) => parts.map((p) => (p.match ? `[${p.text}]` : p.text)).join("");

describe("normalizeText (Arabic-aware)", () => {
  it("strips diacritics and tatweel", () => {
    expect(normalizeText("الرِّيَاضِيَّاتُ")).toBe("الرياضيات");
    expect(normalizeText("مـــدرسة")).toBe("مدرسه");
  });
  it("unifies alef, ta marbuta, ya / alef maqsura, hamza seats", () => {
    expect(normalizeText("أإآٱ")).toBe("اااا");
    expect(normalizeText("المكتبة")).toBe(normalizeText("المكتبه"));
    expect(normalizeText("مستوى")).toBe(normalizeText("مستوي"));
    expect(normalizeText("مسؤول")).toBe("مسوول");
    expect(normalizeText("رئيس")).toBe("رييس");
  });
  it("maps Arabic-Indic digits, lowercases and drops Latin accents", () => {
    expect(normalizeText("الصف ٤")).toBe("الصف 4");
    expect(normalizeText("Élève  MATH")).toBe("eleve math");
  });
  it("turns punctuation into single spaces and trims", () => {
    expect(normalizeText("  الكسور، والنسب — المئوية!  ")).toBe("الكسور والنسب الميويه");
    expect(normalizeText("")).toBe("");
    expect(normalizeText(null)).toBe("");
  });
  it("maps every folded character back to its source range", () => {
    const src = "مَدْرَسَةٌ";
    const { text, start, end } = foldWithMap(src);
    expect(text).toBe("مدرسه");
    expect(start.length).toBe(text.length);
    expect(src.slice(start[0], end[text.length - 1])).toBe("مَدْرَسَة");
  });
});

describe("queryTokens", () => {
  it("makes a leading ال optional on long words, longest first, deduplicated", () => {
    expect(queryTokens("الرياضيات للصف")).toEqual([
      { full: "الرياضيات", stem: "رياضيات" },
      { full: "للصف", stem: "للصف" },
    ]);
    expect(queryTokens("الصف")).toEqual([{ full: "الصف", stem: "الصف" }]);
    expect(queryTokens("جبر جبر")).toHaveLength(1);
  });
});

describe("rankEntries", () => {
  const E = (name, hay = name, kind = "subject") => ({ kind, name: normalizeText(name), hay: normalizeText(hay) });
  const entries = [E("علم البيئة"), E("الرياضيات", "الرياضيات الصف الرابع"), E("الرياضيات التطبيقية"), E("الصف الرابع", "الصف الرابع الابتدائي", "grade")];
  it("needs ≥ 2 characters", () => {
    expect(rankEntries(entries, "ر")).toEqual([]);
  });
  it("requires every token and ranks exact > prefix > contains", () => {
    const hits = rankEntries(entries, "رياضيات").map((h) => h.entry.name);
    expect(hits).toEqual(["الرياضيات", "الرياضيات التطبيقيه"]);
    expect(rankEntries(entries, "الرياضيات الرابع").map((h) => h.entry.name)).toEqual(["الرياضيات"]);
  });
  it("respects limit", () => {
    expect(rankEntries(entries, "الرياضيات", { limit: 1 })).toHaveLength(1);
  });
});

describe("curriculum index", () => {
  const index = buildCurriculumIndex(CURRICULUM);
  it("indexes stages, grades, tracks and subjects with unique ids", () => {
    const kinds = new Set(index.map((e) => e.kind));
    expect([...kinds].sort()).toEqual(["grade", "stage", "subject", "track"]);
    expect(new Set(index.map((e) => e.id)).size).toBe(index.length);
    for (const e of index) {
      expect(e.href.startsWith("/curriculum/")).toBe(true);
      expect(typeof e.ar).toBe("string");
      expect(typeof e.en).toBe("string");
    }
  });
  it("finds subjects in Arabic (with or without diacritics / ال) and English", () => {
    const ar = searchCurriculum(index, "رياضيات");
    expect(ar.length).toBeGreaterThan(5);
    expect(ar[0].kind).toBe("subject");
    expect(ar[0].href).toMatch(/\?subject=math$/);
    expect(searchCurriculum(index, "الرِّيَاضِيَّات").length).toBe(ar.length);
    expect(searchCurriculum(index, "Mathematics").length).toBe(ar.length);
  });
  it("narrows with extra tokens (grade / stage words, Arabic digits)", () => {
    const hits = searchCurriculum(index, "رياضيات متوسط");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((e) => e.stage === "middle")).toBe(true);
    const g4 = searchCurriculum(index, "الصف الرابع");
    expect(g4[0].kind).toBe("grade");
    expect(g4[0].href).toBe("/curriculum/elementary/grade-4");
    expect(searchCurriculum(index, "Grade ٤")[0].href).toBe("/curriculum/elementary/grade-4");
  });
  it("finds tracks and flags pending programmes", () => {
    const tr = searchCurriculum(index, "المسار الشرعي");
    expect(tr[0].kind).toBe("track");
    expect(tr[0].trailAr.length).toBe(1);
    const special = searchCurriculum(index, "التربية الخاصة");
    expect(special[0]).toMatchObject({ kind: "stage", pending: true, href: "/curriculum/special" });
  });
  it("loads lazily and memoises", async () => {
    const a = await loadCurriculumIndex();
    const b = await loadCurriculumIndex();
    expect(a).toBe(b);
    expect(a.length).toBe(index.length);
  });
});

describe("highlightParts", () => {
  it("highlights on the normalised form but returns original text", () => {
    expect(joined(highlightParts("مَدْرَسَةٌ جميلة", "مدرسه"))).toBe("[مَدْرَسَةٌ] جميلة");
    expect(joined(highlightParts("Mathematics and more", "math"))).toBe("[Math]ematics and more");
  });
  it("prefers the full word, falls back to the stem", () => {
    expect(joined(highlightParts("الرياضيات", "الرياضيات"))).toBe("[الرياضيات]");
    expect(joined(highlightParts("كتاب رياضيات", "الرياضيات"))).toBe("كتاب [رياضيات]");
  });
  it("marks every occurrence of every token and merges neighbours", () => {
    expect(joined(highlightParts("جبر وجبر", "جبر"))).toBe("[جبر] و[جبر]");
    expect(joined(highlightParts("ab cd", "ab cd"))).toBe("[ab cd]");
  });
  it("keeps the text intact when nothing matches or the query is too short", () => {
    expect(joined(highlightParts("نص", "xyz"))).toBe("نص");
    expect(joined(highlightParts("نص", "ن"))).toBe("نص");
    expect(highlightParts("", "x")).toEqual([]);
  });
  it("never produces markup — just text slices", () => {
    const parts = highlightParts("<b>جبر</b>", "جبر");
    expect(parts.map((p) => p.text).join("")).toBe("<b>جبر</b>");
  });
});

describe("practice & pages indexes", () => {
  const practice = {
    types: { aptitude: { ar: "القدرات العامة", en: "Aptitude" }, achievement: { ar: "التحصيلي", en: "Achievement" } },
    sections: [
      { id: "quantitative", exam: "aptitude", ar: "القسم الكمي", en: "Quantitative" },
      { id: "physics", exam: "achievement", ar: "الفيزياء", en: "Physics" },
    ],
    topics: [
      { id: "algebra", section: "quantitative", exam: "aptitude", ar: "الجبر", en: "Algebra" },
      { id: "optics", section: "physics", exam: "achievement", ar: "الضوء والبصريات", en: "Light & optics" },
    ],
  };
  const idx = buildPracticeIndex(practice);
  it("links sections and topics to the prefilled exam builder", () => {
    const [algebra] = searchLocal(idx, "جبر");
    expect(algebra).toMatchObject({ kind: "topic", section: "quantitative", topic: "algebra" });
    expect(parseBuilderParams("aptitude", new URL(`https://x${algebra.href}`).searchParams)).toMatchObject({ section: "quantitative", topic: "algebra" });
    expect(searchLocal(idx, "optics")[0].href).toBe("/exams/achievement?section=physics&topic=optics#builder");
  });
  it("finds sections by their exam name, not topics", () => {
    expect(searchLocal(idx, "القدرات").map((e) => e.id)).toEqual(["section:quantitative"]);
  });
  it("matches pages on label or keywords", () => {
    const pages = buildPagesIndex([
      { key: "settings", href: "/settings", label: "الإعدادات", keywords: "كلمة المرور الخصوصية" },
      { key: "faq", href: "/faq", label: "الأسئلة الشائعة" },
    ]);
    expect(searchLocal(pages, "كلمة المرور")[0].href).toBe("/settings");
    expect(searchLocal(pages, "اسئله")[0].href).toBe("/faq");
  });
  it("handles a missing catalog", () => {
    expect(buildPracticeIndex(null)).toEqual([]);
    expect(buildPagesIndex(undefined)).toEqual([]);
  });
});

describe("remote result helpers", () => {
  it("builds exam-builder links for every catalog section/topic, ignoring unknown topics", () => {
    for (const [section, def] of Object.entries(SECTIONS)) {
      const href = questionHref({ section, topic: def.topics[0] });
      expect(href).toBe(`/exams/${def.exam}?section=${section}&topic=${def.topics[0]}#builder`);
      expect(Object.keys(EXAMS)).toContain(def.exam);
    }
    expect(questionHref({ section: "verbal", topic: "not-a-topic" })).toBe("/exams/aptitude?section=verbal#builder");
    expect(questionHref({ section: "nope" })).toBe("/exams");
  });
  it("hides anonymous authors and respects the badge preference", () => {
    expect(postAuthor({ author: null })).toMatchObject({ anonymous: true, name: null, avatar: null });
    expect(postAuthor({ author: { full_name: "سارة", username: "sara", is_elite: true, show_elite_badge: false } })).toMatchObject({ anonymous: false, name: "سارة", elite: false });
    expect(postAuthor({ author: { full_name: "", username: "omar", is_elite: true, show_elite_badge: true } })).toMatchObject({ name: "omar", elite: true });
  });
  it("only links people with a public handle", () => {
    expect(linkablePeople([{ id: "1", username: "a" }, { id: "2", username: null }, null])).toHaveLength(1);
  });
  it("counts tabs and flags groups that hit the RPC cap", () => {
    const remote = { people: [{ id: "1", username: "a" }], posts: Array.from({ length: 20 }, (_, i) => ({ id: `${i}` })), tags: [], questions: [{ id: "q" }] };
    const counts = tabCounts({ curriculum: [1, 2, 3], practice: [1] }, remote);
    expect(counts).toEqual({
      curriculum: { n: 3, capped: false },
      questions: { n: 2, capped: false },
      people: { n: 1, capped: false },
      posts: { n: 20, capped: true },
      tags: { n: 0, capped: false },
    });
    expect(totalCount(counts)).toBe(26);
    expect(countLabel(20, true)).toBe("20+");
    expect(countLabel(3, false)).toBe("3");
    expect(tabCounts({ curriculum: [], practice: [] }, null).people.n).toBe(0);
  });
});

describe("recent searches", () => {
  it("adds newest first, dedupes on the normalised form and caps", () => {
    let list = [];
    list = addRecent(list, "  الجبر ");
    list = addRecent(list, "physics");
    list = addRecent(list, "الْجَبْر");
    expect(list).toEqual(["الْجَبْر", "physics"]);
    for (let i = 0; i < 20; i++) list = addRecent(list, `query ${i}`);
    expect(list).toHaveLength(RECENT_MAX);
    expect(addRecent(["a b"], "x")).toEqual(["a b"]);
  });
  it("removes by normalised form", () => {
    expect(removeRecent(["المدرسة", "x y"], "المدرسه")).toEqual(["x y"]);
  });
  it("parses storage defensively", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("{bad")).toEqual([]);
    expect(parseRecent(JSON.stringify({ a: 1 }))).toEqual([]);
    expect(parseRecent(JSON.stringify(["ok query", 3, "x", "  spaced   out "]))).toEqual(["ok query", "spaced out"]);
  });
});

describe("url helpers", () => {
  it("builds /search hrefs and parses tabs", () => {
    expect(searchHref("")).toBe("/search");
    expect(searchHref("", "people")).toBe("/search");
    expect(searchHref("  جبر  ", "all")).toBe(`/search?q=${encodeURIComponent("جبر")}`);
    expect(searchHref("a&b", "people")).toBe("/search?q=a%26b&tab=people");
    expect(parseTab("people")).toBe("people");
    expect(parseTab("<script>")).toBe("all");
    expect(parseTab(null)).toBe("all");
    expect(cleanQuery("x".repeat(150))).toHaveLength(100);
  });
});

describe("search URL identity (late-echo guard)", () => {
  it("reads back exactly what searchHref wrote", () => {
    const cases = [["", "all"], ["", "people"], ["  جبر  ", "all"], ["a&b", "people"], ["الصف   الرابع", "curriculum"], ["x", "bogus"], ["y".repeat(140), "tags"]];
    for (const [q, tab] of cases) {
      const params = new URL(`https://x${searchHref(q, tab)}`).searchParams;
      expect(searchKey(params.get("q"), params.get("tab"))).toBe(searchKey(q, tab));
    }
  });
  it("ignores the tab without a query and normalises whitespace", () => {
    expect(searchKey("", "people")).toBe("|all");
    expect(searchKey(null, null)).toBe("|all");
    expect(searchKey(" math  4 ", "curriculum")).toBe("math 4|curriculum");
    expect(searchKey("math", "<x>")).toBe("math|all");
  });
});

describe("idle suggestions", () => {
  // The practice catalog exactly as catalog.server.js builds it (labels of both locales).
  const label = (key) => {
    const get = (m) => key.split(".").reduce((o, k) => o?.[k], m);
    return { ar: get(examsAr) || key, en: get(examsEn) || key };
  };
  const practice = { types: {}, sections: [], topics: [] };
  for (const exam of Object.keys(EXAMS)) {
    practice.types[exam] = label(`types.${exam}`);
    for (const id of EXAMS[exam].sections) {
      practice.sections.push({ id, exam, ...label(`sections.${id}`), topics: SECTIONS[id].topics.length });
      for (const tp of SECTIONS[id].topics) practice.topics.push({ id: tp, section: id, exam, ...label(`topics.${tp}`) });
    }
  }
  const practiceIndex = buildPracticeIndex(practice);
  const curriculumIndex = buildCurriculumIndex(CURRICULUM);
  it.each([["ar", searchAr], ["en", searchEn]])("every %s suggestion finds something", (_, messages) => {
    expect(messages.idle.suggestions.length).toBeGreaterThan(3);
    for (const s of messages.idle.suggestions) {
      const hits = searchCurriculum(curriculumIndex, s).length + searchLocal(practiceIndex, s).length;
      expect(hits, s).toBeGreaterThan(0);
    }
  });
});
