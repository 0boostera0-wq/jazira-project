import { Fragment } from "react";
import { highlightParts } from "./model";

/**
 * Text with the query's matches marked. Safe by construction: the text is
 * split into slices and rendered as React text nodes — never as HTML.
 */
export default function Highlight({ text, query }) {
  const parts = highlightParts(text, query);
  return parts.map((p, i) =>
    p.match ? (
      <mark key={i} className="rounded-[3px] bg-gold-100 px-px text-ink [box-decoration-break:clone]">
        {p.text}
      </mark>
    ) : (
      <Fragment key={i}>{p.text}</Fragment>
    )
  );
}
