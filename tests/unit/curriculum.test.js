import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as catalog from "@/lib/curriculum";
import {
  CURRICULUM,
  TERMS,
  TERM_FILTERS,
  ACADEMIC_YEAR,
  RESOURCE_TYPES,
  AVAILABILITY,
  resolveCurriculum,
  allCurriculumPaths,
  allLeaves,
  allResources,
  findResourceByKey,
  termName,
  practiceFor,
  communityTag,
  curriculumStats,
  isAlias,
} from "@/lib/curriculum";
import { HOSTED_FILES } from "@/content/curriculum/hosted.js";
import { SECTIONS } from "@/lib/exams/catalog";
import { GET as yearOneRedirect } from "@/app/[locale]/(app)/curriculum/high-school/grade-1/route.js";
import {
  norm,
  buildIndex,
  searchIndex,
  newSubjectsByGrade,
  compareGrades,
  subjectMatrix,
  sharedSubjects,
  distinctiveSubjects,
  totalPeriods,
  toClientSubject,
  resourcesForTerm,
  switcherFor,
  crumbsFor,
  nodeHref,
  subjectArt,
} from "@/components/curriculum/model";
import { crossCheck, buildManifest, serializeManifest } from "../../scripts/build-curriculum-manifest.mjs";

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const k9 = JSON.parse(readFileSync(root("src/content/curriculum/verified-k9.json"), "utf8"));
const secondary = JSON.parse(readFileSync(root("src/content/curriculum/verified-secondary.json"), "utf8"));
const leaf = (...slug) => resolveCurriculum(slug).node;
const ids = (node) => node.subjects.map((s) => s.id);

describe("curriculum catalog (1447H)", () => {
  it("matches the verified study-plan research exactly", () => {
    expect(crossCheck(catalog, k9, secondary)).toEqual([]);
  });

  it("has two terms and a whole-year filter", () => {
    expect(TERMS.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(TERM_FILTERS.map((t) => t.id)).toEqual(["all", "t1", "t2"]);
    expect(termName("t2", "en")).toBe("Term 2");
    expect(termName("t1")).toBe("الفصل الدراسي الأول");
    expect(termName("nope")).toBe("");
    expect(ACADEMIC_YEAR).toBe("1447هـ");
  });

  it("models elementary 1–6, intermediate 1–3 and secondary year 1 + five tracks in years 2 and 3", () => {
    expect(CURRICULUM.find((s) => s.id === "elementary").children.map((g) => g.id)).toEqual(["grade-1", "grade-2", "grade-3", "grade-4", "grade-5", "grade-6"]);
    expect(CURRICULUM.find((s) => s.id === "middle").children).toHaveLength(3);
    const hs = CURRICULUM.find((s) => s.id === "high-school");
    expect(hs.children.map((g) => g.children.map((c) => c.id))).toEqual([
      ["first-year"],
      ["general", "sharia", "business", "cs-eng", "health"],
      ["general", "sharia", "business", "cs-eng", "health"],
    ]);
    expect(curriculumStats()).toMatchObject({ stages: 3, grades: 12, tracks: 5, leaves: 20 });
  });

  it("follows the plan's grade differences", () => {
    expect(ids(leaf("elementary", "grade-1"))).not.toContain("social");
    expect(ids(leaf("elementary", "grade-1"))).not.toContain("digital");
    expect(ids(leaf("elementary", "grade-4"))).toEqual(expect.arrayContaining(["social", "digital", "life"]));
    expect(ids(leaf("middle", "grade-2"))).not.toContain("critical");
    expect(ids(leaf("middle", "grade-3"))).toContain("critical");
    // Years 2 and 3 of a track have different lists.
    expect(ids(leaf("high-school", "grade-2", "general"))).toContain("biology");
    expect(ids(leaf("high-school", "grade-3", "general"))).not.toContain("biology");
    expect(ids(leaf("high-school", "grade-3", "general"))).toContain("elective");
    expect(ids(leaf("high-school", "grade-3", "cs-eng"))).toContain("capstone");
    expect(ids(leaf("high-school", "grade-2", "cs-eng"))).not.toContain("capstone");
    expect(ids(leaf("high-school", "grade-2", "business"))).not.toContain("math");
  });

  it("gives every node and subject an official Arabic name and an English name", () => {
    const walk = (nodes) => {
      for (const n of nodes) {
        expect(n.name, n.id).toMatch(/[؀-ۿ]/);
        expect(n.name_en, n.id).toMatch(/^[\x20-\x7E’]+$/);
        if (n.subjects) {
          for (const s of n.subjects) {
            expect(s.name, s.id).toMatch(/[؀-ۿ]/);
            expect(s.name_en, `${n.id}/${s.id}`).toMatch(/^[\x20-\x7E’]+$/);
          }
        }
        if (n.children) walk(n.children);
      }
    };
    walk(CURRICULUM);
  });

  it("lists every subject in both terms and marks the split unverified (no invented single-term examples)", () => {
    for (const { node } of allLeaves()) {
      for (const s of node.subjects) {
        expect(s.terms).toEqual(["t1", "t2"]);
        expect(s.terms_status).toBe("unverified");
        expect(s.status).toBe("verified");
      }
    }
  });

  it("builds one resource per type per term with unique keys and no hosted file", () => {
    const all = allResources();
    const subjects = allLeaves().reduce((n, l) => n + l.node.subjects.length, 0);
    expect(all).toHaveLength(subjects * TERMS.length * RESOURCE_TYPES.length);
    expect(new Set(all.map((r) => r.key)).size).toBe(all.length);
    for (const r of all) {
      expect(AVAILABILITY).toContain(r.availability);
      expect(r.key).toMatch(/^1447\/[a-z0-9/-]+\/t[12]\/(student-book|activity-book|exam-samples)\.pdf$/);
    }
    expect(HOSTED_FILES).toEqual([]);
    expect(all.filter((r) => r.availability === "hosted")).toEqual([]);
    expect(all.filter((r) => r.type === "exam_samples").every((r) => r.availability === "unavailable")).toBe(true);
    expect(all.filter((r) => r.type !== "exam_samples").every((r) => r.availability === "external_official")).toBe(true);
  });

  it("resolves slugs and keys", () => {
    expect(resolveCurriculum(["high-school", "grade-3", "sharia"]).trail.map((n) => n.id)).toEqual(["high-school", "grade-3", "sharia"]);
    expect(resolveCurriculum(["high-school", "nope"])).toBeNull();
    const key = "1447/middle/grade-3/critical/t2/student-book.pdf";
    expect(findResourceByKey(key)).toMatchObject({ subjectId: "critical", term: "t2", type: "student_book", stage: "middle", grade: "grade-3", track: null });
    expect(findResourceByKey("1447/../etc/passwd.pdf")).toBeNull();
  });

  it("lists real pages for the sitemap and every node for static params", () => {
    const pages = allCurriculumPaths().map((p) => p.join("/"));
    expect(pages).toContain("high-school/grade-1/first-year");
    expect(pages).not.toContain("high-school/grade-1"); // alias → redirects to the common first year
    expect(pages).not.toContain("continuing"); // pending programme
    const all = allCurriculumPaths({ includePending: true, includeAliases: true }).map((p) => p.join("/"));
    expect(all).toEqual(expect.arrayContaining(["high-school/grade-1", "continuing", "special"]));
    expect(isAlias(resolveCurriculum(["high-school", "grade-1"]).node)).toBe(true);
    expect(isAlias(resolveCurriculum(["high-school", "grade-2"]).node)).toBe(false);
  });

  it("maps practice only where the exam center has a matching section", () => {
    expect(practiceFor("high-school", "physics")).toEqual({ exam: "achievement", section: "physics", href: "/exams/achievement?section=physics#builder" });
    expect(practiceFor("middle", "math")?.section).toBe("quantitative");
    expect(practiceFor("elementary", "math")).toBeNull();
    expect(practiceFor("high-school", "arts")).toBeNull();
    expect(practiceFor("high-school", "statistics")).toEqual({
      exam: "aptitude",
      section: "quantitative",
      topic: "statistics",
      href: "/exams/aptitude?section=quantitative&topic=statistics#builder",
    });
    // Every mapping points at a real exam section (and topic) of the exam center.
    for (const { stage, node } of allLeaves()) {
      for (const s of node.subjects) {
        const p = practiceFor(stage, s.id);
        if (!p) continue;
        expect(SECTIONS[p.section]?.exam, `${stage}/${s.id}`).toBe(p.exam);
        if (p.topic) expect(SECTIONS[p.section].topics).toContain(p.topic);
      }
    }
  });

  it("makes community tags the feed accepts", () => {
    expect(communityTag("اللغة الإنجليزية")).toBe("اللغة_الإنجليزية");
    expect(communityTag("Data Science!")).toBe("data_science");
    expect(communityTag("؟")).toBeNull();
    for (const { node } of allLeaves()) for (const s of node.subjects) expect(communityTag(s.name)).toMatch(/^[0-9a-z_؀-ۿ]{2,50}$/);
  });
});

describe("high school year 1 alias", () => {
  it("is the only alias branch, and its route answers a 308 to the common first year", () => {
    const aliases = allCurriculumPaths({ includePending: true, includeAliases: true })
      .filter((p) => isAlias(resolveCurriculum(p).node))
      .map((p) => p.join("/"));
    expect(aliases).toEqual(["high-school/grade-1"]); // a new alias needs its own redirect route
    const ar = yearOneRedirect(new Request("http://localhost/ar/curriculum/high-school/grade-1"), { params: { locale: "ar" } });
    expect(ar.status).toBe(308);
    expect(ar.headers.get("location")).toBe("http://localhost/curriculum/high-school/grade-1/first-year");
    const en = yearOneRedirect(new Request("http://localhost/en/curriculum/high-school/grade-1?x=1"), { params: { locale: "en" } });
    expect(en.headers.get("location")).toBe("http://localhost/en/curriculum/high-school/grade-1/first-year?x=1");
  });
});

describe("curriculum manifest", () => {
  const manifest = buildManifest({ catalog, k9, secondary, hostedFiles: [] });

  it("is current (rebuild with node scripts/build-curriculum-manifest.mjs)", () => {
    const onDisk = readFileSync(root("src/content/curriculum/manifest.json"), "utf8").replace(/\r\n/g, "\n");
    expect(onDisk).toBe(serializeManifest(manifest));
  });

  it("has one row per resource type per subject per term, with honest availability", () => {
    expect(manifest.rows).toHaveLength(allResources().length);
    const row = manifest.rows.find((r) => r.internal_key === "1447/high-school/grade-2/health/health-sciences/t1/student-book.pdf");
    expect(row).toMatchObject({
      stage: "high-school",
      grade: "grade-2",
      track: "health",
      term: "t1",
      subject: "health-sciences",
      resource_type: "student_book",
      file_type: "pdf",
      availability: "external_official",
      language: "ar",
      year: "1447",
      status: "unverified",
      term_status: "unverified",
    });
    expect(row.source_reference).toMatchObject({ portal: "madrasati", plan: "moe-plan-guide-5" });
    expect(manifest.rows.some((r) => r.availability === "hosted")).toBe(false);
    expect(manifest.rows.filter((r) => r.subject === "english").every((r) => r.language === "en")).toBe(true);
  });

  it("marks a row hosted only when it is registered and the file exists", () => {
    const key = "1447/elementary/grade-1/math/t1/exam-samples.pdf";
    const entry = { key, licence: "Original Jazira work", source: "jazira", store: "public", added: "2026-09-25" };
    expect(() => buildManifest({ catalog, k9, secondary, hostedFiles: [entry], fileExists: () => false })).toThrow(/no file exists/);
    const m = buildManifest({ catalog, k9, secondary, hostedFiles: [entry], fileExists: (k) => k === key });
    const r = m.rows.find((x) => x.internal_key === key);
    expect(r).toMatchObject({ availability: "hosted", status: "verified" });
    expect(m.rows.filter((x) => x.availability === "hosted")).toHaveLength(1);
    expect(() => buildManifest({ catalog, k9, secondary, hostedFiles: [{ ...entry, key: "1447/nope.pdf" }] })).toThrow(/not a catalog key/);
  });

  it("refuses to build when the catalog drifts from the research", () => {
    const drifted = JSON.parse(JSON.stringify(k9));
    drifted.stages[0].grades[0].tracks.find((t) => t.catalog_path).subjects[0].name_ar = "اسم آخر";
    expect(() => buildManifest({ catalog, k9: drifted, secondary })).toThrow(/differs from the verified research/);
  });
});

describe("curriculum UI model", () => {
  it("normalises Arabic and English for matching", () => {
    expect(norm("  الفيزياءُ ")).toBe("الفيزياء");
    expect(norm("إدارة")).toBe(norm("اداره"));
    expect(norm("Cybersecurity!")).toBe("cybersecurity");
  });

  it("indexes nodes and subjects (not pending programmes) and ranks names first", () => {
    const index = buildIndex(CURRICULUM);
    expect(index.some((e) => e.stage === "continuing")).toBe(false);
    const res = searchIndex(index, "الفيزياء");
    expect(res.subjects.length).toBeGreaterThan(0);
    expect(res.subjects[0].ar).toBe("الفيزياء");
    expect(res.subjects[0].href).toMatch(/^\/curriculum\/high-school\/.+\?subject=physics$/);
    expect(searchIndex(index, "Grade 4").nodes[0].href).toBe("/curriculum/elementary/grade-4");
    expect(searchIndex(index, "ا").total).toBe(0);
    expect(searchIndex(index, "physics", { stage: "middle" }).total).toBe(0);
  });

  it("finds what is new in each grade and compares consecutive grades", () => {
    const grades = CURRICULUM.find((s) => s.id === "elementary").children;
    const byGrade = newSubjectsByGrade(grades);
    expect(byGrade["grade-1"]).toEqual([]);
    expect(byGrade["grade-4"].map((s) => s.id).sort()).toEqual(["digital", "social"]);
    expect(compareGrades(grades[0], grades[1])).toBe("periods"); // Arabic 288 → 252
    expect(compareGrades(grades[3], grades[4])).toBe("same"); // grades 4–6 are identical
    expect(compareGrades(grades[2], grades[3])).toBe("changed");
  });

  it("builds the subject × grade matrix and period totals", () => {
    const grades = CURRICULUM.find((s) => s.id === "middle").children;
    const m = subjectMatrix(grades);
    expect(m.columns).toEqual(["grade-1", "grade-2", "grade-3"]);
    expect(m.rows.find((r) => r.id === "critical").cells).toEqual([null, null, 72]);
    expect(m.rows.find((r) => r.id === "arabic").cells).toEqual([180, 180, 144]);
    // Plan totals (p.23): subjects + activity 36 + non-class 240 = 1500.
    for (const g of grades) expect(totalPeriods(g) + 36 + 240).toBe(1500);
  });

  it("finds shared and track-specific subjects", () => {
    const year3 = resolveCurriculum(["high-school", "grade-3"]).node.children;
    const shared = sharedSubjects(year3).map((s) => s.id);
    expect(shared).toEqual(expect.arrayContaining(["english", "arabic", "life", "pe", "research"]));
    expect(shared).not.toContain("capstone"); // not in the general track (it has the elective field)
    const cs = year3.find((t) => t.id === "cs-eng");
    expect(distinctiveSubjects(cs, sharedSubjects(year3)).map((s) => s.id)).toEqual(expect.arrayContaining(["ai", "cybersecurity", "software-engineering"]));
  });

  it("shapes subjects for the client and resolves availability per term", () => {
    const s = leaf("high-school", "grade-2", "general").subjects.find((x) => x.id === "math");
    const c = toClientSubject(s, { practice: practiceFor("high-school", "math"), tag: communityTag(s.name), art: subjectArt("high-school", "math") });
    expect(c.resources.map((r) => r.type)).toEqual(["student_book", "activity_book", "exam_samples"]);
    expect(resourcesForTerm(c, "t1").map((r) => r.availability)).toEqual(["external_official", "external_official", "unavailable"]);
    expect(c.art).toBe("high-school.math");
    expect(JSON.parse(JSON.stringify(c))).toEqual(c); // serialisable for the client island

    // A hosted file for term 1 only: term 1 shows it, term 2 falls back to the default.
    const hosted = { ...s, resources: s.resources.map((r) => (r.term === "t1" && r.type === "exam_samples" ? { ...r, availability: "hosted" } : r)) };
    const h = toClientSubject(hosted);
    expect(resourcesForTerm(h, "t1")[2]).toMatchObject({ availability: "hosted", hosted: [{ term: "t1" }] });
    expect(resourcesForTerm(h, "t2")[2]).toMatchObject({ availability: "unavailable", hosted: [] });
    expect(resourcesForTerm(h, "all")[2].availability).toBe("hosted");
  });

  it("builds sibling navigation that keeps the track across years", () => {
    const { levels, tracks } = switcherFor(CURRICULUM, ["high-school", "grade-2", "sharia"]);
    expect(levels.map((l) => l.href)).toEqual([
      "/curriculum/high-school/grade-1/first-year",
      "/curriculum/high-school/grade-2/sharia",
      "/curriculum/high-school/grade-3/sharia",
    ]);
    expect(levels.find((l) => l.active).id).toBe("grade-2");
    expect(tracks.map((t) => t.id)).toEqual(["general", "sharia", "business", "cs-eng", "health"]);
    expect(switcherFor(CURRICULUM, ["high-school", "grade-1", "first-year"]).tracks).toBeNull();
    expect(switcherFor(CURRICULUM, ["elementary", "grade-3"]).levels).toHaveLength(6);
    expect(switcherFor(CURRICULUM, ["elementary"])).toEqual({ levels: null, tracks: null });
    expect(switcherFor(CURRICULUM, ["continuing"])).toEqual({ levels: null, tracks: null });
  });

  it("builds breadcrumbs without links to alias branches", () => {
    const slug = ["high-school", "grade-1", "first-year"];
    const crumbs = crumbsFor(slug, resolveCurriculum(slug).trail);
    expect(crumbs.map((c) => c.href)).toEqual(["/curriculum/high-school", null, null]);
    const hs = resolveCurriculum(["high-school", "grade-1"]).node;
    expect(nodeHref(["high-school", "grade-1"], hs)).toBe("/curriculum/high-school/grade-1/first-year");
  });
});
