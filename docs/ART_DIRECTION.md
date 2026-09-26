# Jazira art direction

**One brand, many places.** Every page opens on its own image — the place that
visually *is* that page (a lab for chemistry, an exam hall for exams, a quiet
law library for the legal pages) — with its own palette and light. What keeps
the library one family is the treatment, not a template: calm premium
composition, believable materials, clean daylight colour, generous negative
space, and gold used only as a small accent (the brand's island dot).

Before choosing an image ask *"what environment visually represents this exact
page?"*, never *"what generic education image can I use?"*.

## Style by audience

| Audience | Rendering | Story |
|---|---|---|
| Elementary (grades 1–6) | polished, colourful 3D cartoon (animated-film quality): rounded toy forms, big bright primaries, stylized children | playful discovery |
| Middle (grades 7–9) | mature stylized 3D: real proportions and materials, cooler studio light, no toys | exploration and experimentation |
| High school | realistic, cinematic editorial environments: labs, libraries, study rooms, tech labs | ambition and academic depth |
| Aptitude (Qudurat) · Achievement (Tahsili) · exams | sophisticated realistic editorial compositions: geometry, pattern, instruments | reasoning, challenge, scientific preparation |
| Payment · subscriptions · support · legal | clean professional realistic interiors and still lifes | premium and secure · trust · calm |
| Brand pages (landing, about, sign-in/up, social preview) | realistic, aspirational | the island of learning |

## Colour by subject

Gold, yellow, beige and orange are never the dominant colour. Pick the palette
from the subject, and keep unrelated pages visibly different:

| Palette | Used for |
|---|---|
| Blue | science, technology, physics, the sea, research, the exams history (night sky) |
| Green · teal | biology, nature, health, growth, progress, community |
| Purple · violet | creativity, the AI assistant, achievements, premium |
| Blue-gray | high school, engineering, computing, exams, aptitude, checkout |
| Coral / red accents | exams, timed practice, competitions — accents only |
| Warm neutral (linen, walnut, paper) | reading, literature, support, contact, legal |

## Light

Vary it with the subject: crisp daylight (landing, community), soft morning
(high school, dashboard), neutral studio (subject cards, aptitude), cool
laboratory light (achievement, sciences), overcast (exams, FAQ), evening blue
(sign-in, subscriptions), night (exams history, assistant), dramatic but
controlled stage light (competitions). No repeated golden hour, no glowing
yellow lamps as the default, no sunbeams in every room.

## The island

The island is the brand identity, not a template. It appears only on the
landing hero, the about page, the welcome/auth pages (sign-in, sign-up) and the
social preview. Every other image is an independent place — prompts for them
say "no island, no lighthouse, no sea view".

## Rules for every image

- **No text**: no page titles, labels, UI copy, watermarks or logos — titles stay
  HTML, so one image serves Arabic and English, RTL and LTR. Books are closed or
  show only ornament; screens show abstract shapes; clocks and dials show tick
  marks, not digits. *Exception:* elementary cards whose subject IS the letters
  or numbers (أ ب ت, A B C, 1 2 3) — each glyph is checked by eye (hamza, dots,
  order) before the image is accepted.
- **People**: no stock photography and no identifiable human photography.
  Elementary uses stylized children (animated-film faces); middle school uses
  stylized teens; mature pages use environments, objects, hands only if needed,
  silhouettes, or distant non-identifiable figures. Saudi context with respect:
  modest dress, girls in hijab, boys and girls at separate tables from middle
  school on.
- **No repeated formula**: not the same desk, book stack, lamp, island, golden
  light, camera angle or composition twice. No random decorative architecture or
  unrelated skyscrapers.
- **Believable**: no strange geometry, excessive glow, impossible reflections,
  heavy depth blur or odd anatomy.

## Formats

Every original is **1536×1024 (3:2)**, kept outside the repo.

- **Page heroes** (`PageHero`): a wide banner composition. The band shows a
  strip of the image — about 1.5:1 on phones, 1.9:1 on tablets, 2.4–3.3:1 on
  desktop — so the subject sits in the **middle ~45% of the height**, set by the
  manifest's `focus`, and nothing important touches the top or bottom 20%. Keep
  the sides calm: on wide screens the title sits on a glass panel over the start
  side (right in Arabic, left in English), so strong detail belongs in the centre.
- **Subject cards** (school subjects, exam skills, assistant capabilities,
  premium, states): one clear idea per image, framed to survive a 16:9 band and
  a square thumbnail — each in its own palette and setting, not one shared
  backdrop.

## QA — ask of every image

1. Does it match the exact page? 2. Does it have its own visual identity?
3. Is the colour different enough from unrelated pages? 4. Is it too gold?
5. Does it look realistic where it should? 6. Is the cartoon level right for the
student's age? 7. Is there unnecessary text? 8. Does it work as a wide hero?
9. Does it look premium? 10. Does it look like Jazira rather than generic AI
artwork? — anything that fails is regenerated.

## Pipeline

1. A written prompt per asset (place, palette, light, audience style, framing,
   and the explicit constraints: no text, no identifiable people, no island
   where it doesn't belong), generated with ChatGPT image generation.
2. Every result reviewed at full size against the QA list above; rejected and
   regenerated when it fails (e.g. the island leaking into a window, a skyline of
   towers, a photoreal face, pseudo-text).
3. Approved originals live in `design-source/raw/` under the manifest's
   `source`; `npm run assets:process` writes the WebP renditions
   (256–1536px) and placeholder colours; `npm run assets:check` verifies them.
   When the library is regenerated, bump `LIBRARY_VERSION` in
   `src/lib/assets.js` so browsers fetch the new files.

Every file is registered in `src/lib/assets.js` with its pages, purpose,
responsive sizes, priority and focus. Brand marks follow [BRAND.md](BRAND.md).
