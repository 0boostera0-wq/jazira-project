import { notFound } from "next/navigation";
import { getT, setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import PostView from "@/components/community/PostView";
import { isUuid } from "@/components/community/model";

// Post permalink (share links, notification targets). Member content → noindex.
export async function generateMetadata({ params }) {
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

export default function CommunityPostPage({ params }) {
  setRequestLocale(params.locale);
  if (!isUuid(params.id)) notFound();
  return <PostView id={params.id} />;
}
