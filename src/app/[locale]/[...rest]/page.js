import { notFound } from "next/navigation";

// Any unmatched path inside the locale tree renders the localized not-found page.
export default function CatchAll() {
  notFound();
}
