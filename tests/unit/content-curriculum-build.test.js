import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as realCatalog from "@/lib/curriculum";
import { SECTIONS } from "@/lib/exams/catalog";
import { partEvidence, resolvePart, yearEvidence, resolveYear, partFromFileName, partFromText } from "../../scripts/content/lib/part-year.mjs";
import {
  strictTermMatches,
  evidenceFromPages,
  evidenceFromListing,
  evidenceFromOwnerDecisions,
  resolveResourceTerm,
  subjectTermMembership,
  catalogTermsFromMembership,
  courseCode,
  evidenceFromCourseCode,
} from "../../scripts/content/lib/term-resolve.mjs";
import { reconcileCatalogMap, leafOfIenNode, subjectTitleKey } from "../../scripts/content/lib/ien-mapping.mjs";
import { buildCurriculum, catalogLeaves, catalogTitlesEn, loadInputs, writeOutputs, isUnitOpener, bookKind, serializeOutline } from "../../scripts/content/build-curriculum.mjs";
import { normalizeTitle } from "@/lib/content/normalize";
import { IdRegistry } from "../../scripts/content/lib/id-registry.mjs";
import { validateRecord } from "../../scripts/content/lib/schemas.mjs";
import { diffCrawls, changesText, crawlDate } from "../../scripts/content/crawl-diff.mjs";
import { buildPrepAlignment, checkSpec, SpecError } from "../../scripts/content/build-prep-alignment.mjs";

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const jsonl = (p) => readFileSync(root(p), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const AT = "2026-09-26T21:00:11Z";

// ── part and edition year (§2.4) ──────────────────────────────────────────
describe("part and year_label: listing/cover first, file name only cross-checks", () => {
  const part = (title, path, frontmatter = null) => resolvePart(partEvidence({ title, path, frontmatter }));
  const year = (path, frontmatter = null) => resolveYear(yearEvidence({ path, frontmatter }));
  const fm = (evidence) => ({ ien_book_id: 1, evidence });

  it("reads …-ISLM.part.pdf from the listing (the file name only says 'a part')", () => {
    expect(partFromFileName("1448-GE-PE-K01-SM1-ISLM.part.pdf")).toEqual({ number: null, marker: true });
    expect(part("مقرر الدراسات الإسلامية / كتاب الطالب الجزء الثاني", "1448-GE-PE-K01-SM1-ISLM.part.pdf")).toEqual({
      part: 2,
      part_evidence: { listing: 2, cover: null, file_name: null },
      issues: [],
    });
  });

  it("reads …-math.pdf (no file marker) from the listing and the cover", () => {
    const cover = fm({ part_1: { page: 2, snippet: "الرياضيات/ الصف األول املتوسط / اجلزء األول من املقرر" } });
    expect(part("مقرر الرياضيات / كتاب الطالب الجزء الأول", "1448-GE-PE-K02-SM1-math.pdf", cover)).toEqual({
      part: 1,
      part_evidence: { listing: 1, cover: 1, file_name: null },
      issues: [],
    });
    // Cover only (damaged ligatures in the text layer are folded).
    expect(part("مقرر الرياضيات / كتاب الطالب", "x-math.pdf", fm({ intro: { page: 2, snippet: "اجلزء الثاني من املقرر" } })).part).toBe(2);
  });

  it("cross-checks -PART2.PDF and flags every disagreement or missing primary value", () => {
    expect(partFromFileName("1448-GE-CBM-X-SM1-ABC-PART2.PDF")).toEqual({ number: 2, marker: true });
    expect(part("مقرر / كتاب الطالب الجزء الثاني", "1448-X-PART2.PDF").issues).toEqual([]);
    expect(part("مقرر / كتاب الطالب الجزء الأول", "1448-X-PART2.PDF")).toMatchObject({ part: 1, issues: ["part_file_name_conflict"] });
    expect(part("مقرر الكيمياء 1 /كتاب الطالب", "1448-GE-CBM-TRC1-SM1-chmi1-part1.pdf")).toMatchObject({ part: null, issues: ["part_missing"] });
    expect(part("Business Finance \\ Student book", "1448-GE-CBM-BM-TRC2-SM1-FM1.1.PART.pdf")).toMatchObject({ part: null, issues: ["part_missing"] });
    const conflict = fm({ part_2: { page: 1, snippet: "الجزء الثاني" } });
    expect(part("مقرر / كتاب الطالب الجزء الأول", "a.pdf", conflict)).toMatchObject({ part: null, issues: ["part_listing_cover_conflict"] });
    // A full-year book whose introduction (pp. 4–5) describes both parts is not a cover statement.
    const intro = fm({ part_1: { page: 4, snippet: "اجلزء األول" }, part_2: { page: 5, snippet: "اجلزء الثاني" } });
    expect(part("مقرر التربية الفنية / كتاب الطالب", "1448-GE-PE-K05-SM1-tart.pdf", intro)).toEqual({ part: null, part_evidence: { listing: null, cover: null, file_name: null }, issues: [] });
    expect(partFromText("مقرر الأحياء 1")).toBeNull();
  });

  it("takes the cover edition line first, keeps a 1447/1448 mismatch and the 1488 anomaly verbatim", () => {
    expect(year("1448-GE-ME-K07-SM1-math.pdf", fm({ year_1448: { page: 1, snippet: "طبعة ١٤٤٨ - ٢٠٢٦" } }))).toEqual({
      year_label: "1448",
      year_evidence: { cover: "1448", file_name: "1448" },
      issues: [],
    });
    expect(year("1448-GE-PE-K01-SM1-math.pdf", fm({ year_1447: { page: 2, snippet: "الرياض ، ١٤٤٧ه" } }))).toEqual({
      year_label: "1447",
      year_evidence: { cover: "1447", file_name: "1448" },
      issues: ["year_mismatch"],
    });
    expect(year("1488-GE-CBM-GNRL-TRC2-SM1-HIS.pdf")).toMatchObject({ year_label: "1488", issues: ["year_anomaly"] });
    // The edition line on page 1 wins over a cataloguing year on page 2.
    expect(year("1448-a.pdf", fm({ year_1448: { page: 1, snippet: "طبعة 1448" }, year_1447: { page: 2, snippet: "1447" } })).issues).toEqual([]);
    // Without a detector key the edition line is parsed; split digit groups are never guessed.
    expect(year("1448-a.pdf", fm({ cover: { page: 1, snippet: "المتخصصين طبعة ١٤٤٨ ٢٠٢٦" } })).year_evidence.cover).toBe("1448");
    expect(year("1448-a.pdf", fm({ cover: { page: 1, snippet: "طبعة ٧ 4 14 ه" } })).year_evidence.cover).toBeNull();
  });
});

// ── term evidence and the resolution truth table (§2.4, §2.5) ─────────────
const ev = (id, method, term, extra = {}) => ({ schema: "term-evidence@1", id: `te-ien-1-p${extra.page ?? 0}-${term}${id}`, resource_id: "ien-1", pdf_page: extra.page ?? 0, method, term, excerpt: null, reads: extra.reads ?? null, confidence: "high", run_id: null, extracted_at: AT });

describe("term evidence: strict regex only", () => {
  it("matches «الفصل الدراسي …» (also from a damaged text layer) and never the chapter heading «الفصل الثاني»", () => {
    expect(strictTermMatches("كتاب الطالب — الفصل الدراسي الأول").map((m) => m.term)).toEqual(["t1"]);
    expect(strictTermMatches("الفصل الدراسي األول").map((m) => m.term)).toEqual(["t1"]);
    expect(strictTermMatches("Student Book · Second Semester").map((m) => m.term)).toEqual(["t2"]);
    expect(strictTermMatches("يتناول الفصل الأول مبادئ علم البيئة، ويتناول الفصل الثاني المجتمعات")).toEqual([]);
    expect(strictTermMatches("الفصل الثاني")).toEqual([]);
    const long = `${"كلمة ".repeat(30)}الفصل الدراسي الثاني${" كلمة".repeat(30)}`;
    expect(strictTermMatches(long)[0].excerpt.length).toBeLessThanOrEqual(80);
  });

  it("maps pages 1 → cover_text, 2–3 → title_page_text, ignores later pages and keeps a third term out", () => {
    const pages = [
      { pdf_page: 1, text: "الفصل الدراسي الأول" },
      { pdf_page: 3, text: "الفصل الدراسي الثاني" },
      { pdf_page: 4, text: "الفصل الدراسي الأول" },
      { pdf_page: 2, text: "الفصل الدراسي الثالث" },
    ];
    const { rows, thirdTerm } = evidenceFromPages("ien-120607", pages, { at: AT });
    expect(rows.map((r) => [r.id, r.method, r.term])).toEqual([
      ["te-ien-120607-p1-t1", "cover_text", "t1"],
      ["te-ien-120607-p3-t2", "title_page_text", "t2"],
    ]);
    for (const r of rows) expect(validateRecord("term-evidence", r)).toEqual({ ok: true, errors: [] });
    expect(thirdTerm).toEqual([{ pdf_page: 2, excerpt: "الفصل الدراسي الثالث" }]);
    expect(evidenceFromListing("ien-5", "مقرر العلوم / كتاب الطالب الجزء الثاني", { at: AT })).toEqual([]);
  });

  it("owner decisions need a resolved part; course codes need plan-guide corroboration", () => {
    const decision = { id: "od-pilot", decision: "part_equals_term", subject_node_ids: ["middle/grade-1/math"], mapping: { 1: "t1", 2: "t2" }, decided_by: "owner", decided_at: "2026-09-27", note: "" };
    expect(evidenceFromOwnerDecisions({ id: "ien-121391", subject_node_id: "middle/grade-1/math", part: 2 }, [decision])).toEqual([
      expect.objectContaining({ id: "te-ien-121391-p0-t2", method: "owner_decision", confidence: "medium", extracted_at: "2026-09-27T00:00:00Z" }),
    ]);
    expect(evidenceFromOwnerDecisions({ id: "ien-9", subject_node_id: "middle/grade-1/math", part: null }, [decision])).toEqual([]);
    expect(evidenceFromOwnerDecisions({ id: "ien-9", subject_node_id: "middle/grade-1/science", part: 1 }, [decision])).toEqual([]);
    expect(courseCode("1448-GE-CBM-GNRL-TRC2-SM1-CHMI2.1.part.pdf")).toBe("CHMI2.1");
    expect(evidenceFromCourseCode("ien-7", "1448-GE-CBM-GNRL-TRC2-SM1-CHMI2.1.pdf", {}, { at: AT })).toEqual([]);
    expect(evidenceFromCourseCode("ien-7", "1448-GE-CBM-GNRL-TRC2-SM1-CHMI2.1.pdf", { "CHMI2.1": "t1" }, { at: AT })[0]).toMatchObject({ method: "course_code", term: "t1" });
  });
});

describe("resource term resolution truth table", () => {
  const cases = [
    ["no evidence, single book (§1.5: missing evidence → needs_review)", [], {}, { term: null, term_status: "needs_review" }],
    ["no evidence, split book", [], { split: true }, { term: null, term_status: "needs_review" }],
    ["cover t1", [ev("", "cover_text", "t1", { page: 1 })], {}, { term: "t1", term_status: "verified", basis: "evidence" }],
    ["owner decision t2", [ev("", "owner_decision", "t2")], { split: true }, { term: "t2", term_status: "inferred", basis: "owner_decision" }],
    ["cover + owner agree", [ev("", "cover_text", "t1", { page: 1 }), ev("x", "owner_decision", "t1")], {}, { term: "t1", term_status: "verified", basis: "evidence" }],
    ["cover t1 vs listing t2", [ev("", "cover_text", "t1", { page: 1 }), ev("", "listing_title", "t2")], {}, { term: null, term_status: "needs_review", conflict: true }],
    ["both vs t1", [ev("", "plan_guide", "both"), ev("", "owner_decision", "t1")], {}, { term: null, term_status: "needs_review", conflict: true }],
    ["one vision read", [ev("", "vision", "t1", { page: 1, reads: 1 })], {}, { term: null, term_status: "needs_review" }],
    ["two agreeing vision reads", [ev("", "vision", "t1", { page: 1, reads: 2 })], {}, { term: "t1", term_status: "verified" }],
    ["TOC markers t1 + t2 → full year", [ev("", "toc_marker", "t1", { page: 5 }), ev("", "toc_marker", "t2", { page: 5 })], {}, { term: "both", term_status: "verified" }],
    ["a single TOC marker is unit-level only", [ev("", "toc_marker", "t2", { page: 5 })], {}, { term: null, term_status: "needs_review" }],
    ["plan guide both", [ev("", "plan_guide", "both")], {}, { term: "both", term_status: "inferred" }],
  ];
  for (const [name, rows, opts, want] of cases) {
    it(name, () => expect(resolveResourceTerm(rows, opts)).toMatchObject(want));
  }
  it("never reads part numbers", () => {
    // A resource with part 1 and no evidence stays undetermined (no part → term shortcut).
    expect(resolveResourceTerm([], { split: true, part: 1 })).toMatchObject({ term: null, term_status: "needs_review" });
  });
});

describe("subject-term membership and catalog correction", () => {
  const r = (term, term_status, ids = []) => ({ term, term_status, term_evidence: ids });
  const status = (rows) => rows.map((x) => `${x.term}:${x.status}`);
  it("follows §2.5: in a term with support, absent only when every book is verified for the other term", () => {
    expect(status(subjectTermMembership("s", [r("t1", "verified", ["a"]), r("t2", "verified", ["b"])]))).toEqual(["t1:verified", "t2:verified"]);
    expect(status(subjectTermMembership("s", [r("t1", "verified", ["a"])]))).toEqual(["t1:verified", "t2:absent"]);
    expect(status(subjectTermMembership("s", [r("t1", "inferred", ["a"])]))).toEqual(["t1:inferred", "t2:needs_review"]);
    expect(status(subjectTermMembership("s", [r("t1", "verified", ["a"]), r(null, "needs_review")]))).toEqual(["t1:verified", "t2:needs_review"]);
    expect(status(subjectTermMembership("s", [r("both", "verified", ["a"])]))).toEqual(["t1:verified", "t2:verified"]);
    expect(status(subjectTermMembership("s", []))).toEqual(["t1:needs_review", "t2:needs_review"]);
    expect(subjectTermMembership("s", [r("t1", "verified", ["a"])])[1].evidence).toEqual(["a"]);
  });
  it("removes a subject from a term only on verified absence", () => {
    const ct = (rows) => catalogTermsFromMembership(rows.map(([term, st, evidence = []]) => ({ term, status: st, evidence })));
    expect(ct([["t1", "verified", ["a"]], ["t2", "absent", ["a"]]])).toEqual({ terms: ["t1"], terms_status: "verified", terms_evidence: ["a"] });
    expect(ct([["t1", "verified", ["a"]], ["t2", "verified", ["b"]]])).toEqual({ terms: ["t1", "t2"], terms_status: "verified", terms_evidence: ["a", "b"] });
    expect(ct([["t1", "inferred", ["a"]], ["t2", "needs_review"]])).toEqual({ terms: ["t1", "t2"], terms_status: "unverified", terms_evidence: [] });
    expect(ct([["t1", "verified", ["a"]], ["t2", "needs_review"]])).toEqual({ terms: ["t1", "t2"], terms_status: "unverified", terms_evidence: [] });
  });
});

// ── catalog-map reconciliation on the committed crawl (§2.5) ──────────────
describe("catalog ↔ iEN mapping (catalog-map.jsonl verified against the crawl)", () => {
  const S = "data/staging/sources/";
  const leaves = catalogLeaves(realCatalog);
  const recon = reconcileCatalogMap({ leaves, nodes: jsonl(`${S}ien/nodes.jsonl`), books: jsonl(`${S}ien/books.jsonl`), lessons: jsonl(`${S}ien/lessons.jsonl`), rows: jsonl(`${S}research/catalog-map.jsonl`) });
  const ids = (id) => recon.mapping.get(id)?.ien_subject_ids;

  it("reconciles the 229 / 11 / 13 rows deterministically", () => {
    expect(recon.summary.rows_by_match).toEqual({ exact: 229, partial: 11, none: 13 });
    expect(recon.summary.rows_by_outcome).toEqual({ verified: 228, needs_review: 6, catalog_only: 4, not_in_catalog: 15 });
    // Books, lesson and unit counts of the agent audit all match the crawl; the six
    // disagreements are title-heuristic ones and land in the audit with needs_review.
    const failing = recon.rowResults.filter((r) => r.failures.length);
    expect(failing.flatMap((r) => r.failures.map((f) => f.code))).toEqual(Array(6).fill("map_title_disagrees"));
    expect(failing.map((r) => `${r.leaf}/${r.subject_id}`).sort()).toEqual([
      "elementary/grade-5/english",
      "elementary/grade-6/english",
      "high-school/grade-2/sharia/qiraat",
      "high-school/grade-2/sharia/quran",
      "high-school/grade-3/general/elective",
      "high-school/grade-3/sharia/quran",
    ]);
    expect(recon.audit.filter((a) => a.code === "map_title_disagrees")).toHaveLength(6);
    expect(recon.audit.every((a) => a.status === "needs_review")).toBe(true);
  });

  it("reproduces the known K07 / K09 / first-year mappings of the survey", () => {
    expect(ids("middle/grade-1/math")).toEqual([90]);
    expect(ids("middle/grade-1/science")).toEqual([95]);
    expect(ids("middle/grade-1/arabic")).toEqual([86]);
    expect(ids("middle/grade-3/math")).toEqual([1120]);
    expect(ids("middle/grade-3/science")).toEqual([1121]);
    expect(ids("middle/grade-3/critical")).toEqual([27564]);
    expect(ids("high-school/grade-1/first-year/math")).toEqual([27575]);
    expect(ids("high-school/grade-1/first-year/pe")).toEqual([31017]);
    expect(ids("high-school/grade-2/sharia/tawhid")).toEqual([34679, 34052]);
    expect(recon.mapping.get("middle/grade-1/math")).toMatchObject({ status: "verified", outcome: "verified", origin: "agent_audit" });
    expect(leafOfIenNode({ grade_code: "K07" })).toBe("middle/grade-1");
    expect(leafOfIenNode({ grade_code: null, track_code: "TRC1" })).toBe("high-school/grade-1/first-year");
    expect(leafOfIenNode({ grade_code: "TRC3", track_code: "HL" })).toBe("high-school/grade-3/health");
    expect(subjectTitleKey("مقرر الحديث2")).toBe(subjectTitleKey("الحديث 2"));
  });

  it("maps every catalog subject of the 20 leaves to iEN or lists it catalog_only with a reason", () => {
    const catalogSubjects = leaves.flatMap((l) => l.subjects.map((s) => `${l.leaf}/${s.id}`));
    expect(catalogSubjects).toHaveLength(238);
    for (const id of catalogSubjects) {
      const m = recon.mapping.get(id);
      expect(m, id).toBeTruthy();
      if (m.outcome === "catalog_only") expect(m.reason, id).toMatch(/\S/);
      else expect(m.ien_subject_ids.length, id).toBeGreaterThan(0);
    }
    expect([...recon.mapping.values()].filter((m) => m.outcome === "catalog_only").map((m) => m.subject_node_id).sort()).toEqual([
      "high-school/grade-3/business/capstone",
      "high-school/grade-3/cs-eng/capstone",
      "high-school/grade-3/health/capstone",
      "high-school/grade-3/sharia/capstone",
    ]);
  });

  it("keeps unmatched iEN subjects source-only (Chinese, tahfeez tajweed, enrichment arts/music, level-2 PE)", () => {
    const so = new Map(recon.sourceOnly.map((s) => [s.ien_id, s]));
    expect(recon.sourceOnly).toHaveLength(66);
    expect(so.get(54709)).toMatchObject({ subject_node_id: "middle/grade-1/ien-54709", title: "اللغة الصينية" });
    expect(so.get(8888).subject_node_id).toBe("elementary/grade-4/ien-8888");
    expect(so.get(31578).subject_node_id).toBe("high-school/grade-1/first-year/ien-31578");
    expect(recon.unplaced).toEqual([]);
    for (const s of recon.sourceOnly) expect(recon.ienToSubject.has(s.ien_id)).toBe(false);
  });
});

// ── full build on a synthetic crawl (TOC, owner decision, cover term, collisions) ──
function miniInput(registryEntries = []) {
  const subjects = [
    { id: "math", name: "الرياضيات", name_en: "Mathematics", labels: null },
    { id: "science", name: "العلوم", name_en: "Science", labels: null },
  ];
  const grade = { id: "grade-1", name: "الصف الأول", name_en: "Grade 1", title: "الصف الأول المتوسط", title_en: "Middle School Grade 1", subjects };
  const stage = { id: "middle", name: "المرحلة المتوسطة", name_en: "Middle school", children: [grade] };
  const catalog = { CURRICULUM: [stage], allLeaves: () => [{ slug: ["middle", "grade-1"], node: grade, trail: [stage, grade] }] };
  const sub = (ien_id, title, code_id, order, bank = 0) => ({ ien_id, parent_ien_id: 40, title, code_id, code_type: "SUB", order_in_parent: order, grade_code: "K07", track_code: null, ien_question_bank_count: bank });
  const book = (id, subject, title, path) => ({ ien_book_id: id, subject_ien_id: subject, title, path, url: `https://iencontent.ien.edu.sa/books/${path}`, is_active: true, tree_path: "t", parsed: true, file_ext: "pdf", http_status: 200, bytes: 100, last_modified: "Sun, 26 Apr 2026 11:35:10 GMT", accept_ranges: "bytes" });
  const lesson = (subject, unit, unit_title, id, title, order) => ({ subject_ien_id: subject, unit_ien_id: unit, unit_title, lesson_ien_id: id, lesson_title: title, order, ien_bank_count: 0, ien_bank_total: 0 });
  const row = (subject, ids, books, lessons, units) => ({ jazira_stage: "middle", jazira_leaf: "middle/grade-1", jazira_subject_id: subject, jazira_name: subject, jazira_labels: null, catalog: "live", ien_subject_ids: ids, ien_titles: [], ien_codes: [], books, textbook_titles: [], lesson_count: lessons, unit_count: units, ien_question_bank_count: 0, match: "exact", notes: "" });
  const src = (id, extra = {}) => ({ id, retrieval: { retrieved_at: "2026-09-26" }, ...extra });
  return {
    catalog,
    nodes: [
      { ien_id: 12, parent_ien_id: null, title: "الصف الأول المتوسط", code_id: "K07", code_type: "K", order_in_parent: 1, grade_code: "K07", track_code: null },
      sub(90, "الرياضيات", "math", 2, 1045),
      sub(95, "العلوم", "scin", 3),
      sub(999, "اللغة الصينية", "China", 9),
    ],
    books: [
      book(120607, 90, "مقرر الرياضيات /كتاب الطالب الجزء الأول", "1448-GE-ME-K07-SM1-math-part1.pdf"),
      book(121391, 90, "مقرر الرياضيات /كتاب الطالب الجزء الثاني", "1448-GE-ME-K07-SM1-math-part2.pdf"),
      book(5001, 95, "مقرر العلوم / كتاب الطالب", "1448-GE-ME-K07-SM1-scin.pdf"),
    ],
    lessons: [
      lesson(90, 91, "الجبر و الدوال", 53, "مدخل وحدة (الجبر و الدوال)", 0),
      lesson(90, 91, "الجبر و الدوال", 54, "القوى و الأسس", 1),
      lesson(90, 91, "الجبر و الدوال", 55, "ترتيب العمليات", 2),
      lesson(90, 92, "الأعداد الصحيحة", 61, "الأعداد الصحيحة والقيمة المطلقة", 3),
      lesson(90, 92, "الأعداد الصحيحة", 62, "مقارنة الأعداد الصحيحة وترتيبها", 4),
      lesson(95, 96, "المادة", 301, "الذرة", 0),
      lesson(95, 96, "المادة", 302, "العناصر", 1),
      lesson(95, 301, "الطاقة", 303, "الحرارة", 2),
    ],
    catalogMap: [
      row("math", [90], ["1448-GE-ME-K07-SM1-math-part1.pdf", "1448-GE-ME-K07-SM1-math-part2.pdf"], 5, 2),
      row("science", [95], ["1448-GE-ME-K07-SM1-scin.pdf"], 4, 2), // wrong lesson count → needs_review
    ],
    crawlReport: { retrieved_at: "2026-09-26T21:00:11.044Z" },
    registry: [
      src("ien", { license_status: "all_rights_reserved", provenance_status: "PROVENANCE_REVIEW_REQUIRED", redistribution: "link_only", retrieval: { retrieved_at: AT } }),
      src("moe-plan-guide-5"),
      src("moe-two-terms"),
    ],
    frontmatter: [
      { ien_book_id: 120607, page_count: 60, page_chars: [10, 20], evidence: { year_1448: { page: 1, snippet: "طبعة 1448" } } },
      // term_* keys are never read; the strict regex is re-run on the other cover snippets.
      { ien_book_id: 5001, page_count: 120, page_chars: [10], evidence: { term_1: { page: 1, snippet: "الفصل الدراسي الأول" }, cover: { page: 1, snippet: "العلوم — الفصل الدراسي الثاني" } } },
    ],
    extraction: [],
    existingEvidence: [],
    tocs: [
      {
        schema: "toc@1", resource_id: "ien-120607", toc_status: "found", toc_pages: [5], page_offset: 2, run_id: null,
        entries: [
          { level: "unit", title: "الجبر و الدوال", printed_page: 10, pdf_page: 12, matched_node_id: null, match_score: null, method: "text" },
          { level: "lesson", title: "القوى و الأسس", printed_page: 12, pdf_page: 14, matched_node_id: null, match_score: null, method: "text" },
          { level: "lesson", title: "مراجعة تراكمية", printed_page: 36, pdf_page: 38, matched_node_id: null, match_score: null, method: "vision" },
        ],
      },
    ],
    ownerDecisions: [{ schema: "owner-decision@1", id: "od-pilot-parts", decision: "part_equals_term", subject_node_ids: ["middle/grade-1/math"], mapping: { 1: "t1", 2: "t2" }, decided_by: "owner", decided_at: "2026-09-27", note: "" }],
    research: {
      k9: { stages: [{ id: "middle", grades: [{ id: "grade-1", tracks: [{ id: "general", catalog_path: ["middle", "grade-1"], subjects: [
        { id: "math", terms: ["t1", "t2"], terms_status: "unverified" },
        { id: "science", terms: ["t1", "t2"], terms_status: "unverified" },
      ] }] }] }] },
    },
    idRegistry: new IdRegistry(registryEntries, { now: () => "2026-09-27T00:00:00Z" }),
    cachePages: null,
  };
}

describe("catalog English titles (subject and unit title_en)", () => {
  it("maps catalog names and plan labels, never an Arabic fallback or an ambiguous title", () => {
    const m = catalogTitlesEn([
      { subjects: [
        { name: "الرياضيات", name_en: "Mathematics", labels: ["الرياضيات 1"], labels_en: ["Mathematics 1"] },
        { name: "مادة بلا ترجمة", name_en: "مادة بلا ترجمة" },
        { name: "الفنون", name_en: "Arts" },
      ] },
      { subjects: [{ name: "الفنون", name_en: "Fine Arts" }, { name: "الفنون", name_en: "Arts" }, { name: "العلوم", name_en: "Science", labels: null }] },
    ]);
    expect(m.get(normalizeTitle("الرياضيات"))).toBe("Mathematics");
    expect(m.get(normalizeTitle("الرياضيات 1"))).toBe("Mathematics 1");
    expect(m.get(normalizeTitle("العلوم"))).toBe("Science");
    expect(m.has(normalizeTitle("مادة بلا ترجمة"))).toBe(false);
    expect(m.has(normalizeTitle("الفنون"))).toBe(false);
  });

  it("titles catalog subjects from the catalog and leaves an unmatched source-only subject without one", () => {
    const r = buildCurriculum(miniInput());
    const node = (id) => r.nodes.find((n) => n.id === id);
    expect(node("middle/grade-1/math").title_en).toBe("Mathematics");
    expect(node("middle/grade-1/ien-999")).toMatchObject({ status: "source_only", title_en: null });
    expect(node("middle/grade-1/math/n91").title_en).toBeNull(); // «الجبر و الدوال» is no catalog name
  });
});

describe("buildCurriculum on a synthetic crawl", () => {
  let input;
  let r;
  const node = (id) => r.nodes.find((n) => n.id === id);
  beforeAll(() => {
    input = miniInput();
    r = buildCurriculum(input);
  });

  it("writes schema-valid records with §2.2 ids", () => {
    for (const n of r.nodes) expect(validateRecord("curriculum-node", n), n.id).toEqual({ ok: true, errors: [] });
    for (const x of r.resources) expect(validateRecord("resource", x), x.id).toEqual({ ok: true, errors: [] });
    for (const x of r.termEvidence) expect(validateRecord("term-evidence", x), x.id).toEqual({ ok: true, errors: [] });
    for (const x of r.subjectTerms) expect(validateRecord("subject-term", x)).toEqual({ ok: true, errors: [] });
    for (const x of r.audit) expect(validateRecord("curriculum-audit", x).ok).toBe(true);
    expect(r.nodes.map((n) => n.id)).toEqual(expect.arrayContaining([
      "middle", "middle/grade-1", "middle/grade-1/t1", "middle/grade-1/t2", "middle/grade-1/math", "middle/grade-1/science", "middle/grade-1/ien-999",
      "middle/grade-1/math/n91", "middle/grade-1/math/n54", "middle/grade-1/science/n96", "middle/grade-1/science/n301",
    ]));
    expect(r.resources.map((x) => x.id)).toEqual(["ien-120607", "ien-121391", "ien-5001", "ien-bank-90"]);
  });

  it("gives a unit that shares its iEN id with a lesson a frozen x id", () => {
    const energy = r.nodes.find((n) => n.kind === "unit" && n.title_ar === "الطاقة");
    expect(energy.id).toMatch(/^middle\/grade-1\/science\/x[0-9a-f]{8}$/);
    expect(energy.source_refs[0]).toMatchObject({ source_id: "ien", ien_id: 301 });
    expect(node("middle/grade-1/science/n301")).toMatchObject({ kind: "lesson", parent_id: "middle/grade-1/science/n96" });
    expect(node("middle/grade-1/science/n303").parent_id).toBe(energy.id);
    expect(r.audit.some((a) => a.code === "id_collision" && a.node_id === energy.id)).toBe(true);
  });

  it("keeps unit openers for review, source-only subjects out of the plan, and a failed map row under review", () => {
    expect(node("middle/grade-1/math/n53")).toMatchObject({ unit_opener: true, status: "needs_review" });
    expect(node("middle/grade-1/ien-999")).toMatchObject({ status: "source_only", in_plan: false });
    expect(r.catalogTerms.has("middle/grade-1/ien-999")).toBe(false);
    expect(node("middle/grade-1/science").status).toBe("needs_review");
    expect(node("middle/grade-1/science/n302").status).toBe("needs_review");
    expect(r.audit.find((a) => a.code === "map_lesson_count_mismatch")).toMatchObject({ subject_node_id: "middle/grade-1/science", status: "needs_review" });
  });

  it("aligns the TOC: page ranges, a TOC-only lesson placed where the TOC puts it, audit kept", () => {
    expect(node("middle/grade-1/math/n91").pages).toEqual([{ resource_id: "ien-120607", pdf_start: 12, pdf_end: 60, printed_start: 10, printed_end: 58, method: "toc", status: "verified" }]);
    expect(node("middle/grade-1/math/n54").pages).toEqual([{ resource_id: "ien-120607", pdf_start: 14, pdf_end: 37, printed_start: 12, printed_end: 35, method: "toc", status: "verified" }]);
    const review = r.nodes.find((n) => n.title_ar === "مراجعة تراكمية");
    expect(review).toMatchObject({ kind: "lesson", parent_id: "middle/grade-1/math/n91", status: "needs_review", audit: [{ code: "missing_in_ien", detail: "TOC-only lesson in ien-120607" }] });
    expect(review.id).toMatch(/\/x[0-9a-f]{8}$/);
    const kids = r.nodes.filter((n) => n.parent_id === "middle/grade-1/math/n91").sort((a, b) => a.order - b.order).map((n) => n.id);
    expect(kids).toEqual(["middle/grade-1/math/n53", "middle/grade-1/math/n54", review.id, "middle/grade-1/math/n55"]);
    expect(input.idRegistry.size).toBe(2);
  });

  it("resolves terms from evidence only: owner decision (inferred, unconfirmed), cover (verified); term_* keys ignored", () => {
    const res = new Map(r.resources.map((x) => [x.id, x]));
    expect(res.get("ien-120607")).toMatchObject({ part: 1, term: "t1", term_status: "inferred", term_evidence: ["te-ien-120607-p0-t1"] });
    expect(res.get("ien-121391")).toMatchObject({ part: 2, term: "t2", term_status: "inferred" });
    expect(res.get("ien-5001")).toMatchObject({ part: null, term: "t2", term_status: "verified", term_evidence: ["te-ien-5001-p1-t2"] });
    expect(res.get("ien-bank-90")).toMatchObject({ kind: "question_bank_external", external_count: 1045, term: null, term_status: "unknown", url: "https://www.ien.edu.sa/?choice=2#/subjectselfassessments/90" });
    expect(r.termEvidence.map((e) => e.id)).toEqual(["te-ien-120607-p0-t1", "te-ien-121391-p0-t2", "te-ien-5001-p1-t2"]);
    // Units: the TOC places n91 in part 1; n92 has no pages in a two-book subject → needs review.
    expect(node("middle/grade-1/math/n91")).toMatchObject({ term: "t1", term_status: "inferred" });
    expect(node("middle/grade-1/math/n92")).toMatchObject({ term: null, term_status: "needs_review" });
    expect(node("middle/grade-1/math/n62")).toMatchObject({ term: null, term_status: "needs_review" });
    const outline = r.outline.get("middle/grade-1");
    expect(outline.resources.find((x) => x.id === "ien-120607").term_basis).toBe("owner_decision");
    expect(outline.nodes.find((n) => n.id === "middle/grade-1/math/n91").term_basis).toBe("owner_decision");
  });

  it("derives subject-term membership and corrects the catalog only on verified evidence", () => {
    const st = (s) => r.subjectTerms.filter((x) => x.subject_node_id === s).map((x) => `${x.term}:${x.status}`);
    expect(st("middle/grade-1/math")).toEqual(["t1:inferred", "t2:inferred"]);
    expect(st("middle/grade-1/science")).toEqual(["t1:absent", "t2:verified"]);
    expect(r.catalogTerms.get("middle/grade-1/math")).toEqual({ terms: ["t1", "t2"], terms_status: "unverified", terms_evidence: [] });
    // Science's iEN mapping failed verification (lesson count): its verified split is NOT applied.
    expect(r.catalogTerms.get("middle/grade-1/science")).toEqual({ terms: ["t1", "t2"], terms_status: "unverified", terms_evidence: [] });
    expect(r.audit.find((a) => a.code === "catalog_correction_blocked")).toMatchObject({ subject_node_id: "middle/grade-1/science", status: "needs_review" });
    expect(r.catalogTermsDoc.subjects).toEqual({});
    expect(r.research.k9.changed).toBe(false);
  });

  it("applies a verified split once the subject's mapping is verified", () => {
    const fixed = miniInput();
    fixed.catalogMap[1].lesson_count = 3; // the crawl has 3 science lessons in 2 units → row verifies
    const v = buildCurriculum(fixed);
    expect(v.recon.mapping.get("middle/grade-1/science")).toMatchObject({ status: "verified", outcome: "verified" });
    expect(v.catalogTerms.get("middle/grade-1/science")).toEqual({ terms: ["t2"], terms_status: "verified", terms_evidence: ["te-ien-5001-p1-t2"] });
    expect(v.catalogTermsDoc.subjects).toEqual({ "middle/grade-1/science": { terms: ["t2"], terms_status: "verified", terms_evidence: ["te-ien-5001-p1-t2"] } });
    expect(v.research.k9.changed).toBe(true);
    const subjects = v.research.k9.doc.stages[0].grades[0].tracks[0].subjects;
    expect(subjects[0]).toEqual({ id: "math", terms: ["t1", "t2"], terms_status: "unverified" });
    expect(subjects[1]).toEqual({ id: "science", terms: ["t2"], terms_status: "verified", terms_evidence: ["te-ien-5001-p1-t2"] });
    expect(fixed.research.k9.stages[0].grades[0].tracks[0].subjects[1].terms_status).toBe("unverified"); // input untouched
  });

  it("drops a stale TOC marker once the resource's current TOC no longer has it", () => {
    const stale = { schema: "term-evidence@1", id: "te-ien-120607-p5-t2", resource_id: "ien-120607", pdf_page: 5, method: "toc_marker", term: "t2", excerpt: "الفصل الدراسي الثاني", reads: null, confidence: "high", run_id: null, extracted_at: AT };
    const x = miniInput();
    x.existingEvidence = [stale];
    const out = buildCurriculum(x);
    expect(out.termEvidence.some((e) => e.id === stale.id)).toBe(false);
    // Without a TOC for the resource, WP3's row is kept as is.
    const y = miniInput();
    y.existingEvidence = [{ ...stale, id: "te-ien-121391-p5-t2", resource_id: "ien-121391" }];
    expect(buildCurriculum(y).termEvidence.some((e) => e.id === "te-ien-121391-p5-t2")).toBe(true);
  });

  it("is deterministic: the same inputs and id registry give byte-identical output and ids", () => {
    const again = buildCurriculum(miniInput(input.idRegistry.entries()));
    const text = (x) => JSON.stringify({ nodes: x.nodes, resources: x.resources, ev: x.termEvidence, st: x.subjectTerms, audit: x.audit, map: x.mapping, outline: [...x.outline].map(([k, d]) => [k, serializeOutline(d)]) });
    expect(text(again)).toBe(text(r));
  });
});

describe("buildCurriculum on the committed crawl (run R2)", () => {
  let input;
  let r;
  beforeAll(async () => {
    input = await loadInputs();
    r = buildCurriculum(input);
  });

  it("matches the committed outputs byte for byte (node ids stable across reruns)", () => {
    expect(writeOutputs(r, { dryRun: true, idRegistry: input.idRegistry })).toEqual([]);
  });

  it("builds the whole iEN structure and never adds a source-only subject to the catalog", () => {
    const count = (f) => r.nodes.filter(f).length;
    expect(count((n) => n.kind === "lesson")).toBe(10102);
    expect(count((n) => n.kind === "unit")).toBe(2126);
    expect(count((n) => n.kind === "term")).toBe(40);
    const catalogIds = new Set(catalogLeaves(realCatalog).flatMap((l) => l.subjects.map((s) => `${l.leaf}/${s.id}`)));
    for (const n of r.nodes.filter((x) => x.kind === "subject")) {
      if (n.status === "source_only") {
        expect(catalogIds.has(n.id), n.id).toBe(false);
        expect(n.in_plan).toBe(false);
      } else expect(catalogIds.has(n.id), n.id).toBe(true);
    }
    for (const leaf of catalogLeaves(realCatalog)) {
      for (const s of leaf.subjects) expect(realCatalog.resolveCurriculum(leaf.slug).node.subjects.some((x) => x.id === s.id)).toBe(true);
    }
    expect(realCatalog.allLeaves().flatMap((l) => l.node.subjects).some((s) => /^ien-/.test(s.id))).toBe(false);
  });

  it("removes no subject from a term without verified evidence (the expected needs_review outcome)", () => {
    const verified = r.subjectTerms.filter((x) => x.status === "verified" || x.status === "absent");
    for (const [id, ct] of r.catalogTerms) {
      if (ct.terms.length < 2) expect(verified.some((x) => x.subject_node_id === id && x.status === "absent"), id).toBe(true);
    }
    // At this revision no cover names a term: every membership needs review.
    expect(new Set(r.subjectTerms.map((x) => x.status))).toEqual(new Set(["needs_review"]));
    expect([...r.catalogTerms.values()].every((ct) => ct.terms_status === "unverified" && ct.terms.length === 2)).toBe(true);
    expect(r.research.k9.changed || r.research.secondary.changed).toBe(false);
    // The committed front matter has term_* keys (one is the chapter heading «الفصل الثاني»); none becomes evidence.
    expect(r.termEvidence).toEqual([]);
  });

  it("records part, edition year and anomalies from listing/cover first", () => {
    const res = new Map(r.resources.map((x) => [x.id, x]));
    expect(res.get("ien-120606")).toMatchObject({ part: 1, part_evidence: { listing: 1, file_name: 1 }, year_label: "1448", status: "active" });
    const islmPart = r.resources.find((x) => x.provider_ref.path === "1448-GE-PE-K01-SM1-ISLM.part.pdf");
    expect(islmPart).toMatchObject({ part: 2, part_evidence: { listing: 2, file_name: null } });
    expect(res.get("ien-120808")).toMatchObject({ year_label: "1448", year_evidence: { cover: "1448", file_name: "1488" }, status: "needs_review" });
    expect(r.audit.filter((a) => a.code === "year_mismatch")).toHaveLength(13);
    for (const zip of ["ien-121376", "ien-121377", "ien-121393"]) expect(res.get(zip)).toMatchObject({ file_type: "zip", status: "needs_review", extraction: { status: "not_applicable" } });
    expect(res.get("ien-121393").kind).toBe("test_resource");
    expect(res.get("ien-121376").kind).toBe("audio");
    expect(res.get("ien-121377").kind).toBe("activity_book");
    expect(r.resources.filter((x) => x.kind === "question_bank_external").every((x) => x.external_count > 0 && x.term_status === "unknown")).toBe(true);
    expect(isUnitOpener("مدخل وحدة (القيم الإسلامية)")).toBe(true);
    expect(isUnitOpener("مدخل الوحدة الرابعة")).toBe(true);
    expect(isUnitOpener("مدخل إلى الذكاء الاصطناعي")).toBe(false);
    expect(bookKind({ title: "مقرر العلوم / كتاب الطالب", path: "a.pdf" })).toBe("student_book");
  });
});

// ── crawl-to-crawl diff (§4.1) ────────────────────────────────────────────
describe("crawl-diff", () => {
  const prev = {
    nodes: [
      { ien_id: 90, title: "الرياضيات", code_type: "SUB", parent_ien_id: 40, code_id: "math", is_active: true, grade_code: "K07", track_code: null },
      { ien_id: 95, title: "العلوم", code_type: "SUB", parent_ien_id: 40, code_id: "scin", is_active: true, grade_code: "K07", track_code: null },
    ],
    books: [{ ien_book_id: 1, subject_ien_id: 90, title: "كتاب", path: "1448-a.pdf", bytes: 10, last_modified: "x", http_status: 200, is_active: true }],
    lessons: [
      { subject_ien_id: 90, unit_ien_id: 91, unit_title: "وحدة", lesson_ien_id: 53, lesson_title: "درس", order: 0 },
      { subject_ien_id: 90, unit_ien_id: 91, unit_title: "وحدة", lesson_ien_id: 54, lesson_title: "درس 2", order: 1 },
    ],
  };
  const next = {
    nodes: [{ ...prev.nodes[0], title: "الرياضيات 1" }, { ien_id: 97, title: "جديد", code_type: "SUB", parent_ien_id: 40, code_id: "new", is_active: true, grade_code: "K07", track_code: null }],
    books: [{ ...prev.books[0], bytes: 12 }],
    lessons: [
      { subject_ien_id: 90, unit_ien_id: 92, unit_title: "وحدة 2", lesson_ien_id: 53, lesson_title: "درس", order: 0 },
      { subject_ien_id: 90, unit_ien_id: 91, unit_title: "وحدة", lesson_ien_id: 55, lesson_title: "درس 3", order: 1 },
    ],
  };

  it("lists added, removed, retitled, moved and changed entities plus edition mismatches", () => {
    const resources = [{ id: "ien-1", provider_ref: { ien_book_id: 1 }, year_evidence: { cover: "1447", file_name: "1448" } }];
    const out = diffCrawls(prev, next, { resources });
    expect(out.map((x) => `${x.entity}:${x.change}:${x.ien_id}`)).toEqual([
      "node:retitled:90", "node:removed:95", "node:added:97",
      "unit:added:92",
      "lesson:moved:53", "lesson:removed:54", "lesson:added:55",
      "book:changed:1", "book:edition_mismatch:1",
    ]);
    for (const x of out) expect(validateRecord("crawl-changes", x)).toEqual({ ok: true, errors: [] });
    expect(out.find((x) => x.change === "retitled")).toMatchObject({ before: { title: "الرياضيات" }, after: { title: "الرياضيات 1" } });
    expect(changesText(out).split("\n").filter(Boolean)).toHaveLength(9);
    expect(diffCrawls(prev, prev)).toEqual([]);
    expect(changesText([])).toBe("");
    expect(crawlDate({ retrieved_at: "2026-09-26T21:00:11.044Z" })).toBe("2026-09-26");
  });
});

// ── achievement prep alignment (§4.3b) ────────────────────────────────────
describe("build-prep-alignment", () => {
  const nodes = [
    { id: "high-school/grade-2/general/math", kind: "subject", stage: "high-school", status: "verified" },
    { id: "high-school/grade-2/general/math/n1", kind: "unit", stage: "high-school", subject: "high-school/grade-2/general/math", title_ar: "الدوال والمتباينات", status: "verified" },
    { id: "high-school/grade-1/first-year/ien-31578", kind: "subject", stage: "high-school", status: "source_only" },
  ];

  it("without a Qiyas specification every row is a subject-level candidate that needs review", () => {
    const rows = buildPrepAlignment({ sections: SECTIONS, nodes });
    expect(rows).toHaveLength(SECTIONS.math.topics.length);
    expect(rows.every((x) => x.status === "needs_review" && x.source_url === null && x.node_id === "high-school/grade-2/general/math")).toBe(true);
    for (const x of rows) expect(validateRecord("prep-alignment", x)).toEqual({ ok: true, errors: [] });
  });

  it("verifies unit rows only from a spec with provenance and refuses a spec without it", () => {
    const spec = { source_url: "https://www.qiyas.sa/spec.pdf", retrieved_at: "2026-10-01", topics: [{ prep_topic: "prep:achievement/math/functions", units: ["الدوال والمتباينات"] }] };
    const rows = buildPrepAlignment({ sections: SECTIONS, nodes, spec: checkSpec(spec, SECTIONS) });
    expect(rows.filter((x) => x.status === "verified")).toEqual([
      { schema: "prep-alignment@1", prep_topic: "prep:achievement/math/functions", node_id: "high-school/grade-2/general/math/n1", source_url: spec.source_url, retrieved_at: "2026-10-01", status: "verified" },
    ]);
    expect(() => checkSpec({ ...spec, source_url: "http://x" }, SECTIONS)).toThrow(SpecError);
    expect(() => checkSpec({ ...spec, retrieved_at: null }, SECTIONS)).toThrow(SpecError);
    expect(() => checkSpec({ ...spec, topics: [{ prep_topic: "prep:achievement/math/astrology", units: [] }] }, SECTIONS)).toThrow(/unknown achievement topic/);
  });
});

describe("writeOutputs", () => {
  it("writes each output once; a rerun with the same inputs changes no byte", () => {
    const dir = mkdtempSync(join(tmpdir(), "jz-curriculum-"));
    try {
      const input = miniInput();
      input.catalogMap[1].lesson_count = 3; // verified science mapping → the verified split is written
      const first = writeOutputs(buildCurriculum(input), { root: dir, idRegistry: input.idRegistry });
      expect(first).toEqual(expect.arrayContaining([
        "data/staging/curriculum/nodes/middle/grade-1.jsonl",
        "data/staging/curriculum/subject-terms.jsonl",
        "data/staging/curriculum/ien-mapping.json",
        "data/staging/curriculum/id-registry.jsonl",
        "data/staging/resources/resources.jsonl",
        "data/staging/resources/term-evidence.jsonl",
        "src/content/curriculum/outline/middle/grade-1.json",
        "src/content/curriculum/outline/catalog-terms.js",
        "src/content/curriculum/verified-k9.json",
      ]));
      const again = miniInput(input.idRegistry.entries());
      again.catalogMap[1].lesson_count = 3;
      const result = buildCurriculum(again);
      expect(writeOutputs(result, { root: dir, idRegistry: again.idRegistry, dryRun: true })).toEqual([]);
      const terms = readFileSync(join(dir, "src/content/curriculum/outline/catalog-terms.js"), "utf8");
      expect(terms).toMatch(/^\/\/ Generated by scripts\/content\/build-curriculum\.mjs/);
      expect(terms).toContain('"middle/grade-1/science"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── verifier regressions ──────────────────────────────────────────────────
describe("verifier regressions (WP2)", () => {
  it("splits words glued by zero-width / bidi controls and keeps the excerpt short", () => {
    expect(strictTermMatches("الفصل\u200cالدراسي الأول").map((m) => m.term)).toEqual(["t1"]);
    expect(strictTermMatches("الفصل\u200fالدراسي\u200f الثاني").map((m) => m.term)).toEqual(["t2"]);
    expect(strictTermMatches("الفصل\u200cالثاني")).toEqual([]);
  });

  it("never reads «الجزء الثالث عشر» as part 3", () => {
    expect(partFromText("الجزء الثالث عشر")).toBeNull();
    expect(partFromText("الجزء الثالث")).toBe(3);
    expect(partFromText("الجزء الأول من المقرر")).toBe(1);
  });

  it("a catalog-map row whose every iEN id fails is needs_review, not catalog_only; duplicate rows are audited", () => {
    const input = miniInput();
    const leaves = catalogLeaves(input.catalog);
    const base = { leaves, nodes: input.nodes, books: input.books, lessons: input.lessons };
    const wrong = { ...input.catalogMap[0], ien_subject_ids: [4242] }; // not in nodes.jsonl
    const a = reconcileCatalogMap({ ...base, rows: [wrong, input.catalogMap[1]] });
    expect(a.mapping.get("middle/grade-1/math")).toMatchObject({ outcome: "needs_review", status: "needs_review", ien_subject_ids: [] });
    expect(a.audit.some((x) => x.code === "map_missing_node")).toBe(true);
    const b = reconcileCatalogMap({ ...base, rows: [input.catalogMap[0], { ...input.catalogMap[0], ien_subject_ids: [95] }, input.catalogMap[1]] });
    expect(b.mapping.get("middle/grade-1/math")).toMatchObject({ ien_subject_ids: [90], status: "needs_review" });
    expect(b.audit.filter((x) => x.code === "map_duplicate_row")).toHaveLength(1);
    // A catalog subject with no row and no iEN title match is catalog_only but unverified.
    const c = reconcileCatalogMap({ ...base, rows: [input.catalogMap[0]] });
    expect(c.mapping.get("middle/grade-1/science")).toMatchObject({ outcome: "heuristic_only", status: "needs_review" });
  });

  it("crawl-diff refuses a git revision that git would parse as an option", async () => {
    const { readSnapshotRev } = await import("../../scripts/content/crawl-diff.mjs");
    expect(() => readSnapshotRev("--output=pwned")).toThrow(/bad git revision/);
    expect(() => readSnapshotRev("-p")).toThrow(/bad git revision/);
    expect(() => readSnapshotRev("HEAD..main")).toThrow(/bad git revision/);
  });
});
