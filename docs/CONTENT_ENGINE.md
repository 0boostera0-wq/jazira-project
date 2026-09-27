# Jazira content engine — design

Status: **authoritative design, v1.1 (2026-09-26, revised after two critic
reviews; see §11 Decisions log)**. It extends the existing
platform; nothing here replaces the curriculum catalog, the exam engine
(migrations 0010–0013), the local practice API or the UI. Every change is
additive or backward compatible, and every package in §9 lists the exact files
it owns. **All work happens on a feature branch** (`content-engine`), never on
`main` (main auto-deploys production); the final report names the branch head
commit.

Read first: [AGENTS.md](../AGENTS.md), [CONVENTIONS.md](CONVENTIONS.md),
[SECURITY.md](SECURITY.md), [DATA_API.md](DATA_API.md), [CURRICULUM.md](CURRICULUM.md).

---

## 0. Starting point (facts this design builds on)

| Area | Today | Consequence for the engine |
|---|---|---|
| Curriculum | `src/lib/curriculum.js`: stage → grade → (track) → subject → 2 terms × 3 synthetic resources. Every subject is in both terms with `terms_status:"unverified"`. Year `1447`. No units or lessons. | The outline (units, lessons, pages, books) is a **new layer** keyed by the existing slugs. The catalog only changes where evidence exists (§4.2, WP2). |
| iEN discovery | `scripts/content/ien-crawl.mjs` already ran (retrieved 2026-09-26T21:00Z): 358 nodes, 312 subject nodes (elementary 57, middle 49, high school 206), 315 listed files (311 named `1448-…`, 1 named `1488-…`, 3 `.zip` files), 37.5 GB in total, 10,102 lessons in 2,126 units over 269 subjects, 234 subjects with books. Outputs: `data/staging/sources/ien/{nodes,books,lessons}.jsonl`, `crawl-report.json`. | These files are the input to normalization. The `1488` name and the 3 zip files are recorded as anomalies (`needs_review`), not corrected by guesswork. |
| Question bank | 300 `jazira-original` Arabic single-answer MCQs (Qudurat/Tahsili), JSON → `0011_seed_questions.sql`. | They become canonical records with provenance `internal_authored`. 0011 is frozen as the bootstrap. |
| DB exam engine | Secure, but aptitude/achievement only: hard-coded vocabulary, MCQ only, a contiguous `random_key` window (at most about P distinct sets for a pool of P), no seed, no option shuffling, no templates, 100-item cap. | Migration 0014 adds a template-driven engine next to the legacy RPCs, which keep their signatures and behaviour. |
| Local engine | Stateless guests: HMAC token of question keys; no server-side deadline (24 h grace); secret falls back to a per-process key on Vercel. `LOCAL_EXAM_SECRET` is **not set** on Vercel today and there is no DB, so the local API is the only live practice path. | A v2 token (seed, deadline, revision) (§5.8). The production-secret requirement is **opt-in** (`EXAM_SECRET_REQUIRED=1`) so merging never breaks live practice. |
| Infrastructure | No Supabase project (billing). No KV. Node 24, Git Bash, no Python. `pdfjs-dist@^4` and `puppeteer-core` are installed (package.json); `ajv@8` is not. `pdftotext` exists but is not used (not portable). | Staging files + an importer tested on the PGlite harness. Remaining dev dependencies are declared by WP1. |
| PDF tooling (exists) | `scripts/content/pdf-frontmatter.mjs`: per-page text of the first 14 pages of each book (range reads, or the cached PDF) → cache `ien/text/<stem>/pNNN.txt` + `data/staging/sources/ien/book-frontmatter.jsonl` (65 of 315 books at this revision). `scripts/content/pdf-render.mjs`: renders any page to a 1100 px JPEG via pdf.js in local Chrome → cache `ien/pages/<stem>/pNNN.jpg`, PDFs in cache `ien/pdf/`. Tables, figures and Arabic numerals are legible in the renders. | Claude subagents **read page images** (vision). Scanned, figure and equation pages are handled by vision, not skipped (§4.2, §4.3). These scripts become WP3's; one cache layout (§3). |
| iEN CDN behaviour | After ~80 full downloads + range reads in a burst, `iencontent.ien.edu.sa` refused connections. | All fetching goes through one persisted, resumable queue with ≤ 2 in flight, backoff and a circuit breaker (§4.1). Full downloads only for subjects in the current generation batch. |
| Term evidence (observed) | In the 65 front-matter rows, **no cover says «الفصل الدراسي الأول/الثاني»**. Covers say «الجزء الأول/الثاني من المقرر»; the single node is «مقررات العام الدراسي». The one committed `term_2` hit is «الفصل الثاني» = "chapter two" (false positive). The text layer has swapped lam ligatures (املقرر, اجلزء, األول), letters split by spaces and Latin glyph garbage (côŸG). | **Most resources will stay term `needs_review`.** This is the expected outcome, not a failure. §2.4 adds further evidence routes (vision TOC markers, the plan guide, course codes, an explicit owner decision); the coverage report leads with a "term undeterminable" bucket; the catalog is not corrected without evidence. |
| Catalog ↔ iEN map (exists) | `data/staging/sources/research/catalog-map.jsonl` (253 rows by an audit agent: Jazira subject → iEN ids, books, lesson/unit counts; 229 exact, 11 partial, 13 none). | Input to WP2 with `origin: agent_audit`, verified deterministically, never trusted unchecked (§2.5). |

---

## 1. Principles and honesty rules

1. **Provenance on everything.** Every source, resource, curriculum node,
   question, variant and validation result carries where it came from, when it
   was retrieved, and under what licence status. A record without provenance
   fails validation.
2. **No fabricated official content.** Jazira questions are never labelled
   official, ministerial ("وزاري"), Qiyas or "from past exams". `provenance.official`
   is the constant `false` in the schema. iEN's own question bank is recorded
   only as an external resource (its count and a link), and its questions are
   never copied, paraphrased or used as generation input.
3. **No rehosting.** Textbook PDFs are MoE / Tatweer copyright ("جميع الحقوق محفوظة").
   They are cached **only** under `C:/jazira/content-cache` (override:
   `CONTENT_CACHE_DIR`), outside the repo, for extraction. The repo holds
   metadata, page references, short headings and Jazira-authored questions.
   Extracted page text, page images (`pdf-render` JPEGs) and vision
   transcripts are copyrighted material: they stay in the cache, are never
   committed and are never sent to third-party AI systems (ChatGPT, Gemini;
   §4.4). Every textbook excerpt committed to the repo (headings, evidence
   snippets, term-evidence excerpts, front-matter snippets) is **≤ 80 chars**;
   question evidence quotes live in a cache-side sidecar and the committed
   record keeps only `{pdf_page, quote_sha256, char_offsets}` (§2.8).
   `validate-staging` enforces both rules and fails on any `.jpg`/`.png`
   under `data/` or `src/` that is not in the image manifest (`src/lib/assets.js`).
4. **Licence status is explicit.** When permission is unknown, the source is
   `provenance_status: "PROVENANCE_REVIEW_REQUIRED"`. iEN is in this state.
   Items derived from such a source may be generated, validated and imported
   into staging and test databases, but reach production only after the owner
   records a decision in `data/staging/sources/registry.json`
   (`publish_policy`, §2.3). The engine never infers permission.
5. **No invented structure.** Terms, units and lessons come from sources. Term
   membership comes **only** from evidence (a cover page, a listing title that
   names the term, a TOC marker, a corroborated plan-guide table or course
   code, or an explicit recorded owner decision; §2.4). Part numbers are never
   evidence by themselves: part 1 is not assumed to be term 1. The owner may
   record "part N = term N" as `method: owner_decision`; the UI then shows the
   term as "unconfirmed". Missing evidence gives `term_status: "needs_review"`,
   and the UI says so. Given the observed covers (§0), `needs_review` is the
   expected state for most books.
6. **Missing is shown as missing.** An inaccessible PDF is `status: "unavailable"`,
   an ambiguous one `needs_review`. No replacement file, no placeholder
   content.
7. **Disagreement is never resolved silently.** If the generator, the
   deterministic checks, the primary validator or a cross-validator disagree
   on an answer, the item becomes `review_required` (the REVIEW_REQUIRED state
   of the requirements) and a human decides. Math and science prefer
   deterministic recomputation over model opinion.
8. **Counts are truthful.** Reports count records that exist in files, by
   status. "Questions", "variants" and "possible exam sessions" are separate
   numbers, and session counts are computed (§5.6), never estimated by
   multiplication of headline numbers. If 20,000 validated questions exist,
   the report says 20,000.
9. **Canonical, not copied.** One canonical question is referenced from many
   lessons, chapters, terms and templates through links. Variants are a bounded,
   code-verified set per template. Nothing is duplicated to inflate volume.
10. **No bypasses.** Public, unauthenticated endpoints only. No login on the
    user's behalf, no CAPTCHA or rate-limit evasion, polite crawling
    (§4.1). Madrasati (account required) and DeepSeek (not signed in) are out
    of scope.
11. **The UI never names an AI provider.** Provider or model names may appear
    in staging validation records (they are audit data) but never in DB
    columns readable by clients, the client bundle or UI strings.

---

## 2. Canonical data model

### 2.1 Conventions

- Encoding UTF-8, LF, no BOM. Timestamps UTC ISO-8601 (`2026-09-26T21:00:11Z`).
  Hijri years are strings (`"1448"`).
- Content `language` ∈ `ar | en`. UI locale is separate.
- Every record carries `schema: "<name>@<major>"` (e.g. `question@1`); a
  breaking change bumps the major and ships a migrator.
- Enums are lower snake case, except literals fixed by the requirements:
  `PROVENANCE_REVIEW_REQUIRED` and the dedup classes
  `EXACT_DUPLICATE | NEAR_DUPLICATE | RELATED | UNIQUE`.
- `created_at` is the first ingestion time and never changes; `updated_at`
  changes when any content field changes (then `revision` increments).

### 2.2 Stable, deterministic IDs

| Entity | Format | Example | Rule |
|---|---|---|---|
| source | slug | `ien`, `moe-plan-guide-5`, `moe-two-terms`, `jazira-original` | Hand-assigned, never reused. |
| resource | `<source>-<provider id>` | `ien-120607`; external bank `ien-bank-90` | Provider's numeric id. |
| curriculum node (stage, grade, track) | existing catalog slug | `middle`, `middle/grade-1`, `high-school/grade-2/general` | Same as `resolveCurriculum`. |
| term node | `<leaf>/t1`, `<leaf>/t2` | `middle/grade-1/t1` | Virtual navigation node. |
| subject node | `<leaf>/<subject id>` | `middle/grade-1/math` | Subject id from the catalog (meaningful only with its leaf). Source-only iEN subjects use `<leaf>/ien-<ienId>`. |
| unit / chapter / lesson | `<subject node>/n<ienId>` or `<subject node>/x<hex8>` | `middle/grade-1/math/n91`, `…/n4318`, `…/x3fa9c21b` | **Flat under the subject**: the parent is a field, not part of the id, so inserting a level never renames a node. `n` = iEN-backed; `x` = first 8 hex of `sha256(subjectNode + "|" + kind + "|" + normalizeTitle(title))` for TOC-only nodes. No year in the id, so references survive a year roll-over. |
| term evidence | `te-<resource>-p<pdfPage>-<term>` | `te-ien-120607-p1-t1` | |
| page map row | `(resource_id, pdf_page)` | | 1-based PDF page index. |
| objective | `obj-<hex10>` | `obj-9b1c02e4aa` | `sha256(lesson + "|" + normalize(text))` at first assignment, then frozen in the id registry (below). |
| stimulus (shared passage) | `st-<hex10>` | | `sha256(normalize(text))`. |
| question | `q-<grade code>-<subject>-<hex10>` | `q-m1-math-3f9a1c2b7d` | Grade code `e1..e6`, `m1..m3`, `h1..h3`; prep uses `apt` / `ach` with the section as subject (`q-ach-chemistry-…`). `hex10` = `sha256(anchor + "|" + type + "|" + normalize(stem) + "|" + idMaterial)` at **creation** (`anchor` = the lesson, or `prep:<exam>/<section>/<topic>`); stored, then frozen (edits bump `revision`, never the id). `idMaterial` (`questionIdMaterial` in `src/lib/content/ids.js`) is **answer-free**: the canonical JSON of the **sorted** normalized option texts (mcq, true_false), the sorted left and right texts (matching, never the pairing), the sorted item texts (ordering, never the order), the normalized unit text (numeric, never the value), nothing for short_answer. It never includes the key, the correct option, accepted answers or anything sized from them, so an id cannot be used to test candidate answers offline, and reordering the options never changes it (`questionIdHash` refuses an `answer` argument). Ingestion also stores the options of a shufflable mcq in an order seeded by this id (HASH-CTR over the opaque option ids), so the authoring position of the key never survives; fixed-order items keep their order. `content_hash` (the dedup safety net) sorts shufflable lists (mcq options without a fixed order, matching columns, ordering items) by normalized text before hashing, so it is option-order independent too. If an existing record has the same full hash **and** the same content, the new item is an exact duplicate → `D001` reject. Only when the 10-hex prefix matches but the stored content differs is the next 10 hex taken. Max length 39, inside `questions.key` `^[a-z0-9][a-z0-9-]{1,39}$`. Legacy keys (`aq-001` …) are kept. |
| question template | `t-<grade code>-<subject>-<hex10>` | `t-m1-math-0c4e1d9a2b` | Same rule over the stem template. |
| materialized variant | `v-<grade code>-<subject>-<hex10 of template>-<nn>` | `v-m1-math-0c4e1d9a2b-07` | `nn` = 01..50, deterministic (§4.6). ≤ 40 chars. |
| validation record | `<run_id>:<question id>:<validator>` | `run-20260927-val-01:q-m1-math-3f9a1c2b7d:primary` | |
| run | `run-<yyyymmdd>-<kind>-<nn>` | `run-20260927-gen-01` | kind ∈ `crawl, extract, gen, check, val, xval, dedup, var, import, report`. |
| dedup cluster | `dc-<canonical question id>` | | |
| exam template | `<id>@<version>` | `chapter-quiz@1` | |
| exam session | uuid (DB) / `g-<22 base64url>` (guest) | | Random. |

`normalize()` is defined once in `src/lib/content/normalize.js` (§4.5 and
Appendix A) and mirrored by the new SQL `search_normalize_v2` (0014; the 0012
`search_normalize` stays untouched).

**Id registry** (`data/staging/curriculum/id-registry.jsonl`, `id-registry@1`):
`{ id, kind: x_node | objective, scope (subject node or lesson), first_title_norm, aliases: [title_norm…], assigned_at }`.
Hash-derived `x…` node and `obj-…` ids are minted once. On later runs a title
is first matched (normalized equality, then trigram ≥ 0.85 within the same
parent and kind) against the registry and reuses the existing id; a typo fix
adds an alias instead of a new id. Unmatched titles mint new ids. The registry
is append-only; `validate-staging` fails if an id disappears from it.

### 2.3 Source (`data/staging/sources/registry.json`, schema `source@1`)

| Field | Type / enum |
|---|---|
| `id` | slug |
| `kind` | `official_portal \| official_document \| official_news \| internal \| licensed` |
| `name_ar`, `name_en` | string |
| `operator` | string (e.g. "Tatweer Educational Services for the Ministry of Education") |
| `base_urls` | https URL[] (only URLs actually retrieved) |
| `domain` | string |
| `retrieval` | `{ method: "api_get" \| "download" \| "manual", tool: "ien-crawl@1", retrieved_at, request_count }` |
| `license_status` | `all_rights_reserved \| permission_granted \| public_domain \| internal \| unknown` |
| `provenance_status` | `verified \| PROVENANCE_REVIEW_REQUIRED` |
| `redistribution` | `link_only \| allowed \| internal` |
| `publish_policy` | `pending_owner_decision \| derived_questions_allowed \| blocked`, plus `decided_by`, `decided_at`, `note` |
| `notes` | string |

Initial rows: `ien` (all_rights_reserved, PROVENANCE_REVIEW_REQUIRED,
link_only, `pending_owner_decision`), `moe-plan-guide-5`, `moe-two-terms`
(official_document / official_news, link_only, verified), `jazira-original`
(internal, verified, `derived_questions_allowed`).

### 2.4 Resource (`data/staging/resources/resources.jsonl`, schema `resource@1`)

| Field | Type / enum |
|---|---|
| `id` | `ien-<bookId>` |
| `source_id` | `ien` |
| `provider_ref` | `{ ien_book_id, subject_ien_id, path, tree_path }` |
| `subject_node_id` | subject node id or null (unmapped → `needs_review`) |
| `stage`, `grade`, `track` | node ids (denormalized for filters) |
| `kind` | `student_book \| activity_book \| teacher_guide \| practice_resource \| test_resource \| audio \| question_bank_external \| other` |
| `title` | as listed (verbatim listing title, a fact) |
| `part` | int or null. Source of truth: the listing title or the cover («الجزء الأول/الثاني»). The file name (`-PART2`, `.part`, case-insensitive) is only a cross-check; a missing or conflicting value → `needs_review`. Never used as term evidence by itself (§2.4). |
| `part_evidence` | `{ listing, cover, file_name }` (each the parsed value or null) |
| `year_label` | `"1448"` or null: the cover edition line («طبعة 1448») when present, else the file name. Both are recorded in `year_evidence {cover, file_name}`; a mismatch (13 of 65 front-matter covers say 1447 while the file says 1448) or an anomaly (`"1488"`) keeps the values verbatim with `status: needs_review` |
| `url` | https link-out (`https://iencontent.ien.edu.sa/books/<path>`); for `question_bank_external`: `https://www.ien.edu.sa/?choice=2#/subjectselfassessments/<subjectIenId>` |
| `file_type` | `pdf \| zip \| other` |
| `bytes`, `last_modified`, `http_status`, `range_supported` | from the crawler's HEAD check |
| `page_count` | int or null (after extraction) |
| `sha256` | of the cached file, or null |
| `external_count` | int or null (iEN `questionsCount` for `question_bank_external` rows only) |
| `availability` | `external_official \| unavailable \| needs_review` |
| `term` | `t1 \| t2 \| both \| null` |
| `term_status` | `verified \| inferred \| needs_review \| unknown` |
| `term_evidence` | `term_evidence_id[]` |
| `license_status`, `provenance_status`, `redistribution` | copied from the source |
| `retrieved_at` | ISO |
| `extraction` | `{ status: not_started \| frontmatter_done \| full_done \| failed \| not_applicable, run_id, pages_with_text, pages_vision, text_quality: ok \| repaired \| untrusted, toc_status: found \| not_found \| partial }` (pages without a usable text layer are read by vision, §4.2; there is no `ocr_needed` skip state) |
| `status` | `active \| needs_review \| unavailable` |

**Term evidence** (`data/staging/resources/term-evidence.jsonl`, `term-evidence@1`):
`{ id, resource_id, pdf_page, method: cover_text | title_page_text | listing_title | toc_marker | vision | plan_guide | course_code | owner_decision, term: t1|t2|both, excerpt (≤ 80 chars, verbatim, repaired text), reads: int (vision only), confidence: high|medium|low, run_id, extracted_at }`.

The observed covers (§0) make the strict routes rare, so the evidence routes
are ranked:

| Route | `method` | Gives at best |
|---|---|---|
| Cover/title page states «الفصل الدراسي الأول/الثاني» (strict regex on repaired text, §4.2 step 5; «الفصل الثاني» alone is a chapter and never matches) | `cover_text`, `title_page_text` | `verified` |
| TOC marker «الفصل الدراسي الثاني» inside the contents, read from text or vision | `toc_marker` | `verified` for the units it spans |
| Vision read of a cover or TOC page (§4.2); counts only when **two independent reads agree** (`reads ≥ 2`), otherwise `needs_review` | `vision` | `verified` |
| Listing title names the term | `listing_title` | `inferred` |
| MoE plan-guide per-term tables (`moe-plan-guide-5`, edition 1447 only) | `plan_guide` | `inferred` |
| Secondary course code in the file name (e.g. `CHMI2.1`), **only** when the plan guide corroborates it | `course_code` | `inferred` |
| Owner records "part N = term N" for a subject set in `data/staging/curriculum/owner-decisions.jsonl` | `owner_decision` | `inferred`, shown as "unconfirmed" in the UI |

Resolution per resource: `verified` = at least one `verified`-grade hit and no
contradicting hit; `inferred` = only `inferred`-grade hits and no
contradiction; conflicting hits or none = `needs_review`. `toc_marker`
evidence assigns terms to units of a full-year book (`term: both` on the
resource). The `term_*` keys already present in `book-frontmatter.jsonl` are
**not consumed**; terms are re-derived with the strict regex (the one
committed `term_2` hit is a chapter heading). **Expected outcome:** most
resources stay `needs_review` unless the owner records a decision; the
coverage report leads with a "term undeterminable" bucket (§8).

### 2.5 Curriculum nodes (`data/staging/curriculum/nodes/<stage>/<grade>[-<track>].jsonl`, `curriculum-node@1`)

Logical hierarchy: **stage → grade → track → term → subject → unit → chapter → lesson**.
Physical tree: stage → grade → [track] → subject → unit → [chapter] → lesson,
with term as an evidence-backed attribute. Term nodes exist for navigation and
search; subject membership in a term is derived (below).

| Field | Type / enum |
|---|---|
| `id`, `parent_id` | ids per §2.2 |
| `kind` | `stage \| grade \| track \| term \| subject \| unit \| chapter \| lesson` |
| `stage`, `grade`, `track`, `subject` | ancestor ids (null where not applicable) |
| `order` | int, contiguous among siblings |
| `title_ar`, `title_en` | `title_en` only when a source gives it (English subject) or the catalog has it; never machine-invented for lessons |
| `term` | `t1 \| t2 \| both \| null` (unit, chapter, lesson) |
| `term_status` | `verified \| inferred \| needs_review \| unknown` |
| `term_evidence` | id[] (inherits from the resource or TOC) |
| `pages` | `[{ resource_id, pdf_start, pdf_end, printed_start, printed_end, method: toc \| ien_align \| manual, status: verified \| needs_review }]` (lesson / chapter / unit) |
| `source_refs` | `[{ source_id, ien_id, ien_unit_id, code_id, retrieved_at }]` |
| `in_plan` | boolean: subject appears in the MoE study plan for this leaf |
| `status` | `verified \| needs_review \| source_only \| unavailable` |
| `audit` | `[{ code: title_mismatch \| missing_in_toc \| missing_in_ien \| order_mismatch \| term_conflict, detail }]` |

Rules:

- **Input mapping:** `data/staging/sources/research/catalog-map.jsonl`
  (`catalog-map@1`, `origin: agent_audit`) is the starting mapping. WP2
  verifies each row deterministically: every `ien_subject_id` exists in
  `nodes.jsonl` under the same grade, its books equal `books.jsonl`, and
  `lesson_count`/`unit_count` equal `lessons.jsonl`. A failing row, or a row
  that disagrees with the title heuristic below, goes to `audit.jsonl` with
  `needs_review`; it is never trusted unchecked, and there is exactly one
  output mapping (`ien-mapping.json`).
- iEN `SUB` nodes map to catalog subjects by numeric id per grade node and
  normalized title (secondary: catalog `labels` first, then `name`). Unmatched
  iEN subjects (Chinese, tahfeez tajweed, enrichment arts and music, the
  level-2 PE node listed under first year) are `status: source_only`,
  `in_plan: false`, and are not shown in the catalog UI.
- iEN units and lessons (from `lessons.jsonl`) give the default structure. The
  book TOC (§4.2) is cross-checked. Matching titles (trigram Jaccard ≥ 0.6
  after `normalize`) add page ranges. Mismatches go to `audit` and the node
  becomes `needs_review`; both sources are kept.
- iEN «مدخل وحدة» rows are unit openers: `kind: lesson` with `status: needs_review`
  until a TOC confirms them; they are excluded from question pools.
- **Subject-term membership** (`data/staging/curriculum/subject-terms.jsonl`):
  `{ subject_node_id, term, status: verified | inferred | needs_review | absent, evidence: id[] }`.
  A subject is in term *t* if at least one of its units or resources has term
  *t* or `both` with `verified`/`inferred` status. It is `absent` from *t* only
  when **all** its resources are `verified` for other terms. Otherwise
  `needs_review`. Only `verified` membership may remove a subject from a term in
  the catalog (§4.2).

### 2.6 Page map and TOC

`data/staging/resources/page-maps/<resource_id>.jsonl` (`page-map@1`), one row
per PDF page, **no body text**:

```json
{"resource_id":"ien-120607","pdf_page":14,"printed_page":12,"kind":"lesson",
 "lesson_node_id":"middle/grade-1/math/n4318","headings":["1-2 …"],
 "char_count":2140,"text_sha256":"…","has_text_layer":true,
 "script":{"arabic":0.82,"latin":0.05,"digits":0.13},"flags":["presentation_forms_fixed"]}
```

`kind` ∈ `cover | front_matter | toc | unit_opener | lesson | exercise | review | answer_key | glossary | back_matter | unknown`.
`headings` ≤ 3 entries of ≤ 80 chars. `flags` ⊆
`reversed_fixed, presentation_forms_fixed, ligature_fixed, split_letters_fixed, font_garbage, low_text, no_text_layer, two_column, vision_read`.
Each row also carries `text_method: text | vision | none` and
`text_quality: ok | repaired | untrusted` (§4.2).
`data/staging/resources/toc/<resource_id>.json` holds the parsed TOC entries
`{ level, title, printed_page, pdf_page, matched_node_id, match_score, method: text | vision }`.

**Exercise index** (`data/staging/resources/exercise-index/<resource_id>.jsonl`,
`exercise-index@1`, no body text):
`{ resource_id, pdf_page, label (≤ 20 chars, e.g. "تدرب 3"), kind: example | exercise | review | answer_key, lesson_node_id, method: text | vision }`.
Built from text and vision reads; used for packet targets (§4.3) and the
coverage gaps (§8).

### 2.7 Objective and stimulus

- `objective@1`: `{ id, lesson_node_id, text_ar, text_en|null, origin: extracted | authored, source: { resource_id, pdf_page } | null, status: draft | validated }`.
  Extracted objectives («أهداف الدرس» / "In this lesson you will") are short
  statements with a page reference; authored objectives describe the skill in
  Jazira's words.
- `stimulus@1` (shared reading passage, table in text form, scenario):
  `{ id, language, text (≤ 8000), origin, source: {…} | null }`. Items sharing a
  stimulus stay adjacent in an exam.

### 2.8 Canonical question (`question@1`)

```json
{
  "schema": "question@1",
  "id": "q-m1-math-3f9a1c2b7d",
  "revision": 1,
  "content_hash": "sha256:5e…",
  "scope": "curriculum",
  "curriculum": {
    "stage": "middle", "grade": "middle/grade-1", "track": null,
    "term": "t1", "term_status": "verified",
    "subject": "middle/grade-1/math",
    "unit": "middle/grade-1/math/n91", "chapter": null,
    "lesson": "middle/grade-1/math/n4318"
  },
  "links": [{ "node_id": "prep:achievement/math/algebra", "role": "aligned" }],
  "prep": null,
  "objective_id": "obj-9b1c02e4aa",
  "question_type": "mcq",
  "item_style": "application",
  "difficulty": 3,
  "difficulty_band": 2,
  "difficulty_source": "validator_estimate",
  "language": "ar",
  "stimulus_id": null,
  "stem": "…؟",
  "payload": { "options": [{ "id": "a", "text": "…" }, { "id": "b", "text": "…" }, { "id": "c", "text": "…" }, { "id": "d", "text": "…" }],
               "answer": { "option_id": "c" }, "fixed_order_reason": null },
  "explanation": { "text": "…", "steps": ["…", "…"], "method": "…" },
  "shuffle_options": true,
  "time_limit_seconds": 75,
  "tags": ["…"],
  "computation": { "expr": "a*b", "vars": { "a": 8, "b": 7 } },
  "source": { "source_id": "ien", "resource_id": "ien-120607",
              "pdf_page_start": 14, "pdf_page_end": 15, "printed_page_start": 12, "printed_page_end": 13,
              "evidence": [{ "pdf_page": 14, "quote_sha256": "…", "char_offsets": [120, 188], "quote_kind": "fact" }] },
  "provenance": { "origin": "transformed", "official": false, "license_status": "all_rights_reserved",
                  "generator": { "kind": "llm_subagent", "run_id": "run-20260927-gen-01", "prompt_version": "generate.v1" },
                  "derived_from": [], "template_id": null },
  "status": "candidate",
  "validation": { "status": "pending", "record_ids": [], "checked_revision": null },
  "dedup": { "class": null, "cluster_id": null, "exclusion_group": null },
  "variant": null,
  "is_premium": false,
  "created_at": "2026-09-27T08:00:00Z",
  "updated_at": "2026-09-27T08:00:00Z"
}
```

Field rules and enums:

| Field | Enum / rule |
|---|---|
| `scope` | `curriculum \| aptitude \| achievement` |
| `curriculum` | required for `curriculum`; `lesson` must be a `kind: lesson` node; `term`/`term_status` are **copied from the lesson**, never set by the generator |
| `prep` | `{ exam, section, topic }` from `src/lib/exams/catalog.js` vocabulary; required for aptitude/achievement |
| `links[].role` | `primary \| aligned` (the primary link is `curriculum.lesson`) |
| `question_type` | `mcq \| true_false \| matching \| ordering \| short_answer \| numeric` |
| `item_style` | `definition \| conceptual \| computation \| application \| scenario \| reasoning \| review` |
| `difficulty` | int 1..5 (1 very easy … 5 very hard). `difficulty_band` 1..3 derived: 1–2 → 1, 3 → 2, 4–5 → 3 (the DB `difficulty` column keeps 1..3). Legacy 1/2/3 map to levels 2/3/4. |
| `difficulty_source` | `author \| generator_estimate \| validator_estimate \| empirical` |
| `time_limit_seconds` | 10..600 |
| `tags` | ≤ 12, each ≤ 60 chars |
| `computation` | required when `item_style = computation` or the type is `numeric` in math/physics/chemistry/science/statistics subjects: an expression over `vars` in the §4.6 grammar whose value is the answer. Null otherwise. |
| `source.evidence[]` | Committed: `{ pdf_page, quote_sha256, char_offsets [start, end], quote_kind }`; `quote_kind` ∈ `fact \| definition \| quran \| hadith \| poetry \| data`. The quote text itself (≤ 200 chars) lives only in the cache sidecar `content-cache/evidence/<shard>.jsonl` keyed by question id (textbook text is never committed, §1.3). `char_offsets` index the page's repaired text or vision transcript. Check `E001` (Appendix B) verifies the quote exists on the cited page. Only `resource_id` and printed pages reach the DB. |
| `variant` | `null`, `{ kind: "template", template_id, variant_no, params }` (§2.9) or `{ kind: "rewrite", of: <question id>, change: context \| representation }` (§4.6) |
| `provenance.origin` | `source_derived` (answer is a fact stated on the cited pages) · `transformed` (restructured from the lesson's text, examples or exercises: new wording, numbers or context) · `generated_practice` (practises the lesson objective without a single supporting sentence; includes template variants) · `internal_authored` (written by the Jazira team; the legacy 300) · `review_required` (origin unclear; cannot be published) |
| `provenance.official` | constant `false` |
| `provenance.generator.kind` | `llm_subagent \| human \| script \| legacy_unknown` (no provider names in this field) |
| `status` | `candidate → validated → published`; also `rejected`, `review_required`, `retired` (§2.15) |
| `validation.status` | `pending \| structural_pass \| auto_pass \| validated \| failed \| review_required` |
| `content_hash` | `"n2:sha256:" +` hex of the canonical serialization of `{question_type, language, normalize_v2(stem), stimulus text, payload with normalized texts, answer}`. The `n2:` prefix names the normalization version (Appendix A), so a future change is explicit. **Server-only:** it includes the answer, so it never reaches a client (no column grant, not in tokens or payloads; §5.8, §6.1). |

**Type payloads** (the answer lives inside `payload`; the importer splits it
into the public part and the key):

| Type | `payload` | Response (client → server) | Grading (`src/lib/content/answers.js`, mirrored in SQL) |
|---|---|---|---|
| `mcq` | `options[2..6] {id a–f, text ≤ 1000}`, `answer {option_id}`, `fixed_order_reason: null \| all_of_above \| none_of_above \| combined_option \| numeric_ascending \| conventional_scale \| source_order` | `{ option_index }` (display index) | 1 if the mapped canonical option is the answer |
| `true_false` | `options` = `[{id:"t",text:"صح"},{id:"f",text:"خطأ"}]` (or `True`/`False` for `en`), `answer {option_id}`; order fixed | `{ option_index }` | as mcq |
| `matching` | `left[2..6] {id, text}`, `right[len(left)..len(left)+2] {id, text}`, `answer {pairs:[[l,r]…]}`, `scoring: partial \| all_or_nothing` | `{ pairs: [[left_display_index, right_display_index]…] }` | partial: correct pairs ÷ left count |
| `ordering` | `items[3..7] {id, text}`, `answer {order:[ids]}`, `criterion: chronological \| ascending \| descending \| process_steps \| other` | `{ order: [display_index…] }` | 1 only if identical (v1) |
| `short_answer` | `accepted[1..10]` strings, `match: normalized_exact \| exact_marks`, `max_chars ≤ 80`, `answer_display` | `{ text }` | `normalized_exact`: 1 if `search_normalize_v2(text)` equals any stored `accepted_norm` (same v2 rules in JS and SQL). `exact_marks`: NFC + whitespace collapse only, no folding, required by check `O010` for items tagged `spelling`, `diacritics` or `i3rab` (hamza, taa marbuta, tashkeel answers). No free-text judgement in v1. |
| `numeric` | `answer {value: decimal string, tolerance {kind: abs \| rel, value}}`, `unit {text, required, accepted[]} \| null`, `input {allow_fraction, max_decimals}` | `{ value, unit? }` | Parse Arabic-Indic / Persian digits and `a/b` fractions. `٫` and `.` are decimal marks; `٬` is a thousands separator. `,` is a thousands separator only in strict groups of three after a non-zero leading group (`1,250` = 1250, `12,345,678`); `,` followed by 1, 2 or ≥ 4 digits is a decimal mark (`2,5` = 2.5); `0,125`, or `,` mixed with `.`/`٫` in one value → `invalid_response {ambiguous_separator}`. Within tolerance; unit must match `accepted` when `required`. |

**Opaque ids.** Option, left, right and item ids are assigned by
`ingest-candidates` as `o|l|r|s + first 6 hex of HMAC-SHA256(template or
question salt, normalized text)`, never in authoring order; check `O009`
fails any item whose ids reveal the answer (e.g. `r_i` paired with `l_i`, or
ascending ids equal to the answer order). Independently of ids, **the client
only ever sees and sends display indexes** for every type; the server maps
them through `choice_order` (separate arrays `left`, `right`, `items`,
`options`; §2.13) to canonical ids before storing.

Parsing and grading behave the same in JS and SQL. There is **one** JS
grader, `src/lib/content/answers.js` (WP1); the engine's `grade.js` only maps
display ↔ canonical and calls it. A shared fixture
(`tests/fixtures/content/grading-cases.json`, WP1, including punctuation,
NFKC, superscript, thousands-separator and `exact_marks` cases) is run by
`answers.js`, by the guest route path (WP6) and by SQL `_ce_grade` (WP7).

### 2.9 Question template and variant

`data/staging/question-variants/templates/<shard>.jsonl` (`question-template@1`):

```json
{
  "schema": "question-template@1", "id": "t-m1-math-0c4e1d9a2b", "revision": 1,
  "lesson_node_id": "middle/grade-1/math/n4318", "objective_id": "obj-…",
  "question_type": "mcq", "item_style": "computation", "difficulty": 2, "language": "ar",
  "solution_method": "ضرب عددين صحيحين",
  "params": { "a": { "type": "int", "min": -12, "max": 12, "exclude": [0, 1] },
              "b": { "type": "int", "min": 2, "max": 12 } },
  "constraints": ["a != b", "abs(a*b) <= 100"],
  "stem": "ما ناتج {a} × {b}؟",
  "answer": { "expr": "a*b", "format": "int" },
  "distractors": [{ "expr": "a+b", "why": "جمع بدل الضرب" },
                  { "expr": "-(a*b)", "why": "خطأ في الإشارة" },
                  { "expr": "a*(b-1)", "why": "خطأ في العد" }],
  "explanation": { "text": "…{a}…{b}…", "steps": ["{a} × {b} = {ans}"] },
  "max_variants": 12,
  "source": { "…": "as in question@1" },
  "provenance": { "origin": "generated_practice", "official": false, "…": "…" },
  "status": "candidate", "validation": { "…": "…" }
}
```

Variants are materialized offline (§4.6) as ordinary `question@1` records
with `variant: { kind: "template", template_id, variant_no, params }` and a
`member_of` edge to the template id in the exclusion model (§4.5 step 7), so
the DB, grading and attempt history need no second code path. A session
never contains two members of the same exclusion component. Every variant keeps the template's lesson, objective,
difficulty and solution method; the validator enforces this.

### 2.10 Validation record (`validation-record@1`)

`data/staging/validation/records/<shard>.jsonl`:

| Field | Type / enum |
|---|---|
| `id` | `<run_id>:<question_id>:<role>` |
| `question_id`, `revision`, `content_hash` | the exact version checked |
| `role` | `deterministic \| primary \| resolver \| language \| human` |
| `agent` | `script \| claude_subagent \| chatgpt_web \| gemini_web \| human:<initials>` (staging only) |
| `run_id`, `prompt_version`, `checked_at` | |
| `verdict` | `pass \| warn \| fail \| disagree \| abstain` |
| `checks` | `[{ code (Appendix B), result: pass \| warn \| fail, detail }]` |
| `blind_answer` | the validator's own response before seeing the key (primary, resolver) |
| `support` | `supported \| partial \| unsupported \| not_checked` (source support) |
| `ambiguity` | `none \| minor \| ambiguous` |
| `difficulty_estimate` | 1..5 |
| `issues` | `[{ code, span, suggestion }]` |
| `notes` | ≤ 1000 chars |

### 2.11 Dedup cluster (`dedup-cluster@1`)

`data/staging/validation/dedup-clusters.jsonl`:
`{ id: "dc-<canonical>", canonical_id, members: [{ id, class: EXACT_DUPLICATE | NEAR_DUPLICATE | RELATED, score: { stem_jaccard, item_jaccard, option_jaccard }, signals: [exact_hash | minhash | same_answer | same_pages | numeric_variant | template_variant | semantic_judged] }], exclusion_group, run_id }`.
Items not in any cluster are `UNIQUE`. The item's `dedup.class` is its own class
relative to the canonical (the canonical itself is `UNIQUE`).

### 2.12 Exam template (`exam-template@1`)

Source of truth: `src/lib/exams/engine/exam-templates.js` (the engine needs it
at runtime); exported to `data/staging/exams/templates.json` and to the
`exam_templates` table by the importer.

```json
{
  "id": "chapter-quiz", "version": 1, "kind": "chapter",
  "scope_kinds": ["unit", "chapter"],
  "count": { "default": 15, "min": 5, "max": 40, "guest_max": 20, "free_max": 25, "mini": null },
  "difficulty_mix": { "easy": 30, "medium": 50, "hard": 20 },
  "coverage": { "stratify_by": "lesson", "weight": "equal", "min_per_stratum": 1 },
  "term_rule": "inherit",
  "types": ["mcq", "true_false", "matching", "ordering", "short_answer", "numeric"],
  "timing": { "mode": "timed", "seconds_per_question": 75, "min_seconds": 300, "max_seconds": 3600, "grace_seconds": 30, "user_may_change": true },
  "feedback": { "default": "end", "allowed": ["end"] },
  "retry": { "avoid_last_attempts": 5, "avoid_days": 90, "allow_reuse": true, "max_reuse_share": 30 },
  "randomization": { "question_order": "shuffle_keep_stimulus", "option_shuffle": true, "one_per_exclusion_group": true },
  "scoring": { "unit": "percent", "matching": "partial", "negative_marking": false, "pass_threshold": 60 },
  "quota": "exam",
  "eligibility": { "question_status": ["published"], "min_pool_factor": 1.0 }
}
```

Enums: `kind` ∈ `lesson | chapter | subject | term | full_year | practice | mock | timed | weakness | random`;
`coverage.stratify_by` ∈ `objective | lesson | chapter | unit | topic | none`; `coverage.weight` ∈
`equal | lesson_count | pool_size | error_rate`; `term_rule` ∈ `inherit | single_term | both_terms`;
`timing.mode` ∈ `timed | untimed`; `feedback` ∈ `end | immediate`; `quota` ∈ `exam | practice`;
`question_order` ∈ `shuffle | shuffle_keep_stimulus | by_stratum`.

The ten v1 templates:

| id | Scope | Count default (min–max) | Mix e/m/h | Coverage | Timing | Feedback | Retry / notes | Quota |
|---|---|---|---|---|---|---|---|---|
| `lesson-quiz` | lesson | 10 (3–20) | 40/40/20 | by objective, equal | untimed (timed optional, 60 s/q) | immediate or end | avoid last 5 on this lesson | practice |
| `chapter-quiz` | unit, chapter | 15 (5–40) | 30/50/20 | by lesson, equal, ≥ 1 each | 75 s/q | end | avoid last 5 | exam |
| `subject-quiz` | subject (optionally `@t1`/`@t2`) | 25 (10–60) | 30/45/25 | by unit, weight = lesson count | 75 s/q | end | avoid last 5 | exam |
| `term-exam` | subject `@t1` / `@t2` | 40 (20–80) | 30/45/25 | by unit, lesson count; lessons with the selected term and `term_status ∈ {verified, inferred}` only | 90 s/q, ≤ 120 min | end | avoid last 5 | exam |
| `full-year` | subject `@year` | 60 (30–100) | 30/45/25 | by (term, unit), lesson count; both terms combined, distribution shown | 90 s/q, ≤ 180 min | end | avoid last 5 | exam |
| `practice` | any node | 10 (5–30) | 40/40/20 | by lesson, pool size | untimed | immediate | avoid last 10 | practice |
| `mock` | subject, `prep:<exam>[/<section>]` | 50 (20–100) | 25/50/25 | by unit or topic, lesson count | 60 s/q | end | avoid last 5. A Jazira practice format; never presented as an official test structure. | exam |
| `timed` | any node | 20 (5–100) | 30/45/25 | by lesson, lesson count | 60 s/q (strict) | end | avoid last 5 | exam |
| `weakness-review` | `weak:` (+ optional node) | 15 (5–30) | 40/40/20 | by lesson, weight = error rate | untimed | immediate | **prefers** previously wrong items last seen > 24 h ago | practice |
| `random-practice` | any node | 10 (5–50) | 34/33/33 | none | untimed | immediate | avoid last 10 | practice |

Tier clamping (§5.3): free `exam` sessions are capped at 25, so
`term-exam` (default 40) and `mock` (default 50) are clamped to 25 (their
min is 20). Only `full-year` (min 30) is below the cap's reach; it defines
`count.mini = 25` and free users get "full year (mini)", labelled as such.

Scope grammar: `scope := <node id> [ "@" ("t1" | "t2" | "year") ] | "prep:" exam [ "/" section [ "/" topic ] ] | "weak:" [ <node id> ]`.

### 2.13 Exam session and response

DB (`exam_attempts` + `exam_attempt_items`, extended in §6) and guest tokens
carry the same logical fields:

- **Session:** `id`, `user_id | null`, `template_id`, `template_version`,
  `scope`, `term_scope` (`t1 | t2 | year | null`), `seed` (32 hex chars),
  `retake_of`, `timing_mode`, `feedback_mode`, `status`
  (`in_progress | submitted | expired | abandoned`), `started_at`,
  `expires_at` (deadline; untimed = start + 7 days), `submitted_at`,
  `question_count`, `correct_count`, `score_percent`, `duration_seconds`,
  `bank_revision` (hash of the published pool version), `meta` (includes
  `allocation`: the per-cell quotas of §5.3, reused by a retake).
- **Item:** `position` (1-based), `question_key`, `question_revision` (the
  revision served), `choice_order` (smallint[]: display index → canonical
  index for mcq/true_false; null = identity), `display_map` (jsonb for
  matching/ordering: `{left:[…], right:[…], items:[…]}`, each display index →
  canonical id), `response` (jsonb, per §2.8, canonical ids, server-mapped),
  `selected_index` (canonical, mcq/true_false, kept for the legacy code
  path), `score` (0..1) and `is_correct` (score = 1) — **both stay null until
  the item is locked by `check_exam_item` or the attempt is finalized** —
  `time_spent_seconds`, `flagged`, `answered_at`, `locked_at` (immediate
  feedback), `voided` (`question_updated` when the revision changed; §6.3).
- **Untimed deadline:** start + 7 days, for DB sessions and guest tokens alike.

### 2.14 Analytics aggregates

| Table | Key | Fields | Updated by |
|---|---|---|---|
| `learner_question_stats` | (user, question) | `seen_count, correct_count, last_seen_at, last_correct, wrong_streak` | `_exam_finalize` |
| `learner_node_stats` | (user, node) for lesson, unit/chapter, subject, and `prep:` topic/section nodes (§4.3b) | `answered, correct, time_seconds, band_answered int[3], band_correct int[3], last_at` | `_exam_finalize` (ancestors of each item's primary lesson) |
| `question_item_stats` | question | `answered, correct, total_time_seconds, last_at` (content QA: empirical difficulty) | `_exam_finalize`; service role only |
| `scope_pool_counts` | (node, band) | `published_count, group_count` | importer (`ce_refresh_aggregates`), never per statement |

Weak areas: lessons with `answered ≥ 5`, ranked by the Wilson lower bound
(z = 1.645) of accuracy, ascending. Repeated mistakes: `wrong_streak ≥ 2`.
Improvement: the existing 7/30-day windows plus per-node trend.

### 2.15 Lifecycles

```
question:  candidate ──det. fail──► rejected
              │ det. pass
              ▼
           (validation) ──disagreement / unsupported / ambiguous──► review_required ──human──► validated | rejected
              │ all required validators pass
              ▼
           validated ──dedup: canonical or UNIQUE, source publish_policy allows──► published ──removed from staging──► retired
                      └─dedup: EXACT/NEAR duplicate of another canonical──► rejected (reason duplicate_of)
resource:  listed → active | unavailable | needs_review ; extraction: not_started → frontmatter_done → full_done | failed
session:   in_progress → submitted | expired (deadline + grace passed) | abandoned (user or 7-day untimed timeout)
```

`scripts/content/publish.mjs` performs the `validated → published` step: it
requires the current revision's validation, a dedup class without
`duplicate_of`, and a source that is internal or whose `publish_policy` is
`derived_questions_allowed`; everything else stays `validated` with its
reason reported, and published items are never unpublished silently.

Editing a validated question creates a new `revision`: `status` returns to
`candidate`, and the old validation records no longer apply
(`checked_revision` mismatch).

---

## 3. Staging layout

```
data/
  schemas/                          JSON Schemas (draft 2020-12), one per record type     [committed]
  staging/
    README.md                       this layout, in short                                  [committed]
    manifest.json                   every shard: path, schema, sha256, lines, bytes         [committed, generated]
    sources/
      registry.json                 source records (§2.3)                                  [committed]
      ien/{nodes,books,lessons}.jsonl, crawl-report.json   raw normalized crawl           [committed]
      ien/book-frontmatter.jsonl    per-book cover/TOC page summaries (`book-frontmatter@1`; snippets ≤ 80 chars, no `cache_dir`) [committed]
      ien/changes-<date>.jsonl      crawl-to-crawl diff (§4.1)                             [committed]
      research/catalog-map.jsonl    agent-audit subject map (`catalog-map@1`)              [committed]
      research/term-evidence.json   research claims (`research-claims@1`)                  [committed]
    curriculum/
      nodes/<stage>/<grade>[-<track>].jsonl                 canonical nodes (§2.5)          [committed]
      owner-decisions.jsonl                                 owner "part N = term N" (§2.4)  [committed]
      id-registry.jsonl                                     frozen x-node / objective ids   [committed]
      subject-terms.jsonl                                   derived membership              [committed]
      ien-mapping.json                                      iEN id ↔ node id, source_only   [committed]
      audit.jsonl                                           TOC ↔ iEN mismatches            [committed]
    resources/
      resources.jsonl                                       §2.4                            [committed]
      term-evidence.jsonl                                   §2.4                            [committed]
      extraction.jsonl                                      per-resource extraction status  [committed]
      toc/<resource>.json, page-maps/<resource>.jsonl       §2.6 (no body text)             [committed]
      exercise-index/<resource>.jsonl                       §2.6 (no body text)             [committed]
    questions/
      <stage>/<grade>[/<track>]/<subject>[.pNN].jsonl       canonical questions             [committed]
      prep/<exam>-<section>.jsonl                           aptitude/achievement incl. legacy 300
    question-variants/
      templates/<stage>/<grade>[/<track>]/<subject>.jsonl   §2.9                            [committed]
      <stage>/<grade>[/<track>]/<subject>.jsonl             materialized variants           [committed]
    exams/
      templates.json                                        exported from the engine         [committed]
      blueprints/<stage>.jsonl                              per template × scope: pool, allocation, combinatorics [committed]
    validation/
      records/<same shard path>.jsonl                       §2.10                           [committed]
      dedup-clusters.jsonl                                  §2.11                           [committed]
      review-queue.jsonl, review-decisions.jsonl            human review                     [committed]
      runs/<run_id>.json                                    run manifests (sampling seed, counts, agents available) [committed]
      exchange/                                             cross-AI request/response batches [git-ignored]
    reports/                                                §8                              [committed]
  runtime/
    bank/                                                   pre-DB fallback bank for the app (§5.8) [committed, generated]
```

Outside the repo (`C:/jazira/content-cache`, or `CONTENT_CACHE_DIR`), **one
layout** shared by every tool (the existing `pdf-frontmatter.mjs` and
`pdf-render.mjs` already use it; the design's former `ien/books/` is dropped):

| Path | Content | Writer |
|---|---|---|
| `ien/api/` | crawler response cache | `ien-crawl` |
| `ien/pdf/<file>.pdf` | the only PDF store (full downloads) | `lib/fetch-queue.mjs` via `ensurePdf` |
| `ien/text/<stem>/pNNN.txt` | raw text-layer page text | `pdf-frontmatter`, `extract-pdf` |
| `ien/pages/<stem>/pNNN.jpg` | 1100 px page renders (copyrighted; cache only) | `pdf-render` |
| `extract/<resource>/pages.jsonl` | `{pdf_page, raw, repaired, normalized, method: text \| vision, text_quality, run_id}`; vision transcripts are rows with `method: vision` | `extract-pdf`, vision runs |
| `evidence/<shard>.jsonl` | evidence quote sidecar (§2.8) | `ingest-candidates` |
| `fetch/queue.jsonl` | the persisted fetch queue (§4.1) | `lib/fetch-queue.mjs` |
| `packets/<run>/`, `llm/<run>/`, `import/<target>/` | packets, raw model outputs, import checkpoints and logs | WP4, WP7 |

`<file>` and `<stem>` are sanitized: the API-supplied name must match
`^[A-Za-z0-9._-]+\.pdf$` (case-insensitive extension) or the resource becomes
`needs_review`; every path is resolved and verified to stay under the cache
root before use.

**File rules.** JSONL: one record per line, keys in schema order, records
sorted by `id` (page maps by `pdf_page`), UTF-8, LF, final newline. Output is
byte-deterministic, so a rerun with no changes produces no diff. Shards: split
at **4 MB** into `.p01.jsonl`, `.p02.jsonl` … by sorted id ranges.

**Budgets** (checked by `validate-staging --budget`): shard ≤ 4 MB;
`data/staging` ≤ 200 MB committed (warning at 150 MB); `data/runtime/bank`
≤ 40 MB (a documented cap: the runtime bank is a pre-DB fallback and holds
at most ~60k published items; beyond that the DB path is required, §5.8).
Past 200 MB, published shards move to a gzip release artifact
listed in `manifest.json`, and the repo keeps manifests, reports and
non-question data.

**Schemas and validator.** `data/schemas/*.schema.json` (draft 2020-12, AJV 8).
`node scripts/content/validate-staging.mjs [--budget] [--changed] [--write-manifest]`
checks: (1) every line against its schema; (2) referential integrity (every
node, resource, objective, stimulus, template and cluster reference resolves;
the lesson term matches the question); (3) id uniqueness and format;
(4) sort order and determinism; (5) budgets; (6) `manifest.json` hashes;
(7) **copyright rules**: every committed textbook excerpt field (`headings`,
`excerpt`, `snippet`, TOC `title`) ≤ 80 chars, no `quote` text in question
records, no absolute paths (`cache_dir`, `C:/…`) in committed data, and no
`.jpg`/`.png` under `data/` or `src/` outside the image manifest. Every file
under `data/staging/` must have a schema (including `book-frontmatter@1`,
`catalog-map@1`, `research-claims@1`, `exercise-index@1`, `id-registry@1`,
`owner-decision@1`, `crawl-changes@1`); an unknown file fails, it is never
skipped silently. Exit 0 = ok, 1 = invalid, 2 = usage error.

---

## 4. Pipelines

The pipeline runs as numbered stages with explicit inputs and outputs. Every
run writes `validation/runs/<run_id>.json` (or the crawl report) with its
inputs' hashes, parameters, counts and errors.

```
discovery (4.1) → normalization (4.2 part 1) → PDF fetch + extraction (4.2) → lesson mapping
 → generation (4.3) → deterministic checks + validation + cross-AI sampling (4.4)
 → dedup (4.5) → variants (4.6) → publish decision → exam blueprints (5.6)
 → runtime bank + DB import (6.3) → reports (8)
```

### 4.1 iEN discovery crawler (exists: `scripts/content/ien-crawl.mjs`)

- **Endpoints** (public GET, the ones the iEN portal itself calls):
  `www.ien.edu.sa/api/Lmstree/GetPrimaryStudentStages`,
  `…/GetMidSecondaryStudentStages`, `ibs.ien.edu.sa/api/tree?parentId=`,
  `…/api/tree/AllChildren?parentId=`, `…/api/SubjectBooks?top=100&skip=0&treeId=`,
  `…/api/Questions/SelfAssessments/<subjectId>` (unit → lesson titles and counts;
  titles only, never question text), and `HEAD` on
  `iencontent.ien.edu.sa/books/<path>`.
- **Determinism and resume:** every response is cached by `sha1(url)` under
  `content-cache/ien/api`. A rerun reads the cache unless `--refresh`, so an
  interrupted crawl resumes where it stopped. Outputs are sorted and
  byte-stable.
- **Politeness (all iEN tools: crawler, front matter, render, fetch):** the
  CDN refused connections after ~80 full downloads plus range reads in a
  burst (§0), so every request to `*.ien.edu.sa` goes through one shared,
  persisted queue, `scripts/content/lib/fetch-queue.mjs` (WP3), with state in
  `content-cache/fetch/queue.jsonl` (`{url, kind: api | head | range | full, resource_id, state: pending | done | failed | parked, attempts, last_error, next_at}`):
  - at most **2 requests in flight** across all tools (a lock file makes a
    second process wait), 500 ms pause between requests, an identifying
    User-Agent, and a per-hour request budget (default 600, `--budget`);
  - exponential backoff with full jitter (base 2 s, cap 10 min) on
    `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, 429, 503 and other 5xx,
    honouring `Retry-After`; no retry on other 4xx;
  - a **circuit breaker**: after 5 consecutive refusals the queue stops for
    a 60-minute cool-off (persisted, so a restart does not reset it); after
    3 trips in a day it halts until the next day. It never rotates
    addresses, user agents or anything else to evade a limit;
  - the queue is resumable over days; `--status` prints done/pending/parked
    counts and front-matter coverage as **n/315**.
- No HEAD request is repeated within a run. Recommended cadence: monthly,
  plus after the start of each term.
- **Change detection:** each crawl writes
  `sources/ien/changes-<date>.jsonl` (`crawl-changes@1`): nodes, books and
  lessons added, removed or retitled since the previous snapshot, plus
  edition mismatches (file name year vs cover year). The coverage report
  summarizes it (§8).
- **Provenance:** `crawl-report.json` records `retrieved_at`, request and
  cache counts, errors, licence text and
  `provenance_status: "PROVENANCE_REVIEW_REQUIRED"`. Each row keeps iEN ids,
  `full_path` and `tree_path` so any fact can be re-checked.
- **Anomalies are data:** the `1488-…` file name, the three `.zip` files
  (audio, workbook, "Test Bank") and unparsed paths keep `status: needs_review`.
  Zip files are recorded as `audio` / `activity_book` / `test_resource`
  resources with `extraction.status: not_applicable`; the "Test Bank" is an
  official test resource and is **not** downloaded or mined for questions.

### 4.2 Curriculum normalization and PDF extraction

**Normalization** (`scripts/content/build-curriculum.mjs`, WP2) reads the crawl
tables, the catalog (`src/lib/curriculum.js`), the research JSON and (when
present) extraction outputs, then writes §2.5 nodes, `subject-terms.jsonl`,
`ien-mapping.json`, `audit.jsonl`, `resources.jsonl` and the app outline
(`src/content/curriculum/outline/<stage>/<grade>[-<track>].json`, a slim
published subset used by the UI).

**Catalog correction** (WP2): `buildSubjects` takes `terms` and
`terms_status` from the research JSON. The research JSON takes them from
`subject-terms.jsonl` **only for `verified` membership**, with evidence ids.
`crossCheck` compares terms too. A subject disappears from a term only when
its membership for that term is `absent` (verified). Missing subjects are
added only when they are in the MoE plan for that leaf (`in_plan: true`).
iEN-only subjects are not added. The catalog year stays `1447` until the 1448
study plan is verified (then the docs/CURRICULUM.md §7 procedure applies);
book records carry their own `year_label: "1448"`, and the UI shows the book's
edition label.

**Fetch** (existing `scripts/content/pdf-frontmatter.mjs` plus
`scripts/content/fetch-books.mjs`, both WP3, both on the shared queue of
§4.1 and the `ensurePdf` helper that `pdf-frontmatter` already has):
- **Front matter** (`pdf-frontmatter`): the first 14 pages per book. Books
  already in `book-frontmatter.jsonl` are skipped (no range reads repeated).
  Range mode is used only for books that are not in a generation batch;
  pdf.js range mode issues dozens of 256 KB requests per book, so each book
  is one queue job and counts against the hourly budget.
- **Full** (`fetch-books --subject <node>|--resource <id>`): **only for
  subjects in the current generation batch**. Downloads to
  `content-cache/ien/pdf/<file>` as a `.part` file, resuming with
  `Range: bytes=<size>-` and `If-Range: <Last-Modified>`, then verifies the
  `%PDF-` magic, the byte count and `sha256`. One download at a time, and a
  `--max-gb` guard (the full corpus is 37.5 GB).
- Existing outputs (65 front-matter rows, cached PDFs and page texts) are R3
  partial inputs and are never fetched again.

**Extraction** (`scripts/content/extract-pdf.mjs`, WP3) uses
`pdfjs-dist/legacy/build/pdf.mjs` in Node (no worker, `isEvalSupported: false`,
`useSystemFonts: false`):
1. Per page, `getTextContent({ includeMarkedContent: false })`. Items are
   grouped into lines by baseline `y` (tolerance 0.35 × font height), and
   columns are detected by an x-gap histogram (`two_column` flag). Within a
   line, items are ordered right-to-left when the line's strong characters are
   mostly Arabic (item `dir === "rtl"` or the Arabic ratio > 0.5), otherwise
   left-to-right. A space is inserted when the gap exceeds 0.25 × font size and
   the adjoining characters are not both joining Arabic letters.
2. **Arabic quirks:**
   - NFKC folds presentation forms (U+FB50–FDFF, U+FE70–FEFF) and ligatures
     (ﻻ → لا).
   - Reversed runs: a line is reversed when more than 30 % of its Arabic
     tokens begin with a letter that cannot start a word (ة, ى) or end with
     an initial form. These lines are fixed and flagged `reversed_fixed`.
   - Tatweel is removed. Tashkeel is kept in raw text and removed in
     normalized text.
   - Arabic-Indic digits are kept raw and normalized for matching. Digit runs
     inside RTL lines are not reversed.
   - Bidi control characters are stripped.
   - **Lam-ligature repair** (observed: «املقرر», «اجلزء األول», «االبتدائي»,
     «احلياتية»): the text layer emits the alef of a lam-alef glyph before
     the lam. Word-initial `ا ل X…` stays; a word starting `ا X ل…` or `اال…`
     where X is a letter and the word is not in the lexicon is rewritten to
     `ال X…` (`املقرر → المقرر`), and inside a word `أل/إل/آل/ال` produced by
     a lam-alef glyph is swapped to `لأ/لإ/لآ/لا` (`األول → الأول`). Each
     repair is validated against a lexicon built from iEN titles
     (`lessons.jsonl`, `nodes.jsonl`) and the catalog; the repair rate per
     book is recorded and pages are flagged `ligature_fixed`. Fixtures are
     taken from real cache text (`content-cache/ien/text/*`, copied as short
     synthetic lines into `tests/fixtures/content/pdf/`).
   - **Split letters** (`المتخ ض ض ين`, `المو ص وع`): runs of single Arabic
     letters separated by spaces inside a word are joined when the joined
     form is in the lexicon or the line's word-length distribution says so;
     flag `split_letters_fixed`.
   - **Digit groups** split or reversed (`٧ 4 14 ه` for 1447, mixed digit
     systems) are not guessed: years and page numbers are read only from
     unambiguous runs, otherwise from vision.
   - **Font garbage**: an Arabic-context line whose Latin-letter share is
     > 40 % with no Latin words from a dictionary (e.g. `õcôŸG`) is flagged
     `font_garbage`.
   - `text_quality` per page: `ok`, `repaired` (any fix applied, confidence
     high) or `untrusted` (`font_garbage`, repair rate > 20 %, or
     `char_count < 20` with images present, `no_text_layer`).
   - **Vision instead of skipping:** `untrusted` pages, cover/TOC pages
     with low repair confidence, and equation/figure/table pages of math
     and science lessons are rendered with `pdf-render.mjs` (cache
     `ien/pages/<stem>/pNNN.jpg`) and transcribed by a Claude subagent. The
     transcript is stored in `extract/<resource>/pages.jsonl` with
     `method: vision` and `run_id` (cache only) and becomes the source of
     truth for term evidence, the TOC, P004 and E001 on that page.
   - A matching-only fold `lam_order_fold` (applied to both sides of every
     text comparison, never to stored text) removes the remaining
     ligature-order differences.
3. **Printed page numbers:** a lone number (1–4 digits, either digit set) in
   the top or bottom 8 % of the page. `printed = pdf_page − offset`, where the
   offset is the mode over pages that have a number.
4. **TOC:** a page among the first 15 whose heading matches
   `المحتويات|الفهرس|فهرس المحتويات|Contents`. Entries match
   `<title> [.·…\s]+ <page>` or `<page> <title>`. Levels come from markers
   (`الوحدة|Unit` → unit, `الفصل` → chapter, `الدرس|Lesson|\d+-\d+` → lesson)
   and indentation. When the TOC page is `untrusted`, the TOC is read by
   vision instead (`method: vision`). Each entry is aligned to iEN nodes by
   trigram Jaccard on repaired, `lam_order_fold`ed text (≥ 0.6 match,
   0.4–0.6 `needs_review`). A lesson's range runs from
   its printed start to the next entry's start − 1 (the last one to the
   unit's end or the back matter). Ranges are converted to PDF pages with the
   offset.
5. **Term evidence:** PDF pages 1–3 (repaired text, or vision when
   untrusted) are searched with the strict regex
   `الفصل\s+الدراسي\s+(الأول|الثاني|الثالث)` and `(First|Second) (Term|Semester)`;
   «الفصل الثاني» without «الدراسي» is a chapter and never matches. Also the
   listing title, TOC markers, the plan guide, course codes and owner
   decisions, each with its own `method` (§2.4). Part numbers and edition
   lines are recorded (§2.4 `part`, `year_label`) but are not term evidence.
   A third-term match is kept verbatim as `needs_review` (possibly an older
   edition). Expected result on current data: very few `verified` hits.
6. **Outputs:** `extraction.jsonl`, `term-evidence.jsonl`, `toc/`,
   `page-maps/`, `exercise-index/` (repo); `content-cache/extract/<resource>/pages.jsonl`
   (cache only, §3).

### 4.3 Question generation contract

Workers are Claude subagents. Each works on one **packet** built by
`scripts/content/make-packets.mjs` (WP4) into `content-cache/packets/<run>/`:

```json
{ "packet_id": "run-20260927-gen-01:middle/grade-1/math/n4318",
  "lesson": { "id": "…/n4318", "title_ar": "…", "unit": "…", "subject": "الرياضيات", "grade": "الصف الأول المتوسط",
              "term": "t1", "language": "ar" },
  "objectives": [{ "id": "obj-…", "text_ar": "…" }],
  "pages": [{ "pdf_page": 14, "printed_page": 12, "kind": "lesson", "text": "…",
              "text_method": "text", "text_quality": "repaired",
              "image": "C:/jazira/content-cache/ien/pages/<stem>/p014.jpg" }],
  "exercises": [{ "pdf_page": 15, "label": "تدرب 3", "kind": "exercise" }],
  "target": { "count": 15, "types": { "mcq": 8, "true_false": 2, "numeric": 3, "matching": 1, "ordering": 1 },
              "difficulty": { "1": 2, "2": 4, "3": 5, "4": 3, "5": 1 } },
  "existing": [{ "id": "q-…", "stem_norm_digest": "…" }],
  "rules_version": "generate.v1" }
```

**Page images.** Every packet page carries `image` (a cache path rendered by
`pdf-render.mjs`) next to its text; the subagent reads the image whenever
`text_quality ≠ ok` or the page has equations, figures or tables, and the
image wins over the text layer. Validation packets (§4.4) carry the same
images. Images and transcripts stay in the cache and in Claude sessions run
by this project; they are never copied into the repo and never sent to
ChatGPT or Gemini.

**Output:** JSONL of `question@1` candidates (the generator fills content,
`source.*` pages and evidence, `objective_id`, `provenance.origin`,
`difficulty`, `item_style`, `computation`); ids, hashes, curriculum fields,
term, status and timestamps are assigned by
`scripts/content/ingest-candidates.mjs`, which rejects anything else the
generator sets.

**Required:** every item is answerable from the packet pages alone (the
lesson's facts, examples and exercises); page refs point to the supporting
pages; exactly one defensible answer; explanation with steps for math, the
concept for science, the reason for language items and the strategy for
aptitude; the explanation must agree with the source; distractors are
plausible and each reflects a named misconception; the text follows the
lesson's language and Saudi curriculum terminology; Western digits (bank
convention) unless the lesson uses Arabic-Indic digits throughout; `؟` in
Arabic stems.

**Forbidden** (checked in §4.4): copying textbook sentences beyond short
quotes (P004: char-5-gram containment on repaired text or the vision
transcript, roughly a 12-word run, fails unless the item's evidence has `quote_kind` `quran`, `hadith`,
`poetry` or `definition` with a ≤ 200-char quote); reproducing textbook
exercises verbatim (numbers or context must change: then `transformed`);
labels such as "official", «وزاري», «من اختبارات الوزارة», «قياس»; figure-dependent
items («في الشكل المجاور», "in the figure") unless the stimulus renders the
data as text (no media in v1); a figure- or table-derived stimulus that
copies more than 12 cells verbatim from the book, or keeps the book's data
unchanged (it must be `transformed`: new values, same skill); content not in
the packet; iEN question-bank content; naming any AI system;
`all of the above` combined with `none of the above`.

**Rewrite variants** (the requested "different context" and "different
representation" variants): a packet may carry `rewrite_of: [question ids]`.
The generator writes a new item with `variant: {kind: rewrite, of, change}`
that keeps the parent's objective, difficulty and solution method; the
validator checks all three (check `V001`). Dedup treats a declared rewrite
as a member of the parent's exclusion component instead of rejecting it as
NEAR (§4.5), and reports count it as a variant, not a canonical question.

Prompts are versioned files: `scripts/content/prompts/generate.v1.md`,
`repair.v1.md`, `vision-transcribe.v1.md`. A repaired item is a new revision
and is fully re-validated. Pilot scope before scaling: middle/grade-1 math
(84 iEN lessons), science and Arabic (lesson counts taken from
`lessons.jsonl` and stated in the run manifest), to confirm the yield and
error rates.

### 4.3b Aptitude and achievement items

- **Aptitude** (`scope: aptitude`, Qudurat-style): no textbook source, so
  `provenance.origin = generated_practice`, `source = null`, and the
  `support` check is `not_checked`. Instead every item needs a **100 % blind
  solve by two systems** (the primary Claude validator and the ChatGPT
  blind solver), both agreeing with the key, and an explanation that states
  the reasoning strategy. Packets are topic-based:
  `{ prep: {exam, section, topic}, topic_description, target, existing }`
  from `src/lib/exams/catalog.js`. Pattern and logic categories stay a known
  gap (§10).
- **Achievement** (`scope: achievement`, Tahsili-style): items are
  high-school lesson items (ordinary curriculum packets) aligned to `prep:`
  topics through `data/staging/curriculum/prep-alignment.jsonl`
  (`prep-alignment@1`: `{prep_topic, node_id, source_url, retrieved_at, status}`).
  The alignment is built only from a publicly retrievable Qiyas
  specification with provenance; without one, rows are `needs_review` and
  no `links` to `prep:` topics are created.
- **Analytics:** `learner_node_stats` also covers `prep:` topic nodes (the
  node id is the `prep:` scope string), so prep error analysis and weak-area
  recommendations have a data path. Prep templates (`mock`, `timed` with a
  `prep:` scope) are in the Session-1 scope only on the PGlite/runtime path
  (§9.3).

### 4.4 Validation

**Stage 1 — deterministic** (`scripts/content/check-questions.mjs`, WP4,
Appendix B): schema, ids, references, options, answers, numeric
recomputation (`computation` evaluated with the exact rational evaluator of
§4.6 and compared with the key), units, Arabic/English script sanity,
forbidden labels, verbatim overlap (needs the page cache), **evidence quotes
found on the cited page (E001)**, figure references, length limits and the
exact-duplicate hash. `fail` → `rejected` (or one repair round); `warn` is
recorded. P004 and E001 run on the repaired text or, for vision pages, on
the vision transcript; a page with neither (`untrusted` and not yet
transcribed) gives `not_checked` → the item is `review_required`.

**Stage 2 — primary validator** (a Claude subagent that did not generate the
item; prompt `validate.v1.md`), in three steps:
(1) **blind solve**: it gets stem, stimulus and options without the key and
records `blind_answer`;
(2) it gets the key and the packet pages **with their page images** and
judges `support`, `ambiguity`, objective alignment, explanation
correctness, difficulty and language;
(3) it emits a `validation-record@1` line.

For **high-risk** items an independent **evidence extractor** subagent,
which never sees the question, is given the item's objective and cited
pages and returns the supporting span; `support` requires its span to
overlap the generator's evidence.

**High-risk** = any of: `numeric` type or `item_style = computation`;
`source_derived` items whose answer contains a number or a date;
`quote_kind ∈ {quran, hadith}` or Islamic-studies subjects; difficulty ≥ 4;
any Stage 1 `warn`; any aptitude item.

**Roles** (the requirement's Agents 1–4):

| Requirement role | Implemented by |
|---|---|
| Agent 1 — discovery, curriculum changes | `ien-crawl` + change diff (§4.1), `pdf-frontmatter`, Claude vision reads of covers/TOC |
| Agent 2 — extraction (pages, TOC, exercises) | `extract-pdf`, `pdf-render`, Claude vision transcription, exercise index |
| Agent 3 — generation | Claude generator subagents (§4.3) |
| Agent 4 — validation | deterministic checks + Claude primary validator + Claude evidence extractor + ChatGPT blind solver + Gemini language reviewer; DeepSeek unavailable |

The generator and the primary validator are the same model family, so their
errors can correlate; the ChatGPT blind solve is the independent check and
is therefore mandatory for every high-risk item. Page content (text, images,
transcripts) never goes to ChatGPT or Gemini: it is copyrighted and the
project may not redistribute it (§1.3); they receive only Jazira-authored
item text.

**Stage 3 — cross-AI** through the user's signed-in browser sessions. These
systems exchange JSONL files, not conversation; they are driven only as the
user directs.

| Agent | Role | What it receives | Sample |
|---|---|---|---|
| ChatGPT (web) | **Blind re-solver** | `{id, language, stem, stimulus, options / input spec}`, no key, no textbook text | **pilot: 100 %** of items, to measure disagreement; after the pilot: 100 % of high-risk items, plus the rate fixed from the pilot's measured disagreement (floor 20 % in STEM subjects, 10 % elsewhere), recorded in the run manifest |
| Gemini (web) | **Language and ambiguity reviewer** (Arabic and English) | item with its key and explanation, no textbook text | all items with an `L*` warning, all `en` items, 10 % per subject of the rest |
| Claude subagents | generation, vision transcription, evidence extraction, primary validation | packets with page text and images (cache only) | 100 % |
| DeepSeek | unavailable (not signed in; no login is performed) | — | recorded as `unavailable` in each run manifest |

**Procedure and cadence.** The exchange is driven through the user's own
Chrome session with the browser tools, one batch file per conversation: open
a new chat, paste the prompt file, paste the request batch (≤ 25 items),
wait for the reply, save it verbatim as the `.response.jsonl`, then
`exchange import`. If the site asks for login, a CAPTCHA or shows a usage
limit, the run stops and records it; nothing is bypassed. Budget: about 20
batches (≈ 500 items) per system per day, measured and recorded in the run
manifest; the projection in §9.3 uses the measured rate.

Exchange (`scripts/content/exchange.mjs`, WP4):
`export --agent chatgpt --run <id>` writes
`validation/exchange/<run>/chatgpt-<nnn>.request.jsonl` (≤ 25 items per batch;
the first line is `{"_batch":{run, agent, prompt_version, count, sha256}}`).
The prompt file (`chatgpt-resolve.v1.md` / `gemini-language.v1.md`) demands
one JSON object per line: ChatGPT
`{id, answer: <response per §2.8>, confidence: 0..1, method ≤ 300 chars}`;
Gemini `{id, verdict: pass|warn|fail, issues:[{code, span, suggestion}]}`.
`import --file …response.jsonl` validates each line (ids must belong to the
batch, JSON only, no extra ids) and converts it to validation records.
Sampling uses the seeded selection of §5.2 with the run seed stored in the
run manifest, so the sample is reproducible and reported exactly.

**Resolution** (`scripts/content/resolve-validation.mjs`, WP4):

| Situation | Result |
|---|---|
| any deterministic `fail` | `rejected` (or one repair round → new revision) |
| primary `blind_answer` ≠ key, or resolver answer ≠ key, or resolver ≠ primary | `review_required` (never auto-pick) |
| `support = unsupported` for `source_derived` / `transformed` | `review_required` |
| `ambiguity = ambiguous` | `review_required` |
| language reviewer `fail` | `review_required`; `warn` → recorded, fix by repair revision |
| deterministic pass + primary pass (+ resolver agrees when sampled) | `validated` (`validation.status = validated`) |
| legacy 300 | Stage 1, Stage 2 and a ChatGPT blind solve on all 300. Agreement → `validated`; any disagreement → `review_required` and excluded from **template** pools (`status ≠ published`), while the frozen legacy RPCs keep serving `is_active` rows unchanged. Reported in their own section. |
| aptitude item | both blind solves agree with the key, else `review_required` (§4.3b) |
| rewrite variant | `V001` fails (objective, difficulty or method changed) → `review_required` |

Human review: `review-queue.jsonl` (item, conflicting records) →
`review-decisions.jsonl` `{question_id, revision, decision: accept_key | set_key | reject | repair, answer?, reviewer, decided_at, note}`.
A decision is itself a `human` validation record.

### 4.5 Deduplication (`scripts/content/dedup.mjs`, WP5)

1. **Normalize** (`normalizeForDedup`): superscript digits → `^n` (`x²` →
   `x^2`, `5³` → `5^3`) and vulgar fractions → `n/d` (`½` → `1/2`) **before**
   NFKC, so `x²` never becomes `x2` and `5²` never `52` → NFKC → `lam_order_fold` → strip tashkeel (U+064B–065F,
   U+0670, U+06D6–06ED) and tatweel → fold أ إ آ ٱ → ا, ى ئ ی → ي, ؤ → و, ة → ه,
   ک → ك → Arabic-Indic and Persian digits → 0–9, `٫` → `.`, drop `٬` →
   U+2212 → `-`, `×` → `*`, `÷` → `/`, `٪` → `%` → lowercase Latin → strip bidi
   and zero-width characters → collapse whitespace.
2. **Tokens:** split on whitespace and punctuation, but keep numbers
   (including decimals and fractions), operators `+ - * / = < > ^ %` and Latin
   variables as tokens. Prefix stripping only for `ال وال بال فال كال لل`
   followed by ≥ 3 letters, and never for words in a stoplist of
   letter-initial words (`كالسيوم`, `بالون`, `فالح`, `لله` …, WP5 fixture).
   In the masked math form, commutative `a op b` (`+`, `*`, `×`) operands are
   sorted, so `8 × 7` and `7 × 8` are equal.
3. **Exact:** `sha256(type | normalize(stem) | normalize(stimulus) | sorted normalized options | answer)` equal → `EXACT_DUPLICATE`.
4. **Candidates and similarity:**
   - Shingles: stems of ≥ 10 tokens use word 1+2-shingles; shorter stems
     (typical: 5–8 tokens) use word 1+2-shingles **plus** character 4-grams.
     `J(∅, ∅)` is defined as exact-string equality of the normalized stems
     (1 or 0), never 0/0.
   - **Within a lesson and within a resource-page group** all pairs are
     compared exhaustively (n is small).
   - **Across lessons** only, MinHash with 128 MurmurHash3-x86-32 functions
     (seeds 1..128) and LSH 32 bands × 3 rows (recall ≈ 0.88 at J = 0.40,
     ≈ 0.997 at J = 0.55, the lowest cross-lesson threshold), candidates
     verified with exact Jaccard. The lesson-scoped RELATED rule never
     depends on LSH.
   - The thresholds below are **calibrated** in WP5 on a labelled pair set
     (`tests/fixtures/content/dedup-pairs.json`, ≥ 200 pairs from the legacy
     bank and pilot fixtures); the test pins precision and recall.
5. **Instruction stems:** a normalized stem that occurs in 5 or more items
   («اختر الكلمة المختلفة…») is compared on stem + options shingles instead of
   the stem alone.
6. **Classes:**
   - `NEAR_DUPLICATE`: stem J ≥ 0.80 and (option-set J ≥ 0.60 or the same
     normalized answer), or whole-item J ≥ 0.85.
   - `RELATED`:
     - stem J ≥ 0.55;
     - or same lesson + same answer + stem J ≥ 0.40;
     - or same resource pages + same answer;
     - or `numeric_variant`: token sequences equal once numbers are masked,
       but the numbers differ. This is a different problem, not a duplicate.
   - `UNIQUE`: everything else.

   Pairs in the 0.55–0.80 band can be sent to a Claude subagent for semantic
   adjudication (`signals: semantic_judged`).
7. **Clusters:** union-find over EXACT and NEAR edges (declared rewrite
   variants excluded). The canonical member is chosen by
   `published > validated`, then origin priority `source_derived >
   transformed > generated_practice > internal_authored`, then more validation
   evidence, then earliest `created_at`, then id. Other EXACT/NEAR members →
   `rejected` with `duplicate_of`.

   **Exclusion components.** Exclusions are explicit **conflict edges**:
   RELATED pairs (except `numeric_variant` alone, which creates no edge),
   `member_of` edges from template variants to their template id, and
   `member_of` edges from declared rewrites to their parent. Components are
   the connected components of this graph, with a **size cap K = 8**: a
   larger component is split by source pages (then by stem similarity) into
   pieces ≤ K, dropping the weakest cut edges, and is listed in
   `reports/duplicates.md`. The template-variant component alone is exempt
   from the cap (its size is `max_variants`). `dedup.exclusion_group` stores
   the component id (`xg-<hex10>` of its sorted member ids). The combinatorics
   (§5.6) use the component sizes. A WP5 test asserts that no component
   exceeds K on the fixtures.
8. Dedup runs over the whole bank (all shards plus legacy) and again inside
   the importer (§6.3) as a safety net on `content_hash`.

### 4.6 Variants (`src/lib/content/expr.js` (WP1), `templates.js`, `scripts/content/build-variants.mjs`, WP5)

- **Expression grammar** (no `eval`): numbers, identifiers,
  `+ - * / ^` (integer exponents), parentheses, `% == != < <= > >= && || !`,
  and the functions `abs, min, max, gcd, lcm, floor, ceil, round(x,d),
  sqrt` (exact perfect squares only; otherwise an error) and `frac(n,d)`.
  Arithmetic uses exact rationals (BigInt numerator/denominator). Formats:
  `int`, `decimal:<d>`, `fraction`, `mixed`.
- **Sampling:** sfc32 seeded from `sha256(template_id + "|" + revision)`.
  Rejection sampling (≤ 1000 tries per variant) under `constraints`. Parameter
  tuples are unique. At most `max_variants` (default 12, cap 50). The same
  input always yields the same variants.
- **Verification per variant (code):**
  - the answer evaluates;
  - distractors evaluate, are distinct from the answer and from each other
    after formatting, and satisfy any sign or integer constraints;
  - the stem and explanation have no unfilled `{…}`;
  - the explanation shows the computed answer;
  - `evaluate(answer)` agrees between the rational evaluator and an
    independent float re-evaluation (|Δ| < 1e-9).

  A failing tuple is skipped and counted.
- **Validation:** the template itself goes through Stages 1–3 on 3
  instantiations. Its variants inherit `validated` only if every code check
  passes. The template's validation record ids are copied into the variant's
  `validation.record_ids`.
- **Pipeline** (all deterministic except the author):
  1. an author subagent (`prompts/template.v1.md`) writes draft lines for a
     lesson's computational skills (0–3 per lesson, only skills the pages
     teach) and self-checks them with `ingest-templates.mjs --dry-run`, which
     prints the three previews with the key marked;
  2. `ingest-templates.mjs --run <var run>` assigns the id (§2.2
     `mintTemplateId`), source (the lesson's resource and page span, no
     quotes), provenance (`generated_practice`; `license_status` = the cited
     resource's, as P001 requires), status `candidate`; it rejects any other
     field (S005), a failing `checkTemplate` (T001), fewer than 3 passing
     previews (T002) and exact repeats (D001). Previews are drawn after the
     id exists, because variants are seeded by it;
  3. `build-variants.mjs` materializes every variant as `candidate`;
  4. variants 01–03 (the previews) run through check-questions,
     make-packets/validate, the exchange and resolve like any item;
  5. `promote-templates.mjs` sets the template `validated` when all three
     previews are `validated` (record ids copied), `review_required` when
     any preview is rejected or in review, and leaves it alone otherwise;
  6. `build-variants.mjs` again: the variants of a validated template
     inherit `validated`.
- Variants keep the template's lesson, objective, difficulty and solution
  method, with `provenance.origin = generated_practice` and a `member_of`
  edge to the template id (their `exclusion_group` is the component id,
  §4.5 step 7).
- **Rewrite variants** (§4.3) are the path for different contexts and
  representations; they are generated and validated like ordinary items,
  plus `V001`.

---

## 5. Exam engine

### 5.1 Where it runs

- **Signed in + DB available:** PL/pgSQL (`start_template_attempt`, §6.2).
- **Guest, or DB unavailable:** the JS engine in `src/lib/exams/engine/*`
  (server only) behind `/api/exams/session/*`, over the runtime bank (§5.8)
  or the DB's service-role pool RPCs when the service key exists.

Both implement the same algorithm, and a conformance fixture
(`tests/fixtures/engine/*.json`, WP6) must give identical selections in JS
(WP6 tests) and SQL (WP7 tests).

### 5.2 Randomness: SHA-256 counter-mode keys (HASH-CTR)

- `seed` = 128 random bits from `crypto.randomBytes` (JS) or
  `gen_random_uuid()` bytes (SQL), written as 32 lowercase hex characters and
  stored on the session. The seed is **always server-generated**; `/start`
  and `start_template_attempt` reject any client-supplied `seed`. A retake
  always gets a new seed (and reuses the stored allocation, §5.3).
- `u(tag, key) = int(first 13 hex chars of SHA-256(UTF-8(seed + ":" + tag + ":" + key)))`,
  a 52-bit integer (exact in JS doubles and in SQL `bigint`). SQL:
  `('x' || substr(encode(sha256(convert_to(v_seed||':'||p_tag||':'||k,'UTF8')),'hex'),1,13))::bit(52)::bigint`
  (built-in `sha256`, PG ≥ 11; no extension needed).
- All draws are keyed lookups, not sequential PRNG state, so the order of
  evaluation cannot change the result. Ties are broken by key in `C`
  collation.
- Tags: `sel` (selection within a cell), `strat` (random stratum subset),
  `tie` (largest-remainder ties), `ord` (question order), `opt:<key>`
  (option order), `grp` (variant representative).
- Offline bulk generation (variants) uses **sfc32**. Weighted choice is used
  only at the integer allocation level; there is no floating-point `pow` or
  `log`, so JS and SQL agree bit for bit.

### 5.3 Selection

**Inputs:**
- the template;
- the scope;
- the requested count `n`, clamped to the template's and tier's limits.
  **Tier clamping:** `n = min(requested, template max, tier max)`. If the
  tier max is below the template's `count.min` (free `exam` quota: 25;
  `full-year` min 30), the template is offered to that tier as a **mini**
  version (`count.mini`, e.g. full-year 25, term-exam 20, mock 25) that is
  labelled "mini" in the UI and in the result, with the same coverage rules;
  a template without `count.mini` is shown as premium-only, and the UI says
  so. Engine and DB tests cover every template × tier;
- the viewer's entitlement: `is_premium` items are removed from the pool for
  guests and for users without `has_premium` (in JS and in `_ce_pool`);
- the learner history `H`: for each seen question `last_seen_at`, and for
  `weakness`, the wrong items.

**Steps:**

1. **Eligible lessons.** Resolve the scope to lesson nodes:
   - a lesson → itself;
   - a unit or chapter → descendant lessons;
   - a subject → all its lessons;
   - `@t1` / `@t2` → lessons with that term and `term_status ∈ {verified, inferred}`;
   - `@year` → lessons of both terms;
   - `prep:` → the items tagged with that exam, section and topic.

   **Scope size caps:** guests may use subject-level or narrower scopes
   (plus `prep:<exam>/<section>`); "any node" templates (`practice`, `timed`,
   `random-practice`) reject stage and grade scopes for guests, and for
   everyone above 5,000 eligible items (`scope_too_large`). `weak:` without a
   node is resolved to the learner's ≤ 20 weakest lessons first.

   Lessons with `status ≠ verified` and unit openers are excluded.
   Term-`needs_review` lessons are excluded from term exams and included in
   subject and full-year exams.
2. **Pool.** Published items whose primary or aligned link is an eligible
   lesson, restricted to the template's `types`. Each exclusion group
   contributes one **representative**: the member with the smallest
   `u("grp", group + ":" + key)` among the unseen members, or among all
   members if every member has been seen.
3. **Cells.** Stratum (per `coverage.stratify_by`: objective, lesson,
   chapter, unit or topic; full-year uses `(term, unit)`) × band (1, 2, 3).
   `cap_unseen(c)` and `cap_seen(c)` count the representatives. An item is
   seen if it is in the last `avoid_last_attempts` attempts on the same
   template kind and a scope that overlaps this one, or was seen within
   `avoid_days`. Guests echo back the sealed seen list `/start` issued
   (`s1.` blob, ≤ 300 keys, most recent last, §5.8); the server opens it.
4. **Band targets.** `t_b = largest_remainder(n, mix)`, where mix is
   integer percentages.
   **Retake:** when `retake_of` is set, steps 4–7 are skipped and the
   stored `meta.allocation` (per-cell quotas) of the original attempt is
   reused, capped by current capacity; only step 8 picks new items,
   avoiding those seen. This keeps the objective distribution of a retake
   identical (tested).
5. **Coverage pre-pass** (`min_per_stratum = 1`):
   - Let S be the strata with any capacity.
   - If `n ≥ |S|`, each stratum gets 1 item. If `n < |S|`, only the `n`
     strata with the smallest `u("strat", stratum)` get 1 item each.
   - The item goes into the stratum's band with the largest remaining
     `t_b − assigned_b` among the bands where it has capacity. Ties go to
     medium, then easy, then hard.
6. **Proportional pass.**
   - The remaining `n'` is allocated over cells. The weight of a cell is
     `w_stratum × mix_b`, where `w_stratum` is 1 (equal), the lesson count,
     the pool size or the error rate × 1000 (rounded).
   - Largest remainder: `floor(n'·w/W)`, then the leftover goes one each to
     the largest `(n'·w) mod W`. Ties go to the smallest `u("tie", cell)`,
     then to the cell id.
   - Each cell is capped at its unseen capacity. Any excess is redistributed
     by the same method over the uncapped cells until it is placed or no
     capacity is left.
7. **Reuse pass.** If the unseen capacity is too small and
   `retry.allow_reuse`, the shortfall is allocated with the same method over
   the seen capacity, up to `ceil(n·max_reuse_share/100)` items. If items are
   still missing:
   - the session has fewer items, as long as it keeps `count.min` or more,
     and the payload says `reused`/`short`;
   - otherwise → `insufficient_pool {available, required}`.
8. **Pick.** In each cell, sort the representatives by
   `(seen_rank, u("sel", key), key)`. Here `seen_rank` is 0 for unseen items,
   and for seen items 1 + their rank by `last_seen_at` ascending (the oldest
   seen comes first). Take the quota.

   `weakness-review` inverts the preference: previously wrong items whose
   last sight is more than 24 h ago come first.
9. **Order.** Sort by `u("ord", key)`. With `shuffle_keep_stimulus`, the
   items of one stimulus become a block, placed at the position of its
   smallest member, in source order. `by_stratum` keeps strata contiguous.
10. **Duplicates.** One item per exclusion group, and a key appears at most
    once (enforced again by `unique (attempt_id, question_id)`).

### 5.4 Safe option shuffling

Options are permuted only when `shuffle_options = true` and none of these
applies:
- `true_false`;
- any `fixed_order_reason`;
- an option that matches the "all/none of the above" or combined-option
  patterns: كل ما سبق، جميع ما سبق، جميع الإجابات، لا شيء مما سبق، ليس مما سبق، (أ) و(ب)،
  all of the above, none of the above, both a and b;
- all options numeric: these are shown in ascending numeric order, which is
  also deterministic;
- an ordered scale;
- the legacy `comparison` and `contextual-error` topics.

Validator check `O004` sets `fixed_order_reason` whenever a pattern matches,
so the rule is also enforced in data.

How the permutation is applied:
- The permutation sorts the option ids by `u("opt:" + key, option_id)`.
- For `matching`, both columns are permuted (`u("optl:"+key, id)`,
  `u("optr:"+key, id)`), stored in `display_map.left` / `display_map.right`.
- For `ordering`, items are shown sorted by `u`, stored in
  `display_map.items`. There is **no** swap rule: display maps depend on the
  seed, the key and the public ids only, never on the answer. (The removed
  rule swapped the first two items when the shuffle equalled the answer
  order; that made the answer the one arrangement never shown, so collecting
  displays of an item leaked it. A shown order may now equal the answer with
  probability 1/n!, like a guess.)
- `choice_order[display] = canonical` (mcq/true_false). For every type the
  client receives options, columns and items **without ids**, only display
  indexes, and sends only display indexes (`{option_index}`,
  `{pairs:[[li, ri]]}`, `{order:[i…]}`). The server maps them to canonical
  ids before storing, and back to display in results. WP6 and WP7 attack
  tests assert that no canonical id reaches the client before the result. Explanations never refer to options by letter (the bank
  convention, checked by `O008`).

### 5.5 Scoring

Per item, `score ∈ [0, 1]` per §2.8. `correct_count` = items with score 1.
`score_percent = round(100 × Σscore / question_count, 2)`. Unanswered = 0. No
negative marking. XP = 2 × correct_count under the existing 300/day cap. The
pass threshold is display-only.

### 5.6 How many unique sessions (computed, not guessed)

`scripts/content/report.mjs --exams` (WP10) calls
`src/lib/exams/engine/combinatorics.js` (WP6) for every template × eligible
scope and writes `exams/blueprints/*.jsonl` and `reports/exam-templates.md`:

- **Allocation.** Run the §5.3 allocation for a fresh learner (no history)
  with the template's default count. It is deterministic given the pool,
  except for the stratum subset and tie-breaks. When `n < |S|`, the result is
  labelled a **lower bound**, and the count is the allocation for seed `0…0`.
- **Headline next to every set count:** the pool size (published items and
  exclusion components) and **attempts before forced reuse**.
- **Distinct question sets**, two figures:
  - *by component* (`g_j = 1` for every component): sets that differ in
    which problems are asked;
  - *with variants* (`g_j` = component size): also counts sets that differ
    only in numeric parameters or rewrites.

  `sets = Π_cells e_{n_c}(g_1 … g_m)`, where `e_k` is the elementary
  symmetric polynomial:
  `e[0]=1; for g: for j=k..1: e[j] += e[j−1]·g` (BigInt). It is reported
  exactly and as log10. When the coverage pre-pass picks a stratum subset,
  the subsets multiply in by `C(|S|, n)` only when each subset admits the same
  allocation; otherwise the conservative single-allocation value is kept.
- **Attempts before forced reuse:** `min_c floor(groups_c / n_c)`.
- **Display permutations** (a separate table, labelled as display orders of
  the same questions, never as "exams" or "questions"):
  `n!` (stimulus blocks count as one unit) × `Π k_i!` over the shuffleable
  items, per set.
- **Example** (illustrative only, not a claim about current data): a lesson
  pool of 20 items (8 easy, 8 medium, 4 hard) and a 10-question lesson quiz
  at 40/40/20 → allocation 4/4/2 → `C(8,4)·C(8,4)·C(4,2) = 70·70·6 = 29,400`
  distinct sets, and 2 attempts before reuse.
- Figures are reported **per template × scope only**. Sums across templates
  or across overlapping scopes (subject vs `subject@t1`, unit vs chapter) are
  forbidden, and the report test asserts no such total exists. Each figure is
  labelled as **possible configurations** over N published questions and M
  variants.

### 5.7 Session lifecycle and APIs

**State machine:** `in_progress` → `submitted` (user) | `expired` (deadline +
30 s grace passed; late answers ignored, graded as-is) | `abandoned` (the user
abandons; untimed sessions after 7 days). `get` on an overdue session
finalizes it first (lazy expiry, as today).

| Action | Signed in (DB RPC, §6.2) | Guest (route, §5.8) |
|---|---|---|
| start | `start_template_attempt(p_template, p_scope, p_count, p_timing, p_feedback, p_retake_of)` | `POST /api/exams/session/start` |
| save / answer / flag | `save_exam_response(p_attempt, p_position, p_response, p_time_spent, p_flagged)` (legacy `save_exam_answer` still works for mcq) | client-side only (`sessionStorage` + `localStorage` draft keyed by sid) |
| immediate check | `check_exam_item(p_attempt, p_position)`: grades and locks one item | `POST /api/exams/session/check` |
| resume | `get_exam_attempt(p_attempt)` (same signature, richer payload) | same browser: the stored token + drafts, until the deadline |
| submit / auto-submit | `submit_exam_attempt(p_attempt, p_answers)` (same signature; answers may carry `response`) | `POST /api/exams/session/submit` |
| abandon | `abandon_exam_attempt(p_attempt)` | discard locally |
| history | `list_exam_attempts_v2(p_limit, p_before, p_before_id)` | none (a notice says local results are not saved) |
| analytics | `get_learning_stats(p_node)`, `get_practice_recommendations(p_limit)` | per-browser summary of local results |

**Payload minimization.** The client receives only the current session's
questions:
- `{position, key, type, language, stem, stimulus?, options[{index, text}]`
  in display order, `public` (matching columns / ordering items / numeric
  unit and input rules / short-answer max chars), `time_limit_seconds`,
  `lesson {id, title}}`. For guests `key` is the per-session opaque handle
  `h-…` (§5.8), never the canonical question key, in `/start` and `/submit`
  alike;
- no answer, explanation, objective, source pages, provenance or hashes;
- timing: `started_at`, `expires_at`, `server_now`, `seconds_remaining`.

The result adds, per item:
- `verdict: correct | incorrect | partial | unanswered`, `score`;
- the response and the correct response (display-mapped);
- `explanation {text, steps}`, `objective {text}`;
- `lesson {id, title, href}`;
- `source {resource title, printed pages, link-out}` when the item has one.

It also carries `by_lesson`, `by_band`, `by_term` (full-year) and `by_topic`
(prep).

**Errors** (new; P0001 codes and HTTP `{error}`): `template_not_found`,
`scope_not_found`, `insufficient_pool {available, required}`,
`feedback_not_allowed`, `invalid_response {position, reason}` (reasons
include `ambiguous_separator`), `item_locked` (409 for guests: another
response was already checked at that position), `scope_too_large`,
`seed_not_allowed`, `not_found` (e.g. a `retake_of` that is not the
caller's), `key_reveal_limit` (a result flag, not a failure),
`rate_limited` (429; also past the per-IP daily grading cap),
`token_invalid`, `token_expired`, `bank_changed`. They are added to
`EXAM_ERROR_CODES` and to DATA_API.md.

### 5.8 Server authority for guests and for signed-in users

**Guests (stateless):**
- **Token v2** (`src/lib/exams/engine/session-token.js`):
  `base64url(header JSON).base64url(HMAC-SHA256(k_v2, headerB64))`.
  The clear header is `{v:2, sid, tpl, tv, sc, iat, dl (deadline ms),
  g (grace s), fb, tm, lim, al?, x}`; `x` is
  `AES-256-GCM(k_enc, iv, aad = "jz.exam.v2|" + sid)` of `{sd (seed),
  q:[question keys], r:[revision int of each item]}`, stored as
  `base64url(iv | ciphertext | tag)`. The browser can read the header but
  **never the question list or the seed**; the AAD binds the sealed part to
  its session id, so it cannot be moved into another token. Nothing in the
  token is derived from an answer (no `content_hash`, which includes the
  answer and could be brute-forced against the few candidate responses).
  Maximum size 16 KiB. Constant-time signature check, then decryption.
- **Opaque handles:** towards the browser an item is named only by
  `itemHandle(sid, key) = "h-" + base64url(HMAC(k_handle, sid|key))[0..16)`:
  per session (the same item has another handle in another session) and
  keyed, so it cannot be computed from or tested against a canonical key.
  `/start` and `/submit` return handles in `key`; `/check` addresses items by
  `position`. Canonical ids are answer-free anyway (`questionIdMaterial`,
  §2.2), but they are not exposed.
- **Sealed seen list:** `/start` returns `seen = "s1." +
  base64url(iv | AES-256-GCM(k_seen, deflate(JSON [keys…])) | tag)`
  (aad `"jz.exam.seen.v1"`, ≤ 300 keys, ≤ 12 KiB) and the browser echoes it
  on the next `/start`. A blob that does not open (forged, truncated, another
  secret) is ignored: it only steers selection and grants nothing. A retake
  adds the original session's keys server-side.
- **Keys:** `k_v2`, `k_enc`, `k_handle`, `k_seen`, `k_receipt` =
  `HKDF-SHA256(secret, salt = "", info = "jz.exam.v2" | "jz.exam.v2.enc" |
  "jz.exam.handle" | "jz.exam.seen" | "jz.exam.receipt")`;
  v1 keeps its current key unchanged (so live v1 tokens keep verifying), and
  since no v2 key equals the v1 key, a v1 token never verifies as v2 and vice
  versa (tested both ways). With `LOCAL_EXAM_SECRET_PREVIOUS`, every key is
  also derived from the previous secret for verification and decryption;
  new tokens, blobs and receipts use the current one.
- **Secret:** `LOCAL_EXAM_SECRET`. Today it is **not set** on Vercel and
  `main` auto-deploys, so a hard requirement would take live practice down.
  Behaviour:
  - default (flag off): if the variable is missing in production, log a
    warning once per instance and derive the secret from the first existing
    server-only secret (`SUPABASE_SERVICE_ROLE_KEY`, then
    `LEMONSQUEEZY_WEBHOOK_SECRET`, then `GEMINI_API_KEY`) with
    `HKDF(…, info = "jz.exam.fallback")`: stable across instances, never a
    per-process key (the per-process key remains for local dev only). v1
    keeps its current derivation order and its ≥ 16-char minimum (warning
    below 32), so existing tokens keep verifying;
  - `EXAM_SECRET_REQUIRED=1`: the variable (≥ 32 chars for v2) is mandatory
    and routes answer `503 {error:"unavailable"}` without it. The owner turns
    the flag on after setting the variable;
  - `LOCAL_EXAM_SECRET_PREVIOUS` is accepted for verification during
    rotation;
  - a pre-merge check (`scripts/check-env-contract.mjs`, WP6) fails when
    the flag is on and the variable is missing in the target environment's
    `.env` listing.
- **Deadline:**
  - `/submit` grades against the server clock:
    - `now ≤ dl + g`: graded as submitted;
    - later: `status: expired`, answers ignored (receipted positions keep
      their checked score), as in DB mode;
    - more than a day after `dl + g`: `410 token_expired`.
  - `/check` refuses after `dl + g`.
  - Untimed sessions have `dl = iat + 7 days` (same as DB sessions, §2.13).
- **Answer keys:**
  - `/start` never returns keys.
  - `/check` returns one item's key, and only for `fb: immediate` templates.
    It also returns a signed **receipt** `{sid, pos, resp_hash, score}`
    (HMAC with the receipt key); `/submit` requires the receipts back and,
    for each receipted position, takes the score from the receipt and
    ignores any submitted response for it. In an immediate-feedback
    session a position without a receipt is graded as unanswered, so
    dropping receipts never gains score.
  - **Server-side check lock** (`src/lib/exams/engine/check-lock.js`): the
    first checked response of each (session, position) is recorded by
    `ce_guest_check_lock(p_sid, p_position, p_resp_hash, p_expires_at)` in
    `ce_guest_check_locks` (0014, service role only; rows live until the
    session's `dl + g`, capped at 8 days, with opportunistic cleanup). The
    result is `first` (now locked), `repeat` (the same response again, a
    retry after a lost reply: same verdict and receipt) or `locked` (another
    response was checked first → `409 item_locked`, no verdict). This stops
    check-wrong, read key, check-right, keep the better receipt. Without a
    service role or before 0014, a per-instance in-memory map (≤ 50,000
    entries) is used and a warning is logged once, the same policy as the
    rate limiter; across instances that fallback is best-effort.
  - `/submit` returns keys with the result.
  - **Key-reveal cap:** keys revealed by `/check` and `/submit` count
    against a per-IP daily budget (shared limiter bucket
    `exams.keys`, default 400 items/day, `EXAM_KEY_REVEAL_DAILY`); past it,
    results show verdicts without the correct response and explanation
    (`key_reveal_limit`). This bounds scraping through start + empty submit.
  - **Grading cap:** a verdict is itself an answer oracle (a stateless
    `/submit` can be replayed with option 0, 1, 2 … for every item). Every
    graded submitted answer (a `/check`, or a `/submit` position graded from
    a response) is one hit in the per-IP daily bucket `exams.grades`
    (default twice the key-reveal cap, `EXAM_GRADE_DAILY`, 10..100000).
    Receipted and unanswered positions are free. Past it the route answers
    `429 rate_limited` and grades nothing.

  Because nothing is saved and guest scores are not ranked, a replayed
  submit gains no score; the verdicts it could collect are bounded by the
  grading cap. This is stated in DATA_API.md; guest results are always
  labelled "not saved".
- **Bank revision:** if an item's current `revision` differs from `r[i]`, the
  item is voided. It is excluded from the score and shown with a "question
  updated" note.
- **Guards:**
  - same origin;
  - rate limit bucket `exams.session`, 60 per 300 s per IP;
  - body limits: start 16 KiB, check 8 KiB, submit 48 KiB;
  - strict whitelist parsing; `seed` in a `/start` body → `seed_not_allowed`;
  - scope caps of §5.3 (guests: subject level or narrower);
  - `is_premium` items never enter a guest pool.
- **Pool source:**
  - With a service role: `ce_guest_start(p_template, p_scope, p_seed, p_seen text[], p_count)`
    runs the selection **in SQL** (reusing `_ce_allocate`/`_ce_pick`) and
    returns only the picked public rows; `ce_guest_items(p_keys, p_with_keys)`
    returns content and keys at check/submit time. Both are service_role
    only. No whole pool is ever shipped to Node.
  - Otherwise: the **runtime bank** (a pre-DB fallback, capped at ~60k items
    and 40 MB, §3), built by `pack-runtime-bank.mjs` (WP6) from published
    staging:
    - `index.json`: `{schema: "runtime-bank-index@1", bank_revision, files: {<file id>: {path, sha256, bytes}}, nodes: {<node id>: {counts by band, selection file id}}}`.
      File names are resolved **only** through this whitelist map; a scope
      string is never concatenated into a path.
    - selection indexes `sel/<file id>.json` (`runtime-bank-sel@1`) per
      subject: 10-column rows `[key, lesson, band, component, type, stimulus, premium, revision, content chunk id, objective]`
      (`SEL_COLUMNS` in `runtime-bank.server.js`). `objective` feeds the
      `lesson-quiz` stratification (`stratify_by: objective`, §2.12); a
      9-column row from an older bank reads `objective: null`, and the
      stratum then falls back to the lesson;
    - content chunks `c/<chunk id>.json` (`runtime-bank-content@1`, ≤ 256 KB,
      public fields) and key chunks `k/<chunk id>.json` (answers,
      explanations, objectives, sources), loaded **only for the picked keys**.
    - Files are read with `fs` through `outputFileTracingIncludes` for
      `/api/exams/session/**` and cached in a **byte-bounded LRU of 64 MB**
      per instance (size = file bytes × 3 as a heap estimate).
  - The JSON schemas above live in `data/schemas/` (WP1).

**Signed in (DB):**
- Sessions are rows. All reads and writes go through SECURITY DEFINER RPCs
  (`search_path = ''`), and the actor comes from `auth.uid()`.
- Keys are in `question_keys`, which clients cannot read. Grading happens
  only in `check_exam_item` (one locked item) and `_exam_finalize`;
  `save_exam_response` never writes `score` or `is_correct`, so they stay
  null mid-attempt.
- **Locked items are final:** `save_exam_response` refuses a locked
  position (`item_locked`); `submit_exam_attempt` and `_exam_finalize`
  ignore any `p_answers` entry for a position with `locked_at` set and grade
  it from the response stored at lock time.
- **Revision guard:** at finalize and when rendering a result, an item whose
  `question_revision` differs from the question's current `revision` is
  **voided** (excluded from the score, `voided = 'question_updated'`, shown
  with a note). History renders the answered version from
  `question_revisions` (§6.1).
- `retake_of` must be the caller's own attempt
  (`… where id = p_retake_of and user_id = auth.uid()`), else `not_found`.
- `expires_at` is fixed at start. Saves are refused after `expires_at + 30 s`.
- RLS gives read-own on attempts, items and learner stats, and there are no
  client write grants.
- If the DB is unavailable (missing-object or down codes), the client falls
  back to guest mode with the "not saved" notice, as `startExam` does today.

### 5.9 Evolution without breaking current pages and tests

- **Frozen:** `start_exam_attempt`, `save_exam_answer`, `list_exam_attempts`,
  `/api/exams/local/*`, the builder, `0011_seed_questions.sql` and
  `local-bank.js` keep their signatures and behaviour. The aptitude and
  achievement builders keep working unchanged.
- **Changed in 0014:**
  - `start_exam_attempt` gets the same signature. Its body is copied from 0012
    with one change: the free daily limit counts only attempts with
    `template_id is null` or quota `exam`.
  - `_exam_finalize`, `submit_exam_attempt`, `get_exam_attempt`,
    `_exam_questions_json` and `_exam_result` are extended so that rows with
    `template_id is null and choice_order is null` produce exactly today's
    payloads plus added fields. `tests/db/learning*.test.js` must pass
    unmodified.
- **Keys:** the 300 legacy items get canonical records with the same keys.
  The importer updates only the new columns (`question_type = 'mcq'`,
  `provenance = 'internal_authored'`, and `status` / `validation_status`
  from their §4.4 validation: `published`/`validated`, or
  `review_required`, which keeps them out of template pools while the legacy
  RPCs still serve them). **Never re-apply 0011 after an import**; it would
  reset `is_active`.
- **Client code:** `src/lib/data/exams.js` keeps its exports.
  `getAttempt` / `saveAnswer` / `submitExam` dispatch on
  `mode ∈ {db, local, guest}`. `toRunnerSession` stays the single adapter.
  `QuestionCard` becomes a type switch whose `mcq` branch renders exactly
  today's markup.
- **Later:** once the template engine has parity (templates `mock` / `timed`
  with `prep:` scopes), the builder may start template sessions behind a flag.
  The legacy RPCs are removed only in a later migration after that.

---

## 6. Database

### 6.1 Migration `supabase/migrations/0014_content_engine.sql`

It follows the 0010–0013 conventions:
- `begin; … commit;` and idempotent DDL;
- `do $$ … pg_constraint … $$` guards to drop and re-add named constraints;
- RLS on every table, a policy per command, `(select auth.uid())` in policies;
- `revoke all … from anon, authenticated` (the shim grants everything by
  default), then minimal grants;
- definer functions use `set search_path = ''`, fully qualified names, the
  `not_authenticated` check first and P0001 codes with a JSON DETAIL, and are
  revoked from `public, anon, authenticated` before granting;
- advisory locks via `hashtextextended('jazira.<scope>:'||id, 0)`;
- the file ends with `notify pgrst, 'reload schema';`.

It must be re-runnable after 0010, 0012 and 0013 are re-run (the
convergence test).

**New tables.** All text ids carry length and format CHECKs.

| Table | Columns (abridged types) | Indexes | RLS / grants |
|---|---|---|---|
| `content_sources` | `id text pk`, `kind`, `name_ar`, `name_en`, `operator`, `domain`, `base_urls text[]`, `license_status`, `provenance_status`, `redistribution`, `publish_policy`, `retrieved_at`, `notes`, `updated_at` | — | select anon+auth (true) |
| `curriculum_nodes` | `id text pk` (≤ 160), `parent_id text fk`, `kind`, `stage`, `grade`, `track`, `subject`, `ord int`, `title_ar`, `title_en`, `term`, `term_status`, `in_plan bool`, `status`, `source_refs jsonb`, `search_norm text generated always as (public.search_normalize_v2(title_ar \|\| ' ' \|\| coalesce(title_en,''))) stored`, `updated_at` | `(parent_id, ord)`, `(subject, kind)`, `(stage, grade, track, kind)`, GIN trgm on `search_norm`, GIN `to_tsvector('simple', search_norm)` | select anon+auth where `status <> 'source_only'` |
| `subject_terms` | `subject_node_id`, `term`, `status`, `evidence text[]`, pk (subject, term) | — | select anon+auth |
| `curriculum_resources` | `id text pk`, `source_id fk`, `subject_node_id fk`, `kind`, `title`, `part`, `year_label`, `url text check (url ~ '^https://')`, `file_type`, `page_count`, `external_count`, `availability`, `term`, `term_status`, `license_status`, `redistribution`, `status`, `retrieved_at`, `search_norm` generated | `(subject_node_id)`, GIN trgm `search_norm` | select anon+auth (metadata and link-outs only) |
| `lesson_resource_ranges` | `lesson_node_id`, `resource_id`, `pdf_start`, `pdf_end`, `printed_start`, `printed_end`, `method`, `status`, pk (lesson, resource) | `(resource_id)` | select anon+auth |
| `learning_objectives` | `id text pk`, `lesson_node_id fk`, `text_ar`, `text_en`, `origin`, `status` | `(lesson_node_id)` | select anon+auth where `status = 'validated'` |
| `question_stimuli` | `id text pk`, `language`, `text` (≤ 8000) | — | **no client grants** (served inside RPC payloads) |
| `question_curriculum` | `question_id uuid fk on delete cascade`, `node_id text fk`, `role`, pk (question, node) | `(node_id, question_id)` | no client grants |
| `exam_templates` | `id text`, `version int`, `kind`, `definition jsonb`, `is_active`, pk (id, version) | — | select anon+auth where active |
| `scope_pool_counts` | `node_id`, `band`, `published_count`, `group_count`, pk (node, band) | — | select anon+auth |
| `scope_pool_members` | `lesson_node_id`, `band`, `question_key`, `component`, `question_type`, `is_premium`, pk (lesson, band, key) | `(lesson_node_id, band)` | no client grants; rebuilt by `ce_refresh_aggregates` |
| `learner_question_stats` | per §2.14, pk (user_id, question_id) | `(user_id, last_seen_at desc)` | select own; no writes |
| `learner_node_stats` | per §2.14, pk (user_id, node_id) | `(user_id, last_at desc)` | select own; no writes |
| `question_item_stats` | per §2.14 | — | none (service) |
| `content_import_runs` | `id uuid pk`, `target`, `manifest_sha`, `started_at`, `finished_at`, `status`, `counts jsonb`, `report jsonb` | — | none |
| `content_import_batches` | `run_id`, `entity`, `batch_no`, `first_key`, `last_key`, `rows`, `inserted`, `updated`, `unchanged`, `rejected`, `status`, `error`, `finished_at`, pk (run, entity, batch) | — | none |
| `content_import_errors` | `run_id`, `entity`, `key`, `code`, `detail`, `at` | `(run_id)` | none |
| `ce_guest_check_locks` | `sid text` (`g-…`), `position smallint` (1–100), `resp_hash text` (sha256 hex), `expires_at timestamptz`, pk (sid, position) | `(expires_at)` | RLS on, no policies, all revoked from anon/authenticated; written only by `ce_guest_check_lock` (§5.8) |
| `question_revisions` | `question_id uuid fk`, `revision int`, `stem`, `stimulus_id`, `payload_public jsonb`, `answer jsonb`, `explanation jsonb`, `created_at`, pk (question, revision); append-only (update/delete trigger raises) | — | **no client grants**; read by `_exam_result` for the answered revision |

**Normalization v2.** 0014 creates a new IMMUTABLE
`public.search_normalize_v2(text)`: PG `normalize(x, NFKC)` after the
superscript/fraction mapping of Appendix A, the same letter folds, digit
mapping and punctuation stripping as `normalize.js` v2. The 0012
`search_normalize` and `questions_stem_norm_idx` are left untouched; new
generated columns and indexes use v2 only, and are created in the same
migration (a function change never silently leaves stale stored values).
A test runs Appendix A cases through both JS and SQL.

**Changed tables** (additive, all nullable or defaulted):
- `questions`:
  - new columns: `question_type text default 'mcq'`, `difficulty_level smallint check 1..5`, `language` (exists), `item_style`, `provenance text`, `status text default 'published'`, `validation_status text`, `content_hash text`, `revision int default 1`, `lesson_node_id text`, `objective_id text`, `stimulus_id text`, `shuffle_options bool default true`, `fixed_order_reason text`, `exclusion_group text`, `payload_public jsonb default '{}'`, `source_resource_id text`, `source_printed_start int`, `source_printed_end int`, `import_origin text` (`legacy_seed | staging`);
  - `questions_exam_check` is dropped and re-added with `'school'`;
  - `questions_section_matches_exam` and `questions_topic_in_section` become
    `exam = 'school' or (<old expression>)`;
  - `questions_choices_shape` becomes `(question_type in ('mcq','true_false') and <old shape>) or (question_type not in ('mcq','true_false') and choices = '[]'::jsonb)`;
  - partial unique index `questions_content_hash_active_uidx on (content_hash) where is_active and content_hash is not null`;
  - pick index `(lesson_node_id, difficulty, status) where is_active`;
  - `questions_read` policy adds `and exam <> 'school'`, so the curriculum
    bank is served only through RPCs;
  - **column grants:** table-level `select` on `questions` is revoked from
    `anon, authenticated` and re-granted as an explicit column list that is
    today's client-visible columns plus `question_type`, `language`,
    `payload_public`, `difficulty_level`, `lesson_node_id`. `content_hash`,
    `exclusion_group`, `provenance`, `validation_status`, `import_origin`,
    `revision` internals and source columns are **not** granted (the hash
    includes the answer). A DB attack test brute-forces the answer from
    every anon-readable column and from a v2 token and must fail;
  - `content_hash` values carry the `n2:` prefix (§2.8).
- `question_keys`:
  - `correct_index` drops NOT NULL;
  - new `answer jsonb`, `explanation_steps jsonb`, `accepted_norm text[]`
    (normalized short answers);
  - CHECK `correct_index is not null or answer is not null`;
  - `_check_question_key` is replaced so that it skips null `correct_index`.
- `exam_attempts`:
  - new columns: `template_id`, `template_version`, `scope text`, `term_scope`, `seed text check (seed ~ '^[0-9a-f]{32}$')`, `retake_of uuid fk`, `timing_mode text default 'timed'`, `feedback_mode text default 'end'`, `quota text default 'exam'`, `bank_revision text`;
  - the `exam` check gains `'school'`;
  - the section and topic checks are bypassed for `'school'`;
  - the time check becomes `(timing_mode='timed' and time_limit_seconds between 60 and 14400) or (timing_mode='untimed' and time_limit_seconds between 60 and 604800)`;
  - new index `(user_id, template_id, started_at desc)`.
- `exam_attempt_items`: new columns `choice_order smallint[]`, `display_map jsonb`, `response jsonb`, `score numeric(5,4)`, `question_revision int`, `locked_at timestamptz`, `voided text`.
- `question_keys`: `accepted_norm` is computed by the importer **in SQL**
  with `search_normalize_v2` (never precomputed in JS), so the stored key and
  the graded response use the same function.
- `_refresh_question_bank_counts()` returns early when
  `current_setting('jazira.bulk_import', true) = 'on'`. The importer sets it
  per transaction and calls `ce_refresh_aggregates()` once at the end.

### 6.2 RPCs

| Function | Grants | Behaviour |
|---|---|---|
| `start_template_attempt(p_template text, p_scope text, p_count int default null, p_timing text default null, p_feedback text default null, p_retake_of uuid default null) → jsonb` | authenticated, service_role | 1. Validates; `p_retake_of` must belong to `auth.uid()` (else `not_found`). 2. Takes the per-user advisory lock. 3. Runs `_exam_expire_stale`. 4. Applies quotas and tier clamping (§5.3): `exam` = the existing 5/day free limit and 25-question cap (mini versions below a template's min); `practice` = 30/day free. 5. Builds the pool (`_ce_pool`: published, not premium unless `has_premium`, scope cap `scope_too_large`). 6. Allocates (`_ce_allocate`, §5.3; a retake reuses `meta.allocation`). 7. Picks (`_ce_pick`). 8. Inserts the attempt with seed, choice orders and display maps. 9. Returns the §5.7 payload with `mode:'db'`. **Performance:** candidate lists per `(lesson, band)` with component ids are precomputed by `ce_refresh_aggregates` into `scope_pool_members` (node, band, key, component, premium), so `u()` is computed only over the pool of the requested scope (≤ 5,000 by the cap) and never over the bank; budget p95 ≤ 300 ms on a 200k-item PGlite pool (§9.3). |
| `save_exam_response(p_attempt uuid, p_position smallint, p_response jsonb, p_time_spent int default 0, p_flagged boolean default null) → jsonb` | authenticated, service_role | Owner lock; in progress; not past the grace period; item not locked (`item_locked`). Validates the response shape per type (display indexes in range, lengths). Maps display → canonical via `choice_order`/`display_map`. Stores the response only; never writes `score`/`is_correct`; `time_spent` monotonic. |
| `check_exam_item(p_attempt uuid, p_position smallint) → jsonb` | authenticated, service_role | Only when `feedback_mode = 'immediate'`. Grades the stored response, writes `score`/`is_correct`, sets `locked_at` and returns the item result (verdict, correct response, explanation, objective, lesson). |
| `abandon_exam_attempt(p_attempt uuid) → jsonb` | authenticated, service_role | Finalizes as `abandoned`: answered items are graded for stats; no XP. |
| `submit_exam_attempt`, `get_exam_attempt` | unchanged grants | Same signatures. They accept `response` in `p_answers` items; entries for locked positions are ignored (graded from the lock-time response). Revision mismatches are voided (§5.8). Results are extended (§5.7). |
| `list_exam_attempts_v2(p_limit int default 20, p_before timestamptz default null, p_before_id uuid default null) → jsonb` | authenticated, service_role | Like v1, plus `template_id`, `scope`, scope title, `term_scope` and `retake_of`; keyset pagination. |
| `get_learning_stats(p_node text default null) → jsonb` | authenticated, service_role | Totals, by band, by lesson (weakest first, Wilson), repeated mistakes, average time per lesson, trend. By-topic breakdowns stay Elite-gated as today. |
| `get_practice_recommendations(p_limit int default 5) → jsonb` | authenticated, service_role | `[{kind: lesson_quiz \| lesson_review \| weakness_review, node, title, reason: {accuracy, answered}, href}]`. |
| `get_scope_availability(p_node text) → jsonb` | anon, authenticated | Counts from `scope_pool_counts` per template: whether it is offered, and `min_pool`. |
| `search_content(p_q text, p_kinds text[] default null, p_node text default null, p_limit int default 10, p_offset int default 0) → jsonb` | authenticated, service_role (anon goes through the rate-limited `GET /api/content/search` route, which calls it with the service role and `p_anon = true`) | Groups `node`, `resource`, `exam`, and `question` for signed-in users only. `p_q` must be ≥ 2 chars (≥ 3 for the question group) so the trigram GIN is always usable. Question hits are **lesson-level only** (`{lesson, count, href}`), never stems, and exclude premium, non-published and inactive items. Filtered by subtree (`p_node` prefix on the denormalized stage/grade/subject columns); totals capped at 100; `set statement_timeout = '500ms'` on the function. |
| `ce_import_begin(p_manifest jsonb) → uuid`, `ce_import_batch(p_run uuid, p_entity text, p_batch_no int, p_rows jsonb) → jsonb`, `ce_import_retire(p_run uuid, p_keys text[]) → jsonb` (refuses per §6.3 step 6), `ce_import_finish(p_run uuid) → jsonb`, `ce_refresh_aggregates() → void` | service_role only | §6.3 |
| `ce_guest_start(p_template text, p_scope text, p_seed text, p_seen text[], p_count int) → jsonb`, `ce_guest_items(p_keys text[], p_with_keys boolean) → jsonb` | service_role only | Guest selection in SQL, returning only the picked public rows; content/keys for check and submit (§5.8). Premium excluded. |
| `ce_guest_check_lock(p_sid text, p_position int, p_resp_hash text, p_expires_at timestamptz) → text` | service_role only | Records the first checked response of a guest (session, position) in `ce_guest_check_locks`; returns `first`, `repeat` or `locked` (§5.8). |

Internal helpers (revoked from API roles): `_ce_u(seed, tag, key) → bigint`,
`_ce_scope_lessons(scope) → setof text`, `_ce_pool`, `_ce_allocate`,
`_ce_pick`, `_ce_grade(type, answer jsonb, accepted_norm text[], response jsonb) → numeric`,
`_ce_update_stats(attempt)`.

### 6.3 Import pipeline (`scripts/content/import-staging.mjs`, WP7)

```
node scripts/content/import-staging.mjs --target pglite|supabase [--run <id>] [--resume]
       [--only sources,resources,curriculum,objectives,stimuli,questions,templates]
       [--batch 500] [--dry-run] [--no-retire]
```

1. **Preflight:**
   - `validate-staging` must pass and `manifest.json` must match.
   - Only questions with `status = published` are imported. For
     `--target supabase`, the item's source must also have
     `publish_policy = derived_questions_allowed` (`internal` sources always
     qualify).
2. **Run:** `ce_import_begin(manifest)` returns a run id. The checkpoint is
   `content-cache/import/<target>/checkpoint.json`:
   `{run_id, manifest_sha, entity, shard, line, batch_no}`, written after
   every acknowledged batch. `--resume` continues from it (the manifest sha
   must match).
3. **Order:**
   1. sources
   2. resources
   3. nodes (parents first, sorted by depth)
   4. subject terms
   5. lesson ranges
   6. objectives
   7. stimuli
   8. retirement of `removed[]` keys (step 6)
   9. questions (+ keys + curriculum links + revision history, in one batch call)
   10. exam templates
4. **Batches:** 500 rows per `ce_import_batch` call, one transaction each,
   `set local jazira.bulk_import = on`. Each row is upserted on its natural key
   `... on conflict do update ... where (...) is distinct from (...)`, so
   unchanged rows are not touched and replays are idempotent. A changed
   question first appends its previous version to `question_revisions`, then
   updates in place with `revision + 1`; in-progress and past attempts are
   protected by the revision guard (§5.8). Rows whose `content_hash` equals
   another row **in the manifest** under a different key are rejected
   (`duplicate_content`); the comparison is against manifest content, not
   against live rows that the same run is about to retire.
5. **Partial retries:** a failed batch is split in halves recursively down to
   single rows. Bad rows go to `content_import_errors` and the local log, and
   the run continues. Network errors are retried with backoff 1/2/4/8 s.
6. **Retire and finish.** The manifest lists removals explicitly:
   `removed: [{key, reason}]`, produced by diffing the published set with the
   previous manifest. Retirement:
   - runs **before** question inserts (step 3.8), so a new row may reuse the
     content of a removed one;
   - retires only keys listed in `removed[]`, and only within the
     `(shard, subject)` set the run fully covered;
   - is **refused** (`retire_refused`, nothing retired) when the run used
     `--only`, had any `content_import_errors`, or imported a publish set
     filtered by `publish_policy` that differs from the manifest's;
   - marks rows `is_active = false, status = 'retired'` (never deleted;
     attempts reference them).

   `ce_import_finish(run)` then:
   - `ce_refresh_aggregates()` refreshes `question_bank_counts` and
     `scope_pool_counts`.
7. **Logs and report:** NDJSON log at `content-cache/import/<target>/<run>.log.jsonl`.
   The report `{run, target, manifest_sha, per entity: inserted/updated/unchanged/rejected/retired, errors, duration}`
   is written to `data/staging/reports/import/<target>-<run>.json` for
   production targets and to the cache for PGlite and test runs.
8. **Executors** (`scripts/content/lib/import-executors.mjs`) expose
   `{ rpc(name, args) }`:
   - `pglite` uses `tests/db/harness.js` `createDb()` + `asService`;
   - `supabase` uses `createAdminClient()` with the service key from env.

   Tests drive the pglite executor end to end.

---

## 7. UI

All strings live in message files in both locales with identical key trees.
English values contain no Arabic: «صح / خطأ / شرح السبب / إعادة الاختبار» exist
in `ar`; `en` has "Correct / Incorrect / Why / Retake (new questions)".
Question content renders with `lang`/`dir` from `question.language` (no longer
hard-coded `ar`), with math and Latin runs isolated (`MixedText`). Layouts use
logical CSS, work at 375 px, and every route has `loading.js`, `buildMetadata()`,
and error and empty states.

- **Curriculum pages** (existing `/curriculum/...`, WP9):
  - `SubjectDetail` gains **Units and lessons** (from the outline): unit
    headings with the term badge (verified / unconfirmed for
    `owner_decision` / needs review), and lesson rows
    showing printed pages and pool availability.
  - It also gains **Test yourself** entry points: lesson quiz, chapter quiz,
    subject quiz, term exam t1 / t2 (only when the membership is verified or
    inferred and the pool is large enough; given §0 this is expected to be
    rare at first) and full year. Free users see "mini" versions where the
    tier cap is below the template minimum (§5.3).
  - Disabled buttons give the honest reason («لا توجد أسئلة كافية بعد» / "Not enough
    questions yet"). The term note becomes conditional on `terms_status`.
- **Learn route** `/learn/[...path]` (WP9):
  - The path is a subject node id plus an optional unit or lesson local id.
  - The subject page shows the full outline.
  - The lesson page shows the title, unit, term, objectives and book pages,
    with a link-out to the iEN PDF at `#page=<pdf_page>`. It also shows the
    pool counts per band and start buttons for lesson quiz and practice
    (immediate feedback), plus the chapter, subject and term entry points.
  - Rendering is dynamic with ISR (`dynamicParams = true`,
    `revalidate = 86400`).
- **PDF resource states:**
  - `external_official` → a "فتح في عين" / "Open on iEN" link-out
    (`target=_blank rel="noopener noreferrer"`), with part, edition 1448,
    term badge and page count;
  - `unavailable` → an `EmptyState` with the reason;
  - `needs_review` → a badge explaining that the term is not yet confirmed.

  Nothing is embedded (CSP `frame-src 'self'`) and nothing is rehosted. The
  iEN question bank shows as an external resource with its count.
- **Runner** (existing `/exams/attempt/[id]`, WP8):
  - The timer counts from the server deadline (`toRunnerSession`, already
    skew-safe). The header shows progress, answered and **unanswered** counts,
    and flags.
  - Prev/next, the navigator, the confirmation dialog and auto-submit at zero
    stay as they are.
  - Resume works through `get_exam_attempt` (DB) or stored token and drafts
    (guest).
  - Type inputs: mcq/true_false (radios), matching (select per left item on
    mobile, two columns on desktop), ordering (move-up/move-down buttons and
    keyboard; no drag-only interaction), short answer (text, max chars),
    numeric (`inputmode="decimal"`, accepts either digit set, unit select when
    required).
  - Immediate-feedback templates show صح / خطأ and شرح السبب inline after "Check",
    and lock the item.
- **Results** (same route, no reload):
  - A score ring. `by_lesson` bars with a lesson link. `by_term` for full-year.
  - Per question: the صح/خطأ (partial) badge, the selected and correct
    answers, a **شرح السبب** disclosure (explanation and steps), the objective,
    a "related lesson" link and a source reference (book, printed pages) as a
    link-out.
  - **إعادة الاختبار** starts a new session with the same template, scope,
    count, timing and difficulty mix, `retake_of` = this attempt, and avoidance
    of the questions just seen. A `reused` notice appears when the pool forced
    reuse. "Practise my mistakes" starts a `weakness-review` scoped to this
    attempt's lessons.
- **History** (`/exams/history`, WP8): template and scope per attempt,
  compare with the previous attempt on the same scope, lesson weaknesses,
  repeated mistakes and recommendations
  (`get_practice_recommendations`). Guests see an honest "sign in to save"
  state.
- **Search** (WP9): the existing search page gains lessons, units, resources
  and exams groups. They come from `search_content` with the DB, or from
  `GET /api/content/search?q=&kinds=&node=&limit=&offset=` with no DB (a
  server-side normalized index built from the outline; never a client scan).
  Input is debounced (250 ms), queries under 2 chars are not sent, stale
  requests are cancelled and results use "load more" pagination. Anonymous
  users get no question group; signed-in users get lesson-level question
  counts, never stems. The curriculum command-palette index stays unchanged
  (its tests pin its kinds).
- **Performance:** the client receives only the current session. Pool counts
  come from `scope_pool_counts` or `data/runtime/bank/index.json`. Outlines
  load per leaf on the server. Lists over 100 items paginate. The runner
  extras (matching and ordering inputs) load through `next/dynamic`.

---

## 8. Reports (`scripts/content/report.mjs`, WP10)

All reports are generated from staging files only. They are deterministic,
record the manifest sha and generation time, and state their counting rules
at the top.

| Report | File | Content |
|---|---|---|
| Coverage | `reports/coverage.json`, `coverage.md` | **Leads with the "term undeterminable" bucket** (subjects and resources whose term is `needs_review`, with counts by evidence route tried) and front-matter coverage `n/315`. Then stage → grade → (track) → term → subject: units, lessons (verified / needs review), PDFs (available / unavailable / needs review), pages processed by method, published questions, variants, exam templates offered, practice material per lesson (exercise index), and **gaps**: subjects without books, lessons without pages, lessons without exercises, lessons with fewer than the lesson-quiz minimum, pages awaiting vision, source-only subjects. Term 1 and Term 2 are listed separately; a subject appears in a term only per `subject-terms.jsonl`. Also a summary of the latest `changes-<date>.jsonl`. |
| Data quality dashboard | `reports/quality.html` | Self-contained static HTML: inline CSS/JS, data embedded, no external requests, RTL and LTR toggle, light and dark. Totals: sources, PDFs, pages processed, lessons, candidates, validated, rejected, EXACT and NEAR duplicates, review required, canonical (published UNIQUE or canonical), variants, exam templates. Breakdown by stage, grade, term, subject and chapter, with sortable tables. |
| Validation | `reports/validation.md` | Per run and cumulative: items checked per role and agent, verdicts, the top failing check codes, disagreement counts, sample sizes versus the sampling policy, agents unavailable, review queue size and age. |
| Duplicates | `reports/duplicates.md` | Clusters by class, largest clusters, cross-lesson duplicates, instruction-stem families, numeric-variant families. |
| Exam templates | `reports/exam-templates.md` | Per template × scope (no cross-template or overlapping-scope totals): scopes offered or refused (insufficient pool), pool size and **attempts before forced reuse** as the headline, allocation, distinct sets by component and with variants (exact, log10, lower-bound flag), and display permutations in a separate table. |
| Generated-question statistics | `reports/question-stats.json` | By origin, type, style, difficulty level and band, language, subject; generator yield (accepted ÷ generated) per run; repair rate; average explanation length; answer-position balance for mcq; **measured throughput per run** (items per hour, subagent calls and cross-AI batches per 100 items) and the full-bank projection, labelled as a projection (§9.3). |
| Resource manifest | `reports/resources.md` | Every resource: id, title, subject, part, year labels, availability, extraction status, pages by method, term status and evidence routes. |
| Question-bank manifest | `reports/question-bank.md` | Per shard and subject: counts by status, origin and type, `bank_revision`, manifest sha. |

Counting rules:
- **candidates** = every question record ever ingested, any status;
- **validated** = `validation.status = validated`;
- **published** = `status = published`;
- **canonical** = published and (`UNIQUE` or cluster canonical);
- **variants** = published records with `variant ≠ null`;
- **legacy** items (the 300) are reported in their own section, by
  validation outcome;
- **rewrite variants** are counted as variants, never as canonical;
- **sources** = rows in `registry.json`; **PDFs** = resources with
  `file_type = pdf`, split by `availability` and by `extraction.status`;
- **pages processed** = page-map rows with text or a vision transcript,
  split by method (`text`, `vision`, `front-matter only`); a book's
  `page_count` is never reported as processed;
- **sessions are never added to question counts.**

The counting rules are tested against the fixture tree (WP10).

---

## 9. Work packages

Code packages have **strictly disjoint** file ownership. A package may read any
file, but it creates or modifies only the files listed for it. Generated data
is written only by running a package's scripts in the content-production runs
(§9.2), never by hand. Shared contracts are this document's schemas and
payloads. Anything a package needs from another package is used through the
contract. When a contract must change, this document is updated first.

### 9.1 Code packages

**WP1 — Content foundations** (depends on: none)
- *Create:* `data/schemas/{source,resource,term-evidence,curriculum-node,subject-term,page-map,toc,exercise-index,objective,stimulus,question,question-template,validation-record,dedup-cluster,exam-template,manifest,book-frontmatter,catalog-map,research-claims,id-registry,owner-decision,prep-alignment,crawl-changes,runtime-bank-index,runtime-bank-sel,runtime-bank-content}.schema.json`, `data/staging/README.md`, `data/staging/sources/registry.json`, `src/lib/content/enums.js`, `src/lib/content/ids.js`, `src/lib/content/normalize.js` (v2 rules, `lam_order_fold`), `src/lib/content/answers.js` (the only JS grader), `src/lib/content/expr.js` (grammar + exact rational evaluator, moved here from WP5 because WP4's N002/N004 need it), `src/lib/content/prng.js` (sfc32 + HASH-CTR `u()`), `scripts/content/lib/jsonl.mjs` (stream read, deterministic shard writer with 4 MB split), `scripts/content/lib/cache.mjs` (the §3 cache layout, `CONTENT_CACHE_DIR`, path sanitizing and containment), `scripts/content/lib/id-registry.mjs`, `scripts/content/lib/schemas.mjs`, `scripts/content/validate-staging.mjs`, `tests/fixtures/content/staging/**` (mini staging tree with every record type), `tests/fixtures/content/outline-tree.json` (the node-tree interface fixture used by WP6), `tests/fixtures/content/grading-cases.json`, `tests/unit/content-foundation.test.js`, `tests/unit/content-answers.test.js`, `tests/unit/content-expr.test.js`.
- *Modify:* `package.json` (devDependency `ajv@^8`; `pdfjs-dist` and `puppeteer-core` are already present; scripts `content:validate`, `content:curriculum`, `content:frontmatter`, `content:render`, `content:fetch`, `content:extract`, `content:vision`, `content:packets`, `content:ingest`, `content:check`, `content:exchange`, `content:resolve`, `content:dedup`, `content:variants`, `content:import`, `content:pack`, `content:report`, all pointing to the files named in this section; the scripts' files belong to their packages), `package-lock.json`, `.gitignore` (`/data/staging/validation/exchange/`, `*.part`), `scripts/README.md` (documents every content script).
- *Acceptance:* the schemas validate the fixture tree; `validate-staging` exits 0 on the fixtures and 1 on each seeded defect (bad reference, unsorted file, oversized shard, stale manifest, an 81-char excerpt, a `quote` in a question, an absolute path, a stray `.jpg`, an unknown file); `normalize` matches Appendix A (superscripts, fractions, NFKC, punctuation); `answers.js` passes every grading case; the ids follow §2.2, including the 40-char limit and the D001/next-hex rule; the id registry reuses ids for typo-fixed titles; `u()` matches published SHA-256 test vectors; `expr.js` uses exact rationals and rejects unsafe input.
- *Tests:* `content-foundation.test.js`, `content-answers.test.js`, `content-expr.test.js`.

**WP2 — Curriculum normalization and catalog correction** (depends on: WP1)
- *Create:* `scripts/content/build-curriculum.mjs`, `scripts/content/lib/ien-mapping.mjs` (reconciles `catalog-map.jsonl`), `scripts/content/lib/term-resolve.mjs` (all §2.4 routes: plan guide, course codes, owner decisions, strict-regex re-derivation), `scripts/content/lib/part-year.mjs` (§2.4 `part`/`year_label` from listing, cover and file name), `scripts/content/build-prep-alignment.mjs` (§4.3b), `scripts/content/crawl-diff.mjs` (§4.1 changes file), `src/lib/curriculum-outline.js` (server reader implementing the node-tree interface of `tests/fixtures/content/outline-tree.json`: `outlineFor(leafSlug)`, `subjectOutline(subjectNodeId)`, `nodeById`, `lessonsUnder`, `subjectTerms`), `tests/unit/content-curriculum-build.test.js`, `tests/unit/curriculum-outline.test.js`.
- *Modify:* `src/lib/curriculum.js` (terms and `terms_status` from data; resources iterate `subject.terms`), `scripts/build-curriculum-manifest.mjs` (`crossCheck` terms; iEN note), `src/content/curriculum/verified-k9.json`, `src/content/curriculum/verified-secondary.json`, `src/content/curriculum/manifest.json` (rebuilt), `tests/unit/curriculum.test.js` (term pin → "matches research, verified requires evidence"), `docs/CURRICULUM.md` (iEN is public; deep links; outline layer; term policy and the expected `needs_review` outcome).
- *Inputs:* crawl tables, `catalog-map.jsonl` (`origin: agent_audit`), `research/term-evidence.json`, WP3's `term-evidence.jsonl` and `book-frontmatter.jsonl` (the latter's `term_*` keys are ignored), `owner-decisions.jsonl`.
- *Outputs (via runs):* `data/staging/curriculum/**`, `data/staging/resources/resources.jsonl`, `data/staging/sources/ien/changes-<date>.jsonl`, `src/content/curriculum/outline/**`.
- *Acceptance:*
  - `catalog-map.jsonl` is reconciled deterministically (a test pins the
    reconciliation of the 229/11/13 rows; disagreements land in
    `audit.jsonl`);
  - `part` and `year_label` follow the listing/cover first, with the
    `…-ISLM.part.pdf`, `…-math.pdf` and `-PART2.PDF` cases and a 1447/1448
    mismatch as fixtures;
  - term resolution never consumes part numbers or the front-matter
    `term_*` keys; the «الفصل الثاني» chapter heading is not term evidence;
  - every catalog subject of the 20 leaves maps to an iEN subject or is
    listed as `catalog_only` with a reason;
  - the known K07/K09/first-year mappings of the survey are reproduced;
  - source-only subjects are never added to the catalog;
  - no subject is removed from a term without `verified` evidence;
  - node ids are stable across reruns (byte-identical output);
  - `npm test` stays green.
- *Tests:* `content-curriculum-build.test.js` (mapping, id stability, the term-resolution truth table), `curriculum-outline.test.js` (every outline slug resolves in the catalog, term ∈ {t1, t2, both, null}, contiguous orders, page ranges ascending and within the page count, every node has a `source_ref`), updated `curriculum.test.js`.

**WP3 — PDF acquisition and extraction** (depends on: WP1)
- *Create:* `scripts/content/lib/fetch-queue.mjs` (§4.1 shared queue, backoff, circuit breaker, hourly budget), `scripts/content/fetch-books.mjs`, `scripts/content/extract-pdf.mjs`, `scripts/content/vision-queue.mjs` (builds vision jobs from `untrusted`/figure pages, imports transcripts into the cache, needs two agreeing reads for cover/TOC term evidence), `scripts/content/prompts/vision-transcribe.v1.md`, `scripts/content/lib/pdf-text.mjs`, `scripts/content/lib/arabic-pdf.mjs` (lam-ligature repair, split letters, font garbage, `text_quality`), `scripts/content/lib/lexicon.mjs`, `scripts/content/lib/toc.mjs`, `scripts/content/lib/term-evidence.mjs`, `scripts/content/lib/exercise-index.mjs`, `tests/fixtures/content/pdf/*.json` (synthetic pdf.js text-content items: RTL lines, reversed runs, presentation forms, swapped lam ligatures and split letters copied as short lines from real cache text, font garbage, two columns, TOC pages, cover pages), `tests/unit/content-pdf.test.js`, `tests/unit/content-fetch-queue.test.js`.
- *Modify (existing, now owned by WP3):* `scripts/content/pdf-frontmatter.mjs` (use the shared queue and cache layout; default concurrency ≤ 2; skip books already done; snippets ≤ 80 chars from repaired text; no `cache_dir`; `term_*` keys dropped), `scripts/content/pdf-render.mjs` (cache layout, path sanitizing), `scripts/content/ien-crawl.mjs` (use the shared queue; export pure helpers for tests; output format unchanged), `data/staging/sources/ien/book-frontmatter.jsonl` (regenerated by the modified script).
- *Outputs (via runs):* `data/staging/resources/{extraction.jsonl,term-evidence.jsonl,toc/**,page-maps/**,exercise-index/**}`, `book-frontmatter.jsonl`; cache only: PDFs, page text, renders, vision transcripts.
- *Acceptance:*
  - line reconstruction and the Arabic fixes produce the expected strings on
    the fixtures (`املقرر → المقرر`, `اجلزء األول → الجزء الأول`,
    `المتخ ض ض ين` joined; `õcôŸG` flagged `font_garbage`);
  - TOC parsing gives levels, pages and offsets; an `untrusted` TOC page is
    routed to vision;
  - term evidence follows §2.4 (strict regex; chapter headings rejected;
    part numbers never used; vision needs two agreeing reads);
  - the queue never exceeds 2 in flight across two processes, backs off on
    `ECONNREFUSED`/`ECONNRESET`/429/503 honouring `Retry-After`, trips the
    breaker after 5 refusals and resumes from `queue.jsonl` (mock server);
  - range mode fetches only the needed byte ranges; full mode resumes a
    truncated `.part` file; hostile file names (`..`, `\`, `CON.pdf`) are
    rejected;
  - nothing is written under the repo except the listed outputs, and no
    image or page text is.

  An optional integration test runs when `JZ_PDF_CACHE` points at a cached
  book.
- *Tests:* `content-pdf.test.js`, `content-fetch-queue.test.js`.

**WP4 — Generation and validation tooling, legacy conversion** (depends on: WP1)
- *Create:* `scripts/content/make-packets.mjs`, `scripts/content/ingest-candidates.mjs`, `scripts/content/check-questions.mjs`, `scripts/content/lib/checks.mjs`, `scripts/content/lib/units.mjs`, `scripts/content/exchange.mjs`, `scripts/content/resolve-validation.mjs`, `scripts/content/convert-legacy.mjs`, `scripts/content/prompts/{generate.v1,repair.v1,validate.v1,chatgpt-resolve.v1,gemini-language.v1}.md`, `tests/unit/content-checks.test.js`, `tests/unit/content-exchange.test.js`, `tests/unit/content-legacy.test.js`.
- *Modify:* `scripts/build-question-seed.mjs` (bug B1 only: the `--stdout` summary goes to stderr; generated SQL unchanged).
- *Outputs (via runs):* `data/staging/questions/**` (incl. `prep/` legacy), `data/staging/validation/{records/**,review-queue.jsonl,review-decisions.jsonl,runs/**}`.
- *Acceptance:*
  - every Appendix B code has a failing fixture and a passing fixture;
  - ingestion rejects any fields the generator may not set;
  - the exchange rejects malformed or foreign-id responses;
  - the resolution matrix is exhaustive and yields `review_required` on every
    disagreement;
  - legacy conversion is lossless: canonical → legacy JSON deep-equals the six
    source files, and canonical → `buildSeedSql()` is byte-identical to the
    committed `0011_seed_questions.sql`;
  - the prompts contain the §4.3 / §4.3b rules verbatim;
  - packets carry page images and `text_quality`; validation packets carry
    the same images; nothing sent to ChatGPT/Gemini contains page text;
  - ingestion assigns opaque option/left/right/item ids and moves evidence
    quotes to the cache sidecar; `O009` catches ids that reveal the answer;
  - `E001` fails a quote that is not on the cited page (text or vision
    transcript); P004 is a char-5-gram containment check on repaired text
    and gives `not_checked` → `review_required` on untranscribed pages;
  - P006 fails a `validated` item without an explanation (math and numeric:
    a step containing the computed answer); `O010` requires `exact_marks`
    for spelling/diacritics items; `V001` checks rewrite variants;
  - high-risk items are routed to 100 % blind solve; the pilot run manifest
    requests 100 % blind solve for all items;
  - the legacy 300 go through Stage 2 and a blind solve, and disagreements
    become `review_required`.
- *Tests:* the three test files listed.

**WP5 — Dedup and variants** (depends on: WP1)
- *Create:* `scripts/content/dedup.mjs`, `scripts/content/lib/shingles.mjs`, `scripts/content/lib/minhash.mjs`, `scripts/content/lib/exclusion.mjs` (conflict-edge components with the size cap), `src/lib/content/templates.js`, `scripts/content/build-variants.mjs`, `tests/fixtures/content/dedup-pairs.json` (labelled calibration pairs), `tests/unit/content-dedup.test.js`, `tests/unit/content-templates.test.js`.
- *Outputs (via runs):* `data/staging/validation/dedup-clusters.jsonl`, `data/staging/question-variants/**`.
- *Acceptance:*
  - on the legacy 300 there are 0 EXACT and 0 NEAR duplicates; the 8
    odd-word-out and 11 comparison items are not flagged NEAR; the formulaic
    math stems are classified RELATED / `numeric_variant` at most;
  - MurmurHash3 matches reference vectors;
  - thresholds meet the pinned precision/recall on `dedup-pairs.json`;
    short stems, empty shingle sets, `8 × 7` vs `7 × 8`, `x²` vs `x2` and the
    prefix stoplist (`كالسيوم`, `بالون`) behave as specified;
  - variants are deterministic (using WP1's `expr.js`) and every variant
    passes the code checks;
  - exclusion components are set, `numeric_variant` alone adds no edge,
    declared rewrites join the parent's component, and no component exceeds
    K = 8 on the fixtures.
- *Tests:* the two test files listed.

**WP6 — Exam engine, guest session API, runtime bank, data layer** (depends on: WP1; codes against the node-tree interface fixture and merges after WP2, whose `curriculum-outline.js` the routes import)
- *Create:* `src/lib/exams/engine/exam-templates.js`, `src/lib/exams/engine/scope.js` (takes a node-tree object; no direct file reads), `src/lib/exams/engine/allocate.js`, `src/lib/exams/engine/select.js`, `src/lib/exams/engine/shuffle.js`, `src/lib/exams/engine/grade.js` (display ↔ canonical mapping only; grades through WP1's `answers.js`), `src/lib/exams/engine/combinatorics.js`, `src/lib/exams/engine/session-token.js` (v2 + receipts, HKDF keys), `src/lib/exams/engine/key-budget.js` (per-IP key-reveal cap), `src/lib/exams/engine/runtime-bank.server.js` (whitelist index, byte-bounded LRU), `scripts/content/pack-runtime-bank.mjs` (moved here from WP7: writer and reader of one format live together), `src/app/api/exams/session/start/route.js`, `src/app/api/exams/session/check/route.js`, `src/app/api/exams/session/submit/route.js`, `src/lib/data/exam-sessions.js`, `scripts/content/export-exam-templates.mjs`, `scripts/check-env-contract.mjs`, `tests/fixtures/engine/*.json` (pools, histories, seeds and expected selections, allocations, retake allocations, permutations and combinatorics), `tests/fixtures/engine/runtime-bank/**` (a small packed bank), `tests/fixtures/contracts/rpc/*.json` (request/response pairs for every §6.2 RPC, used by WP6 mocks and WP7 tests), `tests/unit/engine-select.test.js`, `tests/unit/engine-token.test.js`, `tests/unit/engine-routes.test.js`, `tests/unit/engine-combinatorics.test.js`, `tests/unit/engine-perf.test.js`.
- *Modify:* `src/lib/exams/local-token.js` (fallback secret from existing server secrets instead of a per-process key in production; `EXAM_SECRET_REQUIRED` flag; previous-key verification; shared HMAC helper; v1 format and key unchanged), `src/lib/data/exams.js` (`mode: "guest"` dispatch; new error codes; exports unchanged), `next.config.js` (`outputFileTracingIncludes` for `/api/exams/session/**` → `./data/runtime/bank/**`), `.env.example` (`LOCAL_EXAM_SECRET`, `LOCAL_EXAM_SECRET_PREVIOUS`, `EXAM_SECRET_REQUIRED`), `tests/unit/server-routes.test.js` (secret-policy cases: flag off keeps live practice working without the variable; flag on returns 503).
- *Acceptance:*
  - allocation and selection match the fixtures exactly;
  - there are no repeats within a session, and at most one item per
    exclusion group;
  - the retake avoids items seen when enough alternatives exist and reuses
    within `max_reuse_share` otherwise;
  - fixed-order options are never shuffled;
  - the token holds no key and nothing answer-derived (attack test: brute
    force over candidate responses finds nothing); tampering, expiry and a
    wrong secret are rejected; a v1 token fails v2 verification and vice
    versa;
  - a submit after the deadline plus grace is `expired`, with answers
    ignored;
  - `/start` never returns keys, rejects `seed`, excludes premium items and
    refuses stage/grade scopes for guests;
  - matching/ordering payloads carry no canonical ids (attack test);
  - check → change → submit keeps the receipt score; the key-reveal cap
    applies;
  - the runtime bank loads only picked content chunks, never resolves a
    path from a scope string (traversal attack test), and stays under the
    64 MB LRU on a 60k-item synthetic bank;
  - `grading-cases.json` passes through the route path;
  - every template × tier clamps as specified (mini full-year for free);
  - the combinatorics matches brute-force enumeration on small pools and
    reports both figures;
  - the existing `local-bank`, `exams-ui` and `server-routes` tests pass.
- *Outputs (via runs):* `data/runtime/bank/**`, `data/staging/exams/templates.json`.
- *Tests:* the five engine test files; the updated `server-routes.test.js`.

**WP7 — Database 0014 and import pipeline** (depends on: WP1, WP6)
- *Create:* `supabase/migrations/0014_content_engine.sql`, `scripts/content/import-staging.mjs`, `scripts/content/lib/import-executors.mjs`, `scripts/content/lib/import-plan.mjs` (manifest diff → `removed[]`, retire-scope rules), `tests/db/content-0014.test.js`, `tests/db/content-engine-rpc.test.js`, `tests/db/content-import.test.js`, `tests/db/content-perf.test.js`.
- *Modify:* `docs/DATA_API.md`, `docs/SECURITY.md`, `docs/DATABASE_SETUP.md` (new tables, RPCs and error codes; column grants on `questions`; `LOCAL_EXAM_SECRET` and `EXAM_SECRET_REQUIRED`; never re-apply 0011 after an import), `tests/db/learning.test.js` (the convergence block only: add the new single-overload functions to its list, if needed).
- *Outputs (via runs):* DB imports and `data/staging/reports/import/**`.
- *Acceptance:*
  - all existing DB tests pass unmodified (except the convergence list);
  - the RLS invariants hold (no table without RLS; definer functions have
    `search_path ''`; anon cannot execute the new authenticated RPCs; the
    school bank is not readable via PostgREST);
  - the SQL selection equals the WP6 fixtures, and SQL grading equals
    `grading-cases.json`;
  - attack tests: another user's attempt, a forged response, a save after
    the deadline, a double submit, a key read, a client write to the stats
    tables, brute-forcing a key from anon-readable `questions` columns,
    canonical ids in matching/ordering payloads, check-then-submit a
    different answer, reading `score` before submit, another user's
    `retake_of`, premium items for a free user;
  - import: batch upsert, idempotent rerun (0 updated), resume from the
    checkpoint after an injected failure, bad-row isolation, dedup against
    manifest content, retire only `removed[]` keys, retire refused for
    `--only` / errors / filtered publish sets, aggregates refreshed once, an
    accurate report;
  - importing revision 2 mid-attempt voids that item at submit and history
    shows revision 1;
  - `search_normalize_v2` equals `normalize.js` on Appendix A cases, and
    short-answer grading agrees in JS and SQL on punctuation/NFKC cases;
  - the RPC fixtures of `tests/fixtures/contracts/rpc/` pass;
  - perf (PGlite, 200k synthetic items): start p95 ≤ 300 ms and submit p95
    ≤ 200 ms at a subject scope; `ce_guest_start` returns only n rows;
    `search_content` ≤ 500 ms.
- *Tests:* the four DB test files listed.

**WP8 — Exam UI: runner, results, history, analytics** (depends on: WP6)
- *Create:* `src/components/exams/questions/{McqInput,TrueFalseInput,MatchingInput,OrderingInput,ShortAnswerInput,NumericInput}.jsx`, `src/components/exams/questions/index.js`, `src/components/exams/question-logic.js`, `src/components/exams/ExplainToggle.jsx`, `src/components/exams/Recommendations.jsx`, `tests/unit/exams-types.test.js`.
- *Modify:* `src/components/exams/{ExamRunner,QuestionCard,QuestionNavigator,ReviewList,ExamResults,AttemptView,HistoryView}.jsx`, `src/components/exams/{runner-logic,results-logic,stats-logic,handoff}.js`, `src/components/exams/skeletons.jsx`, `src/i18n/messages/ar/exams.js`, `src/i18n/messages/en/exams.js`, `tests/unit/exams-ui.test.js`.
- *Acceptance:*
  - every question type answers, saves, resumes and reviews;
  - the mcq markup and behaviour for legacy attempts are unchanged;
  - the header shows live answered and unanswered counts;
  - auto-submit at zero; results without reload; صح/خطأ + شرح السبب +
    objective + lesson link;
  - retake calls start with `retake_of` and the same configuration;
  - `lang`/`dir` come from the item;
  - keyboard and screen-reader access for matching and ordering;
  - screenshots at 375 px in RTL and LTR (`scripts/shot.mjs`);
  - i18n parity.
- *Tests:* `exams-types.test.js` (response reducers, completeness, display ↔ canonical mapping helpers, review verdicts), updated `exams-ui.test.js`.

**WP9 — Learn UI: outline, lesson pages, entry points, resources, search** (depends on: WP2, WP6)
- *Create:* `src/app/[locale]/(app)/learn/[...path]/page.js`, `src/app/[locale]/(app)/learn/[...path]/loading.js`, `src/components/learn/{LearnView,SubjectOutline,LessonView,ExamEntryPoints,ResourceList,ResourceState}.jsx`, `src/components/learn/learn-logic.js`, `src/lib/search/content-search.js`, `src/app/api/content/search/route.js`, `src/i18n/messages/ar/learn.js`, `src/i18n/messages/en/learn.js`, `tests/unit/learn.test.js`, `tests/unit/content-search.test.js`.
- *Modify:* `src/i18n/messages/index.js` (register `learn`), `src/i18n/messages/{ar,en}/meta.js`, `src/i18n/messages/{ar,en}/curriculum.js`, `src/i18n/messages/{ar,en}/search.js`, `src/components/curriculum/{SubjectDetail,SubjectExplorer}.jsx`, `src/components/curriculum/model.js` (optional `outline` and `terms_status` in `toClientSubject`, JSON-serializable), `src/components/curriculum/views/{LeafView,StageView,HighSchoolView}.jsx`, `src/lib/data/search.js`, `src/components/search/{model.js,results.jsx,SearchTabs.jsx}`, `src/app/sitemap.js` (subject learn pages).
- *Acceptance:*
  - entry points appear only for templates offered for the scope (pool rule);
  - a term exam is offered only for verified or inferred membership;
  - the three resource states render and nothing is embedded;
  - lesson pages carry correct PDF `#page` link-outs;
  - search over 10k lessons answers server-side in < 50 ms (index in memory)
    with pagination;
  - `curriculum.test.js` and `search.test.js` pass unmodified;
  - 375 px RTL and LTR; i18n parity; `loading.js` and metadata present.
- *Tests:* `learn.test.js` (routing and resolution, entry-point rules, resource states), `content-search.test.js`.

**WP10 — Reports and data-quality dashboard** (depends on: WP1, WP6)
- *Create:* `scripts/content/report.mjs`, `scripts/content/lib/report-model.mjs`, `scripts/content/lib/report-html.mjs`, `tests/unit/content-reports.test.js`.
- *Outputs (via runs):* `data/staging/reports/{coverage.json,coverage.md,quality.html,validation.md,duplicates.md,exam-templates.md,question-stats.json,resources.md,question-bank.md,verification.md}`, `data/staging/exams/blueprints/**`.
- *Also:* the §8 counting rules (pages processed by method, PDFs by availability and extraction status), the "term undeterminable" bucket first in coverage, no totals across templates or overlapping scopes (asserted), and the measured-throughput projection labelled as a projection.
- *Acceptance:*
  - on the fixture tree every number equals a hand count, using the §8
    counting rules;
  - gaps are listed;
  - Term 1 and Term 2 follow `subject-terms.jsonl`;
  - the HTML has no external requests and renders in RTL and LTR;
  - the exam-template numbers come from `combinatorics.js` and carry
    lower-bound flags;
  - sessions are never summed into question totals.
- *Tests:* `content-reports.test.js`.

**Parallelism:** WP1 first (small, 1–2 days; it now includes `expr.js`, the
node-tree fixture and every schema, including the runtime-bank formats).
Then WP2, WP3, WP4, WP5 and WP6 in parallel (WP4 uses WP1's `expr.js`; WP6
codes against the node-tree fixture and merges after WP2). Then WP7 (needs
the WP6 engine and RPC fixtures), WP8, WP9 and WP10 in parallel. Every package passes `npx eslint` on its files, `npm test` and (for
WP7) `npm run test:db` before merging.

### 9.2 Content-production runs (separate from code packages)

| Run | Tool | Input → output | Gate |
|---|---|---|---|
| R1 Discovery | `ien-crawl.mjs` | iEN API → `sources/ien/*` (done 2026-09-26; rerun monthly) | crawl-report has no errors |
| R2 Normalization | `build-curriculum.mjs` | crawl + catalog → `curriculum/**`, `resources.jsonl`, outline | `validate-staging` |
| R3 Front matter (all 315 files, **resumable over days**) | `pdf-frontmatter` on the shared queue (≤ 2 in flight, breaker), then `extract-pdf --pages cover,toc` and `vision-queue` for untrusted covers/TOCs | existing 65 rows are partial inputs → term evidence, TOC, partial page maps; coverage reported as n/315 | term evidence reviewed; catalog term correction applied only for verified membership |
| R4 Full extraction (**only subjects in the current generation batch**) | `fetch-books`, `extract-pdf`, `pdf-render` + `vision-queue` for untrusted/figure pages | → page maps, exercise index, cache text and transcripts, lesson page ranges | TOC ↔ iEN audit reviewed |
| R5 Generation (pilot K07 math, science, Arabic; then by grade) | `make-packets` (text + page images), Claude subagents, `ingest-candidates` | → candidates | yield, failure rate, time and calls per 100 items recorded |
| R6 Validation | `check-questions`, Claude validators and evidence extractor, `exchange` (ChatGPT blind solve 100 % in the pilot, Gemini), `resolve-validation`, human review | → validation records, statuses | the §4.4 matrix |
| R7 Dedup + variants | `dedup`, `build-variants` | → clusters, variants | |
| R8 Publish decision | owner edits `registry.json` `publish_policy` | → publishable set | explicit owner decision |
| R9 Pack + import | `export-exam-templates`, `pack-runtime-bank`, `import-staging --target pglite` (and `supabase` when a project exists) | → runtime bank, DB | import report clean |
| R10 Reports | `report.mjs` | → §8 reports | numbers are traceable to files |

### 9.3 Session 1 definition of done, throughput and verification

**Session 1 is done when:** WP1–WP7 and WP10 are merged on the
`content-engine` branch (WP3 reusing the existing scripts; WP7 proven on
PGlite only), and R2, R3 (as far as the queue allows, reported as n/315),
R4–R7, R9 (PGlite + runtime bank) and R10 have run **on the pilot only**:
middle/grade-1 math, science and Arabic, with the exact lesson count taken
from `lessons.jsonl` and written in the run manifest (math alone has 84 iEN
lessons). WP8 and WP9 follow if time remains; everything else (other
grades, the Supabase import, aptitude generation, pattern/logic
categories) goes to known gaps with a named next run.

**Throughput model.** Every R5/R6 run logs, per 100 items: generated,
accepted, subagent calls (generation, vision, validation, evidence),
cross-AI batches, wall time and human-review minutes. The full-bank effort
(10,102 lessons) is **projected** from these measurements in
`question-stats.json`, labelled "projection", never presented as done work.
**Stop rule:** if the pilot's accepted yield is below 50 % or blind-solve
disagreement above 10 %, generation does not scale beyond the pilot until
the prompts are revised and a second pilot passes.

**Verification map** (`data/staging/reports/verification.md`, generated by
WP10 from this table):

| Requirement | Command / test | Artifact |
|---|---|---|
| Schemas and staging integrity, copyright rules | `npm run content:validate -- --budget` | exit 0, `manifest.json` |
| Curriculum mapping and terms | `content-curriculum-build.test.js`, `curriculum-outline.test.js` | `curriculum/**`, `coverage.md` |
| PDF extraction, Arabic repair, polite fetching | `content-pdf.test.js`, `content-fetch-queue.test.js` | `extraction.jsonl`, `queue.jsonl` status |
| Generation/validation contract | `content-checks.test.js`, `content-exchange.test.js`, `content-legacy.test.js` | `validation.md`, run manifests |
| Dedup and variants | `content-dedup.test.js`, `content-templates.test.js` | `duplicates.md` |
| Engine, tokens, guest API | `engine-*.test.js`, `server-routes.test.js` | `exam-templates.md` |
| DB, RLS, attacks, import, perf | `npm run test:db` (`content-*.test.js`) | import report |
| UI (if in session) | `exams-types.test.js`, `learn.test.js`, `scripts/shot.mjs` at 375 px RTL/LTR | screenshot set under the cache |
| Reports and counts | `content-reports.test.js` | `coverage.md`, `quality.html`, `resources.md`, `question-bank.md` |
| Everything | `npm test`, `npm run test:db`, `npm run build` | branch head commit hash in the final report |

Deliverables not covered by a script (files created or modified, known
gaps, the commit hash) are listed in the final report on the branch.

---

## 10. Known gaps and open decisions

1. **No production database** (billing). Everything is proven on PGlite. The
   Supabase import is a later run.
2. **`LOCAL_EXAM_SECRET`** should be set on Vercel (Production + Preview) by
   the owner. Until then live practice keeps working on a secret derived
   from existing server secrets (with a logged warning); the owner then sets
   `EXAM_SECRET_REQUIRED=1`. Nothing returns `503` by default.
2a. **Terms are mostly undeterminable from the books.** No cover in the
   front matter read so far names a term (§0). Expect most resources and
   subject-term memberships to stay `needs_review`, `term-exam` to be
   offered rarely, and the catalog correction to change little, until the
   owner records `owner_decision` rows or the plan guide corroborates.
2b. **iEN throttling** limits R3/R4 to what the queue budget allows; full
   front-matter coverage may take days. Coverage is reported as n/315.
2c. **Guest check locks are server-side** (`ce_guest_check_locks`, §5.8), so
   one check per (session, position); receipts make check-then-change
   useless for score. Remaining gaps: without a service role (or before
   0014) the lock falls back to per-instance memory, which a guest could
   evade by hitting another instance; a guest can still see keys up to the
   per-IP key-reveal cap and verdicts up to the grading cap (`exams.grades`),
   and IP-based caps are weaker against many addresses.
2d. **The runtime bank is a pre-DB fallback** capped at ~60k items / 40 MB.
   The "hundreds of thousands" target needs the DB.
3. **Publishing derived questions from iEN textbooks** needs the owner's
   `publish_policy` decision (§2.3). Staging and PGlite work proceeds
   meanwhile.
4. **The 1448 study plan** is not verified. The catalog year stays 1447; books
   show 1448.
5. **Scanned, figure and equation pages** are read by Claude vision from
   `pdf-render` images (§4.2); no separate OCR tool. Vision throughput is a
   measured cost of R4 and may limit how many pages are transcribed.
6. **Figures:** items may be derived from figures and tables read by vision,
   but must carry a text stimulus with changed data (≤ 12 copied cells).
   Media in items needs a later schema revision.
7. **Aptitude categories** "pattern recognition" and "logic" need a
   vocabulary change in `catalog.js`, the SQL `exam_section_topics` and the
   i18n topic labels (a follow-up package after WP7 and WP8). Until then,
   such items map to existing topics or wait.
8. **Semantic embeddings** are not available offline. Semantic dedup is by
   subagent adjudication of borderline pairs only.
9. **DeepSeek is unavailable.** The multi-AI plan uses three systems, and the
   run manifests say so.
10. **Teacher guides and activity books:** iEN reports teacher-guide counts
    but no listing endpoint was found. No resource rows are invented;
    counts are recorded on the subject's `source_refs`.
11. **Owner decisions:**
    - whether the UI discloses that practice questions are prepared with AI
      assistance and validated (without naming a provider);
    - the separate `practice` daily quota (30/day free).
12. **Middle-1 Arabic has no lesson → page mapping** (0 of 91 lessons): the
    book's table of contents is a grid (units as columns; a row of section
    titles such as «نصوص الوحدة», «الاستماع» followed by a «ص» row of page
    numbers), while the TOC matcher reads one entry per line, so it pairs
    titles with the wrong numbers and maps no lesson. Fix: a grid-aware TOC
    parser (column-aligned title and page rows), then generation. No
    Arabic questions are generated until a mapping (owner- or
    agent-audited, with evidence) exists; nothing is guessed.
13. **The Gemini language review is lenient.** In the 2026-09-27 pilot it
    passed 270 of 271 reviewed items (one number–noun agreement warning),
    and the web app switched itself from its Pro to its Flash model partway
    through. Deterministic L-checks and the Claude validator remain the
    primary language gate; the Gemini sample is a secondary signal.
14. **Templates do not inflect counted nouns.** A stem like «{a} ريال» is
    correct Arabic only for some numbers (3–10 take the plural, 11–99 the
    accusative singular «ريالًا»). Template authors must avoid counted nouns
    after a parameter (write «المبلغ بالريال» or put the unit in a label)
    until an agreement helper exists; Gemini flagged one such variant.

---

## Appendix A — Normalization table (`src/lib/content/normalize.js`)

Version **n2** (content hashes carry `n2:`). SQL twin: `search_normalize_v2`
(0014); the 0012 `search_normalize` (no NFKC, no punctuation handling) is
left untouched and unused by new code.

| Step | `searchNormalize` v2 (= SQL `search_normalize_v2`) | `normalizeForDedup` (adds) |
|---|---|---|
| Pre-NFKC | superscript digits → `^n`, vulgar fractions → `n/d` | — |
| Unicode | NFKC (JS `normalize("NFKC")`, PG `normalize(x, NFKC)`) | `lam_order_fold` |
| Marks | strip U+064B–065F, U+0670, U+06D6–06ED, tatweel U+0640 | — |
| Letters | أ إ آ ٱ → ا · ى ئ ی → ي · ؤ → و · ة → ه · ک → ك | — |
| Digits | U+0660–0669, U+06F0–06F9 → 0–9 | `٫` → `.`, drop `٬` |
| Symbols | — | U+2212 → `-`, `×` → `*`, `÷` → `/`, `٪` → `%` |
| Case / space | lower-case Latin; strip U+200B–200F, U+202A–202E, U+2066–2069; punctuation (`. , ، ؛ ؟ ? ! : « » " ' ( )`, except `.`, `,`, `٫` between digits) → space; collapse whitespace, trim | operators kept as tokens |

## Appendix B — Deterministic check codes

| Code | Severity | Check |
|---|---|---|
| S001 | fail | schema |
| S002 | fail | id format, uniqueness, frozen id unchanged |
| S003 | fail | curriculum refs resolve; lesson is `kind: lesson`, `status: verified`; term copied from lesson |
| S004 | fail | source pages within the resource and the lesson's range |
| S005 | fail | generator set a forbidden field |
| O001 | fail | option count per type; options non-empty and distinct after normalization |
| O002 | fail | answer references an existing option, pair, item or accepted value |
| O003 | fail | exactly one correct option (mcq / true_false) |
| O004 | fix | all/none-of-the-above, combined, numeric or ordinal options → `fixed_order_reason`, `shuffle_options=false` |
| O005 | warn | longest option > 2.5 × median length (length cue) |
| O006 | warn | answer text appears verbatim in the stem |
| O007 | fail | matching right column ≥ left; ordering has 3–7 items; short-answer accepted ≤ 10, each ≤ max_chars |
| O008 | fail | explanation refers to an option by letter or position |
| O009 | fail | ids reveal the answer (matching `r_i`↔`l_i` pairing, ordering ids ascending in answer order, option ids in authoring order when the answer is always first/last) |
| O010 | fail | `short_answer` tagged `spelling`, `diacritics` or `i3rab` without `match: exact_marks` |
| E001 | fail / warn / review | each evidence quote (normalized, `lam_order_fold`ed) is a substring of the cited page's repaired text or vision transcript; not found in a vision transcript or `ok` text → fail for `source_derived`/`transformed`; not found in a `repaired` text layer (garbled letters, joined words) → warn, which makes the item high-risk so the evidence extractor checks the image; page not yet readable → `not_checked`, `review_required` |
| V001 | fail | a rewrite variant keeps the parent's objective, difficulty and solution method |
| N001 | fail | numeric answer parses; tolerance valid |
| N002 | fail | `computation` recomputed (exact rationals) equals the key; required for computation items |
| N003 | fail/warn | unit present when required; units consistent across stem, answer and explanation (SI + Arabic unit table) |
| N004 | fail | numeric distractors differ from the answer and from each other |
| L001 | fail | script matches `language` (Arabic items: Arabic letters ≥ 50 % of letters outside math; English items: no Arabic outside quotes) |
| L002 | fail | no Persian ی/ک, no bidi controls, no NBSP, no double spaces; tatweel only on a single-letter token (vertex labels «أ ب جـ», «∠هـ», the Hijri «1445هـ», a detached «لـ ط») or in the بـ/لـ/فـ + Latin form, never stretched inside a word |
| L003 | warn | Arabic stems end with `؟` or a givens block, not `?` |
| L004 | fail | no Arabic presentation forms (U+FB50–FDFF, U+FE70–FEFF), allowlist ﷺ ﷻ; math and science symbols (² ³ ½ µ ℃ Å) are allowed |
| L005 | fail | one digit system per item |
| L006 | warn | ASCII hyphen used as a minus between numbers |
| L007 | fail | balanced brackets and quotes |
| L008 | fail | length limits (stem ≤ 4000, option ≤ 1000, explanation ≤ 8000) |
| P001 | fail | provenance complete; origin valid for scope |
| P002 | fail | `official` is false |
| P003 | fail | forbidden labels (official, وزاري, قياس, «من اختبارات») |
| P004 | fail / review | verbatim copying: char-5-gram containment of the item text in the page's repaired text or vision transcript above the calibrated threshold (≈ a 12-word run), except permitted quote kinds ≤ 200 chars; page without trustworthy text → `not_checked`, `review_required` |
| P005 | fail | figure reference without a text stimulus; a figure/table-derived stimulus copying > 12 cells or keeping the book's data unchanged |
| P006 | fail (for `validated`) | explanation missing; math and numeric items need ≥ 1 step containing the computed answer; science and language items need non-empty text. Missing → `review_required` |
| D001 | fail | exact-duplicate hash already present |

---

## 11. Decisions log

Review round 2 (2026-09-26): two critics, 49 findings, plus four new facts
(page renders via `pdf-render.mjs`, front matter via `pdf-frontmatter.mjs`,
CDN throttling, `catalog-map.jsonl`). Ids below are the finding order
(C1…C49). Duplicates between the critics are resolved once and cross-referenced.

| Id | Severity | Finding | Resolution |
|---|---|---|---|
| F1 | fact | Page images available | Packets and validation packets carry `pages[].image` + `text_quality`; vision replaces the OCR skip (§4.2, §4.3, §4.4). |
| F2 | fact | Front-matter script and output exist | Owned by WP3, one cache layout, rows cleaned to ≤ 80-char snippets, `term_*` keys ignored (§3, §9.1). |
| F3 | fact | CDN throttling | Shared persisted queue, ≤ 2 in flight, backoff, breaker, hourly budget (§4.1). |
| F4 | fact | `catalog-map.jsonl` | WP2 input with `origin: agent_audit`, deterministically verified (§2.5). |
| C1 | blocker | `content_hash` (answer-derived) leaked via token `h` and a readable column | Token carries `r` (revision ints); `content_hash` not granted to clients (explicit column list); brute-force attack tests (§5.8, §6.1). |
| C2 | blocker | matching/ordering ids reveal the key | Client sees and sends display indexes only; `display_map`; opaque HMAC ids; `O009`; attack tests (§2.8, §5.4). |
| C3 | major | Check-then-submit and mid-attempt score reads | Locked positions ignored in submit/finalize; `score`/`is_correct` null until lock/finalize; tests (§5.8, §6.2). |
| C4 | major | In-place import re-grades old attempts | `question_revisions` (append-only, no grants); revision guard voids mismatched items; history shows answered revision (§5.8, §6.1, §6.3). |
| C5 | major | Retire mass-deactivates on partial runs; retire/dedup order | Explicit `removed[]`, scoped to fully covered (shard, subject); refused for `--only`/errors/filtered sets; retire runs before inserts; dedup vs manifest (§6.3). |
| C6 | major | Guest gaps (lock, scraping, premium, seed) | Signed check receipts (lock advisory then; enforced server-side since S4), per-IP key-reveal cap, premium excluded everywhere, server-only seed (§5.2, §5.8, §10). |
| C7 | major | Runtime bank memory, multi-shard scopes, capacity, path traversal | Selection indexes + content chunks loaded per pick, 64 MB byte-bounded LRU, guest scope caps, whitelist index, documented ~60k cap (§3, §5.3, §5.8). |
| C8 | major | Whole pools to Node; `u()` over the bank | `ce_guest_start` selects in SQL and returns n rows; `scope_pool_members`; scope cap 5,000; PGlite perf test at 200k (§5.8, §6.2, WP7). |
| C9 | major | Lam-ligature swaps, split letters, font garbage | Repair passes validated by a lexicon, `font_garbage` flag, `text_quality`, vision fallback, `lam_order_fold` for matching, P004 as char-5-grams (§4.2, App. B). Same as C27. |
| C10 | major | Packets text-only; image handling rules missing | `pages[].image`, `text_quality`; images and transcripts cache-only, never to ChatGPT/Gemini; vision transcript feeds P004/E001; ≤ 12 copied cells and changed data (§3, §4.3, §4.4). Same as C29. |
| C11 | major | `search_normalize` change breaks stored columns; JS/SQL short-answer drift | New `search_normalize_v2` in 0014, v1 untouched; `accepted_norm` computed in SQL; `n2:` hash prefix; shared cases (§2.8, §6.1, App. A). |
| C12 | major | L004 fails ² ½ ℃; NFKC conflates x² and x2 | L004 limited to Arabic presentation ranges with ﷺ/ﷻ allowlist; superscripts/fractions mapped before NFKC (§4.5, App. A/B). |
| C13 | major | `1,250` parsed as 1.25 | Strict thousands-group rule, `ambiguous_separator` error, grading cases (§2.8). |
| C14 | major | LSH recall, short stems, commutation, prefix stripping | Exhaustive within lesson/page group, LSH 32×3 across lessons only, 1+2-shingles + char 4-grams, `J(∅,∅)` defined, commutative canonicalization, prefix stoplist, calibrated pair set (§4.5). |
| C15 | major | Single-valued exclusion group collapses lessons | Conflict-edge components with cap K = 8, no edge from `numeric_variant`, `member_of` edges, component sizes in combinatorics (§2.9, §4.5, §5.6). |
| C16 | minor | Id collision on exact duplicates; hashed ids rename | D001 on equal content; next hex only on differing content; id registry with aliases (§2.2). |
| C17 | major | WP4 needs WP5's `expr.js` | `expr.js` moved to WP1 (§9.1). |
| C18 | major | WP6/WP7/WP2 contract gaps | Runtime-bank schemas in WP1; `pack-runtime-bank` moved to WP6; node-tree fixture (WP1), WP6 merges after WP2; RPC contract fixtures owned by WP6 and used by WP7 (§5.8, §9.1). |
| C19 | minor | Unowned new files, no schemas | pdf-render/pdf-frontmatter/ien-crawl edits owned by WP3; schemas for every staging file; unknown files fail validation; ≤ 80-char snippets (§3, §9.1). |
| C20 | major | Fetch politeness and Windows path safety | Shared resumable queue, ≤ 2 in flight, jittered backoff on refusals/429/503 with `Retry-After`, breaker, hourly budget, full downloads only for the generation batch, sanitized contained paths (§3, §4.1, §4.2). Same as C32. |
| C21 | minor | `search_content` exposes school stems to anon; no rate limit | Anon via the rate-limited route; question hits lesson-level for signed-in only; min query length; `statement_timeout` (§6.2, §7). Same as C47. |
| C22 | minor | `p_retake_of` not ownership-checked | Ownership check → `not_found`; attack test (§5.8, §6.2). |
| C23 | minor | Untimed deadline mismatch; v1 secret length; shared raw key | 7 days everywhere; v1 keeps ≥ 16 and its key; HKDF keys for v2/receipts; cross-verification tests (§2.13, §5.8). |
| C24 | minor | Two JS graders | `answers.js` is the only grader; `grade.js` maps indexes; cases run through the route path (§2.8, WP6). |
| C25 | minor | Folding accepts wrong spelling/diacritics | `match: exact_marks` + `O010` (§2.8). |
| C26 | blocker | No cover states the term; per-term model unsupported | Stated as the expected outcome (§0, §1.5, §10 2a); ranked evidence routes (vision TOC with two reads, plan guide, corroborated course codes, `owner_decision` shown "unconfirmed"); strict regex; front-matter `term_*` keys ignored; coverage leads with "term undeterminable" (§2.4, §4.2, §8). |
| C27 | blocker | Ligature/digit corruption breaks matching | See C9; digit groups read only from unambiguous runs or vision; repair rate per book, `ligature_fixed` (§4.2). |
| C28 | blocker | Mandatory secret would 503 live practice | Opt-in `EXAM_SECRET_REQUIRED=1`; default derives a stable secret from existing server secrets with a warning; feature branch; pre-merge env check (§0, §5.8, §10 2, WP6). |
| C29 | major | `ocr_needed` skip; text-only math packets | See C10; `ocr_needed` removed; vision cover/TOC data verified only with two agreeing reads; P005 kept (§2.4, §4.2). |
| C30 | major | Generator attests its own evidence | `E001` substring check on text or transcript; independent evidence extractor for high-risk items (§4.4, App. B). |
| C31 | major | Quotes and snippets committed | Quotes in a cache sidecar; committed `{pdf_page, quote_sha256, char_offsets}`; ≤ 80-char excerpts; no `cache_dir`; enforced by `validate-staging` (§1.3, §2.8, §3). |
| C32 | major | Fetch limits contradict throttling | See C20; R3 resumable over days, coverage n/315, never evasive (§4.1, §9.2). |
| C33 | major | Stale tooling facts; duplicate caches | §0 updated; one cache layout (`ien/pdf`, `ien/text`, `ien/pages`); `fetch-books` reuses `ensurePdf`; existing outputs are R3 inputs (§3, §4.2, WP3). |
| C34 | major | `part` and `year_label` from file names | Listing/cover first, file name as cross-check; both year sources recorded, mismatch → `needs_review` (§2.4, WP2). |
| C35 | major | `catalog-map.jsonl` ignored | See F4; reconciliation test in WP2 (§2.5). |
| C36 | major | Over-scoped, no cut line or throughput model | §9.3 Session 1 definition of done (pilot only), measured throughput per 100 items, labelled projection, stop rule. |
| C37 | major | Agent roles unmapped; high-risk undefined; correlated validators | Role table; high-risk defined; 100 % ChatGPT blind solve for high-risk and for the whole pilot; browser procedure and cadence; why page content never goes to third parties (§4.4). |
| C38 | major | Legacy 300 published with structural checks only | Stage 2 + blind solve on all 300; disagreements `review_required` and out of template pools; legacy RPCs unchanged (§4.4, §5.9). |
| C39 | major | No context/representation variants | Declared rewrite variants, `V001`, parent's exclusion component, counted as variants (§2.8, §4.3, §4.5, §4.6). |
| C40 | major | Combinatorics overstates | Per template × scope only, no cross sums (asserted), by-component and with-variants figures, reuse and pool size as headline, display permutations separate (§5.6, §8). |
| C41 | major | No aptitude/achievement contract | §4.3b: aptitude needs two blind solves and a strategy explanation; achievement via a provenance-backed Qiyas alignment or `needs_review`; prep nodes in `learner_node_stats`. |
| C42 | major | Free cap below template minimums | Tier clamping; only `full-year` needs `count.mini = 25`; template × tier tests (§2.12, §5.3). |
| C43 | minor | Retake changes stratum subset | Allocation stored in `meta`, reused by retakes (§2.13, §5.3). |
| C44 | minor | Missing explanation only a warning | P006 fails for `validated` (App. B). |
| C45 | minor | No itemized exercises | `exercise-index@1`, used in packets and coverage gaps (§2.6, §4.3, §8). |
| C46 | minor | Counting rules for pages/sources/PDFs | Defined and tested (§8). |
| C47 | minor | Anon question snippets | See C21. |
| C48 | minor | No verification map; no perf load test; work on `main` | §9.3 verification map and `verification.md`; PGlite 200k perf test; 375 px screenshots; feature branch and commit hash (header, §9.3). The section is §9.3, because §11 is this log. |
| C49 | minor | Curriculum changes not surfaced | `changes-<date>.jsonl` from `crawl-diff.mjs`, summarized in coverage (§4.1, §8). |

Rejected or partly adopted:
- C6 option "guest lock enforced": without server state it cannot be
  enforced. Receipts remove any score gain, and the lock is documented as
  advisory. *Superseded by Security round 3 (below): the lock is now
  enforced server-side.*
- C7 "hundreds of thousands in the runtime bank": rejected. The bank is a
  capped fallback, and that scale needs the DB.
- C23 "HKDF for v1": not adopted, because it would invalidate live v1
  tokens. Domain separation holds because v2 keys differ from the v1 key.

### Security round 3 (2026-09-27)

Guest-session hardening; the code is the reference, §5.4, §5.7, §5.8 and §10
describe it.

| Id | Finding | Resolution |
|---|---|---|
| S1 | The token's clear payload listed canonical keys and the seed, so a browser could recompute displays and correlate items across sessions | `sd`, `q`, `r` sealed with AES-256-GCM under an HKDF key (`jz.exam.v2.enc`), AAD `"jz.exam.v2|" + sid`; only the header stays readable (§5.8). |
| S2 | Canonical question keys reached the browser | Per-session opaque handles `h-…` (HMAC under `jz.exam.handle`) in `/start` and `/submit`; `/check` uses positions (§5.7, §5.8). |
| S3 | Ids and hashes could test candidate answers | Question ids hash answer-free `questionIdMaterial` only (`questionIdHash` refuses `answer`); `content_hash` includes the answer and stays server-only (never in tokens or client grants) (§2.2, §6.1). |
| S4 | Check-wrong, read key, check-right, keep the better receipt | The first `/check` per (session, position) is locked server-side: `ce_guest_check_locks` + `ce_guest_check_lock()` (service role), in-memory fallback; a different response → `409 item_locked`. No longer advisory (§5.8, §10 2c). |
| S5 | Verdicts past the key-reveal cap are an answer oracle via replayed `/submit` | Per-IP daily grading budget, bucket `exams.grades`, `EXAM_GRADE_DAILY` (default 2 × key-reveal cap); past it `429 rate_limited`, nothing graded (§5.8). |
| S6 | The ordering swap rule made the answer the one order never shown | Removed; display maps never depend on the answer (§5.4). |
| S7 | The guest seen list was plain keys from the browser | Sealed `s1.` blob (AES-256-GCM, deflate, `jz.exam.seen`), issued by `/start` and echoed back; an unopenable blob is ignored (§5.3, §5.8). |
| S8 | Runtime bank lacked objectives, so `lesson-quiz` could not stratify by objective | Selection rows have 10 columns incl. `objective`; `lesson-quiz` stratifies by objective, falling back to the lesson when null (§5.8). |

### Pilot run fixes (2026-09-27)

Found while running the pilot (78 lessons of middle-1 math and science, the
legacy 300 and 153 templates) through the pipeline; each has a test.

| Id | Finding | Resolution |
|---|---|---|
| P1 | No path from a template draft to staging, and nothing turned validated previews into a validated template | `ingest-templates.mjs`, `promote-templates.mjs`, `prompts/template.v1.md` (§4.6). |
| P2 | Template ingest set `license_status: internal` on templates that cite a textbook resource, so every preview failed P001 | The template carries the cited resource's license (§4.6 step 2); publication stays governed by the publish policy. |
| P3 | L002 rejected standard notation: vertex labels «أ ب جـ», «∠هـ», the Hijri «1445هـ», «لـ ط» | Tatweel allowed on a single-letter token; still a failure inside a word (App. B). |
| P4 | N002 could not read template mixed numbers («3 3/16»), customary units (بوصة، قدم، ياردة، ميل، رطل، كوب), rates («ريالًا / ساعة») or count nouns («6 مثلثات») and rejected correct items | `optionNumber` reads mixed numbers and a trailing Arabic count noun; `units.mjs` gained customary length/mass/volume, week/month/year, «كلم» and composite rates. |
| P5 | E001 rejected quotes that are on the page image but garbled in the repaired text layer | A miss in a `repaired` text layer warns (high-risk → evidence extractor); a miss in a transcript or clean text still fails (App. B). |
| P6 | A re-check (`--all`) that passed left the old `rejected`/`review_required` status | A passing re-check sets `candidate` and drops the stale deterministic review-queue row. |
| P7 | make-packets, exchange sampling and add-records read the *first* deterministic record, not the latest | `latestRecord(bank, q, role)` everywhere (resolve already used the latest). Re-export after the fix added 64 ChatGPT and 14 Gemini items. |
| P8 | A check run invoked per subject kept only the last invocation's counts | Run manifests keep `scopes.<scope>` and a summed `counts`; a no-op rerun leaves counts alone. |
| P9 | Nothing implemented `validated → published`, so no new item could reach the runtime bank | `publish.mjs` (§2.15); iEN-derived items stay `validated` while `ien.publish_policy` is `pending_owner_decision`. |
| P10 | 26 templates put a counted noun after a parameter («{a} ريالات»), wrong Arabic for some numbers | Ingest rule T003 rejects such drafts; `promote-templates` sends existing ones to review; the author prompt forbids it. |
