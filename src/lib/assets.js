// ============================================================================
// Jazira illustration library — manifest.
//
// Every illustration lives in /public/images/<group>/<name>.svg, is text-free
// (all copy is real HTML next to it), hand-authored vector art in the Jazira
// style (see docs/DESIGN_SYSTEM.md → Illustration), optimised with SVGO.
// SVGs are resolution-independent and small, so they are served as-is (no
// raster variants needed) and lazy-loaded below the fold.
//
// `usedIn` documents where each asset appears so future developers can find,
// replace or retire art safely. Keep it accurate when you move an image:
// `node scripts/check-assets.mjs --usage` lists the files that really
// reference each id. `npm run assets:check` verifies every entry exists, is
// referenced and documents its use.
// ============================================================================

const A = (group, name, width, height, usedIn, brief) => ({
  id: `${group}.${name}`,
  src: `/images/${group}/${name}.svg`,
  width,
  height,
  usedIn,
  brief,
});

const LIST = [
  // ── brand ────────────────────────────────────────────────────────────────
  A("brand", "island-hero", 1200, 1000, ["/ (landing hero)"], "Signature scene: a lush stylised island at golden hour on calm turquoise-sage water. A terraced hill whose layers read as stacked books, a slim study tower (lighthouse-like) with a warm lit window, two palms, a tiny sailboat, soft sun disc and a few rounded clouds. Rich but calm; generous negative space at the top."),
  A("brand", "island-education", 800, 600, ["/about", "/curriculum (hub hero)", "/sign-up"], "Island with a small open-air school pavilion (arches), a path of stepping stones leading to it, books stacked like terraces, a palm and a flag. Morning light."),
  A("brand", "island-study", 800, 600, ["/dashboard (welcome card)", "/sign-in", "auth shell (default art)"], "Cosy study nook on the island: a wooden desk under a palm canopy, desk lamp glowing, open notebook, mug, stack of books, a small plant. Evening warmth."),
  A("brand", "island-ai", 800, 600, ["/ (assistant section)", "/assistant (welcome)"], "The Jazira assistant (round friendly robot with a palm-leaf antenna) standing on a small island, gentle constellation lines connecting floating book / lightbulb / atom icons above it."),
  A("brand", "island-achievement", 800, 600, ["/achievements (hero, climb card)", "/profile-setup"], "An island summit reached by a winding stepped path; a pennant flag and a small trophy at the top, stars twinkling, a proud small character mid-climb seen from behind."),
  A("brand", "assistant-mascot", 512, 512, ["assistant avatar (chat, dashboard, landing)"], "Circular mascot badge: the Jazira assistant — a round, friendly robot head (cream body, gold rim, sage-green visor with two soft glowing eyes and a small smile), a palm-leaf antenna, inside a champagne circle with a thin gold ring. Must read clearly at 40px."),

  // ── landing ──────────────────────────────────────────────────────────────
  A("landing", "curriculum", 800, 600, ["/ (curriculum feature)", "stage pages (tracks explorer)"], "Books arranged as a gentle staircase with ribbon bookmarks, a tablet leaning on them showing abstract cards, a pencil cup."),
  A("landing", "exams", 800, 600, ["/ (exams feature)", "/exams (hero)"], "Exam sheet with abstract lines and a bubble-answer grid, three check marks, a stopwatch, a sharpened pencil, a small gold star."),
  A("landing", "community", 800, 600, ["/ (community feature)"], "Three stylised students (simple rounded forms, no facial detail beyond dots) around a round table with laptops and books; soft speech bubbles containing only dots / hearts."),
  A("landing", "progress", 800, 600, ["/ (progress section)", "/dashboard (onboarding panel)"], "Bar chart whose bars sprout leaves like plants growing, a rising line with a star at its peak, a small watering can."),
  A("landing", "privacy", 800, 600, ["/ (trust section)", "/privacy", "/forgot-password", "/reset-password", "auth tips", "/settings (privacy section, settings layout)"], "A calm shield with a keyhole, layered like a soft badge, surrounded by a palm leaf and a small island; conveys safety and care."),

  // ── elementary ───────────────────────────────────────────────────────────
  A("elementary", "numbers", 640, 480, ["/elementary (numbers)", "/curriculum math subject"], "A colourful bead abacus, counting pebbles and a friendly shape family (circle, triangle, square) — no digits."),
  A("elementary", "reading", 640, 480, ["/elementary (games rail: reading)"], "A small child character (simple, stylised) reading a big open book under a palm tree, little birds nearby."),
  A("elementary", "writing", 640, 480, ["/elementary (games rail: writing)"], "A ruled notebook with a pencil drawing a single smooth curly line, an eraser, a ruler and a star sticker."),
  A("elementary", "science", 640, 480, ["/elementary (science)", "/curriculum science subject"], "A magnifying glass over a leaf with a ladybug, a sprouting seed in a pot, a small beaker."),
  A("elementary", "games", 640, 480, ["/elementary (learning games)"], "Colourful puzzle pieces fitting together, a tablet with abstract game tiles, confetti dots."),
  A("elementary", "classroom", 800, 600, ["/elementary (hero)", "/curriculum elementary stage", "/ (stage selector)", "/search (curriculum results)"], "A bright small classroom: a blank green board with abstract chalk shapes, two little desks, a globe, a plant, a window with the sea."),

  // ── middle ───────────────────────────────────────────────────────────────
  A("middle", "math", 640, 480, ["/middle (math)", "/curriculum math"], "Geometric solids (cube, cone, sphere), a compass and protractor on a grid sheet with a plotted curve."),
  A("middle", "science", 640, 480, ["/middle (science)", "/curriculum science"], "A microscope, an atom model and a small ringed planet."),
  A("middle", "chemistry", 640, 480, ["/middle (chemistry)"], "Three flasks with softly coloured liquids and rising bubbles on a tray."),
  A("middle", "physics", 640, 480, ["/middle (physics)"], "A horseshoe magnet with field arcs, a glowing bulb, a pendulum."),
  A("middle", "study-plan", 640, 480, ["/middle (hero, study planning)", "/curriculum middle stage", "/ (stage selector)", "/search (curriculum results)"], "A calendar grid with a few coloured blocks, a checklist with ticks (no text), an alarm clock."),

  // ── high school ──────────────────────────────────────────────────────────
  A("high-school", "math", 640, 480, ["/high-school (math)", "/curriculum math", "exam catalog (Tahsili math)"], "An elegant function curve on a coordinate grid with a tangent line and a shaded area, a graphing tool."),
  A("high-school", "physics", 640, 480, ["/high-school (physics)", "/curriculum physics", "exam catalog (Tahsili physics)"], "A rocket on a curved trajectory around a planet, a sine wave, a vector arrow."),
  A("high-school", "chemistry", 640, 480, ["/high-school (chemistry)", "/curriculum chemistry", "exam catalog (Tahsili chemistry)"], "A ball-and-stick molecule, blank periodic-table-style tiles (no symbols), an Erlenmeyer flask."),
  A("high-school", "biology", 640, 480, ["/high-school (biology)", "/curriculum biology", "exam catalog (Tahsili biology)"], "A DNA double helix, a plant cell cross-section, a leaf."),
  A("high-school", "computer-science", 640, 480, ["/high-school (tracks explorer: CS & engineering)"], "A laptop with abstract code bars (coloured lines, no characters), a circuit trace, a small cloud and gear."),
  A("high-school", "business", 640, 480, ["/high-school (tracks explorer: business)"], "A rising bar chart with an arrow, a briefcase, stacked coins, a pie chart."),
  A("high-school", "health", 640, 480, ["/high-school (tracks explorer: health & life)"], "A heart with a pulse line, an apple, a stethoscope, a small dumbbell."),
  A("high-school", "hero", 800, 600, ["/high-school (hero)", "/curriculum high-school stage", "/ (stage selector)", "/search (curriculum results)", "tracks explorer"], "Crossroads on the island: a signpost-like fork with five paths (tracks) leading to small landmarks (book, laptop, heart, chart, mosque-dome silhouette) — no text on signs."),

  // ── aptitude (Qudurat) ───────────────────────────────────────────────────
  A("aptitude", "quantitative", 640, 480, ["/exams/aptitude (quantitative section, via the exam catalog)"], "A balance scale weighing geometric shapes, a bar chart, a triangle ruler."),
  A("aptitude", "verbal", 640, 480, ["/exams/aptitude (verbal section, via the exam catalog)", "tracks explorer"], "An open book with flowing calligraphic strokes rising out of it as abstract ribbons (no readable letters), a reed pen (qalam)."),
  A("aptitude", "timed", 640, 480, ["exam section pages", "exam runner (attempt view)", "Illustration (fallback art)"], "A stopwatch with a gold progress arc and an hourglass with flowing sand."),
  A("aptitude", "hero", 800, 600, ["/exams/aptitude (hero, via the exam catalog)", "/ (stage selector)"], "A focused student character at a desk with an exam sheet, a stopwatch and floating shapes/book symbols representing verbal and quantitative skills."),

  // ── achievement (Tahsili) ────────────────────────────────────────────────
  A("achievement", "review", 640, 480, ["exam section pages", "exam results (review list)", "/assistant (welcome)", "notifications rail"], "Flashcards fanned out with check marks, a highlighter, a bookmark."),
  A("achievement", "performance", 640, 480, ["/exams/history (analytics)"], "A radar chart and a small trophy on a dashboard panel with a rising sparkline."),
  A("achievement", "hero", 800, 600, ["/exams/achievement (hero, via the exam catalog)", "/ (stage selector)"], "Four subject icons (flask, atom, DNA, function curve) orbiting a central graduation cap on an island pedestal."),

  // ── community ────────────────────────────────────────────────────────────
  A("community", "study-group", 640, 480, ["/community (hero)"], "Three students with laptops and books sharing a table, a lamp overhead."),
  A("community", "discussion", 640, 480, ["/community (empty feed)", "/tags/[tag] (empty)", "/chat (no conversation selected)"], "Overlapping soft speech bubbles with dots, a heart and a lightbulb."),
  A("community", "motivation", 640, 480, ["/achievements (streak card)"], "A small character climbing stair-steps toward a glowing star, a flame for the streak."),

  // ── assistant (AI) ───────────────────────────────────────────────────────
  A("ai", "tutoring", 640, 480, ["/assistant (welcome: explain)"], "The Jazira assistant robot pointing at a board with an abstract diagram (shapes and arrows)."),
  A("ai", "study-plan", 640, 480, ["/assistant (welcome: plan)", "/middle (study planning)", "/dashboard (assistant card)"], "The assistant robot holding a calendar, with a checklist of ticks floating beside it."),
  A("ai", "feedback", 640, 480, ["/assistant (welcome: feedback)", "exam results (explanations)"], "A document with highlighted lines, sparkle marks and a check, with a magnifier."),

  // ── subscriptions ────────────────────────────────────────────────────────
  A("subscriptions", "premium", 800, 600, ["/subscriptions (plan card, included card, activation status)", "premium upgrade dialog", "/settings (subscription section)"], "A golden crown resting on a cream cushion atop a small island pedestal, soft sparkles and a gentle gold glow."),
  A("subscriptions", "analytics", 640, 480, ["/subscriptions (feature bento)", "/checkout/success"], "An elegant analytics panel: area chart, donut and KPI tiles with gold highlights."),

  // ── support ──────────────────────────────────────────────────────────────
  A("support", "help", 640, 480, ["/support (hero)", "/faq", "legal pages (help card)"], "A lifebuoy and a headset resting on a small island dock, a friendly lighthouse behind."),
  A("support", "contact", 640, 480, ["/contact (hero)", "/verify-email"], "A paper plane gliding over gentle waves from the island, an envelope and a seagull."),
  A("support", "empty", 640, 480, ["empty states (EmptyState default)", "leaderboard, subject explorer, pending curriculum, exam runner, notifications, stage shell, reviews"], "A calm small island with an empty hammock between two palms; peaceful, nothing happening."),

  // ── system ───────────────────────────────────────────────────────────────
  A("system", "not-found", 640, 480, ["404 page", "profile not found", "exam attempt not found", "/search (no results)"], "A tiny island with a wooden signpost whose arrows point in different directions (blank boards), a message-in-a-bottle floating nearby."),
  A("system", "offline", 640, 480, ["error / offline states (ErrorView)", "community feed, thread and profile (unavailable)", "exam runner", "notifications", "reviews"], "A small boat with its sail down on still water, a cloud partly covering the sun."),
];

export const ASSETS = Object.fromEntries(LIST.map((a) => [a.id, a]));
export const ASSET_LIST = LIST;

/** Look up an asset by id ("aptitude.timed"). Throws in dev on unknown ids. */
export function asset(id) {
  const a = ASSETS[id];
  if (!a && process.env.NODE_ENV !== "production") throw new Error(`[assets] unknown asset "${id}"`);
  return a || ASSETS["support.empty"];
}
