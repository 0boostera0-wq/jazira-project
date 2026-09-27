# Duplicates

Generated: 2026-09-27T17:23:05Z
Manifest: `34ee874b2802ff0ff2c6f0f12a1226e3fcb82479ff8c0830e7f31bffed52d297` (current)

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

## Clusters by class

339 clusters. Cluster members by class: NEAR_DUPLICATE 25, RELATED 556. Items by their own class: NEAR_DUPLICATE 25, RELATED 556, UNIQUE 3049, unclassified 32.

## Largest clusters

| Cluster | Canonical | Members | Classes | Exclusion group |
|---|---|---|---|---|
| `dc-q-m1-math-8273e62b3d` | `q-m1-math-8273e62b3d` | 15 | RELATED 15 | — |
| `dc-q-m1-math-183112cc18` | `q-m1-math-183112cc18` | 14 | RELATED 14 | — |
| `dc-q-m1-math-ddc2a2133d` | `q-m1-math-ddc2a2133d` | 12 | RELATED 12 | — |
| `dc-v-m1-math-6cf42ad089-01` | `v-m1-math-6cf42ad089-01` | 12 | RELATED 12 | `xg-4194a02629` |
| `dc-v-m1-math-c57cf4041d-01` | `v-m1-math-c57cf4041d-01` | 12 | RELATED 12 | `xg-e26d893767` |
| `dc-v-m1-math-cc21487d55-04` | `v-m1-math-cc21487d55-04` | 10 | RELATED 10 | `xg-81dea743dc` |
| `dc-v-m1-math-fbeb201e7f-01` | `v-m1-math-fbeb201e7f-01` | 10 | RELATED 10 | `xg-6764400199` |
| `dc-v-m1-math-c28364b5db-01` | `v-m1-math-c28364b5db-01` | 8 | NEAR_DUPLICATE 3, RELATED 5 | `xg-f80288e37d` |
| `dc-v-m1-math-4e793bf802-04` | `v-m1-math-4e793bf802-04` | 7 | RELATED 7 | `xg-21fecd261d` |
| `dc-v-m1-math-a4bd87484d-13` | `v-m1-math-a4bd87484d-13` | 7 | NEAR_DUPLICATE 1, RELATED 6 | `xg-a330a805f7` |

## Cross-lesson duplicates

| Cluster | Member | Class | Canonical lesson | Member lesson |
|---|---|---|---|---|
| `dc-q-m1-math-3fbcaaef15` | `q-m1-math-2466cf433f` | RELATED | `middle/grade-1/math/n83` | `middle/grade-1/math/n79` |
| `dc-q-m1-math-3fbcaaef15` | `q-m1-math-f0bda65ca0` | RELATED | `middle/grade-1/math/n83` | `middle/grade-1/math/n62` |
| `dc-q-m1-math-f09637225c` | `q-m1-math-6bcf2d8603` | RELATED | `middle/grade-1/math/n3325` | `middle/grade-1/math/n144546` |
| `dc-v-m1-math-6b55e9667d-01` | `v-m1-math-b664132586-12` | RELATED | `middle/grade-1/math/n70` | `middle/grade-1/math/n73` |
| `dc-v-m1-math-6b55e9667d-08` | `v-m1-math-b664132586-13` | RELATED | `middle/grade-1/math/n70` | `middle/grade-1/math/n73` |
| `dc-v-m1-math-6b55e9667d-14` | `v-m1-math-b664132586-09` | RELATED | `middle/grade-1/math/n70` | `middle/grade-1/math/n73` |
| `dc-v-m1-math-6b55e9667d-15` | `v-m1-math-b664132586-10` | RELATED | `middle/grade-1/math/n70` | `middle/grade-1/math/n73` |
| `dc-v-m1-math-dbee98d8d8-04` | `v-m1-math-2024c19bab-14` | RELATED | `middle/grade-1/math/n73` | `middle/grade-1/math/n71` |
| `dc-v-m1-math-dbee98d8d8-15` | `v-m1-math-2024c19bab-02` | RELATED | `middle/grade-1/math/n73` | `middle/grade-1/math/n71` |

## Instruction-stem families (normalized stem in ≥ 5 items)

| Stem (≤ 80 chars) | Items |
|---|---|
| اختر الكلمة المختلفة عن بقية الكلمات: | 8 |

## Numeric-variant families

| Cluster | Canonical | Numeric variants |
|---|---|---|
| `dc-q-m1-math-06f467ab86` | `q-m1-math-06f467ab86` | 1 |
| `dc-q-m1-math-5560f8f2ee` | `q-m1-math-5560f8f2ee` | 3 |
| `dc-q-m1-math-9d7a3c265e` | `q-m1-math-9d7a3c265e` | 1 |
| `dc-q-m1-math-de8ecf5eac` | `q-m1-math-de8ecf5eac` | 2 |
| `dc-q-m1-math-ed7542c44a` | `q-m1-math-ed7542c44a` | 1 |
| `dc-q-m1-math-f91d799eab` | `q-m1-math-f91d799eab` | 1 |
| `dc-v-m1-math-004337d175-04` | `v-m1-math-004337d175-04` | 1 |
| `dc-v-m1-math-004337d175-10` | `v-m1-math-004337d175-10` | 1 |
| `dc-v-m1-math-0145087803-01` | `v-m1-math-0145087803-01` | 1 |
| `dc-v-m1-math-028501cdc0-08` | `v-m1-math-028501cdc0-08` | 1 |
| `dc-v-m1-math-03d6d19740-06` | `v-m1-math-03d6d19740-06` | 1 |
| `dc-v-m1-math-03d6d19740-08` | `v-m1-math-03d6d19740-08` | 1 |
| `dc-v-m1-math-05321577e7-05` | `v-m1-math-05321577e7-05` | 3 |
| `dc-v-m1-math-05f9f0205a-04` | `v-m1-math-05f9f0205a-04` | 4 |
| `dc-v-m1-math-05f9f0205a-07` | `v-m1-math-05f9f0205a-07` | 2 |
| `dc-v-m1-math-05f9f0205a-09` | `v-m1-math-05f9f0205a-09` | 2 |
| `dc-v-m1-math-09d55f2ef8-09` | `v-m1-math-09d55f2ef8-09` | 1 |
| `dc-v-m1-math-0ccaafac53-04` | `v-m1-math-0ccaafac53-04` | 1 |
| `dc-v-m1-math-0ccaafac53-06` | `v-m1-math-0ccaafac53-06` | 1 |
| `dc-v-m1-math-0dc569412d-01` | `v-m1-math-0dc569412d-01` | 1 |
| `dc-v-m1-math-0dc569412d-10` | `v-m1-math-0dc569412d-10` | 1 |
| `dc-v-m1-math-1090c99f92-08` | `v-m1-math-1090c99f92-08` | 1 |
| `dc-v-m1-math-13315c52ff-01` | `v-m1-math-13315c52ff-01` | 2 |
| `dc-v-m1-math-13315c52ff-03` | `v-m1-math-13315c52ff-03` | 2 |
| `dc-v-m1-math-13315c52ff-04` | `v-m1-math-13315c52ff-04` | 3 |
| `dc-v-m1-math-13315c52ff-10` | `v-m1-math-13315c52ff-10` | 2 |
| `dc-v-m1-math-1fa106de0d-06` | `v-m1-math-1fa106de0d-06` | 1 |
| `dc-v-m1-math-2066591218-06` | `v-m1-math-2066591218-06` | 2 |
| `dc-v-m1-math-238ef49abe-08` | `v-m1-math-238ef49abe-08` | 1 |
| `dc-v-m1-math-238ef49abe-11` | `v-m1-math-238ef49abe-11` | 1 |
| `dc-v-m1-math-2504b1c790-14` | `v-m1-math-2504b1c790-14` | 1 |
| `dc-v-m1-math-2808203ba6-03` | `v-m1-math-2808203ba6-03` | 1 |
| `dc-v-m1-math-2808203ba6-04` | `v-m1-math-2808203ba6-04` | 1 |
| `dc-v-m1-math-2808203ba6-06` | `v-m1-math-2808203ba6-06` | 3 |
| `dc-v-m1-math-2808203ba6-07` | `v-m1-math-2808203ba6-07` | 1 |
| `dc-v-m1-math-2ce72c469c-05` | `v-m1-math-2ce72c469c-05` | 1 |
| `dc-v-m1-math-30ee9b28e7-01` | `v-m1-math-30ee9b28e7-01` | 1 |
| `dc-v-m1-math-30ee9b28e7-03` | `v-m1-math-30ee9b28e7-03` | 1 |
| `dc-v-m1-math-30ee9b28e7-04` | `v-m1-math-30ee9b28e7-04` | 1 |
| `dc-v-m1-math-30ee9b28e7-05` | `v-m1-math-30ee9b28e7-05` | 1 |
| `dc-v-m1-math-30ee9b28e7-07` | `v-m1-math-30ee9b28e7-07` | 1 |
| `dc-v-m1-math-343e5c3703-06` | `v-m1-math-343e5c3703-06` | 1 |
| `dc-v-m1-math-34ef6139cd-06` | `v-m1-math-34ef6139cd-06` | 2 |
| `dc-v-m1-math-3b61204ca4-06` | `v-m1-math-3b61204ca4-06` | 1 |
| `dc-v-m1-math-4438f6640a-04` | `v-m1-math-4438f6640a-04` | 1 |
| `dc-v-m1-math-4438f6640a-07` | `v-m1-math-4438f6640a-07` | 1 |
| `dc-v-m1-math-4438f6640a-10` | `v-m1-math-4438f6640a-10` | 1 |
| `dc-v-m1-math-460a337b0f-01` | `v-m1-math-460a337b0f-01` | 1 |
| `dc-v-m1-math-460a337b0f-04` | `v-m1-math-460a337b0f-04` | 1 |
| `dc-v-m1-math-4966ba5e60-05` | `v-m1-math-4966ba5e60-05` | 1 |
| `dc-v-m1-math-4966ba5e60-06` | `v-m1-math-4966ba5e60-06` | 1 |
| `dc-v-m1-math-4966ba5e60-13` | `v-m1-math-4966ba5e60-13` | 1 |
| `dc-v-m1-math-4a39ac495c-06` | `v-m1-math-4a39ac495c-06` | 1 |
| `dc-v-m1-math-4b44475a16-01` | `v-m1-math-4b44475a16-01` | 1 |
| `dc-v-m1-math-4b44475a16-04` | `v-m1-math-4b44475a16-04` | 2 |
| `dc-v-m1-math-4b44475a16-06` | `v-m1-math-4b44475a16-06` | 2 |
| `dc-v-m1-math-4bc7fa5bd8-09` | `v-m1-math-4bc7fa5bd8-09` | 1 |
| `dc-v-m1-math-4cf4767a2a-04` | `v-m1-math-4cf4767a2a-04` | 1 |
| `dc-v-m1-math-4cf4767a2a-05` | `v-m1-math-4cf4767a2a-05` | 1 |
| `dc-v-m1-math-4cf4767a2a-08` | `v-m1-math-4cf4767a2a-08` | 1 |
| `dc-v-m1-math-4cf4767a2a-09` | `v-m1-math-4cf4767a2a-09` | 1 |
| `dc-v-m1-math-4cf4767a2a-10` | `v-m1-math-4cf4767a2a-10` | 1 |
| `dc-v-m1-math-52ab5f560d-05` | `v-m1-math-52ab5f560d-05` | 1 |
| `dc-v-m1-math-52ab5f560d-06` | `v-m1-math-52ab5f560d-06` | 1 |
| `dc-v-m1-math-52ab5f560d-07` | `v-m1-math-52ab5f560d-07` | 1 |
| `dc-v-m1-math-52ab5f560d-10` | `v-m1-math-52ab5f560d-10` | 1 |
| `dc-v-m1-math-52ab5f560d-15` | `v-m1-math-52ab5f560d-15` | 1 |
| `dc-v-m1-math-54ba051e49-04` | `v-m1-math-54ba051e49-04` | 2 |
| `dc-v-m1-math-54ba051e49-06` | `v-m1-math-54ba051e49-06` | 1 |
| `dc-v-m1-math-54ba051e49-08` | `v-m1-math-54ba051e49-08` | 2 |
| `dc-v-m1-math-5c2856f557-08` | `v-m1-math-5c2856f557-08` | 1 |
| `dc-v-m1-math-619fbf0510-06` | `v-m1-math-619fbf0510-06` | 1 |
| `dc-v-m1-math-619fbf0510-07` | `v-m1-math-619fbf0510-07` | 1 |
| `dc-v-m1-math-67266f0d43-02` | `v-m1-math-67266f0d43-02` | 1 |
| `dc-v-m1-math-67266f0d43-10` | `v-m1-math-67266f0d43-10` | 1 |
| `dc-v-m1-math-6a99c4e7b9-01` | `v-m1-math-6a99c4e7b9-01` | 1 |
| `dc-v-m1-math-6a99c4e7b9-03` | `v-m1-math-6a99c4e7b9-03` | 3 |
| `dc-v-m1-math-6a99c4e7b9-11` | `v-m1-math-6a99c4e7b9-11` | 1 |
| `dc-v-m1-math-6b55e9667d-06` | `v-m1-math-6b55e9667d-06` | 1 |
| `dc-v-m1-math-704d6967f5-05` | `v-m1-math-704d6967f5-05` | 2 |
| `dc-v-m1-math-704d6967f5-11` | `v-m1-math-704d6967f5-11` | 1 |
| `dc-v-m1-math-7b9bc42a89-01` | `v-m1-math-7b9bc42a89-01` | 1 |
| `dc-v-m1-math-7b9bc42a89-03` | `v-m1-math-7b9bc42a89-03` | 1 |
| `dc-v-m1-math-7b9bc42a89-05` | `v-m1-math-7b9bc42a89-05` | 1 |
| `dc-v-m1-math-7cd439975d-06` | `v-m1-math-7cd439975d-06` | 1 |
| `dc-v-m1-math-7dfa348ebe-04` | `v-m1-math-7dfa348ebe-04` | 1 |
| `dc-v-m1-math-7dfa348ebe-05` | `v-m1-math-7dfa348ebe-05` | 2 |
| `dc-v-m1-math-7ebf8721ab-05` | `v-m1-math-7ebf8721ab-05` | 2 |
| `dc-v-m1-math-7ebf8721ab-06` | `v-m1-math-7ebf8721ab-06` | 1 |
| `dc-v-m1-math-83202af8cd-06` | `v-m1-math-83202af8cd-06` | 1 |
| `dc-v-m1-math-86ae1a370c-02` | `v-m1-math-86ae1a370c-02` | 1 |
| `dc-v-m1-math-86ae1a370c-04` | `v-m1-math-86ae1a370c-04` | 1 |
| `dc-v-m1-math-86ae1a370c-08` | `v-m1-math-86ae1a370c-08` | 1 |
| `dc-v-m1-math-87f4708182-04` | `v-m1-math-87f4708182-04` | 2 |
| `dc-v-m1-math-89d7993071-12` | `v-m1-math-89d7993071-12` | 1 |
| `dc-v-m1-math-8c9d4c82de-01` | `v-m1-math-8c9d4c82de-01` | 1 |
| `dc-v-m1-math-8fac252229-01` | `v-m1-math-8fac252229-01` | 1 |
| `dc-v-m1-math-8fac252229-06` | `v-m1-math-8fac252229-06` | 1 |
| `dc-v-m1-math-92a5086b7e-04` | `v-m1-math-92a5086b7e-04` | 1 |
| `dc-v-m1-math-92a5086b7e-05` | `v-m1-math-92a5086b7e-05` | 1 |
| `dc-v-m1-math-92a5086b7e-08` | `v-m1-math-92a5086b7e-08` | 1 |
| `dc-v-m1-math-92a5086b7e-09` | `v-m1-math-92a5086b7e-09` | 1 |
| `dc-v-m1-math-92a5086b7e-11` | `v-m1-math-92a5086b7e-11` | 1 |
| `dc-v-m1-math-946cf5b5de-04` | `v-m1-math-946cf5b5de-04` | 1 |
| `dc-v-m1-math-95e135aaaa-08` | `v-m1-math-95e135aaaa-08` | 1 |
| `dc-v-m1-math-95e135aaaa-11` | `v-m1-math-95e135aaaa-11` | 1 |
| `dc-v-m1-math-9a4ea8a151-08` | `v-m1-math-9a4ea8a151-08` | 1 |
| `dc-v-m1-math-9c05061889-05` | `v-m1-math-9c05061889-05` | 1 |
| `dc-v-m1-math-9c63e9463c-02` | `v-m1-math-9c63e9463c-02` | 1 |
| `dc-v-m1-math-9c63e9463c-03` | `v-m1-math-9c63e9463c-03` | 1 |
| `dc-v-m1-math-9c63e9463c-07` | `v-m1-math-9c63e9463c-07` | 1 |
| `dc-v-m1-math-9c63e9463c-09` | `v-m1-math-9c63e9463c-09` | 1 |
| `dc-v-m1-math-9d3cc1b87d-09` | `v-m1-math-9d3cc1b87d-09` | 1 |
| `dc-v-m1-math-9d4529091e-01` | `v-m1-math-9d4529091e-01` | 1 |
| `dc-v-m1-math-9d4529091e-03` | `v-m1-math-9d4529091e-03` | 1 |
| `dc-v-m1-math-a1b4dbc6c8-07` | `v-m1-math-a1b4dbc6c8-07` | 1 |
| `dc-v-m1-math-a1b4dbc6c8-11` | `v-m1-math-a1b4dbc6c8-11` | 1 |
| `dc-v-m1-math-a4bd87484d-13` | `v-m1-math-a4bd87484d-13` | 6 |
| `dc-v-m1-math-a66dff6a01-11` | `v-m1-math-a66dff6a01-11` | 1 |
| `dc-v-m1-math-a6f3c172a1-08` | `v-m1-math-a6f3c172a1-08` | 1 |
| `dc-v-m1-math-a92b33714d-09` | `v-m1-math-a92b33714d-09` | 1 |
| `dc-v-m1-math-a96a82742c-05` | `v-m1-math-a96a82742c-05` | 1 |
| `dc-v-m1-math-a96a82742c-06` | `v-m1-math-a96a82742c-06` | 2 |
| `dc-v-m1-math-a96a82742c-07` | `v-m1-math-a96a82742c-07` | 2 |
| `dc-v-m1-math-a96a82742c-09` | `v-m1-math-a96a82742c-09` | 1 |
| `dc-v-m1-math-abd23a0308-04` | `v-m1-math-abd23a0308-04` | 4 |
| `dc-v-m1-math-ae4993c60b-08` | `v-m1-math-ae4993c60b-08` | 1 |
| `dc-v-m1-math-ae4993c60b-09` | `v-m1-math-ae4993c60b-09` | 1 |
| `dc-v-m1-math-afe932cfa5-02` | `v-m1-math-afe932cfa5-02` | 1 |
| `dc-v-m1-math-b0189933e3-05` | `v-m1-math-b0189933e3-05` | 1 |
| `dc-v-m1-math-b0189933e3-08` | `v-m1-math-b0189933e3-08` | 1 |
| `dc-v-m1-math-b0189933e3-10` | `v-m1-math-b0189933e3-10` | 1 |
| `dc-v-m1-math-b0dd538103-07` | `v-m1-math-b0dd538103-07` | 1 |
| `dc-v-m1-math-bb666f19a3-06` | `v-m1-math-bb666f19a3-06` | 1 |
| `dc-v-m1-math-bc98de9bba-07` | `v-m1-math-bc98de9bba-07` | 1 |
| `dc-v-m1-math-bc98de9bba-14` | `v-m1-math-bc98de9bba-14` | 1 |
| `dc-v-m1-math-c28364b5db-01` | `v-m1-math-c28364b5db-01` | 1 |
| `dc-v-m1-math-c28364b5db-03` | `v-m1-math-c28364b5db-03` | 1 |
| `dc-v-m1-math-c37bb4e69e-04` | `v-m1-math-c37bb4e69e-04` | 1 |
| `dc-v-m1-math-c37bb4e69e-05` | `v-m1-math-c37bb4e69e-05` | 1 |
| `dc-v-m1-math-c37bb4e69e-07` | `v-m1-math-c37bb4e69e-07` | 1 |
| `dc-v-m1-math-c37bb4e69e-10` | `v-m1-math-c37bb4e69e-10` | 1 |
| `dc-v-m1-math-c37bb4e69e-12` | `v-m1-math-c37bb4e69e-12` | 1 |
| `dc-v-m1-math-c38d8ae410-04` | `v-m1-math-c38d8ae410-04` | 1 |
| `dc-v-m1-math-c38d8ae410-07` | `v-m1-math-c38d8ae410-07` | 1 |
| `dc-v-m1-math-c38d8ae410-08` | `v-m1-math-c38d8ae410-08` | 1 |
| `dc-v-m1-math-c5c498c5b9-02` | `v-m1-math-c5c498c5b9-02` | 1 |
| `dc-v-m1-math-c6367a8519-06` | `v-m1-math-c6367a8519-06` | 2 |
| `dc-v-m1-math-c6367a8519-07` | `v-m1-math-c6367a8519-07` | 1 |
| `dc-v-m1-math-c6367a8519-10` | `v-m1-math-c6367a8519-10` | 2 |
| `dc-v-m1-math-cc21487d55-04` | `v-m1-math-cc21487d55-04` | 1 |
| `dc-v-m1-math-cf884c14f7-01` | `v-m1-math-cf884c14f7-01` | 1 |
| `dc-v-m1-math-cf884c14f7-04` | `v-m1-math-cf884c14f7-04` | 1 |
| `dc-v-m1-math-cf884c14f7-14` | `v-m1-math-cf884c14f7-14` | 1 |
| `dc-v-m1-math-d14bc6e521-05` | `v-m1-math-d14bc6e521-05` | 1 |
| `dc-v-m1-math-d14bc6e521-06` | `v-m1-math-d14bc6e521-06` | 1 |
| `dc-v-m1-math-d14bc6e521-07` | `v-m1-math-d14bc6e521-07` | 1 |
| `dc-v-m1-math-d767caa3a3-03` | `v-m1-math-d767caa3a3-03` | 1 |
| `dc-v-m1-math-d767caa3a3-07` | `v-m1-math-d767caa3a3-07` | 1 |
| `dc-v-m1-math-d7c1057ae7-13` | `v-m1-math-d7c1057ae7-13` | 1 |
| `dc-v-m1-math-dbee98d8d8-05` | `v-m1-math-dbee98d8d8-05` | 3 |
| `dc-v-m1-math-dbee98d8d8-06` | `v-m1-math-dbee98d8d8-06` | 1 |
| `dc-v-m1-math-dd67cf5588-04` | `v-m1-math-dd67cf5588-04` | 1 |
| `dc-v-m1-math-e7c2470af0-01` | `v-m1-math-e7c2470af0-01` | 1 |
| `dc-v-m1-math-e7c2470af0-02` | `v-m1-math-e7c2470af0-02` | 3 |
| `dc-v-m1-math-e7c2470af0-03` | `v-m1-math-e7c2470af0-03` | 2 |
| `dc-v-m1-math-e7c2470af0-04` | `v-m1-math-e7c2470af0-04` | 2 |
| `dc-v-m1-math-e904f326c5-04` | `v-m1-math-e904f326c5-04` | 2 |
| `dc-v-m1-math-e904f326c5-05` | `v-m1-math-e904f326c5-05` | 2 |
| `dc-v-m1-math-e904f326c5-06` | `v-m1-math-e904f326c5-06` | 1 |
| `dc-v-m1-math-e904f326c5-10` | `v-m1-math-e904f326c5-10` | 1 |
| `dc-v-m1-math-e904f326c5-12` | `v-m1-math-e904f326c5-12` | 2 |
| `dc-v-m1-math-eb63c9dee6-04` | `v-m1-math-eb63c9dee6-04` | 1 |
| `dc-v-m1-math-eb63c9dee6-07` | `v-m1-math-eb63c9dee6-07` | 1 |
| `dc-v-m1-math-efa3fa9ee2-01` | `v-m1-math-efa3fa9ee2-01` | 2 |
| `dc-v-m1-math-efa3fa9ee2-02` | `v-m1-math-efa3fa9ee2-02` | 1 |
| `dc-v-m1-math-f787597eb3-05` | `v-m1-math-f787597eb3-05` | 2 |
| `dc-v-m1-math-f8d605cba4-05` | `v-m1-math-f8d605cba4-05` | 1 |
| `dc-v-m1-math-fb47f74f2b-06` | `v-m1-math-fb47f74f2b-06` | 1 |
| `dc-v-m1-math-fe97fbdd60-08` | `v-m1-math-fe97fbdd60-08` | 2 |
| `dc-v-m1-math-fe97fbdd60-10` | `v-m1-math-fe97fbdd60-10` | 1 |
| `dc-v-m1-math-ffadad0389-03` | `v-m1-math-ffadad0389-03` | 1 |

## Template-variant families

| Template | Variants | Published |
|---|---|---|
| `t-m1-math-0011a17a47` | 15 | 0 |
| `t-m1-math-004337d175` | 14 | 0 |
| `t-m1-math-0145087803` | 15 | 0 |
| `t-m1-math-028501cdc0` | 14 | 0 |
| `t-m1-math-03d2871cbb` | 16 | 0 |
| `t-m1-math-03d6d19740` | 12 | 0 |
| `t-m1-math-05321577e7` | 12 | 0 |
| `t-m1-math-05f9f0205a` | 15 | 0 |
| `t-m1-math-09b922ec9a` | 20 | 0 |
| `t-m1-math-09d55f2ef8` | 12 | 0 |
| `t-m1-math-0ccaafac53` | 12 | 0 |
| `t-m1-math-0cfed6e3f7` | 12 | 0 |
| `t-m1-math-0dc569412d` | 12 | 0 |
| `t-m1-math-1090c99f92` | 15 | 0 |
| `t-m1-math-10ae1ff68c` | 12 | 0 |
| `t-m1-math-13315c52ff` | 14 | 0 |
| `t-m1-math-17d7b7fae8` | 8 | 0 |
| `t-m1-math-1c0d0456fc` | 15 | 0 |
| `t-m1-math-1fa106de0d` | 12 | 0 |
| `t-m1-math-1fb471b5fe` | 12 | 0 |
| `t-m1-math-2024c19bab` | 16 | 0 |
| `t-m1-math-2066591218` | 12 | 0 |
| `t-m1-math-2238832a51` | 14 | 0 |
| `t-m1-math-22796401e3` | 15 | 0 |
| `t-m1-math-238ef49abe` | 15 | 0 |
| `t-m1-math-2504b1c790` | 16 | 0 |
| `t-m1-math-2685968270` | 14 | 0 |
| `t-m1-math-2808203ba6` | 15 | 0 |
| `t-m1-math-2ce72c469c` | 15 | 0 |
| `t-m1-math-2e57aa4967` | 10 | 0 |
| `t-m1-math-30ee9b28e7` | 15 | 0 |
| `t-m1-math-343e5c3703` | 15 | 0 |
| `t-m1-math-34ef6139cd` | 12 | 0 |
| `t-m1-math-36caa8f448` | 14 | 0 |
| `t-m1-math-39fd213350` | 12 | 0 |
| `t-m1-math-3b61204ca4` | 15 | 0 |
| `t-m1-math-3fb2d957fd` | 14 | 0 |
| `t-m1-math-42fe0b2340` | 15 | 0 |
| `t-m1-math-4438f6640a` | 20 | 0 |
| `t-m1-math-460a337b0f` | 15 | 0 |
| `t-m1-math-4966ba5e60` | 15 | 0 |
| `t-m1-math-4a39ac495c` | 15 | 0 |
| `t-m1-math-4b44475a16` | 12 | 0 |
| `t-m1-math-4b5261a606` | 15 | 0 |
| `t-m1-math-4bc7fa5bd8` | 12 | 0 |
| `t-m1-math-4cf4767a2a` | 12 | 0 |
| `t-m1-math-4e793bf802` | 12 | 0 |
| `t-m1-math-4ed9bb4a6f` | 15 | 0 |
| `t-m1-math-50ce1871c9` | 15 | 0 |
| `t-m1-math-5168c830e1` | 12 | 0 |
| `t-m1-math-5175b6c124` | 16 | 0 |
| `t-m1-math-522f696f89` | 14 | 0 |
| `t-m1-math-52ab5f560d` | 15 | 0 |
| `t-m1-math-54ba051e49` | 16 | 0 |
| `t-m1-math-57a5adc18c` | 12 | 0 |
| `t-m1-math-5c2856f557` | 15 | 0 |
| `t-m1-math-60548fac4c` | 15 | 0 |
| `t-m1-math-619fbf0510` | 15 | 0 |
| `t-m1-math-66fc551219` | 8 | 0 |
| `t-m1-math-67266f0d43` | 15 | 0 |
| `t-m1-math-68f4abf205` | 12 | 0 |
| `t-m1-math-6a99c4e7b9` | 13 | 0 |
| `t-m1-math-6b55e9667d` | 15 | 0 |
| `t-m1-math-6cf42ad089` | 15 | 0 |
| `t-m1-math-704d6967f5` | 15 | 0 |
| `t-m1-math-78119c00fa` | 12 | 0 |
| `t-m1-math-7b9bc42a89` | 12 | 0 |
| `t-m1-math-7c69475384` | 12 | 0 |
| `t-m1-math-7cd439975d` | 15 | 0 |
| `t-m1-math-7cfc53cfe3` | 10 | 0 |
| `t-m1-math-7d27cb6c96` | 12 | 0 |
| `t-m1-math-7d57d4e1ca` | 14 | 0 |
| `t-m1-math-7d9c7fe9b7` | 16 | 0 |
| `t-m1-math-7dfa348ebe` | 12 | 0 |
| `t-m1-math-7ebf8721ab` | 12 | 0 |
| `t-m1-math-80f00df21a` | 12 | 0 |
| `t-m1-math-816090100d` | 10 | 0 |
| `t-m1-math-83202af8cd` | 15 | 0 |
| `t-m1-math-86ae1a370c` | 15 | 0 |
| `t-m1-math-87f4708182` | 15 | 0 |
| `t-m1-math-885c585e8d` | 12 | 0 |
| `t-m1-math-89d7993071` | 15 | 0 |
| `t-m1-math-8c9d4c82de` | 15 | 0 |
| `t-m1-math-8fac252229` | 12 | 0 |
| `t-m1-math-92a5086b7e` | 16 | 0 |
| `t-m1-math-946cf5b5de` | 12 | 0 |
| `t-m1-math-94ae1971b7` | 15 | 0 |
| `t-m1-math-95e135aaaa` | 15 | 0 |
| `t-m1-math-9680777c60` | 12 | 0 |
| `t-m1-math-9a46a86414` | 16 | 0 |
| `t-m1-math-9a4ea8a151` | 15 | 0 |
| `t-m1-math-9c05061889` | 16 | 0 |
| `t-m1-math-9c63e9463c` | 15 | 0 |
| `t-m1-math-9cccfb43a9` | 10 | 0 |
| `t-m1-math-9cfd3666cc` | 15 | 0 |
| `t-m1-math-9d3cc1b87d` | 15 | 0 |
| `t-m1-math-9d4529091e` | 16 | 0 |
| `t-m1-math-9e36cfcd1e` | 12 | 0 |
| `t-m1-math-9e8b85e497` | 15 | 0 |
| `t-m1-math-a1b4dbc6c8` | 12 | 0 |
| `t-m1-math-a4bd87484d` | 16 | 0 |
| `t-m1-math-a4d06ed725` | 14 | 0 |
| `t-m1-math-a66dff6a01` | 12 | 0 |
| `t-m1-math-a6f3c172a1` | 12 | 0 |
| `t-m1-math-a6f3d42a46` | 16 | 0 |
| `t-m1-math-a92b33714d` | 16 | 0 |
| `t-m1-math-a96a82742c` | 12 | 0 |
| `t-m1-math-abd23a0308` | 12 | 0 |
| `t-m1-math-acf4708811` | 15 | 0 |
| `t-m1-math-ad905d1c81` | 15 | 0 |
| `t-m1-math-ae4993c60b` | 15 | 0 |
| `t-m1-math-afe932cfa5` | 16 | 0 |
| `t-m1-math-b0189933e3` | 16 | 0 |
| `t-m1-math-b0dd538103` | 15 | 0 |
| `t-m1-math-b664132586` | 15 | 0 |
| `t-m1-math-b6bb3006a7` | 15 | 0 |
| `t-m1-math-b933178488` | 14 | 0 |
| `t-m1-math-baa6a6ea5f` | 12 | 0 |
| `t-m1-math-bb666f19a3` | 14 | 0 |
| `t-m1-math-bc98de9bba` | 15 | 0 |
| `t-m1-math-c28364b5db` | 12 | 0 |
| `t-m1-math-c37bb4e69e` | 15 | 0 |
| `t-m1-math-c38d8ae410` | 12 | 0 |
| `t-m1-math-c57cf4041d` | 15 | 0 |
| `t-m1-math-c5c498c5b9` | 15 | 0 |
| `t-m1-math-c6367a8519` | 15 | 0 |
| `t-m1-math-c9f6ad1285` | 16 | 0 |
| `t-m1-math-cafadd8fa7` | 12 | 0 |
| `t-m1-math-cc21487d55` | 15 | 0 |
| `t-m1-math-cf884c14f7` | 15 | 0 |
| `t-m1-math-d14bc6e521` | 15 | 0 |
| `t-m1-math-d767caa3a3` | 12 | 0 |
| `t-m1-math-d7c1057ae7` | 15 | 0 |
| `t-m1-math-dbee98d8d8` | 15 | 0 |
| `t-m1-math-dc821b98db` | 12 | 0 |
| `t-m1-math-dd67cf5588` | 16 | 0 |
| `t-m1-math-debd9916ac` | 15 | 0 |
| `t-m1-math-e0d02a9c89` | 10 | 0 |
| `t-m1-math-e7c2470af0` | 15 | 0 |
| `t-m1-math-e904f326c5` | 15 | 0 |
| `t-m1-math-eb63c9dee6` | 8 | 0 |
| `t-m1-math-ec142fa6b8` | 14 | 0 |
| `t-m1-math-eeef2da97b` | 15 | 0 |
| `t-m1-math-efa3fa9ee2` | 12 | 0 |
| `t-m1-math-f151ee2158` | 16 | 0 |
| `t-m1-math-f48fadb46a` | 14 | 0 |
| `t-m1-math-f787597eb3` | 12 | 0 |
| `t-m1-math-f8ca253799` | 12 | 0 |
| `t-m1-math-f8d605cba4` | 16 | 0 |
| `t-m1-math-fb47f74f2b` | 15 | 0 |
| `t-m1-math-fbeb201e7f` | 12 | 0 |
| `t-m1-math-fe97fbdd60` | 12 | 0 |
| `t-m1-math-ffadad0389` | 15 | 0 |

## Declared rewrite variants

_none_

## Exclusion components

168 components; size histogram: 2 14, 3 2, 7 1, 8 3, 9 1, 10 5, 11 1, 12 43, 13 4, 14 14, 15 62, 16 16, 20 2. Cap K = 8 (template-variant components are exempt).

_none_
