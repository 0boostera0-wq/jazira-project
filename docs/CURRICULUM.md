# Jazira curriculum library

How the curriculum catalog is structured, where every fact comes from, what
Jazira may and may not host, and how to add authorised files later.

| File | Role |
|---|---|
| `src/lib/curriculum.js` | The catalog: stages → grades → tracks → subjects → resources. Pure data + resolvers, safe on server and client. |
| `src/content/curriculum/verified-k9.json`, `verified-secondary.json` | Machine-readable research (see `docs/research/curriculum-k9.md`, `curriculum-secondary.md`). |
| `src/content/curriculum/hosted.js` | Register of files Jazira is **authorised** to host. Empty today. |
| `src/content/curriculum/manifest.json` | Generated source manifest: one row per resource type per subject per term. |
| `scripts/build-curriculum-manifest.mjs` | Cross-checks the catalog against the research, then writes the manifest. |
| `scripts/import-curriculum.mjs` | Imports authorised PDFs once into Jazira's own store. |
| `src/app/api/content/fetch/route.js` | Serves a file only when the manifest marks its key `hosted`. |
| `src/app/[locale]/(app)/curriculum/**`, `src/components/curriculum/**` | The hub, the stage / year / track / grade pages and the subject drawer. |
| `src/content/curriculum/outline/<stage>/<grade>[-<track>].json` | Generated **outline layer** per leaf: units, lessons, book page ranges, term membership, iEN resources (§8). |
| `src/content/curriculum/outline/catalog-terms.js` | Generated catalog term table: only subjects whose term split is **verified**; everything else uses both terms, `unverified`. |
| `src/lib/curriculum-outline.js` | Server reader of the outline (`loadOutline`, `outlineFor`, `subjectOutline`, `nodeById`, `lessonsUnder`, `subjectTerms`). |
| `scripts/content/build-curriculum.mjs` | Run R2: crawl + catalog + research → `data/staging/curriculum/**`, `resources.jsonl`, the outline and the catalog term table (docs/CONTENT_ENGINE.md §4.2). |
| `tests/unit/curriculum.test.js`, `tests/unit/content-fetch.test.js` | Catalog ↔ research parity (incl. terms), manifest, UI model, route policy. |
| `tests/unit/content-curriculum-build.test.js`, `tests/unit/curriculum-outline.test.js` | iEN mapping reconciliation, part/year, the term-resolution truth table, id stability; the outline interface and invariants. |

## 1. Structure

```
stage ─┬─ elementary   grade-1 … grade-6                (leaf = grade)
       ├─ middle       grade-1 … grade-3                (leaf = grade)
       ├─ high-school  grade-1 → first-year             (common first year; grade-1 redirects to it)
       │               grade-2 → general · sharia · business · cs-eng · health
       │               grade-3 → general · sharia · business · cs-eng · health
       ├─ continuing   pending (separate plan, not verified — no subjects)
       └─ special      pending (separate plans, not verified — no subjects)
leaf → subjects → terms (t1, t2) → resources (student_book · activity_book · exam_samples)
outline layer (§8): leaf → subject → unit → [chapter] → lesson, with book pages and iEN links
```

URLs follow the slug: `/curriculum/elementary/grade-4`,
`/curriculum/high-school/grade-3/sharia`. Every node is statically generated in
both languages (`generateStaticParams`, `dynamicParams = false`). The alias
`/curriculum/high-school/grade-1` is not a page: `curriculum/high-school/grade-1/route.js`
answers it with a real 308 to the common first year (a unit test fails if
another alias branch appears without its own redirect).
`?subject=<id>` on a leaf opens that subject's drawer.

**Every subject** carries: `id`, `name` (official Arabic name as printed in the
plan), `name_en` (Jazira's English rendering — not an official MoE name),
`labels` / `labels_en` (the plan's level labels such as «الرياضيات 2»),
`periods` (annual maximum), `status: "verified"`, `terms` and `terms_status`
(from data — see the term policy in §8; today every subject has
`terms: ["t1","t2"]`, `terms_status: "unverified"`), `notes` (message keys under
`curriculum.notes.*`) and `resources` (one set per listed term).

Numbers shown in the UI (grades, tracks, subjects, periods) are always derived
from the catalog — never typed by hand.

### What differs between grades (from the plan)

- Elementary 1–3 have no social studies or digital skills; both start in grade 4.
  Life and family skills run through grades 1–6.
- The plan prints **one** subject «القرآن الكريم والدراسات الإسلامية» for K–9; the
  catalog models it as one subject (`islamic`). Grades 5–6 include a Quran
  recitation and Tajweed course (note `tilawa`).
- Critical thinking is taught in intermediate grade 3 only.
- Secondary: a common first year (15 subjects), then five tracks whose **year 2
  and year 3 lists differ** (e.g. biology is year 2 only in the general track;
  the graduation project is year 3 in the four specialised tracks; the general
  track has «المجال الاختياري» instead). Mathematics is not in the business track.

## 2. Sources (all accessed 2026-09-25)

| What | Status | Source |
|---|---|---|
| Subjects per grade / track, official Arabic names, annual periods | **verified** | «دليل الخطط الدراسية – الإصدار الخامس», National Curriculum Center, on moe.gov.sa — <https://www.moe.gov.sa/ar/education/generaleducation/StudyPlans/Documents/Curriculum_Guide_Fifth_Edition_13oct2025.pdf> (listed on <https://www.moe.gov.sa/ar/education/generaleducation/StudyPlans/Pages/Study-plans.aspx>). K–9: pp.19, 21, 23. Secondary: pp.25–40. |
| Two terms in 1447H | **verified** | MoE news 11/02/1447 — <https://www.moe.gov.sa/ar/mediacenter/MOEnews/Pages/news1_05082025.aspx>; SPA <https://spa.gov.sa/N2373796> |
| Which term each subject runs in | **unverified** (per subject) | The plan gives annual periods only. The 1448 books on iEN are published as parts («الجزء الأول / الثاني من المقرر») and **no cover read so far names a term**. See the term policy (§8). |
| Where the textbooks are published | **verified** | MoE e-service «خدمة مقرراتي» — <https://www.moe.gov.sa/ar/knowledgecenter/eservices/pages/courses.aspx> → منصة مدرستي <https://schools.madrasati.sa/> (active account required); «عين» <https://www.ien.edu.sa/> — a **public** official portal (no account), named on the MoE study-plans page for viewing the course books. |
| Which books exist per subject | **verified from iEN** (crawl 2026-09-26) | 315 listed files (311 `1448-…`, one `1488-…` anomaly, 3 zip files), 10,102 lessons in 2,126 units. Per-book deep links (`https://iencontent.ien.edu.sa/books/<file>`) are in the outline layer. Subjects without an iEN book (the graduation project) are listed `catalog_only` in `data/staging/curriculum/ien-mapping.json`. |
| Elective-field options (general track, year 3) | **verified** | Guide p.30; SPA <https://www.spa.gov.sa/N2383308> |
| Tahfeez (Quran memorisation) schools | not modelled | Guide pp.20, 22, 24 — a separate plan; mentioned on the hub, not in the tree. |
| Continuing / special education | **unverified** | Separate plans not reviewed; shown as "not added yet" pages (noindex) with no subjects. |

Full citations, extraction method and every difference from the previous
catalog: `docs/research/curriculum-k9.md`, `docs/research/curriculum-secondary.md`.

### How the UI states it

- A subject is listed in **both terms** unless its split is verified (§8), and
  while `terms_status` is `unverified` the term filter shows:
  «تحدد الخطة الرسمية حصص العام كاملًا دون تقسيمها على الفصلين، لذلك تظهر المواد
  في الفصلين، وقد يختلف التوزيع الفعلي في مدرستك.»
- The hub's "Where this data comes from" section names the three sources, marks
  the term split as *partly verified*, and shows the access date (`SOURCES_CHECKED`).
- Each resource row shows its availability honestly: *on the official platform*
  (with an outbound link and the school-account requirement), *hosted on Jazira*
  (only for registered files), or *not available*.

## 3. Availability policy

The Saudi textbooks may **not** be rehosted: the MoE portal grants personal use
only and no licence, iEN is "all rights reserved" for educational use, and the
Copyright Law (art. 9) reserves making works available online to the rights
holder. No source grants third parties permission (research §7–8; not legal
advice).

| `availability` | Meaning | Used for |
|---|---|---|
| `external_official` | The file is on the official platform; Jazira links out (Madrasati / iEN, `rel="noopener noreferrer"`), never hosts it. The catalog rows link to the platform; the outline layer (§8) carries iEN book-level links, including `#page=<n>` deep links for lessons with a page range. | Student and activity books (default) |
| `hosted` | Jazira holds an **authorised** copy: written permission from the rights holder, or Jazira's own original work. Registered in `hosted.js` **and** present in the store. | Nothing today |
| `unavailable` | No authorised source. Nothing is linked or served. | Sample exams (default) |

Manifest row `status` is `verified` only for a hosted, authorised file; every
other row is `unverified` (the subject is verified, the specific book per term
is not). A row's `term_status` is the subject's `terms_status` (`unverified`
everywhere at this revision).

`/api/content/fetch?key=…` serves **only** keys whose manifest row is `hosted`.
Anything else is `404 {"error":"not_available"}` (malformed keys `400
{"error":"invalid_key"}`) — never a placeholder PDF. The remote store is pinned
to `CONTENT_BASE_URL`'s origin and path (no open proxy, no redirects followed).

## 4. The manifest

```bash
node scripts/build-curriculum-manifest.mjs          # rebuild src/content/curriculum/manifest.json
node scripts/build-curriculum-manifest.mjs --check  # CI: exit 1 if the catalog drifts from the research or the file is stale
```

Before writing, the builder compares every catalog leaf with the verified
research (subject ids, official names, periods, plan labels, **terms**) and
refuses to build on any difference. Terms: a research subject with
`terms_status: "verified"` must carry `terms_evidence` (term-evidence ids) and
the catalog must list exactly its terms; any other research `terms` value is a
hint only, and the catalog must list both terms as `unverified`. `tests/unit/curriculum.test.js` runs the same check and
fails when the committed manifest is stale.

Row fields: `internal_key` (e.g. `1447/high-school/grade-2/general/math/t1/student-book.pdf`),
`title` / `title_en`, `stage`, `grade`, `track`, `term`, `subject`,
`subject_name(_en)`, `resource_type` (`student_book | activity_book | exam_samples`),
`file_type` (`pdf`), `availability`, `language` (`en` for English, else `ar`),
`year` (`1447`), `status`, `subject_status`, `term_status`,
`source_reference` (`{ portal: "madrasati", alternate: "ien", plan: "moe-plan-guide-5", plan_pages }`,
or the licence details for a hosted file) and `notes`. The `sources` block at
the top resolves `madrasati`, `ien`, `moe-plan-guide-5` and `moe-two-terms` to
URLs.

## 5. Adding an authorised file later

Only with written permission from the rights holder (MoE / NCC, and Tatweer for
iEN material) — or for Jazira's own original work (e.g. sample exams written
in-house).

1. Find the key: `node scripts/import-curriculum.mjs --list-keys 1447/middle/grade-3`.
2. Register it in `src/content/curriculum/hosted.js`:
   ```js
   { key: "1447/middle/grade-3/math/t1/exam-samples.pdf",
     licence: "Original Jazira work — all rights reserved",   // or the permission reference
     source: "jazira", store: "public", added: "2026-10-01" }
   ```
3. Import it once from the authorised source (the importer refuses keys that
   are not registered, fetches only `SOURCE_ALLOWLIST` hosts over https, checks
   the size and `%PDF-` magic bytes):
   ```bash
   SOURCE_ALLOWLIST=files.licensor.example node scripts/import-curriculum.mjs --emit-manifest 1447/middle/grade-3/math
   # fill the url fields in scripts/curriculum-sources.json, then
   SOURCE_ALLOWLIST=files.licensor.example node scripts/import-curriculum.mjs --dry-run
   SOURCE_ALLOWLIST=files.licensor.example node scripts/import-curriculum.mjs            # --store public|supabase (remote = supabase)
   ```
   Your own files: copy them to `public/resources/<key>` instead.
4. Rebuild the manifest (`node scripts/build-curriculum-manifest.mjs`). The
   builder marks the row `hosted` only if the file exists (public store) and
   fails if a registered key has no file.
5. The subject drawer then shows "Available on Jazira" with a **View** button
   for that term, which opens the in-app viewer (`PdfViewerModal`, loaded with
   `next/dynamic` only on demand).
6. Before the first hosted file ships, open the viewer in desktop Chrome, Safari
   and a phone browser. The site-wide CSP (`next.config.js`) sets
   `object-src none`, and some browsers treat their built-in PDF viewer as a
   plugin under that directive. If the file does not render, either exempt
   `/api/content/fetch` from `object-src` or render with a PDF.js-based viewer.

Stores: `public` (default; `public/resources/<key>`) or a Supabase bucket via
`CONTENT_STORE=remote` + `CONTENT_BASE_URL=https://<project>.supabase.co/storage/v1/object/public/curriculum`.
Anything in `public/` is publicly reachable, so never place unregistered files there.

## 6. Jazira value per subject

The subject drawer adds, next to the official resources:

- **Practice** in the exam center when the subject maps to a section:
  secondary maths / physics / chemistry / biology → Tahsili sections; secondary
  statistics → Qudurat quantitative with the statistics topic preselected;
  secondary Arabic subjects → Qudurat verbal;
  intermediate maths / Arabic → Qudurat quantitative / verbal
  (`practiceFor()` in `src/lib/curriculum.js`; deep link `/exams/<exam>?section=…[&topic=…]#builder`;
  a unit test checks every mapping against `src/lib/exams/catalog.js`).
- **Ask the Jazira Assistant**: `/assistant?topic=<subject — grade>`.
- **Community**: `/tags/<tag>` with the subject name as a hashtag (`communityTag()`).

## 7. Updating for a new academic year

1. Re-run the research against the new study-plan guide and update the
   `verified-*.json` files.
2. Update `YEAR`, `SOURCES_CHECKED` and the subject rows in `src/lib/curriculum.js`
   until `node scripts/build-curriculum-manifest.mjs --check` passes, then rebuild.
3. Keys are versioned by year (`1447/…`), so hosted files of different years never collide.
4. The catalog year stays `1447` until the 1448 study plan is verified; iEN
   books carry their own edition label (`year_label: "1448"`), which the UI
   shows per book.

## 8. Outline layer, iEN mapping and term policy

Design: `docs/CONTENT_ENGINE.md` §2.4, §2.5, §4.2 (work package WP2).

```bash
node scripts/content/build-curriculum.mjs            # run R2 (offline): rebuild everything below
node scripts/content/build-curriculum.mjs --check    # exit 1 when any output is stale
node scripts/content/build-curriculum.mjs --cache-pages   # also re-read cover pages 1–3 from the content cache
node scripts/content/build-prep-alignment.mjs [--spec <qiyas-spec.json>]   # achievement prep alignment (§4.3b)
node scripts/content/crawl-diff.mjs --prev <dir> | --prev-rev <rev>        # changes-<date>.jsonl after a new crawl
```

**Inputs:** the catalog, the research JSON, the iEN crawl
(`data/staging/sources/ien/*`), `research/catalog-map.jsonl`,
`research/term-evidence.json`, `book-frontmatter.jsonl` (its `term_*` keys are
ignored) and, when present, WP3's `resources/{extraction.jsonl,term-evidence.jsonl,toc/*.json}`
and the owner's `curriculum/owner-decisions.jsonl`.

**Outputs:** `data/staging/curriculum/nodes/**` (stage → grade → track → term /
subject → unit → [chapter] → lesson), `subject-terms.jsonl`, `ien-mapping.json`,
`audit.jsonl`, `id-registry.jsonl`, `data/staging/resources/resources.jsonl`
(every iEN file plus each subject's iEN question bank as an external count and
link — never mined), `term-evidence.jsonl` (page-0 routes), and the published
subset `src/content/curriculum/outline/**`. Output is byte-deterministic; ids
are stable across reruns (`n<iEN id>` for units and lessons; a unit whose iEN
id collides with a lesson id of the same subject — 14 cases — and TOC-only
nodes get frozen `x<hex8>` ids from the id registry).

**iEN mapping.** `catalog-map.jsonl` (agent audit) is verified row by row: each
iEN subject must exist under the same leaf, its books and lesson/unit counts
must equal the crawl, and it must agree with the title heuristic (plan labels,
then the name). Result at this revision: 228 rows verified, 6 need review (the
English «Top Goal» series titles, «القرآن الكريم (2-1)/(3-1)» numbering,
«قراءات 2», the elective slot), 4 `catalog_only` (graduation project, no iEN
book), 15 rows for subjects outside the catalog. 66 iEN subjects are
`source_only` (Chinese, enrichment arts and music, tahfeez tajweed, level-2 PE
listed under the first year): they are kept in staging with `in_plan: false`
and are **never added to the catalog**.

**Term policy.**

- Two terms in 1447/1448: **verified** (official decision).
- Term membership comes only from evidence: a cover or title page stating
  «الفصل الدراسي الأول/الثاني» (strict regex; «الفصل الثاني» alone is a chapter
  heading), TOC markers, two agreeing vision reads — all `verified`; the
  listing title, the plan guide's per-term table, a plan-guide-corroborated
  course code, or an owner decision — all `inferred`.
- **Part numbers are never evidence**: part 1 is not assumed to be term 1. The
  owner may record "part N = term N" for a set of subjects in
  `data/staging/curriculum/owner-decisions.jsonl`; that gives `inferred`, and
  the UI shows it as *unconfirmed* (`term_basis: "owner_decision"` in the outline).
- A book without counting evidence is `needs_review` (one book or several
  parts alike); `unknown` is used only where a term does not apply (iEN
  question-bank links, stage/grade/subject nodes).
- The catalog is corrected only for subjects whose iEN mapping is `verified`;
  a verified split on a disputed mapping is logged as
  `catalog_correction_blocked` in `audit.jsonl` instead.
- A subject leaves a term in the catalog **only** when its membership for that
  term is `absent`, i.e. every one of its books is verified for the other term.
  Then `verified-*.json` gets `terms`, `terms_status: "verified"` and
  `terms_evidence`, and `catalog-terms.js` lists the subject.

**Expected outcome (and today's state):** no cover or TOC read so far names a
term — the covers say «الجزء الأول/الثاني من المقرر». Every subject-term
membership is therefore `needs_review`, the catalog keeps both terms as
`unverified`, and term exams are offered only once verified or inferred
evidence exists. This is the honest result, not a failure; the coverage report
leads with the "term undeterminable" bucket.

**Books.** `part` comes from the listing title or the cover («الجزء الأول»); the
file name (`-part2`, `-PART2.PDF`, `.part.pdf`) only cross-checks it.
`year_label` is the cover edition line («طبعة 1448») when present, else the file
name; both are recorded, and a mismatch (13 books whose cover pages say 1447)
or the `1488-…` anomaly stays verbatim with `status: needs_review`. Zip files
(audio, workbook, «Test Bank») are recorded as resources and never opened.
