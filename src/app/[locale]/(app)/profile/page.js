import { redirect } from "next/navigation";
import { setRequestLocale } from "@/i18n/server";
import { localizeHref } from "@/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { getRouteUser } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "profile", path: "/profile", noindex: true });
}

/**
 * /profile → your public profile (/u/<username>). Signed out → sign-in (the
 * middleware usually does this before we get here); no public name yet →
 * profile setup; no handle → settings.
 */
export default async function MyProfilePage({ params }) {
  setRequestLocale(params.locale);
  const to = (path) => redirect(localizeHref(path, params.locale));

  const { supabase, user } = await getRouteUser();
  if (!supabase || !user) to(`/sign-in?next=${encodeURIComponent("/profile")}`);

  const { data, error } = await supabase.from("profiles").select("username, full_name").eq("id", user.id).maybeSingle();
  if (error) to("/settings"); // cannot tell what is missing: the account page shows the profile honestly
  if (!data?.full_name) to("/profile-setup");
  if (!data?.username) to("/settings");
  to(`/u/${encodeURIComponent(data.username)}`);
}
