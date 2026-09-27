import { describe, it, expect } from "vitest";
import {
  evaluate, evaluateNumber, evaluateBoolean, evaluateFloat, formatValue, parseExpr, variables, ExprError,
  rat, eq, toRational, parseDecimal, toDecimalString, LIMITS,
} from "@/lib/content/expr.js";

const val = (src, vars) => formatValue(evaluateNumber(src, vars), "fraction");
const code = (fn) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ExprError);
    return e.code;
  }
  throw new Error("expected an ExprError");
};

describe("expr.js — exact rational arithmetic", () => {
  it("evaluates with exact rationals (no float drift)", () => {
    expect(val("0.1 + 0.2")).toBe("3/10");
    expect(eq(evaluateNumber("0.1 + 0.2"), rat(3n, 10n))).toBe(true);
    expect(val("1/3 + 1/6")).toBe("1/2");
    expect(val("a*b", { a: 8, b: 7 })).toBe("56");
    expect(val("x", { x: 0.1 })).toBe("1/10");
    expect(val("x", { x: "-2.50" })).toBe("-5/2");
    expect(val("x", { x: "3/4" })).toBe("3/4");
    expect(val("123456789012345678901234567890 * 10")).toBe("1234567890123456789012345678900");
  });

  it("follows precedence and associativity", () => {
    expect(val("2 + 3 * 4")).toBe("14");
    expect(val("(2 + 3) * 4")).toBe("20");
    expect(val("2 ^ 3 ^ 2")).toBe("512"); // right-associative
    expect(val("-2 ^ 2")).toBe("-4"); // unary minus binds looser than ^
    expect(val("2 ^ -2")).toBe("1/4");
    expect(val("10 - 4 - 3")).toBe("3");
    expect(val("48 / 4 / 2")).toBe("6");
    expect(val("-(-3)")).toBe("3");
  });

  it("implements the functions of the grammar", () => {
    expect(val("abs(-7)")).toBe("7");
    expect(val("min(3, -1, 2)")).toBe("-1");
    expect(val("max(3, -1, 2)")).toBe("3");
    expect(val("gcd(12, 18)")).toBe("6");
    expect(val("gcd(12, 18, 8)")).toBe("2");
    expect(val("lcm(4, 6)")).toBe("12");
    expect(val("floor(-7/2)")).toBe("-4");
    expect(val("ceil(-7/2)")).toBe("-3");
    expect(val("round(2.345, 2)")).toBe("47/20"); // 2.35: half away from zero
    expect(val("round(-2.5)")).toBe("-3");
    expect(val("round(2.5)")).toBe("3");
    expect(val("sqrt(16/9)")).toBe("4/3");
    expect(val("frac(6, 4)")).toBe("3/2");
    expect(val("7 % 3")).toBe("1");
    expect(val("-7 % 3")).toBe("2"); // floored modulo
    expect(val("7.5 % 2")).toBe("3/2");
  });

  it("evaluates constraints as booleans", () => {
    expect(evaluateBoolean("a != b && abs(a*b) <= 100", { a: 3, b: 4 })).toBe(true);
    expect(evaluateBoolean("a != b && abs(a*b) <= 100", { a: 12, b: 12 })).toBe(false);
    expect(evaluateBoolean("!(a > b) || a == 0", { a: 1, b: 2 })).toBe(true);
    expect(evaluateBoolean("b != 0 && a / b > 1", { a: 1, b: 0 })).toBe(false); // short-circuit
    expect(evaluateBoolean("x", { x: true })).toBe(true);
    expect(evaluate("1 < 2")).toBe(true);
  });

  it("formats values", () => {
    expect(formatValue(evaluate("56"), "int")).toBe("56");
    expect(code(() => formatValue(evaluate("7/2"), "int"))).toBe("not_integer");
    expect(formatValue(evaluate("2/3"), "decimal:2")).toBe("0.67");
    expect(formatValue(evaluate("1/8"), "decimal:2")).toBe("0.13");
    expect(formatValue(evaluate("-1/8"), "decimal:2")).toBe("-0.13");
    expect(formatValue(evaluate("-0.001"), "decimal:2")).toBe("0.00");
    expect(formatValue(evaluate("5"), "decimal:1")).toBe("5.0");
    expect(formatValue(evaluate("-6/4"), "fraction")).toBe("-3/2");
    expect(formatValue(evaluate("-6/4"), "mixed")).toBe("-1 1/2");
    expect(formatValue(evaluate("3/4"), "mixed")).toBe("3/4");
    expect(formatValue(evaluate("8"), "mixed")).toBe("8");
    expect(code(() => formatValue(evaluate("1"), "hex"))).toBe("domain");
    expect(toDecimalString(evaluate("7/4"))).toBe("1.75");
    expect(toDecimalString(evaluate("1/3"))).toBeNull();
    expect(parseDecimal("1e5")).toBeNull();
    expect(toRational(1e-7)).toEqual(rat(1n, 10000000n));
  });

  it("lists the variables an expression reads", () => {
    expect(variables("a*(b-1) + abs(c) - min(a, d)")).toEqual(["a", "b", "c", "d"]);
    expect(parseExpr("a+b")).toBe(parseExpr("a+b")); // cached AST
  });
});

describe("expr.js — errors and unsafe input", () => {
  it("rejects division by zero, non-integer exponents and inexact square roots", () => {
    expect(code(() => evaluate("1/0"))).toBe("division_by_zero");
    expect(code(() => evaluate("5 % 0"))).toBe("division_by_zero");
    expect(code(() => evaluate("0 ^ -1"))).toBe("division_by_zero");
    expect(code(() => evaluate("2 ^ 0.5"))).toBe("not_integer");
    expect(code(() => evaluate("sqrt(2)"))).toBe("not_perfect_square");
    expect(code(() => evaluate("sqrt(-4)"))).toBe("domain");
    expect(code(() => evaluate("gcd(1.5, 3)"))).toBe("not_integer");
    expect(code(() => evaluate("round(2.5, 0.5)"))).toBe("not_integer");
  });

  it("type-checks numbers and booleans", () => {
    expect(code(() => evaluate("(1 < 2) + 1"))).toBe("type");
    expect(code(() => evaluate("!3"))).toBe("type");
    expect(code(() => evaluate("1 == (1 < 2)"))).toBe("type");
    expect(code(() => evaluateBoolean("1 + 1"))).toBe("type");
    expect(code(() => evaluateNumber("1 < 2"))).toBe("type");
  });

  it("never reaches JavaScript objects, globals or eval", () => {
    for (const src of ["constructor", "__proto__", "toString", "process", "globalThis", "eval"]) {
      expect(code(() => evaluate(src, {})), src).toBe("unknown_identifier");
    }
    expect(code(() => evaluate("hasOwnProperty", { a: 1 }))).toBe("unknown_identifier");
    expect(code(() => evaluate("process.exit()"))).toBe("syntax");
    expect(code(() => evaluate("a.b", { a: 1 }))).toBe("syntax");
    expect(code(() => evaluate("a[0]", { a: 1 }))).toBe("syntax");
    expect(code(() => evaluate("'1' + 1"))).toBe("syntax");
    expect(code(() => evaluate("1; 2"))).toBe("syntax");
    expect(code(() => evaluate("a = 1", { a: 1 }))).toBe("syntax");
    expect(code(() => evaluate("`x`"))).toBe("syntax");
    expect(code(() => evaluate("alert(1)"))).toBe("unknown_function");
    expect(code(() => evaluate("abs"))).toBe("syntax");
    expect(code(() => evaluate("abs(1, 2)"))).toBe("arity");
    expect(code(() => evaluate(""))).toBe("syntax");
    expect(code(() => evaluate("1 +"))).toBe("syntax");
    expect(code(() => evaluate("(1 + 2"))).toBe("syntax");
    expect(code(() => evaluate("1 2"))).toBe("syntax");
    expect(code(() => evaluate("2x", { x: 1 }))).toBe("syntax");
    expect(code(() => evaluate("٣ + 1"))).toBe("syntax");
    expect(code(() => evaluate(42))).toBe("syntax");
  });

  it("bounds size, depth and magnitude", () => {
    expect(code(() => evaluate("1+".repeat(600) + "1"))).toBe("too_long");
    expect(code(() => evaluate("(".repeat(LIMITS.maxDepth + 5) + "1" + ")".repeat(LIMITS.maxDepth + 5)))).toBe("too_deep");
    expect(code(() => evaluate("-".repeat(LIMITS.maxDepth + 5) + "1"))).toBe("too_deep");
    expect(code(() => evaluate("2 ^ 100000"))).toBe("overflow");
    expect(code(() => evaluate("10 ^ 1000 * 10 ^ 1000"))).toBe("overflow");
    expect(code(() => evaluate("1" + "0".repeat(80)))).toBe("too_long");
    expect(val("2 ^ 64")).toBe("18446744073709551616");
  });

  it("takes exact square roots of numbers above 2^1024 without a RangeError", () => {
    // Regression: the Newton seed used Number(x), which is Infinity above 2^1024,
    // and BigInt(Infinity) threw a RangeError instead of an ExprError / a result.
    expect(val("sqrt(4 ^ 600)")).toBe((2n ** 600n).toString());
    expect(val("sqrt((3 ^ 700) ^ 2) / 3 ^ 700")).toBe("1");
    expect(val("sqrt(frac(4 ^ 600, 9))")).toBe(`${2n ** 600n}/3`);
    expect(code(() => evaluate("sqrt(4 ^ 600 + 1)"))).toBe("not_perfect_square");
    expect(code(() => evaluate("sqrt(2 ^ 1001 * 2 ^ 100)"))).toBe("not_perfect_square"); // 2^1101
    for (let n = 0n; n < 200n; n++) {
      expect(val(`sqrt(${n * n})`)).toBe(n.toString());
      if (n > 1n) expect(code(() => evaluate(`sqrt(${n * n + 1n})`))).toBe("not_perfect_square");
    }
  });
});

describe("expr.js — float cross-check", () => {
  it("agrees with the rational evaluator within 1e-9 on template-style expressions", () => {
    const exprs = ["a*b", "a+b", "-(a*b)", "a*(b-1)", "a/b + 1/3", "abs(a-b)^2", "round(a/b, 2)", "max(a, b) - min(a, b)", "(a+b)*(a-b)", "a % b"];
    let checked = 0;
    for (let a = -12; a <= 12; a += 5) {
      for (let b = 2; b <= 12; b += 3) {
        for (const e of exprs) {
          const exact = Number(formatValue(evaluateNumber(e, { a, b }), "decimal:12"));
          expect(Math.abs(exact - evaluateFloat(e, { a, b })), `${e} a=${a} b=${b}`).toBeLessThan(1e-9);
          checked++;
        }
      }
    }
    expect(checked).toBe(5 * 4 * exprs.length);
  });
});
