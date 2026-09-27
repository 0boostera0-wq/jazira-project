import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getT, setRequestLocale } from "@/i18n/server";
import { breadcrumbJsonLd, buildMetadata, jsonLd } from "@/lib/seo";
import { getRuntimeBank } from "@/lib/exams/engine/runtime-bank.server";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase-env";
import LearnView from "@/components/learn/LearnView";
import { learnHref, learnPageModel, loadSubjectPool } from "@/components/learn/learn-logic";
import { resolveLearn as resolve } from "./resolve";

// /learn/<subject node id>[/<unit|chapter|lesson local id>] (docs/CONTENT_ENGINE.md §7).
// Dynamic with ISR: any outline node renders on first visit and is cached for
// a day. Nothing here reads cookies or headers — the viewer's tier is applied
// by the ExamEntryPoints island. Outlines load per leaf (one JSON chunk); pool
// counts come from scope_pool_counts (public client) or the runtime bank.
export const dynamicParams = true;
export const revalidate = 86400;

/** No build-time pages: every path renders on its first request, then ISR. */
export function generateStaticParams() {
  return [];
}

// A cookie-less public client (anon key; scope_pool_counts is anon-readable).
let publicDb;
function publicClient() {
  if (publicDb === undefined) {
    publicDb = isSupabaseConfigured
      ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
      : null;
  }
  return publicDb;
}

const titleIn = (n, locale) => (locale === "en" && n.title_en ? n.title_en : n.title_ar) || "";
const META_KEY = { subject: "learnSubject", unit: "learnUnit", chapter: "learnUnit", lesson: "learnLesson" };

export async function generateMetadata(props) {
  const params = await props.params;
  const r = await resolve(params.path);
  // Unknown paths are answered by layout.js (a real 404, outside the loading boundary).
  if (!r) notFound();
  const { node, subject } = r.ctx;
  const name = node.kind === "subject" ? titleIn(node, params.locale) : `${titleIn(node, params.locale)} · ${titleIn(subject, params.locale)}`;
  return buildMetadata({
    locale: params.locale,
    key: META_KEY[node.kind],
    vars: { name },
    path: learnHref(node.id),
    // Lessons still being verified are not indexed.
    noindex: node.status !== "verified",
  });
}

export default async function LearnPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const { locale } = params;
  const r = await resolve(params.path);
  if (!r) notFound();
  const { tree, ctx } = r;

  let bank = null;
  try {
    bank = getRuntimeBank();
  } catch {
    bank = null;
  }
  const [t, tc, pool] = await Promise.all([
    getT("learn"),
    getT("common"),
    loadSubjectPool({ tree, subjectId: ctx.subject.id, bank, db: publicClient() }),
  ]);
  const model = learnPageModel(tree, ctx, pool);
  const ld = [
    { name: t("root"), path: "/curriculum" },
    ...model.trail.filter((n) => n.href || n.id === model.node.id).map((n) => ({ name: titleIn({ title_ar: n.title, title_en: n.title_en }, locale), path: n.href || learnHref(n.id) })),
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd(ld, locale)) }} />
      <LearnView model={model} t={t} tc={tc} locale={locale} />
    </>
  );
}
