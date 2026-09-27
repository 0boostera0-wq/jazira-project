# Coverage

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

## Term undeterminable

Most textbook covers do not name a term (docs/CONTENT_ENGINE.md §0, §2.4); this bucket is the expected state until evidence or an owner decision exists.

- Subjects with no verified or inferred term membership: **238**
- Subjects with one term determined and the other not: **0**
- Resources with `term_status: needs_review`: **315**

Evidence routes tried for those resources (a route counts as tried when its input exists: front matter, a TOC, a vision read, the listing title, an owner decision; routes that record hits only are counted from their evidence rows):

| Route | Resources tried | Evidence rows found |
|---|---|---|
| cover_text | 306 | 0 |
| title_page_text | 0 | 0 |
| toc_marker | 6 | 0 |
| vision | 6 | 0 |
| listing_title | 315 | 0 |
| plan_guide | 0 | 0 |
| course_code | 0 | 0 |
| owner_decision | 0 | 0 |

Subjects:

- `elementary/grade-1/islamic`
- `elementary/grade-2/islamic`
- `elementary/grade-3/islamic`
- `elementary/grade-4/islamic`
- `elementary/grade-5/islamic`
- `elementary/grade-6/islamic`
- `high-school/grade-1/first-year/quran`
- `high-school/grade-2/business/english`
- `high-school/grade-2/cs-eng/math`
- `high-school/grade-2/general/math`
- `high-school/grade-2/health/math`
- `high-school/grade-2/sharia/quran`
- `high-school/grade-3/business/english`
- `high-school/grade-3/cs-eng/math`
- `high-school/grade-3/general/math`
- `high-school/grade-3/health/math`
- `high-school/grade-3/sharia/quran`
- `middle/grade-1/islamic`
- `middle/grade-2/islamic`
- `middle/grade-3/islamic`
- `elementary/grade-1/arabic`
- `elementary/grade-2/arabic`
- `elementary/grade-3/arabic`
- `elementary/grade-4/arabic`
- `elementary/grade-5/arabic`
- `elementary/grade-6/arabic`
- `high-school/grade-1/first-year/math`
- `high-school/grade-2/business/tawhid`
- `high-school/grade-2/cs-eng/english`
- `high-school/grade-2/general/english`
- `high-school/grade-2/health/english`
- `high-school/grade-2/sharia/english`
- `high-school/grade-3/business/fiqh`
- `high-school/grade-3/cs-eng/english`
- `high-school/grade-3/general/english`
- `high-school/grade-3/health/english`
- `high-school/grade-3/sharia/english`
- `middle/grade-1/arabic`
- `middle/grade-2/arabic`
- `middle/grade-3/arabic`
- `elementary/grade-1/math`
- `elementary/grade-2/math`
- `elementary/grade-3/math`
- `elementary/grade-4/social`
- `elementary/grade-5/social`
- `elementary/grade-6/social`
- `high-school/grade-1/first-year/english`
- `high-school/grade-2/business/tafsir`
- `high-school/grade-2/cs-eng/chemistry`
- `high-school/grade-2/general/chemistry`
- … and 188 more (full list in coverage.json)

## Front-matter coverage

**306/315** books have a front-matter row with pages read (`sources/ien/book-frontmatter.jsonl`). 5 further row(s) record a failed read (`error`) and are not counted.

## Totals (curriculum questions and nodes)

| Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|
| 2068 | 9589 (9242 / 347) | 300 (300 / 0 / 0) | 1314 (291 / 1023; 0) | 0 (0) | 79 of 9589 | — |

## Stage `elementary`

### الصف الأول الابتدائي / Elementary Grade 1 (`elementary/grade-1`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 84 | 372 (364 / 8) | 14 (14 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 372 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| القرآن الكريم والدراسات الإسلامية `elementary/grade-1/islamic` | verified | 16 | 47 (47 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 47 | — |
| اللغة العربية `elementary/grade-1/arabic` | verified | 9 | 58 (50 / 8) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 58 | — |
| الرياضيات `elementary/grade-1/math` | verified | 13 | 97 (97 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 97 | — |
| العلوم `elementary/grade-1/science` | verified | 10 | 23 (23 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 23 | — |
| اللغة الإنجليزية `elementary/grade-1/english` | verified | 10 | 42 (42 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 42 | — |
| التربية الفنية `elementary/grade-1/art` | verified | 8 | 23 (23 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 23 | — |
| التربية البدنية والدفاع عن النفس `elementary/grade-1/pe` | verified | 11 | 53 (53 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 53 | — |
| المهارات الحياتية والأسرية `elementary/grade-1/life` | verified | 7 | 29 (29 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 29 | — |

### الصف الثاني الابتدائي / Elementary Grade 2 (`elementary/grade-2`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 83 | 357 (357 / 0) | 14 (14 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 357 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| القرآن الكريم والدراسات الإسلامية `elementary/grade-2/islamic` | verified | 15 | 48 (48 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 48 | — |
| اللغة العربية `elementary/grade-2/arabic` | verified | 8 | 28 (28 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 28 | — |
| الرياضيات `elementary/grade-2/math` | verified | 13 | 117 (117 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 117 | — |
| العلوم `elementary/grade-2/science` | verified | 12 | 24 (24 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 24 | — |
| اللغة الإنجليزية `elementary/grade-2/english` | verified | 10 | 45 (45 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 45 | — |
| التربية الفنية `elementary/grade-2/art` | verified | 8 | 21 (21 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 21 | — |
| التربية البدنية والدفاع عن النفس `elementary/grade-2/pe` | verified | 11 | 47 (47 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 47 | — |
| المهارات الحياتية والأسرية `elementary/grade-2/life` | verified | 6 | 27 (27 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 27 | — |

### الصف الثالث الابتدائي / Elementary Grade 3 (`elementary/grade-3`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 85 | 347 (347 / 0) | 14 (14 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 347 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| القرآن الكريم والدراسات الإسلامية `elementary/grade-3/islamic` | verified | 16 | 50 (50 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 50 | — |
| اللغة العربية `elementary/grade-3/arabic` | verified | 8 | 28 (28 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 28 | — |
| الرياضيات `elementary/grade-3/math` | verified | 11 | 99 (99 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 99 | — |
| العلوم `elementary/grade-3/science` | verified | 12 | 25 (25 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 25 | — |
| اللغة الإنجليزية `elementary/grade-3/english` | verified | 12 | 55 (55 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 55 | — |
| التربية الفنية `elementary/grade-3/art` | verified | 8 | 18 (18 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 18 | — |
| التربية البدنية والدفاع عن النفس `elementary/grade-3/pe` | verified | 11 | 47 (47 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 47 | — |
| المهارات الحياتية والأسرية `elementary/grade-3/life` | verified | 7 | 25 (25 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 25 | — |

### الصف الرابع الابتدائي / Elementary Grade 4 (`elementary/grade-4`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 98 | 539 (537 / 2) | 12 (12 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 539 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| القرآن الكريم والدراسات الإسلامية `elementary/grade-4/islamic` | verified | 19 | 114 (114 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 114 | — |
| اللغة العربية `elementary/grade-4/arabic` | verified | 2 | 66 (64 / 2) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 66 | — |
| الدراسات الاجتماعية `elementary/grade-4/social` | verified | 9 | 34 (34 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 34 | — |
| الرياضيات `elementary/grade-4/math` | verified | 12 | 114 (114 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 114 | — |
| العلوم `elementary/grade-4/science` | verified | 10 | 24 (24 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 24 | — |
| اللغة الإنجليزية `elementary/grade-4/english` | verified | 9 | 51 (51 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 51 | — |
| المهارات الرقمية `elementary/grade-4/digital` | verified | 8 | 30 (30 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 30 | — |
| التربية الفنية `elementary/grade-4/art` | verified | 9 | 19 (19 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 19 | — |
| التربية البدنية والدفاع عن النفس `elementary/grade-4/pe` | verified | 11 | 58 (58 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 58 | — |
| المهارات الحياتية والأسرية `elementary/grade-4/life` | verified | 9 | 29 (29 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 29 | — |

### الصف الخامس الابتدائي / Elementary Grade 5 (`elementary/grade-5`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 134 | 632 (579 / 53) | 13 (13 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 632 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| القرآن الكريم والدراسات الإسلامية `elementary/grade-5/islamic` | verified | 53 | 231 (231 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 231 | — |
| اللغة العربية `elementary/grade-5/arabic` | verified | 2 | 46 (44 / 2) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 46 | — |
| الدراسات الاجتماعية `elementary/grade-5/social` | verified | 8 | 30 (30 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 30 | — |
| الرياضيات `elementary/grade-5/math` | verified | 12 | 114 (114 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 114 | — |
| العلوم `elementary/grade-5/science` | verified | 12 | 24 (24 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 24 | — |
| اللغة الإنجليزية `elementary/grade-5/english` | needs_review | 9 | 51 (0 / 51) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 51 | — |
| المهارات الرقمية `elementary/grade-5/digital` | verified | 8 | 26 (26 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 26 | — |
| التربية الفنية `elementary/grade-5/art` | verified | 9 | 20 (20 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 20 | — |
| التربية البدنية والدفاع عن النفس `elementary/grade-5/pe` | verified | 11 | 62 (62 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 62 | — |
| المهارات الحياتية والأسرية `elementary/grade-5/life` | verified | 10 | 28 (28 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 28 | — |

### الصف السادس الابتدائي / Elementary Grade 6 (`elementary/grade-6`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 123 | 556 (554 / 2) | 13 (13 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 556 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| القرآن الكريم والدراسات الإسلامية `elementary/grade-6/islamic` | verified | 54 | 238 (238 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 238 | — |
| اللغة العربية `elementary/grade-6/arabic` | verified | 2 | 45 (43 / 2) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 45 | — |
| الدراسات الاجتماعية `elementary/grade-6/social` | verified | 8 | 29 (29 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 29 | — |
| الرياضيات `elementary/grade-6/math` | verified | 10 | 94 (94 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 94 | — |
| العلوم `elementary/grade-6/science` | verified | 12 | 24 (24 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 24 | — |
| اللغة الإنجليزية `elementary/grade-6/english` | needs_review | 0 | 0 (0 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 0 | — |
| المهارات الرقمية `elementary/grade-6/digital` | verified | 8 | 24 (24 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 24 | — |
| التربية الفنية `elementary/grade-6/art` | verified | 9 | 16 (16 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 16 | — |
| التربية البدنية والدفاع عن النفس `elementary/grade-6/pe` | verified | 11 | 67 (67 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 67 | — |
| المهارات الحياتية والأسرية `elementary/grade-6/life` | verified | 9 | 19 (19 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 19 | — |

## Stage `middle`

### الصف الأول المتوسط / Middle School Grade 1 (`middle/grade-1`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 146 | 624 (589 / 35) | 13 (13 / 0 / 0) | 1314 (291 / 1023; 0) | 0 (0) | 79 of 624 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| القرآن الكريم والدراسات الإسلامية `middle/grade-1/islamic` | verified | 49 | 146 (146 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 146 | — |
| اللغة العربية `middle/grade-1/arabic` | verified | 6 | 91 (85 / 6) | 2 (2 / 0 / 0) | 476 (48 / 428; 0) | 0 (0) | 0 of 91 | — |
| الدراسات الاجتماعية `middle/grade-1/social` | verified | 8 | 35 (35 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 35 | — |
| الرياضيات `middle/grade-1/math` | verified | 9 | 84 (57 / 27) | 2 (2 / 0 / 0) | 384 (169 / 215; 0) | 0 (0) | 66 of 84 | — |
| العلوم `middle/grade-1/science` | verified | 19 | 28 (26 / 2) | 2 (2 / 0 / 0) | 454 (74 / 380; 0) | 0 (0) | 13 of 28 | — |
| اللغة الإنجليزية `middle/grade-1/english` | verified | 16 | 95 (95 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 95 | — |
| المهارات الرقمية `middle/grade-1/digital` | verified | 9 | 38 (38 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 38 | — |
| التربية الفنية `middle/grade-1/art` | verified | 9 | 17 (17 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 17 | — |
| التربية البدنية والدفاع عن النفس `middle/grade-1/pe` | verified | 11 | 57 (57 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 57 | — |
| المهارات الحياتية والأسرية `middle/grade-1/life` | verified | 10 | 33 (33 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 33 | — |

### الصف الثاني المتوسط / Middle School Grade 2 (`middle/grade-2`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 128 | 617 (611 / 6) | 13 (13 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 617 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| القرآن الكريم والدراسات الإسلامية `middle/grade-2/islamic` | verified | 37 | 135 (135 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 135 | — |
| اللغة العربية `middle/grade-2/arabic` | verified | 6 | 97 (91 / 6) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 97 | — |
| الدراسات الاجتماعية `middle/grade-2/social` | verified | 9 | 35 (35 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 35 | — |
| الرياضيات `middle/grade-2/math` | verified | 10 | 93 (93 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 93 | — |
| العلوم `middle/grade-2/science` | verified | 12 | 27 (27 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 27 | — |
| اللغة الإنجليزية `middle/grade-2/english` | verified | 16 | 96 (96 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 96 | — |
| المهارات الرقمية `middle/grade-2/digital` | verified | 8 | 23 (23 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 23 | — |
| التربية الفنية `middle/grade-2/art` | verified | 9 | 20 (20 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 20 | — |
| التربية البدنية والدفاع عن النفس `middle/grade-2/pe` | verified | 11 | 55 (55 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 55 | — |
| المهارات الحياتية والأسرية `middle/grade-2/life` | verified | 10 | 36 (36 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 36 | — |

### الصف الثالث المتوسط / Middle School Grade 3 (`middle/grade-3`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 125 | 634 (628 / 6) | 14 (14 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 634 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| القرآن الكريم والدراسات الإسلامية `middle/grade-3/islamic` | verified | 36 | 166 (166 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 166 | — |
| اللغة العربية `middle/grade-3/arabic` | verified | 6 | 101 (95 / 6) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 101 | — |
| الدراسات الاجتماعية `middle/grade-3/social` | verified | 9 | 43 (43 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 43 | — |
| الرياضيات `middle/grade-3/math` | verified | 10 | 75 (75 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 75 | — |
| العلوم `middle/grade-3/science` | verified | 12 | 28 (28 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 28 | — |
| اللغة الإنجليزية `middle/grade-3/english` | verified | 12 | 72 (72 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 72 | — |
| المهارات الرقمية `middle/grade-3/digital` | verified | 8 | 24 (24 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 24 | — |
| التربية الفنية `middle/grade-3/art` | verified | 9 | 14 (14 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 14 | — |
| التربية البدنية والدفاع عن النفس `middle/grade-3/pe` | verified | 11 | 58 (58 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 58 | — |
| المهارات الحياتية والأسرية `middle/grade-3/life` | verified | 10 | 34 (34 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 34 | — |
| التفكير الناقد `middle/grade-3/critical` | verified | 2 | 19 (19 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 19 | — |

## Stage `high-school`

### السنة الأولى المشتركة / Common first year (`high-school/grade-1/first-year`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 95 | 468 (468 / 0) | 17 (17 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 468 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| القرآن الكريم وتفسيره `high-school/grade-1/first-year/quran` | verified | 10 | 25 (25 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 25 | — |
| الرياضيات `high-school/grade-1/first-year/math` | verified | 8 | 73 (73 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 73 | — |
| اللغة الإنجليزية `high-school/grade-1/first-year/english` | verified | 12 | 83 (83 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 83 | — |
| التقنية الرقمية `high-school/grade-1/first-year/digital` | verified | 8 | 38 (38 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 38 | — |
| الأحياء `high-school/grade-1/first-year/biology` | verified | 8 | 20 (20 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 20 | — |
| الكيمياء `high-school/grade-1/first-year/chemistry` | verified | 5 | 30 (30 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 30 | — |
| الفيزياء `high-school/grade-1/first-year/physics` | verified | 6 | 18 (18 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 18 | — |
| علم البيئة `high-school/grade-1/first-year/environment` | verified | 5 | 13 (13 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 13 | — |
| الكفايات اللغوية `high-school/grade-1/first-year/arabic` | verified | 10 | 46 (46 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 46 | — |
| الحديث `high-school/grade-1/first-year/hadith` | verified | 2 | 26 (26 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 26 | — |
| المعرفة المالية `high-school/grade-1/first-year/financial-literacy` | verified | 2 | 5 (5 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 5 | — |
| الدراسات الاجتماعية `high-school/grade-1/first-year/social` | verified | 4 | 19 (19 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 19 | — |
| التفكير الناقد `high-school/grade-1/first-year/critical` | verified | 2 | 16 (16 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 16 | — |
| التربية المهنية `high-school/grade-1/first-year/vocational` | verified | 3 | 13 (13 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 13 | — |
| التربية الصحية والبدنية `high-school/grade-1/first-year/pe` | verified | 10 | 43 (43 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 43 | — |

### المسار العام / General track (`high-school/grade-2/general`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 97 | 446 (446 / 0) | 15 (15 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 446 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| الرياضيات `high-school/grade-2/general/math` | verified | 8 | 72 (72 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 72 | — |
| اللغة الإنجليزية `high-school/grade-2/general/english` | verified | 12 | 84 (84 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 84 | — |
| الكيمياء `high-school/grade-2/general/chemistry` | verified | 13 | 60 (60 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 60 | — |
| الأحياء `high-school/grade-2/general/biology` | verified | 19 | 47 (47 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 47 | — |
| الفيزياء `high-school/grade-2/general/physics` | verified | 6 | 13 (13 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 13 | — |
| التوحيد `high-school/grade-2/general/tawhid` | verified | 7 | 27 (27 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 27 | — |
| الكفايات اللغوية `high-school/grade-2/general/arabic` | verified | 10 | 35 (35 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 35 | — |
| التقنية الرقمية `high-school/grade-2/general/digital` | verified | 5 | 21 (21 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 21 | — |
| التاريخ `high-school/grade-2/general/history` | verified | 6 | 37 (37 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 37 | — |
| الفنون `high-school/grade-2/general/arts` | verified | 3 | 10 (10 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 10 | — |
| اللياقة والثقافة الصحية `high-school/grade-2/general/fitness` | verified | 8 | 40 (40 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 40 | — |

### المسار الشرعي / Sharia track (`high-school/grade-2/sharia`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 82 | 413 (363 / 50) | 15 (15 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 413 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| القرآن الكريم `high-school/grade-2/sharia/quran` | needs_review | 2 | 4 (0 / 4) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 4 | — |
| اللغة الإنجليزية `high-school/grade-2/sharia/english` | verified | 12 | 84 (84 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 84 | — |
| التوحيد `high-school/grade-2/sharia/tawhid` | verified | 15 | 51 (51 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 51 | — |
| الحديث `high-school/grade-2/sharia/hadith` | verified | 1 | 26 (26 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 26 | — |
| القراءات `high-school/grade-2/sharia/qiraat` | needs_review | 7 | 46 (0 / 46) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 46 | — |
| علوم القرآن `high-school/grade-2/sharia/quran-sciences` | verified | 5 | 24 (24 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 24 | — |
| التفسير `high-school/grade-2/sharia/tafsir` | verified | 6 | 26 (26 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 26 | — |
| الكفايات اللغوية `high-school/grade-2/sharia/arabic` | verified | 10 | 35 (35 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 35 | — |
| الدراسات اللغوية `high-school/grade-2/sharia/linguistic-studies` | verified | 2 | 9 (9 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 9 | — |
| التقنية الرقمية `high-school/grade-2/sharia/digital` | verified | 5 | 21 (21 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 21 | — |
| التاريخ `high-school/grade-2/sharia/history` | verified | 6 | 37 (37 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 37 | — |
| الفنون `high-school/grade-2/sharia/arts` | verified | 3 | 10 (10 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 10 | — |
| اللياقة والثقافة الصحية `high-school/grade-2/sharia/fitness` | verified | 8 | 40 (40 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 40 | — |

### مسار إدارة الأعمال / Business Administration track (`high-school/grade-2/business`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 80 | 337 (337 / 0) | 17 (17 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 337 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| اللغة الإنجليزية `high-school/grade-2/business/english` | verified | 12 | 84 (84 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 84 | — |
| التوحيد `high-school/grade-2/business/tawhid` | verified | 7 | 27 (27 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 27 | — |
| التفسير `high-school/grade-2/business/tafsir` | verified | 6 | 26 (26 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 26 | — |
| الكفايات اللغوية `high-school/grade-2/business/arabic` | verified | 10 | 35 (35 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 35 | — |
| الدراسات اللغوية `high-school/grade-2/business/linguistic-studies` | verified | 2 | 9 (9 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 9 | — |
| صناعة القرار في الأعمال `high-school/grade-2/business/decision-making` | verified | 4 | 6 (6 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 6 | — |
| مقدمة في الأعمال `high-school/grade-2/business/intro-business` | verified | 8 | 9 (9 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 9 | — |
| مبادئ الاقتصاد `high-school/grade-2/business/economics` | verified | 6 | 24 (24 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 24 | — |
| الإدارة المالية `high-school/grade-2/business/finance` | verified | 3 | 9 (9 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 9 | — |
| التقنية الرقمية `high-school/grade-2/business/digital` | verified | 5 | 21 (21 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 21 | — |
| التاريخ `high-school/grade-2/business/history` | verified | 6 | 37 (37 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 37 | — |
| الفنون `high-school/grade-2/business/arts` | verified | 3 | 10 (10 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 10 | — |
| اللياقة والثقافة الصحية `high-school/grade-2/business/fitness` | verified | 8 | 40 (40 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 40 | — |

### مسار علوم الحاسب والهندسة / Computer Science and Engineering track (`high-school/grade-2/cs-eng`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 99 | 412 (412 / 0) | 15 (15 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 412 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| الرياضيات `high-school/grade-2/cs-eng/math` | verified | 8 | 72 (72 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 72 | — |
| اللغة الإنجليزية `high-school/grade-2/cs-eng/english` | verified | 12 | 84 (84 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 84 | — |
| الكيمياء `high-school/grade-2/cs-eng/chemistry` | verified | 13 | 60 (60 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 60 | — |
| الأحياء `high-school/grade-2/cs-eng/biology` | verified | 19 | 47 (47 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 47 | — |
| الفيزياء `high-school/grade-2/cs-eng/physics` | verified | 6 | 13 (13 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 13 | — |
| التوحيد `high-school/grade-2/cs-eng/tawhid` | verified | 7 | 27 (27 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 27 | — |
| الكفايات اللغوية `high-school/grade-2/cs-eng/arabic` | verified | 10 | 35 (35 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 35 | — |
| علم البيانات `high-school/grade-2/cs-eng/data-science` | verified | 4 | 11 (11 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 11 | — |
| إنترنت الأشياء `high-school/grade-2/cs-eng/iot` | verified | 7 | 14 (14 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 14 | — |
| الهندسة `high-school/grade-2/cs-eng/engineering` | verified | 5 | 9 (9 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 9 | — |
| اللياقة والثقافة الصحية `high-school/grade-2/cs-eng/fitness` | verified | 8 | 40 (40 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 40 | — |

### مسار الصحة والحياة / Health and Life track (`high-school/grade-2/health`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 97 | 408 (408 / 0) | 15 (15 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 408 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| الرياضيات `high-school/grade-2/health/math` | verified | 8 | 72 (72 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 72 | — |
| اللغة الإنجليزية `high-school/grade-2/health/english` | verified | 12 | 84 (84 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 84 | — |
| الكيمياء `high-school/grade-2/health/chemistry` | verified | 13 | 60 (60 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 60 | — |
| الأحياء `high-school/grade-2/health/biology` | verified | 19 | 47 (47 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 47 | — |
| الفيزياء `high-school/grade-2/health/physics` | verified | 6 | 13 (13 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 13 | — |
| التوحيد `high-school/grade-2/health/tawhid` | verified | 7 | 27 (27 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 27 | — |
| الكفايات اللغوية `high-school/grade-2/health/arabic` | verified | 10 | 35 (35 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 35 | — |
| التقنية الرقمية `high-school/grade-2/health/digital` | verified | 5 | 21 (21 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 21 | — |
| مبادئ العلوم الصحية `high-school/grade-2/health/health-sciences` | verified | 9 | 9 (9 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 9 | — |
| اللياقة والثقافة الصحية `high-school/grade-2/health/fitness` | verified | 8 | 40 (40 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 40 | — |

### المسار العام / General track (`high-school/grade-3/general`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 136 | 625 (441 / 184) | 21 (21 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 625 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| الرياضيات `high-school/grade-3/general/math` | verified | 8 | 57 (57 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 57 | — |
| اللغة الإنجليزية `high-school/grade-3/general/english` | verified | 12 | 84 (84 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 84 | — |
| الكيمياء `high-school/grade-3/general/chemistry` | verified | 4 | 13 (13 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 13 | — |
| الفيزياء `high-school/grade-3/general/physics` | verified | 18 | 41 (41 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 41 | — |
| علوم الأرض والفضاء `high-school/grade-3/general/earth-space` | verified | 12 | 36 (36 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 36 | — |
| الفقه `high-school/grade-3/general/fiqh` | verified | 8 | 39 (39 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 39 | — |
| الدراسات الأدبية `high-school/grade-3/general/arabic` | verified | 2 | 37 (37 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 37 | — |
| الدراسات النفسية والاجتماعية `high-school/grade-3/general/psych-social` | verified | 5 | 15 (15 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 15 | — |
| التقنية الرقمية `high-school/grade-3/general/digital` | verified | 3 | 9 (9 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 9 | — |
| المواطنة الرقمية `high-school/grade-3/general/digital-citizenship` | verified | 3 | 13 (13 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 13 | — |
| الجغرافيا `high-school/grade-3/general/geography` | verified | 8 | 32 (32 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 32 | — |
| المهارات الحياتية `high-school/grade-3/general/life` | verified | 3 | 13 (13 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 13 | — |
| التربية الصحية والبدنية `high-school/grade-3/general/pe` | verified | 9 | 28 (28 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 28 | — |
| البحث ومصادر المعلومات `high-school/grade-3/general/research` | verified | 5 | 24 (24 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 24 | — |
| المجال الاختياري `high-school/grade-3/general/elective` | needs_review | 36 | 184 (0 / 184) | 6 (6 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 184 | — |

### المسار الشرعي / Sharia track (`high-school/grade-3/sharia`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 113 | 573 (572 / 1) | 16 (16 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 573 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| القرآن الكريم `high-school/grade-3/sharia/quran` | needs_review | 1 | 1 (0 / 1) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 1 | — |
| اللغة الإنجليزية `high-school/grade-3/sharia/english` | verified | 12 | 84 (84 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 84 | — |
| التفسير `high-school/grade-3/sharia/tafsir` | verified | 7 | 37 (37 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 37 | — |
| الفقه `high-school/grade-3/sharia/fiqh` | verified | 16 | 83 (83 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 83 | — |
| أصول الفقه `high-school/grade-3/sharia/usul-fiqh` | verified | 6 | 34 (34 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 34 | — |
| مصطلح الحديث `high-school/grade-3/sharia/hadith-terminology` | verified | 10 | 31 (31 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 31 | — |
| الفرائض `high-school/grade-3/sharia/faraid` | verified | 6 | 40 (40 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 40 | — |
| الدراسات الأدبية `high-school/grade-3/sharia/arabic` | verified | 2 | 37 (37 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 37 | — |
| الدراسات النفسية والاجتماعية `high-school/grade-3/sharia/psych-social` | verified | 5 | 15 (15 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 15 | — |
| الدراسات البلاغية والنقدية `high-school/grade-3/sharia/rhetoric` | verified | 2 | 32 (32 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 32 | — |
| مبادئ القانون `high-school/grade-3/sharia/law` | verified | 13 | 49 (49 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 49 | — |
| تطبيقات في القانون `high-school/grade-3/sharia/law-applications` | verified | 5 | 20 (20 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 20 | — |
| المواطنة الرقمية `high-school/grade-3/sharia/digital-citizenship` | verified | 3 | 13 (13 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 13 | — |
| الجغرافيا `high-school/grade-3/sharia/geography` | verified | 8 | 32 (32 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 32 | — |
| المهارات الحياتية `high-school/grade-3/sharia/life` | verified | 3 | 13 (13 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 13 | — |
| التربية الصحية والبدنية `high-school/grade-3/sharia/pe` | verified | 9 | 28 (28 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 28 | — |
| البحث ومصادر المعلومات `high-school/grade-3/sharia/research` | verified | 5 | 24 (24 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 24 | — |
| مشروع التخرج `high-school/grade-3/sharia/capstone` | verified | 0 | 0 (0 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 0 | — |

### مسار إدارة الأعمال / Business Administration track (`high-school/grade-3/business`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 84 | 423 (423 / 0) | 19 (19 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 423 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| اللغة الإنجليزية `high-school/grade-3/business/english` | verified | 12 | 84 (84 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 84 | — |
| الفقه `high-school/grade-3/business/fiqh` | verified | 8 | 39 (39 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 39 | — |
| الدراسات الأدبية `high-school/grade-3/business/arabic` | verified | 2 | 37 (37 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 37 | — |
| الدراسات النفسية والاجتماعية `high-school/grade-3/business/psych-social` | verified | 5 | 15 (15 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 15 | — |
| الدراسات البلاغية والنقدية `high-school/grade-3/business/rhetoric` | verified | 2 | 32 (32 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 32 | — |
| مبادئ الإدارة `high-school/grade-3/business/management` | verified | 0 | 0 (0 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 0 | — |
| إدارة الفعاليات `high-school/grade-3/business/events` | verified | 0 | 0 (0 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 0 | — |
| تخطيط الحملات التسويقية `high-school/grade-3/business/marketing` | verified | 0 | 0 (0 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 0 | — |
| السكرتارية والإدارة المكتبية `high-school/grade-3/business/secretarial` | verified | 5 | 24 (24 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 24 | — |
| مبادئ القانون `high-school/grade-3/business/law` | verified | 13 | 49 (49 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 49 | — |
| تطبيقات في القانون `high-school/grade-3/business/law-applications` | verified | 5 | 20 (20 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 20 | — |
| المواطنة الرقمية `high-school/grade-3/business/digital-citizenship` | verified | 3 | 13 (13 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 13 | — |
| الإحصاء `high-school/grade-3/business/statistics` | verified | 4 | 13 (13 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 13 | — |
| الجغرافيا `high-school/grade-3/business/geography` | verified | 8 | 32 (32 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 32 | — |
| المهارات الحياتية `high-school/grade-3/business/life` | verified | 3 | 13 (13 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 13 | — |
| التربية الصحية والبدنية `high-school/grade-3/business/pe` | verified | 9 | 28 (28 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 28 | — |
| البحث ومصادر المعلومات `high-school/grade-3/business/research` | verified | 5 | 24 (24 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 24 | — |
| مشروع التخرج `high-school/grade-3/business/capstone` | verified | 0 | 0 (0 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 0 | — |

### مسار علوم الحاسب والهندسة / Computer Science and Engineering track (`high-school/grade-3/cs-eng`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 81 | 372 (372 / 0) | 15 (15 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 372 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| الرياضيات `high-school/grade-3/cs-eng/math` | verified | 8 | 57 (57 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 57 | — |
| اللغة الإنجليزية `high-school/grade-3/cs-eng/english` | verified | 12 | 84 (84 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 84 | — |
| الكيمياء `high-school/grade-3/cs-eng/chemistry` | verified | 4 | 13 (13 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 13 | — |
| الفيزياء `high-school/grade-3/cs-eng/physics` | verified | 18 | 41 (41 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 41 | — |
| علوم الأرض والفضاء `high-school/grade-3/cs-eng/earth-space` | verified | 12 | 36 (36 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 36 | — |
| الفقه `high-school/grade-3/cs-eng/fiqh` | verified | 8 | 39 (39 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 39 | — |
| الدراسات الأدبية `high-school/grade-3/cs-eng/arabic` | verified | 2 | 37 (37 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 37 | — |
| الذكاء الاصطناعي `high-school/grade-3/cs-eng/ai` | verified | 0 | 0 (0 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 0 | — |
| الأمن السيبراني `high-school/grade-3/cs-eng/cybersecurity` | verified | 0 | 0 (0 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 0 | — |
| هندسة البرمجيات `high-school/grade-3/cs-eng/software-engineering` | verified | 0 | 0 (0 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 0 | — |
| التصميم الهندسي `high-school/grade-3/cs-eng/engineering-design` | verified | 0 | 0 (0 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 0 | — |
| المهارات الحياتية `high-school/grade-3/cs-eng/life` | verified | 3 | 13 (13 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 13 | — |
| التربية الصحية والبدنية `high-school/grade-3/cs-eng/pe` | verified | 9 | 28 (28 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 28 | — |
| البحث ومصادر المعلومات `high-school/grade-3/cs-eng/research` | verified | 5 | 24 (24 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 24 | — |
| مشروع التخرج `high-school/grade-3/cs-eng/capstone` | verified | 0 | 0 (0 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 0 | — |

### مسار الصحة والحياة / Health and Life track (`high-school/grade-3/health`)

| Scope | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|
| whole leaf | 98 | 434 (434 / 0) | 15 (15 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 434 | — |

#### Term 1

_none_

#### Term 2

_none_

#### Term undeterminable

| Subject | Status | Units | Lessons (verified / needs review) | PDFs (available / unavailable / needs review) | Pages processed (text / vision; front-matter only) | Published (of which variants) | Lessons with exercises | Templates offered (scopes) |
|---|---|---|---|---|---|---|---|---|
| الرياضيات `high-school/grade-3/health/math` | verified | 8 | 57 (57 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 57 | — |
| اللغة الإنجليزية `high-school/grade-3/health/english` | verified | 12 | 84 (84 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 84 | — |
| الكيمياء `high-school/grade-3/health/chemistry` | verified | 4 | 13 (13 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 13 | — |
| الفيزياء `high-school/grade-3/health/physics` | verified | 18 | 41 (41 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 41 | — |
| علوم الأرض والفضاء `high-school/grade-3/health/earth-space` | verified | 12 | 36 (36 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 36 | — |
| الفقه `high-school/grade-3/health/fiqh` | verified | 8 | 39 (39 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 39 | — |
| الدراسات الأدبية `high-school/grade-3/health/arabic` | verified | 2 | 37 (37 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 37 | — |
| الرعاية الصحية `high-school/grade-3/health/healthcare` | verified | 0 | 0 (0 / 0) | 2 (2 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 0 | — |
| أنظمة جسم الإنسان `high-school/grade-3/health/body-systems` | verified | 13 | 49 (49 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 49 | — |
| الإحصاء `high-school/grade-3/health/statistics` | verified | 4 | 13 (13 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 13 | — |
| المهارات الحياتية `high-school/grade-3/health/life` | verified | 3 | 13 (13 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 13 | — |
| التربية الصحية والبدنية `high-school/grade-3/health/pe` | verified | 9 | 28 (28 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 28 | — |
| البحث ومصادر المعلومات `high-school/grade-3/health/research` | verified | 5 | 24 (24 / 0) | 1 (1 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 24 | — |
| مشروع التخرج `high-school/grade-3/health/capstone` | verified | 0 | 0 (0 / 0) | 0 (0 / 0 / 0) | 0 (0 / 0; 0) | 0 (0) | 0 of 0 | — |

## Gaps

### Subjects without books (21)

- `elementary/grade-1/pe`
- `elementary/grade-2/pe`
- `elementary/grade-3/pe`
- `elementary/grade-4/pe`
- `elementary/grade-5/pe`
- `elementary/grade-6/pe`
- `high-school/grade-1/first-year/pe`
- `high-school/grade-2/sharia/quran`
- `high-school/grade-3/business/capstone`
- `high-school/grade-3/business/pe`
- `high-school/grade-3/cs-eng/capstone`
- `high-school/grade-3/cs-eng/pe`
- `high-school/grade-3/general/pe`
- `high-school/grade-3/health/capstone`
- `high-school/grade-3/health/pe`
- `high-school/grade-3/sharia/capstone`
- `high-school/grade-3/sharia/pe`
- `high-school/grade-3/sharia/quran`
- `middle/grade-1/pe`
- `middle/grade-2/pe`
- `middle/grade-3/pe`

### Lessons without pages (9506)

- `elementary/grade-1/arabic/n13959`
- `elementary/grade-1/arabic/n13960`
- `elementary/grade-1/arabic/n13961`
- `elementary/grade-1/arabic/n13962`
- `elementary/grade-1/arabic/n13963`
- `elementary/grade-1/arabic/n13964`
- `elementary/grade-1/arabic/n13967`
- `elementary/grade-1/arabic/n14030`
- `elementary/grade-1/arabic/n14031`
- `elementary/grade-1/arabic/n14032`
- `elementary/grade-1/arabic/n14033`
- `elementary/grade-1/arabic/n14034`
- `elementary/grade-1/arabic/n14035`
- `elementary/grade-1/arabic/n14036`
- `elementary/grade-1/arabic/n14037`
- `elementary/grade-1/arabic/n14038`
- `elementary/grade-1/arabic/n14039`
- `elementary/grade-1/arabic/n14040`
- `elementary/grade-1/arabic/n14041`
- `elementary/grade-1/arabic/n14042`
- `elementary/grade-1/arabic/n14043`
- `elementary/grade-1/arabic/n144390`
- `elementary/grade-1/arabic/n144391`
- `elementary/grade-1/arabic/n144392`
- `elementary/grade-1/arabic/n176485`
- `elementary/grade-1/arabic/n3818`
- `elementary/grade-1/arabic/n3835`
- `elementary/grade-1/arabic/n3836`
- `elementary/grade-1/arabic/n3837`
- `elementary/grade-1/arabic/n3838`
- `elementary/grade-1/arabic/n3839`
- `elementary/grade-1/arabic/n3840`
- `elementary/grade-1/arabic/n3841`
- `elementary/grade-1/arabic/n3842`
- `elementary/grade-1/arabic/n3843`
- `elementary/grade-1/arabic/n3878`
- `elementary/grade-1/arabic/n3879`
- `elementary/grade-1/arabic/n3880`
- `elementary/grade-1/arabic/n3881`
- `elementary/grade-1/arabic/n3882`
- `elementary/grade-1/arabic/n3883`
- `elementary/grade-1/arabic/n489`
- `elementary/grade-1/arabic/n490`
- `elementary/grade-1/arabic/n492`
- `elementary/grade-1/arabic/n493`
- `elementary/grade-1/arabic/n494`
- `elementary/grade-1/arabic/n495`
- `elementary/grade-1/arabic/n496`
- `elementary/grade-1/arabic/n497`
- `elementary/grade-1/arabic/n498`
- … and 9456 more (full list in coverage.json)

### Lessons without exercises (9510)

- `elementary/grade-1/arabic/n13959`
- `elementary/grade-1/arabic/n13960`
- `elementary/grade-1/arabic/n13961`
- `elementary/grade-1/arabic/n13962`
- `elementary/grade-1/arabic/n13963`
- `elementary/grade-1/arabic/n13964`
- `elementary/grade-1/arabic/n13967`
- `elementary/grade-1/arabic/n14030`
- `elementary/grade-1/arabic/n14031`
- `elementary/grade-1/arabic/n14032`
- `elementary/grade-1/arabic/n14033`
- `elementary/grade-1/arabic/n14034`
- `elementary/grade-1/arabic/n14035`
- `elementary/grade-1/arabic/n14036`
- `elementary/grade-1/arabic/n14037`
- `elementary/grade-1/arabic/n14038`
- `elementary/grade-1/arabic/n14039`
- `elementary/grade-1/arabic/n14040`
- `elementary/grade-1/arabic/n14041`
- `elementary/grade-1/arabic/n14042`
- `elementary/grade-1/arabic/n14043`
- `elementary/grade-1/arabic/n144390`
- `elementary/grade-1/arabic/n144391`
- `elementary/grade-1/arabic/n144392`
- `elementary/grade-1/arabic/n176485`
- `elementary/grade-1/arabic/n3818`
- `elementary/grade-1/arabic/n3835`
- `elementary/grade-1/arabic/n3836`
- `elementary/grade-1/arabic/n3837`
- `elementary/grade-1/arabic/n3838`
- `elementary/grade-1/arabic/n3839`
- `elementary/grade-1/arabic/n3840`
- `elementary/grade-1/arabic/n3841`
- `elementary/grade-1/arabic/n3842`
- `elementary/grade-1/arabic/n3843`
- `elementary/grade-1/arabic/n3878`
- `elementary/grade-1/arabic/n3879`
- `elementary/grade-1/arabic/n3880`
- `elementary/grade-1/arabic/n3881`
- `elementary/grade-1/arabic/n3882`
- `elementary/grade-1/arabic/n3883`
- `elementary/grade-1/arabic/n489`
- `elementary/grade-1/arabic/n490`
- `elementary/grade-1/arabic/n492`
- `elementary/grade-1/arabic/n493`
- `elementary/grade-1/arabic/n494`
- `elementary/grade-1/arabic/n495`
- `elementary/grade-1/arabic/n496`
- `elementary/grade-1/arabic/n497`
- `elementary/grade-1/arabic/n498`
- … and 9460 more (full list in coverage.json)

### Lessons with fewer than the lesson-quiz minimum (9242; lesson-quiz@1 needs 3 exclusion components)

- `elementary/grade-1/arabic/n13960 (0)`
- `elementary/grade-1/arabic/n13961 (0)`
- `elementary/grade-1/arabic/n13962 (0)`
- `elementary/grade-1/arabic/n13963 (0)`
- `elementary/grade-1/arabic/n13964 (0)`
- `elementary/grade-1/arabic/n13967 (0)`
- `elementary/grade-1/arabic/n14030 (0)`
- `elementary/grade-1/arabic/n14032 (0)`
- `elementary/grade-1/arabic/n14033 (0)`
- `elementary/grade-1/arabic/n14034 (0)`
- `elementary/grade-1/arabic/n14035 (0)`
- `elementary/grade-1/arabic/n14036 (0)`
- `elementary/grade-1/arabic/n14038 (0)`
- `elementary/grade-1/arabic/n14039 (0)`
- `elementary/grade-1/arabic/n14040 (0)`
- `elementary/grade-1/arabic/n14041 (0)`
- `elementary/grade-1/arabic/n14042 (0)`
- `elementary/grade-1/arabic/n14043 (0)`
- `elementary/grade-1/arabic/n144390 (0)`
- `elementary/grade-1/arabic/n144391 (0)`
- `elementary/grade-1/arabic/n144392 (0)`
- `elementary/grade-1/arabic/n176485 (0)`
- `elementary/grade-1/arabic/n3835 (0)`
- `elementary/grade-1/arabic/n3836 (0)`
- `elementary/grade-1/arabic/n3837 (0)`
- `elementary/grade-1/arabic/n3838 (0)`
- `elementary/grade-1/arabic/n3839 (0)`
- `elementary/grade-1/arabic/n3878 (0)`
- `elementary/grade-1/arabic/n3879 (0)`
- `elementary/grade-1/arabic/n3880 (0)`
- `elementary/grade-1/arabic/n3881 (0)`
- `elementary/grade-1/arabic/n3882 (0)`
- `elementary/grade-1/arabic/n3883 (0)`
- `elementary/grade-1/arabic/n489 (0)`
- `elementary/grade-1/arabic/n490 (0)`
- `elementary/grade-1/arabic/n492 (0)`
- `elementary/grade-1/arabic/n493 (0)`
- `elementary/grade-1/arabic/n494 (0)`
- `elementary/grade-1/arabic/n495 (0)`
- `elementary/grade-1/arabic/n496 (0)`
- `elementary/grade-1/arabic/n497 (0)`
- `elementary/grade-1/arabic/n498 (0)`
- `elementary/grade-1/arabic/n7726 (0)`
- `elementary/grade-1/arabic/n7727 (0)`
- `elementary/grade-1/arabic/n7728 (0)`
- `elementary/grade-1/arabic/n7729 (0)`
- `elementary/grade-1/arabic/n7730 (0)`
- `elementary/grade-1/arabic/n7731 (0)`
- `elementary/grade-1/arabic/n7732 (0)`
- `elementary/grade-1/arabic/n7733 (0)`
- … and 9192 more (full list in coverage.json)

### Pages awaiting vision (0)

_none_

### Source-only subjects (66)

- `elementary/grade-4/ien-8888`
- `elementary/grade-5/ien-12248`
- `elementary/grade-6/ien-8829`
- `high-school/grade-1/first-year/ien-31578`
- `high-school/grade-1/first-year/ien-33710`
- `high-school/grade-1/first-year/ien-34197`
- `high-school/grade-1/first-year/ien-44749`
- `high-school/grade-1/first-year/ien-44908`
- `high-school/grade-2/business/ien-44752`
- `high-school/grade-2/business/ien-44913`
- `high-school/grade-2/business/ien-47760`
- `high-school/grade-2/business/ien-47820`
- `high-school/grade-2/cs-eng/ien-44753`
- `high-school/grade-2/cs-eng/ien-44915`
- `high-school/grade-2/cs-eng/ien-47761`
- `high-school/grade-2/cs-eng/ien-47821`
- `high-school/grade-2/general/ien-44750`
- `high-school/grade-2/general/ien-44909`
- `high-school/grade-2/general/ien-47758`
- `high-school/grade-2/general/ien-47818`
- `high-school/grade-2/health/ien-44754`
- `high-school/grade-2/health/ien-44917`
- `high-school/grade-2/health/ien-47762`
- `high-school/grade-2/health/ien-47822`
- `high-school/grade-2/sharia/ien-44751`
- `high-school/grade-2/sharia/ien-44911`
- `high-school/grade-2/sharia/ien-47759`
- `high-school/grade-2/sharia/ien-47819`
- `high-school/grade-3/business/ien-44763`
- `high-school/grade-3/business/ien-44914`
- `high-school/grade-3/business/ien-47882`
- `high-school/grade-3/business/ien-47884`
- `high-school/grade-3/cs-eng/ien-44764`
- `high-school/grade-3/cs-eng/ien-44916`
- `high-school/grade-3/cs-eng/ien-47776`
- `high-school/grade-3/cs-eng/ien-47839`
- `high-school/grade-3/general/ien-44761`
- `high-school/grade-3/general/ien-47773`
- `high-school/grade-3/general/ien-47835`
- `high-school/grade-3/general/ien-48241`
- `high-school/grade-3/health/ien-44765`
- `high-school/grade-3/health/ien-44918`
- `high-school/grade-3/health/ien-47777`
- `high-school/grade-3/health/ien-47840`
- `high-school/grade-3/sharia/ien-44762`
- `high-school/grade-3/sharia/ien-44912`
- `high-school/grade-3/sharia/ien-47774`
- `high-school/grade-3/sharia/ien-47836`
- `middle/grade-1/ien-33620`
- `middle/grade-1/ien-34187`
- … and 16 more (full list in coverage.json)

## Practice material per lesson (exercise index)

| Lesson | Examples | Exercises | Review | Answer key |
|---|---|---|---|---|
| `middle/grade-1/math/n143384` | 0 | 1 | 0 | 0 |
| `middle/grade-1/math/n144546` | 0 | 1 | 0 | 0 |
| `middle/grade-1/math/n3313` | 0 | 4 | 0 | 0 |
| `middle/grade-1/math/n3317` | 6 | 4 | 3 | 0 |
| `middle/grade-1/math/n3318` | 10 | 13 | 4 | 0 |
| `middle/grade-1/math/n3320` | 2 | 6 | 2 | 0 |
| `middle/grade-1/math/n3321` | 2 | 6 | 2 | 0 |
| `middle/grade-1/math/n3323` | 5 | 6 | 2 | 0 |
| `middle/grade-1/math/n3324` | 5 | 7 | 2 | 0 |
| `middle/grade-1/math/n3325` | 4 | 5 | 2 | 0 |
| `middle/grade-1/math/n3326` | 4 | 6 | 2 | 0 |
| `middle/grade-1/math/n3327` | 2 | 5 | 2 | 0 |
| `middle/grade-1/math/n3328` | 2 | 6 | 2 | 0 |
| `middle/grade-1/math/n3329` | 6 | 7 | 2 | 0 |
| `middle/grade-1/math/n3331` | 2 | 5 | 2 | 0 |
| `middle/grade-1/math/n3332` | 5 | 6 | 2 | 0 |
| `middle/grade-1/math/n3333` | 5 | 5 | 2 | 0 |
| `middle/grade-1/math/n3334` | 4 | 6 | 2 | 0 |
| `middle/grade-1/math/n3335` | 1 | 4 | 2 | 0 |
| `middle/grade-1/math/n3336` | 3 | 6 | 2 | 0 |
| `middle/grade-1/math/n3338` | 4 | 5 | 2 | 0 |
| `middle/grade-1/math/n3339` | 2 | 4 | 2 | 0 |
| `middle/grade-1/math/n3340` | 5 | 5 | 2 | 0 |
| `middle/grade-1/math/n3341` | 5 | 6 | 2 | 0 |
| `middle/grade-1/math/n3342` | 4 | 5 | 2 | 0 |
| `middle/grade-1/math/n53` | 2 | 1 | 0 | 0 |
| `middle/grade-1/math/n54` | 1 | 1 | 0 | 0 |
| `middle/grade-1/math/n55` | 1 | 0 | 0 | 0 |
| `middle/grade-1/math/n57` | 1 | 0 | 0 | 0 |
| `middle/grade-1/math/n58` | 3 | 0 | 0 | 0 |
| `middle/grade-1/math/n59` | 1 | 0 | 0 | 0 |
| `middle/grade-1/math/n60` | 2 | 1 | 0 | 0 |
| `middle/grade-1/math/n61` | 1 | 0 | 0 | 0 |
| `middle/grade-1/math/n62` | 2 | 0 | 0 | 0 |
| `middle/grade-1/math/n63` | 4 | 2 | 0 | 0 |
| `middle/grade-1/math/n64` | 2 | 0 | 0 | 0 |
| `middle/grade-1/math/n65` | 2 | 0 | 0 | 0 |
| `middle/grade-1/math/n66` | 2 | 0 | 0 | 0 |
| `middle/grade-1/math/n68` | 2 | 0 | 0 | 0 |
| `middle/grade-1/math/n69` | 4 | 1 | 0 | 0 |
| `middle/grade-1/math/n70` | 4 | 0 | 0 | 0 |
| `middle/grade-1/math/n71` | 2 | 0 | 0 | 0 |
| `middle/grade-1/math/n73` | 1 | 0 | 0 | 0 |
| `middle/grade-1/math/n74` | 3 | 0 | 0 | 0 |
| `middle/grade-1/math/n75` | 4 | 1 | 0 | 0 |
| `middle/grade-1/math/n7550` | 6 | 0 | 0 | 0 |
| `middle/grade-1/math/n7551` | 5 | 0 | 0 | 0 |
| `middle/grade-1/math/n7552` | 4 | 0 | 0 | 0 |
| `middle/grade-1/math/n7553` | 4 | 0 | 0 | 0 |
| `middle/grade-1/math/n76` | 3 | 0 | 0 | 0 |

… and 29 more lessons (coverage.json).

## Latest crawl changes

_no changes file_
