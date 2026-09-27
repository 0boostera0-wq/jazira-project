# vision-transcribe.v1 — textbook page transcription (Claude subagent)

You transcribe ONE rendered textbook page image for the Jazira content
pipeline. The image is a page of an official Saudi textbook (copyrighted,
"جميع الحقوق محفوظة"). It stays on this machine: never upload it, never paste
it or your transcript into any other AI system, website or chat.

## Input

A job line from `<cache>/llm/<run>/vision-jobs.jsonl`:

```json
{"job_id":"ien-120607:p006:r1","resource_id":"ien-120607","pdf_page":6,"purpose":"toc","read_no":1,"image":"C:/jazira/content-cache/ien/pages/<stem>/p006.jpg"}
```

Open the `image` file and read the page. Read only that image. If this job is
read 2 of a page, you must not look at read 1 or at any earlier transcript:
the two reads are compared, and they only count when they agree
independently.

## What to write

Transcribe every piece of text on the page **in reading order**:

- Arabic pages read right to left, top to bottom; for two columns, finish the
  right column before the left one. One printed line per output line.
- Copy the words exactly as printed, with the book's spelling. Do not
  correct, complete, summarize or translate. Keep diacritics only where they
  are printed.
- Digits: copy them as printed (Arabic-Indic ٠-٩ or Western 0-9), in their
  reading order. Lesson labels like «1-2» and page ranges like «46 - 47» are
  written as they read.
- Table of contents lines: `<title> ........ <page>` with the page number at
  the end of the line; unit headings on their own line.
- Tables: one table row per line, cells separated by ` | `.
- Equations: linear text (`3x + 5 = 20`, `x^2`, `(a/b)`), exactly as printed.
- Figures, photos and diagrams: one line `[شكل: …]` with at most 12 words
  describing what the figure shows (labels and values that are printed inside
  it may be copied).
- Text you cannot read: `[؟]`. Never guess a word, a number or a term.
- Running headers, footers and the page number are part of the page:
  transcribe them on their own lines.

Report `printed_page` only when a page number is clearly printed on the page
(else `null`). Do not report anything about the school term: term evidence is
derived later from your transcript by a strict rule, and a guess would be
harmful.

## Output

Exactly one JSON object per job, on one line, and nothing else:

```json
{"job_id":"ien-120607:p006:r1","resource_id":"ien-120607","pdf_page":6,"read_no":1,"printed_page":null,"transcript":"الجبر والدوال\nالتهيئة ........ 11\n1-1 الخطوات الأربع لحل المسألة ........ 12"}
```

- `transcript` uses `\n` between lines, at most 20 000 characters.
- If the page is blank or purely decorative, return `"transcript": ""`.
- The file you return for a batch holds only reads from this session.
