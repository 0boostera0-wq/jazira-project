// ============================================================================
// Safe expression grammar + exact rational evaluator (docs/CONTENT_ENGINE.md
// §4.6). Used by `computation` recomputation (checks N002/N004), template
// variants (WP5) and numeric grading (answers.js).
//
//   evaluate("a*b", { a: 8, b: 7 })        → Rational 56/1
//   evaluateBoolean("a != b && abs(a*b) <= 100", vars) → true
//   formatValue(evaluate("frac(7,2)"), "mixed")        → "3 1/2"
//
// Grammar (no eval, no property access, no strings):
//   expr    := or
//   or      := and ( "||" and )*
//   and     := eq ( "&&" eq )*
//   eq      := rel ( ("==" | "!=") rel )*
//   rel     := add ( ("<" | "<=" | ">" | ">=") add )*
//   add     := mul ( ("+" | "-") mul )*
//   mul     := unary ( ("*" | "/" | "%") unary )*
//   unary   := ("-" | "+" | "!") unary | power
//   power   := primary ( "^" unary )?          (right-associative; -2^2 = -4)
//   primary := number | identifier | identifier "(" args ")" | "(" expr ")"
// Functions: abs min max gcd lcm floor ceil round(x[,d]) sqrt frac(n,d).
// Numbers are exact rationals (BigInt numerator/denominator); `^` needs an
// integer exponent; sqrt only accepts exact squares; `%` is floored modulo.
// Unsafe input (length, depth, unknown characters or names, huge numbers)
// throws ExprError. Pure: no Node or browser APIs.
// ============================================================================

export class ExprError extends Error {
  constructor(code, message) {
    super(message ? `${code}: ${message}` : code);
    this.name = "ExprError";
    this.code = code;
  }
}

export const LIMITS = Object.freeze({
  maxSource: 1000,
  maxTokens: 400,
  maxDepth: 48,
  maxBits: 4096,
  maxExponent: 1024,
  maxRoundDigits: 20,
  maxLiteralDigits: 60,
});

// ── rationals ───────────────────────────────────────────────────────────────
const bigAbs = (x) => (x < 0n ? -x : x);
function bigGcd(a, b) {
  a = bigAbs(a);
  b = bigAbs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
const bitLength = (x) => (x === 0n ? 0 : bigAbs(x).toString(2).length);

/** Reduced rational with a positive denominator. */
export function rat(n, d = 1n) {
  n = BigInt(n);
  d = BigInt(d);
  if (d === 0n) throw new ExprError("division_by_zero");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = bigGcd(n, d) || 1n;
  n /= g;
  d /= g;
  if (bitLength(n) > LIMITS.maxBits || bitLength(d) > LIMITS.maxBits) throw new ExprError("overflow", "number too large");
  return Object.freeze({ n, d });
}

export const isRational = (v) => v !== null && typeof v === "object" && typeof v.n === "bigint" && typeof v.d === "bigint";
export const ZERO = rat(0n);
export const ONE = rat(1n);
export const add = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => rat(a.n * b.n, a.d * b.d);
export const neg = (a) => rat(-a.n, a.d);
export const absR = (a) => rat(bigAbs(a.n), a.d);
export function div(a, b) {
  if (b.n === 0n) throw new ExprError("division_by_zero");
  return rat(a.n * b.d, a.d * b.n);
}
/** -1, 0 or 1. */
export const cmp = (a, b) => {
  const x = a.n * b.d - b.n * a.d;
  return x < 0n ? -1 : x > 0n ? 1 : 0;
};
export const eq = (a, b) => a.n === b.n && a.d === b.d;
export const isInteger = (a) => a.d === 1n;
export function floorR(a) {
  const q = a.n / a.d; // truncates toward zero
  return rat(a.n < 0n && q * a.d !== a.n ? q - 1n : q);
}
export function ceilR(a) {
  const q = a.n / a.d;
  return rat(a.n > 0n && q * a.d !== a.n ? q + 1n : q);
}
/** Round half away from zero to `digits` decimals (like SQL round(numeric, d)). */
export function roundR(a, digits = 0) {
  if (!Number.isInteger(digits) || digits < 0 || digits > LIMITS.maxRoundDigits) throw new ExprError("domain", "round digits");
  const scale = 10n ** BigInt(digits);
  const scaled = bigAbs(a.n) * scale;
  let q = scaled / a.d;
  if ((scaled % a.d) * 2n >= a.d) q += 1n;
  return rat(a.n < 0n ? -q : q, scale);
}
export function powR(base, exp) {
  if (!isInteger(exp)) throw new ExprError("not_integer", "exponent must be an integer");
  const e = exp.n;
  if (bigAbs(e) > BigInt(LIMITS.maxExponent)) throw new ExprError("overflow", "exponent too large");
  const k = Number(bigAbs(e));
  if ((bitLength(base.n) + bitLength(base.d)) * k > LIMITS.maxBits * 2) throw new ExprError("overflow", "power too large");
  if (e < 0n && base.n === 0n) throw new ExprError("division_by_zero");
  const p = rat(base.n ** BigInt(k), base.d ** BigInt(k));
  return e < 0n ? div(ONE, p) : p;
}
function bigSqrtExact(x) {
  if (x < 0n) return null;
  if (x < 2n) return x;
  // Start at 2^ceil(bits/2) ≥ sqrt(x): Number(x) is Infinity above 2^1024 and
  // BigInt(Infinity) throws, so no float seed. Newton then decreases monotonically.
  let r = 1n << BigInt(Math.ceil(bitLength(x) / 2));
  for (let i = 0; i < 4 * LIMITS.maxBits; i++) {
    const next = (r + x / r) >> 1n;
    if (next === r || next === r + 1n || next === r - 1n) {
      for (const c of [next - 1n, next, next + 1n, r]) if (c >= 0n && c * c === x) return c;
      return null;
    }
    r = next;
  }
  return null;
}
export function sqrtR(a) {
  if (a.n < 0n) throw new ExprError("domain", "sqrt of a negative number");
  const n = bigSqrtExact(a.n);
  const d = bigSqrtExact(a.d);
  if (n === null || d === null) throw new ExprError("not_perfect_square");
  return rat(n, d);
}
/** Floored modulo a − b·floor(a/b). */
export const modR = (a, b) => sub(a, mul(b, floorR(div(a, b))));
function intOnly(a, fn) {
  if (!isInteger(a)) throw new ExprError("not_integer", `${fn} needs integers`);
  return a.n;
}
export const gcdR = (a, b) => rat(bigGcd(intOnly(a, "gcd"), intOnly(b, "gcd")));
export function lcmR(a, b) {
  const x = intOnly(a, "lcm");
  const y = intOnly(b, "lcm");
  if (x === 0n || y === 0n) return ZERO;
  return rat(bigAbs(x * y) / bigGcd(x, y));
}

const DECIMAL_RE = /^([+-]?)(\d+)(?:\.(\d+))?$/;
const FRACTION_RE = /^([+-]?)(\d+)\/(\d+)$/;

/** Exact rational from a decimal string ("-2.50") or null. */
export function parseDecimal(str) {
  const m = DECIMAL_RE.exec(String(str ?? "").trim());
  if (!m || m[2].length + (m[3]?.length ?? 0) > LIMITS.maxLiteralDigits) return null;
  const frac = m[3] ?? "";
  const r = rat(BigInt(m[2] + frac), 10n ** BigInt(frac.length));
  return m[1] === "-" ? neg(r) : r;
}

/** Exact rational from "a/b", a decimal string, a JS number, a bigint or a rational. */
export function toRational(v) {
  if (isRational(v)) return v;
  if (typeof v === "bigint") return rat(v);
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new ExprError("type", "non-finite number");
    if (Number.isInteger(v)) return rat(BigInt(v));
    const s = String(v);
    const exp = /^(-?)(\d+(?:\.\d+)?)e([+-]\d+)$/.exec(s);
    if (exp) {
      const base = parseDecimal(exp[2]);
      const r = mul(base, powR(rat(10n), rat(BigInt(exp[3]))));
      return exp[1] === "-" ? neg(r) : r;
    }
    return parseDecimal(s);
  }
  if (typeof v === "string") {
    const f = FRACTION_RE.exec(v.trim());
    if (f) {
      const r = rat(BigInt(f[2]), BigInt(f[3]));
      return f[1] === "-" ? neg(r) : r;
    }
    const d = parseDecimal(v);
    if (d) return d;
  }
  throw new ExprError("type", "not a number");
}

export const toNumber = (a) => Number(a.n) / Number(a.d);

/** Exact decimal string when the value terminates in base 10, else null. */
export function toDecimalString(a) {
  let d = a.d;
  let twos = 0;
  let fives = 0;
  while (d % 2n === 0n) {
    d /= 2n;
    twos++;
  }
  while (d % 5n === 0n) {
    d /= 5n;
    fives++;
  }
  if (d !== 1n) return null;
  const places = Math.max(twos, fives);
  return fixed(rat(a.n * 10n ** BigInt(places), a.d * 10n ** BigInt(places)), places);
}

function fixed(a, places) {
  // `a` is already rounded to `places` decimals.
  const scale = 10n ** BigInt(places);
  const v = (a.n * scale) / a.d;
  const sign = v < 0n ? "-" : "";
  const digits = bigAbs(v).toString().padStart(places + 1, "0");
  return places === 0 ? sign + digits : `${sign}${digits.slice(0, -places)}.${digits.slice(-places)}`;
}

/**
 * Format a value: `int` (must be an integer), `decimal:<d>` (half away from
 * zero), `fraction` ("-3/4", "5"), `mixed` ("-1 1/2", "3/4", "5").
 */
export function formatValue(value, format = "fraction") {
  const a = toRational(value);
  if (format === "int") {
    if (!isInteger(a)) throw new ExprError("not_integer", "int format needs an integer");
    return a.n.toString();
  }
  const dec = /^decimal:(\d{1,2})$/.exec(format);
  if (dec) {
    const places = Number(dec[1]);
    if (places > LIMITS.maxRoundDigits) throw new ExprError("domain", "decimal places");
    const s = fixed(roundR(a, places), places);
    return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
  }
  if (format === "fraction") return isInteger(a) ? a.n.toString() : `${a.n}/${a.d}`;
  if (format === "mixed") {
    if (isInteger(a)) return a.n.toString();
    const whole = bigAbs(a.n) / a.d;
    const rest = bigAbs(a.n) % a.d;
    const sign = a.n < 0n ? "-" : "";
    return whole === 0n ? `${sign}${rest}/${a.d}` : `${sign}${whole} ${rest}/${a.d}`;
  }
  throw new ExprError("domain", `unknown format ${format}`);
}

// ── tokenizer ───────────────────────────────────────────────────────────────
const FUNCTIONS = Object.freeze({
  abs: [1, 1], min: [1, 16], max: [1, 16], gcd: [2, 16], lcm: [2, 16],
  floor: [1, 1], ceil: [1, 1], round: [1, 2], sqrt: [1, 1], frac: [2, 2],
});
export const FUNCTION_NAMES = Object.freeze(Object.keys(FUNCTIONS));
const TWO_CHAR_OPS = new Set(["==", "!=", "<=", ">=", "&&", "||"]);
const ONE_CHAR_OPS = new Set(["+", "-", "*", "/", "^", "%", "(", ")", ",", "<", ">", "!"]);

function tokenize(src) {
  if (typeof src !== "string") throw new ExprError("syntax", "expression must be a string");
  if (src.length > LIMITS.maxSource) throw new ExprError("too_long");
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }
    if (c >= "0" && c <= "9") {
      const m = /^\d+(?:\.\d+)?/.exec(src.slice(i));
      if (/^[A-Za-z_.]/.test(src.slice(i + m[0].length))) throw new ExprError("syntax", `bad number at ${i}`);
      const value = parseDecimal(m[0]);
      if (!value) throw new ExprError("too_long", "number literal");
      tokens.push({ t: "num", value, pos: i });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      if (m[0].length > 64) throw new ExprError("too_long", "identifier");
      tokens.push({ t: "id", name: m[0], pos: i });
      i += m[0].length;
    } else if (TWO_CHAR_OPS.has(src.slice(i, i + 2))) {
      tokens.push({ t: "op", op: src.slice(i, i + 2), pos: i });
      i += 2;
    } else if (ONE_CHAR_OPS.has(c)) {
      tokens.push({ t: "op", op: c, pos: i });
      i++;
    } else {
      throw new ExprError("syntax", `unexpected character at ${i}`);
    }
    if (tokens.length > LIMITS.maxTokens) throw new ExprError("too_long", "too many tokens");
  }
  return tokens;
}

// ── parser ──────────────────────────────────────────────────────────────────
function parseTokens(tokens) {
  let p = 0;
  let depth = 0;
  const peek = () => tokens[p];
  const isOp = (op) => peek()?.t === "op" && peek().op === op;
  const expect = (op) => {
    if (!isOp(op)) throw new ExprError("syntax", `expected "${op}"`);
    p++;
  };
  const enter = () => {
    if (++depth > LIMITS.maxDepth) throw new ExprError("too_deep");
  };
  const binaryLevel = (ops, next) => () => {
    let left = next();
    while (peek()?.t === "op" && ops.includes(peek().op)) {
      const op = tokens[p++].op;
      left = { k: "bin", op, left, right: next() };
    }
    return left;
  };
  const primary = () => {
    const tok = peek();
    if (!tok) throw new ExprError("syntax", "unexpected end");
    if (tok.t === "num") {
      p++;
      return { k: "num", value: tok.value };
    }
    if (tok.t === "id") {
      p++;
      if (isOp("(")) {
        if (!Object.hasOwn(FUNCTIONS, tok.name)) throw new ExprError("unknown_function", tok.name);
        p++;
        const args = [];
        if (!isOp(")")) {
          args.push(expr());
          while (isOp(",")) {
            p++;
            args.push(expr());
          }
        }
        expect(")");
        const [min, max] = FUNCTIONS[tok.name];
        if (args.length < min || args.length > max) throw new ExprError("arity", tok.name);
        return { k: "call", name: tok.name, args };
      }
      if (Object.hasOwn(FUNCTIONS, tok.name)) throw new ExprError("syntax", `${tok.name} needs arguments`);
      return { k: "var", name: tok.name };
    }
    if (isOp("(")) {
      p++;
      const inner = expr();
      expect(")");
      return inner;
    }
    throw new ExprError("syntax", `unexpected token at ${tok.pos}`);
  };
  const power = () => {
    const base = primary();
    if (isOp("^")) {
      p++;
      return { k: "bin", op: "^", left: base, right: unary() };
    }
    return base;
  };
  function unary() {
    enter();
    let node;
    if (peek()?.t === "op" && ["-", "+", "!"].includes(peek().op)) {
      const op = tokens[p++].op;
      node = { k: "un", op, arg: unary() };
    } else node = power();
    depth--;
    return node;
  }
  const mulLevel = binaryLevel(["*", "/", "%"], unary);
  const addLevel = binaryLevel(["+", "-"], mulLevel);
  const relLevel = binaryLevel(["<", "<=", ">", ">="], addLevel);
  const eqLevel = binaryLevel(["==", "!="], relLevel);
  const andLevel = binaryLevel(["&&"], eqLevel);
  const orLevel = binaryLevel(["||"], andLevel);
  function expr() {
    enter();
    const node = orLevel();
    depth--;
    return node;
  }
  if (!tokens.length) throw new ExprError("syntax", "empty expression");
  const ast = expr();
  if (p !== tokens.length) throw new ExprError("syntax", `unexpected token at ${tokens[p].pos}`);
  return ast;
}

const CACHE = new Map();
/** Parse (cached) an expression into an AST. Throws ExprError. */
export function parseExpr(src) {
  if (typeof src === "object" && src && src.k) return src;
  const hit = CACHE.get(src);
  if (hit) return hit;
  const ast = parseTokens(tokenize(src));
  if (CACHE.size > 500) CACHE.clear();
  CACHE.set(src, ast);
  return ast;
}

/** Identifiers an expression reads (function names excluded), sorted. */
export function variables(src) {
  const out = new Set();
  const walk = (n) => {
    if (n.k === "var") out.add(n.name);
    else if (n.k === "un") walk(n.arg);
    else if (n.k === "bin") {
      walk(n.left);
      walk(n.right);
    } else if (n.k === "call") n.args.forEach(walk);
  };
  walk(parseExpr(src));
  return [...out].sort();
}

// ── exact evaluation ────────────────────────────────────────────────────────
function lookup(vars, name, convert) {
  if (!vars || typeof vars !== "object" || !Object.hasOwn(vars, name)) throw new ExprError("unknown_identifier", name);
  const v = vars[name];
  return typeof v === "boolean" ? v : convert(v);
}
const needNum = (v) => {
  if (typeof v === "boolean") throw new ExprError("type", "number expected");
  return v;
};
const needBool = (v) => {
  if (typeof v !== "boolean") throw new ExprError("type", "boolean expected");
  return v;
};

function evalBinaryExact(n, vars) {
  if (n.op === "&&") return needBool(evalExact(n.left, vars)) && needBool(evalExact(n.right, vars));
  if (n.op === "||") return needBool(evalExact(n.left, vars)) || needBool(evalExact(n.right, vars));
  const a = evalExact(n.left, vars);
  const b = evalExact(n.right, vars);
  if (n.op === "==" || n.op === "!=") {
    if (typeof a !== typeof b) throw new ExprError("type", "comparing a number with a boolean");
    const same = typeof a === "boolean" ? a === b : eq(a, b);
    return n.op === "==" ? same : !same;
  }
  const x = needNum(a);
  const y = needNum(b);
  switch (n.op) {
    case "+": return add(x, y);
    case "-": return sub(x, y);
    case "*": return mul(x, y);
    case "/": return div(x, y);
    case "%": return modR(x, y);
    case "^": return powR(x, y);
    case "<": return cmp(x, y) < 0;
    case "<=": return cmp(x, y) <= 0;
    case ">": return cmp(x, y) > 0;
    case ">=": return cmp(x, y) >= 0;
    default: throw new ExprError("syntax", n.op);
  }
}

function evalCallExact(n, vars) {
  const args = n.args.map((a) => needNum(evalExact(a, vars)));
  switch (n.name) {
    case "abs": return absR(args[0]);
    case "min": return args.reduce((m, v) => (cmp(v, m) < 0 ? v : m));
    case "max": return args.reduce((m, v) => (cmp(v, m) > 0 ? v : m));
    case "gcd": return args.reduce(gcdR);
    case "lcm": return args.reduce(lcmR);
    case "floor": return floorR(args[0]);
    case "ceil": return ceilR(args[0]);
    case "round": {
      const d = args[1] ?? ZERO;
      if (!isInteger(d)) throw new ExprError("not_integer", "round digits");
      if (d.n < 0n || d.n > BigInt(LIMITS.maxRoundDigits)) throw new ExprError("domain", "round digits");
      return roundR(args[0], Number(d.n));
    }
    case "sqrt": return sqrtR(args[0]);
    case "frac": return div(args[0], args[1]);
    default: throw new ExprError("unknown_function", n.name);
  }
}

function evalExact(n, vars) {
  switch (n.k) {
    case "num":
      return n.value;
    case "var":
      return lookup(vars, n.name, toRational);
    case "un": {
      const a = evalExact(n.arg, vars);
      if (n.op === "!") return !needBool(a);
      return n.op === "-" ? neg(needNum(a)) : needNum(a);
    }
    case "bin":
      return evalBinaryExact(n, vars);
    case "call":
      return evalCallExact(n, vars);
    default:
      throw new ExprError("syntax", "bad node");
  }
}

/** Exact value (Rational or boolean) of an expression over `vars`. */
export function evaluate(src, vars = {}) {
  return evalExact(parseExpr(src), vars);
}

/** Exact numeric value; throws ExprError when the expression is boolean. */
export function evaluateNumber(src, vars = {}) {
  return needNum(evaluate(src, vars));
}

/** Boolean value (template constraints); throws ExprError when numeric. */
export function evaluateBoolean(src, vars = {}) {
  return needBool(evaluate(src, vars));
}

// ── independent float re-evaluation (variant cross-check, §4.6) ────────────
const floatGcd = (x, y) => {
  x = Math.abs(x);
  y = Math.abs(y);
  while (y) [x, y] = [y, x % y];
  return x;
};
const FLOAT_BIN = {
  "+": (a, b) => a + b, "-": (a, b) => a - b, "*": (a, b) => a * b, "/": (a, b) => a / b,
  "%": (a, b) => a - b * Math.floor(a / b), "^": (a, b) => Math.pow(a, b),
  "==": (a, b) => a === b, "!=": (a, b) => a !== b, "<": (a, b) => a < b,
  "<=": (a, b) => a <= b, ">": (a, b) => a > b, ">=": (a, b) => a >= b,
};
const FLOAT_FN = {
  abs: (x) => Math.abs(x), min: (...a) => Math.min(...a), max: (...a) => Math.max(...a),
  gcd: (...a) => a.reduce(floatGcd), lcm: (...a) => a.reduce((x, y) => (x === 0 || y === 0 ? 0 : Math.abs(x * y) / floatGcd(x, y))),
  floor: Math.floor, ceil: Math.ceil, sqrt: Math.sqrt, frac: (x, y) => x / y,
  round: (x, d = 0) => (Math.sign(x) * Math.round(Math.abs(x) * 10 ** d)) / 10 ** d,
};

function evalFloat(n, vars) {
  switch (n.k) {
    case "num":
      return toNumber(n.value);
    case "var":
      return lookup(vars, n.name, (v) => (typeof v === "number" ? v : toNumber(toRational(v))));
    case "un": {
      const a = evalFloat(n.arg, vars);
      return n.op === "!" ? !a : n.op === "-" ? -a : a;
    }
    case "bin":
      if (n.op === "&&") return evalFloat(n.left, vars) && evalFloat(n.right, vars);
      if (n.op === "||") return evalFloat(n.left, vars) || evalFloat(n.right, vars);
      return FLOAT_BIN[n.op](evalFloat(n.left, vars), evalFloat(n.right, vars));
    case "call":
      return FLOAT_FN[n.name](...n.args.map((a) => evalFloat(a, vars)));
    default:
      return NaN;
  }
}

/** Float value of the same expression (a cross-check, never the source of truth). */
export function evaluateFloat(src, vars = {}) {
  return evalFloat(parseExpr(src), vars);
}
