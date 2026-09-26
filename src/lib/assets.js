// ============================================================================
// Jazira image library — the central asset manifest.
//
// One entry per image. Raster art is text-free (every title stays real HTML,
// so one image serves Arabic and English), follows docs/ART_DIRECTION.md, and
// is rendered by scripts/process-illustrations.mjs from its original
// (`source`, kept outside the repo) into public/images/<category>/<name>-<w>.webp.
// `src` is the logical path the next/image loader (src/lib/image-loader.js)
// resolves to those renditions — render art with <Illustration id="…" />,
// never by hard-coding a path.
//
// Fields
//   id / name        "<category>.<name>" — what components reference
//   src              logical path (see above)
//   category         public/images/<category>/
//   pages            where the image appears (keep accurate when moving art;
//                    `node scripts/check-assets.mjs --usage` lists real references)
//   purpose          what the image says on those pages
//   languageNeutral  true: no text in the artwork, identical in ar/en and RTL/LTR
//   sizes            default responsive `sizes` (callers override per layout)
//   priority         "lcp" — the page hero on at least one route (pass `priority`
//                    there, and only there); "lazy" — always below the fold or small
//   focus            object-position used when a layout crops the 3:2 frame
//   color            average colour, shown while the image loads (generated)
//
// The brand kit (kind "brand": mark, lockups, icons, social image) is listed at
// the end. Those files are served as-is; the interface draws the same artwork
// inline through src/components/brand (see docs/BRAND.md).
// ============================================================================
import COLORS from "./asset-colors.js";

// Responsive `sizes` presets (px values match the layout max-widths).
export const SIZES = {
  hero: "(min-width: 1280px) 620px, (min-width: 1024px) 48vw, 100vw",
  heroSide: "(min-width: 1280px) 520px, (min-width: 768px) 42vw, 100vw",
  panel: "(min-width: 1024px) 50vw, 100vw",
  card: "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  // full-height auth panel: object-cover over a tall frame is as wide as 1.5× its height
  aside: "(min-width: 1024px) calc(150vh - 48px), 0px",
  spot: "(min-width: 640px) 320px, 60vw",
  thumb: "160px",
};

const A = (category, name, source, { pages, purpose, sizes = SIZES.spot, priority = "lazy", focus = "50% 50%" }) => ({
  id: `${category}.${name}`,
  name: `${category}/${name}`,
  src: `/images/${category}/${name}.webp`,
  kind: "raster",
  category,
  source,
  width: 1536,
  height: 1024,
  pages,
  purpose,
  languageNeutral: true,
  sizes,
  priority,
  focus,
  color: COLORS[`${category}.${name}`] || "#E8DCC4",
});

// Brand-kit file (served as-is). `lang` marks the lockups whose wordmark is a script.
const B = (file, { pages, purpose, lang, dir = "/images/brand" }) => ({
  id: `brand.${file.replace(/\.\w+$/, "")}`,
  name: `brand/${file}`,
  src: `${dir}/${file}`,
  kind: "brand",
  category: "brand",
  pages,
  purpose,
  languageNeutral: !lang,
  lang,
  priority: "lazy",
});

const LIST = [
  // ── landing & public site ────────────────────────────────────────────────
  A("landing", "hero", "jazira-landing-hero-v1", { pages: ["/ (hero)"], purpose: "The island of learning — the platform's signature scene", sizes: SIZES.hero, priority: "lcp", focus: "58% 50%" }),
  A("landing", "curriculum", "jazira-curriculum-hero-v1", { pages: ["/curriculum (hero)", "/ (curriculum section)", "/high-school (general track)"], purpose: "The great library hall — every stage and subject in one place", sizes: SIZES.heroSide, priority: "lcp" }),
  A("landing", "progress", "jazira-progress-path-v1", { pages: ["/ (progress section)", "/dashboard (onboarding)", "/competitions (climb card)"], purpose: "A lantern-lit path up the hill — steady, visible progress", sizes: SIZES.card, focus: "50% 60%" }),
  A("landing", "privacy", "jazira-privacy-harbor-v1", { pages: ["/ (privacy section)", "/privacy", "/settings (privacy)", "/forgot-password", "/reset-password"], purpose: "A sheltered harbor under the lighthouse — safety and care", sizes: SIZES.card, focus: "62% 50%" }),
  A("landing", "about", "jazira-about-island-v1", { pages: ["/about (hero)"], purpose: "The whole island, stage by stage — the story of Jazira", sizes: SIZES.heroSide, priority: "lcp" }),
  A("landing", "reviews", "jazira-reviews-lanterns-v1", { pages: ["/reviews (hero)"], purpose: "Lanterns rising over the sea — students' voices", sizes: SIZES.heroSide, priority: "lcp" }),

  // ── welcome (auth & onboarding) ──────────────────────────────────────────
  A("welcome", "sign-in", "jazira-sign-in-nook-v1", { pages: ["/sign-in", "auth pages (default art)"], purpose: "A window seat in the tower at dusk — welcome back", sizes: SIZES.aside, priority: "lcp" }),
  A("welcome", "sign-up", "jazira-sign-up-arrival-v1", { pages: ["/sign-up"], purpose: "Arriving at the island's open gate — a new beginning", sizes: SIZES.aside, priority: "lcp" }),
  A("welcome", "profile-setup", "jazira-profile-setup-desk-v1", { pages: ["/profile-setup"], purpose: "A fresh desk being set up — making the space your own", sizes: SIZES.aside, priority: "lcp" }),
  A("welcome", "verify-email", "jazira-verify-email-letter-v1", { pages: ["/auth/verify-email"], purpose: "A sealed letter on the windowsill — a message on its way", sizes: SIZES.aside, priority: "lcp" }),
  A("welcome", "dashboard", "jazira-dashboard-sunrise-v1", { pages: ["/dashboard (welcome card)"], purpose: "Sunrise over the island from the tower — a fresh study day", sizes: SIZES.card, focus: "50% 55%" }),

  // ── elementary (grades 1–6): toy-like, colourful ─────────────────────────
  A("elementary", "hero", "jazira-elementary-hero-v1", { pages: ["/elementary (hero)", "/ (stage selector)", "/curriculum (elementary stage)", "/search (stage results)"], purpose: "A playful garden classroom by the sea", sizes: SIZES.heroSide, priority: "lcp" }),
  A("elementary", "math", "jazira-elementary-math-v1", { pages: ["/elementary (maths)", "elementary maths subject"], purpose: "Counting and shapes to play with" }),
  A("elementary", "science", "jazira-elementary-science-v1", { pages: ["/elementary (science)", "elementary science subject"], purpose: "Looking closely at nature" }),
  A("elementary", "reading", "jazira-elementary-reading-v1", { pages: ["/elementary (activities: reading)", "elementary Arabic subject"], purpose: "A picture book full of adventures" }),
  A("elementary", "writing", "jazira-elementary-writing-v1", { pages: ["/elementary (activities: writing)"], purpose: "First strokes, crayons and practice" }),
  A("elementary", "games", "jazira-elementary-games-v1", { pages: ["/elementary (learning games)"], purpose: "Learning through play" }),
  A("elementary", "english", "jazira-elementary-english-v1", { pages: ["elementary English subject"], purpose: "A friendly window on the wider world" }),
  A("elementary", "islamic", "jazira-elementary-islamic-v1", { pages: ["elementary Quran & Islamic studies subjects"], purpose: "A calm, respectful study corner" }),
  A("elementary", "art", "jazira-elementary-art-v1", { pages: ["elementary art subject"], purpose: "Colour, brushes and creativity" }),

  // ── middle (grades 7–9): refined stylised 3D ─────────────────────────────
  A("middle", "hero", "jazira-middle-hero-v2", { pages: ["/middle (hero)", "/ (stage selector)", "/curriculum (middle stage)", "/search (stage results)"], purpose: "Curious students at work in the library lab", sizes: SIZES.heroSide, priority: "lcp" }),
  A("middle", "math", "jazira-middle-math-v3", { pages: ["/middle (maths)", "middle maths subject"], purpose: "Geometry and measurement, hands-on" }),
  A("middle", "science", "jazira-middle-science-v1", { pages: ["/middle (science)", "middle science subject"], purpose: "Observing and experimenting" }),
  A("middle", "chemistry", "jazira-middle-chemistry-v1", { pages: ["/middle (chemistry)"], purpose: "First experiments with matter" }),
  A("middle", "physics", "jazira-middle-physics-v1", { pages: ["/middle (physics)"], purpose: "Forces, light and energy" }),
  A("middle", "arabic", "jazira-middle-arabic-v1", { pages: ["middle Arabic subject"], purpose: "Reading, writing and the craft of language" }),

  // ── high school: premium, cinematic ──────────────────────────────────────
  A("high-school", "hero", "jazira-high-school-hero-v2", { pages: ["/high-school (hero)", "/ (stage selector)", "/curriculum (high-school stage)", "/search (stage results)"], purpose: "Looking out to the future from the library terrace", sizes: SIZES.heroSide, priority: "lcp" }),
  A("high-school", "math", "jazira-hs-math-v1", { pages: ["/high-school (maths)", "high-school maths subject", "Tahsili maths section"], purpose: "Functions, curves and precision" }),
  A("high-school", "physics", "jazira-hs-physics-v1", { pages: ["/high-school (physics)", "high-school physics subject", "Tahsili physics section"], purpose: "Motion, waves and the cosmos" }),
  A("high-school", "chemistry", "jazira-hs-chemistry-v1", { pages: ["/high-school (chemistry)", "high-school chemistry subject", "Tahsili chemistry section"], purpose: "Molecules and reactions" }),
  A("high-school", "biology", "jazira-hs-biology-v1", { pages: ["/high-school (biology)", "high-school biology subject", "Tahsili biology section"], purpose: "Life, cells and growth" }),
  A("high-school", "computer-science", "jazira-hs-computer-science-v1", { pages: ["/high-school (CS & engineering track)", "computing subjects"], purpose: "Computing and engineering" }),
  A("high-school", "business", "jazira-hs-business-v1", { pages: ["/high-school (business track)", "business subjects"], purpose: "Enterprise, finance and management" }),
  A("high-school", "health", "jazira-hs-health-v1", { pages: ["/high-school (health & life track)", "health subjects"], purpose: "Health, life sciences and fitness" }),
  A("high-school", "sharia", "jazira-hs-sharia-v1", { pages: ["/high-school (sharia track)", "Islamic studies subjects"], purpose: "Islamic sciences and scholarship" }),

  // ── aptitude (Qudurat) & achievement (Tahsili) ───────────────────────────
  A("aptitude", "hero", "jazira-aptitude-hero-v1", { pages: ["/exams/aptitude (hero)", "/ (stage selector)"], purpose: "Balance, pattern and reasoning in stone and light", sizes: SIZES.heroSide, priority: "lcp" }),
  A("aptitude", "quantitative", "jazira-aptitude-quantitative-v1", { pages: ["/exams/aptitude (quantitative section)"], purpose: "Quantities, comparison and logic" }),
  A("aptitude", "verbal", "jazira-aptitude-verbal-v1", { pages: ["/exams/aptitude (verbal section)", "Arabic literature subjects"], purpose: "Words, meaning and reading" }),
  A("achievement", "hero", "jazira-achievement-hero-v1", { pages: ["/exams/achievement (hero)", "/ (stage selector)"], purpose: "Four science pavilions around one plaza", sizes: SIZES.heroSide, priority: "lcp" }),
  A("achievement", "review", "jazira-achievement-review-v1", { pages: ["exam section pages", "exam review list", "/assistant (quiz me)", "notifications rail"], purpose: "Revision cards and focused review" }),
  A("achievement", "performance", "jazira-achievement-performance-v1", { pages: ["/exams/history (empty analytics)"], purpose: "Measuring strengths over time" }),

  // ── exams ────────────────────────────────────────────────────────────────
  A("exams", "hero", "jazira-exams-hero-v1", { pages: ["/exams (hero)", "/ (exam practice section)"], purpose: "A calm exam desk in the library — practice with confidence", sizes: SIZES.heroSide, priority: "lcp" }),
  A("exams", "timed", "jazira-exams-timed-v1", { pages: ["exam section pages", "exam runner"], purpose: "Time, pace and focus" }),
  A("exams", "history", "jazira-exams-observatory-v1", { pages: ["/exams/history (hero)"], purpose: "The observatory — tracing your results over time", sizes: SIZES.card }),
  A("exams", "results", "jazira-exam-results-v1", { pages: ["exam results"], purpose: "A finished paper and a well-earned pause", sizes: SIZES.card }),

  // ── community ────────────────────────────────────────────────────────────
  A("community", "hero", "jazira-community-hero-v2", { pages: ["/community (header)", "/ (community section)"], purpose: "Students studying together in the courtyard", sizes: SIZES.panel, priority: "lcp" }),
  A("community", "achievements", "jazira-achievements-hall-v1", { pages: ["/achievements (hero)"], purpose: "A hall of honour for badges and milestones", sizes: SIZES.heroSide, priority: "lcp" }),
  A("community", "competitions", "jazira-competitions-regatta-v1", { pages: ["/competitions (header)"], purpose: "A friendly regatta around the island", sizes: SIZES.panel, priority: "lcp" }),
  A("community", "streak", "jazira-community-streak-v1", { pages: ["/achievements (streak card)"], purpose: "A lantern kept alight, day after day", sizes: SIZES.thumb }),
  A("community", "conversation", "jazira-community-conversation-v1", { pages: ["/chat (no conversation)", "/community (empty feed)", "/tags/[tag] (empty)"], purpose: "Messages carried between islands" }),

  // ── assistant ────────────────────────────────────────────────────────────
  A("assistant", "hero", "jazira-assistant-hero-v1", { pages: ["/assistant (welcome)", "/ (assistant section)"], purpose: "The guiding light in the tower study", sizes: SIZES.panel, priority: "lcp" }),
  A("assistant", "explain", "jazira-assistant-explain-v1", { pages: ["/assistant (explain)"], purpose: "Ideas made clear" }),
  A("assistant", "summarize", "jazira-assistant-summarize-v1", { pages: ["/assistant (summarise)", "exam results (explanations)"], purpose: "The essentials of a lesson, distilled" }),
  A("assistant", "plan", "jazira-assistant-plan-v1", { pages: ["/assistant (plan)", "/middle (study plan)", "/dashboard (assistant card)"], purpose: "A study plan taking shape" }),

  // ── subscriptions & payment ──────────────────────────────────────────────
  A("subscriptions", "hero", "jazira-subscriptions-hall-v1", { pages: ["/subscriptions (Elite plan card, the page's hero)"], purpose: "The doors of the premium reading hall opening", sizes: SIZES.heroSide, priority: "lcp" }),
  A("subscriptions", "features", "jazira-premium-study-v2", { pages: ["/subscriptions (features)"], purpose: "Premium tools for serious study", sizes: SIZES.card }),
  A("subscriptions", "premium", "jazira-subscriptions-premium-v1", { pages: ["upgrade dialog", "/settings (subscription)", "activation status (checkout return)"], purpose: "The golden key to premium" }),
  A("payment", "checkout", "jazira-checkout-secure-v1", { pages: ["/checkout"], purpose: "A secure, sealed transaction", sizes: SIZES.heroSide, priority: "lcp" }),
  A("payment", "success", "jazira-checkout-success-v1", { pages: ["/checkout/success"], purpose: "The gates open — welcome to premium", sizes: SIZES.heroSide, priority: "lcp" }),

  // ── support & system states ──────────────────────────────────────────────
  A("support", "hero", "jazira-support-lighthouse-v1", { pages: ["/support (hero)", "legal pages (help card)"], purpose: "The lighthouse guiding a boat home", sizes: SIZES.heroSide, priority: "lcp" }),
  A("support", "contact", "jazira-contact-post-v1", { pages: ["/contact"], purpose: "Paper planes leaving the post pavilion", sizes: SIZES.heroSide, priority: "lcp" }),
  A("support", "faq", "jazira-faq-catalog-v1", { pages: ["/faq (hero)"], purpose: "A card catalogue — every answer in its place", sizes: SIZES.heroSide, priority: "lcp" }),
  A("support", "empty", "jazira-state-empty-v1", { pages: ["empty states (EmptyState)", "leaderboard, subject explorer, curriculum pending, notifications, reviews"], purpose: "A quiet mooring — nothing here yet" }),
  A("support", "not-found", "jazira-state-not-found-v1", { pages: ["404 page", "profile not found", "exam attempt not found", "/search (no results)"], purpose: "A message in a bottle — off the map" }),
  A("support", "offline", "jazira-state-offline-v1", { pages: ["error & unavailable states (ErrorView)", "community, notifications, reviews, exam runner"], purpose: "Sails down, waiting for the wind" }),

  // ── legal ────────────────────────────────────────────────────────────────
  A("legal", "hero", "jazira-legal-scroll-v1", { pages: ["/terms", "/refund", "/acceptable-use", "/community-guidelines"], purpose: "A sealed charter on the library desk", sizes: SIZES.heroSide }),

  // ── brand kit (built by the brand-kit tool, see docs/BRAND.md; the UI draws
  //    the same artwork inline via src/components/brand) ─────────────────────
  B("jazira-mark.svg", { pages: ["brand kit — light backgrounds"], purpose: "Primary mark: the letter ج as one stroke with the gold island" }),
  B("jazira-mark-on-dark.svg", { pages: ["brand kit — dark backgrounds"], purpose: "Primary mark, ivory for dark backgrounds" }),
  B("jazira-icon.svg", { pages: ["favicon (same artwork as src/app/icon.svg)", "brand kit"], purpose: "Small icon: ivory mark on the teal tile" }),
  B("jazira-icon-192.png", { pages: ["web app manifest"], purpose: "App icon 192px" }),
  B("jazira-icon-512.png", { pages: ["web app manifest", "Organization logo (JSON-LD)"], purpose: "App icon 512px" }),
  B("jazira-icon-maskable-512.png", { pages: ["web app manifest (maskable)"], purpose: "Maskable app icon, mark inside the safe zone" }),
  B("jazira-lockup-ar.svg", { lang: "ar", pages: ["brand kit — Arabic lockup, light backgrounds"], purpose: "Full lockup: mark + «جزيرة»" }),
  B("jazira-lockup-ar-on-dark.svg", { lang: "ar", pages: ["brand kit — Arabic lockup, dark backgrounds"], purpose: "Full lockup: mark + «جزيرة», ivory" }),
  B("jazira-lockup-en.svg", { lang: "en", pages: ["brand kit — English lockup, light backgrounds"], purpose: "Full lockup: mark + «Jazira»" }),
  B("jazira-lockup-en-on-dark.svg", { lang: "en", pages: ["brand kit — English lockup, dark backgrounds"], purpose: "Full lockup: mark + «Jazira», ivory" }),
  B("jazira-og.jpg", { dir: "/og", pages: ["Open Graph / Twitter card (every page)"], purpose: "Social preview: the island painting + the bilingual lockup" }),
];

export const ASSETS = Object.fromEntries(LIST.map((a) => [a.id, a]));
export const ASSET_LIST = LIST;

/** Look up an asset by id ("aptitude.hero"). Throws in development on unknown ids. */
export function asset(id) {
  const a = ASSETS[id];
  if (!a && process.env.NODE_ENV !== "production") throw new Error(`[assets] unknown asset "${id}"`);
  return a || ASSETS["support.empty"];
}
