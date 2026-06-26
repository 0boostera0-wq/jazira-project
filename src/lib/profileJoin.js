// Shared client-side profile join + public identity rules for community/reviews.
// Falls back gracefully if the new display-preference columns aren't migrated yet.

export async function fetchProfileMap(supabase, ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return {};
  const full = "id, full_name, avatar_url, is_elite, show_elite_badge, anonymous_community";
  let res = await supabase.from("profiles").select(full).in("id", list);
  if (res.error) {
    // columns not migrated yet → minimal set
    res = await supabase.from("profiles").select("id, full_name, avatar_url, is_elite").in("id", list);
  }
  return Object.fromEntries((res.data || []).map((p) => [p.id, p]));
}

// Resolves how a user should appear publicly given their privacy preferences.
//  - anonymous_community → name "مجهول", no avatar
//  - Elite badge shows only when is_elite AND show_elite_badge (default true)
export function identityOf(profile) {
  const anonymous = !!profile?.anonymous_community;
  const showBadge = !!profile?.is_elite && profile?.show_elite_badge !== false;
  return {
    anonymous,
    showBadge,
    name: anonymous ? "مجهول" : profile?.full_name || "مستخدم",
    avatar: anonymous ? null : profile?.avatar_url || null,
  };
}
