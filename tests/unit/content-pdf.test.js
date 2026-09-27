// WP3 — PDF text extraction, Arabic repair, TOC, term evidence, exercise
// index, vision queue and front matter (docs/CONTENT_ENGINE.md §2.4, §2.6,
// §4.2). Fixtures are synthetic pdf.js text items (tests/fixtures/content/pdf,
// damaged lines copied as short lines from the real cache text); PDFs are
// generated in the test; nothing touches the network or the real cache.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzePage, buildLines, detectPrintedPage, openPdf, openRangePdf, pageOffset, parseLoneNumber, readPage } from "../../scripts/content/lib/pdf-text.mjs";
import {
  excerpt80,
  foldPresentationForms,
  isFontGarbage,
  isReversedLine,
  joinSplitLetters,
  repairLamWord,
  repairPage,
  repairText,
  reverseLine,
  worstQuality,
} from "../../scripts/content/lib/arabic-pdf.mjs";
import { createLexicon, loadLexicon } from "../../scripts/content/lib/lexicon.mjs";
import { alignToc, detectTocPages, entryLevel, lessonRanges, parsePageRef, parseToc, parseTocLine, tocRecord, tocStatus } from "../../scripts/content/lib/toc.mjs";
import { findTermMarkers, listingTitleEvidence, mergeTermEvidence, pageTermEvidence, visionTermEvidence } from "../../scripts/content/lib/term-evidence.mjs";
import { exerciseRows, matchExerciseHeading } from "../../scripts/content/lib/exercise-index.mjs";
import { validateRecord } from "../../scripts/content/lib/schemas.mjs";
import { CachePathError } from "../../scripts/content/lib/cache.mjs";
import { createFetchQueue } from "../../scripts/content/lib/fetch-queue.mjs";

const FIX = fileURLToPath(new URL("../fixtures/content/pdf/", import.meta.url));
const REPO = fileURLToPath(new URL("../../", import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(FIX, `${name}.json`), "utf8"));
const AT = "2026-09-26T21:00:11Z";
// Seed words + a few title words, as the repo lexicon would hold them.
const lex = createLexicon(["الرياضيات الصف الرابع المتوسط المهارات الحياتية الأعداد الصحيحة جمع"]);
const texts = (a) => a.lines.map((l) => l.text);

// ── line reconstruction and Arabic fixes (fixtures) ────────────────────────
describe("line reconstruction and Arabic repair on the fixtures", () => {
  for (const name of ["rtl-lines", "reversed-presentation", "lam-ligature", "split-letters", "two-column"]) {
    it(`${name}: ${fixture(name).description.slice(0, 70)}…`, () => {
      const f = fixture(name);
      const a = analyzePage(f.page, { lexicon: lex });
      expect(texts(a)).toEqual(f.expect.lines);
      for (const flag of f.expect.flags ?? []) expect(a.flags).toContain(flag);
      if (f.expect.text_quality) expect(a.text_quality).toBe(f.expect.text_quality);
      if (f.expect.two_column) expect(a.flags).toContain("two_column");
    });
  }

  it("the acceptance strings: املقرر → المقرر, اجلزء األول → الجزء الأول, المتخ ض ض ين joined", () => {
    const r = repairText("اجلزء األول من املقرر\nفريق من المتخ ض ض ين", { lexicon: lex });
    expect(r.lines).toEqual(["الجزء الأول من المقرر", "فريق من المتخضضين"]);
    expect(r.flags).toEqual(expect.arrayContaining(["ligature_fixed", "split_letters_fixed"]));
    expect(repairLamWord("املقرر", lex)).toEqual({ text: "المقرر", kind: "lexicon" });
    expect(repairLamWord("األول", lex).text).toBe("الأول");
    expect(repairLamWord("االبتدائي", lex).text).toBe("الابتدائي");
    expect(repairLamWord("األأعداد", lex).text).toBe("الأعداد");
  });

  it("flags õcôŸG as font_garbage and makes the page untrusted", () => {
    const f = fixture("font-garbage");
    const a = analyzePage(f.page, { lexicon: lex });
    expect(a.flags).toContain("font_garbage");
    expect(a.text_quality).toBe("untrusted");
    expect(a.stats.garbage_lines).toBe(2);
    expect(isFontGarbage("õcôŸG")).toBe(true);
    expect(isFontGarbage("°üØdG π ådÉãdG")).toBe(true);
    expect(isFontGarbage("زوروا www.ien.edu.sa للمزيد")).toBe(false);
    expect(isFontGarbage("Mega Goal 2 Second Semester")).toBe(false);
    expect(isFontGarbage("الكتلة 5 kg والطول 3 cm")).toBe(false);
  });

  it("keeps digit and Latin runs in order inside RTL lines", () => {
    const a = analyzePage(fixture("rtl-lines").page, { lexicon: lex });
    expect(texts(a)[1]).toBe("الصفحة 12 من 2026");
    expect(a.flags).toEqual([]);
    expect(a.text_quality).toBe("ok");
  });

  it("orders a two-column Arabic page right column first, full-width heading on top", () => {
    const f = fixture("two-column");
    const { lines, twoColumn } = buildLines(f.page.items, f.page);
    expect(twoColumn).toBe(true);
    expect(lines.map((l) => l.column)).toEqual([0, 1, 1, 1, 1, 2, 2, 2, 2]);
  });

  it("does not split justified single-column prose into columns", () => {
    // A near-empty band at x 280–300 by chance, but half of the lines run
    // across it (the prose of a preface page): one column.
    const items = [];
    for (let k = 0; k < 20; k++) {
      const y = 100 + k * 20;
      for (let n = 0; n < 8; n++) items.push({ str: "كلمة", dir: "rtl", x: 530 - n * 30, y, w: 26, size: 12 });
      for (let n = 0; n < 6; n++) items.push({ str: "كلمة", dir: "rtl", x: 250 - n * 30, y, w: 26, size: 12 });
      if (k % 2 === 0) items.push({ str: "كلمة طويلة", dir: "rtl", x: 262, y, w: 60, size: 12 });
    }
    const r = buildLines(items, { width: 600, height: 800 });
    expect(r.twoColumn).toBe(false);
    // the same page without the crossing words is two columns
    expect(buildLines(items.filter((i) => i.w !== 60), { width: 600, height: 800 }).twoColumn).toBe(true);
  });
});

describe("arabic-pdf helpers", () => {
  it("detects and reverses visual-order lines (digit runs keep their order)", () => {
    const visual = reverseLine("كتاب اللغة العربية 12");
    expect(isReversedLine(visual)).toBe(true);
    expect(reverseLine(visual)).toBe("كتاب اللغة العربية 12");
    expect(isReversedLine("كتاب اللغة العربية")).toBe(false);
  });

  it("folds only presentation forms with NFKC (² ½ stay)", () => {
    expect(foldPresentationForms("ﻻ x² ½")).toEqual({ text: "لا x² ½", changed: true });
    expect(foldPresentationForms("x² ½").changed).toBe(false);
  });

  it("joins split letters only as a run or when the lexicon confirms it", () => {
    expect(joinSplitLetters("من المتخ ض ض ين", lex).text).toBe("من المتخضضين");
    expect(joinSplitLetters("كتب و قرأ", lex).text).toBe("كتب و قرأ"); // «و» is a word
    expect(joinSplitLetters("المسألة 5 أ", lex).text).toBe("المسألة 5 أ");
  });

  it("text_quality: repaired for confirmed fixes, untrusted for unconfirmed ones, garbage, no text layer or low text with images", () => {
    expect(repairPage(["الصف الأول المتوسط الرياضيات"], { lexicon: lex }).text_quality).toBe("ok");
    expect(repairPage(["الصف األول املتوسط الرياضيات"], { lexicon: lex }).text_quality).toBe("repaired");
    expect(repairPage([""], { lexicon: lex, hasTextLayer: false }).text_quality).toBe("untrusted");
    expect(repairPage(["ص 3"], { lexicon: lex, images: 4 }).text_quality).toBe("untrusted");
    const unconfirmed = repairPage(["األول اكتسبت امشروعات املسقطات"], { lexicon: createLexicon([], { seed: false }) });
    expect(unconfirmed.stats.risk_rate).toBeGreaterThan(0.2);
    expect(unconfirmed.text_quality).toBe("untrusted");
    expect(worstQuality(["ok", "repaired", "ok"])).toBe("repaired");
  });

  it("excerpts are at most 80 characters", () => {
    const long = "كلمة ".repeat(40);
    expect(excerpt80(long).length).toBeLessThanOrEqual(80);
    expect(excerpt80("قصير")).toBe("قصير");
  });

  it("the lexicon strips articles and one-letter prefixes and loads repo titles", () => {
    expect(lex.has("المقرر")).toBe(true);
    expect(lex.has("والمقرر")).toBe(true);
    expect(lex.has("الاول")).toBe(true);
    expect(lex.has("قطار")).toBe(false);
    const repoLex = loadLexicon();
    expect(repoLex.size).toBeGreaterThan(1000);
    expect(repoLex.has("الرياضيات")).toBe(true);
  });
});

// ── printed pages ──────────────────────────────────────────────────────────
describe("printed page numbers and the page offset", () => {
  it("reads lone numbers in the bottom band and never guesses split digit groups", () => {
    const f = fixture("printed-pages");
    const printed = f.pages.map((p) => detectPrintedPage(p.items, p.height));
    expect(printed).toEqual(f.expect.printed);
    expect(pageOffset(f.pages.map((p, i) => ({ pdf_page: p.pdf_page, printed_page: printed[i] })))).toBe(f.expect.offset);
    expect(parseLoneNumber("٤ 9")).toBeNull();
    expect(parseLoneNumber("144٦")).toBeNull();
    expect(parseLoneNumber("١٢")).toBe(12);
  });
});

// ── TOC ────────────────────────────────────────────────────────────────────
describe("TOC parsing: levels, pages, labels, offsets", () => {
  const f = fixture("toc-page");
  const a = analyzePage(f.page, { lexicon: lex });
  const { entries, markers } = parseToc([{ pdf_page: 6, lines: a.lines }]);

  it("finds the TOC page and parses levels, labels and page numbers", () => {
    expect(detectTocPages([{ pdf_page: 6, lines: a.lines }])).toEqual([6]);
    expect(entries.map((e) => [e.level, e.label, e.printed_page, e.title])).toEqual(f.expect.entries);
    expect(markers.map((m) => m.term)).toEqual(["t2"]);
    expect(entries.find((e) => e.label === "2-2").ambiguous_page).toBe(true);
  });

  it("parses single lines in either reading order and never guesses digit groups", () => {
    expect(parseTocLine("الكسور العشرية ........ 45")).toMatchObject({ title: "الكسور العشرية", printed_page: 45, leader: true });
    expect(parseTocLine("45 ........ الكسور العشرية")).toMatchObject({ title: "الكسور العشرية", printed_page: 45 });
    expect(parseTocLine("3-4 الكسور العشرية 45")).toMatchObject({ title: "الكسور العشرية", printed_page: 45, label: "3-4" });
    expect(parseTocLine("الوحدة 3")).toMatchObject({ title: "الوحدة 3", printed_page: null, number: 3 });
    expect(parsePageRef("46 - 47")).toEqual({ page: 46, ambiguous: false });
    expect(parsePageRef("٤ 9")).toEqual({ page: null, ambiguous: true });
    expect(entryLevel({ title: "الوحدة الأولى: الأعداد" })).toBe("unit");
    expect(entryLevel({ title: "الفصل الثاني: الأعداد" })).toBe("chapter");
    expect(entryLevel({ title: "الفصل الدراسي الثاني" })).toBe("other");
    expect(entryLevel({ title: "Lesson 2 Shapes" })).toBe("lesson");
  });

  it("aligns entries to iEN nodes by trigram Jaccard (≥ 0.6 match, 0.4–0.6 kept for review)", () => {
    const S = "middle/grade-1/math";
    const units = [{ id: `${S}/n91`, title: "الجبر و الدوال" }, { id: `${S}/n92`, title: "الأعداد الصحيحة" }];
    const lessons = [
      { id: `${S}/n53`, title: "الخطوات الأربع لحل المسألة", unit_id: `${S}/n91` },
      { id: `${S}/n54`, title: "القوى و الأسس", unit_id: `${S}/n91` },
      { id: `${S}/n61`, title: "الأعداد الصحيحة والقيمة المطلقة", unit_id: `${S}/n92` },
      { id: `${S}/n62`, title: "مقارنة الأعداد الصحيحة وترتيبها", unit_id: `${S}/n92` },
      { id: `${S}/n63`, title: "المستوى الإحداثي والتمثيل البياني للنقاط", unit_id: `${S}/n92` },
    ];
    const aligned = alignToc(entries, { units, lessons });
    const byTitle = (t) => aligned.find((e) => e.title === t);
    expect(byTitle("الجبر والدوال").matched_node_id).toBe(`${S}/n91`);
    expect(byTitle("القوى والأسس").matched_node_id).toBe(`${S}/n54`);
    expect(byTitle("الخطوات الأربع لحل المسألة")).toMatchObject({ matched_node_id: `${S}/n53`, match_score: 1 });
    expect(byTitle("مقارنة الأعداد الصحيحة وترتيبها").matched_node_id).toBe(`${S}/n62`);
    const partial = byTitle("المستوى الإحداثي");
    expect(partial.match_score).toBeGreaterThanOrEqual(0.4);
    expect(partial.match_score).toBeLessThan(0.6);
    expect(partial.matched_node_id).toBe(`${S}/n63`);
    expect(byTitle("التهيئة").matched_node_id).toBeNull();
    expect(byTitle("الفصل الدراسي الثاني")).toMatchObject({ matched_node_id: null, marker: "t2" });

    // page ranges: printed start → next start − 1; PDF = printed + offset
    const ranges = lessonRanges(aligned, { offset: 2, pageCount: 40 });
    const r = (t) => ranges.find((x) => x.title === t);
    expect(r("الخطوات الأربع لحل المسألة")).toMatchObject({ printed_start: 12, printed_end: 16, pdf_start: 14, pdf_end: 18 });
    expect(r("القوى والأسس")).toMatchObject({ printed_start: 17, printed_end: 20 });
    expect(r("المستوى الإحداثي")).toMatchObject({ printed_start: 30, printed_end: 38, pdf_end: 40 });

    const rec = tocRecord({ resource_id: "ien-120607", entries: aligned, tocPages: [6], offset: 2, run_id: "run-20260927-extract-01" });
    expect(validateRecord("toc", rec)).toEqual({ ok: true, errors: [] });
    expect(rec.toc_status).toBe("found");
    expect(rec.entries.every((e) => e.title.length <= 80)).toBe(true);
    expect(rec.entries.find((e) => e.printed_page === 12).pdf_page).toBe(14);
  });

  it("an untrusted TOC page is detected but not parsed: it is routed to vision with two reads", async () => {
    const { visionRouting } = await import("../../scripts/content/extract-pdf.mjs");
    const u = fixture("toc-untrusted");
    const ua = analyzePage(u.page, { lexicon: lex });
    expect(ua.text_quality).toBe(u.expect.text_quality);
    expect(detectTocPages([{ pdf_page: 5, lines: ua.lines }])).toEqual([5]);
    const route = visionRouting({ pdf_page: 5, text: ua }, { kind: "toc", isToc: true, stem: true });
    expect(route).toEqual({ reason: u.expect.vision_reason, required: u.expect.reads_required });
    expect(tocStatus([])).toBe("not_found");
  });
});

// ── term evidence (§2.4) ───────────────────────────────────────────────────
describe("term evidence: strict routes only", () => {
  const ev = (p) => pageTermEvidence({ resource_id: "ien-120607", pdf_page: p.pdf_page, text: analyzePage(p, { lexicon: lex }).repaired, extracted_at: AT });

  it("cover fixtures: the strict regex, chapter headings and parts rejected, a third term is an anomaly", () => {
    const f = fixture("cover-pages");
    const got = f.pages.map(ev);
    expect(got.map((g) => g.rows.map((r) => [r.method, r.term]))).toEqual(f.expect.terms);
    expect(got.map((g) => g.anomalies.length)).toEqual(f.expect.anomalies);
    for (const g of got) for (const r of g.rows) expect(validateRecord("term-evidence", r)).toEqual({ ok: true, errors: [] });
    expect(got[0].rows[0]).toMatchObject({ id: "te-ien-120607-p1-t1", confidence: "high", reads: null });
  });

  it("the truth table of findTermMarkers", () => {
    const t = (s) => findTermMarkers(s).map((m) => m.term);
    expect(t("الفصل الدراسي الأول")).toEqual(["t1"]);
    expect(t("الفصل الدراسي األول")).toEqual(["t1"]); // swapped lam ligature
    expect(t("الفصل الدراسي الثاين")).toEqual(["t2"]); // text-layer ya/nun swap
    expect(t("الفصل الثاني")).toEqual([]); // a chapter
    expect(t("الفصل الثاني: الأعداد")).toEqual([]);
    expect(t("الجزء الأول من المقرر")).toEqual([]); // a part is never a term
    expect(t("مقررات العام الدراسي")).toEqual([]);
    expect(t("في الفصل الدراسي.")).toEqual([]);
    expect(t("English Second Term")).toEqual(["t2"]);
    expect(t("First semester")).toEqual(["t1"]);
    expect(t("Part 2")).toEqual([]);
  });

  it("untrusted text and pages beyond the title pages give nothing; TOC pages give toc_marker", () => {
    expect(pageTermEvidence({ resource_id: "ien-1", pdf_page: 1, text: "الفصل الدراسي الأول", text_quality: "untrusted", extracted_at: AT }).rows).toEqual([]);
    expect(pageTermEvidence({ resource_id: "ien-1", pdf_page: 9, text: "الفصل الدراسي الأول", extracted_at: AT }).rows).toEqual([]);
    const toc = pageTermEvidence({ resource_id: "ien-1", pdf_page: 9, text: "الفصل الدراسي الثاني", toc: true, extracted_at: AT });
    expect(toc.rows.map((r) => [r.method, r.term])).toEqual([["toc_marker", "t2"]]);
  });

  it("a listing title naming the term is inferred-grade evidence at pdf_page 0; parts never count", () => {
    const r = listingTitleEvidence({ resource_id: "ien-1", title: "مقرر العلوم / الفصل الدراسي الثاني", extracted_at: AT });
    expect(r.rows).toMatchObject([{ id: "te-ien-1-p0-t2", method: "listing_title", pdf_page: 0, confidence: "medium" }]);
    expect(listingTitleEvidence({ resource_id: "ien-1", title: "مقرر العلوم / كتاب الطالب الجزء الثاني", extracted_at: AT }).rows).toEqual([]);
  });

  it("vision needs two independent reads that agree", () => {
    const base = { resource_id: "ien-1", pdf_page: 1, extracted_at: AT, run_id: "run-20260927-extract-01" };
    expect(visionTermEvidence({ ...base, reads: ["الفصل الدراسي الأول"] })).toMatchObject({ status: "insufficient", rows: [] });
    const agreed = visionTermEvidence({ ...base, reads: ["الرياضيات\nالفصل الدراسي الأول", "الفصل الدراسي الأول\nالرياضيات"] });
    expect(agreed.status).toBe("agreed");
    expect(agreed.rows).toMatchObject([{ method: "vision", term: "t1", reads: 2, confidence: "high" }]);
    expect(validateRecord("term-evidence", agreed.rows[0]).ok).toBe(true);
    const disagreed = visionTermEvidence({ ...base, reads: ["الفصل الدراسي الأول", "الفصل الدراسي الثاني"] });
    expect(disagreed).toMatchObject({ status: "disagreed", rows: [] });
    expect(disagreed.anomalies[0].code).toBe("vision_term_disagreement");
    expect(visionTermEvidence({ ...base, reads: ["الرياضيات", "الرياضيات"] })).toMatchObject({ status: "none", rows: [] });
  });

  it("merging replaces a resource's extracted rows and keeps plan-guide / owner rows", () => {
    const row = (id, method, resource_id = "ien-1") => ({ id, resource_id, method });
    const existing = [row("te-ien-1-p1-t1", "cover_text"), row("te-ien-1-p0-t2", "plan_guide"), row("te-ien-2-p1-t2", "cover_text", "ien-2")];
    const merged = mergeTermEvidence(existing, [row("te-ien-1-p3-t1", "title_page_text")], ["ien-1"]);
    expect(merged.map((r) => r.id)).toEqual(["te-ien-1-p0-t2", "te-ien-1-p3-t1", "te-ien-2-p1-t2"]);
  });
});

// ── exercise index ─────────────────────────────────────────────────────────
describe("exercise index", () => {
  it("indexes example / exercise / review headings with canonical labels (no body text)", () => {
    const f = fixture("exercise-page");
    const a = analyzePage(f.page, { lexicon: lex });
    const rows = exerciseRows({ resource_id: "ien-120607", pdf_page: 14, lines: a.lines, lesson_node_id: "middle/grade-1/math/n4318" });
    expect(rows.map((r) => [r.label, r.kind])).toEqual(f.expect.rows);
    for (const r of rows) expect(validateRecord("exercise-index", r)).toEqual({ ok: true, errors: [] });
    expect(matchExerciseHeading("اختبار منتصف الفصل")).toEqual({ kind: "review", label: "اختبار منتصف الفصل" });
    expect(matchExerciseHeading("اكتب العبارة")).toBeNull();
  });
});

// ── real pdf.js on generated PDFs ──────────────────────────────────────────
/**
 * A minimal PDF (Helvetica text lines per page). `padBytes` adds an
 * unreferenced stream before the pages, so a range reader that fetches only
 * what it needs never touches it.
 */
function buildPdf(pages, { padBytes = 0 } = {}) {
  const objs = [];
  const add = (body) => objs.push(body) && objs.length;
  const catalog = add(null);
  const pagesObj = add(null);
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  if (padBytes) add(`<< /Length ${padBytes} >>\nstream\n${"x".repeat(padBytes)}\nendstream`);
  const kids = [];
  for (const p of pages) {
    const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
    const content = p.lines.map((l) => `BT /F1 ${l.size ?? 12} Tf 1 0 0 1 ${l.x ?? 72} ${l.y} Tm (${esc(l.text)}) Tj ET`).join("\n");
    const c = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

// An English textbook: cover (term), TOC, two lesson pages with printed numbers.
const BOOK_PAGES = [
  { lines: [{ text: "Mathematics", y: 600, size: 30 }, { text: "Second Semester", y: 540, size: 20 }, { text: "Grade 7", y: 500, size: 16 }] },
  {
    lines: [
      { text: "Contents", y: 720, size: 20 },
      { text: "Unit 1 Numbers .......... 1", y: 680 },
      { text: "Lesson 1-1 Counting objects .......... 1", y: 660 },
      { text: "Lesson 1-2 Adding numbers .......... 2", y: 640 },
      { text: "Review .......... 3", y: 620 },
    ],
  },
  { lines: [{ text: "Lesson 1-1 Counting objects", y: 720, size: 18 }, { text: "Example 1", y: 680, size: 14 }, { text: "Count the apples in the basket.", y: 660 }, { text: "1", x: 300, y: 30 }] },
  { lines: [{ text: "Lesson 1-2 Adding numbers", y: 720, size: 18 }, { text: "Exercises", y: 680, size: 14 }, { text: "Add the numbers in each row.", y: 660 }, { text: "2", x: 300, y: 30 }] },
  { lines: [{ text: "Review", y: 720, size: 18 }, { text: "Check your answers.", y: 680 }, { text: "3", x: 300, y: 30 }] },
];

describe("pdf.js text layer (generated PDF)", () => {
  it("reads a local PDF page into slim items and analyzes it", async () => {
    const doc = await openPdf({ data: buildPdf(BOOK_PAGES) });
    try {
      expect(doc.numPages).toBe(5);
      const page = await readPage(doc, 3);
      expect(page).toMatchObject({ pdf_page: 3, width: 612, height: 792, images: 0 });
      const a = analyzePage(page, { lexicon: lex, language: "en" });
      expect(texts(a)).toEqual(["Lesson 1-1 Counting objects", "Example 1", "Count the apples in the basket.", "1"]);
      expect(a.printed_page).toBe(1);
      expect(a.headings[0]).toBe("Lesson 1-1 Counting objects");
      expect(a.text_quality).toBe("ok");
    } finally {
      await doc.destroy();
    }
  });
});

describe("range mode fetches only the byte ranges pdf.js needs (through the queue)", () => {
  let server;
  let base;
  const hits = [];
  const pdf = buildPdf(BOOK_PAGES, { padBytes: 1_500_000 });
  beforeAll(async () => {
    server = createServer((req, res) => {
      const m = /bytes=(\d+)-(\d+)/.exec(req.headers.range || "");
      hits.push(req.headers.range || null);
      if (!m) {
        res.writeHead(200, { "Content-Length": pdf.length });
        return res.end(pdf);
      }
      const [a, b] = [Number(m[1]), Math.min(Number(m[2]), pdf.length - 1)];
      res.writeHead(206, { "Content-Range": `bytes ${a}-${b}/${pdf.length}`, "Content-Length": b - a + 1 });
      res.end(pdf.subarray(a, b + 1));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  it("reads the front pages with a few Range requests and never downloads the file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jz-range-"));
    const q = createFetchQueue({ dir, pauseMs: 0, pollMs: 5 });
    const { doc, stats, guard, close } = await openRangePdf({
      length: pdf.length,
      rangeChunkSize: 65536,
      fetchRange: async (begin, end) => {
        const r = await q.request(`${base}/book.pdf`, { kind: "range", headers: { Range: `bytes=${begin}-${end - 1}` } });
        expect(r.status).toBe(206);
        return new Uint8Array(r.body);
      },
    });
    try {
      const a = analyzePage(await guard(readPage(doc, 1, { images: false })), { lexicon: lex, language: "en" });
      expect(texts(a)).toContain("Second Semester");
    } finally {
      await close();
    }
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => /^bytes=\d+-\d+$/.test(h))).toBe(true);
    expect(stats.bytes).toBeLessThan(pdf.length / 4);
    for (const [b, e] of stats.ranges) expect(e - b).toBeLessThanOrEqual(65536);
    expect(q.status().totals.requests).toBe(hits.length);
    rmSync(dir, { recursive: true, force: true });
  });
});

// ── extract-pdf end to end (temp staging + temp cache) ─────────────────────
const RUN = "run-20260927-extract-01";
const BOOK = { ien_book_id: 900001, subject_ien_id: 90, title: "English / Student Book Part 1", path: "1448-GE-ME-K07-SM1-eng-part1.pdf", file_ext: "pdf", http_status: 200, slug: "eng-part1" };
const ARABIC_BOOK = { ien_book_id: 900002, subject_ien_id: 90, title: "مقرر الرياضيات / كتاب الطالب الجزء الأول", path: "1448-GE-ME-K07-SM1-math-part9.pdf", file_ext: "pdf", http_status: 200, slug: "math-part9" };

function tempTree() {
  const root = mkdtempSync(join(tmpdir(), "jz-extract-"));
  const staging = join(root, "staging");
  const cache = join(root, "cache");
  mkdirSync(join(staging, "sources/ien"), { recursive: true });
  mkdirSync(join(staging, "curriculum"), { recursive: true });
  mkdirSync(join(cache, "ien/pdf"), { recursive: true });
  const lessons = [
    { subject_ien_id: 90, unit_ien_id: 91, unit_title: "Numbers", lesson_ien_id: 53, lesson_title: "Counting objects", order: 0 },
    { subject_ien_id: 90, unit_ien_id: 91, unit_title: "Numbers", lesson_ien_id: 54, lesson_title: "Adding numbers", order: 1 },
  ];
  const pdf = buildPdf(BOOK_PAGES);
  writeFileSync(join(cache, "ien/pdf", BOOK.path), pdf);
  const books = [{ ...BOOK, bytes: pdf.length }, ARABIC_BOOK];
  writeFileSync(join(staging, "sources/ien/books.jsonl"), books.map((b) => JSON.stringify(b)).join("\n") + "\n");
  writeFileSync(join(staging, "sources/ien/lessons.jsonl"), lessons.map((b) => JSON.stringify(b)).join("\n") + "\n");
  writeFileSync(join(staging, "curriculum/ien-mapping.json"), JSON.stringify({ schema: "ien-mapping@1", subjects: { 90: "middle/grade-1/english" } }));
  return { root, staging, cache, books };
}
const readLines = (p) => readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("extract-pdf: page maps, TOC, exercise index, term evidence and status", () => {
  let t;
  let ctx;
  let out;
  let x;
  beforeAll(async () => {
    x = await import("../../scripts/content/extract-pdf.mjs");
    t = tempTree();
    ctx = x.loadContext({ stagingDir: t.staging, cacheDir: t.cache, lexicon: lex });
    out = await x.extractResource(ctx, ctx.booksById.get("ien-900001"), { pages: "all", run_id: RUN });
  });
  afterAll(() => rmSync(t.root, { recursive: true, force: true }));

  it("writes schema-valid page maps without body text", () => {
    expect(out.status).toBe("full_done");
    const rows = readLines(join(t.staging, "resources/page-maps/ien-900001.jsonl"));
    expect(rows.map((r) => r.pdf_page)).toEqual([1, 2, 3, 4, 5]);
    for (const r of rows) {
      expect(validateRecord("page-map", r)).toEqual({ ok: true, errors: [] });
      expect(Object.keys(r)).not.toEqual(expect.arrayContaining(["raw"]));
      expect(JSON.stringify(r)).not.toMatch(/Count the apples|Add the numbers|Check your answers/);
    }
    expect(rows.map((r) => r.kind)).toEqual(["cover", "toc", "lesson", "exercise", "review"]);
    expect(rows.map((r) => r.printed_page)).toEqual([null, null, 1, 2, 3]);
    expect(rows.map((r) => r.lesson_node_id)).toEqual([null, null, "middle/grade-1/english/n53", "middle/grade-1/english/n54", null]);
    expect(rows.every((r) => r.text_method === "text" && r.text_quality === "ok")).toBe(true);
  });

  it("writes the TOC, the exercise index, term evidence and the extraction status", () => {
    const toc = JSON.parse(readFileSync(join(t.staging, "resources/toc/ien-900001.json"), "utf8"));
    expect(validateRecord("toc", toc)).toEqual({ ok: true, errors: [] });
    expect(toc).toMatchObject({ toc_status: "found", toc_pages: [2], page_offset: 2 });
    expect(toc.entries.map((e) => [e.level, e.printed_page, e.pdf_page, e.matched_node_id])).toEqual([
      ["unit", 1, 3, "middle/grade-1/english/n91"],
      ["lesson", 1, 3, "middle/grade-1/english/n53"],
      ["lesson", 2, 4, "middle/grade-1/english/n54"],
      ["other", 3, 5, null],
    ]);
    const ex = readLines(join(t.staging, "resources/exercise-index/ien-900001.jsonl"));
    expect(ex.map((r) => [r.pdf_page, r.label, r.kind, r.lesson_node_id])).toEqual([
      [3, "مثال 1", "example", "middle/grade-1/english/n53"],
      [4, "Exercises", "exercise", "middle/grade-1/english/n54"],
      [5, "Review", "review", null],
    ]);
    const te = readLines(join(t.staging, "resources/term-evidence.jsonl"));
    expect(te.map((r) => [r.id, r.method, r.term])).toEqual([["te-ien-900001-p1-t2", "cover_text", "t2"]]);
    const status = readLines(join(t.staging, "resources/extraction.jsonl"));
    expect(status).toHaveLength(1);
    expect(validateRecord("extraction", status[0]).ok).toBe(true);
    expect(status[0]).toMatchObject({ resource_id: "ien-900001", status: "full_done", run_id: RUN, page_count: 5, pages_with_text: 5, pages_vision: 0, text_quality: "ok", toc_status: "found", page_offset: 2 });
  });

  it("keeps page text in the cache only, and rebuilding is byte-identical", () => {
    const cacheRows = readLines(join(t.cache, "extract/ien-900001/pages.jsonl"));
    expect(cacheRows).toHaveLength(5);
    expect(cacheRows[2].repaired).toContain("Count the apples in the basket.");
    expect(existsSync(join(t.cache, "ien/text/1448-GE-ME-K07-SM1-eng-part1/p003.txt"))).toBe(true);
    const snapshot = () => ["page-maps/ien-900001.jsonl", "toc/ien-900001.json", "exercise-index/ien-900001.jsonl", "term-evidence.jsonl"].map((f) => readFileSync(join(t.staging, "resources", f), "utf8"));
    const before = snapshot();
    x.buildOutputs(ctx, ctx.booksById.get("ien-900001"), { run_id: RUN, extractedAt: out.extraction.extracted_at });
    expect(snapshot()).toEqual(before);
    const files = readdirSync(join(t.staging, "resources"), { recursive: true }).map(String);
    expect(files.filter((f) => /\.(jpe?g|png|txt)$/i.test(f))).toEqual([]);
  });

  it("refuses a cache inside the repository and records non-PDF / unsafe / uncached books", async () => {
    expect(() => x.assertCacheOutsideRepo(join(REPO, "data/cache"))).toThrow(/outside the repository/);
    expect(() => x.loadContext({ stagingDir: t.staging, cacheDir: join(REPO, "tmp-cache"), lexicon: lex })).toThrow(/outside the repository/);
    const zip = await x.extractResource(ctx, { ...BOOK, ien_book_id: 900003, path: "1448-audio.zip", file_ext: "zip" }, { run_id: RUN });
    expect(zip.status).toBe("not_applicable");
    const hostile = await x.extractResource(ctx, { ...BOOK, ien_book_id: 900004, path: "..\\..\\evil.pdf" }, { run_id: RUN });
    expect(hostile.status).toBe("failed");
    expect(hostile.extraction.anomalies[0].code).toBe("unsafe_file_name");
    const missing = await x.extractResource(ctx, ctx.booksById.get("ien-900002"), { run_id: RUN });
    expect(missing.status).toBe("not_started");
    const rows = readLines(join(t.staging, "resources/extraction.jsonl"));
    expect(rows.map((r) => [r.resource_id, r.status])).toEqual([
      ["ien-900001", "full_done"],
      ["ien-900002", "not_started"],
      ["ien-900003", "not_applicable"],
      ["ien-900004", "failed"],
    ]);
    for (const r of rows) expect(validateRecord("extraction", r).ok).toBe(true);
    expect(x.selectPages("cover,toc", 40)).toHaveLength(15);
    expect(x.selectPages("3-5,9", 6)).toEqual([3, 4, 5]);
    expect(() => x.selectPages("x", 6)).toThrow(/--pages/);
    expect(matchExerciseHeading("Review .......... 3")).toBeNull(); // a TOC entry, not a heading
  });
});

// ── vision queue ───────────────────────────────────────────────────────────
describe("vision-queue: jobs for untrusted pages, two agreeing reads for cover/TOC terms", () => {
  const RUN2 = "run-20260927-extract-02";
  let t;
  let ctx;
  let x;
  let v;
  const book = () => ctx.booksById.get("ien-900002");
  const line = (job_id, pdf_page, read_no, transcript, printed_page = null) => JSON.stringify({ job_id, resource_id: "ien-900002", pdf_page, read_no, printed_page, transcript });
  const COVER = "الرياضيات\nالصف الأول المتوسط\nالفصل الدراسي الأول\nالجزء الأول";
  const TOC = "المحتويات\nالجبر والدوال\nالتهيئة ........ 11\n1-1 الخطوات الأربع لحل المسألة ........ 12\n1-2 القوى والأسس ........ 17";

  beforeAll(async () => {
    x = await import("../../scripts/content/extract-pdf.mjs");
    v = await import("../../scripts/content/vision-queue.mjs");
    t = tempTree();
    ctx = x.loadContext({ stagingDir: t.staging, cacheDir: t.cache, lexicon: lex });
    // Text rows as extract-pdf stores them: an untrusted cover and an untrusted TOC page.
    const cover = analyzePage({ ...fixture("font-garbage").page, pdf_page: 1 }, { lexicon: lex });
    const toc = analyzePage({ ...fixture("toc-untrusted").page, pdf_page: 2 }, { lexicon: lex });
    x.writeCachePages(ctx, "ien-900002", [x.cacheRow(cover, { run_id: RUN }), x.cacheRow(toc, { run_id: RUN })]);
    x.buildOutputs(ctx, book(), { run_id: RUN, status: "frontmatter_done", pageCount: 2 });
  });
  afterAll(() => rmSync(t.root, { recursive: true, force: true }));

  it("routes untrusted cover/TOC pages to vision with two reads each", async () => {
    const status = readLines(join(t.staging, "resources/extraction.jsonl"))[0];
    expect(status).toMatchObject({ pages_untrusted: 2, pages_awaiting_vision: 2, toc_status: "partial", text_quality: "untrusted" });
    const r = await v.buildJobs(ctx, [book()], { runId: RUN2 });
    expect(r.jobs.map((j) => [j.job_id, j.purpose, j.reason, j.reads_required])).toEqual([
      ["ien-900002:p001:r1", "cover", "untrusted", 2],
      ["ien-900002:p001:r2", "cover", "untrusted", 2],
      ["ien-900002:p002:r1", "toc", "untrusted", 2],
      ["ien-900002:p002:r2", "toc", "untrusted", 2],
    ]);
    expect(r.jobs[0].image).toMatch(/ien\/pages\/1448-GE-ME-K07-SM1-math-part9\/p001\.jpg$/);
    expect((await v.buildJobs(ctx, [book()], { runId: RUN2 })).added).toBe(0); // idempotent
  });

  it("rejects malformed transcript files", () => {
    const jobs = readLines(join(t.cache, "llm", RUN2, "vision-jobs.jsonl"));
    const bad = v.validateTranscripts([
      "not json",
      line("ien-999:p001:r1", 1, 1, "x"),
      line("ien-900002:p001:r1", 2, 1, "x"),
      line("ien-900002:p001:r1", 1, 1, COVER),
      line("ien-900002:p001:r2", 1, 2, COVER),
    ], jobs);
    expect(bad.errors).toHaveLength(4);
    expect(bad.errors.join("\n")).toMatch(/not JSON[\s\S]*unknown job_id[\s\S]*do not match[\s\S]*same file/);
    expect(v.importTranscripts(ctx, RUN2, [line("ien-900002:p001:r1", 1, 1, 5)]).errors[0]).toMatch(/transcript must be a string/);
  });

  it("one read gives no term evidence; two agreeing reads from separate files give vision evidence", () => {
    const first = v.importTranscripts(ctx, RUN2, [line("ien-900002:p001:r1", 1, 1, COVER), line("ien-900002:p002:r1", 2, 1, TOC)]);
    expect(first).toMatchObject({ imported: 2, errors: [], rebuilt: ["ien-900002"] });
    const te = () => (existsSync(join(t.staging, "resources/term-evidence.jsonl")) ? readLines(join(t.staging, "resources/term-evidence.jsonl")) : []);
    expect(te()).toEqual([]);
    v.importTranscripts(ctx, RUN2, [line("ien-900002:p001:r2", 1, 2, `${COVER}\nطبعة 1448`), line("ien-900002:p002:r2", 2, 2, TOC)]);
    expect(te().map((r) => [r.id, r.method, r.term, r.reads])).toEqual([["te-ien-900002-p1-t1", "vision", "t1", 2]]);
    const pm = readLines(join(t.staging, "resources/page-maps/ien-900002.jsonl"));
    expect(pm.map((r) => [r.text_method, r.flags.includes("vision_read"), r.kind])).toEqual([
      ["vision", true, "cover"],
      ["vision", true, "toc"],
    ]);
    const toc = JSON.parse(readFileSync(join(t.staging, "resources/toc/ien-900002.json"), "utf8"));
    expect(toc.entries.every((e) => e.method === "vision")).toBe(true);
    expect(toc.entries.map((e) => e.printed_page)).toEqual([null, 11, 12, 17]);
    const status = readLines(join(t.staging, "resources/extraction.jsonl"))[0];
    expect(status).toMatchObject({ pages_vision: 2, pages_awaiting_vision: 0 });
    expect(v.jobStatus(ctx, RUN2)[RUN2]).toMatchObject({ total: 4, done: 4, pending: 0 });
    // transcripts stay in the cache
    const cacheRows = readLines(join(t.cache, "extract/ien-900002/pages.jsonl"));
    expect(cacheRows.filter((r) => r.method === "vision")).toHaveLength(4);
    expect(JSON.stringify(pm)).not.toContain("الخطوات الأربع");
  });

  it("disagreeing reads give no evidence", () => {
    const r = visionTermEvidence({ resource_id: "ien-900002", pdf_page: 1, reads: [COVER, COVER.replace("الفصل الدراسي الأول", "الفصل الدراسي الثاني")], extracted_at: AT });
    expect(r.rows).toEqual([]);
  });
});

// ── pdf-frontmatter ────────────────────────────────────────────────────────
describe("pdf-frontmatter rows", () => {
  let fm;
  beforeAll(async () => {
    fm = await import("../../scripts/content/pdf-frontmatter.mjs");
  });

  it("sanitizes rows written by the old script (no cache_dir, no term_* keys, snippets ≤ 80)", () => {
    const old = {
      ien_book_id: 120527, subject_ien_id: 314, path: "1448-GE-PE-K02-SM1-math.pdf", title: "مقرر الرياضيات", page_count: 161,
      pdf_creation_date: "D:20250316230847+03'00'", pdf_mod_date: null, pdf_language: "ar-SA", pages_read: 14, page_chars: [244, 0], text_layer: "present",
      evidence: {
        part_2: { page: 1, snippet: "ط ب ع ه ع ل ى نفقتها الرياضيات ال ض ف الرابع االبتدائي اجلزء الثاين من املقرر قام بالت ا أليف والمراجعة فريق من المتخ ض ض ين طبعة ١٤٤8" },
        toc: { page: 2, snippet: "المحتويات " + "كلمة ".repeat(30) },
        term_2: { page: 3, snippet: "الفصل الثاني" },
      },
      toc_candidate_pages: [2], cache_dir: "C:/jazira/content-cache/ien/text/1448-GE-PE-K02-SM1-math", ms: 74190,
    };
    const row = fm.sanitizeRow(old);
    expect(row).not.toHaveProperty("cache_dir");
    // the edition line hidden at the end of an over-long snippet is kept as its own key
    expect(Object.keys(row.evidence)).toEqual(["part_2", "toc", "year_1448"]);
    expect(row.evidence.year_1448).toMatchObject({ page: 1 });
    expect(row.evidence.part_2.snippet).toMatch(/^.{0,80}$/u);
    expect(row.evidence.part_2.snippet).toContain("اجلزء الثاين");
    for (const e of Object.values(row.evidence)) expect(e.snippet.length).toBeLessThanOrEqual(80);
    expect(validateRecord("book-frontmatter", row)).toEqual({ ok: true, errors: [] });
    expect(fm.sanitizeRow({ ien_book_id: 1, path: "x.pdf", error: "HTTP 404" })).toEqual({ schema: "book-frontmatter@1", ien_book_id: 1, path: "x.pdf", error: "HTTP 404" });
  });

  it("takes evidence snippets from repaired text: parts and years, never terms", () => {
    const ev = fm.frontmatterEvidence([
      { pdf_page: 1, repaired: "الرياضيات\nالفصل الدراسي الأول" },
      { pdf_page: 2, repaired: "الجزء الأول من المقرر\nطبعة 1448\nالمحتويات" },
    ]);
    expect(Object.keys(ev).sort()).toEqual(["part_1", "toc", "year_1448"]);
    expect(ev.part_1).toEqual({ page: 2, snippet: "الجزء الأول من المقرر" });
  });

  it("reads the front pages of a cached PDF into a schema-valid row and cache rows", async () => {
    const t = tempTree();
    try {
      const b = { ...BOOK, bytes: buildPdf(BOOK_PAGES).length };
      const row = await fm.readFrontmatter(b, { pages: 3, root: t.cache, lexicon: lex, runId: RUN });
      expect(validateRecord("book-frontmatter", row)).toEqual({ ok: true, errors: [] });
      expect(row).toMatchObject({ ien_book_id: 900001, page_count: 5, pages_read: 3, text_quality: "ok", toc_candidate_pages: [2], run_id: RUN });
      expect(JSON.stringify(row)).not.toMatch(/term_|cache_dir|content-cache/);
      expect(readLines(join(t.cache, "extract/ien-900001/pages.jsonl")).map((r) => r.pdf_page)).toEqual([1, 2, 3]);
      const again = fm.rebuildFromCache(row, b, { root: t.cache, lexicon: lex, language: "en" });
      expect(again).toMatchObject({ pages_read: 3, toc_candidate_pages: [2], page_chars: row.page_chars });
    } finally {
      rmSync(t.root, { recursive: true, force: true });
    }
  });
});

// ── pdf-render: path safety ────────────────────────────────────────────────
describe("pdf-render path safety", () => {
  let r;
  beforeAll(async () => {
    r = await import("../../scripts/content/pdf-render.mjs");
  });

  it("parses page specs", () => {
    expect(r.parsePages("12-14,20")).toEqual([12, 13, 14, 20]);
    expect(r.parsePages("0,x,3")).toEqual([3]);
  });

  it("rejects hostile file names before touching the network or the disk", async () => {
    const root = mkdtempSync(join(tmpdir(), "jz-render-"));
    const queue = { request: async () => { throw new Error("network used"); } };
    for (const bad of ["../evil.pdf", "..\\evil.pdf", "CON.pdf", "a/b.pdf", "C:\\x.pdf", "evil.exe"]) {
      await expect(r.renderPages(bad, [1], { root, queue })).rejects.toBeInstanceOf(CachePathError);
    }
    expect(readdirSync(root)).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });

  it("serves only pdf.js files and the one PDF (no traversal)", async () => {
    const root = mkdtempSync(join(tmpdir(), "jz-serve-"));
    const pdfFile = join(root, "book.pdf");
    writeFileSync(pdfFile, buildPdf(BOOK_PAGES));
    const server = await r.serve(pdfFile);
    const get = (path) => new Promise((resolve, reject) => {
      import("node:http").then(({ request }) => {
        const req = request({ host: "127.0.0.1", port: server.address().port, path }, (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode));
        });
        req.on("error", reject);
        req.end();
      });
    });
    try {
      expect(await get("/book.pdf")).toBe(200);
      expect(await get("/pdfjs/build/pdf.mjs")).toBe(200);
      expect(await get("/pdfjs/../../package.json")).toBe(404);
      expect(await get("/pdfjs/..%2F..%2Fpackage.json")).toBe(404);
      expect(await get("/pdfjs/%E0%A4%A")).toBe(400);
      expect(await get("/package.json")).toBe(404);
    } finally {
      server.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ── optional: a real cached book (JZ_PDF_CACHE=<path to a cached PDF>) ────
describe.skipIf(!process.env.JZ_PDF_CACHE)("integration: a cached iEN book", () => {
  it("extracts the front pages into schema-valid page-map rows", async () => {
    const doc = await openPdf({ path: process.env.JZ_PDF_CACHE });
    try {
      const repoLex = loadLexicon();
      const pages = [];
      for (let n = 1; n <= Math.min(15, doc.numPages); n++) pages.push(analyzePage(await readPage(doc, n), { lexicon: repoLex }));
      for (const a of pages) {
        expect(["ok", "repaired", "untrusted"]).toContain(a.text_quality);
        expect(a.headings.every((h) => h.length <= 80)).toBe(true);
      }
      const tocPages = detectTocPages(pages.map((a) => ({ pdf_page: a.pdf_page, lines: a.lines })));
      const { entries } = parseToc(pages.filter((a) => tocPages.includes(a.pdf_page) && a.text_quality !== "untrusted").map((a) => ({ pdf_page: a.pdf_page, lines: a.lines })));
      const rec = tocRecord({ resource_id: "ien-1", entries, tocPages, offset: null });
      expect(validateRecord("toc", rec).ok).toBe(true);
    } finally {
      await doc.destroy();
    }
  });
});

// ── verifier regressions (WP3 review) ──────────────────────────────────────
describe("regressions: split letters never glue labels, page references or lone letters", () => {
  it("leaves «1447 ه», «ص 45», «النقطة أ», «س ص» alone and still joins real splits", () => {
    const j = (s) => joinSplitLetters(s, lex);
    expect(j("طبعة 1447 ه")).toMatchObject({ text: "طبعة 1447 ه", joins: 0 });
    expect(j("انظر ص 45")).toMatchObject({ text: "انظر ص 45", joins: 0 });
    expect(j("النقطة أ والنقطة ب")).toMatchObject({ text: "النقطة أ والنقطة ب", joins: 0 });
    expect(j("المتغيران س ص")).toMatchObject({ text: "المتغيران س ص", joins: 0 });
    expect(j("من المو ص وع").text).toBe("من الموصوع"); // the design's example
    expect(j("من المتخ ض ض ين").text).toBe("من المتخضضين");
  });

  it("an edition line with «ه» is not a repair and does not make the page untrusted", () => {
    const r = repairPage(["الرياضيات الصف الرابع", "طبعة 1447 ه"], { lexicon: lex });
    expect(r.flags).not.toContain("split_letters_fixed");
    expect(r.stats.split_joins).toBe(0);
    expect(r.text_quality).toBe("ok");
  });

  it("repairs a second lam-alef inside the same word when the lexicon confirms it", () => {
    const l = createLexicon(["الإسلام الاستقلال"]);
    expect(repairLamWord("اإلسالم", l)).toEqual({ text: "الإسلام", kind: "lexicon" });
    expect(repairLamWord("االستقالل", l)).toEqual({ text: "الاستقلال", kind: "lexicon" });
    expect(repairLamWord("اإلسالم", createLexicon([], { seed: false }))).toEqual({ text: "الإسالم", kind: "safe" }); // unconfirmed inner swap: not guessed
  });
});

describe("regressions: a cover naming both terms is `both`, never term 1", () => {
  it("findTermMarkers", () => {
    const t = (s) => findTermMarkers(s).map((m) => m.term);
    expect(t("الفصل الدراسي الأول والثاني")).toEqual(["both"]);
    expect(t("الفصل الدراسي الأول و الثاني")).toEqual(["both"]);
    expect(t("الفصل الدراسي الأول / الثاني")).toEqual(["both"]);
    expect(t("الفصلين الدراسيين الأول والثاني")).toEqual(["both"]);
    expect(t("First and Second Semester")).toEqual(["both"]);
    expect(t("الفصل الدراسي الأول والثالث")).toEqual(["t1"]);
    expect(t("الفصل الدراسي الأول 1448")).toEqual(["t1"]);
  });

  it("gives a schema-valid `both` row", () => {
    const r = pageTermEvidence({ resource_id: "ien-120607", pdf_page: 1, text: "الرياضيات\nالفصل الدراسي الأول والثاني", extracted_at: AT });
    expect(r.rows.map((x) => [x.id, x.term])).toEqual([["te-ien-120607-p1-both", "both"]]);
    expect(validateRecord("term-evidence", r.rows[0])).toEqual({ ok: true, errors: [] });
  });
});

describe("regressions: extract-pdf outputs", () => {
  let t;
  let ctx;
  let x;
  let v;
  const coverPage = (text) => ({ pdf_page: 1, width: 600, height: 800, images: 0, items: text.split("\n").map((s, i) => ({ str: s, dir: "rtl", x: 100, y: 100 + i * 40, w: 300, size: 20 })) });
  beforeAll(async () => {
    x = await import("../../scripts/content/extract-pdf.mjs");
    v = await import("../../scripts/content/vision-queue.mjs");
    t = tempTree();
    ctx = x.loadContext({ stagingDir: t.staging, cacheDir: t.cache, lexicon: lex });
  });
  afterAll(() => rmSync(t.root, { recursive: true, force: true }));
  const files = () => ["page-maps/ien-900001.jsonl", "toc/ien-900001.json", "exercise-index/ien-900001.jsonl", "term-evidence.jsonl", "extraction.jsonl"].map((f) => readFileSync(join(t.staging, "resources", f), "utf8"));

  it("a rerun under a new run id with nothing changed produces no diff", async () => {
    await x.extractResource(ctx, ctx.booksById.get("ien-900001"), { pages: "all", run_id: RUN });
    const before = files();
    await new Promise((r) => setTimeout(r, 1100)); // a later second: extracted_at would differ
    await x.extractResource(ctx, ctx.booksById.get("ien-900001"), { pages: "all", run_id: "run-20260928-extract-01" });
    expect(files()).toEqual(before);
    expect(JSON.parse(files()[1]).run_id).toBe(RUN);
  });

  it("a page with vision reads takes its term evidence from them only", () => {
    const b = ctx.booksById.get("ien-900002");
    const text = analyzePage(coverPage("الرياضيات\nالفصل الدراسي الأول"), { lexicon: lex });
    x.writeCachePages(ctx, "ien-900002", [x.cacheRow(text, { run_id: RUN })]);
    const te = () => readLines(join(t.staging, "resources/term-evidence.jsonl")).filter((r) => r.resource_id === "ien-900002");
    x.buildOutputs(ctx, b, { run_id: RUN, pageCount: 1 });
    expect(te().map((r) => [r.method, r.term])).toEqual([["cover_text", "t1"]]);
    // a vision read of the same page that does not name a term replaces the text evidence
    const rows = x.readCachePages(ctx, "ien-900002");
    const path = ctx.paths.extractPages("ien-900002");
    writeFileSync(path, [...rows, { pdf_page: 1, method: "vision", read_no: 1, raw: "الرياضيات", repaired: "الرياضيات", text_quality: "ok", printed_page: null, run_id: RUN }].map((r) => JSON.stringify(r)).join("\n") + "\n");
    x.buildOutputs(ctx, b, { run_id: RUN, pageCount: 1 });
    expect(te()).toEqual([]);
  });

  it("a missing first read is re-queued even when the second read exists", () => {
    const b = ctx.booksById.get("ien-900002");
    const path = ctx.paths.extractPages("ien-900002");
    const text = { ...x.cacheRow(analyzePage(coverPage("õcôŸG õcôŸG\nõcôŸG"), { lexicon: lex }), { run_id: RUN }), needs_vision: true, vision_reason: "untrusted", vision_reads_required: 2 };
    writeFileSync(path, [text, { pdf_page: 1, method: "vision", read_no: 2, raw: "x", repaired: "x", text_quality: "ok", printed_page: null, run_id: RUN }].map((r) => JSON.stringify(r)).join("\n") + "\n");
    expect(v.jobsForResource(ctx, b, { runId: "run-20260927-extract-03" }).map((j) => j.job_id)).toEqual(["ien-900002:p001:r1"]);
  });

});

describe("regressions: --rebuild without cached pages", () => {
  it("writes nothing for a book that was never extracted", async () => {
    const x = await import("../../scripts/content/extract-pdf.mjs");
    const t = tempTree();
    const saved = process.env.CONTENT_CACHE_DIR;
    process.env.CONTENT_CACHE_DIR = t.cache;
    try {
      const code = await x.main(["--staging", t.staging, "--resource", "ien-900002", "--rebuild", "--no-manifest"]);
      expect(code).toBe(0);
      expect(existsSync(join(t.staging, "resources"))).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.CONTENT_CACHE_DIR;
      else process.env.CONTENT_CACHE_DIR = saved;
      rmSync(t.root, { recursive: true, force: true });
    }
  });
});

describe("regressions: pdf-render page specs are bounded", () => {
  it("clips page ranges to 99999", async () => {
    const r = await import("../../scripts/content/pdf-render.mjs");
    const pages = r.parsePages("99998-999999999,100000");
    expect(pages).toEqual([99998, 99999]);
  });
});

describe("regressions: committed error texts carry no absolute paths", () => {
  it("scrubPaths replaces drive, UNC and temp paths", async () => {
    const { scrubPaths } = await import("../../scripts/content/extract-pdf.mjs");
    const bs = String.fromCharCode(92);
    const win = ["C:", "jazira", "content-cache", "ien", "pdf", "x.pdf"].join(bs);
    expect(scrubPaths(`ENOENT: open '${win}' and C:/a/b.pdf and /tmp/x.pdf; 1448-a.pdf`)).toBe("ENOENT: open '<path>' and <path> and <path>; 1448-a.pdf");
  });
});

describe("regressions: page renders never land in the repository", () => {
  it("renderPages refuses a cache root inside the repo", async () => {
    const r = await import("../../scripts/content/pdf-render.mjs");
    const inside = join(REPO, "tmp-render-should-not-exist");
    await expect(r.renderPages("1448-GE-ME-K07-SM1-math-part1.pdf", [1], { root: inside, queue: { request: async () => { throw new Error("network used"); } } })).rejects.toThrow(/outside the repository/);
    expect(existsSync(inside)).toBe(false);
  });
});
