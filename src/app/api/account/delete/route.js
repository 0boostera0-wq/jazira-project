import { createClient as createServerSupabase } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { isSameOrigin } from "@/lib/http-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Permanently delete the signed-in member's account and ALL their data.
//
//   POST /api/account/delete   (same-origin, signed in, recently signed in)
//   200 { ok: true }
//   401 { error: "unauthorized" }        no session
//   401 { error: "reauth_required" }     last sign-in older than REAUTH_WINDOW_MS:
//                                        the session is ended here, so "sign in
//                                        again, then retry" is literally true
//   403 { error: "forbidden" }           cross-site request
//   500 { error: "cleanup_failed" }      storage could not be emptied — the
//                                        account is NOT deleted, retry is safe
//   500 { error: "delete_failed" }       · 501/503 { error: "not_configured" }
//
// Order matters: storage first (with error checks), then the auth user. If the
// files cannot be removed, the account stays so the member (or support) can
// retry — deleting the user first would leave public files nobody can find.
// Rows are removed by ON DELETE CASCADE when the auth user is deleted.
// The service-role key is used SERVER-SIDE ONLY.
const REAUTH_WINDOW_MS = 15 * 60_000;
const PAGE = 1000;
const MAX_OBJECTS = 50_000; // per member and bucket — far above any real account
const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Every object name directly under `<folder>/` (paths are flat: `<uid>/<file>`). */
async function listFolder(storage, folder) {
  const names = [];
  for (let offset = 0; offset < MAX_OBJECTS; offset += PAGE) {
    const { data, error } = await storage.list(folder, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${folder}: ${error.message}`);
    const page = data || [];
    // folders come back as entries without an id; there are none in these buckets
    for (const f of page) if (f?.name && f.id !== null) names.push(`${folder}/${f.name}`);
    if (page.length < PAGE) return names;
  }
  throw new Error(`list ${folder}: more than ${MAX_OBJECTS} objects`);
}

/** Media of the member's anonymous posts: `anon/<uuid>/<file>` (not under their uid). */
async function anonymousMediaPaths(admin, uid) {
  const paths = [];
  for (let from = 0; from < MAX_OBJECTS; from += PAGE) {
    const { data, error } = await admin.from("community_posts")
      .select("id, media_path")
      .eq("user_id", uid)
      .like("media_path", "anon/%")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`anonymous media: ${error.message}`);
    for (const r of data || []) if (typeof r.media_path === "string") paths.push(r.media_path);
    if ((data || []).length < PAGE) return paths;
  }
  throw new Error("anonymous media: too many rows");
}

/** Remove in batches; one retry per batch; throws when a batch keeps failing. */
async function removeAll(storage, paths) {
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    let { error } = await storage.remove(batch);
    if (error) ({ error } = await storage.remove(batch));
    if (error) throw new Error(`remove: ${error.message}`);
  }
}

export async function POST(req) {
  if (!isSameOrigin(req)) return reply({ error: "forbidden" }, 403);

  // 1) The caller, from their session cookie (verified with the auth server).
  const supabase = await createServerSupabase();
  if (!supabase) return reply({ error: "not_configured" }, 503);
  let user = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    user = null;
  }
  if (!user) return reply({ error: "unauthorized" }, 401);

  // 2) Proof of presence: an irreversible action needs a recent sign-in, not
  //    just a long-lived session on some device.
  const signedInAt = Date.parse(user.last_sign_in_at || "");
  if (!Number.isFinite(signedInAt) || Date.now() - signedInAt > REAUTH_WINDOW_MS) {
    try { await supabase.auth.signOut({ scope: "local" }); } catch { /* cookies may already be gone */ }
    return reply({ error: "reauth_required" }, 401);
  }

  // 3) Server secrets.
  const admin = createAdminClient();
  if (!admin) {
    console.error("[account/delete] Missing env: SUPABASE_SERVICE_ROLE_KEY and/or NEXT_PUBLIC_SUPABASE_URL");
    return reply({ error: "not_configured" }, 501);
  }
  const uid = user.id;

  // 4) Storage: avatars/<uid>/…, post-media/<uid>/…, post-media/anon/<uuid>/… (own anonymous posts).
  try {
    const avatars = admin.storage.from("avatars");
    const media = admin.storage.from("post-media");
    const [avatarPaths, mediaPaths, anonPaths] = await Promise.all([
      listFolder(avatars, uid),
      listFolder(media, uid),
      anonymousMediaPaths(admin, uid),
    ]);
    await removeAll(avatars, avatarPaths);
    await removeAll(media, [...mediaPaths, ...anonPaths]);
  } catch (e) {
    console.error("[account/delete] storage cleanup failed — account kept:", String(e?.message || e).slice(0, 200));
    return reply({ error: "cleanup_failed" }, 500);
  }

  // 5) The auth user → cascades remove profile, posts, comments, reactions,
  //    reviews, referrals, preferences, streaks, chat history, sessions.
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) {
    console.error("[account/delete] deleteUser failed:", error.message);
    return reply({ error: "delete_failed" }, 500);
  }
  return reply({ ok: true });
}
