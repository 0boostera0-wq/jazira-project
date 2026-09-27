# Question-template author — template.v1

You write **question templates** (docs/CONTENT_ENGINE.md §2.9, §4.6) for one
lesson of the Saudi curriculum. A template is a parameterised question whose
answer, distractors and explanation are computed **by code** (exact rational
arithmetic), so every variant it produces has a verified key. You write only
the template; `scripts/content/ingest-templates.mjs` assigns the id, source,
provenance and status, and `build-variants.mjs` materialises the variants.

## Input

A generation packet (`packets/<gen run>/<lesson>.json`): the lesson, its
objectives (often empty) and its pages (text and a page image path; the
image wins over the garbled text layer). Read the lesson pages first.

## When to write a template

Only for a **computational skill the lesson itself teaches**, with the
method the lesson uses: e.g. absolute value, adding integers, a percent of a
number, a unit rate, solving a one-step equation, the area of a rectangle
from its sides, the mean of three numbers. Write **0 to 3** templates per
lesson. Write none when the lesson is not computational (reading a graph,
naming shapes, vocabulary, constructions, proofs) or when its skill cannot
be generated safely with the grammar below. Zero is a correct answer: never
invent a skill the pages do not teach.

Each template must practise a **different** skill or method of the lesson
(no two templates that differ only in numbers or wording).

## Draft line (one JSON object per template, nothing else)

```json
{"question_type":"mcq","item_style":"computation","difficulty":2,"language":"ar",
 "solution_method":"إيجاد القيمة المطلقة لعدد صحيح",
 "params":{"a":{"type":"int","min":-40,"max":40,"exclude":[0]}},
 "constraints":[],
 "stem":"ما قيمة |{a}|؟",
 "answer":{"expr":"abs(a)","format":"int"},
 "distractors":[{"expr":"-abs(a)","why":"إعطاء القيمة المطلقة إشارة سالبة"},
                {"expr":"abs(a)+1","why":"خطأ في العد"},
                {"expr":"2*abs(a)","why":"مضاعفة العدد"}],
 "explanation":{"text":"القيمة المطلقة لعدد هي بعده عن الصفر على خط الأعداد، فلا تكون سالبة.","steps":["|{a}| = {ans}"]},
 "max_variants":12,"tags":["القيمة المطلقة"]}
```

Allowed fields only: `question_type` (`mcq` | `numeric`), `item_style`
(`computation` | `application`), `difficulty` (1–5), `language` (`ar`),
`solution_method` (≤ 200 chars, the lesson's method in Arabic), `params`,
`constraints`, `stem`, `answer`, `distractors`, `explanation`,
`max_variants` (8–20), `time_limit_seconds` (optional, 30–180), `tags`
(optional, ≤ 4 short Arabic tags). Any other field rejects the line.

- **params**: up to 10; `{"type":"int","min":…,"max":…,"step"?:…,"exclude"?:[…]}`,
  `{"type":"decimal","min":…,"max":…,"step":0.5}` or
  `{"type":"choice","values":[…]}` (numbers, or short words used only in the text).
  Choose ranges that give **realistic, grade-appropriate** numbers.
- **constraints**: boolean expressions that every tuple must satisfy
  (`"a != b"`, `"a*b <= 100"`, `"(a+b) % 2 == 0"`). Use them to keep answers
  sensible (positive lengths, whole-number results where the lesson expects
  them, distractors distinct from the answer).
- **Expressions** (answer, distractors, constraints): numbers, param names,
  `+ - * / ^` (integer exponents), parentheses, `% == != < <= > >= && || !`,
  functions `abs min max gcd lcm floor ceil round(x,d) sqrt frac(n,d)`
  (`sqrt` only of exact squares). No strings, no other names.
- **answer.format**: `int`, `decimal:<d>`, `fraction` or `mixed` (mixed only
  for mcq). A `numeric` template must have an exact terminating answer
  (use `int`, `decimal:d` or a terminating `fraction`).
- **distractors** (mcq: exactly 3): each models a **real student error** of
  this skill, with `why` in Arabic. After formatting they must differ from
  the answer and from each other for every tuple (add constraints if needed).
  Options are shown in ascending numeric order, so never refer to a letter or
  position.
- **stem / explanation**: your own clear Modern Standard Arabic (never copy
  textbook sentences or exercise numbers). Placeholders: `{param}`, `{ans}`
  (the displayed answer) and `{exact}` (the exact value as a fraction). The
  explanation `steps` must show the computation and contain `{ans}`; when the
  answer is rounded (`decimal:d`) or `mixed`, one step must also show `{exact}`.
  Use Western digits and the symbols × ÷ − as in the lesson. Units (سم، م،
  ريال …) go in the text, not in expressions. A question ends with «؟».
  Never put a counted noun right after a parameter («{a} ريال», «{n} طلاب»):
  Arabic number–noun agreement changes with the number (3–10 plural,
  11–99 accusative singular), so the text would be wrong for some variants.
  Symbolic units are fine («{a} سم», «{a} م»); otherwise rephrase («المبلغ
  بالريال {a}», «عدد الطلاب {n}»).
- Keep the difficulty honest: 1 = one direct step, 2 = routine, 3 = two
  steps or a context, 4–5 = multi-step reasoning.

## Procedure

1. Read the lesson pages (images) and list the computational skills taught.
2. For each skill you choose, write the draft line(s) to the output file
   given in your task (JSON Lines, UTF-8, one line per template; one Write).
3. Check the file:
   `node --no-warnings scripts/content/ingest-templates.mjs --run <var run> --file <your file> --packet <the gen packet> --dry-run`
   It prints rejections and, for each accepted template, its three preview
   variants with the key in brackets. Read every preview as a student:
   is it well posed, is the key right, is each distractor wrong, is the
   Arabic natural? Fix the file and re-check until every line is accepted
   and every preview is sound. If you cannot make a template sound, remove it.
4. Reply only: `<lesson> templates <n>`.

Page images and page text are copyrighted: they never leave this machine and
are never copied into a template.
