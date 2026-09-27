import { getTemplate } from "@/lib/exams/engine/exam-templates";
import { parseScope } from "@/lib/exams/engine/scope";
import { displayMaps } from "@/lib/exams/engine/shuffle";
import { gradeItem, parseDisplayResponse, resultItem, summarize } from "@/lib/exams/engine/grade";
import { itemHandle, responseHash, verifyReceipt, verifySessionToken } from "@/lib/exams/engine/session-token";
import { takeGrades, takeKeyReveals } from "@/lib/exams/engine/key-budget";
import { getRuntimeBank, loadSessionItems } from "@/lib/exams/engine/runtime-bank.server";
import { examSecretStatus } from "@/lib/exams/local-token";
import { clientIp, isSameOrigin, readJsonBody } from "@/lib/http-guards";
import { isRateLimited } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GUEST TEMPLATE SESSION — submit (docs/CONTENT_ENGINE.md §5.5, §5.7, §5.8).
//
//   POST /api/exams/session/submit
//   body: { token, answers: [{ position, response, time_spent_seconds?, flagged? }], receipts?: [receipt…] }
//
//   200 { mode: "guest", saved: false, status: "submitted"|"expired", session_id, template, scope,
//         started_at, expires_at, submitted_at, duration_seconds, question_count, voided_count,
//         correct_count, answered_count, score_percent, by_lesson, by_band, by_term?, by_topic?,
//         key_reveal_limit, items: [{ position, key, type, language, stem, stimulus, options,
//         choices, public, lesson {id,title,href}, response, verdict, score, correct_response,
//         explanation, objective, source, voided, locked }] }
//   `key` is the item's per-session opaque handle (as in /start), never the canonical key:
//   past the key-reveal cap a canonical key would let a client test candidate answers offline.
//   Graded against the server clock: after deadline + grace the status is `expired` and the
//   answers are ignored (receipted positions keep their checked score). A receipted position
//   takes its score from the receipt and ignores the submitted response; in an
//   immediate-feedback session a position without a receipt is unanswered. An item whose
//   revision changed is voided (excluded from the score, shown with a note).
//   400 invalid_argument {field} · invalid_response {position, reason} · token_invalid
//   403 forbidden · 410 token_expired (more than a day after the deadline)
//   413 payload_too_large · 429 rate_limited (also past the per-IP daily grading cap,
//   exams.grades: every position graded from a submitted response costs one) · 503 unavailable
// Nothing is stored and guest scores are not ranked, so a replayed submit gains no
// score; what it could gain is verdicts (an answer oracle), which the grading cap bounds.

const NO_STORE = { "Cache-Control": "no-store" };
const reply = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });
const fail = (error, status, extra = {}) => reply({ error, ...extra }, status);
const LIMIT = { max: 60, windowSeconds: 300 };
const BODY_MAX = 48 * 1024;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function parseAnswers(list, count) {
  if (list === undefined || list === null) return { ok: true, value: new Map() };
  if (!Array.isArray(list) || list.length > count) return { ok: false, field: "answers" };
  const out = new Map();
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!isObj(a)) return { ok: false, field: `answers[${i}]` };
    for (const k of Object.keys(a)) if (!["position", "response", "time_spent_seconds", "flagged"].includes(k)) return { ok: false, field: `answers[${i}].${k}` };
    if (!Number.isInteger(a.position) || a.position < 1 || a.position > count || out.has(a.position)) return { ok: false, field: `answers[${i}].position` };
    const t = a.time_spent_seconds ?? 0;
    if (!Number.isInteger(t) || t < 0 || t > 604800) return { ok: false, field: `answers[${i}].time_spent_seconds` };
    if (a.flagged !== undefined && typeof a.flagged !== "boolean") return { ok: false, field: `answers[${i}].flagged` };
    out.set(a.position, { response: a.response ?? null, time_spent_seconds: t, flagged: a.flagged === true });
  }
  return { ok: true, value: out };
}

const verdictOf = (score) => (score >= 1 ? "correct" : score > 0 ? "partial" : "incorrect");

export async function POST(req) {
  if (!isSameOrigin(req)) return fail("forbidden", 403);
  if (await isRateLimited({ bucket: "exams.session", key: clientIp(req), ...LIMIT })) return fail("rate_limited", 429);
  if (!examSecretStatus().available) return fail("unavailable", 503);

  const body = await readJsonBody(req, BODY_MAX);
  if (!body.ok) return fail(body.error, body.status);
  const b = body.value;
  if (!isObj(b)) return fail("invalid_argument", 400, { field: "body" });
  for (const k of Object.keys(b)) if (!["token", "answers", "receipts"].includes(k)) return fail("invalid_argument", 400, { field: k });

  const now = Date.now();
  const v = verifySessionToken(b.token, { now, allowExpired: true });
  if (!v.ok) return fail(v.error, v.error === "token_expired" ? 410 : v.error === "unavailable" ? 503 : 400);
  const t = v.data;
  const template = getTemplate(t.tpl, t.tv);
  const parsed = parseScope(t.sc);
  if (!template || !parsed) return fail("token_invalid", 400);

  const answers = parseAnswers(b.answers, t.q.length);
  if (!answers.ok) return fail("invalid_argument", 400, { field: answers.field });
  const receiptList = b.receipts ?? [];
  if (!Array.isArray(receiptList) || receiptList.length > t.q.length) return fail("invalid_argument", 400, { field: "receipts" });
  const receipts = new Map();
  for (const r of receiptList) {
    const rv = verifyReceipt(r, t.sid);
    if (rv.ok && rv.pos <= t.q.length && !receipts.has(rv.pos)) receipts.set(rv.pos, rv);
  }

  let bank = null;
  try {
    bank = getRuntimeBank();
  } catch {
    bank = null;
  }
  const loaded = await loadSessionItems({ admin: createAdminClient(), bank, parsed, keys: t.q });
  if (!loaded.ok) return fail("unavailable", 503);

  // Shape errors are the client's bug: refuse before revealing anything.
  const displays = new Map();
  for (const [pos, a] of answers.value) {
    const item = loaded.content.get(t.q[pos - 1]);
    if (!item) continue;
    const p = parseDisplayResponse(item.type, a.response);
    if (!p.ok) return fail("invalid_response", 400, { position: pos, reason: p.reason });
    displays.set(pos, p.response);
  }

  const expired = v.expired;
  const rows = [];
  const contentByKey = new Map(); // handle → content (the summary groups by band / term / topic)
  let live = 0;
  let graded = 0; // positions graded from a submitted response (charged to exams.grades)
  let handles;
  try {
    handles = t.q.map((k) => itemHandle(t.sid, k));
  } catch {
    return fail("unavailable", 503);
  }
  for (let i = 0; i < t.q.length; i++) {
    const position = i + 1;
    const key = t.q[i];
    const handle = handles[i];
    const item = loaded.content.get(key);
    const answer = loaded.keys.get(key);
    if (!item || !answer || item.revision !== t.r[i] || answer.revision !== item.revision) {
      rows.push({ position, handle, type: item?.type ?? null, voided: "question_updated", verdict: null, score: null, lesson: item?.lesson ?? null, response: null });
      continue;
    }
    live += 1;
    contentByKey.set(handle, item);
    const maps = displayMaps(t.sd, item, { template });
    const receipt = receipts.get(position);
    // Immediate-feedback sessions are answered through /check: a position counts
    // only with its receipt, so a client that drops receipts gains nothing (§5.8).
    let display = expired || (t.fb === "immediate" && !receipt) ? null : displays.get(position) ?? null;
    let grade;
    if (receipt) {
      if (display === null || responseHash(display) !== receipt.resp_hash) display = null;
      grade = { score: receipt.score, verdict: verdictOf(receipt.score) };
    } else {
      grade = gradeItem(item, answer, maps, display);
      if (display !== null) graded += 1;
    }
    rows.push({ position, handle, item, answer, maps, display, grade, locked: Boolean(receipt) });
  }

  // A verdict is an answer oracle and this route can be replayed with the same
  // token: every response graded here is charged to the per-IP daily grading
  // cap (receipted and unanswered positions are free). Past it: 429, no verdicts.
  const ip = clientIp(req);
  if (!(await takeGrades(ip, graded))) return fail("rate_limited", 429);
  const reveal = await takeKeyReveals(ip, live);
  const items = rows.map((r) => (r.item
    ? resultItem({ position: r.position, item: r.item, key: r.answer, maps: r.maps, response: r.display, grade: r.grade, reveal, locked: r.locked, handle: r.handle })
    : { position: r.position, key: r.handle, type: r.type, voided: r.voided, verdict: null, score: null, response: null, correct_response: null, explanation: null, objective: null, source: null, locked: false,
      lesson: r.lesson ? { id: r.lesson.id, title: r.lesson.title ?? null, href: r.lesson.id.startsWith("prep:") ? null : `/learn/${r.lesson.id}` } : null }));
  const summary = summarize(items, { contentByKey, withTerm: template.kind === "full_year", withTopic: parsed.type === "prep" });
  const end = Math.min(now, t.dl);
  return reply({
    mode: "guest",
    saved: false,
    status: expired ? "expired" : "submitted",
    session_id: t.sid,
    template: { id: template.id, version: template.version, kind: template.kind },
    scope: t.sc,
    started_at: new Date(t.iat).toISOString(),
    expires_at: new Date(t.dl).toISOString(),
    submitted_at: new Date(now).toISOString(),
    duration_seconds: Math.max(0, Math.round((end - t.iat) / 1000)),
    ...summary,
    key_reveal_limit: !reveal,
    items,
  });
}
