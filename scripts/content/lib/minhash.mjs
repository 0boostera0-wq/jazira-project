// ============================================================================
// MurmurHash3 x86_32, MinHash signatures and LSH banding (docs/CONTENT_ENGINE.md
// §4.5 step 4). Used by dedup.mjs for cross-lesson candidate generation only;
// every candidate pair is verified with exact Jaccard afterwards.
//
//   murmur3_32(input, seed)      reference MurmurHash3_x86_32 over UTF-8 bytes
//   minhashSignature(set)        128 values, hash functions = seeds 1..128
//   lshCandidatePairs(entries)   32 bands × 3 rows (uses the first 96 values):
//                                recall ≈ 0.88 at J = 0.40, ≈ 0.997 at J = 0.55
//   estimateJaccard(sa, sb)      share of equal signature slots
//
// Pure (no I/O); deterministic for a given input.
// ============================================================================

export const MINHASH_FUNCTIONS = 128;
export const LSH_BANDS = 32;
export const LSH_ROWS = 3;

const C1 = 0xcc9e2d51;
const C2 = 0x1b873593;
const textEncoder = new TextEncoder();

/** Bytes of a string (UTF-8) or a byte array. */
function toBytes(input) {
  if (typeof input === "string") return textEncoder.encode(input);
  if (input instanceof Uint8Array) return input;
  throw new TypeError("murmur3_32 expects a string or Uint8Array");
}

/**
 * MurmurHash3_x86_32 (Austin Appleby, public domain), little-endian blocks.
 * @param {string|Uint8Array} input  strings are hashed as UTF-8 bytes
 * @param {number} seed  uint32
 * @returns {number} uint32
 */
export function murmur3_32(input, seed = 0) {
  const data = toBytes(input);
  const len = data.length;
  const nblocks = len >>> 2;
  let h1 = seed >>> 0;
  for (let i = 0; i < nblocks; i++) {
    const o = i << 2;
    let k1 = data[o] | (data[o + 1] << 8) | (data[o + 2] << 16) | (data[o + 3] << 24);
    k1 = Math.imul(k1, C1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, C2);
    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = (Math.imul(h1, 5) + 0xe6546b64) | 0;
  }
  const tail = nblocks << 2;
  let k1 = 0;
  switch (len & 3) {
    case 3:
      k1 ^= data[tail + 2] << 16;
    // falls through
    case 2:
      k1 ^= data[tail + 1] << 8;
    // falls through
    case 1:
      k1 ^= data[tail];
      k1 = Math.imul(k1, C1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, C2);
      h1 ^= k1;
      break;
    default:
  }
  h1 ^= len;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;
  return h1 >>> 0;
}

/**
 * MinHash signature of a set of string shingles: slot i holds
 * min over shingles of murmur3_32(shingle, seed = i + 1). An empty set gives
 * null (it never collides with anything; J(∅, ∅) is decided by the caller).
 * @param {Iterable<string>} shingles
 * @returns {Uint32Array|null}
 */
export function minhashSignature(shingles, k = MINHASH_FUNCTIONS) {
  const sig = new Uint32Array(k).fill(0xffffffff);
  let any = false;
  for (const s of shingles) {
    any = true;
    const bytes = textEncoder.encode(s);
    for (let i = 0; i < k; i++) {
      const h = murmur3_32(bytes, i + 1);
      if (h < sig[i]) sig[i] = h;
    }
  }
  return any ? sig : null;
}

/** Estimated Jaccard: share of equal slots (null when a signature is missing). */
export function estimateJaccard(a, b) {
  if (!a || !b || a.length !== b.length) return null;
  let same = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
  return same / a.length;
}

/** Probability that a pair with Jaccard `j` shares at least one band. */
export const lshRecall = (j, bands = LSH_BANDS, rows = LSH_ROWS) => 1 - (1 - j ** rows) ** bands;

/**
 * Candidate pairs by LSH banding. `entries` = [{ id, sig }] (sig may be null:
 * skipped). Each band key is the band index plus its row values. Returns
 * pairs [idA, idB] with idA < idB (C order), sorted, without duplicates.
 * `accept(a, b)` can drop pairs (e.g. same lesson: compared exhaustively).
 */
export function lshCandidatePairs(entries, { bands = LSH_BANDS, rows = LSH_ROWS, accept = null } = {}) {
  if (bands * rows > MINHASH_FUNCTIONS) throw new RangeError("bands × rows exceeds the signature length");
  const buckets = new Map();
  for (const { id, sig } of entries) {
    if (!sig) continue;
    for (let b = 0; b < bands; b++) {
      let key = `${b}`;
      for (let r = 0; r < rows; r++) key += `:${sig[b * rows + r]}`;
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
      list.push(id);
    }
  }
  const seen = new Set();
  const pairs = [];
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = cmpC(list[i], list[j]) < 0 ? [list[i], list[j]] : [list[j], list[i]];
        if (a === b) continue;
        const key = `${a}\u0000${b}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (accept && !accept(a, b)) continue;
        pairs.push([a, b]);
      }
    }
  }
  return pairs.sort((x, y) => cmpC(x[0], y[0]) || cmpC(x[1], y[1]));
}

/** Byte-wise UTF-8 order (PostgreSQL COLLATE "C"). */
export function cmpC(a, b) {
  return Buffer.compare(Buffer.from(String(a), "utf8"), Buffer.from(String(b), "utf8"));
}
