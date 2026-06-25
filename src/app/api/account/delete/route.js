import { createClient as createServerSupabase } from "@/lib/supabase-server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Securely delete the authenticated user's account and ALL their data.
// Uses the service-role key SERVER-SIDE ONLY (never exposed to the browser).
// Most rows are removed by ON DELETE CASCADE when the auth user is deleted;
// Storage objects are removed explicitly first.
export async function POST() {
  // 1) Identify the caller from their session cookie (must be signed in).
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2) Require server secrets. If missing: log for devs, friendly Arabic to user.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("[account/delete] Missing env: SUPABASE_SERVICE_ROLE_KEY and/or NEXT_PUBLIC_SUPABASE_URL");
    return Response.json(
      { error: "not_configured", message: "خدمة حذف الحساب غير مُفعّلة حالياً. يرجى التواصل مع الدعم." },
      { status: 501 }
    );
  }

  const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false } });
  const uid = user.id;

  // 3) Remove the user's storage objects (avatars + community media). Best-effort.
  for (const bucket of ["avatars", "post-media"]) {
    try {
      const { data: list } = await admin.storage.from(bucket).list(uid);
      if (list?.length) {
        await admin.storage.from(bucket).remove(list.map((f) => `${uid}/${f.name}`));
      }
    } catch (e) {
      console.error(`[account/delete] storage cleanup (${bucket})`, e?.message || e);
    }
  }

  // 4) Delete the auth user → cascades remove profile, posts, media rows, comments,
  //    likes/dislikes/reposts, reviews, referrals, preferences, streaks, chat history.
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) {
    console.error("[account/delete] deleteUser failed:", error.message);
    return Response.json(
      { error: "delete_failed", message: "تعذّر حذف الحساب الآن. حاول لاحقاً." },
      { status: 500 }
    );
  }

  return Response.json({ ok: true });
}
