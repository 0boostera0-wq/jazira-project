import { getTemplate } from "@/lib/exams/engine/exam-templates";
import { parseScope } from "@/lib/exams/engine/scope";
import { displayMaps } from "@/lib/exams/engine/shuffle";
import { correctDisplay, gradeItem, parseDisplayResponse } from "@/lib/exams/engine/grade";
import { responseHash, signReceipt, verifySessionToken } from "@/lib/exams/engine/session-token";
import { takeGrades, takeKeyReveals } from "@/lib/exams/engine/key-budget";
import { claimCheck } from "@/lib/exams/engine/check-lock";
import { getRuntimeBank, loadSessionItems } from "@/lib/exams/engine/runtime-bank.server";
import { examSecretStatus } from "@/lib/exams/local-token";
import { clientIp, isSameOrigin, readJsonBody } from "@/lib/http-guards";
import { isRateLimited } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GUEST TEMPLATE SESSION — immediate check of one item (docs/CONTENT_ENGINE.md §5.8).
//
//   POST /api/exams/session/check
//   body: { token, position, response }   response in display indexes:
//         mcq/true_false {option_index} · matching {pairs:[[l,r]…]} · ordering {order:[i…]}
//         short_answer {text} · numeric {value, unit?}
//
//   200 { position, verdict, score, correct_response, explanation, objective, lesson, source,
//         receipt, key_reveal_limit }
//         receipt: signed {sid, pos, resp_hash, score}; /submit takes this position's score from
//         it and ignores any later response (changing an answer after a check never gains score).
//         Past the per-IP key-reveal cap: verdict and score only (key_reveal_limit: true).
//   One check per position: the first checked response is locked server-side
//   (engine/check-lock.js). The same response again (a retry after a lost reply) gets the
//   same verdict and receipt; any other response is item_locked, with no verdict.
//   400 invalid_argument {field} · invalid_response {position, reason} · token_invalid
//       · feedback_not_allowed (templates with end-of-session feedback)
//   403 forbidden · 409 bank_changed (the item was revised) · item_locked {position}
//   410 token_expired (deadline + grace) · 413 payload_too_large
//   429 rate_limited (also past the per-IP daily grading cap, exams.grades) · 503 unavailable

const NO_STORE = { "Cache-Control": "no-store" };
const reply = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });
const fail = (error, status, extra = {}) => reply({ error, ...extra }, status);
const LIMIT = { max: 60, windowSeconds: 300 };
const BODY_MAX = 8 * 1024;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export async function POST(req) {
  if (!isSameOrigin(req)) return fail("forbidden", 403);
  if (await isRateLimited({ bucket: "exams.session", key: clientIp(req), ...LIMIT })) return fail("rate_limited", 429);
  if (!examSecretStatus().available) return fail("unavailable", 503);

  const body = await readJsonBody(req, BODY_MAX);
  if (!body.ok) return fail(body.error, body.status);
  const b = body.value;
  if (!isObj(b)) return fail("invalid_argument", 400, { field: "body" });
  for (const k of Object.keys(b)) if (k !== "token" && k !== "position" && k !== "response") return fail("invalid_argument", 400, { field: k });

  const v = verifySessionToken(b.token);
  if (!v.ok) return fail(v.error, v.error === "token_expired" ? 410 : v.error === "unavailable" ? 503 : 400);
  const t = v.data;
  if (t.fb !== "immediate") return fail("feedback_not_allowed", 400);
  const position = b.position;
  if (!Number.isInteger(position) || position < 1 || position > t.q.length) return fail("invalid_argument", 400, { field: "position" });
  const template = getTemplate(t.tpl, t.tv);
  const parsed = parseScope(t.sc);
  if (!template || !parsed) return fail("token_invalid", 400);

  const key = t.q[position - 1];
  let bank = null;
  try {
    bank = getRuntimeBank();
  } catch {
    bank = null;
  }
  const loaded = await loadSessionItems({ admin: createAdminClient(), bank, parsed, keys: [key] });
  if (!loaded.ok) return fail("unavailable", 503);
  const item = loaded.content.get(key);
  const answer = loaded.keys.get(key);
  if (!item || !answer || item.revision !== t.r[position - 1] || answer.revision !== item.revision) return fail("bank_changed", 409, { position });

  const parsedResponse = parseDisplayResponse(item.type, b.response);
  if (!parsedResponse.ok) return fail("invalid_response", 400, { position, reason: parsedResponse.reason });
  if (parsedResponse.response === null) return fail("invalid_response", 400, { position, reason: "empty" });
  const maps = displayMaps(t.sd, item, { template });
  const graded = gradeItem(item, answer, maps, parsedResponse.response);
  if (graded.reason) return fail("invalid_response", 400, { position, reason: graded.reason });

  // Every verdict is charged (a verdict is an answer oracle, §5.8); then the
  // position's first checked response is locked on the server: a second check
  // with another response is refused before any verdict is shown.
  const ip = clientIp(req);
  if (!(await takeGrades(ip, 1))) return fail("rate_limited", 429);
  const respHash = responseHash(parsedResponse.response);
  let claim;
  try {
    claim = await claimCheck({ sid: t.sid, pos: position, respHash, expiresAt: t.dl + t.g * 1000 });
  } catch {
    return fail("unavailable", 503);
  }
  if (claim === "locked") return fail("item_locked", 409, { position });

  const reveal = await takeKeyReveals(ip, 1);
  const receipt = signReceipt({ sid: t.sid, pos: position, resp_hash: respHash, score: graded.score });
  return reply({
    position,
    verdict: graded.verdict,
    score: graded.score,
    correct_response: reveal ? correctDisplay(item, answer, maps) : null,
    explanation: reveal && answer.explanation ? { text: answer.explanation.text ?? "", steps: [...(answer.explanation.steps ?? [])] } : null,
    objective: reveal && answer.objective ? { text: answer.objective.text } : null,
    lesson: item.lesson ? { id: item.lesson.id, title: item.lesson.title ?? null, href: item.lesson.id.startsWith("prep:") ? null : `/learn/${item.lesson.id}` } : null,
    source: reveal ? answer.source ?? null : null,
    receipt,
    key_reveal_limit: !reveal,
  });
}
