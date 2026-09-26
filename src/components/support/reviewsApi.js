// Client data helpers for /reviews. Everything goes through the browser
// Supabase client under RLS: reviews are public to read, and a user can only
// insert / update / delete rows where user_id = auth.uid().
//
// Profiles are joined in a second query using PUBLIC columns only
// (never select("*") on profiles — private columns are not granted).

export const REVIEWS_PAGE_SIZE = 10;
export const REVIEW_MAX = 1000;

const REVIEW_COLUMNS = "id, user_id, rating, content, created_at";
const PROFILE_COLUMNS = "id, username, full_name, avatar_url, is_elite, show_elite_badge";
const PROFILE_COLUMNS_MIN = "id, username, full_name, avatar_url, is_elite";
const MISSING = new Set(["PGRST202", "PGRST205", "42P01", "42883"]);

/** Classify a Supabase error: "unavailable" when the table is missing, otherwise "error". */
export function errorKind(error) {
  if (!error) return null;
  if (MISSING.has(error.code) || /does not exist|schema cache/i.test(error.message || "")) return "unavailable";
  return "error";
}

async function attachProfiles(supabase, rows) {
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  if (!ids.length) return rows.map((r) => ({ ...r, profile: null }));
  let res = await supabase.from("profiles").select(PROFILE_COLUMNS).in("id", ids);
  if (res.error) res = await supabase.from("profiles").select(PROFILE_COLUMNS_MIN).in("id", ids);
  const byId = Object.fromEntries((res.data || []).map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, profile: byId[r.user_id] || null }));
}

/** Exact per-star counts via five head-only count queries → { total, counts, average }. */
export async function fetchReviewStats(supabase) {
  const results = await Promise.all(
    [1, 2, 3, 4, 5].map((n) =>
      supabase.from("reviews").select("id", { count: "exact", head: true }).eq("rating", n)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed) return { error: errorKind(failed.error) };
  const counts = Object.fromEntries(results.map((r, i) => [i + 1, r.count || 0]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const sum = Object.entries(counts).reduce((a, [n, c]) => a + Number(n) * c, 0);
  return { total, counts, average: total ? sum / total : 0 };
}

/** One page of reviews, newest first. */
export async function fetchReviewsPage(supabase, page) {
  const from = page * REVIEWS_PAGE_SIZE;
  const { data, error } = await supabase
    .from("reviews")
    .select(REVIEW_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + REVIEWS_PAGE_SIZE - 1);
  if (error) return { error: errorKind(error) };
  const rows = await attachProfiles(supabase, data || []);
  return { rows, hasMore: (data || []).length === REVIEWS_PAGE_SIZE };
}

/** The signed-in user's most recent review (or null). */
export async function fetchMyReview(supabase, userId) {
  const { data, error } = await supabase
    .from("reviews")
    .select(REVIEW_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: errorKind(error) };
  return { review: data || null };
}

const clean = (text) => {
  const v = String(text || "").trim().slice(0, REVIEW_MAX);
  return v || null;
};

export async function createReview(supabase, userId, { rating, content }) {
  const { data, error } = await supabase
    .from("reviews")
    .insert({ user_id: userId, rating, content: clean(content) })
    .select(REVIEW_COLUMNS)
    .single();
  if (error) return { error: errorKind(error) };
  return { review: data };
}

export async function updateReview(supabase, userId, id, { rating, content }) {
  const { data, error } = await supabase
    .from("reviews")
    .update({ rating, content: clean(content) })
    .eq("id", id)
    .eq("user_id", userId)
    .select(REVIEW_COLUMNS)
    .single();
  if (error) return { error: errorKind(error) };
  return { review: data };
}

export async function deleteReview(supabase, userId, id) {
  const { error } = await supabase.from("reviews").delete().eq("id", id).eq("user_id", userId);
  if (error) return { error: errorKind(error) };
  return { ok: true };
}
