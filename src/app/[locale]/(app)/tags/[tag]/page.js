import { notFound } from "next/navigation";
import { setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import TagView from "@/components/community/TagView";
import { normalizeTag } from "@/components/community/model";

// No tag is prerendered at build; each one renders on its first request and
// is then served statically (dynamicParams stays true). The page reads no
// cookies, headers or searchParams — the count and the posts are client
// islands. A static render is also what lets notFound() answer a real 404: a
// streamed (dynamic) render has already sent 200 with the loading shell.
export function generateStaticParams() {
  return [];
}

export function generateMetadata({ params }) {
  const tag = normalizeTag(params.tag);
  if (!tag) notFound();
  return buildMetadata({
    locale: params.locale,
    key: "tag",
    vars: { tag },
    path: `/tags/${encodeURIComponent(tag)}`,
  });
}

export default function TagPage({ params }) {
  setRequestLocale(params.locale);
  const tag = normalizeTag(params.tag);
  if (!tag) notFound();
  return <TagView tag={tag} locale={params.locale} />;
}
