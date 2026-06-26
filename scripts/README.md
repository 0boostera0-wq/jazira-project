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
