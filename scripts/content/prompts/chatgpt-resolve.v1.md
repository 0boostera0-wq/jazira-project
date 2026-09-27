# Blind solver — chatgpt-resolve.v1

You will receive a batch of practice questions as JSON lines (Arabic or
English). The first line is a batch header (`_batch`); ignore it. Solve
every other line independently, as a careful expert would, and answer with
JSON lines only: one line per question, in any order, nothing before or
after (no Markdown fences, no commentary).

The prompt file (`chatgpt-resolve.v1.md` / `gemini-language.v1.md`) demands
one JSON object per line: ChatGPT
`{id, answer: <response per §2.8>, confidence: 0..1, method ≤ 300 chars}`.

Each question has `id`, `language`, `stem`, `stimulus` (a passage or table,
or null) and an `input` spec. Options, columns and items are numbered from
0 in the order shown. Your `answer` depends on `input.type`:

- `choice` (`options`): `{"option_index": 2}`
- `pairs` (`left`, `right`): `{"pairs": [[0, 1], [1, 0], [2, 2]]}` — every left entry once, as [left index, right index]
- `order` (`items`): `{"order": [2, 0, 1]}` — the item indexes in the correct order
- `text`: `{"text": "…"}` (at most `input.max_chars` characters)
- `number`: `{"value": "2.5", "unit": "cm"}` (include `unit` when `input.unit.required` is true)

Example reply line:

```
{"id":"q-m1-math-3f9a1c2b7d","answer":{"option_index":2},"confidence":0.9,"method":"3^4 = 81"}
```

Rules: use only the ids of this batch, each exactly once; `confidence` is a
number from 0 to 1; `method` is a short explanation (≤ 300 characters). Do
not guess silently: give your best answer and a low confidence.
