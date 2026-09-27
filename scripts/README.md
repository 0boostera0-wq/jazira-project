# Scripts

Node scripts (no build step; run from the repository root).

| Script | What it does | Usage |
|---|---|---|
| `check-assets.mjs` | Image library manifest (`src/lib/assets.js`) ↔ files ↔ usages: every rendition exists at the right size and within budget, entries document their pages/purpose/sizes/priority, no orphan or retired files in `public/images`, every id is referenced, no broken `/images` paths | `npm run assets:check` · `node scripts/check-assets.mjs --usage` (also lists the files that reference each id) |
| `process-illustrations.mjs` | Renders the library from its originals (1536×1024 PNG, kept outside the repo in `design-source/raw/`): WebP renditions at every loader width into `public/images/<category>/` + the placeholder colours (`src/lib/asset-colors.js`) — see docs/ART_DIRECTION.md | `npm run assets:process` · `node scripts/process-illustrations.mjs landing.hero` · `--src <dir>` |
| `find-orphans.mjs` | Modules under `src/` that nothing imports (dead code) | `node scripts/find-orphans.mjs` |
| `shot.mjs` | Visual + accessibility QA with the local Chrome: screenshot, horizontal overflow measured against the requested width, console errors, axe-core (plus a computed contrast scan on Arabic pages) | `node scripts/shot.mjs /en/exams out.png --w=390 --h=844 [--full] [--dark] [--auth] [--axe]` |
| `build-question-seed.mjs` | Validates `src/content/questions/*.json` and writes the deterministic SQL seed `supabase/migrations/0011_seed_questions.sql` | `node scripts/build-question-seed.mjs` · `--check` (validate only, writes nothing) · `--in` / `--file` / `--out` / `--stdout` — see docs/DATA_API.md |
| `build-curriculum-manifest.mjs` | Builds `src/content/curriculum/manifest.json` from the catalog + verified research; refuses on any mismatch | `node scripts/build-curriculum-manifest.mjs` · `--check` (verify only) — see docs/CURRICULUM.md |
| `import-curriculum.mjs` | Imports approved curriculum PDFs once into your own store (details below) | `npm run import:curriculum` · `--dry-run` · `--list-keys <prefix>` · `--emit-manifest <prefix>` |

`curriculum-sources.example.json` shows the importer's input format. Tests
live in `tests/` (`npm test`, `npm run test:db`).

---

# Content engine scripts (`scripts/content/`)

The content pipeline of [docs/CONTENT_ENGINE.md](../docs/CONTENT_ENGINE.md):
discovery → curriculum → PDF extraction → generation → validation → dedup →
variants → runtime bank / DB import → reports. Every script reads and writes
`data/staging/` (layout and rules: [data/staging/README.md](../data/staging/README.md))
and the content cache outside the repo (`C:/jazira/content-cache`, override
`CONTENT_CACHE_DIR`). Textbook PDFs, page text, page renders and vision
transcripts stay in the cache and are never committed. Every request to
`*.ien.edu.sa` goes through the shared, persisted fetch queue (≤ 2 in flight,
backoff, circuit breaker, hourly budget; §4.1).

| npm script | File | Package | What it does |
|---|---|---|---|
| — | `ien-crawl.mjs` | WP3 | iEN discovery crawl → `sources/ien/{nodes,books,lessons}.jsonl`, `crawl-report.json` (API cache in `ien/api/`) |
| `content:validate` | `validate-staging.mjs` | WP1 | Schemas, referential integrity, ids, sort order and canonical form, shard layout, budgets (`--budget`), `manifest.json` (`--write-manifest`), copyright rules (≤ 80-char excerpts, no quotes in questions, no absolute paths, no stray images), append-only id registry, runtime-bank index. Exit 0 ok · 1 invalid · 2 usage. Flags: `--changed`, `--root <dir>`, `--runtime <dir>` / `--no-runtime`, `--registry-baseline <file>\|none`, `--json` |
| `content:curriculum` | `build-curriculum.mjs` | WP2 | Crawl + catalog + evidence → curriculum nodes, `subject-terms.jsonl`, `ien-mapping.json`, `audit.jsonl`, `resources.jsonl`, app outline |
| `content:frontmatter` | `pdf-frontmatter.mjs` | WP3 | First 14 pages per book (range reads or the cached PDF) → cache `ien/text/<stem>/pNNN.txt` + `book-frontmatter.jsonl` |
| `content:render` | `pdf-render.mjs` | WP3 | Page → 1100 px JPEG via pdf.js in local Chrome → cache `ien/pages/<stem>/pNNN.jpg` |
| `content:fetch` | `fetch-books.mjs` | WP3 | Full PDF downloads for the current generation batch only (resumable `.part`, `%PDF-`/size/sha256 checks, `--max-gb`) |
| `content:extract` | `extract-pdf.mjs` | WP3 | Text layer → lines, Arabic repairs, printed pages, TOC, term evidence, page maps, exercise index |
| `content:vision` | `vision-queue.mjs` | WP3 | Vision jobs for untrusted/figure pages; imports transcripts into the cache |
| `content:packets` | `make-packets.mjs` | WP4 | Generation packets (page text + images) into cache `packets/<run>/` |
| `content:ingest` | `ingest-candidates.mjs` | WP4 | Generator output → `question@1` candidates (ids, hashes, opaque option ids, evidence sidecar) |
| `content:check` | `check-questions.mjs` | WP4 | Deterministic checks (Appendix B) → validation records |
| `content:exchange` | `exchange.mjs` | WP4 | Cross-AI request/response batches (`validation/exchange/`, git-ignored) |
| `content:resolve` | `resolve-validation.mjs` | WP4 | Resolution matrix → statuses, review queue |
| `content:dedup` | `dedup.mjs` | WP5 | Exact/near/related clusters, exclusion components |
| `content:variants` | `build-variants.mjs` | WP5 | Template variants (sfc32, exact rationals) |
| `content:import` | `import-staging.mjs` | WP7 | Manifest-driven import into PGlite / Supabase (batched, resumable, retire list) |
| `content:pack` | `pack-runtime-bank.mjs` | WP6 | Published staging → `data/runtime/bank/**` (pre-DB fallback bank) |
| `content:report` | `report.mjs` | WP10 | Coverage, quality dashboard, validation, duplicates, exam templates, manifests |

Shared modules (WP1):

| Module | What it provides |
|---|---|
| `lib/schemas.mjs` | AJV 8 (draft 2020-12) over `data/schemas/*.schema.json`: `validateRecord`, `stringifyRecord` (schema key order), `ruleFor(path)` (the staging path rules), `runtimeRuleFor` |
| `lib/jsonl.mjs` | `readJsonlStream`, `readJsonl`, `inspectJsonlText`, `writeShards` (sorted, 4 MB `.pNN` shards, stale shards removed), `writeJsonl`, `writeJson`, `writeFileIfChanged` (atomic, no rewrite when unchanged) |
| `lib/cache.mjs` | The one cache layout (`cachePaths()`), `CONTENT_CACHE_DIR`, PDF-name and segment sanitizing (`..`, `\`, `CON.pdf` rejected), containment checks |
| `lib/id-registry.mjs` | Frozen `x…` node and `obj-…` ids: exact / alias (trigram ≥ 0.85) / mint; append-only |
| `src/lib/content/*.js` | `enums`, `ids` (§2.2), `normalize` (Appendix A, `lam_order_fold`), `answers` (the only JS grader), `expr` (safe grammar, exact rationals), `prng` (HASH-CTR `u()`, sfc32) |

Examples:

```bash
npm run content:validate                          # the staging tree (exit code 0/1/2)
npm run content:validate -- --budget --changed    # before a commit
npm run content:validate -- --write-manifest      # after a production run
node scripts/content/validate-staging.mjs --root tests/fixtures/content/staging --no-runtime   # the fixture tree
```

---

# Curriculum PDF importer

Imports **approved** curriculum PDFs **once** from an authorized source you
control/are licensed to use, and stores them in **your own** storage so Jazira
serves them from its **own domain**. Only Jazira URLs ever appear in the UI.

It is intentionally narrow and safe — **not** a scraper and **not** a general
proxy:

- **Source allow-list** — only hosts in `SOURCE_ALLOWLIST` are ever fetched
  (https only; redirects are re-checked per hop).
- **Target allow-list** — every `key` must already exist in the curriculum
  catalog (`src/lib/curriculum.js`). No path traversal, no arbitrary writes.
- **Validation** — Content-Type, size cap, and `%PDF-` magic bytes are checked.
- **Idempotent** — already-imported files are skipped (`--force` to refresh).

After import the site works **even if the original source goes offline**,
because the files now live in your storage.

---

## 1. Choose where files are stored

| Store | When to use | Files live in |
|-------|-------------|---------------|
| **`supabase`** (recommended for Vercel) | 100+ PDFs, production | a Supabase Storage bucket — **not** in git |
| **`public`** (default) | small sets / self-hosting | `public/resources/<key>` on the server |

> On Vercel the `public` store requires the PDFs to be committed to git (they
> deploy with the app). For large libraries prefer **Supabase**.

## 2. Configure env (`.env.local`)

```bash
# Required — the authorized source host(s) you may download from:
SOURCE_ALLOWLIST=ebook.moe.gov.sa,moe.gov.sa

# Pick a store:
CONTENT_STORE=supabase           # or: public
CONTENT_BUCKET=curriculum        # supabase only (default: curriculum)
NEXT_PUBLIC_SUPABASE_URL=...      # supabase only
SUPABASE_SERVICE_ROLE_KEY=...     # supabase only — local use, never shipped
```

## 3. Build the manifest

List the catalog keys you want to fill (optionally narrow by prefix):

```bash
node scripts/import-curriculum.mjs --list-keys 1447/elementary/grade-1
```

Then either hand-write `scripts/curriculum-sources.json` (see
`curriculum-sources.example.json`) or emit a skeleton for a branch and fill the
`url` fields:

```bash
node scripts/import-curriculum.mjs --emit-manifest 1447/elementary/grade-1
# → writes scripts/curriculum-sources.json with url:"" to fill in
```

Each entry is `{ "key": "<catalog key>", "url": "<authorized PDF url>" }`.

## 4. Import

```bash
# Validate first without downloading:
node scripts/import-curriculum.mjs --dry-run

# Do it:
npm run import:curriculum
#   flags: --store public|supabase  --force  --limit N  --manifest <path>
```

A summary is written to `scripts/import-report.json`.

## 5. Point the app at the store

- **public store:** nothing to do — leave `CONTENT_BASE_URL` unset. The API
  (`/api/content/fetch?key=…`) streams from `public/resources`.
- **supabase store:** set, in your app env (e.g. Vercel):

  ```bash
  CONTENT_STORE=remote
  CONTENT_BASE_URL=https://<project>.supabase.co/storage/v1/object/public/curriculum
  ```

Either way the in-app PDF viewer keeps working and the browser only ever sees
`https://<your-domain>/api/content/fetch?key=…`.
