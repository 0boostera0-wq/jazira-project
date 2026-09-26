import {
  loadLocalBank, parseGradeBody, gradeLocalAnswers, isSameOrigin, readJsonBody, clientId,
} from "@/lib/exams/local-bank";
import { verifyLocalSet } from "@/lib/exams/local-token";
import { isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// LOCAL PRACTICE MODE — grade (guests, or when the database is unavailable).
//
//   POST /api/exams/local/grade
//   body: { answers: [{ key, selected_index }], token }
//         token: the signed set /start returned; every key must belong to it
//         (selected_index null = unanswered)
//
//   200 { mode: "local", items: [{ position, question_id, key, stem, passage, choices,
//         selected_index, correct_index, is_correct, explanation, section, topic,
//         difficulty }], by_topic: [{ section, topic, correct, total }],
//         summary: { correct, total, answered, score_percent } }
//   400 { error: "invalid_argument" | "unknown_key" | "invalid_json", field? }
//   400 { error: "invalid_token" } (missing / forged) · 400 { error: "expired" } (> 24 h after the deadline)
//   403 { error: "forbidden" } · 413 { error: "payload_too_large" }
//   429 { error: "rate_limited" } · 503 { error: "unavailable" }
//
// Stateless: nothing is saved and no XP is awarded. Premium questions are never
// served in local mode, so their keys are never graded (→ unknown_key). Only a
// set this server handed out can be graded, so the endpoint is not an answer
// key for arbitrary questions.

const NO_STORE = { "Cache-Control": "no-store" };
const reply = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });
const LIMIT = { max: 60, windowSeconds: 300 };

export async function POST(req) {
  if (!isSameOrigin(req)) return reply({ error: "forbidden" }, 403);
  if (await isRateLimited({ bucket: "exams.local", key: clientId(req), ...LIMIT })) return reply({ error: "rate_limited" }, 429);

  const body = await readJsonBody(req, 24 * 1024);
  if (!body.ok) return reply({ error: body.error }, body.status);

  let bank;
  try {
    bank = await loadLocalBank();
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
  if (!bank.list.length) return reply({ error: "unavailable" }, 503);

  const parsed = parseGradeBody(body.value, bank);
  if (!parsed.ok) return reply({ error: parsed.error, field: parsed.field }, 400);

  const set = verifyLocalSet(parsed.token);
  if (!set.ok) return reply({ error: set.error }, 400);
  const foreign = parsed.value.findIndex((a) => !set.keys.has(a.key));
  if (foreign >= 0) return reply({ error: "unknown_key", field: `answers[${foreign}].key` }, 400);

  return reply({ mode: "local", ...gradeLocalAnswers(bank, parsed.value) });
}
