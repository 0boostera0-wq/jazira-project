import { NextResponse } from "next/server";
import { localizeHref } from "@/i18n/config";
import { getRouteUser } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * /profile → your public profile (/u/<username>), as a real 307.
 *
 * A route handler, not a page: under the app shell a page streams its
 * loading skeleton before redirect() runs, so the answer was HTTP 200 with a
 * 1-second meta refresh (axe: meta-refresh, WCAG 2.2.1) and a skeleton flash.
 *
 * Signed out → sign-in (the middleware usually does this before we get
 * here); no public name yet → profile setup; no handle, or the profile can't
 * be read → settings (the account page shows the profile honestly).
 */
export async function GET(request, props) {
  const params = await props.params;
  const locale = params?.locale;
  const to = (path) => {
    const res = NextResponse.redirect(new URL(localizeHref(path, locale), request.url), 307);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  };

  const { supabase, user } = await getRouteUser();
  if (!supabase || !user) return to(`/sign-in?next=${encodeURIComponent("/profile")}`);

  const { data, error } = await supabase.from("profiles").select("username, full_name").eq("id", user.id).maybeSingle();
  if (error) return to("/settings");
  if (!data?.full_name) return to("/profile-setup");
  if (!data?.username) return to("/settings");
  return to(`/u/${encodeURIComponent(data.username)}`);
}
