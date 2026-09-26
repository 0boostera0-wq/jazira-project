import { setRequestLocale } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import AssistantWorkspace from "@/components/assistant/AssistantWorkspace";

export async function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "assistant", path: "/assistant", noindex: true });
}

// Static shell; the conversation, balance and history are client islands that
// load independently (see src/components/assistant).
export default function AssistantPage({ params }) {
  setRequestLocale(params.locale);
  return (
    <Messages ns={["assistant"]}>
      <AssistantWorkspace />
    </Messages>
  );
}
