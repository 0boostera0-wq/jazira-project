// Guest session tokens v2, check receipts, the exam-secret policy, the env
// contract check and the key-reveal budget (docs/CONTENT_ENGINE.md §5.8).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCipheriv, createHash, createHmac, hkdfSync } from "node:crypto";
import {
  signSessionToken, verifySessionToken, decodeTokenPayload, signReceipt, verifyReceipt, responseHash, newSessionId, isTokenPayload, TOKEN_MAX_BYTES,
  itemHandle, itemHandles, HANDLE_RE, sealSeen, openSeen, mergeSeen, SEEN_MAX,
} from "@/lib/exams/engine/session-token";
import { signLocalSet, verifyLocalSet, examSecretStatus, baseSecrets, hkdfKey } from "@/lib/exams/local-token";
import { takeKeyReveals, dailyKeyLimit, KEY_BUCKET } from "@/lib/exams/engine/key-budget";
import { checkEnvContract, parseListing } from "../../scripts/check-env-contract.mjs";

const ENV_KEYS = ["LOCAL_EXAM_SECRET", "LOCAL_EXAM_SECRET_PREVIOUS", "EXAM_SECRET_REQUIRED", "SUPABASE_SERVICE_ROLE_KEY", "LEMONSQUEEZY_WEBHOOK_SECRET", "GEMINI_API_KEY", "VERCEL_ENV", "NODE_ENV"];
const saved = {};
beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) if (k !== "NODE_ENV") delete process.env[k];
  process.env.LOCAL_EXAM_SECRET = "s".repeat(40);
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

const NOW = Date.parse("2026-10-01T12:00:00Z");
const payload = (over = {}) => ({
  sid: "g-AAAAAAAAAAAAAAAAAAAAAA", tpl: "chapter-quiz", tv: 1, sc: "middle/grade-1/math/n91", sd: "0123456789abcdef0123456789abcdef",
  q: ["q-m1-math-0000000001", "q-m1-math-0000000002"], r: [1, 3], iat: NOW, dl: NOW + 600_000, g: 30, fb: "end", tm: "timed",
  lim: { tier: "guest", mini: false, limited: false }, al: [["middle/grade-1/math/n53#1", 2]], ...over,
});

describe("session token v2", () => {
  it("round-trips; rejects tampering, a wrong secret, a malformed token and a bad shape", () => {
    const token = signSessionToken(payload());
    const v = verifySessionToken(token, { now: NOW });
    expect(v).toMatchObject({ ok: true, expired: false });
    expect(v.data).toMatchObject({ v: 2, sid: "g-AAAAAAAAAAAAAAAAAAAAAA", q: payload().q });
    const [body, sig] = token.split(".");
    for (const change of [{ q: ["q-m1-math-0000000009", "q-m1-math-0000000002"] }, { lim: { tier: "free", mini: false, limited: false } }, { dl: NOW + 9e9 }]) {
      const forged = Buffer.from(JSON.stringify({ ...decodeTokenPayload(token), ...change })).toString("base64url");
      expect(verifySessionToken(`${forged}.${sig}`, { now: NOW })).toEqual({ ok: false, error: "token_invalid" });
    }
    expect(verifySessionToken(`${body}.${sig.slice(0, -2)}AA`, { now: NOW })).toEqual({ ok: false, error: "token_invalid" });
    for (const bad of [null, "", "x", `${body}.`, `${body}.${sig}.x`, `${body}.${sig}==`, "a".repeat(TOKEN_MAX_BYTES + 1)]) {
      expect(verifySessionToken(bad, { now: NOW }).ok).toBe(false);
    }
    process.env.LOCAL_EXAM_SECRET = "t".repeat(40);
    expect(verifySessionToken(token, { now: NOW })).toEqual({ ok: false, error: "token_invalid" });
    expect(() => signSessionToken(payload({ sd: "SEED" }))).toThrow();
    expect(() => signSessionToken(payload({ q: ["a"], r: [1] }))).toThrow();
    expect(isTokenPayload({ ...payload(), v: 2, q: ["q-m1-math-0000000001", "q-m1-math-0000000001"], r: [1, 1] })).toBe(false);
  });

  it("expires at deadline + grace; submit may read an expired token up to a day later", () => {
    const token = signSessionToken(payload());
    const end = NOW + 600_000 + 30_000;
    expect(verifySessionToken(token, { now: end }).ok).toBe(true);
    expect(verifySessionToken(token, { now: end + 1 })).toEqual({ ok: false, error: "token_expired" });
    expect(verifySessionToken(token, { now: end + 1, allowExpired: true })).toMatchObject({ ok: true, expired: true });
    expect(verifySessionToken(token, { now: end + 86_400_001, allowExpired: true })).toEqual({ ok: false, error: "token_expired" });
    expect(verifySessionToken(token, { now: end + 10 * 86_400_000, anyTime: true })).toMatchObject({ ok: true, expired: true });
  });

  it("a v1 token never verifies as v2 and vice versa (HKDF-separated keys)", () => {
    for (const env of [{ LOCAL_EXAM_SECRET: "s".repeat(40) }, { SUPABASE_SERVICE_ROLE_KEY: "service-key" }]) {
      delete process.env.LOCAL_EXAM_SECRET;
      Object.assign(process.env, env);
      const v1 = signLocalSet({ keys: ["q-m1-math-0000000001"], expiresAt: NOW + 600_000 });
      const v2 = signSessionToken(payload());
      expect(verifySessionToken(v1, { now: NOW })).toEqual({ ok: false, error: "token_invalid" });
      expect(verifyLocalSet(v2, { now: NOW })).toEqual({ ok: false, error: "invalid_token" });
      expect(verifyLocalSet(v1, { now: NOW }).ok).toBe(true);
      // even a v1-signed body carrying a v2 payload fails: the keys differ
      const [body] = v2.split(".");
      const v1Key = env.LOCAL_EXAM_SECRET ?? createHmac("sha256", env.SUPABASE_SERVICE_ROLE_KEY).update("jazira.local-exam-set.v1").digest();
      const crossSig = createHmac("sha256", v1Key).update(body).digest("base64url");
      expect(verifySessionToken(`${body}.${crossSig}`, { now: NOW })).toEqual({ ok: false, error: "token_invalid" });
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });

  it("the v1 key is unchanged: LOCAL_EXAM_SECRET raw, else HMAC(service key, label)", () => {
    delete process.env.LOCAL_EXAM_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    const token = signLocalSet({ keys: ["aq-001"], expiresAt: NOW });
    const [body, sig] = token.split(".");
    const key = createHmac("sha256", "service-key").update("jazira.local-exam-set.v1").digest();
    expect(createHmac("sha256", key).update(body).digest("base64url")).toBe(sig);
    process.env.LOCAL_EXAM_SECRET = "explicit-secret-16+";
    const t2 = signLocalSet({ keys: ["aq-001"], expiresAt: NOW });
    expect(createHmac("sha256", "explicit-secret-16+").update(t2.split(".")[0]).digest("base64url")).toBe(t2.split(".")[1]);
  });

  it("rotation: tokens signed with LOCAL_EXAM_SECRET_PREVIOUS still verify (v1 and v2)", () => {
    const old = "o".repeat(40);
    process.env.LOCAL_EXAM_SECRET = old;
    const v2 = signSessionToken(payload());
    const v1 = signLocalSet({ keys: ["aq-001"], expiresAt: NOW + 1000 });
    process.env.LOCAL_EXAM_SECRET = "n".repeat(40);
    expect(verifySessionToken(v2, { now: NOW }).ok).toBe(false);
    process.env.LOCAL_EXAM_SECRET_PREVIOUS = old;
    expect(verifySessionToken(v2, { now: NOW }).ok).toBe(true);
    expect(verifyLocalSet(v1, { now: NOW }).ok).toBe(true);
  });

  it("uses HKDF-SHA256(secret, '', info) for v2 and receipts", () => {
    const secret = "s".repeat(40);
    const expected = Buffer.from(hkdfSync("sha256", Buffer.from(secret), Buffer.alloc(0), Buffer.from("jz.exam.v2"), 32));
    expect(hkdfKey(secret, "jz.exam.v2").equals(expected)).toBe(true);
    const token = signSessionToken(payload());
    const [body, sig] = token.split(".");
    expect(createHmac("sha256", expected).update(body).digest("base64url")).toBe(sig);
    expect(hkdfKey(secret, "jz.exam.receipt").equals(expected)).toBe(false);
  });

  it("holds no key, no seed and nothing answer-derived (brute force over keys and candidate responses finds nothing)", () => {
    // the token of a session over items whose answers are o-ids / pair ids / orders
    const candidates = [];
    const ids = ["oa1b2c3", "od4e5f6", "o778899", "oaabbcc", "t", "f", "l1", "r1", "s1", "s2", "s3"];
    for (const id of ids) candidates.push({ option_id: id }, id);
    for (const order of [["s1", "s2", "s3"], ["s3", "s2", "s1"]]) candidates.push({ order });
    candidates.push({ pairs: [["l1", "r1"]] }, { value: "1250" }, "1250", { text: "خطة" });
    const p = payload();
    candidates.push(...p.q, p.sd, p.q.join(","), JSON.stringify(p.q));
    const token = signSessionToken(p);
    const header = Buffer.from(token.split(".")[0], "base64url").toString("utf8");
    const sealed = Buffer.from(decodeTokenPayload(token).x, "base64url");
    for (const c of candidates) {
      const s = typeof c === "string" ? c : JSON.stringify(c);
      for (const alg of ["sha256", "sha1", "md5"]) {
        for (const enc of ["hex", "base64", "base64url"]) {
          const digest = createHash(alg).update(s).digest(enc);
          expect(header.includes(digest.slice(0, 12))).toBe(false);
        }
      }
      if (typeof c !== "string" || c.length > 2) {
        expect(header.includes(s)).toBe(false);
        expect(token.includes(Buffer.from(s).toString("base64url").slice(2, 14))).toBe(false);
        expect(sealed.includes(Buffer.from(s))).toBe(false);
      }
    }
    expect(Object.keys(decodeTokenPayload(token)).sort()).toEqual(["al", "dl", "fb", "g", "iat", "lim", "sc", "sid", "tm", "tpl", "tv", "v", "x"]);
    // the sealed part is fresh every time (random IV): two tokens of one session share no ciphertext
    expect(decodeTokenPayload(signSessionToken(p)).x).not.toBe(decodeTokenPayload(token).x);
  });

  it("the sealed part is bound to its session id and version (AES-256-GCM aad) and to the secret", () => {
    const k = hkdfKey("s".repeat(40), "jz.exam.v2");
    const sign = (h) => {
      const body = Buffer.from(JSON.stringify(h)).toString("base64url");
      return `${body}.${createHmac("sha256", k).update(body).digest("base64url")}`;
    };
    const a = decodeTokenPayload(signSessionToken(payload()));
    const b = decodeTokenPayload(signSessionToken(payload({ sid: "g-BBBBBBBBBBBBBBBBBBBBBB", q: ["q-m1-math-0000000007"], r: [1] })));
    // even a correctly signed header (a leaked v2 signing key) cannot move a sealed list to another session
    expect(verifySessionToken(sign(a), { now: NOW }).ok).toBe(true);
    expect(verifySessionToken(sign({ ...b, x: a.x }), { now: NOW })).toEqual({ ok: false, error: "token_invalid" });
    expect(verifySessionToken(sign({ ...a, v: 3 }), { now: NOW })).toEqual({ ok: false, error: "token_invalid" });
    const raw = Buffer.from(a.x, "base64url");
    raw[20] ^= 1;
    expect(verifySessionToken(sign({ ...a, x: raw.toString("base64url") }), { now: NOW })).toEqual({ ok: false, error: "token_invalid" });
    expect(verifySessionToken(sign({ ...a, x: undefined }), { now: NOW })).toEqual({ ok: false, error: "token_invalid" });
    // the encryption key is not the signing key: sealing under k_v2 does not open
    const iv = Buffer.alloc(12, 7);
    const c = createCipheriv("aes-256-gcm", k, iv);
    c.setAAD(Buffer.from(`jz.exam.v2|${a.sid}`));
    const ct = Buffer.concat([c.update(JSON.stringify({ sd: payload().sd, q: ["q-m1-math-0000000009"], r: [1] })), c.final()]);
    expect(verifySessionToken(sign({ ...a, x: Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64url") }), { now: NOW })).toEqual({ ok: false, error: "token_invalid" });
  });

  it("item handles: per session, keyed, opaque; no candidate key hashes to one", () => {
    const sid = "g-AAAAAAAAAAAAAAAAAAAAAA";
    const h = itemHandle(sid, "q-m1-math-0000000001");
    expect(h).toMatch(HANDLE_RE);
    expect(itemHandle(sid, "q-m1-math-0000000001")).toBe(h);
    expect(itemHandle("g-BBBBBBBBBBBBBBBBBBBBBB", "q-m1-math-0000000001")).not.toBe(h);
    expect(new Set(itemHandles(sid, ["q-m1-math-0000000001", "q-m1-math-0000000002"])).size).toBe(2);
    // without the secret the handle is not a function of (sid, key): plain hashes and HMACs keyed by public material miss
    for (const input of ["q-m1-math-0000000001", `${sid}|q-m1-math-0000000001`, `${sid}q-m1-math-0000000001`]) {
      for (const alg of ["sha256", "sha1", "md5"]) expect(createHash(alg).update(input).digest("base64url").slice(0, 16)).not.toBe(h.slice(2));
      expect(createHmac("sha256", sid).update("q-m1-math-0000000001").digest("base64url").slice(0, 16)).not.toBe(h.slice(2));
    }
    process.env.LOCAL_EXAM_SECRET = "t".repeat(40);
    expect(itemHandle(sid, "q-m1-math-0000000001")).not.toBe(h);
  });

  it("the sealed seen list: opaque, authenticated, merged most-recent-last and capped", () => {
    const keys = Array.from({ length: 5 }, (_, i) => `q-m1-math-000000000${i}`);
    const blob = sealSeen(keys);
    expect(blob.startsWith("s1.")).toBe(true);
    expect(openSeen(blob)).toEqual(keys);
    for (const k of keys) expect(blob.includes(k)).toBe(false);
    expect(Buffer.from(blob.slice(3), "base64url").includes(Buffer.from("q-m1-math"))).toBe(false);
    const raw = Buffer.from(blob.slice(3), "base64url");
    raw[15] ^= 1;
    for (const bad of [`s1.${raw.toString("base64url")}`, blob.slice(0, -2), "s1.", "x", null, 7, `s1.${"A".repeat(20000)}`]) expect(openSeen(bad)).toBeNull();
    process.env.LOCAL_EXAM_SECRET = "t".repeat(40);
    expect(openSeen(blob)).toBeNull();
    const many = Array.from({ length: SEEN_MAX + 20 }, (_, i) => `q-m1-math-${String(i).padStart(10, "0")}`);
    const merged = mergeSeen(many, ["q-m1-math-0000000000"]);
    expect(merged.length).toBe(SEEN_MAX);
    expect(merged.at(-1)).toBe("q-m1-math-0000000000");
    expect(openSeen(sealSeen(many))).toEqual(mergeSeen(many));
    expect(sealSeen(many).length).toBeLessThan(12 * 1024);
    expect(mergeSeen(["BAD KEY", "q-m1-math-0000000001"])).toEqual(["q-m1-math-0000000001"]);
  });

  it("session ids are g- + 22 base64url chars", () => {
    const ids = new Set(Array.from({ length: 50 }, newSessionId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^g-[A-Za-z0-9_-]{22}$/);
  });
});

describe("check receipts", () => {
  it("round-trip, bound to the session, tamper-proof, keyed apart from tokens", () => {
    const r = signReceipt({ sid: "g-AAAAAAAAAAAAAAAAAAAAAA", pos: 3, resp_hash: responseHash({ option_index: 1 }), score: 1 });
    expect(verifyReceipt(r, "g-AAAAAAAAAAAAAAAAAAAAAA")).toMatchObject({ ok: true, pos: 3, score: 1 });
    expect(verifyReceipt(r, "g-BBBBBBBBBBBBBBBBBBBBBB")).toEqual({ ok: false });
    const [body, sig] = r.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url")), score: 0.5 })).toString("base64url");
    expect(verifyReceipt(`${forged}.${sig}`, "g-AAAAAAAAAAAAAAAAAAAAAA")).toEqual({ ok: false });
    // a token signature is not a receipt signature
    const token = signSessionToken(payload());
    const tokenSig = createHmac("sha256", hkdfKey("s".repeat(40), "jz.exam.v2")).update(body).digest("base64url");
    expect(verifyReceipt(`${body}.${tokenSig}`, "g-AAAAAAAAAAAAAAAAAAAAAA")).toEqual({ ok: false });
    expect(token).toBeTruthy();
    expect(responseHash({ a: 1, b: 2 })).toBe(responseHash({ b: 2, a: 1 }));
    expect(responseHash(null)).not.toBe(responseHash({ option_index: 0 }));
  });
});

describe("exam secret policy", () => {
  it("flag off: explicit, else derived from the first server secret, else a per-process key (dev)", () => {
    expect(examSecretStatus({ LOCAL_EXAM_SECRET: "x".repeat(32) })).toMatchObject({ available: true, source: "explicit", warning: null });
    expect(examSecretStatus({ LOCAL_EXAM_SECRET: "x".repeat(20) })).toMatchObject({ available: true, source: "explicit" });
    expect(examSecretStatus({ LOCAL_EXAM_SECRET: "x".repeat(20) }).warning).toMatch(/32/);
    expect(examSecretStatus({ SUPABASE_SERVICE_ROLE_KEY: "a", GEMINI_API_KEY: "b", NODE_ENV: "production" })).toMatchObject({ available: true, source: "fallback", fallback: "SUPABASE_SERVICE_ROLE_KEY" });
    expect(examSecretStatus({ LEMONSQUEEZY_WEBHOOK_SECRET: "a", GEMINI_API_KEY: "b" })).toMatchObject({ fallback: "LEMONSQUEEZY_WEBHOOK_SECRET", warning: null });
    expect(examSecretStatus({ GEMINI_API_KEY: "b", VERCEL_ENV: "production" })).toMatchObject({ fallback: "GEMINI_API_KEY" });
    expect(examSecretStatus({ GEMINI_API_KEY: "b", VERCEL_ENV: "production" }).warning).toMatch(/GEMINI_API_KEY/);
    expect(examSecretStatus({})).toMatchObject({ available: true, source: "dev" });
    expect(examSecretStatus({ NODE_ENV: "production" }).warning).toMatch(/per-process/);
  });

  it("the fallback key is stable across instances (derived, not random)", () => {
    const env = { GEMINI_API_KEY: "gemini-key", NODE_ENV: "production" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = baseSecrets(env).current;
    const b = baseSecrets({ ...env }).current;
    expect(a.equals(b)).toBe(true);
    expect(a.equals(hkdfKey("gemini-key", "jz.exam.fallback"))).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it("flag on: LOCAL_EXAM_SECRET (≥ 32) is mandatory; without it nothing signs", () => {
    expect(examSecretStatus({ EXAM_SECRET_REQUIRED: "1", GEMINI_API_KEY: "b" })).toMatchObject({ available: false, required: true });
    expect(examSecretStatus({ EXAM_SECRET_REQUIRED: "1", LOCAL_EXAM_SECRET: "x".repeat(31) }).available).toBe(false);
    expect(examSecretStatus({ EXAM_SECRET_REQUIRED: "1", LOCAL_EXAM_SECRET: "x".repeat(32) }).available).toBe(true);
    process.env.EXAM_SECRET_REQUIRED = "1";
    delete process.env.LOCAL_EXAM_SECRET;
    process.env.GEMINI_API_KEY = "b";
    expect(() => signSessionToken(payload())).toThrow("unavailable");
    expect(verifySessionToken("a.b")).toEqual({ ok: false, error: "unavailable" });
  });
});

describe("scripts/check-env-contract.mjs", () => {
  it("parses dotenv and names-only listings", () => {
    const v = parseListing("# c\nexport LOCAL_EXAM_SECRET=\"abc def\"\nEXAM_SECRET_REQUIRED=1 # on\n\nNAME  VALUE  ENVIRONMENTS\nGEMINI_API_KEY  Encrypted  Production\n");
    expect(v.get("LOCAL_EXAM_SECRET")).toBe("abc def");
    expect(v.get("EXAM_SECRET_REQUIRED")).toBe("1");
    expect(v.get("GEMINI_API_KEY")).toBeNull();
    expect(v.has("NAME")).toBe(false);
  });

  it("fails when the flag is on and the secret is missing or short; warns otherwise", () => {
    const m = (o) => new Map(Object.entries(o));
    expect(checkEnvContract(m({ EXAM_SECRET_REQUIRED: "1" }))).toMatchObject({ ok: false });
    expect(checkEnvContract(m({ EXAM_SECRET_REQUIRED: null }))).toMatchObject({ ok: false });          // names-only listing
    expect(checkEnvContract(m({ EXAM_SECRET_REQUIRED: "1", LOCAL_EXAM_SECRET: "short" })).ok).toBe(false);
    expect(checkEnvContract(m({ EXAM_SECRET_REQUIRED: "1", LOCAL_EXAM_SECRET: "x".repeat(32) }))).toEqual({ ok: true, errors: [], warnings: [] });
    expect(checkEnvContract(m({ EXAM_SECRET_REQUIRED: null, LOCAL_EXAM_SECRET: null })).ok).toBe(true);   // value unknown, present
    expect(checkEnvContract(m({ EXAM_SECRET_REQUIRED: "", GEMINI_API_KEY: "x" }))).toMatchObject({ ok: true, warnings: [expect.stringMatching(/not set/)] });
    expect(checkEnvContract(m({ NEXT_PUBLIC_LOCAL_EXAM_SECRET: "x" })).ok).toBe(false);
    expect(checkEnvContract(m({ LOCAL_EXAM_SECRET: "x".repeat(32), LOCAL_EXAM_SECRET_PREVIOUS: "short" })).ok).toBe(false);
  });
});

describe("key-reveal budget", () => {
  it("charges one hit per key against a daily per-IP cap (400 by default)", async () => {
    const hits = new Map();
    const limiter = async ({ bucket, key, max, windowSeconds }) => {
      expect(bucket).toBe(KEY_BUCKET);
      expect(windowSeconds).toBe(86400);
      const n = (hits.get(key) ?? 0) + 1;
      hits.set(key, n);
      return n > max;
    };
    expect(dailyKeyLimit({})).toBe(400);
    expect(dailyKeyLimit({ EXAM_KEY_REVEAL_DAILY: "50" })).toBe(50);
    expect(dailyKeyLimit({ EXAM_KEY_REVEAL_DAILY: "5" })).toBe(400);
    let revealed = 0;
    for (let i = 0; i < 25; i++) if (await takeKeyReveals("203.0.113.9", 20, { env: {}, limiter })) revealed += 20;
    expect(revealed).toBe(400);
    expect(await takeKeyReveals("203.0.113.10", 20, { env: {}, limiter })).toBe(true);   // per IP
    expect(await takeKeyReveals("203.0.113.9", 0, { env: {}, limiter })).toBe(true);     // nothing to reveal
  });

  it("a /check (one key) costs one key, not a block of ten: 400 checks a day are revealed", async () => {
    const hits = new Map();
    const limiter = async ({ key, max }) => {
      const n = (hits.get(key) ?? 0) + 1;
      hits.set(key, n);
      return n > max;
    };
    let revealed = 0;
    for (let i = 0; i < 450; i++) if (await takeKeyReveals("203.0.113.20", 1, { env: {}, limiter })) revealed += 1;
    expect(revealed).toBe(400);
    // a client at the cap costs one limiter call per request (no unbounded charging)
    const before = hits.get("203.0.113.20");
    expect(await takeKeyReveals("203.0.113.20", 25, { env: {}, limiter })).toBe(false);
    expect(hits.get("203.0.113.20") - before).toBe(1);
    // a response larger than the whole daily cap is never revealed
    expect(await takeKeyReveals("203.0.113.21", 11, { env: { EXAM_KEY_REVEAL_DAILY: "10" }, limiter })).toBe(false);
  });
});
