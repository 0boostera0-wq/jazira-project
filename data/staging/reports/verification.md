# Verification map

Generated: 2026-09-27T17:23:05Z
Manifest: `34ee874b2802ff0ff2c6f0f12a1226e3fcb82479ff8c0830e7f31bffed52d297` (current)

Generated from docs/CONTENT_ENGINE.md §9.3. It records which tests and artifacts exist; it does not claim that a test passed — run the command.

Counting rules:

1. candidates = every question record in questions/** and question-variants/** (any status)
2. validated = validation.status = validated
3. published = status = published
4. canonical = published, not a variant, and dedup.class = UNIQUE or the canonical of a dedup cluster
5. variants = published records with variant ≠ null (template and rewrite variants; never canonical)
6. legacy items (the 300) are counted in the totals and also reported in their own section by validation outcome
7. sources = rows in sources/registry.json
8. PDFs = resources with file_type = pdf, split by availability and by extraction.status
9. pages processed = page-map rows with text_method text or vision (split by method); 'front-matter only' is the subset whose resource has extraction.status frontmatter_done; a book's page_count is never counted
10. Term 1 / Term 2: a subject is listed under a term only when subject-terms.jsonl says verified or inferred; per-term figures count nodes, resources and questions whose term is that term or both
11. exam-template figures are per template × scope (combinatorics.js); they are never summed across templates or overlapping scopes
12. sessions are never added to question counts

| Requirement | Command / test | Test files | Artifacts |
|---|---|---|---|
| Schemas and staging integrity, copyright rules | `npm run content:validate -- --budget` | — | manifest.json (present) |
| Curriculum mapping and terms | `npx vitest run tests/unit/content-curriculum-build.test.js tests/unit/curriculum-outline.test.js` | tests/unit/content-curriculum-build.test.js (present); tests/unit/curriculum-outline.test.js (present) | curriculum/subject-terms.jsonl (present); reports/coverage.md (present) |
| PDF extraction, Arabic repair, polite fetching | `npx vitest run tests/unit/content-pdf.test.js tests/unit/content-fetch-queue.test.js` | tests/unit/content-pdf.test.js (present); tests/unit/content-fetch-queue.test.js (present) | resources/extraction.jsonl (present) |
| Generation/validation contract | `npx vitest run tests/unit/content-checks.test.js tests/unit/content-exchange.test.js tests/unit/content-legacy.test.js` | tests/unit/content-checks.test.js (present); tests/unit/content-exchange.test.js (present); tests/unit/content-legacy.test.js (present) | reports/validation.md (present); validation/runs (present) |
| Dedup and variants | `npx vitest run tests/unit/content-dedup.test.js tests/unit/content-templates.test.js` | tests/unit/content-dedup.test.js (present); tests/unit/content-templates.test.js (present) | reports/duplicates.md (present) |
| Engine, tokens, guest API | `npx vitest run tests/unit/engine-select.test.js tests/unit/engine-token.test.js tests/unit/engine-routes.test.js tests/unit/engine-combinatorics.test.js tests/unit/engine-perf.test.js tests/unit/server-routes.test.js` | tests/unit/engine-select.test.js (present); tests/unit/engine-token.test.js (present); tests/unit/engine-routes.test.js (present); tests/unit/engine-combinatorics.test.js (present); tests/unit/engine-perf.test.js (present); tests/unit/server-routes.test.js (present) | reports/exam-templates.md (present) |
| DB, RLS, attacks, import, perf | `npm run test:db` | tests/db/content-0014.test.js (present); tests/db/content-engine-rpc.test.js (present); tests/db/content-import.test.js (present); tests/db/content-perf.test.js (present) | reports/import (missing) |
| UI | `npx vitest run tests/unit/exams-types.test.js tests/unit/learn.test.js; node scripts/shot.mjs (375 px, RTL and LTR)` | tests/unit/exams-types.test.js (present); tests/unit/learn.test.js (present) | — |
| Reports and counts | `npx vitest run tests/unit/content-reports.test.js` | tests/unit/content-reports.test.js (present) | reports/coverage.md (present); reports/quality.html (present); reports/resources.md (present); reports/question-bank.md (present) |
| Everything | `npm test; npm run test:db; npm run build` | — | — |
