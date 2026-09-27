// ============================================================================
// Answer inputs per question type (docs/CONTENT_ENGINE.md §7). The common
// inputs (choices, true/false, short answer, numeric) are part of the runner
// chunk; the matching and ordering inputs are runner extras loaded through
// next/dynamic with a skeleton, so a legacy mcq-only exam never downloads them.
//
//   inputFor(type) → the component; every input takes
//   { t, question, lang, dir, disabled } plus
//     choice types  { selected, onChoose(index), reveal? }
//     other types   { response, onRespond(response|null) }
// ============================================================================
import dynamic from "next/dynamic";
import { createElement } from "react";
import { InputSkeleton } from "../skeletons";
import McqInput from "./McqInput";
import NumericInput from "./NumericInput";
import ShortAnswerInput from "./ShortAnswerInput";
import TrueFalseInput from "./TrueFalseInput";

const loading = () => createElement(InputSkeleton);

export const loadMatching = () => import("./MatchingInput");
export const loadOrdering = () => import("./OrderingInput");
export const MatchingInput = dynamic(loadMatching, { ssr: false, loading });
export const OrderingInput = dynamic(loadOrdering, { ssr: false, loading });
export { McqInput, NumericInput, ShortAnswerInput, TrueFalseInput };

const INPUTS = {
  mcq: McqInput,
  true_false: TrueFalseInput,
  matching: MatchingInput,
  ordering: OrderingInput,
  short_answer: ShortAnswerInput,
  numeric: NumericInput,
};

/** The input component of a question type (unknown types: mcq). */
export const inputFor = (type) => INPUTS[type] || McqInput;

/** Prefetch the dynamic inputs a session needs (called when the runner mounts). */
export function preloadInputs(types) {
  const set = new Set(types);
  if (set.has("matching")) loadMatching().catch(() => {});
  if (set.has("ordering")) loadOrdering().catch(() => {});
}
