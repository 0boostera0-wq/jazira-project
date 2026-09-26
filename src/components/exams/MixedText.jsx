import { ltrRuns } from "./runner-logic";

/**
 * Arabic question text with its embedded Latin-script math isolated as
 * left-to-right runs (see runner-logic.ltrRuns). Renders plain text when
 * there is nothing to isolate.
 */
export default function MixedText({ text }) {
  const parts = ltrRuns(text);
  if (!parts.some((p) => p.ltr)) return text;
  return parts.map((p, i) => (p.ltr ? <bdi key={i} dir="ltr">{p.text}</bdi> : p.text));
}
