import { notFound } from "next/navigation";
import { setRequestLocale } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import AttemptView from "@/components/exams/AttemptView";

// "local" (this tab's practice attempt), a local practice id, or a saved attempt uuid.
const VALID_ID = /^(?:local|local-[A-Za-z0-9-]{8,64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "examAttempt", path: `/exams/attempt/${params.id}`, noindex: true });
}

// Runner + results. The whole attempt lifecycle is one client island: the
// shell (loading.js → RunnerSkeleton) paints immediately, and the exam renders
// from the builder's hand-off without another request.
export default async function ExamAttemptPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  if (!VALID_ID.test(params.id || "")) notFound();
  return (
    <Messages ns={["exams"]}>
      <AttemptView id={params.id} />
    </Messages>
  );
}
