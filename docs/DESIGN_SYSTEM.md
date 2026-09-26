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
| Borders | `border-line/12` (default), `/20` (strong) | always with alpha; decorative only |
| Form-control boundary | `border-field`, `ring-field` | inputs, selects, switch track — ≥3:1 on surface & canvas (WCAG 1.4.11) |
| Headings / primary text | `text-ink` | |
| Body text | `text-ink-2` | default body colour |
| Secondary text | `text-ink-3` | captions, meta (AA on canvas) |
| Placeholder / disabled | `text-ink-4` | never for real content (labels, counts, headings → `ink-3`) |
| Brand accent | `gold-50…800` | `gold-500` accent fills/icons; `gold-600` (#825E20) is the lightest gold for *text* — 5.5:1 on canvas, 5.1:1 on surface-2; `gold-400/500` never for text |
| Growth / success | `green-50…700` | progress, correct answers, success |
| Feedback | `danger`, `warning`, `info` (+ `-soft` backgrounds) | text on `bg-danger` is `text-danger-fg` (white in light, dark ink in dark); `warning` text on `warning-soft` is 4.6:1 |
| Primary button | `bg-primary text-primary-fg` | deep ink (inverts in dark) |

Radii: `rounded-xs 6 · sm 10 · md 14 · lg 20 · xl 28 · full`. Cards `rounded-lg`,
inputs `rounded-md`, buttons/chips `rounded-full`, hero media `rounded-xl`.

Shadows: `shadow-xs/sm/md/lg/gold` — warm, low-contrast. Cards default to
`shadow-sm`; hover lift to `shadow-md`; overlays `shadow-lg`.

Dark mode: `html.dark` swaps every variable. Never hardcode hex in components
(exceptions: art plates and the gold button text `#261F14`).

## 3. Typography

Fonts: **IBM Plex Sans Arabic** (Arabic + Latin inside Arabic) and **IBM Plex
Sans** (English UI). Weights 400 / 500 / 700 only — `font-semibold` (600) is not
loaded and would be synthesized; use `font-medium` or `font-bold`. Configured in
`src/app/fonts.js`: `display: swap`, no preload (one layout serves both
locales), and an Arabic-metric fallback face (`JaziraArabicFallback` in
globals.css) so Arabic lines don't re-wrap when the webfont swaps in.

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
- App pages: rendered inside the AppShell content column. Major pages open on
  `<PageHero>` (§7); workspace pages start with `<PageHeader>` (title, lead,
  actions, optional illustration `aside`).
- Grids: 12-col mental model. Typical desktop compositions:
  - **Page hero**: a wide image band across the page (`PageHero`), the title
    on it from md, actions and facts under it.
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
| `Button` | variants `primary · gold · secondary · soft · ghost · danger · link`; sizes `sm · md · lg · icon · icon-sm`; `href` makes a locale-aware link; `loading`; `iconStart`/`iconEnd` — pass the **LTR-forward** icon (`ArrowRight`, `ChevronRight`) as `iconEnd`; it is mirrored automatically in RTL. Directional glyphs passed as `iconStart` (Send, LogIn/LogOut, TrendingUp/Down, Reply, arrows) are mirrored too; override with `flipStart` |
| `Card` | tones `default · flat · tint · gold · green · ink · outline`; `interactive` hover lift. Titled section card: `title` (+ `titleId`, `titleAs`, `eyebrow`, `description`, `icon`, `action`, `divided`) renders a labelled `<section>` — use it instead of local Panel/SettingsCard/section-card copies |
| `Badge` | tones `neutral · gold · green · danger · warning · info · ink · outline` |
| `IconTile` | lucide icon on a tinted tile; `color` for subject colours |
| `Stat`, `StatList` | the KPI tile (`dt`/`dd` inside a `<dl>`): `size sm · md`, `surface flat · tint · plain`, optional inline `icon` + `tone`, `hint`, `ltr`, `muted` — use it instead of local Kpi/StatTile copies |
| `ProgressBar`, `ProgressRing` | |
| `Skeleton`, `SkeletonText`, `SkeletonCard`, `SkeletonGrid` | loading states |
| `EmptyState` | illustration/icon + title + why + action; `titleAs` sets the heading level (default `h2`; `h1` when the empty state is the whole page) |
| `Alert` | inline info/success/warning/danger |
| `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `Label` | forms (client) |
| `PasswordInput`, `Switch`, `Tabs`, `Dialog` (native `<dialog>`, `variant="sheet"`) | interactive (client) |
| `Breadcrumbs`, `PageHeader`, `SectionHeader`, `Section`, `Container`, `Grid` | layout. `PageHeader` variants `default · card · compact` with `eyebrow`, `meta`, `stats`, `actions`, `media` slots; its `<h1>` is the page title (t-h1, t-h3 for compact workspace pages) |
| `PremiumLock` | locked preview + upgrade CTA (never render real premium data behind it) |
| `Illustration` | library image by manifest id (next/image; `sizes`, `priority`, `aspect`, `fill`) |
| Brand: `Logo`, `IslandMark`, `AssistantAvatar` | src/components/brand |

Icons: `lucide-react`, 18–20px in UI, stroke default. Directional icons: always
use the LTR-forward glyph (`ArrowRight`, `ChevronRight`) with `className="flip-rtl"`
so it points in the reading direction in both languages (Button does this for
`iconEnd`). Never hand-pick `ArrowLeft` for "forward" in Arabic.

## 6. Motion

CSS only. `animate-in` (a 12px rise on mount — transform only, never opacity,
so hero headlines stay LCP candidates from the first frame), `animate-fade`,
`animate-scale` (secondary / below-the-fold content and overlays), `reveal`
(scroll-driven fade-up where supported; content is ALWAYS visible without JS).
Never fade in above-the-fold text. Durations 140/220/420ms, `ease-out`. Animate only `transform` and
`opacity`. Respect `prefers-reduced-motion` (automatic). No framer-motion in
new code.

## 7. Imagery (public/images/**) and brand

**Images.** Every major page has its own image — the place that represents that
page, in its own palette and light — generated as 1536×1024 originals,
quality-checked one by one and registered in `src/lib/assets.js` (the central
manifest: path, category, pages, purpose, language neutrality, responsive
`sizes`, priority, focus). The style follows the audience (3D cartoon for
elementary, stylized for middle school, realistic editorial for high school,
exams and the professional pages); the island appears only on brand pages. See
[ART_DIRECTION.md](ART_DIRECTION.md).

- **Never text in the art** — titles stay HTML, so one image serves Arabic and
  English, RTL and LTR (only elementary letter/number cards show glyphs, as their
  subject). No stock photography, no identifiable people.
- **Rendering**: `<Illustration id="…" />` (next/image with the library
  loader — pre-rendered WebP at 256–1536px, no runtime optimizer). Pass a
  `sizes` that matches the slot; `priority` only on a page's LCP hero;
  everything else is lazy. Art that only shows from a breakpoint up uses
  `ArtPreload` (media-gated preload, never fetched on phones).
- **Page heroes**: every major page opens on `PageHero` — the page's own
  image as a wide band (full-bleed under the marketing header, or across
  the app column) with a sea-wave cut into its lower edge. On wide screens (lg
  for the site band, xl in the app column) the title sits on a framed glass
  panel over the band's start side, and the band grows if the copy needs it;
  on smaller screens a solid title card rises over the band. Only the title
  copy sits on the image; actions and facts follow under the band.
- **Framing**: images are full-bleed — edge to edge in a panel (`fill` + a
  positioned parent), or in an `.art-frame` with a radius (a hairline drawn
  over the image) and an `aspect` crop around the manifest's `focus`. No padded
  plates around images; no huge empty areas.
- **Budgets**: 1536w ≤ 320 KB, 640w ≤ 100 KB (enforced by `npm run assets:check`).

**Brand.** The mark (the letter ج drawn as one stroke — horizon, sheltering
sea, golden island), the lockups and the icons are specified in
[BRAND.md](BRAND.md); in the UI use `Logo`, `IslandMark` and `AssistantAvatar`
(inline SVG, theme-aware).

## 8. Accessibility

WCAG 2.2 AA: text contrast ≥ 4.5:1 (ink-3 is the lightest text colour on
canvas), visible focus (global `:focus-visible` = 2px solid gold-700 outline
with 2px offset, 5.98:1; an outline so shadow/ring utilities can't hide it and
forced-colors mode keeps it; `var(--ring)` draws the same band for components
that need a box-shadow), focus never hidden under the fixed mobile tab bar
(scroll-padding), 44px targets, form
fields with labels + `aria-describedby`, `role="alert"` for errors, dialogs via
native `<dialog>`, decorative images `alt=""`, one `<h1>` per page, landmarks
(`header`, `nav`, `main`, `footer`), skip link in every shell.
