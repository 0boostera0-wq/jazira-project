# Question bank

Generated: 2026-09-27T17:23:05Z
Manifest: `34ee874b2802ff0ff2c6f0f12a1226e3fcb82479ff8c0830e7f31bffed52d297` (current)
Runtime bank revision: `4b52b91b0608b2147c0bf93f6a6776d8`
Published set sha256 (sorted `id:revision` of published records): `a909649322be19d4db5a516fb3164b797b3b2d403a451335c68d78972c826fe8`

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

| Shard | Subject | Records | By status | By origin | By type |
|---|---|---|---|---|---|
| `question-variants/middle/grade-1/math` | `middle/grade-1/math` | 2121 | candidate 431, rejected 28, review_required 16, validated 1646 | generated_practice 2121 | mcq 1740, numeric 381 |
| `questions/middle/grade-1/math` | `middle/grade-1/math` | 851 | rejected 17, review_required 92, validated 742 | generated_practice 1, source_derived 123, transformed 727 | matching 56, mcq 453, numeric 171, ordering 57, true_false 114 |
| `questions/middle/grade-1/science` | `middle/grade-1/science` | 390 | rejected 12, review_required 6, validated 372 | source_derived 160, transformed 230 | matching 26, mcq 208, numeric 78, ordering 26, true_false 52 |
| `questions/prep/achievement-biology` | `prep:achievement/biology` | 40 | published 39, review_required 1 | internal_authored 40 | mcq 40 |
| `questions/prep/achievement-chemistry` | `prep:achievement/chemistry` | 40 | published 39, review_required 1 | internal_authored 40 | mcq 40 |
| `questions/prep/achievement-math` | `prep:achievement/math` | 40 | published 39, review_required 1 | internal_authored 40 | mcq 40 |
| `questions/prep/achievement-physics` | `prep:achievement/physics` | 40 | published 39, review_required 1 | internal_authored 40 | mcq 40 |
| `questions/prep/aptitude-quantitative` | `prep:aptitude/quantitative` | 80 | published 78, review_required 2 | internal_authored 80 | mcq 80 |
| `questions/prep/aptitude-verbal` | `prep:aptitude/verbal` | 60 | published 60 | internal_authored 60 | mcq 60 |
