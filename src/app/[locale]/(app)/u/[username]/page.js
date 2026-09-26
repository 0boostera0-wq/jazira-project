import { notFound } from "next/navigation";
import { getT, setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import ProfileView from "@/components/community/profile/ProfileView";
import { PrivateProfile, ProfileUnavailable } from "@/components/community/profile/ProfileStates";
import { getPublicProfile, getPublicSettings } from "@/components/community/profile/queries";
import { normalizeUsername } from "@/components/community/model";

// Public data only (no visitor cookies) → cacheable; refreshed every 30 s.
export const revalidate = 30;

export async function generateMetadata({ params }) {
  const handle = normalizeUsername(params.username) || "";
  const path = `/u/${encodeURIComponent(handle)}`;
  const res = await getPublicProfile(params.username);
  if (res.status === "ok") {
    const p = res.profile;
    if (p.anonymous_community) {
      const t = await getT("profile", params.locale);
      return buildMetadata({ locale: params.locale, key: "user", vars: { name: t("private.title") }, path, noindex: true });
    }
    return buildMetadata({ locale: params.locale, key: "user", vars: { name: p.full_name || `@${p.username}` }, path });
  }
  if (res.status === "not_found") return buildMetadata({ locale: params.locale, key: "notFound", path, noindex: true });
  // Unavailable right now: name the page by its handle, never index it.
  return buildMetadata({ locale: params.locale, key: "user", vars: { name: handle ? `@${handle}` : "" }, path, noindex: true });
}

export default async function UserProfilePage({ params }) {
  setRequestLocale(params.locale);
  const res = await getPublicProfile(params.username);
  if (res.status === "not_found") notFound();
  if (res.status === "unavailable") return <ProfileUnavailable />;
  const profile = res.profile;
  if (profile.anonymous_community) return <PrivateProfile userId={profile.id} />;
  const settings = await getPublicSettings(profile.id);
  return <ProfileView profile={profile} settings={settings} locale={params.locale} />;
}
