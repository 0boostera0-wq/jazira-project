// Server component: make extra namespaces available to client components below.
//
//   <Messages ns={["exams"]}>
//     <ExamBuilder />        ← client component calling useT("exams")
//   </Messages>
//
// Only the listed namespaces are serialized into the RSC payload for this subtree.

import { MessagesProvider } from "./client";
import { getLocale, loadMessages } from "./server";

export default async function Messages({ ns, children }) {
  const messages = await loadMessages(getLocale(), Array.isArray(ns) ? ns : [ns]);
  return <MessagesProvider messages={messages}>{children}</MessagesProvider>;
}
