import { getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import GuidelinesCard from "./GuidelinesCard";
import PopularTags from "./PopularTags";
import PostThread from "./PostThread";
import { LG_UP } from "./breakpoints";

/** /community/post/[id] — one post with its comments, plus the community rail. */
export default async function PostView({ id }) {
  const t = await getT("community");
  return (
    <Messages ns={["community"]}>
      <Breadcrumbs
        label={t("tag.breadcrumb")}
        className="mb-4"
        items={[{ label: t("page.name"), href: "/community" }, { label: t("thread.title") }]}
      />
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 lg:col-span-8">
          <h1 className="t-h2 mb-4">{t("thread.title")}</h1>
          <PostThread id={id} />
        </div>
        <aside aria-label={t("rail.label")} className="hidden lg:col-span-4 lg:block">
          <div className="sticky top-[calc(var(--topbar-h)+1.5rem)] space-y-5">
            <GuidelinesCard />
            <PopularTags limit={6} gate={LG_UP} />
          </div>
        </aside>
      </div>
    </Messages>
  );
}
