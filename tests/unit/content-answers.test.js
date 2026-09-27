import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  gradeResponse, validateResponse, parseNumber, correctResponse, canonicalAnswer, publicPayload,
} from "@/lib/content/answers.js";
import { formatValue } from "@/lib/content/expr.js";
import { QUESTION_TYPES, VERDICTS } from "@/lib/content/enums.js";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/content/grading-cases.json", import.meta.url), "utf8"));

describe("grading-cases.json (shared with the guest route and SQL _ce_grade)", () => {
  it("covers every question type, every verdict and the required edge cases", () => {
    const ids = fixture.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(fixture.cases.map((c) => c.type))).toEqual(new Set(QUESTION_TYPES));
    expect(new Set(fixture.cases.map((c) => c.expected.verdict))).toEqual(new Set(VERDICTS));
    for (const needle of ["punctuation", "nfkc", "superscript", "thousands", "exact-marks", "ambiguous"]) {
      expect(ids.some((id) => id.includes(needle)), needle).toBe(true);
    }
  });

  for (const c of fixture.cases) {
    it(`${c.id}`, () => {
      expect(gradeResponse(c.type, c.payload, c.response)).toEqual(c.expected);
    });
  }
});

describe("parseNumber", () => {
  const value = (s) => {
    const r = parseNumber(s);
    return r.ok ? formatValue(r.value, "fraction") : r.reason;
  };
  it("reads both digit systems, decimal marks and fractions", () => {
    expect(value("١٢٣")).toBe("123");
    expect(value("۱۲۳")).toBe("123");
    expect(value("12.5")).toBe("25/2");
    expect(value("12٫5")).toBe("25/2");
    expect(value(".5")).toBe("1/2");
    expect(value("+7")).toBe("7");
    expect(value("-3/4")).toBe("-3/4");
    expect(value(" 42 ")).toBe("42");
    expect(value("٤٢‏")).toBe("42");
    expect(value(2.5)).toBe("5/2");
    expect(value("½")).toBe("1/2"); // NFKC: 1⁄2 with the fraction slash
  });
  it("applies the strict comma rule", () => {
    expect(value("1,250")).toBe("1250");
    expect(value("12,345,678")).toBe("12345678");
    expect(value("2,5")).toBe("5/2");
    expect(value("2,50")).toBe("5/2");
    expect(value("2,5000")).toBe("5/2");
    expect(value("0,125")).toBe("ambiguous_separator");
    expect(value("1234,567")).toBe("ambiguous_separator");
    expect(value("1,250.5")).toBe("ambiguous_separator");
    expect(value("1,250٫5")).toBe("ambiguous_separator");
    expect(value("1,2,3")).toBe("invalid_number");
    expect(value("1٬250")).toBe("1250");
    expect(value("1٬25")).toBe("invalid_number");
  });
  it("never reads a superscript as a digit (x² ≠ x2)", () => {
    // Regression: NFKC ran first, so "10²" parsed as 102 and "2³" as 23.
    expect(value("10²")).toBe("invalid_number");
    expect(value("2³")).toBe("invalid_number");
    expect(value("١٠²")).toBe("invalid_number");
    expect(value("5⁻¹")).toBe("invalid_number");
    expect(value("¾")).toBe("3/4");
    expect(value("-½")).toBe("-1/2");
    expect(value("2½")).toBe("invalid_number"); // mixed numbers are not a v1 input form
    expect(gradeResponse("numeric", { answer: { value: "102", tolerance: { kind: "abs", value: "0" } }, unit: null, input: { allow_fraction: true, max_decimals: 4 } }, { value: "10²" }).score).toBe(0);
  });
  it("rejects anything that is not a number", () => {
    for (const s of ["", "abc", "1 2", "1/0", "5.", "--1", "1e5", "Infinity", "0x10", "1/2/3", null, undefined, {}, NaN]) {
      expect(parseNumber(s).ok, String(s)).toBe(false);
    }
  });
});

describe("answers.js helpers", () => {
  const mcq = { options: [{ id: "o1", text: "٧" }, { id: "o2", text: "32" }], answer: { option_id: "o2" }, fixed_order_reason: null };
  const matching = { left: [{ id: "l1", text: "أ" }, { id: "l2", text: "ب" }], right: [{ id: "r1", text: "1" }, { id: "r2", text: "2" }], answer: { pairs: [["l1", "r1"], ["l2", "r2"]] }, scoring: "partial" };

  it("validates response shapes before grading", () => {
    expect(validateResponse("mcq", mcq, { option_id: "o1" })).toEqual({ ok: true, empty: false });
    expect(validateResponse("mcq", mcq, "o1")).toEqual({ ok: false, reason: "bad_shape" });
    expect(validateResponse("matching", matching, { pairs: [["l1", "r1"], ["l1", "r2"]] })).toEqual({ ok: false, reason: "duplicate_left" });
    expect(validateResponse("matching", matching, { pairs: [["l1"]] })).toEqual({ ok: false, reason: "unknown_pair" });
    expect(validateResponse("essay", {}, { text: "x" })).toEqual({ ok: false, reason: "unknown_type" });
    expect(gradeResponse("mcq", mcq, { option_id: 3 })).toEqual({ score: 0, verdict: "incorrect", reason: "unknown_option" });
  });

  it("returns the canonical correct response", () => {
    expect(correctResponse("mcq", mcq)).toEqual({ option_id: "o2" });
    expect(correctResponse("matching", matching)).toEqual({ pairs: [["l1", "r1"], ["l2", "r2"]] });
    expect(correctResponse("short_answer", { accepted: ["7", "سبعة"], answer_display: "7 (سبعة)" })).toEqual({ text: "7 (سبعة)" });
    expect(correctResponse("numeric", { answer: { value: "5" }, unit: { text: "سم" } })).toEqual({ value: "5", unit: "سم" });
    for (const c of fixture.cases.filter((k) => k.expected.verdict === "correct" && k.type !== "short_answer" && k.type !== "numeric")) {
      expect(gradeResponse(c.type, c.payload, correctResponse(c.type, c.payload)).score, c.id).toBe(1);
    }
  });

  it("builds a text-based canonical answer, independent of opaque ids", () => {
    const renamed = { ...mcq, options: [{ id: "oaaaaaa", text: "٧" }, { id: "obbbbbb", text: "32" }], answer: { option_id: "obbbbbb" } };
    expect(canonicalAnswer("mcq", mcq)).toBe("32");
    expect(canonicalAnswer("mcq", renamed)).toBe(canonicalAnswer("mcq", mcq));
    expect(canonicalAnswer("matching", matching)).toBe("ا=1|ب=2");
    expect(canonicalAnswer("ordering", { items: [{ id: "s1", text: "افهم" }, { id: "s2", text: "خطط" }], answer: { order: ["s2", "s1"] } })).toBe("خطط|افهم");
    expect(canonicalAnswer("short_answer", { accepted: ["سبعة", "7", "7"] })).toBe("7|سبعه");
    expect(canonicalAnswer("numeric", { answer: { value: "2.50" }, unit: { text: "سم" } })).toBe("5/2 سم");
    expect(() => canonicalAnswer("essay", {})).toThrow();
  });

  it("strips every answer from the public payload", () => {
    for (const c of fixture.cases) {
      const pub = JSON.stringify({ ...publicPayload(c.type, c.payload), unit: null }); // accepted units are input rules, not answers
      expect(pub, c.id).not.toMatch(/"(answer|accepted|accepted_norm|answer_display|tolerance|pairs|order)"/);
    }
    expect(publicPayload("numeric", { answer: { value: "5" }, unit: { text: "سم", required: true, accepted: ["cm"] }, input: { allow_fraction: false, max_decimals: 0 } }))
      .toEqual({ unit: { text: "سم", required: true, accepted: ["cm"] }, input: { allow_fraction: false, max_decimals: 0 } });
  });

  it("projects public entries to {id, text} so no extra canonical field leaks", () => {
    // Regression: matching/ordering entries were passed through as stored.
    const leaky = { id: "l1", text: "أ", match: "r1", correct: true };
    expect(publicPayload("matching", { ...matching, left: [leaky, matching.left[1]] }).left).toEqual([{ id: "l1", text: "أ" }, { id: "l2", text: "ب" }]);
    expect(publicPayload("matching", { ...matching, right: [{ id: "r1", text: "1", pair: "l1" }, matching.right[1]] }).right[0]).toEqual({ id: "r1", text: "1" });
    expect(publicPayload("ordering", { items: [{ id: "s1", text: "x", rank: 1 }], answer: { order: ["s1"] }, criterion: "other" }).items).toEqual([{ id: "s1", text: "x" }]);
    expect(publicPayload("mcq", { ...mcq, options: [{ id: "o1", text: "٧", is_correct: false }, { id: "o2", text: "32", is_correct: true }] }).options)
      .toEqual([{ id: "o1", text: "٧" }, { id: "o2", text: "32" }]);
    expect(publicPayload("numeric", { answer: { value: "5" }, unit: null, input: { allow_fraction: true, max_decimals: 2, secret: 1 } }).input).toEqual({ allow_fraction: true, max_decimals: 2 });
  });

  it("treats a negative tolerance as its magnitude", () => {
    // The schema forbids it; the grader must still never make every answer wrong.
    const payload = { answer: { value: "5", tolerance: { kind: "abs", value: "-0.5" } }, unit: null, input: { allow_fraction: true, max_decimals: 4 } };
    expect(gradeResponse("numeric", payload, { value: "5" }).score).toBe(1);
    expect(gradeResponse("numeric", payload, { value: "5.4" }).score).toBe(1);
    expect(gradeResponse("numeric", payload, { value: "5.6" }).score).toBe(0);
  });
});
