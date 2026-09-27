# data/staging

Canonical content data for the content engine. The design is
[docs/CONTENT_ENGINE.md](../../docs/CONTENT_ENGINE.md) (§2 data model, §3
layout); this file is the short version. Every file here has a JSON Schema in
[`data/schemas/`](../schemas) and is checked by
`npm run content:validate` (`scripts/content/validate-staging.mjs`).
**An unknown file fails validation.**

```
manifest.json                         every data file: path, schema, sha256, lines, bytes;
                                      published keys per shard; removed[] (import retire list)
sources/registry.json                 source@1 rows (JSON array sorted by id; publish_policy lives here)
sources/ien/{nodes,books,lessons}.jsonl, crawl-report.json   raw crawl (ien-node/-book/-lesson@1)
sources/ien/book-frontmatter.jsonl    book-frontmatter@1 (snippets ≤ 80 chars, no cache_dir, no term_* keys)
sources/ien/changes-<date>.jsonl      crawl-changes@1
sources/research/catalog-map.jsonl    catalog-map@1 (origin: agent_audit — verified by WP2, never trusted as is)
sources/research/term-evidence.json   research-claims@1
curriculum/nodes/<stage>/<grade>[-<track>].jsonl     curriculum-node@1
curriculum/objectives/<stage>/<grade>[-<track>].jsonl objective@1
curriculum/{owner-decisions,id-registry,subject-terms,audit,prep-alignment}.jsonl, ien-mapping.json
resources/{resources,term-evidence,extraction}.jsonl  resource@1, term-evidence@1, extraction@1
resources/toc/<resource>.json, page-maps/<resource>.jsonl, exercise-index/<resource>.jsonl   (no body text)
questions/<stage>/<grade>[/<track>]/<subject>[.pNN].jsonl   question@1
questions/prep/<exam>-<section>.jsonl                      question@1 (aptitude / achievement, legacy 300)
questions/stimuli/<same shard path>.jsonl                  stimulus@1
question-variants/templates/<shard>.jsonl                  question-template@1
question-variants/<shard>.jsonl                            question@1 (template variants, v-… ids)
exams/templates.json, exams/blueprints/<stage>.jsonl       exam-template@1, exam-blueprint@1
validation/records/<shard>.jsonl, dedup-clusters.jsonl, review-queue.jsonl, review-decisions.jsonl
validation/runs/<run_id>.json                              run-manifest@1
validation/exchange/                                       cross-AI batches (git-ignored, never validated)
reports/                                                   generated reports (§8)
```

## File rules

- UTF-8, LF, no BOM, final newline. JSONL: one compact record per line, keys
  in schema order (`stringifyRecord()` in `scripts/content/lib/schemas.mjs`),
  sorted by `id` (page maps by `pdf_page`; see `PATH_RULES`). JSON files are
  2-space pretty-printed. A rerun without changes produces no diff.
- Shards split at 4 MB into `.p01.jsonl`, `.p02.jsonl` … by sorted id ranges
  (`writeShards()` in `scripts/content/lib/jsonl.mjs`).
- Records carry `schema: "<name>@1"`. It is required on `question@1`,
  `question-template@1`, `manifest@1` and the runtime-bank files, and
  optional (but checked when present) elsewhere, because the crawl tables,
  `catalog-map` and older rows predate the tag.
- Term evidence that is not read from a page (listing title, plan guide,
  course code, owner decision) uses `pdf_page: 0` (`te-<resource>-p0-<term>`).

## Copyright rules (§1.3)

- No textbook body text, page renders or vision transcripts here: they stay in
  the content cache (`C:/jazira/content-cache` or `$CONTENT_CACHE_DIR`).
- Excerpts (`headings`, `excerpt`, `snippet`, TOC `title`) are ≤ 80 chars.
- Question evidence commits `{pdf_page, quote_sha256, char_offsets, quote_kind}`
  only; the quote text lives in the cache sidecar `evidence/<shard>.jsonl`.
- No absolute paths (`cache_dir`, `C:/…`) and no `.jpg`/`.png` outside the
  image manifest.

## Commands

```bash
npm run content:validate                       # all checks (exit 0 ok, 1 invalid, 2 usage)
npm run content:validate -- --budget           # + size budgets (200 MB staging, 40 MB runtime bank)
npm run content:validate -- --changed          # only files changed in git (references still resolve globally)
npm run content:validate -- --write-manifest   # regenerate manifest.json after a run
```
