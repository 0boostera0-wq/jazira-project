import { ArrowLeft, Hash } from "lucide-react";
import { getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { Link } from "@/i18n/navigation";
import IconTile from "@/components/ui/IconTile";
import Feed from "./Feed";
import GuidelinesCard from "./GuidelinesCard";
import PopularTags from "./PopularTags";
import TagCount from "./TagCount";
import WhoToFollow from "./WhoToFollow";
import { POST_KINDS, curatedFor } from "./topics";
import { textProps } from "./text";

/** /tags/[tag] — topic header with the real post count · feed for the tag (composer locked to it) · rail. */
export default async function TagView({ tag, locale }) {
  const t = await getT("community");
  const curated = curatedFor(tag);
  const kind = curated && POST_KINDS.includes(curated);
  const name = curated && locale !== "ar" ? t(kind ? `filters.kinds.${curated.id}` : `topics.${curated.id}`) : null;
  const lead = curated ? t(`tag.about.${curated.id}`) : t("tag.lead", { tag: `#${tag}` });

  return (
    <Messages ns={["community"]}>
      <nav aria-label={t("tag.breadcrumb")} className="mb-4">
        <Link href="/community" className="t-small inline-flex items-center gap-1.5 text-ink-3 hover:text-ink">
          <ArrowLeft size={15} aria-hidden="true" className="flip-rtl" />
          {t("page.name")}
        </Link>
      </nav>
      <header className="surface animate-in flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-7">
        <IconTile icon={Hash} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="t-eyebrow">{t("tag.eyebrow")}</p>
          <h1 className="t-h1 mt-1 break-words">
            <span {...textProps(tag)}>#{tag}</span>
            {name && <span className="ms-3 align-middle text-lg font-medium text-ink-3">{name}</span>}
          </h1>
          <p className="t-lead mt-2 max-w-2xl">{lead}</p>
        </div>
        <TagCount tag={tag} className="shrink-0" />
      </header>

      <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-12 lg:gap-8">
        <section aria-label={t("feed.title")} className="min-w-0 lg:col-span-8">
          <Feed scope="tag" tag={tag} withComposer guidelinesNote />
        </section>
        <aside aria-label={t("rail.label")} className="hidden lg:col-span-4 lg:block">
          <div className="space-y-5">
            <GuidelinesCard />
            <WhoToFollow />
          </div>
          <div className="sticky top-[calc(var(--topbar-h)+1.5rem)] mt-5">
            <PopularTags current={tag} limit={7} />
          </div>
        </aside>
      </div>
    </Messages>
  );
}
