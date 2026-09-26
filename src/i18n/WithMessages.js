// Server component: make extra namespaces available to client components below.
//
//   <Messages ns={["exams"]}>
//     <ExamBuilder />        ← client component calling useT("exams")
//   </Messages>
//
// Only the listed namespaces are serialized into the RSC payload for this subtree.
// Prefer dotted subtrees when an island reads a small part of a big namespace:
//
//   <Messages ns={["support.faq", "support.topics", "support.shared"]}>
//     <FaqExplorer />        ← still calls useT("support") → t("faq.title")
//   </Messages>
//
// Nested <Messages> deep-merge, so a subtree never hides keys a parent provided.

import { MessagesProvider } from "./client";
import { getLocale, loadMessages } from "./server";

export default async function Messages({ ns, children }) {
  const messages = await loadMessages(getLocale(), Array.isArray(ns) ? ns : [ns]);
  return <MessagesProvider messages={messages}>{children}</MessagesProvider>;
}
