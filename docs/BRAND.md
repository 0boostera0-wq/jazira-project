# Jazira brand

## The mark

The letter **ج** — the first letter of جزيرة (island) — drawn as one
unbroken stroke:

- its **head** is the horizon,
- its **bowl** is the sea's sheltering curve,
- its **dot**, in gold, is the island (and the pearl of the Gulf) at its heart.

It is built on a 64-unit grid: one monoline stroke (9.5 units, round caps and
joins) and one circle. No gradients, no effects: it stays crisp from a 16px
favicon to a billboard, and reads as ج to Arabic readers and as a calm,
distinctive symbol to everyone else.

| Colour | Hex | Use |
|---|---|---|
| Deep teal | `#1F4F45` | the mark and wordmark on light backgrounds; the app-icon tile |
| Champagne gold | `#C9A45C` | the dot (island) — always gold, on every background |
| Ivory | `#F7F1E6` | the mark and wordmark on dark backgrounds and on the tile |

## Wordmark and lockups

The wordmark is **Alexandria Bold** (SIL Open Font License), outlined — no font
is needed to display it. In «جزيرة» the dot of ج is gold, echoing the mark.
Arabic lockups put the mark on the right (reading start), English lockups on
the left. The mark is as tall as the wordmark's full height; the gap is a
quarter of the mark.

## Files (public/, registered in src/lib/assets.js)

| File | Use |
|---|---|
| `/images/brand/jazira-mark.svg` | primary mark, light backgrounds |
| `/images/brand/jazira-mark-on-dark.svg` | primary mark, dark backgrounds |
| `/images/brand/jazira-lockup-ar.svg` · `/images/brand/jazira-lockup-ar-on-dark.svg` | Arabic full lockup |
| `/images/brand/jazira-lockup-en.svg` · `/images/brand/jazira-lockup-en-on-dark.svg` | English full lockup |
| `/images/brand/jazira-icon.svg` | small icon: ivory mark on the teal tile (= `src/app/icon.svg`, the favicon) |
| `/images/brand/jazira-icon-192.png` · `/images/brand/jazira-icon-512.png` | app icons (web app manifest, Organization logo in JSON-LD) |
| `/images/brand/jazira-icon-maskable-512.png` | maskable app icon (mark inside the safe zone) |
| `/og/jazira-og.jpg` | 1200×630 social preview: the island painting + the bilingual lockup |

Next.js metadata files: `src/app/icon.svg` (favicon), `src/app/favicon.ico`
(16/32/48 for legacy agents), `src/app/apple-icon.png` (180×180, full-bleed —
iOS applies its own mask).

## In the interface

Never place the files by hand — use the components (inline SVG built from the
same geometry, `src/components/brand/geometry.js`; theme-aware: teal in light
mode, ivory in dark mode, the dots stay gold):

| Component | Where |
|---|---|
| `<Logo name={t("brand.full")} size="sm|md|lg" />` | marketing header, app sidebar, auth pages, footer, 404 |
| `<IslandMark size={…} />` | compact contexts: mobile top bar, landing hero chip, final CTA, loading screen |
| `<IslandMark tile />` | where the app icon itself is meant |
| `<AssistantAvatar />` | Jazira Assistant — the golden guiding light of the assistant scenes on teal |

`name` is the accessible name; its script picks the Arabic or English lockup.

## Don'ts

- Don't recolour the dot, add gradients, shadows or outlines, rotate, stretch,
  or re-typeset the wordmark in another font.
- Don't put the mark on busy imagery without a calm backing.
- Keep clear space of at least half the mark's height on every side.

## Rebuilding

The kit is generated from one source (`design-source/brand/tools/build.mjs`,
outside the repo: HarfBuzz-shaped Alexandria outlines + the mark geometry).
Rebuild only when the design changes, then run `npm run assets:check`.
