// ============================================================================
// Guest session token v2, opaque item handles, the sealed "seen" list and
// check receipts (docs/CONTENT_ENGINE.md §5.8). Server only.
//
//   token   = base64url(JSON header) "." base64url(HMAC-SHA256(k_v2, headerB64))
//   header  = { v:2, sid, tpl, tv, sc, iat, dl, g, fb, tm, lim, al?, x }
//     sid  g-<22 base64url>          tpl/tv  template id/version     sc  scope
//     iat  issued (ms)               dl      deadline (ms)          g   grace (s)
//     fb   end|immediate             tm      timed|untimed
//     lim  { tier: guest|free, mini: bool, limited: bool }
//     al   stored allocation [[cell, quota]…] (strata × band quotas; reused by a retake)
//     x    AES-256-GCM(k_enc, iv, aad = "jz.exam.v2|" + sid) of { sd, q, r }:
//          sd seed (32 hex) · q question keys · r revision served per item
//   The browser can read the header but never the keys or the seed: canonical
//   keys (and anything derived from an answer) never leave the server. Items
//   are named towards the browser only by per-session opaque handles:
//   itemHandle(sid, key) = "h-" + base64url(HMAC(k_handle, sid | key))[0..16).
//   The server's view (verifySessionToken → data) has sd, q and r decrypted.
//
//   seen    = "s1." + base64url(iv | AES-256-GCM(k_seen, deflate(JSON [keys…])) | tag)
//             (aad "jz.exam.seen.v1"): the browser's recently served keys,
//             issued by /start and echoed back; opaque and authenticated.
//   receipt = base64url({sid,pos,resp_hash,score}) "." base64url(HMAC(k_receipt, …))
//
//   k_v2 / k_enc / k_handle / k_seen / k_receipt =
//     HKDF-SHA256(secret, "", "jz.exam.v2" | "jz.exam.v2.enc" | "jz.exam.handle" | "jz.exam.seen" | "jz.exam.receipt")
//   (v1 keeps its own key, so a v1 token never verifies as v2 and vice versa.)
// ============================================================================
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { canonicalJson } from "../../content/ids.js";
import { isSeed } from "../../content/prng.js";
import { isStoredAllocation } from "./allocate.js";
import { baseSecrets, b64url, hkdfKey, hmac, safeEqual } from "../local-token.js";

export const TOKEN_MAX_BYTES = 16 * 1024;
export const RECEIPT_MAX_BYTES = 512;
export const MAX_ITEMS = 100;
/** Most recent served keys kept in the sealed seen list (§5.3 history for guests). */
export const SEEN_MAX = 300;
export const SEEN_MAX_BYTES = 12 * 1024;
/** A late submit is still answered (as `expired`) until a day after the deadline. */
export const LATE_SUBMIT_MS = 24 * 3600 * 1000;
export const SID_RE = /^g-[A-Za-z0-9_-]{22}$/;
export const HANDLE_RE = /^h-[A-Za-z0-9_-]{16}$/;
const KEY_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const TPL_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const B64_RE = /^[A-Za-z0-9_-]+$/;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const SEEN_PREFIX = "s1.";
const SEEN_AAD = Buffer.from("jz.exam.seen.v1", "utf8");
const tokenAad = (sid) => Buffer.from(`jz.exam.v2|${sid}`, "utf8");

/** A fresh guest session id: g- + 16 random bytes in base64url. */
export const newSessionId = () => `g-${randomBytes(16).toString("base64url")}`;

function keys(env, info) {
  const { current, previous } = baseSecrets(env);
  if (!current) return null;
  return previous ? [hkdfKey(current, info), hkdfKey(previous, info)] : [hkdfKey(current, info)];
}
const unavailable = () => Object.assign(new Error("unavailable"), { code: "unavailable" });

const encode = (obj) => b64url(Buffer.from(JSON.stringify(obj), "utf8"));

/** AES-256-GCM: base64url(iv | ciphertext | tag). */
function seal(key, aad, plain) {
  const iv = randomBytes(IV_BYTES);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(aad);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return b64url(Buffer.concat([iv, ct, c.getAuthTag()]));
}
/** Open a sealed blob with any of the keys → Buffer | null (wrong key, aad or a flipped bit: null). */
function open(keyList, aad, text) {
  if (typeof text !== "string" || !B64_RE.test(text)) return null;
  const buf = Buffer.from(text, "base64url");
  if (buf.length < IV_BYTES + TAG_BYTES + 1) return null;
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ct = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
  for (const k of keyList) {
    try {
      const d = createDecipheriv("aes-256-gcm", k, iv);
      d.setAAD(aad);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(ct), d.final()]);
    } catch {
      /* next key */
    }
  }
  return null;
}

function verifySigned(token, keyList, maxBytes) {
  if (typeof token !== "string" || token.length > maxBytes) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1] || !B64_RE.test(parts[0]) || !B64_RE.test(parts[1])) return null;
  const given = Buffer.from(parts[1], "base64url");
  if (!keyList.some((k) => safeEqual(given, hmac(k, parts[0])))) return null;
  try {
    return JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Shape check of the clear (browser-readable) part of a token. */
function isHeader(d) {
  if (!isObj(d) || d.v !== 2) return false;
  const lim = d.lim;
  return SID_RE.test(d.sid ?? "")
    && typeof d.tpl === "string" && TPL_RE.test(d.tpl) && Number.isInteger(d.tv) && d.tv >= 1
    && typeof d.sc === "string" && d.sc.length > 0 && d.sc.length <= 200
    && Number.isFinite(d.iat) && Number.isFinite(d.dl) && d.dl > d.iat
    && Number.isInteger(d.g) && d.g >= 0 && d.g <= 3600
    && (d.fb === "end" || d.fb === "immediate")
    && (d.tm === "timed" || d.tm === "untimed")
    && isObj(lim) && (lim.tier === "guest" || lim.tier === "free") && typeof lim.mini === "boolean" && typeof lim.limited === "boolean"
    && (d.al === undefined || isStoredAllocation(d.al));
}

/** Shape check of a full (server-side, decrypted) v2 payload. */
export function isTokenPayload(d) {
  if (!isObj(d)) return false;
  const { sd, q, r, ...header } = d;
  return isHeader(header)
    && isSeed(sd)
    && Array.isArray(q) && q.length >= 1 && q.length <= MAX_ITEMS && q.every((k) => typeof k === "string" && KEY_RE.test(k))
    && new Set(q).size === q.length
    && Array.isArray(r) && r.length === q.length && r.every((x) => Number.isInteger(x) && x >= 1);
}

/**
 * Sign a v2 payload { sid, tpl, tv, sc, sd, q, r, iat, dl, g, fb, tm, lim, al? }:
 * sd, q and r are sealed (AES-256-GCM, aad = version + sid), the rest is signed
 * in clear. Throws `unavailable` when no secret may be used
 * (EXAM_SECRET_REQUIRED=1 without LOCAL_EXAM_SECRET).
 */
export function signSessionToken(payload, { env = process.env } = {}) {
  const k = keys(env, "jz.exam.v2");
  const e = keys(env, "jz.exam.v2.enc");
  if (!k || !e) throw unavailable();
  const data = { ...payload, v: 2 };
  if (!isTokenPayload(data)) throw new Error("invalid token payload");
  const { sd, q, r, ...header } = data;
  const x = seal(e[0], tokenAad(data.sid), Buffer.from(JSON.stringify({ sd, q, r }), "utf8"));
  const body = encode({ ...header, x });
  const token = `${body}.${b64url(hmac(k[0], body))}`;
  if (token.length > TOKEN_MAX_BYTES) throw new Error("token too large");
  return token;
}

/**
 * Verify a v2 token (signature, then the sealed part under the token's sid).
 * @param {string} token
 * @param {{ now?: number, env?: object, allowExpired?: boolean, anyTime?: boolean }} [o]
 *   allowExpired: accept a token past dl + g (submit answers `expired`), but
 *   never more than a day past the deadline. anyTime: signature and shape
 *   only (a retake names its original session long after it ended).
 * @returns {{ ok:true, data, expired:boolean } | { ok:false, error:"token_invalid"|"token_expired"|"unavailable" }}
 *   data: the full payload with sd, q and r decrypted (server side only).
 */
export function verifySessionToken(token, { now = Date.now(), env = process.env, allowExpired = false, anyTime = false } = {}) {
  const k = keys(env, "jz.exam.v2");
  const e = keys(env, "jz.exam.v2.enc");
  if (!k || !e) return { ok: false, error: "unavailable" };
  const header = verifySigned(token, k, TOKEN_MAX_BYTES);
  if (!isHeader(header) || typeof header.x !== "string") return { ok: false, error: "token_invalid" };
  const plain = open(e, tokenAad(header.sid), header.x);
  let secret = null;
  try {
    secret = plain ? JSON.parse(plain.toString("utf8")) : null;
  } catch {
    secret = null;
  }
  if (!isObj(secret)) return { ok: false, error: "token_invalid" };
  const { x: _x, ...clear } = header;
  const data = { ...clear, sd: secret.sd, q: secret.q, r: secret.r };
  if (!isTokenPayload(data)) return { ok: false, error: "token_invalid" };
  const expired = now > data.dl + data.g * 1000;
  if (expired && !anyTime && (!allowExpired || now > data.dl + data.g * 1000 + LATE_SUBMIT_MS)) return { ok: false, error: "token_expired" };
  return { ok: true, data, expired };
}

/** Decode a token's clear header without verifying it: exactly what a browser can read (no keys, no seed). */
export function decodeTokenPayload(token) {
  try {
    return JSON.parse(Buffer.from(String(token).split(".")[0], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// ── opaque handles ──────────────────────────────────────────────────────────
/**
 * The browser-facing name of a session item: "h-" + 16 base64url chars of
 * HMAC(k_handle, sid | key). Per session (the same item gets another handle in
 * another session) and keyed, so it cannot be computed from, or tested
 * against, a canonical key without the server secret.
 */
export function itemHandle(sid, key, { env = process.env } = {}) {
  const k = keys(env, "jz.exam.handle");
  if (!k) throw unavailable();
  return `h-${b64url(hmac(k[0], `${sid}|${key}`)).slice(0, 16)}`;
}

/** Handles of a session's keys, in order. */
export const itemHandles = (sid, list, o) => list.map((key) => itemHandle(sid, key, o));

// ── the sealed seen list ────────────────────────────────────────────────────
/** Keep the most recent sighting of each key (most recent last), at most SEEN_MAX. */
export function mergeSeen(older, newer = []) {
  const all = [...(older ?? []), ...(newer ?? [])];
  const out = [];
  const at = new Set();
  for (let i = all.length - 1; i >= 0 && out.length < SEEN_MAX; i--) {
    if (typeof all[i] !== "string" || !KEY_RE.test(all[i]) || at.has(all[i])) continue;
    at.add(all[i]);
    out.unshift(all[i]);
  }
  return out;
}

/** Seal a seen list (canonical keys, most recent last) for the browser to keep and echo back. */
export function sealSeen(list, { env = process.env } = {}) {
  const k = keys(env, "jz.exam.seen");
  if (!k) throw unavailable();
  const plain = deflateRawSync(Buffer.from(JSON.stringify(mergeSeen(list)), "utf8"));
  return SEEN_PREFIX + seal(k[0], SEEN_AAD, plain);
}

/**
 * Open a seen blob → keys (most recent last), or null when it is missing,
 * malformed, forged or sealed under an unknown secret (the caller then starts
 * without history: the list only steers selection, it grants nothing).
 */
export function openSeen(blob, { env = process.env } = {}) {
  if (typeof blob !== "string" || !blob.startsWith(SEEN_PREFIX) || blob.length > SEEN_MAX_BYTES) return null;
  const k = keys(env, "jz.exam.seen");
  if (!k) return null;
  const plain = open(k, SEEN_AAD, blob.slice(SEEN_PREFIX.length));
  if (!plain) return null;
  try {
    const list = JSON.parse(inflateRawSync(plain, { maxOutputLength: 64 * 1024 }).toString("utf8"));
    return Array.isArray(list) ? mergeSeen(list) : null;
  } catch {
    return null;
  }
}

// ── receipts ────────────────────────────────────────────────────────────────
/** sha256 hex of the canonical JSON of a display response (null = unanswered). */
export const responseHash = (display) => createHash("sha256").update(canonicalJson(display ?? null)).digest("hex");

/** Sign a check receipt { sid, pos, resp_hash, score }. */
export function signReceipt({ sid, pos, resp_hash, score }, { env = process.env } = {}) {
  const k = keys(env, "jz.exam.receipt");
  if (!k) throw unavailable();
  const body = encode({ sid, pos, resp_hash, score });
  return `${body}.${b64url(hmac(k[0], body))}`;
}

/** Verify a receipt for a session. → { ok, pos, resp_hash, score } | { ok:false } */
export function verifyReceipt(receipt, sid, { env = process.env } = {}) {
  const k = keys(env, "jz.exam.receipt");
  if (!k) return { ok: false };
  const d = verifySigned(receipt, k, RECEIPT_MAX_BYTES);
  if (!d || d.sid !== sid || !Number.isInteger(d.pos) || d.pos < 1 || d.pos > MAX_ITEMS
    || typeof d.resp_hash !== "string" || !/^[0-9a-f]{64}$/.test(d.resp_hash)
    || typeof d.score !== "number" || !(d.score >= 0 && d.score <= 1)) return { ok: false };
  return { ok: true, pos: d.pos, resp_hash: d.resp_hash, score: d.score };
}
