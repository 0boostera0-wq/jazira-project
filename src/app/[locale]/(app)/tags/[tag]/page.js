import { notFound } from "next/navigation";
import { setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import TagView from "@/components/community/TagView";
import { normalizeTag } from "@/components/community/model";

export function generateMetadata({ params }) {
  const tag = normalizeTag(params.tag) || "";
  return buildMetadata({
    locale: params.locale,
    key: "tag",
    vars: { tag },
    path: `/tags/${encodeURIComponent(tag)}`,
    noindex: !tag,
  });
}

// Shell renders statically; the count and the posts are client islands.
export default function TagPage({ params }) {
  setRequestLocale(params.locale);
  const tag = normalizeTag(params.tag);
  if (!tag) notFound();
  return <TagView tag={tag} locale={params.locale} />;
}
