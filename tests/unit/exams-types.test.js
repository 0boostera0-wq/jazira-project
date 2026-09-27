// Exam UI for every question type (docs/CONTENT_ENGINE.md §2.8, §5.4, §5.7, §7):
// response reducers, completeness, display ↔ canonical mapping helpers (against
// WP6's engine maps), review verdicts, the runner session / reducer for template
// sessions, results and history helpers, message keys, and the rendered inputs
// (legacy mcq markup unchanged; keyboard / screen-reader access for matching and
// ordering; no canonical ids reach the markup).
import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// i18n/client and i18n/navigation are JSX-in-.js modules (built by Next); the
// components only need these hooks here.
vi.mock("@/i18n/client", () => ({ useLocale: () => ({ locale: "ar", isRTL: true }), useT: () => (k) => k }));
vi.mock("@/i18n/navigation", async () => {
  const { createElement: h } = await import("react");
  return {
    Link: ({ href, children, className }) => h("a", { href, className }, children),
    useRouter: () => ({ push() {} }),
    usePathname: () => "/",
  };
});

import {
  QUESTION_TYPES, typeOf, isTemplateItem, isChoiceType, contentLang, choicesOf, normalizeResponse, responseOf, isAnswered, pairFor, setPair,
  matchingProgress, workingOrder, moveItem, orderResponse, textResponse, numericResponse, numericIssue, isComplete, verdictOf, reviewResponse,
  reviewCorrect, optionRows, matchingRows, orderingRows, valueText, hasReveal, explanationOf, pagesLabel, safeHttps, emptyResponse,
  choiceState, safeAppPath, lessonHref, prepTopicOf, responseIssue,
} from "@/components/exams/question-logic";
import ReviewList from "@/components/exams/ReviewList";
import { toRunnerSession, runnerReducer, summarize, answersPayload, mergeDrafts, templateRefOf } from "@/components/exams/runner-logic";
import {
  itemStatus, reviewCounts, filterReview, isTemplateResult, templateName, sessionLessonTitle, resultAttemptId, retakeConfig, mistakesConfig,
  lessonRows, termRows, templateSummary, errorMessage,
} from "@/components/exams/results-logic";
import { attemptScopeKey, previousOnScope, wilsonLower, weakLessons, repeatedMistakes, recommendationRows } from "@/components/exams/stats-logic";
import { attemptHref } from "@/components/exams/handoff";
import { inputFor } from "@/components/exams/questions";
import McqInput from "@/components/exams/questions/McqInput";
import TrueFalseInput from "@/components/exams/questions/TrueFalseInput";
import MatchingInput from "@/components/exams/questions/MatchingInput";
import OrderingInput from "@/components/exams/questions/OrderingInput";
import ShortAnswerInput from "@/components/exams/questions/ShortAnswerInput";
import NumericInput from "@/components/exams/questions/NumericInput";
import QuestionCard from "@/components/exams/QuestionCard";
import ExplainToggle from "@/components/exams/ExplainToggle";
import { parseNumber } from "@/lib/content/answers";
import { displayMaps, publicQuestion } from "@/lib/exams/engine/shuffle";
import { correctDisplay, gradeItem, parseDisplayResponse } from "@/lib/exams/engine/grade";
import { TEMPLATE_IDS } from "@/lib/exams/engine/exam-templates";
import { loadMessages } from "@/i18n/messages";
import { createTranslator } from "@/i18n/translator";

const RPC = (name) => JSON.parse(readFileSync(path.resolve("tests/fixtures/contracts/rpc", `${name}.json`), "utf8"));
const html = (Component, props) => renderToStaticMarkup(createElement(Component, props));
const noop = () => {};

const translators = {};
beforeAll(async () => {
  for (const locale of ["ar", "en"]) {
    const msgs = await loadMessages(locale, ["exams", "common"]);
    translators[locale] = { t: createTranslator(locale, msgs, "exams"), tc: createTranslator(locale, msgs, "common") };
  }
});

// Display-shaped questions as the start payload sends them (no ids, §5.7).
const Q = {
  mcq: { position: 1, key: "q-a", type: "mcq", language: "ar", stem: "ما ناتج 8 × 7؟", options: [{ index: 0, text: "54" }, { index: 1, text: "56" }, { index: 2, text: "63" }], choices: ["54", "56", "63"], public: {} },
  tf: { position: 2, key: "q-b", type: "true_false", language: "en", stem: "Water boils at 100 °C at sea level.", options: [{ index: 0, text: "True" }, { index: 1, text: "False" }], choices: ["True", "False"], public: {} },
  matching: {
    position: 3, key: "q-c", type: "matching", language: "ar", stem: "صِل", options: [], choices: [],
    public: { left: [{ index: 0, text: "5²" }, { index: 1, text: "3²" }, { index: 2, text: "2³" }], right: [{ index: 0, text: "25" }, { index: 1, text: "9" }, { index: 2, text: "10" }, { index: 3, text: "8" }], scoring: "partial" },
  },
  ordering: { position: 4, key: "q-d", type: "ordering", language: "ar", stem: "رتّب", options: [], choices: [], public: { items: [{ index: 0, text: "ج" }, { index: 1, text: "أ" }, { index: 2, text: "ب" }], criterion: "ascending" } },
  short: { position: 5, key: "q-e", type: "short_answer", language: "ar", stem: "ما عاصمة المملكة؟", options: [], choices: [], public: { max_chars: 20 } },
  numeric: { position: 6, key: "q-f", type: "numeric", language: "ar", stem: "طول الضلع؟", options: [], choices: [], public: { unit: { text: "سم", required: true }, input: { allow_fraction: false, max_decimals: 2 } } },
};
const LEGACY = { position: 1, key: "aq-001", topic: "analogy", difficulty: 2, stem: "قلم : كتابة", choices: ["سكين : قطع", "ماء : شرب", "باب : بيت", "شمس : ضوء"] };

// ── types and languages ─────────────────────────────────────────────────────
describe("question types", () => {
  it("knows the six types; legacy items are mcq", () => {
    expect(QUESTION_TYPES).toEqual(["mcq", "true_false", "matching", "ordering", "short_answer", "numeric"]);
    expect(typeOf(LEGACY)).toBe("mcq");
    expect(isTemplateItem(LEGACY)).toBe(false);
    expect(typeOf(Q.matching)).toBe("matching");
    expect(isTemplateItem(Q.numeric)).toBe(true);
    expect(isChoiceType("true_false")).toBe(true);
    expect(isChoiceType("ordering")).toBe(false);
    expect(typeOf({ type: "essay" })).toBe("mcq");
  });

  it("takes lang/dir from the item (legacy items are Arabic)", () => {
    expect(contentLang(LEGACY)).toEqual({ lang: "ar", dir: "rtl" });
    expect(contentLang(Q.tf)).toEqual({ lang: "en", dir: "ltr" });
    expect(contentLang(Q.mcq)).toEqual({ lang: "ar", dir: "rtl" });
  });

  it("reads choices from `choices` or display-indexed options", () => {
    expect(choicesOf(LEGACY)).toEqual(LEGACY.choices);
    expect(choicesOf({ options: [{ index: 1, text: "b" }, { index: 0, text: "a" }] })).toEqual(["a", "b"]);
  });

  it("has an input for every type", () => {
    expect(inputFor("mcq")).toBe(McqInput);
    expect(inputFor("true_false")).toBe(TrueFalseInput);
    expect(inputFor("short_answer")).toBe(ShortAnswerInput);
    expect(inputFor("numeric")).toBe(NumericInput);
    for (const type of QUESTION_TYPES) expect(inputFor(type)).toBeTruthy();
    expect(inputFor("unknown")).toBe(McqInput);
  });
});

// ── response reducers ───────────────────────────────────────────────────────
describe("response reducers", () => {
  it("normalizes responses to the whitelisted display shape (empty → null)", () => {
    expect(normalizeResponse("mcq", { option_index: 2, extra: 1 })).toEqual({ option_index: 2 });
    expect(normalizeResponse("mcq", 1)).toEqual({ option_index: 1 });
    expect(normalizeResponse("mcq", { option_index: -1 })).toBeNull();
    expect(normalizeResponse("true_false", { option_index: 1.5 })).toBeNull();
    expect(normalizeResponse("matching", { pairs: [] })).toBeNull();
    expect(normalizeResponse("matching", { pairs: [[2, 1], [0, 3], [0, 2], [1, 1], ["x", 0]] })).toEqual({ pairs: [[0, 3], [2, 1]] });
    expect(normalizeResponse("ordering", { order: [2, 0, 1] })).toEqual({ order: [2, 0, 1] });
    expect(normalizeResponse("ordering", { order: [0, 0, 1] })).toBeNull();
    expect(normalizeResponse("ordering", { order: [] })).toBeNull();
    expect(normalizeResponse("short_answer", { text: "   " })).toBeNull();
    expect(normalizeResponse("short_answer", { text: " الرياض " })).toEqual({ text: " الرياض " });
    expect(normalizeResponse("numeric", { value: "" })).toBeNull();
    expect(normalizeResponse("numeric", { value: 12.5 })).toEqual({ value: "12.5" });
    expect(normalizeResponse("numeric", { value: "١٢٫٥", unit: "سم" })).toEqual({ value: "١٢٫٥", unit: "سم" });
    expect(normalizeResponse("numeric", { value: "3", unit: " " })).toEqual({ value: "3" });
    expect(normalizeResponse("essay", { text: "x" })).toBeNull();
    expect(normalizeResponse("mcq", null)).toBeNull();
  });

  it("matching: one pair per left and per right item; re-pairing moves the right item", () => {
    let r = setPair(null, 0, 3);
    expect(r).toEqual({ pairs: [[0, 3]] });
    r = setPair(r, 1, 1);
    expect(pairFor(r, 1)).toBe(1);
    r = setPair(r, 2, 3); // 3 moves from left 0 to left 2
    expect(r).toEqual({ pairs: [[1, 1], [2, 3]] });
    expect(pairFor(r, 0)).toBeNull();
    r = setPair(r, 1, null); // unpair
    expect(r).toEqual({ pairs: [[2, 3]] });
    expect(setPair(r, 2, null)).toBeNull();
  });

  it("ordering: the working order is the shown order until the learner answers", () => {
    expect(workingOrder(Q.ordering, null)).toEqual([0, 1, 2]);
    expect(workingOrder(Q.ordering, { order: [2, 0, 1] })).toEqual([2, 0, 1]);
    expect(workingOrder(Q.ordering, { order: [0, 1] })).toEqual([0, 1, 2]); // wrong length: ignored
    expect(moveItem([0, 1, 2], 2, 0)).toEqual([2, 0, 1]);
    expect(moveItem([0, 1, 2], 0, 1)).toEqual([1, 0, 2]);
    expect(moveItem([0, 1, 2], 0, -1)).toEqual([0, 1, 2]);
    expect(moveItem([0, 1, 2], 2, 3)).toEqual([0, 1, 2]);
    expect(orderResponse([1, 2, 0])).toEqual({ order: [1, 2, 0] });
  });

  it("short answer is cut to max_chars; numeric keeps the typed text", () => {
    expect(textResponse("abcdef", 3)).toEqual({ text: "abc" });
    expect(textResponse("", 3)).toBeNull();
    expect(textResponse("x".repeat(100))).toEqual({ text: "x".repeat(80) });
    expect(numericResponse({ value: "1,250", unit: "سم" })).toEqual({ value: "1,250", unit: "سم" });
    expect(numericResponse({ value: "", unit: "سم" })).toBeNull();
    expect(numericResponse()).toBeNull();
  });

  it("flags numbers the server would refuse, with the shared parser", () => {
    expect(numericIssue(parseNumber("0,125"))).toBe("ambiguous_separator");
    expect(numericIssue(parseNumber("abc"))).toBe("invalid_number");
    expect(numericIssue(parseNumber("1,250"))).toBeNull();
    expect(numericIssue(parseNumber("٢٫٥"))).toBeNull();
    expect(numericIssue(parseNumber("3/4"), { allow_fraction: false, max_decimals: null })).toBe("fraction_not_allowed");
    expect(numericIssue(parseNumber("3/4"), { allow_fraction: true, max_decimals: null })).toBeNull();
    expect(numericIssue(parseNumber("1.125"), { allow_fraction: true, max_decimals: 2 })).toBe("too_many_decimals");
    expect(numericIssue(parseNumber("1.12"), { allow_fraction: true, max_decimals: 2 })).toBeNull();
    expect(numericIssue(null)).toBeNull();
  });

  it("empty responses for clearing a saved answer", () => {
    expect(emptyResponse("mcq")).toEqual({ option_index: null });
    expect(emptyResponse("matching")).toEqual({ pairs: [] });
    expect(emptyResponse("ordering")).toEqual({ order: [] });
    expect(emptyResponse("short_answer")).toEqual({ text: "" });
    expect(emptyResponse("numeric")).toEqual({ value: "" });
    // the engine reads every one of them as "unanswered"
    for (const type of QUESTION_TYPES) {
      const parsed = parseDisplayResponse(type, emptyResponse(type));
      expect(parsed).toEqual({ ok: true, response: null });
    }
  });
});

// ── completeness ────────────────────────────────────────────────────────────
describe("answered and complete", () => {
  it("choice items answer through `selected`, typed items through `response`", () => {
    expect(isAnswered(LEGACY, { selected: 0 })).toBe(true);
    expect(isAnswered(LEGACY, { selected: null })).toBe(false);
    expect(responseOf(Q.mcq, { selected: 2 })).toEqual({ option_index: 2 });
    expect(responseOf(Q.mcq, { selected: null, response: { option_index: 1 } })).toBeNull();
    expect(isAnswered(Q.ordering, { selected: null, response: { order: [1, 0, 2] } })).toBe(true);
    expect(isAnswered(Q.short, { selected: null, response: { text: " " } })).toBe(false);
  });

  it("a partly matched item is answered but not complete", () => {
    const part = { pairs: [[0, 0]] };
    expect(matchingProgress(Q.matching, part)).toEqual({ done: 1, total: 3 });
    expect(isAnswered(Q.matching, { response: part })).toBe(true);
    expect(isComplete(Q.matching, part)).toBe(false);
    expect(isComplete(Q.matching, { pairs: [[0, 0], [1, 1], [2, 3]] })).toBe(true);
    expect(isComplete(Q.ordering, { order: [0, 1, 2] })).toBe(true);
    expect(isComplete(Q.short, null)).toBe(false);
  });
});

// ── display ↔ canonical (the UI only ever holds display indexes) ────────────
describe("display ↔ canonical mapping", () => {
  const SEED = "0123456789abcdef0123456789abcdef";
  const mk = (type, key, payload) => {
    const { answer: _answer, ...pub } = payload;
    return { item: { key, type, language: "ar", stem: "س؟", public: pub, shuffle_options: true }, key: { payload } };
  };
  const mcq = mk("mcq", "q-m1-math-aaaaaaaaaa", {
    options: [{ id: "o1a2b3c", text: "أحمر" }, { id: "o9f8e7d", text: "أزرق" }, { id: "o5c4b3a", text: "أخضر" }, { id: "o0d1e2f", text: "أصفر" }],
    answer: { option_id: "o5c4b3a" },
    fixed_order_reason: null,
  });
  const matching = mk("matching", "q-m1-math-bbbbbbbbbb", {
    left: [{ id: "l111111", text: "5²" }, { id: "l222222", text: "3²" }, { id: "l333333", text: "2³" }],
    right: [{ id: "r444444", text: "25" }, { id: "r555555", text: "9" }, { id: "r666666", text: "10" }, { id: "r777777", text: "8" }],
    answer: { pairs: [["l111111", "r444444"], ["l222222", "r555555"], ["l333333", "r777777"]] },
    scoring: "partial",
  });
  const ordering = mk("ordering", "q-m1-math-cccccccccc", {
    items: [{ id: "s111111", text: "3" }, { id: "s222222", text: "1" }, { id: "s333333", text: "2" }],
    answer: { order: ["s222222", "s333333", "s111111"] },
    criterion: "ascending",
  });

  it("an mcq choice made on the shown options grades through the session's choice order", () => {
    const maps = displayMaps(SEED, mcq.item);
    const shown = publicQuestion(mcq.item, 1, maps);
    expect(JSON.stringify(shown)).not.toMatch(/o1a2b3c|o9f8e7d|o5c4b3a|o0d1e2f/);
    const right = choicesOf(shown).indexOf("أخضر");
    const state = { answers: { 1: { selected: null, response: null, flagged: false } }, current: 1, positions: [1] };
    const answer = runnerReducer(state, { type: "select", position: 1, index: right }).answers[1];
    const display = responseOf(shown, answer);
    expect(parseDisplayResponse("mcq", display)).toEqual({ ok: true, response: display });
    expect(gradeItem(mcq.item, mcq.key, maps, display)).toMatchObject({ score: 1, verdict: "correct", canonical: { option_id: "o5c4b3a" } });
    const correct = correctDisplay(mcq.item, mcq.key, maps);
    expect(correct).toEqual({ option_index: right });
    const rows = optionRows({ ...shown, response: { option_index: (right + 1) % 4 }, correct_response: correct });
    expect(rows.filter((r) => r.correct).map((r) => r.text)).toEqual(["أخضر"]);
    expect(rows.filter((r) => r.chosen)).toHaveLength(1);
  });

  it("matching pairs built with setPair grade per pair (partial credit) and review by text", () => {
    const maps = displayMaps(SEED, matching.item);
    const shown = publicQuestion(matching.item, 2, maps);
    expect(JSON.stringify(shown)).not.toMatch(/l\d{6}|r\d{6}/);
    const li = (text) => shown.public.left.find((x) => x.text === text).index;
    const ri = (text) => shown.public.right.find((x) => x.text === text).index;
    let r = setPair(null, li("5²"), ri("25"));
    r = setPair(r, li("3²"), ri("9"));
    r = setPair(r, li("2³"), ri("10")); // wrong: 2³ = 8
    expect(parseDisplayResponse("matching", r).ok).toBe(true);
    const g = gradeItem(matching.item, matching.key, maps, r);
    expect(g.verdict).toBe("partial");
    expect(g.score).toBeCloseTo(2 / 3, 4);
    const rows = matchingRows({ ...shown, response: r, correct_response: correctDisplay(matching.item, matching.key, maps) });
    const byLeft = Object.fromEntries(rows.map((x) => [x.left, x]));
    expect(byLeft["5²"]).toMatchObject({ chosen: "25", correct: "25", ok: true });
    expect(byLeft["2³"]).toMatchObject({ chosen: "10", correct: "8", ok: false });
    // fixing the last pair gives full marks
    const fixed = setPair(r, li("2³"), ri("8"));
    expect(gradeItem(matching.item, matching.key, maps, fixed)).toMatchObject({ score: 1, verdict: "correct" });
  });

  it("an order built with the move buttons grades all-or-nothing", () => {
    const maps = displayMaps(SEED, ordering.item, { answerOrder: ordering.key.payload.answer.order });
    const shown = publicQuestion(ordering.item, 3, maps);
    expect(JSON.stringify(shown)).not.toMatch(/s\d{6}/);
    const idx = (text) => shown.public.items.find((x) => x.text === text).index;
    // the shown order is never already the answer (§5.4 swap rule)
    expect(gradeItem(ordering.item, ordering.key, maps, orderResponse(workingOrder(shown, null))).score).toBe(0);
    let order = workingOrder(shown, null);
    for (const [target, text] of [[0, "1"], [1, "2"], [2, "3"]]) order = moveItem(order, order.indexOf(idx(text)), target);
    const display = orderResponse(order);
    expect(parseDisplayResponse("ordering", display).ok).toBe(true);
    expect(gradeItem(ordering.item, ordering.key, maps, display)).toMatchObject({ score: 1, verdict: "correct" });
    const rows = orderingRows({ ...shown, response: display, correct_response: correctDisplay(ordering.item, ordering.key, maps) });
    expect(rows.map((x) => [x.chosen, x.correct, x.ok])).toEqual([["1", "1", true], ["2", "2", true], ["3", "3", true]]);
  });

  it("every response the inputs produce passes the engine's strict parser unchanged", () => {
    const samples = [
      ["mcq", { option_index: 3 }],
      ["true_false", { option_index: 0 }],
      ["matching", setPair(setPair(null, 0, 2), 1, 0)],
      ["ordering", orderResponse([2, 0, 1])],
      ["short_answer", textResponse("الرياض", 20)],
      ["numeric", numericResponse({ value: "12.5", unit: "سم" })],
      ["numeric", numericResponse({ value: "٣/٤" })],
    ];
    for (const [type, r] of samples) expect(parseDisplayResponse(type, r)).toEqual({ ok: true, response: r });
  });
});

// ── review verdicts ─────────────────────────────────────────────────────────
describe("review verdicts", () => {
  it("template items carry their verdict; voided wins; legacy items use is_correct", () => {
    expect(verdictOf({ type: "matching", verdict: "partial", voided: null })).toBe("partial");
    expect(verdictOf({ type: "mcq", verdict: "correct", voided: "question_updated" })).toBe("voided");
    expect(verdictOf({ type: "mcq", verdict: null, response: null })).toBe("unanswered");
    expect(verdictOf({ type: "mcq", verdict: null, response: { option_index: 1 } })).toBe("incorrect");
    expect(verdictOf({ selected_index: 1, is_correct: true })).toBe("correct");
    expect(verdictOf({ selected_index: 1, is_correct: false })).toBe("incorrect");
    expect(verdictOf({ selected_index: null })).toBe("unanswered");
    expect(verdictOf(null)).toBe("unanswered");
  });

  it("reads the learner's and the correct response of either shape", () => {
    expect(reviewResponse({ selected_index: 2 })).toEqual({ option_index: 2 });
    expect(reviewCorrect({ correct_index: 0 })).toEqual({ option_index: 0 });
    expect(reviewCorrect({ type: "mcq", correct_response: null })).toBeNull(); // key-reveal cap
    expect(reviewCorrect({ type: "numeric", correct_response: { value: 12.5, unit: "سم" } })).toEqual({ value: "12.5", unit: "سم" });
    expect(reviewCorrect({ type: "short_answer", correct_response: { text: "الرياض" } })).toEqual({ text: "الرياض" });
    expect(valueText({ value: "12.5", unit: "سم" })).toBe("12.5 سم");
    expect(valueText({ text: "الرياض" })).toBe("الرياض");
    expect(valueText(null)).toBeNull();
  });

  it("legacy review rows keep choices and the correct index", () => {
    expect(optionRows({ choices: ["أ", "ب", "ج"], selected_index: 0, correct_index: 2 })).toEqual([
      { index: 0, text: "أ", chosen: true, correct: false, state: "wrong" },
      { index: 1, text: "ب", chosen: false, correct: false, state: "idle" },
      { index: 2, text: "ج", chosen: false, correct: true, state: "correct" },
    ]);
  });

  it("an unrevealed matching or ordering review has no verdict per row", () => {
    const m = matchingRows({ ...Q.matching, response: { pairs: [[0, 0]] }, correct_response: null });
    expect(m.map((r) => r.ok)).toEqual([null, null, null]);
    expect(m[0].chosen).toBe("25");
    const o = orderingRows({ ...Q.ordering, response: null, correct_response: { order: [1, 2, 0] } });
    expect(o.map((r) => [r.chosen, r.correct, r.ok])).toEqual([[null, "أ", null], [null, "ب", null], [null, "ج", null]]);
  });

  it("explanations, pages and https-only link-outs", () => {
    expect(explanationOf({ explanation: "شرح" })).toEqual({ text: "شرح", steps: [] });
    expect(explanationOf({ explanation: { text: "", steps: ["8 × 7 = 56", " "] } })).toEqual({ text: "", steps: ["8 × 7 = 56"] });
    expect(explanationOf({ explanation: { text: " ", steps: [] } })).toBeNull();
    expect(hasReveal({ verdict: "correct", correct_response: null, explanation: null, objective: null })).toBe(false);
    expect(hasReveal({ verdict: "correct", correct_response: { option_index: 1 } })).toBe(true);
    expect(pagesLabel({ printed_start: 12, printed_end: 13 })).toBe("12–13");
    expect(pagesLabel({ printed_start: 12, printed_end: 12 })).toBe("12");
    expect(pagesLabel({})).toBeNull();
    expect(safeHttps("https://iencontent.ien.edu.sa/books/x.pdf#page=14")).toBe("https://iencontent.ien.edu.sa/books/x.pdf#page=14");
    expect(safeHttps("javascript:alert(1)")).toBeNull();
    expect(safeHttps("http://example.com")).toBeNull();
  });

  it("result filters count partial answers as wrong and voided items apart", () => {
    const items = RPC("submit_exam_attempt").cases[0].response.items;
    const withExtra = [...items, { ...items[0], position: 99, verdict: "partial", score: 0.5 }, { ...items[1], position: 100, voided: "question_updated" }];
    const c = reviewCounts(withExtra);
    expect(c.all).toBe(withExtra.length);
    expect(c.partial).toBe(1);
    expect(c.voided).toBe(1);
    expect(c.correct + c.incorrect + c.unanswered + c.voided).toBe(c.all); // incorrect includes partial
    expect(filterReview(withExtra, "incorrect").map(itemStatus).every((s) => s === "incorrect" || s === "partial")).toBe(true);
    expect(filterReview(withExtra, "unanswered").every((it) => itemStatus(it) === "unanswered")).toBe(true);
  });
});

// ── runner session (template sessions: db and guest) ────────────────────────
describe("runner session for template attempts", () => {
  const NOW = Date.parse("2026-10-01T12:00:00.000Z");
  const db = RPC("get_exam_attempt").cases[0].response;
  const start = RPC("start_template_attempt").cases[0].response;

  it("resumes a database attempt: typed answers, template defaults, timing from the server clock", () => {
    const payload = structuredClone(db);
    payload.answers[0] = { position: 1, response: { pairs: [[0, 0], [1, 1]] }, flagged: true, time_spent_seconds: 30, locked: false };
    payload.answers[1] = { position: 2, response: { option_index: 3 }, flagged: false, time_spent_seconds: 12, locked: true };
    const s = toRunnerSession(payload, { now: NOW });
    expect(s.mode).toBe("db");
    expect(s.template).toEqual({ id: "chapter-quiz", version: 1, kind: "chapter" });
    expect(s.feedbackMode).toBe("end"); // chapter-quiz default
    expect(s.timed).toBe(true);
    expect(s.deadline).toBe(NOW + 750_000);
    expect(s.answers[1]).toEqual({ selected: null, response: { pairs: [[0, 0], [1, 1]] }, flagged: true });
    // an mcq keeps `selected` (the legacy shortcut and navigator path) and a checked item is locked
    expect(s.answers[2]).toEqual({ selected: 3, response: null, flagged: false, locked: true, check: null });
    expect(s.spent[1]).toBe(30);
    expect(s.current).toBe(3); // first unanswered
  });

  it("starts a guest session with the notices and the immediate-feedback mode", () => {
    const s = toRunnerSession({ ...start, mode: "guest", attempt_id: "g-AAAAAAAAAAAAAAAAAAAAAA", template: { id: "lesson-quiz", version: 1, kind: "lesson" }, timing_mode: "untimed", feedback_mode: "immediate", mini: true, reused: true }, { now: NOW });
    expect(s.mode).toBe("guest");
    expect(s.feedbackMode).toBe("immediate");
    expect(s.timed).toBe(false);
    expect(s.mini).toBe(true);
    expect(s.reused).toBe(true);
    expect(s.short).toBe(false);
    expect(Object.values(s.answers).every((a) => a.selected === null && a.response === null)).toBe(true);
  });

  it("legacy sessions keep their exact shape", () => {
    const s = toRunnerSession({ mode: "db", attempt_id: "x", exam: "aptitude", time_limit_seconds: 60, seconds_remaining: 60, questions: [LEGACY], answers: [{ position: 1, selected_index: 2, flagged: true }] }, { now: NOW });
    expect(s.template).toBeNull();
    expect(s.answers[1]).toEqual({ selected: 2, flagged: true });
    expect(s.feedbackMode).toBe("end");
    expect(s.timed).toBe(true);
  });

  it("finds the template of any payload shape", () => {
    expect(templateRefOf({ template: { id: "mock", version: 1, kind: "mock" } })).toMatchObject({ id: "mock", kind: "mock", timing_mode: "timed", feedback_mode: "end" });
    expect(templateRefOf({ attempt: { template_id: "practice", template_version: 1 } })).toMatchObject({ id: "practice", version: 1, kind: "practice", timing_mode: "untimed", feedback_mode: "immediate" });
    expect(templateRefOf({ template_id: "term-exam" })).toMatchObject({ id: "term-exam", kind: "term" });
    expect(templateRefOf({ exam: "aptitude" })).toBeNull();
  });

  it("the reducer answers every type; a checked item is final (flags still toggle)", () => {
    let st = { answers: { 1: { selected: null, response: null, flagged: false }, 2: { selected: null, response: null, flagged: false } }, current: 1, positions: [1, 2] };
    st = runnerReducer(st, { type: "respond", position: 1, response: { order: [2, 0, 1] } });
    expect(st.answers[1].response).toEqual({ order: [2, 0, 1] });
    const same = runnerReducer(st, { type: "respond", position: 1, response: { order: [2, 0, 1] } });
    expect(same).toBe(st);
    st = runnerReducer(st, { type: "clear", position: 1 });
    expect(st.answers[1]).toEqual({ selected: null, response: null, flagged: false });
    st = runnerReducer(st, { type: "select", position: 2, index: 1 });
    st = runnerReducer(st, { type: "lock", position: 2, check: { verdict: "correct", score: 1 } });
    expect(st.answers[2]).toMatchObject({ selected: 1, locked: true, check: { verdict: "correct" } });
    expect(runnerReducer(st, { type: "select", position: 2, index: 0 })).toBe(st);
    expect(runnerReducer(st, { type: "clear", position: 2 })).toBe(st);
    expect(runnerReducer(st, { type: "respond", position: 2, response: { option_index: 0 } })).toBe(st);
    // a later lock without a check keeps the check already shown
    expect(runnerReducer(st, { type: "lock", position: 2, check: null })).toBe(st);
    expect(runnerReducer(st, { type: "flag", position: 2 }).answers[2].flagged).toBe(true);
  });

  it("the header counts answered and unanswered for typed answers too", () => {
    const answers = {
      1: { selected: 0, response: null, flagged: false },
      2: { selected: null, response: { pairs: [[0, 1]] }, flagged: true },
      3: { selected: null, response: null, flagged: true },
      4: { selected: null, response: { text: "x" }, flagged: false },
    };
    expect(summarize(answers, [1, 2, 3, 4])).toEqual({ total: 4, answered: 3, unanswered: 1, flagged: 2, firstUnanswered: 3, firstFlagged: 2, invalid: 0, firstInvalid: null });
  });

  it("counts typed numbers the server would refuse (the submit dialog points at them)", () => {
    const questions = { 1: Q.numeric, 2: { ...Q.numeric, position: 2 }, 3: Q.short, 4: { ...Q.numeric, position: 4 } };
    const answers = {
      1: { selected: null, response: { value: "12.5", unit: "سم" }, flagged: false },
      2: { selected: null, response: { value: "0,125" }, flagged: false }, // ambiguous separator
      3: { selected: null, response: { text: "0,125" }, flagged: false }, // short answers are free text
      4: { selected: null, response: { value: "3/4" }, flagged: false }, // fractions not allowed by this item
    };
    expect(summarize(answers, [1, 2, 3, 4], questions)).toMatchObject({ answered: 4, invalid: 2, firstInvalid: 2 });
    // a checked item is final and was graded already
    expect(summarize({ ...answers, 2: { ...answers[2], locked: true } }, [1, 2, 3, 4], questions)).toMatchObject({ invalid: 1, firstInvalid: 4 });
    expect(summarize(answers, [1, 2, 3, 4])).toMatchObject({ invalid: 0, firstInvalid: null }); // legacy call: no questions
  });

  it("never submits a number the database would refuse: one invalid response fails the whole submit", () => {
    // _ce_submit raises invalid_response for the whole attempt (a manual submit and the auto-submit
    // at 0:00 would keep failing), so an unreadable number goes as no answer (graded unanswered).
    const questions = { 1: Q.numeric, 2: { ...Q.numeric, position: 2 }, 3: { ...Q.numeric, position: 3 } };
    const answers = {
      1: { selected: null, response: { value: "0,125", unit: "سم" }, flagged: false },
      2: { selected: null, response: { value: "١٢٫٥", unit: "سم" }, flagged: false },
      3: { selected: null, response: { value: "12.555" }, flagged: true },
    };
    const out = answersPayload([1, 2, 3], answers, {}, questions);
    expect(out.map((a) => a.response)).toEqual([null, { value: "١٢٫٥", unit: "سم" }, null]);
    expect(out[2].flagged).toBe(true);
    // every response that is sent passes the engine's strict parser and the shared validator
    for (const a of out) {
      expect(parseDisplayResponse("numeric", a.response).ok).toBe(true);
      if (a.response) expect(responseIssue(Q.numeric, a.response)).toBeNull();
    }
    expect(responseIssue(Q.numeric, { value: "0,125" })).toBe("ambiguous_separator");
    expect(responseIssue(Q.numeric, { value: "1/2" })).toBe("fraction_not_allowed");
    expect(responseIssue(Q.numeric, { value: "abc" })).toBe("invalid_number");
    expect(responseIssue(Q.numeric, { value: "  " })).toBeNull();
    expect(responseIssue(Q.short, { text: "0,125" })).toBeNull();
  });

  it("submits display responses for template items and selected_index for legacy ones", () => {
    const questions = { 1: Q.mcq, 2: Q.matching, 3: Q.numeric };
    const answers = { 1: { selected: 1, response: null, flagged: false }, 2: { selected: null, response: { pairs: [[0, 2]] }, flagged: true }, 3: { selected: null, response: null, flagged: false } };
    expect(answersPayload([1, 2, 3], answers, { 1: 4.4, 2: 10 }, questions)).toEqual([
      { position: 1, response: { option_index: 1 }, time_spent_seconds: 4, flagged: false },
      { position: 2, response: { pairs: [[0, 2]] }, time_spent_seconds: 10, flagged: true },
      { position: 3, response: null, time_spent_seconds: 0, flagged: false },
    ]);
    expect(answersPayload([1], { 1: { selected: 2, flagged: false } }, {})).toEqual([{ position: 1, selected_index: 2, time_spent_seconds: 0, flagged: false }]);
  });

  it("offline drafts restore typed answers but never change a checked one", () => {
    const answers = { 1: { selected: null, response: null, flagged: false }, 2: { selected: 1, response: null, flagged: false, locked: true, check: null } };
    const draft = { 1: { selected: null, response: { order: [1, 0, 2] }, flagged: true, spent: 20 }, 2: { selected: 0, flagged: true, spent: 5 } };
    const out = mergeDrafts(answers, {}, draft);
    expect(out.answers[1]).toEqual({ selected: null, response: { order: [1, 0, 2] }, flagged: true });
    expect(out.answers[2]).toEqual({ selected: 1, response: null, flagged: true, locked: true, check: null });
    expect(out.dirty.sort()).toEqual([1, 2]);
  });

  it("guest sessions open on the pointer route", () => {
    expect(attemptHref({ mode: "guest", attempt_id: "g-AAAAAAAAAAAAAAAAAAAAAA" })).toBe("/exams/attempt/local");
    expect(attemptHref({ mode: "db", attempt_id: "9a8b" })).toBe("/exams/attempt/9a8b");
  });
});

// ── results ─────────────────────────────────────────────────────────────────
describe("template results", () => {
  const result = RPC("submit_exam_attempt").cases[0].response;

  it("recognises template results and summarises them", () => {
    expect(isTemplateResult(result)).toBe(true);
    expect(isTemplateResult({ attempt: { exam: "aptitude" } })).toBe(false);
    expect(resultAttemptId(result)).toBe(result.attempt.id);
    expect(templateSummary(result)).toEqual({ total: 10, voided: 0, correct: 5, answered: 7, percent: 50 });
    // a voided item (revised after it was served) is not part of the score
    const guest = { mode: "guest", question_count: 2, voided_count: 1, correct_count: 1, answered_count: 2, score_percent: 50, attempt: { question_count: 3 }, items: [{ verdict: "correct" }, { verdict: "incorrect" }, { voided: "question_updated" }] };
    expect(templateSummary(guest)).toEqual({ total: 2, voided: 1, correct: 1, answered: 2, percent: 50 });
  });

  it("«إعادة الاختبار» restarts the same template, scope and count with retake_of", () => {
    expect(retakeConfig(result)).toEqual({ template: "chapter-quiz", scope: "middle/grade-1/math/n91", count: result.items.length, timing: null, feedback: null, retakeOf: result.attempt.id });
    const guest = { mode: "guest", template: { id: "lesson-quiz", version: 1, kind: "lesson" }, scope: "middle/grade-1/math/n54", session_id: "g-AAAAAAAAAAAAAAAAAAAAAA", attempt: { timing_mode: "untimed", feedback_mode: "immediate" }, items: [{}, {}, {}] };
    expect(retakeConfig(guest)).toEqual({ template: "lesson-quiz", scope: "middle/grade-1/math/n54", count: 3, timing: "untimed", feedback: "immediate", retakeOf: "g-AAAAAAAAAAAAAAAAAAAAAA" });
    expect(retakeConfig({ attempt: { exam: "aptitude", id: "x" } })).toBeNull();
  });

  it("practise my mistakes is a weakness review of the missed lessons (saved attempts only)", () => {
    // missed items span two lessons → the attempt's scope node
    expect(mistakesConfig(result)).toEqual({ template: "weakness-review", scope: "weak:middle/grade-1/math/n91", count: null, timing: null, feedback: null, retakeOf: null });
    const oneLesson = { ...result, items: result.items.map((it) => (it.lesson.id === "middle/grade-1/math/n55" ? it : { ...it, verdict: "correct" })) };
    expect(mistakesConfig(oneLesson).scope).toBe("weak:middle/grade-1/math/n55");
    expect(mistakesConfig({ ...result, mode: "guest" })).toBeNull();
    expect(mistakesConfig({ ...result, items: result.items.map((it) => ({ ...it, verdict: "correct" })) })).toBeNull();
    const prep = { ...result, attempt: { ...result.attempt, scope: "prep:achievement/math" }, items: result.items.map((it) => ({ ...it, lesson: { id: "prep:achievement/math/algebra" } })) };
    expect(mistakesConfig(prep)).toBeNull();
  });

  it("by_lesson bars weakest first (partial credit counts), by_term in term order", () => {
    const rows = lessonRows(result.by_lesson);
    expect(rows.map((r) => [r.id, r.accuracy])).toEqual([["middle/grade-1/math/n55", 25], ["middle/grade-1/math/n53", 33.3], ["middle/grade-1/math/n54", 100]]);
    expect(lessonRows([{ id: "a", total: 2, correct: 0, score_sum: 1.5 }])[0].accuracy).toBe(75);
    const terms = termRows([{ term: "t2", total: 4, correct: 1, score_sum: 1 }, { term: "t1", total: 2, correct: 2, score_sum: 2 }]);
    expect(terms.map((r) => [r.term, r.accuracy])).toEqual([["t1", 100], ["t2", 25]]);
  });

  it("names the session: template (mini) and the one lesson all questions share", () => {
    const { t } = translators.en;
    expect(templateName(t, "full-year", true)).toBe("Full-year exam (mini)");
    expect(templateName(t, "nope")).toBe("Practice test");
    expect(sessionLessonTitle([{ lesson: { id: "a", title: "الكسور" } }, { lesson: { id: "a", title: "الكسور" } }])).toBe("الكسور");
    expect(sessionLessonTitle([{ lesson: { id: "a", title: "x" } }, { lesson: { id: "b", title: "y" } }])).toBeNull();
    expect(sessionLessonTitle([LEGACY])).toBeNull();
  });

  it("turns engine error codes into messages with their details", () => {
    const { t, tc } = translators.en;
    expect(errorMessage(t, "insufficient_pool", { available: 4, required: 10 }, tc)).toBe("Not enough questions yet: 4 available, 10 needed.");
    expect(errorMessage(t, "insufficient_pool", { available: 0, required: 5 }, tc)).toBe("Not enough questions yet: 0 available, 5 needed.");
    // no counts from the server (e.g. a bare HTTP 422): no invented "0 available, 0 needed"
    for (const details of [null, {}, { available: "x" }, { available: 3 }]) {
      expect(errorMessage(t, "insufficient_pool", details, tc)).toBe(t("errors.insufficient_pool_plain"));
    }
    expect(errorMessage(translators.ar.t, "insufficient_pool", null, translators.ar.tc)).toContain("لا توجد أسئلة كافية بعد");
    expect(errorMessage(t, "premium_required", { max_questions: 25 }, tc)).toContain("25 questions");
    expect(errorMessage(t, "key_reveal_limit", null, tc)).toBe(t("errors.key_reveal_limit"));
    expect(errorMessage(t, "made_up", null, tc)).toBe(t("errors.unknown"));
    expect(errorMessage(t, null)).toBe(t("errors.unknown"));
  });
});

// ── history ─────────────────────────────────────────────────────────────────
describe("history analytics", () => {
  const list = [
    { id: "d", template_id: "chapter-quiz", scope: "s1", score_percent: 80, status: "submitted" },
    { id: "c", exam: "aptitude", section: "verbal", topic: null, score_percent: 70, status: "submitted" },
    { id: "b", template_id: "chapter-quiz", scope: "s1", score_percent: 62.5, status: "submitted" },
    { id: "x", template_id: "chapter-quiz", scope: "s1", score_percent: null, status: "in_progress" },
    { id: "a", template_id: "chapter-quiz", scope: "s1", score_percent: 62.5, status: "submitted" },
    { id: "z", template_id: "chapter-quiz", scope: "s2", score_percent: 10, status: "submitted" },
  ];

  it("compares each attempt with the previous one on the same template and scope", () => {
    expect(attemptScopeKey(list[0])).toBe("tpl:chapter-quiz|s1");
    expect(attemptScopeKey(list[1])).toBe("legacy:aptitude|verbal|");
    const m = previousOnScope(list);
    expect(m.get("d")).toEqual({ previousId: "b", previousScore: 62.5, delta: 17.5, direction: "up" });
    expect(m.get("b")).toEqual({ previousId: "a", previousScore: 62.5, delta: 0, direction: "same" });
    expect(m.has("a")).toBe(false);
    expect(m.has("z")).toBe(false);
    expect(m.has("x")).toBe(false);
  });

  it("ranks weak lessons by the Wilson lower bound like the database", () => {
    // p = 3/8, n = 8, z = 1.645 (§2.14): (p + z²/2n − z·√(p(1−p)/n + z²/4n²)) / (1 + z²/n) = 0.1612
    expect(wilsonLower(3, 8)).toBeCloseTo(0.1612, 4);
    expect(wilsonLower(8, 8)).toBeCloseTo(0.7472, 4);
    expect(wilsonLower(0, 0)).toBe(0);
    const rows = weakLessons([
      { lesson: "a", title: "A", answered: 20, correct: 10 },
      { lesson: "b", title: "B", answered: 5, correct: 2 },
      { lesson: "c", title: "C", answered: 4, correct: 0 }, // fewer than 5 answers: not ranked
      { lesson: "d", title: "D", answered: 10, correct: 9 },
      { lesson: "e", title: "E", answered: 6, correct: 6, wilson_lower: 0.01 }, // the server value wins
    ]);
    expect(rows.map((r) => r.lesson)).toEqual(["e", "b", "a", "d"]);
    expect(rows[1].accuracy).toBe(40);
  });

  it("groups repeated mistakes (wrong_streak ≥ 2) by lesson", () => {
    const rows = repeatedMistakes(
      [
        { question_key: "q1", wrong_streak: 2, lesson: "n54" },
        { question_key: "q2", wrong_streak: 3, lesson: "n54" },
        { question_key: "q3", wrong_streak: 1, lesson: "n55" },
        { question_key: "q4", wrong_streak: 4, lesson: "n53", title: "Z" },
      ],
      [{ lesson: "n54", title: "القوى" }]
    );
    expect(rows).toEqual([
      { lesson: "n54", title: "القوى", count: 2, maxStreak: 3 },
      { lesson: "n53", title: "Z", count: 1, maxStreak: 4 },
    ]);
  });

  it("keeps well-formed recommendations of known kinds", () => {
    const rows = RPC("get_practice_recommendations").cases[0].response;
    expect(recommendationRows(rows)).toHaveLength(2);
    expect(recommendationRows([{ kind: "unknown", node: "x" }, { kind: "lesson_quiz" }, null])).toEqual([]);
  });
});

// ── messages ────────────────────────────────────────────────────────────────
describe("exam messages for the content engine", () => {
  it("every template, verdict, type input and engine error has a label in both locales", async () => {
    const { EXAM_ERROR_CODES } = await import("@/lib/data/exams");
    for (const locale of ["ar", "en"]) {
      const { t } = translators[locale];
      for (const id of TEMPLATE_IDS) expect(t.has(`templates.${id}`), `${locale} templates.${id}`).toBe(true);
      for (const v of ["correct", "incorrect", "partial", "unanswered", "voided"]) expect(t.has(`results.review.verdict.${v}`)).toBe(true);
      for (const c of ["chronological", "ascending", "descending", "process_steps", "other"]) expect(t.has(`runner.ordering.criteria.${c}`)).toBe(true);
      for (const i of ["ambiguous_separator", "invalid_number", "fraction_not_allowed", "too_many_decimals"]) expect(t.has(`runner.numeric.issues.${i}`)).toBe(true);
      for (const k of ["lesson_quiz", "lesson_review", "weakness_review"]) expect(t.has(`history.recommendations.kinds.${k}`)).toBe(true);
      for (const term of ["t1", "t2", "both"]) expect(t.has(`results.terms.${term}`)).toBe(true);
      for (const code of EXAM_ERROR_CODES) expect(t.has(`errors.${code}`), `${locale} errors.${code}`).toBe(true);
    }
  });

  it("uses «صح / خطأ / شرح السبب / إعادة الاختبار» in Arabic and plain English in English", () => {
    const ar = translators.ar.t;
    const en = translators.en.t;
    const keys = ["results.review.verdict.correct", "results.review.verdict.incorrect", "results.review.why", "results.actions.retake"];
    expect(keys.map((k) => ar(k))).toEqual(["صح", "خطأ", "شرح السبب", "إعادة الاختبار"]);
    expect(keys.map((k) => en(k))).toEqual(["Correct", "Incorrect", "Why", "Retake (new questions)"]);
    expect(ar("runner.unansweredCount", { count: 2 })).toBe("سؤالان دون إجابة");
    expect(en("runner.unansweredCount", { count: 3 })).toBe("3 unanswered");
  });
});

// ── rendered inputs ─────────────────────────────────────────────────────────
describe("rendered question inputs", () => {
  const LEGACY_LABEL =
    "group relative flex min-h-[3.5rem] w-full cursor-pointer items-center gap-3 rounded-md border px-3.5 py-3 text-start transition-[border-color,background-color,box-shadow] duration-fast ease-out active:scale-[0.99] has-[:focus-visible]:shadow-[var(--ring)]";
  const card = (question, answer, extra = {}) =>
    html(QuestionCard, { t: translators.en.t, question, index: 0, total: 5, answer, onChoose: noop, onClear: noop, onFlag: noop, onRespond: noop, ...extra });

  it("keeps the legacy mcq markup: Arabic content, native radios, the same classes, no check button", () => {
    const out = card(LEGACY, { selected: 1, flagged: false });
    expect(out).toContain('<fieldset class="mt-6 min-w-0">');
    expect(out).toContain('<ul lang="ar" dir="rtl" class="font-ar grid gap-2.5 sm:gap-3 sm:grid-cols-2">'); // short options: two columns
    expect(out).toContain(`<label class="${LEGACY_LABEL} border-gold-500 bg-gold-50 shadow-[0_0_0_1px_rgb(var(--c-gold-500))]">`);
    expect(out.split(`<label class="${LEGACY_LABEL} border-line/15 bg-surface [@media(hover:hover)]:hover:border-line/30 [@media(hover:hover)]:hover:bg-surface-2/60">`)).toHaveLength(4);
    expect(out.match(/type="radio"/g)).toHaveLength(4);
    expect(out).toMatch(/<p id="q-1-stem" tabindex="-1" lang="ar" dir="rtl" class="font-ar mt-5/);
    expect(out).toContain("Verbal analogy");
    expect(out).not.toContain("Check");
    expect(out).not.toContain("disabled");
  });

  it("template items take lang/dir from the item", () => {
    const out = card(Q.tf, { selected: null, response: null, flagged: false });
    expect(out).toMatch(/<p id="q-2-stem" tabindex="-1" lang="en" dir="ltr" class="font-en mt-5/);
    expect(out).toContain('<ul lang="en" dir="ltr" class="font-en grid grid-cols-2');
    expect(out).toContain(">True<");
  });

  it("immediate feedback: a check button, then صح / خطأ with «شرح السبب» and a locked input", () => {
    const before = card(Q.mcq, { selected: null, response: null, flagged: false }, { feedback: "immediate" });
    expect(before).toMatch(/<button[^>]*disabled=""[^>]*>.*Check/);
    const check = { verdict: "incorrect", score: 0, correct_response: { option_index: 1 }, explanation: { text: "8 × 7 = 56", steps: ["8 × 7 = 56"] }, objective: { text: "ضرب الأعداد" } };
    const after = card(Q.mcq, { selected: 0, response: null, flagged: false, locked: true, check }, { feedback: "immediate" });
    expect(after).toContain('<fieldset class="mt-6 min-w-0" disabled="">');
    expect(after).toContain("Incorrect");
    expect(after).toContain("(correct answer)");
    expect(after).toMatch(/<button type="button" aria-expanded="true" aria-controls="[^"]+"/); // opened for a wrong answer
    expect(after).toContain("ضرب الأعداد");
    // past the key-reveal cap only the verdict comes back
    const capped = card(Q.mcq, { selected: 0, response: null, flagged: false, locked: true, check: { verdict: "incorrect", score: 0, correct_response: null, explanation: null, objective: null } }, { feedback: "immediate" });
    expect(capped).toContain(translators.en.t("results.review.keyLimit").replace(/'/g, "&#x27;"));
    expect(capped).not.toContain("aria-expanded");
  });

  it("immediate feedback: an unreadable number cannot be checked; a readable one can", () => {
    const bad = card(Q.numeric, { selected: null, response: { value: "0,125", unit: "سم" }, flagged: false }, { feedback: "immediate" });
    expect(bad).toMatch(/<button[^>]*disabled=""[^>]*>.*Check/);
    expect(bad).toContain('aria-invalid="true"');
    const ok = card(Q.numeric, { selected: null, response: { value: "0.12", unit: "سم" }, flagged: false }, { feedback: "immediate" });
    expect(ok).not.toMatch(/<button[^>]*disabled=""[^>]*>.*Check/);
  });

  it("matching: a labelled select per item on phones, pressable columns on desktop, display indexes only", () => {
    const out = html(MatchingInput, { t: translators.en.t, question: Q.matching, response: { pairs: [[0, 0]] }, onRespond: noop });
    expect(out.match(/<select /g)).toHaveLength(3);
    expect(out.match(/<label for="[^"]+"/g)).toHaveLength(3);
    expect(out).toContain('<option value="0" selected="">A. 25</option>');
    expect(out.match(/aria-pressed="false"/g)).toHaveLength(3);
    expect(out).toContain("1 of 3 matched");
    expect(out).toContain('aria-live="polite"');
    expect(out).toContain("Remove the match of item 1");
    expect(out).toContain("matched with 25");
    expect(out).not.toMatch(/value="[lr]\d/);
  });

  it("ordering: move-up / move-down buttons and a keyboard handle per item (no drag-only interaction)", () => {
    const out = html(OrderingInput, { t: translators.en.t, question: Q.ordering, response: null, onRespond: noop });
    expect(out).toContain("Order the items from smallest to largest.");
    expect(out.match(/aria-label="Move “[^”]+” up"/g)).toHaveLength(3);
    expect(out.match(/aria-label="Move “[^”]+” down"/g)).toHaveLength(3);
    expect(out).toMatch(/<button type="button" disabled="" aria-label="Move “ج” up"/);
    expect(out).toMatch(/<button type="button" disabled="" aria-label="Move “ب” down"/);
    expect(out).toContain("ج, position 1 of 3. Press the up or down arrow key to move it.");
    expect(out).toContain("Keep this order");
    expect(out).toContain('aria-live="polite"');
    const answered = html(OrderingInput, { t: translators.en.t, question: Q.ordering, response: { order: [1, 2, 0] }, onRespond: noop });
    expect(answered).not.toContain("Keep this order");
    expect(answered.indexOf("“أ” up")).toBeLessThan(answered.indexOf("“ج” up"));
  });

  it("short answer and numeric inputs", () => {
    const short = html(ShortAnswerInput, { t: translators.ar.t, question: Q.short, response: { text: "الرياض" }, onRespond: noop, lang: "ar", dir: "rtl" });
    expect(short).toContain('maxLength="20"');
    expect(short).toContain('value="الرياض"');
    expect(short).toContain("6 / 20");
    const num = html(NumericInput, { t: translators.en.t, question: Q.numeric, response: { value: "0,125" }, onRespond: noop });
    expect(num).toContain('inputMode="decimal"');
    expect(num).toContain('dir="ltr"');
    expect(num).toContain('aria-invalid="true"');
    expect(num).toContain(translators.en.t("runner.numeric.issues.ambiguous_separator"));
    expect(num).toMatch(/<select aria-label="Unit"/);
    expect(num).toContain("Choose the unit as well.");
    expect(num).toContain("Up to 2 decimal places.");
  });

  it("«شرح السبب» is a real disclosure button", () => {
    const closed = html(ExplainToggle, { t: translators.ar.t, explanation: { text: "لأن", steps: ["خطوة"] }, objective: { text: "هدف" } });
    expect(closed).toMatch(/<button type="button" aria-expanded="false" aria-controls="([^"]+)"/);
    expect(closed).toContain("شرح السبب");
    expect(closed).toMatch(/<div id="[^"]+" hidden=""/);
    const open = html(ExplainToggle, { t: translators.ar.t, explanation: { text: "لأن", steps: ["خطوة"] }, objective: { text: "هدف" }, defaultOpen: true });
    expect(open).toContain("الخطوات");
    expect(open).toContain("الهدف:");
    expect(html(ExplainToggle, { t: translators.ar.t, explanation: null, objective: null })).toBe("");
  });
});

// ── regressions found in verification ───────────────────────────────────────
describe("verdict colours without a revealed key (key-reveal cap, voided items)", () => {
  it("choiceState: the revealed key decides; without it the chosen option carries the verdict", () => {
    expect([0, 1, 2].map((i) => choiceState(i, 0, { correct: 1, verdict: "incorrect" }))).toEqual(["wrong", "correct", "idle"]);
    // past the cap: a right answer is never red
    expect([0, 1, 2].map((i) => choiceState(i, 0, { correct: null, verdict: "correct" }))).toEqual(["correct", "idle", "idle"]);
    expect([0, 1, 2].map((i) => choiceState(i, 0, { correct: null, verdict: "incorrect" }))).toEqual(["wrong", "idle", "idle"]);
    // a voided item (question updated) is not graded: neutral
    expect([0, 1].map((i) => choiceState(i, 1, { correct: null, verdict: "voided" }))).toEqual(["idle", "chosen"]);
    expect(choiceState(0, null, { correct: null, verdict: "unanswered" })).toBe("idle");
  });

  it("optionRows of a capped correct answer and of a voided item", () => {
    const capped = optionRows({ ...Q.mcq, response: { option_index: 1 }, verdict: "correct", score: 1, correct_response: null });
    expect(capped.map((r) => r.state)).toEqual(["idle", "correct", "idle"]);
    const voided = optionRows({ ...Q.mcq, response: { option_index: 1 }, verdict: null, voided: "question_updated", correct_response: null });
    expect(voided.map((r) => r.state)).toEqual(["idle", "chosen", "idle"]);
  });

  it("an immediate check past the cap never paints a right answer red", () => {
    const check = { verdict: "correct", score: 1, correct_response: null, explanation: null, objective: null, key_reveal_limit: true };
    const out = html(QuestionCard, {
      t: translators.en.t, question: Q.mcq, index: 0, total: 3, answer: { selected: 1, response: null, flagged: false, locked: true, check },
      onChoose: noop, onClear: noop, onFlag: noop, onRespond: noop, feedback: "immediate",
    });
    expect(out).toContain("Correct");
    expect(out).toContain("border-green-300 bg-green-50");
    expect(out).not.toContain("bg-danger-soft");
  });

  it("a voided check says the question was updated (no verdict, nothing red)", () => {
    const out = html(QuestionCard, {
      t: translators.en.t, question: Q.mcq, index: 0, total: 3,
      answer: { selected: 0, response: null, flagged: false, locked: true, check: { voided: "question_updated", verdict: null, score: null, correct_response: null } },
      onChoose: noop, onClear: noop, onFlag: noop, onRespond: noop, feedback: "immediate",
    });
    expect(out).toContain(translators.en.t("results.review.voided").replace(/'/g, "&#x27;"));
    expect(out).not.toContain("bg-danger-soft");
    expect(out).not.toContain("border-green-300");
  });

  it("the review list colours a capped correct answer green and a voided one neutral", () => {
    const items = [
      { ...Q.mcq, position: 1, response: { option_index: 1 }, verdict: "correct", score: 1, correct_response: null, explanation: null, objective: null, source: null, lesson: null },
      { ...Q.mcq, position: 2, key: "q-v", response: { option_index: 0 }, verdict: null, score: null, voided: "question_updated", correct_response: null, lesson: null },
    ];
    const out = html(ReviewList, { t: translators.en.t, items });
    expect(out).toContain("border-green-200 bg-green-50");
    expect(out).toContain("border-line/25 bg-surface-2/70"); // the voided choice: neutral
    expect(out).not.toContain("bg-danger-soft");
  });
});

describe("in-app lesson links", () => {
  it("safeAppPath keeps app paths only", () => {
    expect(safeAppPath("/learn/middle/grade-1/math/n4318")).toBe("/learn/middle/grade-1/math/n4318");
    for (const bad of ["//evil.example/x", "/\\evil", "/learn/a\\b","https://x.test", "javascript:alert(1)", "learn/x", "/a b", null, 5]) expect(safeAppPath(bad)).toBeNull();
  });

  it("prep topics have no lesson page and are named by their topic", () => {
    expect(lessonHref("middle/grade-1/math/n4318")).toBe("/learn/middle/grade-1/math/n4318");
    expect(lessonHref("prep:qudurat/verbal/analogy")).toBeNull();
    expect(lessonHref("weak:middle/grade-1/math")).toBeNull();
    expect(lessonHref("")).toBeNull();
    expect(prepTopicOf("prep:qudurat/verbal/analogy")).toBe("analogy");
    expect(prepTopicOf("prep:qudurat/verbal")).toBeNull();
    expect(prepTopicOf("middle/grade-1/math/n4318")).toBeNull();
  });

  it("the review links a lesson only through a safe in-app path", () => {
    const base = { ...Q.mcq, response: { option_index: 1 }, verdict: "correct", score: 1, correct_response: { option_index: 1 }, explanation: null, objective: null, source: null };
    const ok = html(ReviewList, { t: translators.en.t, items: [{ ...base, lesson: { id: "m/g/s/n1", title: "درس", href: "/learn/m/g/s/n1" } }] });
    expect(ok).toContain('href="/learn/m/g/s/n1"');
    const bad = html(ReviewList, { t: translators.en.t, items: [{ ...base, lesson: { id: "x", title: "درس", href: "//evil.example" } }] });
    expect(bad).not.toContain("evil.example");
  });
});

describe("objective language", () => {
  it("an English item's explanation is English, its (Arabic text_ar) objective stays Arabic", () => {
    const out = html(ExplainToggle, { t: translators.en.t, explanation: { text: "Because", steps: [] }, objective: { text: "يحسب المساحة" }, lang: "en", dir: "ltr", defaultOpen: true });
    expect(out).toContain('<p lang="en" dir="ltr" class="font-en');
    expect(out).toContain('<bdi lang="ar" dir="rtl" class="font-ar">يحسب المساحة</bdi>');
  });
});
