import { ArrowLeft } from "lucide-react";
import { getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { Link } from "@/i18n/navigation";
import GuidelinesCard from "./GuidelinesCard";
import PopularTags from "./PopularTags";
import PostThread from "./PostThread";

/** /community/post/[id] — one post with its comments, plus the community rail. */
export default async function PostView({ id }) {
  const t = await getT("community");
  return (
    <Messages ns={["community"]}>
      <nav aria-label={t("tag.breadcrumb")} className="mb-4">
        <Link href="/community" className="t-small inline-flex items-center gap-1.5 text-ink-3 hover:text-ink">
          <ArrowLeft size={15} aria-hidden="true" className="flip-rtl" />
          {t("page.name")}
        </Link>
      </nav>
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 lg:col-span-8">
          <h1 className="t-h2 mb-4">{t("thread.title")}</h1>
          <PostThread id={id} />
        </div>
        <aside aria-label={t("rail.label")} className="hidden lg:col-span-4 lg:block">
          <div className="sticky top-[calc(var(--topbar-h)+1.5rem)] space-y-5">
            <GuidelinesCard />
            <PopularTags limit={6} />
          </div>
        </aside>
      </div>
    </Messages>
  );
}
