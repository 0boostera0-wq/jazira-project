import { QUERY_MIN, getContentIndex, parseContentQuery, searchContentIndex } from "@/lib/search/content-search";
import { searchNormalize } from "@/lib/content/normalize";
import { getRuntimeBank } from "@/lib/exams/engine/runtime-bank.server";
import { clientIp } from "@/lib/http-guards";
import { isRateLimited } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CONTENT SEARCH for anonymous callers and databases without 0014
// (docs/CONTENT_ENGINE.md §6.2 search_content, §7 "Search").
//
//   GET /api/content/search?q=&kinds=node,resource,exam&node=<node id>&limit=1..20&offset=0..100
//
//   200 { query, source: "db" | "index", groups: { node, resource, exam: { total, capped, items[] } } }
//       node items     { id, kind, title, title_en, subject, subject_title, …, href }
//       resource items { id, kind, title, subject, part, availability, url (official link-out), href }
//       exam items     { id, kind: template id, template, scope, title, count, href }
//   400 invalid_argument {field} · 429 rate_limited
//
// With the service role the database answers (search_content with p_anon =
// true: never a question group). Otherwise a normalized in-memory index built
// once per instance from the outline (never a client scan). No stems, ever.

const LIMIT = { bucket: "content.search", max: 120, windowSeconds: 300 };
const HEADERS = { "Cache-Control": "no-store" };
const MISSING = new Set(["PGRST202", "PGRST205", "42P01", "42883"]);
const reply = (body, status = 200) => Response.json(body, { status, headers: HEADERS });

/**
 * search_content exam rows are { node, kind: <node kind>, template, count, href };
 * the route answers in the index's shape { id, kind: <template id>, template,
 * scope, node_kind, … } whichever source answered.
 */
function examItem(it) {
  if (!it || typeof it !== "object" || typeof it.node !== "string" || it.scope !== undefined) return it;
  const { node, kind, ...rest } = it;
  return { ...rest, id: `${it.template}:${node}`, kind: it.template, scope: node, node_kind: kind ?? null };
}

/** A search_content payload with only the anonymous groups (defence in depth), at most `limit` rows each. */
function anonGroups(data, kinds, limit) {
  const out = {};
  for (const k of kinds ?? ["node", "resource", "exam"]) {
    const g = data?.groups?.[k];
    const items = Array.isArray(g?.items) ? g.items.slice(0, limit) : [];
    out[k] = {
      total: Number.isFinite(Number(g?.total)) ? Math.min(Number(g.total), 100) : 0,
      capped: Boolean(g?.capped) || Number(g?.total) > 100,
      items: k === "exam" ? items.map(examItem) : items,
    };
  }
  return out;
}

async function fromDatabase(v) {
  const admin = createAdminClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin.rpc("search_content", {
      p_q: v.q,
      p_kinds: v.kinds,
      p_node: v.node,
      p_limit: v.limit,
      p_offset: v.offset,
      p_anon: true,
    });
    if (error) {
      if (!MISSING.has(error.code) && !/could not find the function|schema cache/i.test(error.message || "")) {
        console.warn("[content-search] search_content failed, using the outline index:", error.code || error.message);
      }
      return null;
    }
    return { query: typeof data?.query === "string" ? data.query : v.q, source: "db", groups: anonGroups(data, v.kinds, v.limit) };
  } catch {
    return null;
  }
}

async function bankIndex() {
  try {
    return await getRuntimeBank().index();
  } catch {
    return null; // no runtime bank packed yet: no exam group from it
  }
}

export async function GET(req) {
  const url = new URL(req.url);
  const parsed = parseContentQuery(url.searchParams);
  if (!parsed.ok) return reply({ error: parsed.error, field: parsed.field }, 400);
  if (await isRateLimited({ ...LIMIT, key: clientIp(req) })) return reply({ error: "rate_limited" }, 429);

  const v = parsed.value;
  // Punctuation-only input ("؟؟") normalizes below the minimum: empty groups, no database round trip.
  if (searchNormalize(v.q).length < QUERY_MIN) {
    const res = searchContentIndex(null, v);
    return reply({ query: res.query, source: "index", groups: res.groups });
  }
  const db = await fromDatabase(v);
  if (db) return reply(db);

  let index;
  try {
    index = await getContentIndex({ bankIndex: await bankIndex() });
  } catch (e) {
    console.error("[content-search] index build failed:", String(e?.message || e).slice(0, 200));
    return reply({ error: "unavailable" }, 503);
  }
  const res = searchContentIndex(index, v);
  return reply({ query: res.query, source: "index", groups: res.groups });
}
