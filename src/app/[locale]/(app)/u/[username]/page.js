import { notFound } from "next/navigation";
import { getT, setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import ProfileView from "@/components/community/profile/ProfileView";
import { PrivateProfile, ProfileUnavailable } from "@/components/community/profile/ProfileStates";
import { getPublicProfile, getPublicSettings } from "@/components/community/profile/queries";
import { normalizeUsername } from "@/components/community/model";

// Public data only (no visitor cookies) → cacheable; refreshed every 30 s.
// generateStaticParams makes that real: without it the segment rendered on
// every request (no-store). No handle is prerendered at build; each renders on
// its first request, then revalidates every 30 s (dynamicParams stays true).
export const revalidate = 30;

export function generateStaticParams() {
  return [];
}

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
  // notFound() here as well as in the page: with the static render above an
  // unknown or malformed handle answers HTTP 404 (not a 200 "soft 404").
  if (res.status === "not_found") notFound();
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
