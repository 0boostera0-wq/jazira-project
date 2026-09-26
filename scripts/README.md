# Scripts

Node scripts (no build step; run from the repository root).

| Script | What it does | Usage |
|---|---|---|
| `check-assets.mjs` | Illustration manifest (`src/lib/assets.js`) ↔ files ↔ usages: files exist, aspect ratios match, art is text-free, every id is referenced and documents its `usedIn`, no broken `/images` paths | `npm run assets:check` · `node scripts/check-assets.mjs --usage` (also lists the files that reference each id) |
| `optimize-svgs.mjs` | SVGO over `public/images` (in place) + size-budget report | `npm run assets:optimize` · `node scripts/optimize-svgs.mjs public/images/brand/island-hero.svg` |
| `find-orphans.mjs` | Modules under `src/` that nothing imports (dead code) | `node scripts/find-orphans.mjs` |
| `shot.mjs` | Visual + accessibility QA with the local Chrome: screenshot, horizontal overflow measured against the requested width, console errors, axe-core (plus a computed contrast scan on Arabic pages) | `node scripts/shot.mjs /en/exams out.png --w=390 --h=844 [--full] [--dark] [--auth] [--axe]` |
| `build-question-seed.mjs` | Validates `src/content/questions/*.json` and writes the deterministic SQL seed `supabase/migrations/0011_seed_questions.sql` | `node scripts/build-question-seed.mjs` · `--check` (validate only, writes nothing) · `--in` / `--file` / `--out` / `--stdout` — see docs/DATA_API.md |
| `build-curriculum-manifest.mjs` | Builds `src/content/curriculum/manifest.json` from the catalog + verified research; refuses on any mismatch | `node scripts/build-curriculum-manifest.mjs` · `--check` (verify only) — see docs/CURRICULUM.md |
| `import-curriculum.mjs` | Imports approved curriculum PDFs once into your own store (details below) | `npm run import:curriculum` · `--dry-run` · `--list-keys <prefix>` · `--emit-manifest <prefix>` |

`curriculum-sources.example.json` shows the importer's input format. Tests
live in `tests/` (`npm test`, `npm run test:db`).

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
