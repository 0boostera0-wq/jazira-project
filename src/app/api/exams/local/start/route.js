import { LIMITS } from "@/lib/exams/catalog";
import {
  loadLocalBank, parseStartBody, pickLocalQuestions, isSameOrigin, readJsonBody, clientId,
} from "@/lib/exams/local-bank";
import { signLocalSet } from "@/lib/exams/local-token";
import { isRateLimited } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase-env";
import { getRouteUser } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// LOCAL PRACTICE MODE — start (guests, or when the database is unavailable).
//
//   POST /api/exams/local/start
//   body: { exam, section?, topic?, difficulty?, count, time_limit_seconds? }
//         topic: one of the section's topics (without a section, the exam's one
//         section that has it is used — the same rule as start_exam_attempt)
//
//   200 { mode: "local", exam, section, topic, difficulty, question_count, requested_count,
//         limited, max_questions, time_limit_seconds, started_at, expires_at, token,
//         questions: [{ position, id, key, stem, passage, choices, section, topic,
//                       difficulty, time_limit_seconds }] }      ← never answers
//         token: the signed question set; /grade grades only this set
//   400 { error: "invalid_argument", field } (field "topic" for an unknown / foreign topic)
//   400 { error: "invalid_json" }
//   403 { error: "forbidden" } (cross-site) · 413 { error: "payload_too_large" }
//   409 { error: "use_database" } (signed in and the database works — practice
//        there: attempts are saved and the plan's daily limit applies)
//   422 { error: "not_enough_questions" }  · 429 { error: "rate_limited" }
//   503 { error: "unavailable" } (no question file bundled)
//
// Nothing is stored: results are not saved in this mode (the UI says so).
// Guests get at most LIMITS.guestMaxQuestions questions, signed-in users (DB
// down) LIMITS.freeMaxQuestions; larger requests are capped and `limited` is true.

const NO_STORE = { "Cache-Control": "no-store" };
const reply = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });
const LIMIT = { max: 60, windowSeconds: 300 };

/** → "guest" | "member_db_down" | "member_db_up" */
async function callerState() {
  if (!isSupabaseConfigured) return "guest";
  let supabase = null;
  let user = null;
  try {
    ({ supabase, user } = await getRouteUser());
  } catch {
    return "guest"; // auth unreachable → treat as a guest
  }
  if (!user || !supabase) return "guest";
  // Local mode is the fallback for a database that is unreachable or not
  // migrated; a member whose database works practises there (saved attempts,
  // daily limit), not here.
  try {
    const { error } = await supabase.rpc("get_question_bank_stats");
    return error ? "member_db_down" : "member_db_up";
  } catch {
    return "member_db_down";
  }
}

export async function POST(req) {
  if (!isSameOrigin(req)) return reply({ error: "forbidden" }, 403);
  if (await isRateLimited({ bucket: "exams.local", key: clientId(req), ...LIMIT })) return reply({ error: "rate_limited" }, 429);

  const body = await readJsonBody(req, 4 * 1024);
  if (!body.ok) return reply({ error: body.error }, body.status);

  const caller = await callerState();
  if (caller === "member_db_up") return reply({ error: "use_database" }, 409);
  const maxQuestions = caller === "member_db_down" ? LIMITS.freeMaxQuestions : LIMITS.guestMaxQuestions;
  const parsed = parseStartBody(body.value, { maxQuestions });
  if (!parsed.ok) return reply({ error: parsed.error, field: parsed.field }, 400);

  let bank;
  try {
    bank = await loadLocalBank();
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
  if (!bank.list.length) return reply({ error: "unavailable" }, 503);

  const set = pickLocalQuestions(bank, parsed.value);
  if (!set.question_count) return reply({ error: "not_enough_questions" }, 422);

  const started = new Date();
  const expiresAt = new Date(started.getTime() + set.time_limit_seconds * 1000);
  return reply({
    mode: "local",
    ...set,
    requested_count: parsed.value.requested,
    limited: parsed.value.limited || set.question_count < parsed.value.requested,
    max_questions: maxQuestions,
    started_at: started.toISOString(),
    expires_at: expiresAt.toISOString(),
    token: signLocalSet({ keys: set.questions.map((q) => q.key), expiresAt }),
  });
}
