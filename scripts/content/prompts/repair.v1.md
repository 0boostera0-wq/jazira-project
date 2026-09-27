# Jazira question repair — repair.v1

You repair ONE item that failed Stage 1 (deterministic checks) or that a
human reviewer sent back with the decision `repair`. You receive the
generation packet of its lesson (same pages and images, see generate.v1),
the item (`question`) and the reasons (`checks` with `fail` / `warn` results
of `validation-record@1`, or the reviewer's note). A repair is one round
only: fix every listed problem, keep what was right, and do not add new
problems.

Write exactly one JSON line to the packet's `output` file, in the generator
format of generate.v1, with `"repair_of": "<the item id>"` and the FULL
content of the repaired item (all content fields, not a diff). The repair
keeps the lesson; it becomes a new revision of the same id and is validated
again from Stage 1.

## Rules (docs/CONTENT_ENGINE.md §4.3, verbatim)

**Page images.** Every packet page carries `image` (a cache path rendered by
`pdf-render.mjs`) next to its text; the subagent reads the image whenever
`text_quality ≠ ok` or the page has equations, figures or tables, and the
image wins over the text layer. Validation packets (§4.4) carry the same
images. Images and transcripts stay in the cache and in Claude sessions run
by this project; they are never copied into the repo and never sent to
ChatGPT or Gemini.

**Required:** every item is answerable from the packet pages alone (the
lesson's facts, examples and exercises); page refs point to the supporting
pages; exactly one defensible answer; explanation with steps for math, the
concept for science, the reason for language items and the strategy for
aptitude; the explanation must agree with the source; distractors are
plausible and each reflects a named misconception; the text follows the
lesson's language and Saudi curriculum terminology; Western digits (bank
convention) unless the lesson uses Arabic-Indic digits throughout; `؟` in
Arabic stems.

**Forbidden** (checked in §4.4): copying textbook sentences beyond short
quotes (P004: char-5-gram containment on repaired text or the vision
transcript, roughly a 12-word run, fails unless the item's evidence has `quote_kind` `quran`, `hadith`,
`poetry` or `definition` with a ≤ 200-char quote); reproducing textbook
exercises verbatim (numbers or context must change: then `transformed`);
labels such as "official", «وزاري», «من اختبارات الوزارة», «قياس»; figure-dependent
items («في الشكل المجاور», "in the figure") unless the stimulus renders the
data as text (no media in v1); a figure- or table-derived stimulus that
copies more than 12 cells verbatim from the book, or keeps the book's data
unchanged (it must be `transformed`: new values, same skill); content not in
the packet; iEN question-bank content; naming any AI system;
`all of the above` combined with `none of the above`.

## Frequent repairs

- O001–O003, N004: options must be distinct (also in value: 0.5 and ½ are
  the same), with exactly one correct option.
- O008: the explanation explains the reasoning; it never names an option by
  letter or position.
- N002 / P006: add or correct `computation` so it evaluates to the key, and
  put the computed answer in a step.
- E001: every evidence quote must be copied exactly from the cited page.
- P004 / P005: rewrite in your own words; change the numbers or context of a
  textbook exercise; a table stimulus copies at most 12 cells and changes the
  book's data.
- L001–L008: one digit system, ؟ at the end of Arabic questions, no
  presentation forms, no bidi controls, balanced brackets, no double spaces.
