# Jazira art direction

One painted world — *the island of learning* — so every page feels like part of
the same product: a terraced island whose library and lighthouse recur in the
distance of almost every scene, warm light, calm sea, the same palette. What
changes with the audience is the **rendering**: the world becomes more refined
as the student grows.

## Rendering tiers

| Audience | Rendering | Feel |
|---|---|---|
| Elementary (grades 1–6) | toy-like premium 3D, like a high-end animated film: rounded chunky forms, painted wood, clay, felt; brighter coral, sunny yellow and sky blue | playful, warm, polished — never cheap |
| Middle (grades 7–9) | refined stylized 3D with real proportions and materials (pale wood, frosted glass, brushed brass, paper); teal and aqua lead | curious, capable, hands-on — not kindergarten |
| High school, exams (Qudurat, Tahsili), brand, site pages | refined cinematic painterly 3D: rich materials (brass, glass, walnut, marble, leather), golden-hour light | premium, sophisticated, aspirational |
| Payment, subscriptions, legal | the cinematic tier, formal still life: gilded paper, wax seals, brass, velvet | trustworthy, elegant |

## Constants

- **Palette**: ivory `#F7F1E6`, sand `#E8D9BD`, champagne gold `#C9A45C`, deep
  teal `#1F4F45`/`#2E6B5E`, sage `#9DBEA6`, sea aqua `#A9CFCB`, coral `#E39B7B`
  (sparingly).
- **Light**: warm, from the upper left; soft contact shadows.
- **No text in any image**: no titles, labels, UI copy, numbers, dial digits,
  calligraphy, logos or watermarks — every word stays HTML, so one image serves
  Arabic and English, RTL and LTR. Books are blank or show only ornament;
  screens show abstract shapes; dials show tick marks.
- **People**: no real or photorealistic people. Characters are stylized
  (animated-film faces) or seen from behind. Saudi context is shown with
  respect: modest dress, girls in hijab, and from middle school on boys and
  girls study at separate tables.
- **No clichés**: no palm-tree resort imagery; the island is a place of learning.

## Formats

Every image is a **1536×1024 (3:2)** original.

- **Scenes** (page heroes, section panels, auth panels, states): a full world
  view composed so it survives the crops the layouts use (16:9 banners, 4:3 and
  5:4 panels, square thumbnails) — the subject sits near the centre, set by the
  manifest's `focus`.
- **Subject cards** (school subjects, exam skills, assistant capabilities,
  premium): an uncluttered still life, centred on a plain softly lit
  ivory-to-sand studio backdrop with generous margins, in the tier's rendering.

## How the library was made

1. A written prompt per asset (subject, tier, palette, framing, and the explicit
   "no text / no people" constraints), generated with ChatGPT image generation
   in one continuous conversation so the world stays consistent.
2. Every result reviewed at full resolution: rejected and regenerated when it
   showed pseudo-text or digits (e.g. a protractor scale, chart labels),
   photorealistic faces, a style that drifted from its tier, or a culturally
   inappropriate grouping.
3. Approved originals are kept outside the repo (`design-source/raw/`, named by
   the manifest's `source`); `npm run assets:process` renders the WebP
   renditions and placeholder colours; `npm run assets:check` verifies them.

Every file is registered in `src/lib/assets.js` with its pages, purpose,
responsive sizes and priority. Brand marks follow [BRAND.md](BRAND.md).
