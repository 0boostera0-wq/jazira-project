import { LIMITS } from "@/lib/exams/catalog";
import {
  loadLocalBank, parseStartBody, pickLocalQuestions, isSameOrigin, readJsonBody, createRateLimiter, clientId,
} from "@/lib/exams/local-bank";
import { isSupabaseConfigured } from "@/lib/supabase-env";
import { getRouteUser } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// LOCAL PRACTICE MODE — start (guests, or when the database is unavailable).
//
//   POST /api/exams/local/start
//   body: { exam, section?, difficulty?, count, time_limit_seconds? }
//
//   200 { mode: "local", exam, section, difficulty, question_count, requested_count,
//         limited, max_questions, time_limit_seconds, started_at, expires_at,
//         questions: [{ position, id, key, stem, passage, choices, section, topic,
//                       difficulty, time_limit_seconds }] }      ← never answers
//   400 { error: "invalid_argument", field } · 400 { error: "invalid_json" }
//   403 { error: "forbidden" } (cross-site) · 413 { error: "payload_too_large" }
//   422 { error: "not_enough_questions" }  · 429 { error: "rate_limited" }
//   503 { error: "unavailable" } (no question file bundled)
//
// Nothing is stored: results are not saved in this mode (the UI says so).
// Guests get at most LIMITS.guestMaxQuestions questions, signed-in users (DB
// down) LIMITS.freeMaxQuestions; larger requests are capped and `limited` is true.

const NO_STORE = { "Cache-Control": "no-store" };
const reply = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });
const limited = createRateLimiter({ windowMs: 5 * 60_000, max: 60 });

async function isSignedIn() {
  if (!isSupabaseConfigured) return false;
  try {
    const { user } = await getRouteUser();
    return Boolean(user);
  } catch {
    return false; // auth unreachable → treat as a guest
  }
}

export async function POST(req) {
  if (!isSameOrigin(req)) return reply({ error: "forbidden" }, 403);
  if (limited(clientId(req))) return reply({ error: "rate_limited" }, 429);

  const body = await readJsonBody(req, 4 * 1024);
  if (!body.ok) return reply({ error: body.error }, body.status);

  const maxQuestions = (await isSignedIn()) ? LIMITS.freeMaxQuestions : LIMITS.guestMaxQuestions;
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
  return reply({
    mode: "local",
    ...set,
    requested_count: parsed.value.requested,
    limited: parsed.value.limited || set.question_count < parsed.value.requested,
    max_questions: maxQuestions,
    started_at: started.toISOString(),
    expires_at: new Date(started.getTime() + set.time_limit_seconds * 1000).toISOString(),
  });
}
