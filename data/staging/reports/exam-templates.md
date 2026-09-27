# Exam templates

Generated: 2026-09-27T17:23:05Z
Manifest: `34ee874b2802ff0ff2c6f0f12a1226e3fcb82479ff8c0830e7f31bffed52d297` (current)

Every figure below belongs to **one template × one scope** and counts possible configurations over that scope's N published questions and M variants (docs/CONTENT_ENGINE.md §5.6).
Figures are never added across templates or across overlapping scopes (subject vs `subject@t1`, unit vs chapter), and they are not question counts.
Headline per scope: the pool size and **attempts before forced reuse**. Allocation is for a fresh learner and seed 0…0; `lower bound` marks scopes where the coverage pre-pass picked a stratum subset.

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

## `chapter-quiz@1` (chapter)

Scope kinds: unit, chapter. Count 15 (5–40); mix e/m/h 30/50/20.

Scopes offered: **0**; refused: 0; scopes with an empty pool (not listed): 0.

### Offered

_none_

### Refused (insufficient pool)

_none_

### Display permutations

Display orders of the **same** selected questions (question order × option orders) — not exams and not questions.

_none_

## `full-year@1` (full_year)

Scope kinds: subject@year. Count 60 (30–100, mini 25); mix e/m/h 30/45/25.

Scopes offered: **0**; refused: 0; scopes with an empty pool (not listed): 0.

### Offered

_none_

### Refused (insufficient pool)

_none_

### Display permutations

Display orders of the **same** selected questions (question order × option orders) — not exams and not questions.

_none_

## `lesson-quiz@1` (lesson)

Scope kinds: lesson. Count 10 (3–20); mix e/m/h 40/40/20.

Scopes offered: **0**; refused: 0; scopes with an empty pool (not listed): 0.

### Offered

_none_

### Refused (insufficient pool)

_none_

### Display permutations

Display orders of the **same** selected questions (question order × option orders) — not exams and not questions.

_none_

## `mock@1` (mock)

Scope kinds: subject, prep, prep_section. Count 50 (20–100); mix e/m/h 25/50/25.

Scopes offered: **8**; refused: 0; scopes with an empty pool (not listed): 0.

### Offered

| Scope | Pool: questions + variants (components) | Attempts before forced reuse | n (selected) | Allocation | Distinct sets by component | Distinct sets with variants | Lower bound | Tiers |
|---|---|---|---|---|---|---|---|---|
| `prep:achievement` | 156 + 0 (156) | 1 | 50 (50) | 37 cells; e/m/h 7/37/6 | 429981696 (log10 8.63345) | 429981696 (log10 8.63345) | no | guest no (scope_too_large), free yes, premium yes |
| `prep:achievement/biology` | 39 + 0 (39) | 1 | 50 (39, short) | 23 cells; e/m/h 13/18/8 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry` | 39 + 0 (39) | 1 | 50 (39, short) | 23 cells; e/m/h 14/18/7 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/math` | 39 + 0 (39) | 1 | 50 (39, short) | 24 cells; e/m/h 14/17/8 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics` | 39 + 0 (39) | 1 | 50 (39, short) | 24 cells; e/m/h 14/17/8 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude` | 138 + 0 (138) | 1 | 50 (50) | 37 cells; e/m/h 12/26/12 | 11609505792000000000000 (log10 22.064814) | 11609505792000000000000 (log10 22.064814) | no | guest no (scope_too_large), free yes, premium yes |
| `prep:aptitude/quantitative` | 78 + 0 (78) | 1 | 50 (50) | 24 cells; e/m/h 9/32/9 | 124416000 (log10 8.094876) | 124416000 (log10 8.094876) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal` | 60 + 0 (60) | 1 | 50 (50) | 15 cells; e/m/h 13/27/10 | 86400 (log10 4.936514) | 86400 (log10 4.936514) | no | guest yes, free yes, premium yes |

### Refused (insufficient pool)

_none_

### Display permutations

Display orders of the **same** selected questions (question order × option orders) — not exams and not questions.

| Scope | Display permutations of one set |
|---|---|
| `prep:achievement` | ≈ 10^98.988356 |
| `prep:achievement/biology` | ≈ 10^87.715922 |
| `prep:achievement/chemistry` | ≈ 10^78.054444 |
| `prep:achievement/math` | ≈ 10^67.012754 |
| `prep:achievement/physics` | ≈ 10^64.252331 |
| `prep:aptitude` | ≈ 10^85.937711 |
| `prep:aptitude/quantitative` | ≈ 10^71.384131 |
| `prep:aptitude/verbal` | ≈ 10^109.369808 |

## `practice@1` (practice)

Scope kinds: stage, grade, track, subject, subject@t1, subject@t2, subject@year, unit, chapter, lesson, prep, prep_section, prep_topic. Count 10 (5–30); mix e/m/h 40/40/20.

Scopes offered: **47**; refused: 6; scopes with an empty pool (not listed): 0.

### Offered

| Scope | Pool: questions + variants (components) | Attempts before forced reuse | n (selected) | Allocation | Distinct sets by component | Distinct sets with variants | Lower bound | Tiers |
|---|---|---|---|---|---|---|---|---|
| `prep:achievement` | 156 + 0 (156) | 1 | 10 (10) | 10 cells; e/m/h 4/5/1 | 864 (log10 2.936514) | 864 (log10 2.936514) | yes | guest no (scope_too_large), free yes, premium yes |
| `prep:achievement/biology` | 39 + 0 (39) | 1 | 10 (10) | 9 cells; e/m/h 4/5/1 | 96 (log10 1.982271) | 96 (log10 1.982271) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/biochemistry` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 1/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/cells` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/ecology` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/genetics` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 1/2/2 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/human-body` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/microbiology` | 5 + 0 (5) | 1 | 10 (5, short) | 2 cells; e/m/h 2/3/0 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/plants` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry` | 39 + 0 (39) | 1 | 10 (10) | 10 cells; e/m/h 3/6/1 | 384 (log10 2.584331) | 384 (log10 2.584331) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/acids-bases` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/atomic-structure` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/bonding` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/organic` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/periodic-table` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/solutions` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 1/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/thermochemistry` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/math` | 39 + 0 (39) | 1 | 10 (10) | 8 cells; e/m/h 5/4/1 | 24 (log10 1.380211) | 24 (log10 1.380211) | no | guest yes, free yes, premium yes |
| `prep:achievement/math/algebra` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/math/calculus` | 6 + 0 (6) | 1 | 10 (6, short) | 3 cells; e/m/h 2/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/math/functions` | 6 + 0 (6) | 1 | 10 (6, short) | 3 cells; e/m/h 2/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/math/geometry` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/math/statistics-probability` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 1/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics` | 39 + 0 (39) | 1 | 10 (10) | 8 cells; e/m/h 5/4/1 | 36 (log10 1.556303) | 36 (log10 1.556303) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/electricity` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 1/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/energy-work` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/forces-motion` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/kinematics` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/modern-physics` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 1/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/optics` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/waves-sound` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude` | 138 + 0 (138) | 2 | 10 (10) | 10 cells; e/m/h 4/4/2 | 829440 (log10 5.918785) | 829440 (log10 5.918785) | yes | guest no (scope_too_large), free yes, premium yes |
| `prep:aptitude/quantitative` | 78 + 0 (78) | 2 | 10 (10) | 9 cells; e/m/h 4/5/1 | 162000 (log10 5.209515) | 162000 (log10 5.209515) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/algebra` | 11 + 0 (11) | 1 | 10 (10) | 3 cells; e/m/h 4/5/1 | 6 (log10 0.778151) | 6 (log10 0.778151) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/arithmetic` | 8 + 0 (8) | 1 | 10 (8, short) | 3 cells; e/m/h 3/2/3 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/comparison` | 11 + 0 (11) | 1 | 10 (10) | 3 cells; e/m/h 4/4/2 | 5 (log10 0.69897) | 5 (log10 0.69897) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/data-interpretation` | 8 + 0 (8) | 1 | 10 (8, short) | 3 cells; e/m/h 3/3/2 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/fractions-percent` | 11 + 0 (11) | 1 | 10 (10) | 3 cells; e/m/h 3/5/2 | 4 (log10 0.60206) | 4 (log10 0.60206) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/geometry` | 11 + 0 (11) | 1 | 10 (10) | 3 cells; e/m/h 3/5/2 | 4 (log10 0.60206) | 4 (log10 0.60206) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/ratio-proportion` | 10 + 0 (10) | 1 | 10 (10) | 3 cells; e/m/h 3/5/2 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/statistics` | 8 + 0 (8) | 1 | 10 (8, short) | 3 cells; e/m/h 2/5/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal` | 60 + 0 (60) | 2 | 10 (10) | 8 cells; e/m/h 5/5/0 | 1728000 (log10 6.237544) | 1728000 (log10 6.237544) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal/analogy` | 14 + 0 (14) | 1 | 10 (10) | 3 cells; e/m/h 3/5/2 | 180 (log10 2.255273) | 180 (log10 2.255273) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal/contextual-error` | 11 + 0 (11) | 1 | 10 (10) | 3 cells; e/m/h 4/4/2 | 5 (log10 0.69897) | 5 (log10 0.69897) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal/odd-word-out` | 8 + 0 (8) | 1 | 10 (8, short) | 3 cells; e/m/h 3/4/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal/reading-comprehension` | 15 + 0 (15) | 1 | 10 (10) | 3 cells; e/m/h 3/5/2 | 360 (log10 2.556303) | 360 (log10 2.556303) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal/sentence-completion` | 12 + 0 (12) | 1 | 10 (10) | 3 cells; e/m/h 4/4/2 | 15 (log10 1.176091) | 15 (log10 1.176091) | no | guest yes, free yes, premium yes |

### Refused (insufficient pool)

| Scope | Pool: questions + variants (components) | Reason | Required | Available |
|---|---|---|---|---|
| `prep:achievement/biology/classification-evolution` | 4 + 0 (4) | insufficient_pool | 5 | 4 |
| `prep:achievement/chemistry/stoichiometry` | 4 + 0 (4) | insufficient_pool | 5 | 4 |
| `prep:achievement/math/matrices` | 4 + 0 (4) | insufficient_pool | 5 | 4 |
| `prep:achievement/math/sequences` | 4 + 0 (4) | insufficient_pool | 5 | 4 |
| `prep:achievement/math/trigonometry` | 4 + 0 (4) | insufficient_pool | 5 | 4 |
| `prep:achievement/physics/thermodynamics` | 4 + 0 (4) | insufficient_pool | 5 | 4 |

### Display permutations

Display orders of the **same** selected questions (question order × option orders) — not exams and not questions.

| Scope | Display permutations of one set |
|---|---|
| `prep:achievement` | 28894769971200 (log10 13.460819) |
| `prep:achievement/biology` | 399441300081868800 (log10 17.601453) |
| `prep:achievement/biology/biochemistry` | 39813120 (log10 7.600026) |
| `prep:achievement/biology/cells` | 39813120 (log10 7.600026) |
| `prep:achievement/biology/ecology` | 1658880 (log10 6.219815) |
| `prep:achievement/biology/genetics` | 69120 (log10 4.839604) |
| `prep:achievement/biology/human-body` | 955514880 (log10 8.980237) |
| `prep:achievement/biology/microbiology` | 39813120 (log10 7.600026) |
| `prep:achievement/biology/plants` | 39813120 (log10 7.600026) |
| `prep:achievement/chemistry` | 693474479308800 (log10 14.84103) |
| `prep:achievement/chemistry/acids-bases` | 69120 (log10 4.839604) |
| `prep:achievement/chemistry/atomic-structure` | 69120 (log10 4.839604) |
| `prep:achievement/chemistry/bonding` | 39813120 (log10 7.600026) |
| `prep:achievement/chemistry/organic` | 955514880 (log10 8.980237) |
| `prep:achievement/chemistry/periodic-table` | 955514880 (log10 8.980237) |
| `prep:achievement/chemistry/solutions` | 2880 (log10 3.459392) |
| `prep:achievement/chemistry/thermochemistry` | 69120 (log10 4.839604) |
| `prep:achievement/math` | 1203948748800 (log10 12.080608) |
| `prep:achievement/math/algebra` | 69120 (log10 4.839604) |
| `prep:achievement/math/calculus` | 9953280 (log10 6.997966) |
| `prep:achievement/math/functions` | 238878720 (log10 8.378177) |
| `prep:achievement/math/geometry` | 1658880 (log10 6.219815) |
| `prep:achievement/math/statistics-probability` | 120 (log10 2.079181) |
| `prep:achievement/physics` | 2090188800 (log10 9.320186) |
| `prep:achievement/physics/electricity` | 2880 (log10 3.459392) |
| `prep:achievement/physics/energy-work` | 2880 (log10 3.459392) |
| `prep:achievement/physics/forces-motion` | 1658880 (log10 6.219815) |
| `prep:achievement/physics/kinematics` | 120 (log10 2.079181) |
| `prep:achievement/physics/modern-physics` | 39813120 (log10 7.600026) |
| `prep:achievement/physics/optics` | 69120 (log10 4.839604) |
| `prep:achievement/physics/waves-sound` | 2880 (log10 3.459392) |
| `prep:aptitude` | 28894769971200 (log10 13.460819) |
| `prep:aptitude/quantitative` | 3628800 (log10 6.559763) |
| `prep:aptitude/quantitative/algebra` | 2090188800 (log10 9.320186) |
| `prep:aptitude/quantitative/arithmetic` | 40320 (log10 4.605521) |
| `prep:aptitude/quantitative/comparison` | 3628800 (log10 6.559763) |
| `prep:aptitude/quantitative/data-interpretation` | 967680 (log10 5.985732) |
| `prep:aptitude/quantitative/fractions-percent` | 3628800 (log10 6.559763) |
| `prep:aptitude/quantitative/geometry` | 2090188800 (log10 9.320186) |
| `prep:aptitude/quantitative/ratio-proportion` | 87091200 (log10 7.939974) |
| `prep:aptitude/quantitative/statistics` | 23224320 (log10 7.365943) |
| `prep:aptitude/verbal` | 958659120196485120 (log10 17.981664) |
| `prep:aptitude/verbal/analogy` | 230078188847156428800 (log10 20.361875) |
| `prep:aptitude/verbal/contextual-error` | 3628800 (log10 6.559763) |
| `prep:aptitude/verbal/odd-word-out` | 4438236667576320 (log10 15.64721) |
| `prep:aptitude/verbal/reading-comprehension` | 1521681143169024 (log10 15.182324) |
| `prep:aptitude/verbal/sentence-completion` | 230078188847156428800 (log10 20.361875) |

## `random-practice@1` (random)

Scope kinds: stage, grade, track, subject, subject@t1, subject@t2, subject@year, unit, chapter, lesson, prep, prep_section, prep_topic. Count 10 (5–50); mix e/m/h 34/33/33.

Scopes offered: **47**; refused: 6; scopes with an empty pool (not listed): 0.

### Offered

| Scope | Pool: questions + variants (components) | Attempts before forced reuse | n (selected) | Allocation | Distinct sets by component | Distinct sets with variants | Lower bound | Tiers |
|---|---|---|---|---|---|---|---|---|
| `prep:achievement` | 156 + 0 (156) | 10 | 10 (10) | 3 cells; e/m/h 4/3/3 | 83918731396500 (log10 13.923859) | 83918731396500 (log10 13.923859) | no | guest no (scope_too_large), free yes, premium yes |
| `prep:achievement/biology` | 39 + 0 (39) | 2 | 10 (10) | 3 cells; e/m/h 4/3/3 | 32672640 (log10 7.514184) | 32672640 (log10 7.514184) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/biochemistry` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 1/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/cells` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/ecology` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/genetics` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 1/2/2 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/human-body` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/microbiology` | 5 + 0 (5) | 1 | 10 (5, short) | 2 cells; e/m/h 2/3/0 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/plants` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry` | 39 + 0 (39) | 2 | 10 (10) | 3 cells; e/m/h 4/3/3 | 28588560 (log10 7.456192) | 28588560 (log10 7.456192) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/acids-bases` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/atomic-structure` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/bonding` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/organic` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/periodic-table` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/solutions` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 1/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/thermochemistry` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/math` | 39 + 0 (39) | 2 | 10 (10) | 3 cells; e/m/h 4/3/3 | 38118080 (log10 7.581131) | 38118080 (log10 7.581131) | no | guest yes, free yes, premium yes |
| `prep:achievement/math/algebra` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/math/calculus` | 6 + 0 (6) | 1 | 10 (6, short) | 3 cells; e/m/h 2/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/math/functions` | 6 + 0 (6) | 1 | 10 (6, short) | 3 cells; e/m/h 2/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/math/geometry` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/math/statistics-probability` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 1/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics` | 39 + 0 (39) | 2 | 10 (10) | 3 cells; e/m/h 4/3/3 | 38118080 (log10 7.581131) | 38118080 (log10 7.581131) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/electricity` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 1/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/energy-work` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/forces-motion` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/kinematics` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/modern-physics` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 1/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/optics` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/waves-sound` | 5 + 0 (5) | 1 | 10 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude` | 138 + 0 (138) | 9 | 10 (10) | 3 cells; e/m/h 4/3/3 | 22601376661500 (log10 13.354135) | 22601376661500 (log10 13.354135) | no | guest no (scope_too_large), free yes, premium yes |
| `prep:aptitude/quantitative` | 78 + 0 (78) | 5 | 10 (10) | 3 cells; e/m/h 4/3/3 | 57014685000 (log10 10.755987) | 57014685000 (log10 10.755987) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/algebra` | 11 + 0 (11) | 1 | 10 (10) | 3 cells; e/m/h 4/5/1 | 6 (log10 0.778151) | 6 (log10 0.778151) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/arithmetic` | 8 + 0 (8) | 1 | 10 (8, short) | 3 cells; e/m/h 3/2/3 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/comparison` | 11 + 0 (11) | 1 | 10 (10) | 3 cells; e/m/h 4/4/2 | 5 (log10 0.69897) | 5 (log10 0.69897) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/data-interpretation` | 8 + 0 (8) | 1 | 10 (8, short) | 3 cells; e/m/h 3/3/2 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/fractions-percent` | 11 + 0 (11) | 1 | 10 (10) | 3 cells; e/m/h 4/4/2 | 5 (log10 0.69897) | 5 (log10 0.69897) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/geometry` | 11 + 0 (11) | 1 | 10 (10) | 3 cells; e/m/h 4/4/2 | 5 (log10 0.69897) | 5 (log10 0.69897) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/ratio-proportion` | 10 + 0 (10) | 1 | 10 (10) | 3 cells; e/m/h 3/5/2 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/statistics` | 8 + 0 (8) | 1 | 10 (8, short) | 3 cells; e/m/h 2/5/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal` | 60 + 0 (60) | 4 | 10 (10) | 3 cells; e/m/h 4/3/3 | 3851347500 (log10 9.585613) | 3851347500 (log10 9.585613) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal/analogy` | 14 + 0 (14) | 1 | 10 (10) | 3 cells; e/m/h 4/3/3 | 100 (log10 2) | 100 (log10 2) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal/contextual-error` | 11 + 0 (11) | 1 | 10 (10) | 3 cells; e/m/h 4/4/2 | 5 (log10 0.69897) | 5 (log10 0.69897) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal/odd-word-out` | 8 + 0 (8) | 1 | 10 (8, short) | 3 cells; e/m/h 3/4/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal/reading-comprehension` | 15 + 0 (15) | 1 | 10 (10) | 3 cells; e/m/h 4/3/3 | 400 (log10 2.60206) | 400 (log10 2.60206) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal/sentence-completion` | 12 + 0 (12) | 1 | 10 (10) | 3 cells; e/m/h 4/4/2 | 15 (log10 1.176091) | 15 (log10 1.176091) | no | guest yes, free yes, premium yes |

### Refused (insufficient pool)

| Scope | Pool: questions + variants (components) | Reason | Required | Available |
|---|---|---|---|---|
| `prep:achievement/biology/classification-evolution` | 4 + 0 (4) | insufficient_pool | 5 | 4 |
| `prep:achievement/chemistry/stoichiometry` | 4 + 0 (4) | insufficient_pool | 5 | 4 |
| `prep:achievement/math/matrices` | 4 + 0 (4) | insufficient_pool | 5 | 4 |
| `prep:achievement/math/sequences` | 4 + 0 (4) | insufficient_pool | 5 | 4 |
| `prep:achievement/math/trigonometry` | 4 + 0 (4) | insufficient_pool | 5 | 4 |
| `prep:achievement/physics/thermodynamics` | 4 + 0 (4) | insufficient_pool | 5 | 4 |

### Display permutations

Display orders of the **same** selected questions (question order × option orders) — not exams and not questions.

| Scope | Display permutations of one set |
|---|---|
| `prep:achievement` | 50164531200 (log10 10.700397) |
| `prep:achievement/biology` | 16643387503411200 (log10 16.221242) |
| `prep:achievement/biology/biochemistry` | 39813120 (log10 7.600026) |
| `prep:achievement/biology/cells` | 39813120 (log10 7.600026) |
| `prep:achievement/biology/ecology` | 1658880 (log10 6.219815) |
| `prep:achievement/biology/genetics` | 69120 (log10 4.839604) |
| `prep:achievement/biology/human-body` | 955514880 (log10 8.980237) |
| `prep:achievement/biology/microbiology` | 39813120 (log10 7.600026) |
| `prep:achievement/biology/plants` | 39813120 (log10 7.600026) |
| `prep:achievement/chemistry` | 693474479308800 (log10 14.84103) |
| `prep:achievement/chemistry/acids-bases` | 69120 (log10 4.839604) |
| `prep:achievement/chemistry/atomic-structure` | 69120 (log10 4.839604) |
| `prep:achievement/chemistry/bonding` | 39813120 (log10 7.600026) |
| `prep:achievement/chemistry/organic` | 955514880 (log10 8.980237) |
| `prep:achievement/chemistry/periodic-table` | 955514880 (log10 8.980237) |
| `prep:achievement/chemistry/solutions` | 2880 (log10 3.459392) |
| `prep:achievement/chemistry/thermochemistry` | 69120 (log10 4.839604) |
| `prep:achievement/math` | 28894769971200 (log10 13.460819) |
| `prep:achievement/math/algebra` | 69120 (log10 4.839604) |
| `prep:achievement/math/calculus` | 9953280 (log10 6.997966) |
| `prep:achievement/math/functions` | 238878720 (log10 8.378177) |
| `prep:achievement/math/geometry` | 1658880 (log10 6.219815) |
| `prep:achievement/math/statistics-probability` | 120 (log10 2.079181) |
| `prep:achievement/physics` | 50164531200 (log10 10.700397) |
| `prep:achievement/physics/electricity` | 2880 (log10 3.459392) |
| `prep:achievement/physics/energy-work` | 2880 (log10 3.459392) |
| `prep:achievement/physics/forces-motion` | 1658880 (log10 6.219815) |
| `prep:achievement/physics/kinematics` | 120 (log10 2.079181) |
| `prep:achievement/physics/modern-physics` | 39813120 (log10 7.600026) |
| `prep:achievement/physics/optics` | 69120 (log10 4.839604) |
| `prep:achievement/physics/waves-sound` | 2880 (log10 3.459392) |
| `prep:aptitude` | 120394874880 (log10 11.080608) |
| `prep:aptitude/quantitative` | 87091200 (log10 7.939974) |
| `prep:aptitude/quantitative/algebra` | 2090188800 (log10 9.320186) |
| `prep:aptitude/quantitative/arithmetic` | 40320 (log10 4.605521) |
| `prep:aptitude/quantitative/comparison` | 3628800 (log10 6.559763) |
| `prep:aptitude/quantitative/data-interpretation` | 967680 (log10 5.985732) |
| `prep:aptitude/quantitative/fractions-percent` | 3628800 (log10 6.559763) |
| `prep:aptitude/quantitative/geometry` | 2090188800 (log10 9.320186) |
| `prep:aptitude/quantitative/ratio-proportion` | 87091200 (log10 7.939974) |
| `prep:aptitude/quantitative/statistics` | 23224320 (log10 7.365943) |
| `prep:aptitude/verbal` | 958659120196485120 (log10 17.981664) |
| `prep:aptitude/verbal/analogy` | 230078188847156428800 (log10 20.361875) |
| `prep:aptitude/verbal/contextual-error` | 3628800 (log10 6.559763) |
| `prep:aptitude/verbal/odd-word-out` | 4438236667576320 (log10 15.64721) |
| `prep:aptitude/verbal/reading-comprehension` | 1521681143169024 (log10 15.182324) |
| `prep:aptitude/verbal/sentence-completion` | 230078188847156428800 (log10 20.361875) |

## `subject-quiz@1` (subject)

Scope kinds: subject, subject@t1, subject@t2. Count 25 (10–60); mix e/m/h 30/45/25.

Scopes offered: **0**; refused: 0; scopes with an empty pool (not listed): 0.

### Offered

_none_

### Refused (insufficient pool)

_none_

### Display permutations

Display orders of the **same** selected questions (question order × option orders) — not exams and not questions.

_none_

## `term-exam@1` (term)

Scope kinds: subject@t1, subject@t2. Count 40 (20–80); mix e/m/h 30/45/25.

Scopes offered: **0**; refused: 0; scopes with an empty pool (not listed): 0.

### Offered

_none_

### Refused (insufficient pool)

_none_

### Display permutations

Display orders of the **same** selected questions (question order × option orders) — not exams and not questions.

_none_

## `timed@1` (timed)

Scope kinds: stage, grade, track, subject, subject@t1, subject@t2, subject@year, unit, chapter, lesson, prep, prep_section, prep_topic. Count 20 (5–100); mix e/m/h 30/45/25.

Scopes offered: **47**; refused: 6; scopes with an empty pool (not listed): 0.

### Offered

| Scope | Pool: questions + variants (components) | Attempts before forced reuse | n (selected) | Allocation | Distinct sets by component | Distinct sets with variants | Lower bound | Tiers |
|---|---|---|---|---|---|---|---|---|
| `prep:achievement` | 156 + 0 (156) | 1 | 20 (20) | 20 cells; e/m/h 6/9/5 | 9216 (log10 3.964542) | 9216 (log10 3.964542) | yes | guest no (scope_too_large), free yes, premium yes |
| `prep:achievement/biology` | 39 + 0 (39) | 1 | 20 (20) | 15 cells; e/m/h 6/13/1 | 1152 (log10 3.061452) | 1152 (log10 3.061452) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/biochemistry` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 1/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/cells` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/ecology` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/genetics` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 1/2/2 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/human-body` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/microbiology` | 5 + 0 (5) | 1 | 20 (5, short) | 2 cells; e/m/h 2/3/0 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/biology/plants` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry` | 39 + 0 (39) | 1 | 20 (20) | 15 cells; e/m/h 6/13/1 | 576 (log10 2.760422) | 576 (log10 2.760422) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/acids-bases` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/atomic-structure` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/bonding` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/organic` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/periodic-table` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/solutions` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 1/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/chemistry/thermochemistry` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/math` | 39 + 0 (39) | 1 | 20 (20) | 16 cells; e/m/h 7/12/1 | 3456 (log10 3.538574) | 3456 (log10 3.538574) | no | guest yes, free yes, premium yes |
| `prep:achievement/math/algebra` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/math/calculus` | 6 + 0 (6) | 1 | 20 (6, short) | 3 cells; e/m/h 2/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/math/functions` | 6 + 0 (6) | 1 | 20 (6, short) | 3 cells; e/m/h 2/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/math/geometry` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/math/statistics-probability` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 1/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics` | 39 + 0 (39) | 1 | 20 (20) | 14 cells; e/m/h 6/13/1 | 576 (log10 2.760422) | 576 (log10 2.760422) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/electricity` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 1/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/energy-work` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/forces-motion` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/kinematics` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/modern-physics` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 1/3/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/optics` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:achievement/physics/waves-sound` | 5 + 0 (5) | 1 | 20 (5, short) | 3 cells; e/m/h 2/2/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude` | 138 + 0 (138) | 1 | 20 (20) | 15 cells; e/m/h 4/14/2 | 5832000000 (log10 9.765818) | 5832000000 (log10 9.765818) | no | guest no (scope_too_large), free yes, premium yes |
| `prep:aptitude/quantitative` | 78 + 0 (78) | 1 | 20 (20) | 13 cells; e/m/h 6/13/1 | 648000000 (log10 8.811575) | 648000000 (log10 8.811575) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/algebra` | 11 + 0 (11) | 1 | 20 (11, short) | 3 cells; e/m/h 4/6/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/arithmetic` | 8 + 0 (8) | 1 | 20 (8, short) | 3 cells; e/m/h 3/2/3 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/comparison` | 11 + 0 (11) | 1 | 20 (11, short) | 3 cells; e/m/h 4/5/2 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/data-interpretation` | 8 + 0 (8) | 1 | 20 (8, short) | 3 cells; e/m/h 3/3/2 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/fractions-percent` | 11 + 0 (11) | 1 | 20 (11, short) | 3 cells; e/m/h 4/5/2 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/geometry` | 11 + 0 (11) | 1 | 20 (11, short) | 3 cells; e/m/h 4/5/2 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/ratio-proportion` | 10 + 0 (10) | 1 | 20 (10, short) | 3 cells; e/m/h 3/5/2 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/quantitative/statistics` | 8 + 0 (8) | 1 | 20 (8, short) | 3 cells; e/m/h 2/5/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal` | 60 + 0 (60) | 1 | 20 (20) | 15 cells; e/m/h 6/9/5 | 6998400000 (log10 9.844999) | 6998400000 (log10 9.844999) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal/analogy` | 14 + 0 (14) | 1 | 20 (14, short) | 3 cells; e/m/h 5/6/3 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal/contextual-error` | 11 + 0 (11) | 1 | 20 (11, short) | 3 cells; e/m/h 4/5/2 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal/odd-word-out` | 8 + 0 (8) | 1 | 20 (8, short) | 3 cells; e/m/h 3/4/1 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal/reading-comprehension` | 15 + 0 (15) | 1 | 20 (15, short) | 3 cells; e/m/h 5/6/4 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |
| `prep:aptitude/verbal/sentence-completion` | 12 + 0 (12) | 1 | 20 (12, short) | 3 cells; e/m/h 4/6/2 | 1 (log10 0) | 1 (log10 0) | no | guest yes, free yes, premium yes |

### Refused (insufficient pool)

| Scope | Pool: questions + variants (components) | Reason | Required | Available |
|---|---|---|---|---|
| `prep:achievement/biology/classification-evolution` | 4 + 0 (4) | insufficient_pool | 5 | 4 |
| `prep:achievement/chemistry/stoichiometry` | 4 + 0 (4) | insufficient_pool | 5 | 4 |
| `prep:achievement/math/matrices` | 4 + 0 (4) | insufficient_pool | 5 | 4 |
| `prep:achievement/math/sequences` | 4 + 0 (4) | insufficient_pool | 5 | 4 |
| `prep:achievement/math/trigonometry` | 4 + 0 (4) | insufficient_pool | 5 | 4 |
| `prep:achievement/physics/thermodynamics` | 4 + 0 (4) | insufficient_pool | 5 | 4 |

### Display permutations

Display orders of the **same** selected questions (question order × option orders) — not exams and not questions.

| Scope | Display permutations of one set |
|---|---|
| `prep:achievement` | ≈ 10^32.188237 |
| `prep:achievement/biology` | ≈ 10^40.469504 |
| `prep:achievement/biology/biochemistry` | 39813120 (log10 7.600026) |
| `prep:achievement/biology/cells` | 39813120 (log10 7.600026) |
| `prep:achievement/biology/ecology` | 1658880 (log10 6.219815) |
| `prep:achievement/biology/genetics` | 69120 (log10 4.839604) |
| `prep:achievement/biology/human-body` | 955514880 (log10 8.980237) |
| `prep:achievement/biology/microbiology` | 39813120 (log10 7.600026) |
| `prep:achievement/biology/plants` | 39813120 (log10 7.600026) |
| `prep:achievement/chemistry` | ≈ 10^34.94866 |
| `prep:achievement/chemistry/acids-bases` | 69120 (log10 4.839604) |
| `prep:achievement/chemistry/atomic-structure` | 69120 (log10 4.839604) |
| `prep:achievement/chemistry/bonding` | 39813120 (log10 7.600026) |
| `prep:achievement/chemistry/organic` | 955514880 (log10 8.980237) |
| `prep:achievement/chemistry/periodic-table` | 955514880 (log10 8.980237) |
| `prep:achievement/chemistry/solutions` | 2880 (log10 3.459392) |
| `prep:achievement/chemistry/thermochemistry` | 69120 (log10 4.839604) |
| `prep:achievement/math` | 267802452909464968904048640000 (log10 29.427815) |
| `prep:achievement/math/algebra` | 69120 (log10 4.839604) |
| `prep:achievement/math/calculus` | 9953280 (log10 6.997966) |
| `prep:achievement/math/functions` | 238878720 (log10 8.378177) |
| `prep:achievement/math/geometry` | 1658880 (log10 6.219815) |
| `prep:achievement/math/statistics-probability` | 120 (log10 2.079181) |
| `prep:achievement/physics` | 464934814078932237680640000 (log10 26.667392) |
| `prep:achievement/physics/electricity` | 2880 (log10 3.459392) |
| `prep:achievement/physics/energy-work` | 2880 (log10 3.459392) |
| `prep:achievement/physics/forces-motion` | 1658880 (log10 6.219815) |
| `prep:achievement/physics/kinematics` | 120 (log10 2.079181) |
| `prep:achievement/physics/modern-physics` | 39813120 (log10 7.600026) |
| `prep:achievement/physics/optics` | 69120 (log10 4.839604) |
| `prep:achievement/physics/waves-sound` | 2880 (log10 3.459392) |
| `prep:aptitude` | 11158435537894373704335360000 (log10 28.047603) |
| `prep:aptitude/quantitative` | 1401351556709744640000 (log10 21.146547) |
| `prep:aptitude/quantitative/algebra` | 22992076800 (log10 10.361578) |
| `prep:aptitude/quantitative/arithmetic` | 40320 (log10 4.605521) |
| `prep:aptitude/quantitative/comparison` | 39916800 (log10 7.601156) |
| `prep:aptitude/quantitative/data-interpretation` | 967680 (log10 5.985732) |
| `prep:aptitude/quantitative/fractions-percent` | 39916800 (log10 7.601156) |
| `prep:aptitude/quantitative/geometry` | 22992076800 (log10 10.361578) |
| `prep:aptitude/quantitative/ratio-proportion` | 87091200 (log10 7.939974) |
| `prep:aptitude/quantitative/statistics` | 23224320 (log10 7.365943) |
| `prep:aptitude/verbal` | ≈ 10^37.889721 |
| `prep:aptitude/verbal/analogy` | ≈ 10^30.263366 |
| `prep:aptitude/verbal/contextual-error` | 39916800 (log10 7.601156) |
| `prep:aptitude/verbal/odd-word-out` | 4438236667576320 (log10 15.64721) |
| `prep:aptitude/verbal/reading-comprehension` | 60582873954725532794880 (log10 22.78235) |
| `prep:aptitude/verbal/sentence-completion` | 17493304854426997594521600 (log10 25.242872) |

## `weakness-review@1` (weakness)

Scope kinds: weak. Count 15 (5–30); mix e/m/h 40/40/20.

Not blueprinted: its scope depends on one learner's history (`weak:`).
