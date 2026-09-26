import { EyeOff, Search, Users } from "lucide-react";
import { getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";
import { PostSkeleton } from "../skeletons";
import PopularTags from "../PopularTags";
import WhoToFollow from "../WhoToFollow";
import OwnerNotice from "./OwnerNotice";

/**
 * Ways forward under a state card (never a small card alone on a wide
 * screen): active learners and the community's topics — both public, neither
 * says anything about the member of this page.
 */
function CommunityRails() {
  return (
    <div className="mt-6 grid gap-6 md:grid-cols-2">
      <WhoToFollow />
      <PopularTags limit={6} />
    </div>
  );
}

/**
 * A member who posts anonymously: nothing on this page may connect them to
 * their community activity, so it shows no name, photo, stats or posts.
 * The owner sees why and how to change it.
 */
export async function PrivateProfile({ userId }) {
  const t = await getT("profile");
  return (
    <Messages ns={["profile", "community"]}>
      <div className="mx-auto max-w-4xl">
        <section className="surface animate-in overflow-hidden">
          <div aria-hidden="true" className="relative h-24 bg-aura bg-surface-2">
            <div className="bg-dots absolute inset-0 opacity-70" />
          </div>
          <div className="px-6 pb-8 text-center sm:px-10">
            <span className="relative z-10 -mt-12 inline-grid h-24 w-24 place-items-center rounded-full bg-surface-3 text-ink-3 ring-4 ring-surface">
              <EyeOff size={34} strokeWidth={1.6} aria-hidden="true" />
            </span>
            <h1 className="t-h2 mt-4">{t("private.title")}</h1>
            <p className="t-body mx-auto mt-2 max-w-md text-ink-3">{t("private.body")}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              <Button href="/community" iconStart={Users}>{t("private.community")}</Button>
            </div>
            <OwnerNotice userId={userId} />
          </div>
        </section>
        <CommunityRails />
      </div>
    </Messages>
  );
}

/**
 * Supabase unreachable / not configured: honest, retryable — the same split
 * composition as ProfileNotFound, with the community rails below (they show
 * their own honest "unavailable" / starter-topic states).
 */
export async function ProfileUnavailable() {
  const t = await getT("profile");
  return (
    <Messages ns={["community"]}>
      <div className="mx-auto max-w-4xl">
        <section className="surface animate-in grid items-center gap-8 overflow-hidden p-6 sm:p-10 md:grid-cols-2">
          <div className="order-2 text-center md:order-1 md:text-start">
            <h1 className="t-h2">{t("unavailable.title")}</h1>
            <p className="t-body mt-2 text-ink-3">{t("unavailable.body")}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2.5 md:justify-start">
              <Button href="/community" iconStart={Users}>{t("private.community")}</Button>
              <Button href="/search" variant="secondary" iconStart={Search}>{t("notFound.search")}</Button>
            </div>
          </div>
          <div aria-hidden="true" className="art-frame order-1 mx-auto w-full max-w-[320px] rounded-xl md:order-2">
            <Illustration id="support.offline" aspect="4/3" sizes="320px" />
          </div>
        </section>
        <CommunityRails />
      </div>
    </Messages>
  );
}

/**
 * notFound() body for /u/[username]: the 404 plus real ways forward (active
 * learners, the community's topics) instead of an empty screen below it.
 */
export async function ProfileNotFound() {
  const t = await getT("profile");
  return (
    <Messages ns={["community"]}>
      <div className="mx-auto max-w-4xl">
        <section className="surface animate-in grid items-center gap-8 overflow-hidden p-6 sm:p-10 md:grid-cols-2">
          <div className="order-2 text-center md:order-1 md:text-start">
            <p className="t-eyebrow">404</p>
            <h1 className="t-h2 mt-2">{t("notFound.title")}</h1>
            <p className="t-body mt-2 text-ink-3">{t("notFound.body")}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2.5 md:justify-start">
              <Button href="/community" iconStart={Users}>{t("private.community")}</Button>
              <Button href="/search" variant="secondary" iconStart={Search}>{t("notFound.search")}</Button>
            </div>
          </div>
          <div aria-hidden="true" className="art-frame order-1 mx-auto w-full max-w-[320px] rounded-xl md:order-2">
            <Illustration id="support.not-found" aspect="4/3" sizes="320px" />
          </div>
        </section>
        <CommunityRails />
      </div>
    </Messages>
  );
}

/** Route skeleton mirroring ProfileView. */
export function ProfileSkeleton() {
  return (
    <div aria-busy="true" className="animate-fade">
      <div className="surface overflow-hidden">
        <div className="h-24 bg-surface-2 sm:h-32" />
        <div className="px-5 pb-5 sm:px-7 sm:pb-7">
          <div className="relative z-10 -mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <Skeleton rounded="full" className="h-[104px] w-[104px] ring-4 ring-surface" />
            <div className="flex gap-2"><Skeleton rounded="full" className="h-11 w-28" /><Skeleton rounded="full" className="h-11 w-28" /></div>
          </div>
          <Skeleton className="mt-4 h-8 w-56" />
          <Skeleton className="mt-2 h-4 w-28" />
          <SkeletonText lines={2} className="mt-4 max-w-xl" />
          <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line/10 bg-line/10 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2 bg-surface px-4 py-3.5"><Skeleton className="h-6 w-12" /><Skeleton className="h-3 w-16" /></div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-12 lg:gap-8">
        <div className="space-y-4 lg:col-span-8">
          <div className="flex gap-5 border-b border-line/12 pb-2.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-5 w-20" />)}</div>
          <PostSkeleton />
          <PostSkeleton media />
        </div>
        <div className="hidden space-y-5 lg:col-span-4 lg:block">
          <Skeleton rounded="lg" className="h-52" />
          <Skeleton rounded="lg" className="h-72" />
        </div>
      </div>
    </div>
  );
}

