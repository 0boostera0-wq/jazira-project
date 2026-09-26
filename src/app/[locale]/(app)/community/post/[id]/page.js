import { notFound } from "next/navigation";
import { getT, setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import PostView from "@/components/community/PostView";
import { isUuid } from "@/components/community/model";

// The page is a static shell (the post and its comments are client islands):
// no post is prerendered at build, each id renders on its first request and is
// then served from the cache (dynamicParams stays true). A static render also
// lets notFound() answer a real 404 for malformed ids.
export function generateStaticParams() {
  return [];
}

// Post permalink (share links, notification targets). Member content → noindex.
export async function generateMetadata(props) {
  const params = await props.params;
  if (!isUuid(params.id)) notFound();
  const t = await getT("community", params.locale);
  return buildMetadata({
    locale: params.locale,
    key: "community",
    path: `/community/post/${params.id}`,
    title: t("thread.metaTitle"),
    description: t("thread.metaDescription"),
    noindex: true,
  });
}

export default async function CommunityPostPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  if (!isUuid(params.id)) notFound();
  return <PostView id={params.id} />;
}
