# Validation

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

## Cumulative (5757 records)

| Role | Agent | Items checked | Records |
|---|---|---|---|
| deterministic | script | 2000 | 2168 |
| language | gemini_web | 284 | 284 |
| primary | claude_subagent | 1947 | 1947 |
| resolver | chatgpt_web | 1358 | 1358 |

| Role | Verdicts |
|---|---|
| deterministic | fail 150, pass 1744, warn 274 |
| language | pass 280, warn 4 |
| primary | fail 1, pass 1391, warn 555 |
| resolver | disagree 70, pass 1288 |

Top failing check codes: E001 43, N002 28, L002 26, P006 25, P004 10, P005 7, S004 5, L005 3, L007 3, O008 3.  
Top warning codes: E001 83, N003 82, L006 60, L003 58, O006 26, O005 13.  
Disagreements (verdict `disagree`) by role: resolver 70.

## Per run

### `run-20260927-check-01` (check, 75 records)

| Role | Agent | Items checked | Records |
|---|---|---|---|
| deterministic | script | 75 | 75 |

| Role | Verdicts |
|---|---|
| deterministic | fail 7, pass 61, warn 7 |

Top failing check codes: O008 3, P006 3, N003 1, P005 1.  
Top warning codes: L006 6, N003 1.  
Disagreements (verdict `disagree`) by role: —.

### `run-20260927-check-02` (check, 300 records)

| Role | Agent | Items checked | Records |
|---|---|---|---|
| deterministic | script | 300 | 300 |

| Role | Verdicts |
|---|---|
| deterministic | pass 236, warn 64 |

Top failing check codes: none.  
Top warning codes: L003 58, O006 15, O005 2.  
Disagreements (verdict `disagree`) by role: —.

### `run-20260927-check-03` (check, 1166 records)

| Role | Agent | Items checked | Records |
|---|---|---|---|
| deterministic | script | 1166 | 1166 |

| Role | Verdicts |
|---|---|
| deterministic | fail 101, pass 985, warn 80 |

Top failing check codes: E001 43, P006 20, N002 11, P004 10, L002 8, P005 5, S004 5, L007 2, N003 1, N004 1.  
Top warning codes: L006 40, N003 37, O005 9, O006 6.  
Disagreements (verdict `disagree`) by role: —.

### `run-20260927-check-04` (check, 459 records)

| Role | Agent | Items checked | Records |
|---|---|---|---|
| deterministic | script | 459 | 459 |

| Role | Verdicts |
|---|---|
| deterministic | fail 27, pass 397, warn 35 |

Top failing check codes: L002 18, N002 6, L005 3.  
Top warning codes: N003 34, O006 5.  
Disagreements (verdict `disagree`) by role: —.

### `run-20260927-check-05` (check, 43 records)

| Role | Agent | Items checked | Records |
|---|---|---|---|
| deterministic | script | 43 | 43 |

| Role | Verdicts |
|---|---|
| deterministic | fail 12, pass 27, warn 4 |

Top failing check codes: N002 11, P006 1.  
Top warning codes: N003 4.  
Disagreements (verdict `disagree`) by role: —.

### `run-20260927-check-06` (check, 11 records)

| Role | Agent | Items checked | Records |
|---|---|---|---|
| deterministic | script | 11 | 11 |

| Role | Verdicts |
|---|---|
| deterministic | pass 11 |

Top failing check codes: none.  
Top warning codes: none.  
Disagreements (verdict `disagree`) by role: —.

### `run-20260927-check-07` (check, 43 records)

| Role | Agent | Items checked | Records |
|---|---|---|---|
| deterministic | script | 43 | 43 |

| Role | Verdicts |
|---|---|
| deterministic | fail 3, warn 40 |

Top failing check codes: L007 1, P005 1, P006 1.  
Top warning codes: E001 43, L006 7, N003 1, O005 1.  
Disagreements (verdict `disagree`) by role: —.

### `run-20260927-check-08` (check, 71 records)

| Role | Agent | Items checked | Records |
|---|---|---|---|
| deterministic | script | 71 | 71 |

| Role | Verdicts |
|---|---|
| deterministic | pass 27, warn 44 |

Top failing check codes: none.  
Top warning codes: E001 40, L006 7, N003 5, O005 1.  
Disagreements (verdict `disagree`) by role: —.

### `run-20260927-val-01` (val, 68 records)

| Role | Agent | Items checked | Records |
|---|---|---|---|
| primary | claude_subagent | 68 | 68 |

| Role | Verdicts |
|---|---|
| primary | pass 52, warn 16 |

Top failing check codes: none.  
Top warning codes: none.  
Disagreements (verdict `disagree`) by role: —.

### `run-20260927-val-02` (val, 300 records)

| Role | Agent | Items checked | Records |
|---|---|---|---|
| primary | claude_subagent | 300 | 300 |

| Role | Verdicts |
|---|---|
| primary | pass 248, warn 52 |

Top failing check codes: none.  
Top warning codes: none.  
Disagreements (verdict `disagree`) by role: —.

### `run-20260927-val-03` (val, 812 records)

| Role | Agent | Items checked | Records |
|---|---|---|---|
| primary | claude_subagent | 812 | 812 |

| Role | Verdicts |
|---|---|
| primary | fail 1, pass 619, warn 192 |

Top failing check codes: none.  
Top warning codes: none.  
Disagreements (verdict `disagree`) by role: —.

### `run-20260927-val-04` (val, 767 records)

| Role | Agent | Items checked | Records |
|---|---|---|---|
| primary | claude_subagent | 767 | 767 |

| Role | Verdicts |
|---|---|
| primary | pass 472, warn 295 |

Top failing check codes: none.  
Top warning codes: none.  
Disagreements (verdict `disagree`) by role: —.

### `run-20260927-xval-01` (xval, 81 records)

| Role | Agent | Items checked | Records |
|---|---|---|---|
| language | gemini_web | 13 | 13 |
| resolver | chatgpt_web | 68 | 68 |

| Role | Verdicts |
|---|---|
| language | pass 10, warn 3 |
| resolver | disagree 7, pass 61 |

Top failing check codes: none.  
Top warning codes: none.  
Disagreements (verdict `disagree`) by role: resolver 7.

### `run-20260927-xval-02` (xval, 378 records)

| Role | Agent | Items checked | Records |
|---|---|---|---|
| language | gemini_web | 78 | 78 |
| resolver | chatgpt_web | 300 | 300 |

| Role | Verdicts |
|---|---|
| language | pass 78 |
| resolver | disagree 6, pass 294 |

Top failing check codes: none.  
Top warning codes: none.  
Disagreements (verdict `disagree`) by role: resolver 6.

### `run-20260927-xval-03` (xval, 1183 records)

| Role | Agent | Items checked | Records |
|---|---|---|---|
| language | gemini_web | 193 | 193 |
| resolver | chatgpt_web | 990 | 990 |

| Role | Verdicts |
|---|---|
| language | pass 192, warn 1 |
| resolver | disagree 57, pass 933 |

Top failing check codes: none.  
Top warning codes: none.  
Disagreements (verdict `disagree`) by role: resolver 57.

## Sample sizes versus the sampling policy

Policy counts use the run's seeded sampling plan (§4.4): `required` = high-risk, aptitude and legacy items (ChatGPT) or items with an L* warning and every `en` item (Gemini); `sampled` = the seeded sample. `present` = items with a record of that role in the run.

| Run | Pilot | Rates | ChatGPT required | ChatGPT sampled | ChatGPT present | Gemini required | Gemini sampled | Gemini present |
|---|---|---|---|---|---|---|---|---|
| `run-20260927-xval-01` | yes | chatgpt_stem 1, chatgpt_other 1, language 0.1 | 2227 | 1378 | 68 | 103 | 349 | 13 |
| `run-20260927-xval-02` | no | chatgpt_stem 0.2, chatgpt_other 0.1, language 0.1 | 2227 | 306 | 300 | 103 | 342 | 78 |
| `run-20260927-xval-03` | no | chatgpt_stem 0.2, chatgpt_other 0.1, language 0.1 | 2227 | 257 | 990 | 103 | 326 | 193 |

## Agents unavailable

| Agent | Runs |
|---|---|
| deepseek | run-20260927-gen-01, run-20260927-val-01, run-20260927-val-02, run-20260927-val-03, run-20260927-val-04, run-20260927-val-05, run-20260927-xval-01, run-20260927-xval-02, run-20260927-xval-03 |

## Review queue

- Size: **120** (by reason: deterministic: P006 21, primary blind answer ≠ key 2, primary validator: fail 1, resolver answer ≠ key 67, unsupported by the cited pages 29)
- Oldest queued: 2026-09-27T17:17:52Z; newest: 2026-09-27T17:17:52Z
- Age at generation time (days): max 0, median 0
- Human decisions recorded: —

## Legacy items (the 300)

300 legacy items. By validation outcome: review_required 6, validated 294. By status: published 294, review_required 6.
