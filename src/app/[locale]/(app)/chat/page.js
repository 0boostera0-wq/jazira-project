import { setRequestLocale } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import Messenger from "@/components/chat/Messenger";

export async function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "chat", path: "/chat", noindex: true });
}

// Static shell; conversations, requests and the open thread load as client
// islands (src/components/chat). ?to=<member id> and ?c=<conversation id> are
// read on the client so the shell stays static.
export default function ChatPage({ params }) {
  setRequestLocale(params.locale);
  return (
    <Messages ns={["chat"]}>
      <Messenger />
    </Messages>
  );
}
