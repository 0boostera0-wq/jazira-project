// ============================================================================
// Randomness for the content engine (docs/CONTENT_ENGINE.md §5.2, §4.6).
//
//   u(seed, tag, key)  HASH-CTR keyed draw: int(first 13 hex of
//                      SHA-256(UTF-8(seed + ":" + tag + ":" + key))), a 52-bit
//                      integer, exact in JS doubles and SQL bigint. SQL twin:
//                      ('x'||substr(encode(sha256(convert_to(seed||':'||tag||':'||key,'UTF8')),'hex'),1,13))::bit(52)::bigint
//   newSeed()          128 random bits as 32 lowercase hex chars (server only)
//   sfc32 / seededRng  offline bulk generation (template variants), seeded
//                      from sha256(template_id + "|" + revision)
//   compareC(a, b)     tie-break order = PostgreSQL "C" collation (UTF-8 bytes)
//
// Server/scripts only (node:crypto).
// ============================================================================

import { createHash, randomBytes } from "node:crypto";

export const SEED_RE = /^[0-9a-f]{32}$/;
export const U_MAX = 2 ** 52; // u() ∈ [0, 2^52)

/** Lowercase hex SHA-256 of the UTF-8 bytes of a string (or of a Buffer). */
export function sha256Hex(input) {
  return createHash("sha256").update(typeof input === "string" ? Buffer.from(input, "utf8") : input).digest("hex");
}

/** A fresh server-generated session seed (32 lowercase hex chars). */
export function newSeed() {
  return randomBytes(16).toString("hex");
}

export const isSeed = (s) => typeof s === "string" && SEED_RE.test(s);

/** HASH-CTR draw: a 52-bit integer, independent of evaluation order. */
export function u(seed, tag, key) {
  return parseInt(sha256Hex(`${seed}:${tag}:${key}`).slice(0, 13), 16);
}

/** Byte-wise UTF-8 comparison (PostgreSQL COLLATE "C"). */
export function compareC(a, b) {
  return Buffer.compare(Buffer.from(String(a), "utf8"), Buffer.from(String(b), "utf8"));
}

/** Sort keys by (u(seed, tag, key), key in C order). Returns a new array. */
export function sortByU(seed, tag, keys) {
  return keys
    .map((key) => ({ key, r: u(seed, tag, key) }))
    .sort((x, y) => x.r - y.r || compareC(x.key, y.key))
    .map((x) => x.key);
}

// ── sfc32 ───────────────────────────────────────────────────────────────────
/**
 * sfc32 (Small Fast Counting, Chris Doty-Humphrey): 128-bit state, 32-bit
 * outputs. Returns next() → uint32.
 */
export function sfc32(a, b, c, d) {
  a >>>= 0;
  b >>>= 0;
  c >>>= 0;
  d >>>= 0;
  return function next() {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t;
  };
}

export const SFC32_WARMUP = 12;

/**
 * Deterministic generator seeded from a string: the state is the first four
 * big-endian 32-bit words of SHA-256(seedText), then 12 outputs are discarded.
 * For template variants seedText = template_id + "|" + revision.
 */
export function seededRng(seedText) {
  const h = sha256Hex(seedText);
  const w = [0, 1, 2, 3].map((i) => parseInt(h.slice(i * 8, i * 8 + 8), 16));
  const next = sfc32(w[0], w[1], w[2], w[3]);
  for (let i = 0; i < SFC32_WARMUP; i++) next();
  const rng = {
    /** uint32 */
    next,
    /** float in [0, 1) */
    float: () => next() / 2 ** 32,
    /** unbiased integer in [min, max] (inclusive) by rejection sampling */
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) throw new RangeError("int(min, max)");
      const span = max - min + 1;
      if (span > 2 ** 32) throw new RangeError("range too large");
      const limit = Math.floor(2 ** 32 / span) * span;
      let x;
      do x = next();
      while (x >= limit);
      return min + (x % span);
    },
    /** one element of a non-empty array */
    pick(list) {
      return list[rng.int(0, list.length - 1)];
    },
  };
  return rng;
}

/** Variant seed text for a template (§4.6). */
export const templateSeedText = (templateId, revision) => `${templateId}|${revision}`;
