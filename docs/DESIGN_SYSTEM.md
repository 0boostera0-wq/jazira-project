# Jazira Design System

Arabic-first, premium, calm. The product should feel like a well-made
educational publication that happens to be interactive — warm paper tones,
confident typography, generous but purposeful space, and colour used with
restraint. It must never look like a generic AI-generated template.

## 1. Principles

1. **Editorial, not decorative.** Hierarchy comes from type, spacing and
   alignment first; colour and effects second. No floating random cards, no
   giant blurs, no gradient soup, no emoji as UI.
2. **Arabic is native, not translated.** Design every screen in RTL first.
   Never letter-space Arabic. Give Arabic taller line-heights. Keep numbers in
   Western digits (`ar-SA-u-nu-latn`) and isolate LTR runs with `.num`/`.ltr`.
3. **Dense where it helps, airy where it matters.** No dead zones: no huge
   empty margins, no tiny centred card on an empty screen, no long vertical
   gaps. Fill wide screens with supporting content (related resources,
   progress, tips, illustration), not with padding.
4. **Shell first, data second.** Every route paints its layout and skeletons
   immediately; data streams in section by section.
5. **One primary action per view.** Everything else is secondary/ghost.

## 2. Tokens (src/app/globals.css → tailwind.config.js)

| Role | Tailwind | Notes |
|---|---|---|
| Page background | `bg-canvas` | warm white `#FAF7F0` |
| Card | `bg-surface` | `#FFFDF9` |
| Inset / tinted area | `bg-surface-2` | beige `#F5EFE4` |
| Track, pressed, divider fill | `bg-surface-3` | sand |
| Borders | `border-line/12` (default), `/20` (strong) | always with alpha |
| Headings / primary text | `text-ink` | |
| Body text | `text-ink-2` | default body colour |
| Secondary text | `text-ink-3` | captions, meta (AA on canvas) |
| Placeholder / disabled | `text-ink-4` | never for real content |
| Brand accent | `gold-50…800` | `gold-500` accent, `gold-600` accent *text* on light |
| Growth / success | `green-50…700` | progress, correct answers, success |
| Feedback | `danger`, `warning`, `info` (+ `-soft` backgrounds) | |
| Primary button | `bg-primary text-primary-fg` | deep ink (inverts in dark) |

Radii: `rounded-xs 6 · sm 10 · md 14 · lg 20 · xl 28 · full`. Cards `rounded-lg`,
inputs `rounded-md`, buttons/chips `rounded-full`, hero media `rounded-xl`.

Shadows: `shadow-xs/sm/md/lg/gold` — warm, low-contrast. Cards default to
`shadow-sm`; hover lift to `shadow-md`; overlays `shadow-lg`.

Dark mode: `html.dark` swaps every variable. Never hardcode hex in components
(exceptions: illustration plates and the gold button text `#261F14`).

## 3. Typography

Fonts: **IBM Plex Sans Arabic** (Arabic + Latin inside Arabic) and **IBM Plex
Sans** (English UI). Weights 400 / 500 / 700 only.

| Class | Use |
|---|---|
| `t-display` | landing hero only |
| `t-h1` | page title (one per page) |
| `t-h2` | section title |
| `t-h3` | card group / sub-section |
| `t-h4` | card title |
| `t-lead` | intro paragraph under a title (`text-ink-3`) |
| `t-body` / default | paragraphs (16px, lh 1.8 Arabic / 1.6 English) |
| `t-small` | dense UI text (14px) |
| `t-caption` | meta, timestamps (13px) — the smallest allowed size |
| `t-eyebrow` | small gold label above a heading |
| `prose-jz` | long-form reading (legal, explanations), max 72ch |

Rules: body ≥ 16px on mobile; nothing below 12px; paragraphs ≤ 72ch; headings
`text-wrap: balance` (automatic). Don't use `font-extrabold`/`black`.

## 4. Layout

- Containers: `<Container>` (1240px, 1320px ≥1536) and `<Container wide>`
  (1400px). Gutters 16 / 24 / 32px.
- Marketing sections: `<Section>` (fluid 56–104px vertical rhythm) +
  `<SectionHeader>`.
- App pages: rendered inside the AppShell content column. Start with
  `<PageHeader>` (title, lead, actions, optional illustration `aside`).
- Grids: 12-col mental model. Typical desktop compositions:
  - **Split hero**: 7/5 text/illustration; stack on mobile, illustration
    first only when it adds meaning, otherwise after the text.
  - **Main + rail**: content 8 cols + sticky rail 4 cols (progress, tips,
    related) at `lg`; the rail moves below content on mobile.
  - **Bento**: mixed card sizes (2×1, 1×1) for dashboards / feature overviews.
  - **Card grid**: `<Grid min={260}>` auto-fit.
- Breakpoints: design for 375, 390, 430, 768, 1024, 1280, 1440, 1680+. No
  horizontal scroll ever (`overflow-x: clip` on body is a safety net, not a fix).
- Mobile is re-composed, not shrunk: primary action first, secondary info in
  tabs/accordions, decorative art reduced or removed, 44px tap targets,
  bottom-sheet dialogs.

## 5. Components (src/components/ui)

| Component | Notes |
|---|---|
| `Button` | variants `primary · gold · secondary · soft · ghost · danger · link`; sizes `sm · md · lg · icon · icon-sm`; `href` makes a locale-aware link; `loading`; `iconStart`/`iconEnd` — pass the **LTR-forward** icon (`ArrowRight`, `ChevronRight`) as `iconEnd`; it is mirrored automatically in RTL |
| `Card`, `CardTitle`, `CardText` | tones `default · flat · tint · gold · green · ink · outline`; `interactive` hover lift |
| `Badge` | tones `neutral · gold · green · danger · warning · info · ink · outline` |
| `IconTile` | lucide icon on a tinted tile; `color` for subject colours |
| `Stat` | KPI tile |
| `ProgressBar`, `ProgressRing` | |
| `Skeleton`, `SkeletonText`, `SkeletonCard`, `SkeletonGrid` | loading states |
| `EmptyState` | illustration/icon + title + why + action |
| `Alert` | inline info/success/warning/danger |
| `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `Label` | forms (client) |
| `PasswordInput`, `Switch`, `Tabs`, `Dialog` (native `<dialog>`, `variant="sheet"`) | interactive (client) |
| `Breadcrumbs`, `PageHeader`, `SectionHeader`, `Section`, `Container`, `Grid` | layout |
| `PremiumLock` | locked preview + upgrade CTA (never render real premium data behind it) |
| `Illustration` | library art by manifest id |
| Brand: `Logo`, `IslandMark`, `AssistantAvatar` | src/components/brand |

Icons: `lucide-react`, 18–20px in UI, stroke default. Directional icons: always
use the LTR-forward glyph (`ArrowRight`, `ChevronRight`) with `className="flip-rtl"`
so it points in the reading direction in both languages (Button does this for
`iconEnd`). Never hand-pick `ArrowLeft` for "forward" in Arabic.

## 6. Motion

CSS only. `animate-in` (fade-up on mount), `animate-fade`, `animate-scale`,
`reveal` (scroll-driven fade-up where supported; content is ALWAYS visible
without JS). Durations 140/220/420ms, `ease-out`. Animate only `transform` and
`opacity`. Respect `prefers-reduced-motion` (automatic). No framer-motion in
new code.

## 7. Illustration style (public/images/**)

All 50 illustrations share one hand-authored vector language:

- **Canvas**: the manifest `width × height` viewBox, transparent background.
  The scene sits on a soft organic ground shape (cream/sand blob or a small
  island) — never a full-bleed rectangle.
- **Palette (fixed hex — looks right on cream and on the cream "plate" in dark
  mode)**: cream `#FFFDF9` `#F7F0E3` · beige `#EFE4D0` · sand `#E3D3B5` ·
  champagne `#D9BE8C` · gold `#C9A45C` · deep gold `#A67F38` · bronze `#7A5A2B` ·
  ink details `#3A3024` (sparingly) · sage `#9DBEA6` · green `#5E8C6A` · deep
  green `#3F6B4E` · water `#CFE3E4` `#A9CBCF` · sky `#EAF2F1` · coral accent
  `#E39B7B` (small doses) · white highlights.
- **Form**: flat editorial vector with soft depth — layered rounded shapes,
  2-stop same-hue linear gradients, soft contact shadows (ellipse, ink at
  8–12% opacity), occasional 1.5–2px bronze/ink detail strokes with round
  caps. Light from the top-left.
- **Characters**: stylised and friendly, simple geometric bodies, faces at most
  two dot eyes and a small smile — never realistic or identifiable people.
  The Jazira assistant is a round cream robot with a gold rim, sage visor and a
  palm-leaf antenna.
- **Never**: text, letters, digits, logos, UI copy, watermarks, raster images,
  external fonts, `<foreignObject>`, scripts.
- **Performance**: ≤ 25 KB after SVGO (hero ≤ 45 KB), ≤ ~150 elements, no
  filters except at most one `feGaussianBlur` for a soft glow.

## 8. Accessibility

WCAG 2.2 AA: text contrast ≥ 4.5:1 (ink-3 is the lightest text colour on
canvas), visible focus (`:focus-visible` ring is global), 44px targets, form
fields with labels + `aria-describedby`, `role="alert"` for errors, dialogs via
native `<dialog>`, decorative images `alt=""`, one `<h1>` per page, landmarks
(`header`, `nav`, `main`, `footer`), skip link in every shell.
