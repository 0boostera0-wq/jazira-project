# Resources

Generated: 2026-09-27T17:23:05Z
Manifest: `34ee874b2802ff0ff2c6f0f12a1226e3fcb82479ff8c0830e7f31bffed52d297` (current)

584 resources. Titles are the listing titles as published by the source.

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

| Id | Title | Subject | Kind | Part | Year label (cover / file name) | Availability | Status | Extraction | Pages text / vision | Term (status) | Evidence routes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `ien-120527` | مقرر الرياضيات / كتاب الطالب الجزء الأول | `elementary/grade-2/math` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120528` | مقررالعلوم / كتاب الطالب الجزء الأول | `elementary/grade-2/science` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120529` | مقرر المهارات الحياتية والاسرية /كتاب الطالب الجزء الأول | `elementary/grade-3/life` | student_book | 1 | 1448 (— / 1448) | external_official | active | not_started | 0 / 0 | — (needs_review) | — |
| `ien-120530` | مقرر الرياضيات / كتاب الطالب الجزء الأول | `elementary/grade-4/math` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120531` | مقرر لغتي الجميلة / كتاب الطالب الجزء الأول | `elementary/grade-5/arabic` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120532` | مقررالعلوم / كتاب الطالب الجزء الأول | `elementary/grade-3/science` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120533` | مقرر الرياضيات / كتاب الطالب الجزء الأول | `elementary/grade-5/math` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120535` | مقرر Top Goal1 / كتاب الطالب | `elementary/grade-4/english` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120536` | مقرر لغتي /كتاب الطالب الجزء الأول | `elementary/grade-3/arabic` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120537` | مقرر التربية الفنية / كتاب الطالب الجزء الأول | `elementary/grade-1/art` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120538` | مقرر الدراسات الإسلامية /كتاب الطالب الجزء الأول | `elementary/grade-1/islamic` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120539` | مقرر المهارات الحياتية والأسرية / كتاب الطالب الجزء الأول | `elementary/grade-1/life` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120540` | مقرر المهارات الحياتية والأسرية / كتاب الطالب الجزء الأول | `elementary/grade-2/life` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120541` | مقرر الدراسات الاجتماعية / كتاب الطالب | `elementary/grade-4/social` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120542` | كتاب الطالب الجزء الأول / We can | `elementary/grade-3/english` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120543` | مقررالتربية الفنية / كتاب الطالب الجزء الأول | `elementary/grade-2/art` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120544` | مقرر لغتي / كتاب الطالب الجزء الأول | `elementary/grade-2/arabic` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120545` | مقرر لغتي الجميلة / كتاب الطالب الجزء الأول | `elementary/grade-4/arabic` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120547` | مقرر الرياضيات / كتاب الطالب الجزء الأول | `elementary/grade-6/math` | student_book | 1 | 1448 (— / 1448) | external_official | active | not_started | 0 / 0 | — (needs_review) | — |
| `ien-120549` | مقرر الدراسات الاجتماعية / كتاب الطالب | `elementary/grade-6/social` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120550` | مقرر الدراسات الاسلامية / كتاب الطالب | `elementary/grade-6/islamic` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120585` | مقرر الرياضيات /كتاب الطالب الجزء الأول | `elementary/grade-1/math` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120586` | مقرر لغتي /كتاب الطالب الجزء الأول | `elementary/grade-1/arabic` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120587` | مقرر العلوم /كتاب الطالب الجزء الأول | `elementary/grade-1/science` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120588` | مقرر We Can 1 /كتاب الطالب الجزء الأول | `elementary/grade-1/english` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120589` | مقرر We Can 2 /كتاب الطالب الجزء الأول | `elementary/grade-2/english` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120590` | مقرر التربية الفنية / كتاب الطالب الجزء الأول | `elementary/grade-3/art` | student_book | 1 | 1448 (— / 1448) | external_official | active | not_started | 0 / 0 | — (needs_review) | — |
| `ien-120591` | مقرر الدراسات الإسلامية /كتاب الطالب الجزء الأول | `elementary/grade-3/islamic` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120592` | مقرر العلوم /كتاب الطالب الجزء الأول | `elementary/grade-4/science` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120593` | مقرر TopGoal2 /كتاب الطالب | `elementary/grade-5/english` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120596` | مقرر الدراسات الاجتماعية / كتاب الطالب | `elementary/grade-5/social` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120597` | مقرر الدراسات الإسلامية / كتاب الطالب | `elementary/grade-4/islamic` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120602` | مقرر العلوم / كتاب الطالب الجزء الأول | `elementary/grade-5/science` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120603` | مقرر لغتي الجميلة / كتاب الطالب الجزء الأول | `elementary/grade-6/arabic` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120604` | مقرر العلوم / كتاب الطالب الجزء الأول | `elementary/grade-6/science` | student_book | 1 | 1448 (— / 1448) | external_official | active | not_started | 0 / 0 | — (needs_review) | — |
| `ien-120605` | مقرر الدراسات الاسلامية / كتاب الطالب الجزء الأول | `elementary/grade-2/islamic` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120606` | مقرر لغتي الخالدة / كتاب الطالب الجزء الأول | `middle/grade-1/arabic` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | full_done | 39 / 195 | — (needs_review) | — |
| `ien-120607` | مقرر الرياضيات /كتاب الطالب الجزء الأول | `middle/grade-1/math` | student_book | 1 | 1448 (— / 1448) | external_official | active | full_done | 163 / 20 | — (needs_review) | — |
| `ien-120608` | مقرر الدراسات الإسلامية /كتاب الطالب الجزء الأول | `middle/grade-1/islamic` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120610` | مقرر لغتي الخالدة /كتاب الطالب الجزء الأول | `middle/grade-3/arabic` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120611` | مقرر الرياضيات /كتاب الطالب الجزء الأول | `middle/grade-2/math` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120612` | مقرر الدراسات الاجتماعية / كتاب الطالب | `middle/grade-2/social` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120613` | مقرر العلوم / كتاب الطالب الجزء الأول | `middle/grade-2/science` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120614` | مقرر الدراسات الاجتماعية / كتاب الطالب | `middle/grade-1/social` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120615` | مقرر لغتي الخالدة / كتاب الطالب الجزء الأول | `middle/grade-2/arabic` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120616` | مقرر SUPER GOAL1 / كتاب الطالب | `middle/grade-1/english` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120617` | مقرر العلوم / كتاب الطالب الجزء الأول | `middle/grade-1/science` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | full_done | 35 / 191 | — (needs_review) | — |
| `ien-120618` | مقرر العلوم / كتاب الطالب الجزء الأول | `middle/grade-3/science` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120619` | مقرر الدراسات الإسلامية / كتاب الطالب الجزء الأول | `middle/grade-3/islamic` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120620` | مقرر الرياضيات /كتاب الطالب الجزء الأول | `middle/grade-3/math` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120621` | مقرر super Goal2 /كتاب الطالب | `middle/grade-2/english` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120622` | مقرر SUPER GOAL3 /كتاب الطالب | `middle/grade-3/english` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120626` | مقرر الأحياء 1 / كتاب الطالب | `high-school/grade-1/first-year/biology` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120627` | مقرر الفيزياء 1 / كتاب الطالب | `high-school/grade-1/first-year/physics` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120628` | مقرر الرياضيات 1-1 /كتاب الطالب الجزء الأول | `high-school/grade-1/first-year/math` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120629` | مقرر الكيمياء 1 /كتاب الطالب | `high-school/grade-1/first-year/chemistry` | student_book | — | 1448 (1448 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120705` | مقررالأحياء 1-2 / كتاب الطالب الجزء الأول | `high-school/grade-2/health/biology` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120706` | مقررالأحياء 1-2 / كتاب الطالب الجزء الأول | `high-school/grade-2/cs-eng/biology` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120710` | مقررالفيزياء 2 / كتاب الطالب | `high-school/grade-2/cs-eng/physics` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120711` | مقررالفيزياء 2 / كتاب الطالب | `high-school/grade-2/health/physics` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120715` | مقررالأحياء 1-2 / كتاب الطالب الجزء الأول | `high-school/grade-2/general/biology` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120716` | مقررالفيزياء 2 / كتاب الطالب | `high-school/grade-2/general/physics` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120717` | مقرر الرياضيات1-2 / كتاب الطالب الجزء الأول | `high-school/grade-2/general/math` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120718` | مقرر الكيمياء1-2 / كتاب الطالب الجزء الأول | `high-school/grade-2/general/chemistry` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120719` | مقرر MEGA GOAL 2 /كتاب الطالب | `high-school/grade-2/general/english` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120720` | مقرر الكيمياء 3 /كتاب الطالب | `high-school/grade-3/general/chemistry` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120722` | مقرر الرياضيات1-2 / كتاب الطالب الجزء الأول | `high-school/grade-2/health/math` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120723` | مقرر الرياضيات1-2 / كتاب الطالب الجزء الأول | `high-school/grade-2/cs-eng/math` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120727` | مقرر الكيمياء1-2 / كتاب الطالب الجزء الأول | `high-school/grade-2/health/chemistry` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120728` | مقرر الكيمياء1-2 / كتاب الطالب الجزء الأول | `high-school/grade-2/cs-eng/chemistry` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120732` | مقرر MEGA GOAL 2 /كتاب الطالب | `high-school/grade-2/health/english` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120733` | مقرر MEGA GOAL 2 /كتاب الطالب | `high-school/grade-2/business/english` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120734` | مقرر MEGA GOAL 2 /كتاب الطالب | `high-school/grade-2/cs-eng/english` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120735` | مقرر MEGA GOAL 2 /كتاب الطالب | `high-school/grade-2/sharia/english` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120741` | مقرر الكيمياء 3 /كتاب الطالب | `high-school/grade-3/cs-eng/chemistry` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120742` | مقرر الكيمياء 3 /كتاب الطالب | `high-school/grade-3/health/chemistry` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120748` | مقرر MEGA GOAL3 /كتاب الطالب | `high-school/grade-3/general/english` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120749` | مقرر فيزياء 3-1/كتاب الطالب الجزء الأول | `high-school/grade-3/general/physics` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120750` | مقرر فيزياء 1-3/كتاب الطالب الجزء الأول | `high-school/grade-3/cs-eng/physics` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120751` | مقرر فيزياء 1-3/كتاب الطالب الجزء الأول | `high-school/grade-3/health/physics` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120755` | مقرر MEGA GOAL 3/ كتاب الطالب | `high-school/grade-3/business/english` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120756` | مقرر MEGA GOAL 3/ كتاب الطالب | `high-school/grade-3/sharia/english` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120757` | مقرر MEGA GOAL 3/ كتاب الطالب | `high-school/grade-3/cs-eng/english` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120758` | مقرر MEGA GOAL 3/ كتاب الطالب | `high-school/grade-3/health/english` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120767` | مقررالأحياء 2-2 / كتاب الطالب الجزء الثاني | `high-school/grade-2/health/biology` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120768` | مقررالأحياء 2-2 / كتاب الطالب الجزء الثاني | `high-school/grade-2/cs-eng/biology` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120772` | مقرر الدراسات الإسلامية /كتاب الطالب | `elementary/grade-5/islamic` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120773` | مقرر MEGA GOAL 1 / كتاب الطالب | `high-school/grade-1/first-year/english` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120774` | مقرر الرياضيات 1-3/ كتاب الطالب الجزء الأول | `high-school/grade-3/general/math` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120776` | مقرر الرياضيات1-3/ كتاب الطالب الجزء الأول | `high-school/grade-3/cs-eng/math` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120777` | مقرر الرياضيات1-3/ كتاب الطالب الجزء الأول | `high-school/grade-3/health/math` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120792` | مقرر علم البيئة /كتاب الطالب | `high-school/grade-1/first-year/environment` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120793` | مقرر الدراسات الاجتماعية / كتاب الطالب | `high-school/grade-1/first-year/social` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120794` | مقرر الجغرافيا /كتاب الطالب | `high-school/grade-3/general/geography` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120795` | مقرر الدراسات الاجتماعية /كتاب الطالب | `middle/grade-3/social` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120798` | مقرر الجغرافيا/ كتاب الطالب | `high-school/grade-3/business/geography` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120799` | مقرر الجغرافيا/ كتاب الطالب | `high-school/grade-3/sharia/geography` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120808` | مقرر التاريخ /كتاب الطالب | `high-school/grade-2/general/history` | student_book | — | 1448 (1448 / 1488) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120815` | مقرر الدراسات الإسلامية /كتاب الطالب الجزء الأول | `middle/grade-2/islamic` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120822` | مقرر التاريخ /كتاب الطالب | `high-school/grade-2/business/history` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120823` | مقرر التاريخ /كتاب الطالب | `high-school/grade-2/sharia/history` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120839` | مقرر التوحيد1/ كتاب الطالب | `high-school/grade-2/general/tawhid` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120840` | مقرر التوحيد1/ كتاب الطالب | `high-school/grade-2/health/tawhid` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120841` | مقرر التوحيد1/ كتاب الطالب | `high-school/grade-2/cs-eng/tawhid` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120842` | مقرر التوحيد1/ كتاب الطالب | `high-school/grade-2/business/tawhid` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120843` | مقرر التوحيد1/ كتاب الطالب | `high-school/grade-2/sharia/tawhid` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120849` | مقررالتفسير1 / كتاب الطالب | `high-school/grade-2/business/tafsir` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120850` | مقررالتفسير1 / كتاب الطالب | `high-school/grade-2/sharia/tafsir` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120862` | مقرر الحديث1 / كتاب الطالب | `high-school/grade-1/first-year/hadith` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120868` | مقرر الفقه1 / كتاب الطالب | `high-school/grade-3/sharia/fiqh` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120869` | مقرر الفقه1 / كتاب الطالب | `high-school/grade-3/business/fiqh` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120870` | مقرر الفقه1 / كتاب الطالب | `high-school/grade-3/general/fiqh` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120871` | مقرر الفقه1 / كتاب الطالب | `high-school/grade-3/cs-eng/fiqh` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120872` | مقرر الفقه1 / كتاب الطالب | `high-school/grade-3/health/fiqh` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120888` | مقرر الوحيد2 / كتاب الطالب | `high-school/grade-2/sharia/tawhid` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120889` | مقرر القران الكريم وتفسيره/ كتاب الطالب | `high-school/grade-1/first-year/quran` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120898` | مقرر التجويد /كتاب الطالب | `middle/grade-1/ien-7846` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120899` | مقرر التجويد /كتاب الطالب | `middle/grade-3/ien-7854` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120900` | مقرر التجويد /كتاب الطالب | `elementary/grade-6/ien-8829` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120901` | مقرر التجويد /كتاب الطالب | `elementary/grade-4/ien-8888` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120902` | مقرر التجويد /كتاب الطالب | `elementary/grade-5/ien-12248` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120908` | مقرر القراءات 1/ كتاب الطالب | `high-school/grade-2/sharia/qiraat` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120909` | مقرر مبادئ القانون /كتاب الطالب | `high-school/grade-3/business/law` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120910` | مقرر المهارات الحياتية والاسرية /كتاب الطالب | `elementary/grade-4/life` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120912` | مقرر مبادئ القانون / كتاب الطالب | `high-school/grade-3/sharia/law` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120916` | مقرر المهارات الحياتية والاسرية /كتاب الطالب | `elementary/grade-6/life` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120917` | مقرر الفقه 2 /كتاب الطالب | `high-school/grade-3/sharia/fiqh` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120918` | مقرر الفرائض /كتاب الطالب | `high-school/grade-3/sharia/faraid` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120924` | مقرر تطبيقات في القانون /كتاب الطالب | `high-school/grade-3/business/law-applications` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120927` | مقرر التربية الفنية / كتاب الطالب | `elementary/grade-5/art` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120928` | مقرر التربية الفنية/ كتاب الطالب | `elementary/grade-4/art` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120932` | مقرر تطبيقات في القانون / كتاب الطالب | `high-school/grade-3/sharia/law-applications` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120933` | مقرر الدراسات الأدبية / كتاب الطالب | `high-school/grade-3/general/arabic` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120934` | مقرر الدراسات الأدبية / كتاب الطالب | `high-school/grade-3/cs-eng/arabic` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120935` | مقرر الدراسات الأدبية / كتاب الطالب | `high-school/grade-3/health/arabic` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120936` | مقرر الدراسات الأدبية / كتاب الطالب | `high-school/grade-3/sharia/arabic` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120942` | مقرر الدراسات الأدبية /كتاب الطالب | `high-school/grade-3/business/arabic` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120943` | مقرر الكفايات اللغوية 1-1/ كتاب الطالب الجزء الأول | `high-school/grade-1/first-year/arabic` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120945` | مقررالمعرفة المالية /كتاب الطالب | `high-school/grade-1/first-year/financial-literacy` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120947` | مقرر التربية الفنية / كتاب الطالب | `elementary/grade-6/art` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120949` | مقرر مقدمة في الأعمال / كتاب الطالب | `high-school/grade-2/business/intro-business` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120950` | مقرر تلاوة القران الكريم وتجويده/كتاب الطالب | `elementary/grade-5/islamic` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120951` | مقرر الإدارة المالية/ كتاب الطالب | `high-school/grade-2/business/finance` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120952` | مقرر المهارات الحياتية والاسرية /كتاب الطالب | `elementary/grade-5/life` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120955` | مقرر الدراسات اللغوية/ كتاب الطالب | `high-school/grade-2/sharia/linguistic-studies` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120956` | مقرر الدراسات اللغوية/ كتاب الطالب | `high-school/grade-2/business/linguistic-studies` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120960` | مقرر تلاوة القرآن الكريم و تجويده / كتاب الطالب | `elementary/grade-6/islamic` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120970` | مقرر فيزياء 2-3/كتاب الطالب الجزء الثاني | `high-school/grade-3/cs-eng/physics` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120971` | مقرر فيزياء 2-3/كتاب الطالب الجزء الثاني | `high-school/grade-3/health/physics` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120976` | مقرر الرياضيات2-3/ كتاب الطالب الجزء الثاني | `high-school/grade-3/cs-eng/math` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-120977` | مقرر الرياضيات2-3/ كتاب الطالب الجزء الثاني | `high-school/grade-3/health/math` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121001` | مقرر الدراسات البلاغية والنقدية / كتاب الطالب | `high-school/grade-3/sharia/rhetoric` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121002` | مقرر الدراسات البلاغية والنقدية / كتاب الطالب | `high-school/grade-3/business/rhetoric` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121008` | مقرر القراءات 2 / كتاب الطالب | `high-school/grade-2/sharia/qiraat` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121016` | مقرر الكفايات اللغوية 2-1 / كتاب الطالب الجزء الأول | `high-school/grade-2/sharia/arabic` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121017` | مقرر الكفايات اللغوية 2-1 / كتاب الطالب الجزء الأول | `high-school/grade-2/business/arabic` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121020` | مقرر الكفايات اللغوية 2-1 / كتاب الطالب الجزء الأول | `high-school/grade-2/cs-eng/arabic` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121021` | مقرر الكفايات اللغوية 2-1 / كتاب الطالب الجزء الأول | `high-school/grade-2/health/arabic` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121025` | مقرر الكيمياء2-2 / كتاب الطالب الجزء الثاني | `high-school/grade-2/general/chemistry` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121026` | مقرر الكيمياء2-2 / كتاب الطالب الجزء الثاني | `high-school/grade-2/health/chemistry` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121027` | مقرر الكيمياء2-2 / كتاب الطالب الجزء الثاني | `high-school/grade-2/cs-eng/chemistry` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121031` | مقرر الرياضيات2-2 / كتاب الطالب الجزء الثاني | `high-school/grade-2/general/math` | student_book | 2 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121032` | مقرر الرياضيات2-2 / كتاب الطالب الجزء الثاني | `high-school/grade-2/health/math` | student_book | 2 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121033` | مقرر الرياضيات2-2 / كتاب الطالب الجزء الثاني | `high-school/grade-2/cs-eng/math` | student_book | 2 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121037` | مقرر الرياضيات /كتاب الطالب الجزء الثاني | `elementary/grade-1/math` | student_book | 2 | 1447 (1447 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121039` | مقرر المهارات الحياتية والاسرية /كتاب الطالب الجزء الثاني | `elementary/grade-1/life` | student_book | 2 | 1447 (1447 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121040` | مقرر المهارات الحياتية والاسرية /كتاب الطالب الجزء الثاني | `elementary/grade-2/life` | student_book | 2 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121041` | مقرر المهارات الحياتية والاسرية /كتاب الطالب الجزء الثاني | `elementary/grade-3/life` | student_book | 2 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121043` | مقرر إدارة الفعاليات / كتاب الطالب | `high-school/grade-3/business/events` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121044` | مقرر المهارات الرقمية / كتاب الطالب | `elementary/grade-6/digital` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121045` | مقرر المهارات الرقمية / كتاب الطالب | `elementary/grade-5/digital` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121046` | مقرر تخطيط الحملات التسويقية / كتاب الطالب | `high-school/grade-3/business/marketing` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121047` | مقرر التربية الفنية / كتاب الطالب الجزء الثاني | `elementary/grade-1/art` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121048` | مقرر العلوم/ كتاب الطالب الجزء الثاني | `elementary/grade-1/science` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121049` | مقرر الدراسات الإسلامية / كتاب الطالب الجزء الثاني | `elementary/grade-1/islamic` | student_book | 2 | 1447 (1447 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121050` | مقرر We Can / كتاب الطالب الجزء الثاني | `elementary/grade-1/english` | student_book | 2 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121051` | مقرر لغتي / كتاب الطالب الجزء الثاني | `elementary/grade-1/arabic` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121069` | مقرر الفنية /كتاب الطالب الجزء الثاني | `elementary/grade-2/art` | student_book | 2 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121070` | مقرر العلوم /كتاب الطالب الجزء الثاني | `elementary/grade-2/science` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121071` | مقرر الرياضيات / كتاب الطالب الجزء الثاني | `elementary/grade-2/math` | student_book | 2 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121072` | مقرر We can /كتاب الطالب الجزء الثاني | `elementary/grade-2/english` | student_book | 2 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121073` | مقرر لغتي / كتاب الطالب الجزء الثاني | `elementary/grade-2/arabic` | student_book | 2 | 1447 (1447 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121074` | مقرر أصول الفقه / كتاب الطالب | `high-school/grade-3/sharia/usul-fiqh` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121075` | مقرر التفسير2 / كتاب الطالب | `high-school/grade-3/sharia/tafsir` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121076` | مقرر الحديث 2 / كتاب الطالب | `high-school/grade-2/sharia/hadith` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121080` | مقرر الرياضيات /كتاب الطالب الجزء الأول | `elementary/grade-3/math` | student_book | 1 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121081` | مقرر صناعة القرارفي الاعمال /كتاب الطالب | `high-school/grade-2/business/decision-making` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121082` | مقرر Top Goal3 /كتاب الطالب | `elementary/grade-6/english` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121083` | مقرر الكفايات اللغوية 2-1 / كتاب الطالب الجزء الأول | `high-school/grade-2/general/arabic` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121084` | مقرر الكفايات اللغوية 2-2 /كتاب الطالب الجزء الثاني | `high-school/grade-2/general/arabic` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121085` | مقرر التجويد /كتاب الطالب | `middle/grade-2/ien-7852` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121086` | مقرر الرتبية الفنية /كتاب الطالب الجزء الثاني | `elementary/grade-3/art` | student_book | 2 | 1448 (— / 1448) | external_official | active | not_started | 0 / 0 | — (needs_review) | — |
| `ien-121087` | مقررالرياضيات /كتاب الطالب الجزء الثاني | `elementary/grade-3/math` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121088` | مقرر العلوم /كتاب الطالب الجزء الثاني | `elementary/grade-3/science` | student_book | 2 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121089` | مقرر الدراسات الإسلامية /كتاب الطالب الجزء الثاني | `elementary/grade-3/islamic` | student_book | 2 | 1447 (1447 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121090` | مقرر We can /كتاب الطالب الجزء الثاني | `elementary/grade-3/english` | student_book | 2 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121091` | مقرر لغتي /كتاب الطالب الجزء الثاني | `elementary/grade-3/arabic` | student_book | 2 | 1447 (1447 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121103` | مقرر المهارات الحياتية والأسرية / كتاب الطالب | `middle/grade-2/life` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121104` | مقرر المهارات الحياتية والأسرية / كتاب الطالب | `middle/grade-3/life` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121109` | مقرر علوم القرآن/ كتاب الطالب | `high-school/grade-2/sharia/quran-sciences` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121114` | مقرر التربية المهنية / كتاب الطالب | `high-school/grade-1/first-year/vocational` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121116` | مقرر إنترنت الأشياء / كتاب الطالب | `high-school/grade-2/cs-eng/iot` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121117` | مقرر الرعاية الصحية / كتاب الطالب | `high-school/grade-3/health/healthcare` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121118` | مقرر علم البيانات / كتاب الطالب | `high-school/grade-2/cs-eng/data-science` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121119` | مقرر مبادئ الإدارة / كتاب الطالب | `high-school/grade-3/business/management` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121120` | مقرر المهارات الرقمية / كتاب الطالب | `elementary/grade-4/digital` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121121` | مقرر المهارات الرقمية / كتاب الطالب | `middle/grade-2/digital` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121122` | مقرر المهارات الرقمية / كتاب الطالب | `middle/grade-3/digital` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121123` | مقرر مبادئ الاقتصاد / كتاب الطالب | `high-school/grade-2/business/economics` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121126` | مقررالسكرتارية والإدارة المكتبية/ كتاب الطالب | `high-school/grade-3/business/secretarial` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121128` | المهارات الإدارية/ كتاب الطالب | `high-school/grade-3/general/elective` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121130` | مقرر المواطنة الرقمية /كتاب الطالب | `high-school/grade-3/general/digital-citizenship` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121131` | مقرر التفكير الناقد /كتاب الطالب | `high-school/grade-1/first-year/critical` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121132` | مقررالبحث ومصادر المعلومات /كتاب الطالب | `high-school/grade-3/general/research` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121137` | مقرر مصطلح الحديث / كتاب الطالب | `high-school/grade-3/sharia/hadith-terminology` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121139` | التنمية المستدامة/ كتاب الطالب | `high-school/grade-3/general/elective` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121141` | مقرر اللياقة والثقافة الصحية/ كتاب الطالب | `high-school/grade-2/general/fitness` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121142` | مقرر اللياقة والثقافة الصحية/ كتاب الطالب | `high-school/grade-2/health/fitness` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121143` | مقرر اللياقة والثقافة الصحية/ كتاب الطالب | `high-school/grade-2/sharia/fitness` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121144` | مقرر اللياقة والثقافة الصحية/ كتاب الطالب | `high-school/grade-2/business/fitness` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121145` | مقرر اللياقة والثقافة الصحية/ كتاب الطالب | `high-school/grade-2/cs-eng/fitness` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121172` | مقرر التقنية الرقمية 2/ كتاب الطالب | `high-school/grade-2/business/digital` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121173` | مقرر التقنية الرقمية 2/ كتاب الطالب | `high-school/grade-2/sharia/digital` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121174` | مقرر التقنية الرقمية 2/ كتاب الطالب | `high-school/grade-2/health/digital` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121179` | مقرر اللغه الصينية /كتاب الطالب الجزء الأول | `middle/grade-1/ien-54709` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121180` | مقرر اللغه الصينية /كتاب الطالب الجزء الأول | `middle/grade-2/ien-65053` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121181` | مقرر اللغه الصينية /كتاب الطالب الجزء الأول | `middle/grade-3/ien-66010` | student_book | 1 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121182` | مقرر التقنية الرقمية 2/ كتاب الطالب | `high-school/grade-2/general/digital` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121183` | مقرر التقنية الرقمية 3/ كتاب الطالب | `high-school/grade-3/general/digital` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121184` | مقرر المهارات الرقمية/ كتاب الطالب | `middle/grade-1/digital` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121185` | مقرر الهندسة/ كتاب الطالب | `high-school/grade-2/cs-eng/engineering` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121186` | مقرر هندسة البرمجيات/ كتاب الطالب | `high-school/grade-3/cs-eng/software-engineering` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121203` | مقرر مبادئ العلوم الصحية/ كتاب الطالب | `high-school/grade-2/health/health-sciences` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121206` | مقرر التربية الفنية /كتاب الطالب | `middle/grade-3/art` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121207` | مقرر التربية الفنية /كتاب الطالب | `middle/grade-1/art` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121208` | مقررالتفكير الناقد /كتاب الطالب | `middle/grade-3/critical` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121209` | مقرر فن تصميم الأزياء /كتاب الطالب | `high-school/grade-3/general/elective` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121210` | مقرر المهارات الحياتية /كتاب الطالب | `high-school/grade-3/general/life` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121211` | مقرر التربية الفنية / كتاب الطالب | `middle/grade-2/art` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121212` | مقرر التصميم الهندسي / كتاب الطالب | `high-school/grade-3/cs-eng/engineering-design` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121213` | مقرر الذكاء الاصطناعي / كتاب الطالب | `high-school/grade-3/cs-eng/ai` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121214` | مقرر الأمن السيبراني / كتاب الطالب | `high-school/grade-3/cs-eng/cybersecurity` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121216` | مقرر الإحصاء/ كتاب الطالب | `high-school/grade-3/business/statistics` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121217` | مقررالكتابة الوظيفية والإبداعية / كتاب الطالب | `high-school/grade-3/general/elective` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121218` | مقرر الإسعافات الأولية /كتاب الطالب | `high-school/grade-3/general/elective` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121219` | مقرر التصميم الرقمي / كتاب الطالب | `high-school/grade-3/general/elective` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121220` | مقرر الفنون /كتاب الطالب | `high-school/grade-2/general/arts` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121221` | مقرر الدراسات النفسية والاجتماعية /كتاب الطالب | `high-school/grade-3/general/psych-social` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121222` | مقرر علوم الأرض والفضاء /كتاب الطالب | `high-school/grade-3/general/earth-space` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121223` | مقرر أنظمة جسم الإنسان /كتاب الطالب | `high-school/grade-3/health/body-systems` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121224` | Event Management\\ Student book | `high-school/grade-3/business/events` | student_book | — | 1448 (1448 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121225` | Business Finance \\ Student book | `high-school/grade-2/business/finance` | student_book | — | 1448 (1448 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121226` | Marketing campaign planning \\ Student book | `high-school/grade-3/business/marketing` | student_book | — | 1448 (1448 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121227` | Business Decision Making \\ Student book | `high-school/grade-2/business/decision-making` | student_book | — | 1448 (1448 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121228` | Introduction To Business\\ Student book | `high-school/grade-2/business/intro-business` | student_book | — | 1448 (1448 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121248` | مقرر الإحصاء/ كتاب الطالب | `high-school/grade-3/health/statistics` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121252` | مقرر الفنون / كتاب الطالب | `high-school/grade-2/sharia/arts` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121253` | مقرر الفنون / كتاب الطالب | `high-school/grade-2/business/arts` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121257` | مقررالبحث ومصادر المعلومات /كتاب الطالب | `high-school/grade-3/business/research` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121258` | مقررالبحث ومصادر المعلومات /كتاب الطالب | `high-school/grade-3/sharia/research` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121259` | مقررالبحث ومصادر المعلومات /كتاب الطالب | `high-school/grade-3/cs-eng/research` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121260` | مقررالبحث ومصادر المعلومات /كتاب الطالب | `high-school/grade-3/health/research` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121271` | مقرر المهارات الحياتية/ كتاب الطالب | `high-school/grade-3/sharia/life` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121272` | مقرر المهارات الحياتية/ كتاب الطالب | `high-school/grade-3/business/life` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121273` | مقرر المهارات الحياتية/ كتاب الطالب | `high-school/grade-3/cs-eng/life` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121274` | مقرر المهارات الحياتية/ كتاب الطالب | `high-school/grade-3/health/life` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121278` | مقرر المواطنة الرقمية/ كتاب الطالب | `high-school/grade-3/sharia/digital-citizenship` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121279` | مقرر المواطنة الرقمية/ كتاب الطالب | `high-school/grade-3/business/digital-citizenship` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121280` | مقرر علوم الأرض والفضاء /كتاب الطالب | `high-school/grade-3/cs-eng/earth-space` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121281` | مقرر علوم الأرض والفضاء /كتاب الطالب | `high-school/grade-3/health/earth-space` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121285` | مقرر الدراسات النفسية والاجتماعية /كتاب الطالب | `high-school/grade-3/sharia/psych-social` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121286` | مقرر الدراسات النفسية والاجتماعية /كتاب الطالب | `high-school/grade-3/business/psych-social` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121296` | مقرر التقنية الرقمية 1 / كتاب الطالب | `high-school/grade-1/first-year/digital` | student_book | — | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121297` | مقرر الكفايات اللغوية 1-2 كتاب الطالب الجزء الثاني | `high-school/grade-1/first-year/arabic` | student_book | 2 | 1447 (1447 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121298` | مقرر رياضيات 2-1/ كتاب الطالب الجزء الثاني | `high-school/grade-1/first-year/math` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121299` | مقرر المهارات الحياتية والأسرية /كتاب الطالب | `middle/grade-1/life` | student_book | — | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121300` | مقرر فيزياء 2-3/كتاب الطالب الجزء الثاني | `high-school/grade-3/general/physics` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121301` | مقررالأحياء 2-2 / كتاب الطالب الجزء الثاني | `high-school/grade-2/general/biology` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121302` | مقرر الرياضيات / كتاب الطالب الجزء الثاني | `elementary/grade-4/math` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121303` | مقرر الرياضيات / كتاب الطالب الجزء الثاني | `elementary/grade-5/math` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121304` | مقرر العلوم / كتاب الطالب الجزء الثاني | `elementary/grade-4/science` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121305` | مقرر العلوم / كتاب الطالب الجزء الثاني | `elementary/grade-5/science` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121306` | مقرر لغتي الجميلة / كتاب الطالب الجزء الثاني | `elementary/grade-5/arabic` | student_book | 2 | 1447 (1447 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121307` | مقرر لغتي الجميلة / كتاب الطالب الجزء الثاني | `elementary/grade-4/arabic` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121322` | مقرر الرياضيات / كتاب الطالب الجزء الثاني | `elementary/grade-6/math` | student_book | 2 | 1448 (— / 1448) | external_official | active | not_started | 0 / 0 | — (needs_review) | — |
| `ien-121324` | مقرر لغتي الجميلة / كتاب الطالب الجزء الثاني | `elementary/grade-6/arabic` | student_book | 2 | 1447 (1447 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121325` | مقرر العلوم / كتاب الطالب الجزء الثاني | `elementary/grade-6/science` | student_book | 2 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121326` | مقرر الرياضيات2-3/ كتاب الطالب الجزء الثاني | `high-school/grade-3/general/math` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121327` | مقرر الدراسات الإسلامية /كتاب الطالب الجزء الثاني | `middle/grade-1/islamic` | student_book | 2 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121328` | مقرر لغتي الخالدة / كتاب الطالب الجزء الثاني | `middle/grade-2/arabic` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121329` | مقرر الرياضيات /كتاب الطالب الجزء الثاني | `middle/grade-2/math` | student_book | 2 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121330` | مقرر العلوم / كتاب الطالب الجزء الثاني | `middle/grade-1/science` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | full_done | 39 / 189 | — (needs_review) | — |
| `ien-121331` | مقرر العلوم / كتاب الطالب الجزء الثاني | `middle/grade-2/science` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121332` | مقرر العلوم / كتاب الطالب الجزء الثاني | `middle/grade-3/science` | student_book | 2 | 1448 (— / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121364` | financial Literacy\\ Student book | `high-school/grade-1/first-year/financial-literacy` | student_book | — | 1448 (1448 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121366` | Health care/student book | `high-school/grade-3/health/healthcare` | student_book | — | 1448 (1448 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121367` | Principles of Management/student book | `high-school/grade-3/business/management` | student_book | — | 1448 (1448 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121369` | مقرر الدراسات الإسلامية /كتاب الطالب الجزء الثاني | `middle/grade-2/islamic` | student_book | 2 | 1447 (1447 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121370` | مقرر الدراسات الإسلامية /كتاب الطالب الجزء الثاني | `middle/grade-3/islamic` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121371` | مقرر لغتي الخالدة / كتاب الطالب الجزء الثاني | `middle/grade-3/arabic` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121372` | مقرر الدراسات الاسلامية / كتاب الطالب الجزء الثاني | `elementary/grade-2/islamic` | student_book | 2 | 1447 (1447 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121373` | مقرر اللغه الصينية /كتاب الطالب الجزء الثاني | `middle/grade-1/ien-54709` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121374` | مقرر اللغه الصينية /كتاب الطالب الجزء الثاني | `middle/grade-2/ien-65053` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121375` | مقرر اللغه الصينية /كتاب الطالب الجزء الثاني | `middle/grade-3/ien-66010` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121376` | Audio Files TG3 | `elementary/grade-6/english` | audio | — | — (— / —) | external_official | needs_review | not_applicable | 0 / 0 | — (needs_review) | — |
| `ien-121377` | TOP GOAL 3 WB | `elementary/grade-6/english` | activity_book | — | — (— / —) | external_official | needs_review | not_applicable | 0 / 0 | — (needs_review) | — |
| `ien-121378` | مقرر الكفايات اللغوية 2-2 /كتاب الطالب الجزء الثاني | `high-school/grade-2/business/arabic` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121379` | مقرر الكفايات اللغوية 2-2 /كتاب الطالب الجزء الثاني | `high-school/grade-2/sharia/arabic` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121380` | مقرر الكفايات اللغوية 2-2 /كتاب الطالب الجزء الثاني | `high-school/grade-2/health/arabic` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121381` | مقرر الكفايات اللغوية 2-2 /كتاب الطالب الجزء الثاني | `high-school/grade-2/cs-eng/arabic` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121387` | مقرر الرياضيات /كتاب الطالب الجزء الثاني | `middle/grade-3/math` | student_book | 2 | 1447 (1447 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121389` | Principles of Health Sciences\\ Student book | `high-school/grade-2/health/health-sciences` | student_book | — | 1448 (1448 / 1448) | external_official | needs_review | frontmatter_done | 0 / 0 | — (needs_review) | — |
| `ien-121390` | مقرر لغتي الخالدة/ كتاب الطالب الجزء الثاني | `middle/grade-1/arabic` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | full_done | 9 / 233 | — (needs_review) | — |
| `ien-121391` | مقرر الرياضيات /كتاب الطالب الجزء الثاني | `middle/grade-1/math` | student_book | 2 | 1448 (1448 / 1448) | external_official | active | full_done | 6 / 195 | — (needs_review) | — |
| `ien-121393` | Test Bank | `elementary/grade-6/english` | test_resource | — | — (— / —) | external_official | needs_review | not_applicable | 0 / 0 | — (needs_review) | — |
| `ien-bank-105` | التربية الفنية | `middle/grade-1/art` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-110` | المهارات الحياتية والأسرية | `middle/grade-1/life` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-1120` | الرياضيات | `middle/grade-3/math` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-1121` | العلوم | `middle/grade-3/science` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-12248` | التجويد (التحفيظ) | `elementary/grade-5/ien-12248` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-156` | اللغة العربية | `middle/grade-2/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-160` | الرياضيات | `middle/grade-2/math` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-166` | العلوم | `middle/grade-2/science` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-17079` | الدراسات الاجتماعية | `elementary/grade-4/social` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-17080` | الدراسات الاجتماعية | `elementary/grade-5/social` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-17081` | الدراسات الاجتماعية | `elementary/grade-6/social` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-17082` | الدراسات الاجتماعية | `middle/grade-1/social` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-17083` | الدراسات الاجتماعية | `middle/grade-2/social` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-17084` | الدراسات الاجتماعية | `middle/grade-3/social` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-17204` | المهارات الرقمية | `elementary/grade-6/digital` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-176` | التربية الفنية | `middle/grade-2/art` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-182` | المهارات الحياتية والأسرية | `middle/grade-2/life` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-231` | اللغة العربية | `middle/grade-3/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-235` | التربية الفنية | `middle/grade-3/art` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-241` | المهارات الحياتية والأسرية | `middle/grade-3/life` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-273` | اللغة العربية | `elementary/grade-1/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-27416` | اللغة الإنجليزية | `elementary/grade-1/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-27417` | اللغة الإنجليزية | `elementary/grade-2/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-27418` | اللغة الإنجليزية | `elementary/grade-3/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-27559` | التقنية الرقمية 1 | `high-school/grade-1/first-year/digital` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-27564` | التفكير الناقد | `middle/grade-3/critical` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-27575` | الرياضيات 1 | `high-school/grade-1/first-year/math` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-27589` | المهارات الرقمية | `elementary/grade-4/digital` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-27593` | المهارات الرقمية | `middle/grade-1/digital` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-27597` | اللغة الإنجليزية 1 | `high-school/grade-1/first-year/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-27680` | الكيمياء 1 | `high-school/grade-1/first-year/chemistry` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-277` | الرياضيات | `elementary/grade-1/math` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-27709` | الأحياء 1 | `high-school/grade-1/first-year/biology` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-27735` | الكفايات اللغوية 1 | `high-school/grade-1/first-year/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-27875` | التربية المهنية | `high-school/grade-1/first-year/vocational` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-27885` | علم البيئة | `high-school/grade-1/first-year/environment` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-27924` | الفيزياء 1 | `high-school/grade-1/first-year/physics` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-27934` | الدراسات الاجتماعية | `high-school/grade-1/first-year/social` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-284` | العلوم | `elementary/grade-1/science` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-28424` | الحديث 1 | `high-school/grade-1/first-year/hadith` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-297` | التربية الفنية | `elementary/grade-1/art` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-301` | المهارات الحياتية والأسرية | `elementary/grade-1/life` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-309` | اللغة العربية | `elementary/grade-2/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-31017` | التربية الصحية والبدنية 1 | `high-school/grade-1/first-year/pe` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-314` | الرياضيات | `elementary/grade-2/math` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-31578` | التربية الصحية والبدنية 2 | `high-school/grade-1/first-year/ien-31578` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-323` | العلوم | `elementary/grade-2/science` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-333` | التربية الفنية | `elementary/grade-2/art` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-33502` | الرياضيات 2 | `high-school/grade-2/general/math` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-33506` | الفيزياء 2 | `high-school/grade-2/general/physics` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-33511` | الكيمياء 2 | `high-school/grade-2/general/chemistry` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-33539` | الكفايات اللغوية 2 | `high-school/grade-2/general/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-33551` | الأحياء 2 | `high-school/grade-2/general/biology` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-33590` | علوم القرآن | `high-school/grade-2/sharia/quran-sciences` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-33596` | التاريخ | `high-school/grade-2/general/history` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-33620` | تأملات في الفن السعودي والعالمي | `middle/grade-1/ien-33620` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-33703` | تأملات في الفن السعودي والعالمي | `middle/grade-2/ien-33703` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-33707` | تأملات في الفن السعودي والعالمي | `middle/grade-3/ien-33707` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-33710` | تأملات في الفن السعودي والعالمي | `high-school/grade-1/first-year/ien-33710` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-338` | المهارات الحياتية والأسرية | `elementary/grade-2/life` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34025` | اللغة الإنجليزية 2 | `high-school/grade-2/general/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34045` | التفسير1 | `high-school/grade-2/business/tafsir` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34052` | التوحيد 2 | `high-school/grade-2/sharia/tawhid` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34170` | القراءات 1 | `high-school/grade-2/sharia/qiraat` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34187` | الثقافة الموسيقية | `middle/grade-1/ien-34187` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34191` | الثقافة الموسيقية | `middle/grade-2/ien-34191` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34194` | الثقافة الموسيقية | `middle/grade-3/ien-34194` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34197` | الثقافة الموسيقية | `high-school/grade-1/first-year/ien-34197` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34212` | المهارات الرقمية | `elementary/grade-5/digital` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34216` | المهارات الرقمية | `middle/grade-2/digital` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34224` | الدراسات اللغوية | `high-school/grade-2/sharia/linguistic-studies` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34307` | القرآن الكريم والدراسات الإسلامية | `middle/grade-1/islamic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34308` | القرآن الكريم والدراسات الإسلامية | `middle/grade-2/islamic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34309` | القرآن الكريم والدراسات الإسلامية | `middle/grade-3/islamic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34310` | قراءات 2 | `high-school/grade-2/sharia/qiraat` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34317` | القرآن الكريم وتفسيره | `high-school/grade-1/first-year/quran` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34329` | التقنية الرقمية 2 | `high-school/grade-2/general/digital` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34335` | الفنون | `high-school/grade-2/general/arts` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34339` | القرآن الكريم والدراسات الإسلامية | `elementary/grade-1/islamic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34347` | القرآن الكريم والدراسات الإسلامية | `elementary/grade-2/islamic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34355` | القرآن الكريم والدراسات الإسلامية | `elementary/grade-3/islamic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34363` | القرآن الكريم والدراسات الإسلامية | `elementary/grade-4/islamic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34372` | القرآن الكريم والدراسات الإسلامية | `elementary/grade-5/islamic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34388` | القرآن الكريم والدراسات الإسلامية | `elementary/grade-6/islamic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34417` | اللياقة والثقافة الصحية | `high-school/grade-2/general/fitness` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34447` | مبادئ الاقتصاد | `high-school/grade-2/business/economics` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34454` | الإدارة المالية | `high-school/grade-2/business/finance` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34462` | صناعة القرار في الأعمال | `high-school/grade-2/business/decision-making` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34468` | مقدمة في الأعمال | `high-school/grade-2/business/intro-business` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34474` | الهندسة | `high-school/grade-2/cs-eng/engineering` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34480` | علم البيانات | `high-school/grade-2/cs-eng/data-science` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34503` | التفكير الناقد | `high-school/grade-1/first-year/critical` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34510` | التوحيد 1 | `high-school/grade-2/general/tawhid` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34535` | الكفايات اللغوية 2 | `high-school/grade-2/sharia/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34536` | التقنية الرقمية 2 | `high-school/grade-2/sharia/digital` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34558` | التوحيد 1 | `high-school/grade-2/health/tawhid` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34559` | اللغة الإنجليزية 2 | `high-school/grade-2/health/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34560` | الرياضيات 2 | `high-school/grade-2/health/math` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34561` | الكيمياء 2 | `high-school/grade-2/health/chemistry` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34562` | الأحياء 2 | `high-school/grade-2/health/biology` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34563` | التقنية الرقمية 2 | `high-school/grade-2/health/digital` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34564` | اللياقة والثقافة الصحية | `high-school/grade-2/health/fitness` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34602` | اللياقة والثقافة الصحية | `high-school/grade-2/sharia/fitness` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34611` | التوحيد 1 | `high-school/grade-2/cs-eng/tawhid` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34626` | اللياقة والثقافة الصحية | `high-school/grade-2/business/fitness` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34635` | التوحيد 1 | `high-school/grade-2/business/tawhid` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34643` | اللغة الإنجليزية 2 | `high-school/grade-2/business/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34648` | الكفايات اللغوية 2 | `high-school/grade-2/business/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34655` | اللغة الإنجليزية 2 | `high-school/grade-2/cs-eng/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34656` | الرياضيات 2 | `high-school/grade-2/cs-eng/math` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34657` | الكيمياء 2 | `high-school/grade-2/cs-eng/chemistry` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34658` | الأحياء 2 | `high-school/grade-2/cs-eng/biology` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34678` | اللغة الإنجليزية 2 | `high-school/grade-2/sharia/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34679` | التوحيد 1 | `high-school/grade-2/sharia/tawhid` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-34828` | القرآن الكريم (2-1) | `high-school/grade-2/sharia/quran` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-354` | اللغة العربية | `elementary/grade-3/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-359` | التربية الفنية | `elementary/grade-3/art` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-364` | المهارات الحياتية والأسرية | `elementary/grade-3/life` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-36727` | مبادئ العلوم الصحية | `high-school/grade-2/health/health-sciences` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-36728` | إنترنت الأشياء | `high-school/grade-2/cs-eng/iot` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-36745` | الكيمياء 3 | `high-school/grade-3/general/chemistry` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-36881` | الكفايات اللغوية 2 | `high-school/grade-2/cs-eng/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-36883` | الكفايات اللغوية 2 | `high-school/grade-2/health/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-36941` | التاريخ | `high-school/grade-2/business/history` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-36942` | التاريخ | `high-school/grade-2/sharia/history` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-36955` | التقنية الرقمية 2 | `high-school/grade-2/business/digital` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-36959` | اللياقة والثقافة الصحية | `high-school/grade-2/cs-eng/fitness` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-3750` | اللغة الإنجليزية | `middle/grade-1/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-3751` | اللغة الإنجليزية | `middle/grade-2/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-3752` | اللغة الإنجليزية | `middle/grade-3/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-383` | الرياضيات | `elementary/grade-4/math` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-38674` | الدراسات الأدبية | `high-school/grade-3/business/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-38753` | الدراسات اللغوية | `high-school/grade-2/business/linguistic-studies` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-38758` | التفسير2 | `high-school/grade-3/sharia/tafsir` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-38769` | الحديث2 | `high-school/grade-2/sharia/hadith` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-38785` | الفنون | `high-school/grade-2/sharia/arts` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-38806` | التفسير1 | `high-school/grade-2/sharia/tafsir` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-38813` | الفنون | `high-school/grade-2/business/arts` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-38829` | الفقه1 | `high-school/grade-3/sharia/fiqh` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-38838` | الفقه 2 | `high-school/grade-3/sharia/fiqh` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-38917` | الرياضيات 3 | `high-school/grade-3/general/math` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-390` | العلوم | `elementary/grade-4/science` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-39289` | الفيزياء 2 | `high-school/grade-2/cs-eng/physics` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-39299` | الفيزياء 2 | `high-school/grade-2/health/physics` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-39467` | الجغرافيا | `high-school/grade-3/general/geography` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-398` | التربية الفنية | `elementary/grade-4/art` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-39855` | الدراسات البلاغية والنقدية | `high-school/grade-3/sharia/rhetoric` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-39858` | الفيزياء 3 | `high-school/grade-3/general/physics` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-40723` | المعرفة المالية | `high-school/grade-1/first-year/financial-literacy` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-408` | المهارات الحياتية والأسرية | `elementary/grade-4/life` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-41173` | الفرائض | `high-school/grade-3/sharia/faraid` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-41199` | البحث ومصادر المعلومات | `high-school/grade-3/general/research` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-41210` | المهارات الحياتية | `high-school/grade-3/general/life` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-41214` | مصطلح الحديث | `high-school/grade-3/sharia/hadith-terminology` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-41527` | أصول الفقه | `high-school/grade-3/sharia/usul-fiqh` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-41535` | اللغة الإنجليزية 3 | `high-school/grade-3/general/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-41551` | الإحصاء | `high-school/grade-3/business/statistics` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-41558` | المواطنة الرقمية | `high-school/grade-3/general/digital-citizenship` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-41581` | الدراسات النفسية والاجتماعية | `high-school/grade-3/general/psych-social` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-41617` | التقنية الرقمية 3 | `high-school/grade-3/general/digital` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-41629` | مبادئ القانون | `high-school/grade-3/business/law` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-41697` | المهارات الرقمية | `middle/grade-3/digital` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-418` | اللغة العربية | `elementary/grade-5/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-423` | الرياضيات | `elementary/grade-3/math` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-42619` | الفقه1 | `high-school/grade-3/business/fiqh` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-42620` | الجغرافيا | `high-school/grade-3/business/geography` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-42621` | الدراسات البلاغية والنقدية | `high-school/grade-3/business/rhetoric` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-42622` | البحث ومصادر المعلومات | `high-school/grade-3/business/research` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-42623` | اللغة الإنجليزية 3 | `high-school/grade-3/business/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-42651` | الجغرافيا | `high-school/grade-3/sharia/geography` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-42652` | البحث ومصادر المعلومات | `high-school/grade-3/sharia/research` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-42653` | اللغة الإنجليزية 3 | `high-school/grade-3/sharia/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-42688` | الكيمياء 3 | `high-school/grade-3/cs-eng/chemistry` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-42689` | الرياضيات 3 | `high-school/grade-3/cs-eng/math` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-42690` | الفيزياء 3 | `high-school/grade-3/cs-eng/physics` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-42691` | البحث ومصادر المعلومات | `high-school/grade-3/cs-eng/research` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-42692` | اللغة الإنجليزية 3 | `high-school/grade-3/cs-eng/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-42715` | الكيمياء 3 | `high-school/grade-3/health/chemistry` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-42716` | الرياضيات 3 | `high-school/grade-3/health/math` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-42717` | الفيزياء 3 | `high-school/grade-3/health/physics` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-42718` | البحث ومصادر المعلومات | `high-school/grade-3/health/research` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-42719` | اللغة الإنجليزية 3 | `high-school/grade-3/health/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-429` | العلوم | `elementary/grade-3/science` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-43243` | علوم الأرض والفضاء | `high-school/grade-3/general/earth-space` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-43250` | أنظمة جسم الإنسان | `high-school/grade-3/health/body-systems` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-43528` | الفقه1 | `high-school/grade-3/general/fiqh` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-43529` | الفقه1 | `high-school/grade-3/cs-eng/fiqh` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-43530` | الفقه1 | `high-school/grade-3/health/fiqh` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-43555` | الإحصاء | `high-school/grade-3/health/statistics` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-43619` | المهارات الإدارية | `high-school/grade-3/general/elective` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-43635` | التصميم الرقمي | `high-school/grade-3/general/elective` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-43662` | التنمية المستدامة | `high-school/grade-3/general/elective` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-43978` | القرآن الكريم (3-1) | `high-school/grade-3/sharia/quran` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-43981` | السكرتارية والإدارة المكتبية | `high-school/grade-3/business/secretarial` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44660` | الكتابة الوظيفية والإبداعية | `high-school/grade-3/general/elective` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44821` | مبادئ القانون | `high-school/grade-3/sharia/law` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44822` | المهارات الحياتية | `high-school/grade-3/sharia/life` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44823` | المواطنة الرقمية | `high-school/grade-3/sharia/digital-citizenship` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44837` | المهارات الحياتية | `high-school/grade-3/business/life` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44838` | المواطنة الرقمية | `high-school/grade-3/business/digital-citizenship` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44847` | المهارات الحياتية | `high-school/grade-3/cs-eng/life` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44850` | علوم الأرض والفضاء | `high-school/grade-3/cs-eng/earth-space` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44861` | علوم الأرض والفضاء | `high-school/grade-3/health/earth-space` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44862` | المهارات الحياتية | `high-school/grade-3/health/life` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44876` | التربية الصحية والبدنية 2 | `high-school/grade-3/cs-eng/pe` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44877` | التربية الصحية والبدنية 2 | `high-school/grade-3/sharia/pe` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44881` | الدراسات النفسية والاجتماعية | `high-school/grade-3/sharia/psych-social` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44882` | التربية الصحية والبدنية 2 | `high-school/grade-3/health/pe` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44887` | الدراسات النفسية والاجتماعية | `high-school/grade-3/business/psych-social` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44888` | التربية الصحية والبدنية 2 | `high-school/grade-3/business/pe` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44889` | التربية الصحية والبدنية 2 | `high-school/grade-3/general/pe` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44899` | الدراسات الأدبية | `high-school/grade-3/general/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44900` | الدراسات الأدبية | `high-school/grade-3/cs-eng/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44901` | الدراسات الأدبية | `high-school/grade-3/health/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44902` | الدراسات الأدبية | `high-school/grade-3/sharia/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-44934` | تطبيقات في القانون | `high-school/grade-3/business/law-applications` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-459` | الرياضيات | `elementary/grade-5/math` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-466` | العلوم | `elementary/grade-5/science` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-476` | التربية الفنية | `elementary/grade-5/art` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47758` | تأملات في الفن السعودي والعالمي | `high-school/grade-2/general/ien-47758` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47759` | تأملات في الفن السعودي والعالمي | `high-school/grade-2/sharia/ien-47759` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47760` | تأملات في الفن السعودي والعالمي | `high-school/grade-2/business/ien-47760` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47761` | تأملات في الفن السعودي والعالمي | `high-school/grade-2/cs-eng/ien-47761` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47762` | تأملات في الفن السعودي والعالمي | `high-school/grade-2/health/ien-47762` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47773` | تأملات في الفن السعودي والعالمي | `high-school/grade-3/general/ien-47773` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47774` | تأملات في الفن السعودي والعالمي | `high-school/grade-3/sharia/ien-47774` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47776` | تأملات في الفن السعودي والعالمي | `high-school/grade-3/cs-eng/ien-47776` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47777` | تأملات في الفن السعودي والعالمي | `high-school/grade-3/health/ien-47777` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47818` | الثقافة الموسيقية | `high-school/grade-2/general/ien-47818` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47819` | الثقافة الموسيقية | `high-school/grade-2/sharia/ien-47819` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47820` | الثقافة الموسيقية | `high-school/grade-2/business/ien-47820` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47821` | الثقافة الموسيقية | `high-school/grade-2/cs-eng/ien-47821` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47822` | الثقافة الموسيقية | `high-school/grade-2/health/ien-47822` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47835` | الثقافة الموسيقية | `high-school/grade-3/general/ien-47835` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47836` | الثقافة الموسيقية | `high-school/grade-3/sharia/ien-47836` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47839` | الثقافة الموسيقية | `high-school/grade-3/cs-eng/ien-47839` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47840` | الثقافة الموسيقية | `high-school/grade-3/health/ien-47840` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47882` | الثقافة الموسيقية | `high-school/grade-3/business/ien-47882` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-47884` | تأملات في الفن السعودي والعالمي | `high-school/grade-3/business/ien-47884` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-48221` | تطبيقات في القانون | `high-school/grade-3/sharia/law-applications` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-48222` | فن تصميم الأزياء | `high-school/grade-3/general/elective` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-485` | المهارات الحياتية والأسرية | `elementary/grade-5/life` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-4959` | اللغة العربية | `elementary/grade-4/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-5047` | التربية البدنية والدفاع عن النفس | `middle/grade-1/pe` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-5049` | التربية البدنية والدفاع عن النفس | `elementary/grade-1/pe` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-5055` | التربية البدنية والدفاع عن النفس | `elementary/grade-4/pe` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-5057` | التربية البدنية والدفاع عن النفس | `elementary/grade-5/pe` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-5060` | التربية البدنية والدفاع عن النفس | `elementary/grade-6/pe` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-5062` | التربية البدنية والدفاع عن النفس | `elementary/grade-2/pe` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-5063` | التربية البدنية والدفاع عن النفس | `middle/grade-3/pe` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-5070` | التربية البدنية والدفاع عن النفس | `middle/grade-2/pe` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-5078` | التربية البدنية والدفاع عن النفس | `elementary/grade-3/pe` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-509` | اللغة العربية | `elementary/grade-6/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-51031` | اللغة الإنجليزية | `elementary/grade-4/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-528` | الرياضيات | `elementary/grade-6/math` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-534` | العلوم | `elementary/grade-6/science` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-544` | التربية الفنية | `elementary/grade-6/art` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-54709` | اللغة الصينية | `middle/grade-1/ien-54709` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-555` | المهارات الحياتية والأسرية | `elementary/grade-6/life` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-58491` | Top Goal2 | `elementary/grade-5/english` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-65053` | اللغة الصينية | `middle/grade-2/ien-65053` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-7846` | التجويد (التحفيظ) | `middle/grade-1/ien-7846` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-7852` | التجويد (التحفيظ) | `middle/grade-2/ien-7852` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-7854` | التجويد (التحفيظ) | `middle/grade-3/ien-7854` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-86` | اللغة العربية | `middle/grade-1/arabic` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-8829` | التجويد (التحفيظ) | `elementary/grade-6/ien-8829` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-8888` | التجويد (التحفيظ) | `elementary/grade-4/ien-8888` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-90` | الرياضيات | `middle/grade-1/math` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
| `ien-bank-95` | العلوم | `middle/grade-1/science` | question_bank_external | — | — (— / —) | external_official | active | not_applicable | 0 / 0 | — (unknown) | — |
