import * as outline from "@/lib/curriculum-outline";
import { newSeed } from "@/lib/content/prng";
import { getTemplate, planCount, planFeedback, planTiming, tierMax } from "@/lib/exams/engine/exam-templates";
import { checkScopeCaps, parseScope, resolveScope } from "@/lib/exams/engine/scope";
import { selectSession } from "@/lib/exams/engine/select";
import { displayMaps, publicQuestion } from "@/lib/exams/engine/shuffle";
import {
  itemHandle, mergeSeen, newSessionId, openSeen, sealSeen, SEEN_MAX_BYTES, signSessionToken, verifySessionToken,
} from "@/lib/exams/engine/session-token";
import { bankPoolSource, getRuntimeBank, rpcPoolSource, splitRpcItem } from "@/lib/exams/engine/runtime-bank.server";
import { examSecretStatus } from "@/lib/exams/local-token";
import { clientIp, isSameOrigin, readJsonBody } from "@/lib/http-guards";
import { isRateLimited } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase-admin";
import { isSupabaseConfigured } from "@/lib/supabase-env";
import { getRouteUser } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GUEST TEMPLATE SESSION — start (docs/CONTENT_ENGINE.md §5.7, §5.8).
//
//   POST /api/exams/session/start
//   body: { template, version?, scope, count?, timing?: "timed"|"untimed",
//           feedback?: "end"|"immediate", seen?: <sealed seen list from an earlier /start>,
//           retake_of?: <token of the original session> }
//         `seed` is refused (seed_not_allowed): the seed is always server-generated.
//
//   200 { mode: "guest", session_id, token, template: {id, version, kind}, scope, term_scope,
//         quota, mini, limited, requested_count, max_questions, question_count, reused, short,
//         timing_mode, feedback_mode, time_limit_seconds, started_at, expires_at, server_now,
//         seconds_remaining, seen, questions: [{ position, key, type, language, stem, stimulus,
//         options: [{index, text}], choices, public, time_limit_seconds, lesson }] }
//         ← display indexes only: no ids, keys, explanations or sources. `key` is the item's
//           per-session OPAQUE handle (h-…), never the canonical key; the token seals the
//           keys and the seed (AES-256-GCM); `seen` is the updated sealed seen list (the
//           browser keeps it and echoes it back on the next /start). A seen blob that does
//           not open (forged, another secret) is ignored: it only steers selection.
//   400 invalid_argument {field} · seed_not_allowed · feedback_not_allowed · token_invalid (retake_of)
//   403 forbidden (cross-site) · 404 template_not_found · scope_not_found
//   409 use_database (signed in and the database works) · 413 payload_too_large
//   422 insufficient_pool {available, required} · scope_too_large · premium_required
//   429 rate_limited · 503 unavailable (no secret under EXAM_SECRET_REQUIRED=1, no bank)
//
// Guests: subject-level scopes or narrower (+ prep:<exam>/<section>), never
// premium items, at most 20 questions (the template's guest_max). Members whose
// database is down get the free tier. Nothing is saved.

const NO_STORE = { "Cache-Control": "no-store" };
const reply = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });
const fail = (error, status, extra = {}) => reply({ error, ...extra }, status);
const LIMIT = { max: 60, windowSeconds: 300 };
const BODY_MAX = 16 * 1024;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED = new Set(["template", "version", "scope", "count", "timing", "feedback", "seen", "retake_of"]);
const STATUS = { template_not_found: 404, scope_not_found: 404, insufficient_pool: 422, scope_too_large: 422, premium_required: 422, feedback_not_allowed: 400, invalid_argument: 400 };
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Strict whitelist parse of the body. */
function parseBody(b) {
  if (!isObj(b)) return { ok: false, error: "invalid_argument", field: "body" };
  if (Object.prototype.hasOwnProperty.call(b, "seed")) return { ok: false, error: "seed_not_allowed" };
  for (const k of Object.keys(b)) if (!ALLOWED.has(k)) return { ok: false, error: "invalid_argument", field: k };
  if (typeof b.template !== "string" || !SLUG_RE.test(b.template) || b.template.length > 64) return { ok: false, error: "invalid_argument", field: "template" };
  const version = b.version ?? null;
  if (version !== null && (!Number.isInteger(version) || version < 1 || version > 1000)) return { ok: false, error: "invalid_argument", field: "version" };
  if (typeof b.scope !== "string" || b.scope.length > 200) return { ok: false, error: "invalid_argument", field: "scope" };
  const count = b.count ?? null;
  if (count !== null && (!Number.isInteger(count) || count < 1 || count > 100)) return { ok: false, error: "invalid_argument", field: "count" };
  const timing = b.timing ?? null;
  if (timing !== null && timing !== "timed" && timing !== "untimed") return { ok: false, error: "invalid_argument", field: "timing" };
  const feedback = b.feedback ?? null;
  if (feedback !== null && feedback !== "end" && feedback !== "immediate") return { ok: false, error: "invalid_argument", field: "feedback" };
  const seenBlob = b.seen ?? null;
  if (seenBlob !== null && (typeof seenBlob !== "string" || seenBlob.length > SEEN_MAX_BYTES)) return { ok: false, error: "invalid_argument", field: "seen" };
  const retake = b.retake_of ?? null;
  if (retake !== null && (typeof retake !== "string" || retake.length > 16 * 1024)) return { ok: false, error: "invalid_argument", field: "retake_of" };
  // the sealed list opens to canonical keys server-side only; anything else counts as no history
  const seen = openSeen(seenBlob) ?? [];
  return { ok: true, value: { template: b.template, version, scope: b.scope, count, timing, feedback, seen, retake } };
}

/** → "guest" | "member_db_down" | "member_db_up" (same rule as /api/exams/local/start). */
async function callerState() {
  if (!isSupabaseConfigured) return "guest";
  let supabase = null;
  let user = null;
  try {
    ({ supabase, user } = await getRouteUser());
  } catch {
    return "guest";
  }
  if (!user || !supabase) return "guest";
  try {
    const { error } = await supabase.rpc("get_question_bank_stats");
    return error ? "member_db_down" : "member_db_up";
  } catch {
    return "member_db_down";
  }
}

/** Selection over the runtime bank (the JS engine). */
async function selectFromBank({ template, parsed, resolution, plan, seed, seen, retake }) {
  let source;
  let rows;
  try {
    source = bankPoolSource(getRuntimeBank());
    rows = await source.rows(parsed, resolution);
  } catch {
    return { error: "unavailable" };
  }
  if (!rows) return { error: "insufficient_pool", available: 0, required: plan.min_required };
  const sel = selectSession({ template, n: plan.n, minRequired: plan.min_required, seed, pool: rows, history: { seen }, premiumAllowed: false, retake });
  if (!sel.ok) return { error: sel.error, available: sel.available, required: sel.required };
  // content only: nothing served at start depends on an answer (§5.4), so no key chunk is read
  const content = await source.content(sel.items);
  return { sel, content, stored: sel.stored };
}

/** Selection in SQL (ce_guest_start) when the service role and 0014 are there. */
async function selectFromRpc(admin, { template, parsed, plan, seed, seen }) {
  const rpc = rpcPoolSource(admin);
  const res = await rpc.start({ template: template.id, scope: parsed.raw, seed, seen, count: plan.n });
  if (res.missing) return { missing: true };
  if (res.error) {
    const code = res.error.message;
    if (STATUS[code]) {
      let details = null;
      try {
        details = res.error.details ? JSON.parse(res.error.details) : null;
      } catch {
        details = null;
      }
      return { error: code, ...(details ?? {}) };
    }
    return { error: "unavailable" };
  }
  const data = res.data ?? {};
  const rows = Array.isArray(data.items) ? data.items : [];
  const content = new Map(rows.map((r) => [r.key, splitRpcItem(r).content]));
  const sel = { items: rows.map((r) => ({ key: r.key })), reused: Boolean(data.reused), short: Boolean(data.short) };
  return { sel, content, stored: Array.isArray(data.allocation) ? data.allocation : null };
}

export async function POST(req) {
  if (!isSameOrigin(req)) return fail("forbidden", 403);
  if (await isRateLimited({ bucket: "exams.session", key: clientIp(req), ...LIMIT })) return fail("rate_limited", 429);
  if (!examSecretStatus().available) return fail("unavailable", 503);

  const body = await readJsonBody(req, BODY_MAX);
  if (!body.ok) return fail(body.error, body.status);
  const parsedBody = parseBody(body.value);
  if (!parsedBody.ok) return fail(parsedBody.error, 400, parsedBody.field ? { field: parsedBody.field } : {});
  const input = parsedBody.value;

  const caller = await callerState();
  if (caller === "member_db_up") return fail("use_database", 409);
  const tier = caller === "member_db_down" ? "free" : "guest";

  const template = getTemplate(input.template, input.version);
  if (!template) return fail("template_not_found", 404);
  const parsed = parseScope(input.scope);
  if (!parsed) return fail("invalid_argument", 400, { field: "scope" });
  if (parsed.type === "weak") return fail("invalid_argument", 400, { field: "scope" }); // weakness review needs saved history

  // retake: the original session's signed token (same template and scope)
  let retake = null;
  let original = null;
  if (input.retake) {
    const v = verifySessionToken(input.retake, { anyTime: true });
    if (!v.ok) return fail(v.error === "unavailable" ? "unavailable" : "token_invalid", v.error === "unavailable" ? 503 : 400);
    if (v.data.tpl !== template.id || v.data.sc !== parsed.raw || !v.data.al) return fail("invalid_argument", 400, { field: "retake_of" });
    original = v.data;
    retake = v.data.al;
  }

  let plan;
  let seen = input.seen;
  if (original) {
    const n = retake.reduce((s, [, q]) => s + q, 0);
    // the stored quotas came from another tier (e.g. a member whose database was down): never exceed this caller's cap
    if (n > tierMax(template, tier)) return fail("invalid_argument", 400, { field: "retake_of" });
    plan = { ok: true, n, mini: original.lim.mini, limited: original.lim.limited, requested: n, min_required: Math.min(template.count.min, n) };
    // the original session's items are seen, whatever the client sent (§5.3: a retake avoids them)
    seen = mergeSeen(seen, original.q);
  } else {
    plan = planCount(template, tier, input.count);
    if (!plan.ok) return fail(plan.error, STATUS[plan.error] ?? 400, plan.field ? { field: plan.field } : {});
  }
  const timing = planTiming(template, plan.n, input.timing);
  if (!timing.ok) return fail(timing.error, 400, { field: timing.field });
  const feedback = planFeedback(template, input.feedback);
  if (!feedback.ok) return fail(feedback.error, 400);

  let resolution;
  try {
    resolution = await resolveScope(outline, parsed);
  } catch {
    return fail("unavailable", 503);
  }
  if (!resolution.ok) return fail(resolution.error, STATUS[resolution.error] ?? 400, resolution.field ? { field: resolution.field } : {});
  if (!template.scope_kinds.includes(resolution.kind)) return fail("invalid_argument", 400, { field: "scope" });
  const caps = checkScopeCaps(resolution.kind, tier);
  if (!caps.ok) return fail(caps.error, 422);

  const seed = newSeed();
  const args = { template, parsed, resolution, plan, seed, seen, retake };
  let picked = null;
  const admin = createAdminClient();
  if (admin) {
    picked = await selectFromRpc(admin, args);
    if (picked.missing) picked = null;
  }
  if (!picked) picked = await selectFromBank(args);
  if (picked.error) {
    const extra = picked.error === "insufficient_pool" ? { available: picked.available ?? 0, required: picked.required ?? plan.min_required } : {};
    return fail(picked.error, STATUS[picked.error] ?? 503, extra);
  }

  const sid = newSessionId();
  const questions = [];
  const keys = [];
  const revisions = [];
  let seenOut;
  try {
    for (const { key } of picked.sel.items) {
      const item = picked.content.get(key);
      if (!item) return fail("unavailable", 503);
      const maps = displayMaps(seed, item, { template });
      questions.push(publicQuestion(item, questions.length + 1, maps, { handle: itemHandle(sid, key) }));
      keys.push(key);
      revisions.push(item.revision);
    }
    seenOut = sealSeen(mergeSeen(seen, keys));
  } catch {
    return fail("unavailable", 503);
  }

  const now = Date.now();
  const deadline = now + timing.seconds * 1000;
  const payload = {
    sid, tpl: template.id, tv: template.version, sc: parsed.raw, sd: seed, q: keys, r: revisions,
    iat: now, dl: deadline, g: timing.grace_seconds, fb: feedback.mode, tm: timing.mode,
    lim: { tier, mini: plan.mini, limited: plan.limited },
  };
  let token;
  try {
    token = signSessionToken(picked.stored ? { ...payload, al: picked.stored } : payload);
  } catch (e) {
    if (e?.code === "unavailable") return fail("unavailable", 503);
    try {
      token = signSessionToken(payload); // an allocation too large for the token: retakes start fresh
    } catch {
      return fail("unavailable", 503); // a malformed pool row (key, revision): never a bare 500
    }
  }
  return reply({
    mode: "guest",
    session_id: payload.sid,
    token,
    template: { id: template.id, version: template.version, kind: template.kind },
    scope: parsed.raw,
    term_scope: parsed.type === "node" ? parsed.term : null,
    quota: template.quota,
    mini: plan.mini,
    limited: plan.limited || questions.length < plan.requested,
    requested_count: plan.requested,
    max_questions: tierMax(template, tier),
    question_count: questions.length,
    reused: Boolean(picked.sel.reused),
    short: Boolean(picked.sel.short),
    retake_of: original ? original.sid : null,
    timing_mode: timing.mode,
    feedback_mode: feedback.mode,
    time_limit_seconds: timing.seconds,
    started_at: new Date(now).toISOString(),
    expires_at: new Date(deadline).toISOString(),
    server_now: new Date(now).toISOString(),
    seconds_remaining: timing.seconds,
    seen: seenOut,
    questions,
  });
}
