// ============================================================================
// Question-bank counts — one normalised shape for both sources:
//   • "db"    → get_question_bank_stats() via getBankStats() (the platform bank)
//   • "local" → the bundled practice files (src/content/questions), counted on
//               the server by bank.server.js — exactly what local practice
//               mode serves to guests / when the database is unavailable.
//
// Shape:
//   { source, free, premium,
//     exams: { [exam]: { free, premium,
//       sections: { [section]: { free, premium,
//         difficulties: { [1|2|3]: { free, premium } },
//         topics: { [topic]: { free, premium } } } } } } }
//
// Pure functions only (safe on server and client).
// ============================================================================

const cell = () => ({ free: 0, premium: 0 });
const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);

function add(target, free, premium) {
  target.free += free;
  target.premium += premium;
}

function ensure(out, exam, section) {
  out.exams[exam] ??= { ...cell(), sections: {} };
  if (!section) return out.exams[exam];
  out.exams[exam].sections[section] ??= { ...cell(), difficulties: {}, topics: {} };
  return out.exams[exam].sections[section];
}

/** Normalise the get_question_bank_stats() payload. Returns null for anything unusable. */
export function normalizeBankStats(raw) {
  if (!raw || typeof raw !== "object" || raw.available === false) return null;
  const out = { source: "db", free: num(raw.free), premium: num(raw.premium), exams: {} };
  for (const r of Array.isArray(raw.by_exam) ? raw.by_exam : []) {
    if (!r?.exam) continue;
    const e = ensure(out, r.exam);
    e.free = num(r.free);
    e.premium = num(r.premium);
  }
  for (const r of Array.isArray(raw.by_section) ? raw.by_section : []) {
    if (!r?.exam || !r.section) continue;
    const s = ensure(out, r.exam, r.section);
    s.free = num(r.free);
    s.premium = num(r.premium);
  }
  for (const r of Array.isArray(raw.by_difficulty) ? raw.by_difficulty : []) {
    if (!r?.exam || !r.section || !r.difficulty) continue;
    const s = ensure(out, r.exam, r.section);
    s.difficulties[r.difficulty] ??= cell();
    add(s.difficulties[r.difficulty], num(r.free), num(r.premium));
  }
  for (const r of Array.isArray(raw.by_topic) ? raw.by_topic : []) {
    if (!r?.exam || !r.section || !r.topic) continue;
    const s = ensure(out, r.exam, r.section);
    s.topics[r.topic] ??= cell();
    add(s.topics[r.topic], num(r.free), num(r.premium));
  }
  // Older payloads without totals: derive them from the sections.
  if (!raw.free && !raw.premium) {
    for (const e of Object.values(out.exams)) {
      if (!e.free && !e.premium) {
        for (const s of Object.values(e.sections)) add(e, s.free, s.premium);
      }
      add(out, e.free, e.premium);
    }
  }
  return out;
}

/**
 * Count bundled questions ({ exam, section, topic, difficulty, premium }).
 * Premium items are never served in local mode, so they are not counted.
 */
export function summarizeQuestions(list, source = "local") {
  const out = { source, free: 0, premium: 0, exams: {} };
  for (const q of Array.isArray(list) ? list : []) {
    if (!q || q.premium || !q.exam || !q.section) continue;
    const e = ensure(out, q.exam);
    const s = ensure(out, q.exam, q.section);
    out.free += 1;
    e.free += 1;
    s.free += 1;
    if (q.difficulty) {
      s.difficulties[q.difficulty] ??= cell();
      s.difficulties[q.difficulty].free += 1;
    }
    if (q.topic) {
      s.topics[q.topic] ??= cell();
      s.topics[q.topic].free += 1;
    }
  }
  return out;
}

/** free (+ premium when the viewer has premium access). */
export const countOf = (node, withPremium = false) => (node ? node.free + (withPremium ? node.premium : 0) : 0);

/** Every question in a node, premium included (for "N questions in the bank"). */
export const totalOf = (node) => (node ? node.free + node.premium : 0);

/**
 * Questions a viewer can draw with the given filters.
 * @returns {number|null} null when the bank is unknown
 */
export function availableCount(bank, { exam, section = null, difficulty = null, premium = false }) {
  const e = bank?.exams?.[exam];
  if (!bank) return null;
  if (!e) return 0;
  if (!section && !difficulty) return countOf(e, premium);
  if (section && !difficulty) return countOf(e.sections[section], premium);
  if (section) return countOf(e.sections[section]?.difficulties?.[difficulty], premium);
  return Object.values(e.sections).reduce((sum, s) => sum + countOf(s.difficulties?.[difficulty], premium), 0);
}
