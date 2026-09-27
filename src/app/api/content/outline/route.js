import { createClient } from "@supabase/supabase-js";
import { leafOf, loadOutline } from "@/lib/curriculum-outline";
import { getRuntimeBank } from "@/lib/exams/engine/runtime-bank.server";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase-env";
import { compactOutline, entryPointsFor, learnHref, loadSubjectPool, parseLearnPath, resolveLearnNode, resourceView, sortResources } from "@/components/learn/learn-logic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ONE SUBJECT'S OUTLINE for the curriculum subject drawer (docs/CONTENT_ENGINE.md §7
// "Performance"). The leaf page ships only a summary per subject (node id,
// href, unit / lesson / file counts); the drawer asks for the rest when it opens:
//
//   GET /api/content/outline?subject=<subject node id>
//
//   200 { subject, href, outline: compactOutline() | null, entries: { primary, related }, books: resourceView()[] }
//   400 invalid_argument {field} · 404 not_found · 503 unavailable
//
// Public, cookie-less data (the same the /learn pages render): the viewer's tier
// is applied by the ExamEntryPoints island. Cached by the CDN for a day (like the
// learn pages' ISR) and memoized per instance for 10 minutes. Subject ids are
// resolved through the catalog leaf allow-list — never a path built from input.

const CACHE = { "Cache-Control": "public, max-age=600, s-maxage=86400, stale-while-revalidate=604800" };
const NO_STORE = { "Cache-Control": "no-store" };
const MEMO_MS = 10 * 60 * 1000;
const memo = new Map(); // subject node id → { at, promise }

const reply = (body, status = 200) => Response.json(body, { status, headers: status === 200 ? CACHE : NO_STORE });

// A cookie-less public client (anon key; scope_pool_counts is anon-readable).
let publicDb;
function publicClient() {
  if (publicDb === undefined) {
    publicDb = isSupabaseConfigured
      ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
      : null;
  }
  return publicDb;
}

/** The drawer payload of one subject node, or null when it isn't a visible subject. */
async function subjectLearnPayload(subjectId, { db = null } = {}) {
  const leaf = leafOf(subjectId);
  const tree = leaf ? await loadOutline(leaf) : null;
  const ctx = tree ? resolveLearnNode(tree, subjectId) : null;
  if (!ctx || ctx.node.kind !== "subject" || ctx.node.id !== subjectId) return null;
  let bank = null;
  try {
    bank = getRuntimeBank();
  } catch {
    bank = null;
  }
  const pool = await loadSubjectPool({ tree, subjectId, bank, db });
  return {
    subject: subjectId,
    href: learnHref(subjectId),
    outline: compactOutline(tree, subjectId, pool),
    entries: entryPointsFor(tree, ctx, pool, tree.subjectTerms(subjectId)),
    books: sortResources(tree.resourcesFor(subjectId).map(resourceView)),
  };
}

function cached(subjectId) {
  const hit = memo.get(subjectId);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.promise;
  const promise = subjectLearnPayload(subjectId, { db: publicClient() }).catch((e) => {
    if (memo.get(subjectId)?.promise === promise) memo.delete(subjectId);
    throw e;
  });
  memo.set(subjectId, { at: Date.now(), promise });
  return promise;
}

export async function GET(req) {
  const raw = new URL(req.url).searchParams.get("subject");
  const parsed = typeof raw === "string" ? parseLearnPath(raw.split("/")) : null;
  if (!parsed) return reply({ error: "invalid_argument", field: "subject" }, 400);
  let payload;
  try {
    payload = await cached(parsed.nodeId);
  } catch (e) {
    console.error("[content-outline] failed:", String(e?.message || e).slice(0, 200));
    return reply({ error: "unavailable" }, 503);
  }
  if (!payload) return reply({ error: "not_found" }, 404);
  return reply(payload);
}
