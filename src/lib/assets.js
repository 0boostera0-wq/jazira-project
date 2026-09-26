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

// Bump when the library is regenerated: renditions keep their file names, and
// the query gives every image a fresh URL past browser caches (the loader keeps it).
const LIBRARY_VERSION = 2;

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
  src: `/images/${category}/${name}.webp?v=${LIBRARY_VERSION}`,
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
  A("landing", "hero", "v2-landing-hero", { pages: ["/ (hero)"], purpose: "The island campus from the air over a turquoise sea — the platform's signature scene", sizes: SIZES.hero, priority: "lcp", focus: "50% 45%" }),
  A("landing", "curriculum", "v2-curriculum-library", { pages: ["/curriculum (hero)", "/ (curriculum section)", "/high-school (general track)", "/curriculum/high-school/grade-2|3/general (hero)"], purpose: "A library wall of colour-coded shelves — every stage and subject in one place", sizes: SIZES.heroSide, priority: "lcp" }),
  A("landing", "progress", "v2-progress-stones", { pages: ["/ (progress section)", "/dashboard (onboarding)", "/competitions (climb card)"], purpose: "Stepping stones across a forest stream — steady, visible progress", sizes: SIZES.card, focus: "50% 60%" }),
  A("landing", "privacy", "v2-privacy-pod", { pages: ["/ (privacy section)", "/privacy (hero)", "/settings (privacy)", "/forgot-password", "/reset-password"], purpose: "A frosted-glass private study room — your data kept safe", sizes: SIZES.card, focus: "50% 50%", priority: "lcp" }),
  A("landing", "about", "v2-about-dawn", { pages: ["/about (hero)"], purpose: "The island at dawn with a boat heading in — the story of Jazira", sizes: SIZES.heroSide, priority: "lcp" }),
  A("landing", "reviews", "v2-reviews-planes", { pages: ["/reviews (hero)"], purpose: "A flight of paper planes over the open sea — students' voices", sizes: SIZES.heroSide, priority: "lcp", focus: "50% 38%" }),

  // ── welcome (auth & onboarding) ──────────────────────────────────────────
  A("welcome", "sign-in", "v2-signin-bluehour", { pages: ["/sign-in", "auth pages (default art)"], purpose: "A window seat over the sea at blue hour — welcome back", sizes: SIZES.aside, priority: "lcp" }),
  A("welcome", "sign-up", "v2-signup-pier", { pages: ["/sign-up"], purpose: "A pier running out towards the island at sunrise — a new beginning", sizes: SIZES.aside, priority: "lcp" }),
  A("welcome", "profile-setup", "v2-profile-flatlay", { pages: ["/profile-setup"], purpose: "New study gear laid out on a bright desk — making the space your own", sizes: SIZES.aside, priority: "lcp" }),
  A("welcome", "verify-email", "v2-verify-mailbox", { pages: ["/auth/verify-email"], purpose: "A letter waiting in a wall mailbox — a message on its way", sizes: SIZES.aside, priority: "lcp" }),
  A("welcome", "dashboard", "v2-dashboard-lake", { pages: ["/dashboard (welcome card)"], purpose: "Morning mist over a lake from the study window — a fresh study day", sizes: SIZES.card, focus: "50% 55%" }),

  // ── elementary (grades 1–6): toy-like, colourful ─────────────────────────
  A("elementary", "hero", "v2-elementary-hero", { pages: ["/elementary (hero)", "/ (stage selector)", "/curriculum (elementary stage)", "/search (stage results)"], purpose: "Children building, reading and exploring in a bright classroom", sizes: SIZES.heroSide, priority: "lcp", focus: "50% 40%" }),
  A("elementary", "math", "v2-elem-math", { pages: ["/elementary (maths)", "elementary maths subject"], purpose: "Big toy numbers, an abacus and shapes to count and sort" }),
  A("elementary", "science", "v2-elem-science", { pages: ["/elementary (science)", "elementary science subject"], purpose: "A magnifying glass on a ladybird, a seedling and a toy rocket" }),
  A("elementary", "reading", "v2-elem-arabic", { pages: ["/elementary (activities: reading)", "elementary Arabic subject"], purpose: "Toy Arabic letters and an open picture book" }),
  A("elementary", "writing", "v2-elem-writing", { pages: ["/elementary (activities: writing)"], purpose: "A rainbow of loops traced in a notebook with crayons" }),
  A("elementary", "games", "v2-elem-games", { pages: ["/elementary (learning games)"], purpose: "Puzzle pieces, a learning tablet and stacking toys — learning through play" }),
  A("elementary", "english", "v2-elem-english", { pages: ["elementary English subject"], purpose: "Toy letters A B C with a globe and a toy plane" }),
  A("elementary", "islamic", "v2-elem-islamic", { pages: ["elementary Quran & Islamic studies subjects"], purpose: "A Quran stand, a lantern and a prayer rug — a calm, respectful corner" }),
  A("elementary", "art", "jazira-elementary-art-v1", { pages: ["elementary art subject"], purpose: "Colour, brushes and creativity" }),

  // ── middle (grades 7–9): refined stylised 3D ─────────────────────────────
  A("middle", "hero", "v2-middle-hero-cA", { pages: ["/middle (hero)", "/ (stage selector)", "/curriculum (middle stage)", "/search (stage results)"], purpose: "Students building a robot in a bright maker lab", sizes: SIZES.heroSide, priority: "lcp", focus: "45% 48%" }),
  A("middle", "math", "jazira-middle-math-v3", { pages: ["/middle (maths)", "middle maths subject"], purpose: "Geometry and measurement, hands-on" }),
  A("middle", "science", "jazira-middle-science-v1", { pages: ["/middle (science)", "middle science subject"], purpose: "Observing and experimenting" }),
  A("middle", "chemistry", "jazira-middle-chemistry-v1", { pages: ["/middle (chemistry)"], purpose: "First experiments with matter" }),
  A("middle", "physics", "jazira-middle-physics-v1", { pages: ["/middle (physics)"], purpose: "Forces, light and energy" }),
  A("middle", "arabic", "jazira-middle-arabic-v1", { pages: ["middle Arabic subject"], purpose: "Reading, writing and the craft of language" }),

  // ── high school: realistic, editorial ──────────────────────────────────────
  A("high-school", "hero", "v2-high-school-hero-b", { pages: ["/high-school (hero)", "/ (stage selector)", "/curriculum (high-school stage)", "/search (stage results)"], purpose: "A multi-storey library atrium in the morning — ambition and depth", sizes: SIZES.heroSide, priority: "lcp" }),
  A("high-school", "math", "jazira-hs-math-v1", { pages: ["/high-school (maths)", "high-school maths subject", "Tahsili maths section"], purpose: "Functions, curves and precision" }),
  A("high-school", "physics", "jazira-hs-physics-v1", { pages: ["/high-school (physics)", "high-school physics subject", "Tahsili physics section"], purpose: "Motion, waves and the cosmos" }),
  A("high-school", "chemistry", "jazira-hs-chemistry-v1", { pages: ["/high-school (chemistry)", "high-school chemistry subject", "Tahsili chemistry section"], purpose: "Molecules and reactions" }),
  A("high-school", "biology", "jazira-hs-biology-v1", { pages: ["/high-school (biology)", "high-school biology subject", "Tahsili biology section"], purpose: "Life, cells and growth" }),
  A("high-school", "computer-science", "jazira-hs-computer-science-v1", { pages: ["/high-school (CS & engineering track)", "/curriculum/high-school/grade-2|3/cs-eng (hero)", "computing subjects"], purpose: "Computing and engineering" }),
  A("high-school", "business", "jazira-hs-business-v1", { pages: ["/high-school (business track)", "/curriculum/high-school/grade-2|3/business (hero)", "business subjects"], purpose: "Enterprise, finance and management" }),
  A("high-school", "health", "jazira-hs-health-v1", { pages: ["/high-school (health & life track)", "/curriculum/high-school/grade-2|3/health (hero)", "health subjects"], purpose: "Health, life sciences and fitness" }),
  A("high-school", "sharia", "jazira-hs-sharia-v1", { pages: ["/high-school (sharia track)", "/curriculum/high-school/grade-2|3/sharia (hero)", "Islamic studies subjects"], purpose: "Islamic sciences and scholarship" }),

  // ── aptitude (Qudurat) & achievement (Tahsili) ───────────────────────────
  A("aptitude", "hero", "v2-aptitude-gallery", { pages: ["/exams/aptitude (hero)", "/ (stage selector)"], purpose: "Geometric sculptures and pattern tiles in a gallery — reasoning and challenge", sizes: SIZES.heroSide, priority: "lcp", focus: "50% 62%" }),
  A("aptitude", "quantitative", "jazira-aptitude-quantitative-v1", { pages: ["/exams/aptitude (quantitative section)"], purpose: "Quantities, comparison and logic" }),
  A("aptitude", "verbal", "jazira-aptitude-verbal-v1", { pages: ["/exams/aptitude (verbal section)", "Arabic literature subjects"], purpose: "Words, meaning and reading" }),
  A("achievement", "hero", "v2-achievement-lab", { pages: ["/exams/achievement (hero)", "/ (stage selector)"], purpose: "A modern science lab: microscope, glassware and a DNA model", sizes: SIZES.heroSide, priority: "lcp" }),
  A("achievement", "review", "jazira-achievement-review-v1", { pages: ["exam section pages", "exam review list", "/assistant (quiz me)", "notifications rail"], purpose: "Revision cards and focused review" }),
  A("achievement", "performance", "jazira-achievement-performance-v1", { pages: ["/exams/history (empty analytics)"], purpose: "Measuring strengths over time" }),

  // ── exams ────────────────────────────────────────────────────────────────
  A("exams", "hero", "v2-exams-hall-b", { pages: ["/exams (hero)", "/ (exam practice section)"], purpose: "A quiet exam hall, a paper and pencil on the front desk", sizes: SIZES.heroSide, priority: "lcp" }),
  A("exams", "timed", "jazira-exams-timed-v1", { pages: ["exam section pages", "exam runner"], purpose: "Time, pace and focus" }),
  A("exams", "history", "v2-history-observatory", { pages: ["/exams/history (hero)"], purpose: "An observatory under star trails — tracing your results over time", sizes: SIZES.card, priority: "lcp" }),
  A("exams", "results", "v2-exam-results", { pages: ["exam results"], purpose: "A finished answer sheet, pencil and eraser — a well-earned pause", sizes: SIZES.card }),

  // ── community ────────────────────────────────────────────────────────────
  A("community", "hero", "v2-community-commons", { pages: ["/community (hero)", "/ (community section)"], purpose: "A green atrium where students study together (distant figures)", sizes: SIZES.panel, priority: "lcp" }),
  A("community", "achievements", "v2-achievements-display", { pages: ["/achievements (hero)"], purpose: "Trophies and medals in a lit display case — a hall of honour", sizes: SIZES.heroSide, priority: "lcp" }),
  A("community", "competitions", "v2-competitions-stage", { pages: ["/competitions (hero)"], purpose: "A podium under stage lights and confetti", sizes: SIZES.panel, priority: "lcp", focus: "50% 60%" }),
  A("community", "streak", "jazira-community-streak-v1", { pages: ["/achievements (streak card)"], purpose: "A lantern kept alight, day after day", sizes: SIZES.thumb }),
  A("community", "conversation", "jazira-community-conversation-v1", { pages: ["/chat (no conversation)", "/community (empty feed)", "/tags/[tag] (empty)"], purpose: "Messages carried between islands" }),

  // ── assistant ────────────────────────────────────────────────────────────
  A("assistant", "hero", "v2-assistant-orb", { pages: ["/assistant (welcome)", "/ (assistant section)"], purpose: "A glowing orb of ideas over a desk at night — the AI study companion", sizes: SIZES.panel, priority: "lcp", focus: "42% 26%" }),
  A("assistant", "explain", "jazira-assistant-explain-v1", { pages: ["/assistant (explain)"], purpose: "Ideas made clear" }),
  A("assistant", "summarize", "jazira-assistant-summarize-v1", { pages: ["/assistant (summarise)", "exam results (explanations)"], purpose: "The essentials of a lesson, distilled" }),
  A("assistant", "plan", "jazira-assistant-plan-v1", { pages: ["/assistant (plan)", "/middle (study plan)", "/dashboard (assistant card)"], purpose: "A study plan taking shape" }),

  // ── subscriptions & payment ──────────────────────────────────────────────
  A("subscriptions", "hero", "v2-subscriptions-lounge-b", { pages: ["/subscriptions (hero)"], purpose: "A premium reading lounge at blue hour", sizes: SIZES.heroSide, priority: "lcp", focus: "50% 58%" }),
  A("subscriptions", "features", "jazira-premium-study-v2", { pages: ["/subscriptions (features)"], purpose: "Premium tools for serious study", sizes: SIZES.card }),
  A("subscriptions", "premium", "jazira-subscriptions-premium-v1", { pages: ["/subscriptions (Elite plan card)", "upgrade dialog", "/settings (subscription)", "activation status (checkout return)", "included-features card"], purpose: "The golden key to premium" }),
  A("payment", "checkout", "v2-checkout-vault", { pages: ["/checkout (hero)"], purpose: "A steel vault door and a key on a white plinth — a secure payment", sizes: SIZES.heroSide, priority: "lcp", focus: "55% 62%" }),
  A("payment", "success", "v2-success-terrace", { pages: ["/checkout/success (hero)"], purpose: "Glass doors opening onto a sunny terrace — welcome to premium", sizes: SIZES.heroSide, priority: "lcp" }),

  // ── support & system states ──────────────────────────────────────────────
  A("support", "hero", "v2-support-desk", { pages: ["/support (hero)", "legal pages (help card)"], purpose: "A calm, bright help desk with a laptop and headset — we're here to help", sizes: SIZES.heroSide, priority: "lcp" }),
  A("support", "contact", "v2-contact-flatlay", { pages: ["/contact (hero)"], purpose: "Envelopes, paper and a pen on linen — write to us", sizes: SIZES.heroSide, priority: "lcp" }),
  A("support", "faq", "v2-faq-reading-room", { pages: ["/faq (hero)"], purpose: "A quiet reference reading room — every answer in its place", sizes: SIZES.heroSide, priority: "lcp" }),
  A("support", "empty", "jazira-state-empty-v1", { pages: ["empty states (EmptyState)", "leaderboard, subject explorer, curriculum pending, notifications, reviews"], purpose: "A quiet mooring — nothing here yet" }),
  A("support", "not-found", "jazira-state-not-found-v1", { pages: ["404 page", "profile not found", "exam attempt not found", "/search (no results)"], purpose: "A message in a bottle — off the map" }),
  A("support", "offline", "jazira-state-offline-v1", { pages: ["error & unavailable states (ErrorView)", "community, notifications, reviews, exam runner"], purpose: "Sails down, waiting for the wind" }),

  // ── legal ────────────────────────────────────────────────────────────────
  A("legal", "hero", "v2-legal-library", { pages: ["/terms (hero)", "/refund (hero)", "/acceptable-use (hero)", "/community-guidelines (hero)"], purpose: "A law-library desk in deep green and walnut — calm and professional", sizes: SIZES.heroSide, priority: "lcp" }),

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
  B("jazira-og.jpg", { dir: "/og", pages: ["Open Graph / Twitter card (every page)"], purpose: "Social preview: the island campus + the bilingual lockup" }),
];

export const ASSETS = Object.fromEntries(LIST.map((a) => [a.id, a]));
export const ASSET_LIST = LIST;

/** Look up an asset by id ("aptitude.hero"). Throws in development on unknown ids. */
export function asset(id) {
  const a = ASSETS[id];
  if (!a && process.env.NODE_ENV !== "production") throw new Error(`[assets] unknown asset "${id}"`);
  return a || ASSETS["support.empty"];
}
