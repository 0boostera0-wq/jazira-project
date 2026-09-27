import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  searchNormalize, normalizeForDedup, lamOrderFold, normalizeTitle, normalizeExactMarks, trigramJaccard, NORMALIZATION_VERSION,
} from "@/lib/content/normalize.js";
import * as ids from "@/lib/content/ids.js";
import { u, sha256Hex, sfc32, seededRng, compareC, sortByU, newSeed, isSeed, templateSeedText } from "@/lib/content/prng.js";
import * as enums from "@/lib/content/enums.js";

const REPO = resolve(__dirname, "../..");
const FIXTURE = join(REPO, "tests/fixtures/content/staging");

// ── Appendix A ──────────────────────────────────────────────────────────────
describe("normalize.js — Appendix A (n2)", () => {
  it("maps superscripts and vulgar fractions before NFKC", () => {
    expect(NORMALIZATION_VERSION).toBe("n2");
    expect(searchNormalize("x²")).toBe("x^2");
    expect(searchNormalize("5³")).toBe("5^3");
    expect(searchNormalize("10⁻³")).toBe("10^-3");
    expect(searchNormalize("x¹²")).toBe("x^12");
    expect(searchNormalize("x²")).not.toBe(searchNormalize("x2"));
    expect(searchNormalize("5²")).not.toBe("52");
    expect(searchNormalize("½")).toBe("1/2");
    expect(searchNormalize("¾ كوب")).toBe("3/4 كوب");
    expect(searchNormalize("2½")).toBe("2 1/2");
    expect(normalizeForDedup("x²")).toBe("x^2");
  });

  it("applies NFKC (presentation forms, ligatures, full-width)", () => {
    expect(searchNormalize("ﻻ")).toBe("لا"); // ﻻ
    expect(searchNormalize("ﺍﻟﺮﻳﺎﺿﻴﺎﺕ")).toBe("الرياضيات");
    expect(searchNormalize("ＡＢＣ１２３")).toBe("abc123");
    expect(searchNormalize("ﷲ")).toBe("الله");
  });

  it("strips tashkeel and tatweel, folds letters and digits", () => {
    expect(searchNormalize("الرِّيَاضِيَّاتُ")).toBe("الرياضيات");
    expect(searchNormalize("الـــعلوم")).toBe("العلوم");
    expect(searchNormalize("ٰ")).toBe("");
    expect(searchNormalize("أإآٱ")).toBe("اااا");
    expect(searchNormalize("ى ئ ی")).toBe("ي ي ي");
    expect(searchNormalize("مؤمن مدرسة کتاب")).toBe("مومن مدرسه كتاب");
    expect(searchNormalize("٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789 0123456789");
  });

  it("lower-cases, strips invisible characters, handles punctuation and whitespace", () => {
    expect(searchNormalize("Photosynthesis")).toBe("photosynthesis");
    expect(searchNormalize("a​b‏c‫d⁦e")).toBe("abcde");
    expect(searchNormalize("  «ما هو؟»  ")).toBe("ما هو");
    expect(searchNormalize("(أ) ، (ب) ؛ ج! د: \"هـ\" 'و'")).toBe("ا ب ج د ه و");
    expect(searchNormalize("3.5 و 1,250 و ٣٫٥")).toBe("3.5 و 1,250 و 3٫5");
    expect(searchNormalize("نهاية الجملة. بداية")).toBe("نهايه الجمله بدايه");
    expect(searchNormalize("a\t\n  b")).toBe("a b");
    expect(searchNormalize(null)).toBe("");
  });

  it("normalizeForDedup adds lam_order_fold, number and operator folds", () => {
    expect(normalizeForDedup("8 × 7 = ٥٦")).toBe("8 * 7 = 56");
    expect(normalizeForDedup("١٢٫٥ ÷ ٥ − ١")).toBe("12.5 / 5 - 1");
    expect(normalizeForDedup("١٬٢٥٠ ريال و٥٠٪")).toBe("1250 ريال و50%");
    expect(normalizeForDedup("املقرر")).toBe(normalizeForDedup("المقرر"));
  });

  it("lam_order_fold equates the observed ligature-order damage", () => {
    const same = (a, b) => expect(lamOrderFold(searchNormalize(a)), `${a} ~ ${b}`).toBe(lamOrderFold(searchNormalize(b)));
    same("املقرر", "المقرر");
    same("اجلزء األول", "الجزء الأول");
    same("االبتدائي", "الابتدائي");
    same("احلياتية", "الحياتية");
    same("الصف األول املتوسط", "الصف الأول المتوسط");
    expect(lamOrderFold(searchNormalize("المقرر"))).not.toBe(lamOrderFold(searchNormalize("الجزء")));
    for (const t of ["الجزء الأول من المقرر", "اجلزء األول", "الله", "للطالب"]) {
      const once = normalizeTitle(t);
      expect(normalizeTitle(once), t).toBe(once);
    }
    expect(lamOrderFold("hello world")).toBe("hello world");
    // ZWNJ / ZWJ between words are word breaks for titles (not joined before the fold).
    expect(normalizeTitle("الفصل‌الدراسي")).toBe(normalizeTitle("الفصل الدراسي"));
    expect(normalizeTitle("الفصل‍الدراسي")).toBe(normalizeTitle("الفصل الدراسي"));
  });

  it("exact_marks keeps marks and letters, NFC + whitespace only", () => {
    expect(normalizeExactMarks("  مَدْرَسَةٌ   جميلة ")).toBe("مَدْرَسَةٌ جميلة");
    expect(normalizeExactMarks("أ")).toBe("أ");
    expect(normalizeExactMarks("مدرسة")).not.toBe(normalizeExactMarks("مدرسه"));
  });

  it("trigram Jaccard for titles", () => {
    expect(trigramJaccard("الوحدة الأولى: الأعداد", "الوحدة الاولى الاعداد")).toBe(1);
    expect(trigramJaccard("القوى والأسس", "القوى و الأسس")).toBeGreaterThan(0.6);
    expect(trigramJaccard("ترتيب العمليات", "المعادلات الخطية")).toBeLessThan(0.3);
    expect(trigramJaccard("", "")).toBe(1);
    expect(trigramJaccard("", "x")).toBe(0);
  });
});

// ── §2.2 ids ───────────────────────────────────────────────────────────────
describe("ids.js — §2.2", () => {
  const mcq = { options: [{ id: "a", text: "54" }, { id: "b", text: "56" }], answer: { option_id: "b" }, fixed_order_reason: null };
  const question = { question_type: "mcq", language: "ar", stem: "ما ناتج 8 × 7؟", payload: mcq };
  const params = { grade: "m1", subject: "math", anchor: "middle/grade-1/math/n4318", type: "mcq", stem: question.stem, payload: mcq };

  it("builds curriculum ids", () => {
    expect(ids.termNodeId("middle/grade-1", "t1")).toBe("middle/grade-1/t1");
    expect(ids.subjectNodeId("middle/grade-1", "math")).toBe("middle/grade-1/math");
    expect(ids.subjectNodeId("middle/grade-1", ids.sourceOnlySubjectId(34339))).toBe("middle/grade-1/ien-34339");
    expect(ids.ienNodeId("middle/grade-1/math", 4318)).toBe("middle/grade-1/math/n4318");
    const x = ids.xNodeId("middle/grade-1/math", "lesson", "مراجعة تراكمية");
    expect(x).toMatch(/^middle\/grade-1\/math\/x[0-9a-f]{8}$/);
    expect(ids.xNodeId("middle/grade-1/math", "lesson", "مُراجعة  تراكميّة")).toBe(x); // normalized title
    expect(ids.xNodeId("middle/grade-1/math", "unit", "مراجعة تراكمية")).not.toBe(x); // kind is hashed
    expect(ids.isNodeId(x) && ids.isNodeId("high-school/grade-2/general/math/n91")).toBe(true);
    expect(ids.isNodeId("middle/Grade-1") || ids.isNodeId("../x") || ids.isNodeId("a//b")).toBe(false);
    expect(ids.gradeCode("elementary/grade-6")).toBe("e6");
    expect(ids.gradeCode("high-school/grade-2/general")).toBe("h2");
    expect(ids.gradeCode("achievement")).toBe("ach");
    expect(() => ids.gradeCode("middle/grade-9")).toThrow(ids.IdError);
  });

  it("builds evidence, objective, stimulus, resource and run ids", () => {
    expect(ids.termEvidenceId("ien-120607", 1, "t1")).toBe("te-ien-120607-p1-t1");
    expect(ids.termEvidenceId("ien-120607", 0, "t2")).toBe("te-ien-120607-p0-t2");
    expect(() => ids.termEvidenceId("ien-120607", 1, "t3")).toThrow(ids.IdError);
    expect(ids.objectiveId("middle/grade-1/math/n54", "يحسب قيمة")).toMatch(/^obj-[0-9a-f]{10}$/);
    expect(ids.objectiveId("l", "يَحسب")).toBe(ids.objectiveId("l", "يحسب"));
    expect(ids.stimulusId("نص")).toMatch(/^st-[0-9a-f]{10}$/);
    expect(ids.resourceId("ien", 120607)).toBe("ien-120607");
    expect(ids.resourceId("ien", 90, { bank: true })).toBe("ien-bank-90");
    expect(ids.runId("20260927", "gen", 1)).toBe("run-20260927-gen-01");
    expect(ids.runId(new Date("2026-09-27T23:00:00Z"), "val", 12)).toBe("run-20260927-val-12");
    expect(() => ids.runId("20260927", "build", 1)).toThrow(ids.IdError);
    expect(ids.isRunId("run-20260927-xval-03")).toBe(true);
    expect(ids.validationRecordId("run-20260927-val-01", "q-m1-math-3f9a1c2b7d", "primary")).toBe("run-20260927-val-01:q-m1-math-3f9a1c2b7d:primary");
    expect(ids.VALIDATION_RECORD_ID_RE.test("run-20260927-val-01:q-m1-math-3f9a1c2b7d:primary")).toBe(true);
    expect(ids.VALIDATION_RECORD_ID_RE.test("run-20260927-val-01:aq-001:resolver")).toBe(true);
    expect(ids.dedupClusterId("q-m1-math-3f9a1c2b7d")).toBe("dc-q-m1-math-3f9a1c2b7d");
    expect(ids.examTemplateRef("chapter-quiz", 1)).toBe("chapter-quiz@1");
    expect(ids.guestSessionId(new Uint8Array(16).fill(255))).toBe("g-_____________________w");
    expect(ids.GUEST_SESSION_ID_RE.test(ids.guestSessionId())).toBe(true);
  });

  it("exclusion group ids do not depend on member order", () => {
    const a = ids.exclusionGroupId(["q-m1-math-0000000002", "q-m1-math-0000000001"]);
    expect(a).toBe(ids.exclusionGroupId(["q-m1-math-0000000001", "q-m1-math-0000000002", "q-m1-math-0000000001"]));
    expect(a).toMatch(/^xg-[0-9a-f]{10}$/);
  });

  it("mints question ids with the D001 / next-hex rule", () => {
    const hash = ids.contentHash(question);
    expect(hash).toMatch(/^n2:sha256:[0-9a-f]{64}$/);
    const first = ids.mintQuestionId(params, { contentHash: hash });
    expect(first.id).toMatch(/^q-m1-math-[0-9a-f]{10}$/);
    expect(first.id).toBe(`q-m1-math-${first.id_hash.slice(0, 10)}`);
    expect(ids.mintQuestionId({ ...params, payload: { ...mcq, options: [{ id: "o9", text: "54" }, { id: "o8", text: "56" }], answer: { option_id: "o8" } } }, { contentHash: hash }).id).toBe(first.id);
    const store = new Map([[first.id, { content_hash: hash, id_hash: first.id_hash }]]);
    const lookup = (id) => store.get(id) ?? null;
    expect(ids.mintQuestionId(params, { contentHash: hash, lookup })).toEqual({ id: null, duplicate_of: first.id, code: "D001" });
    const next = ids.mintQuestionId(params, { contentHash: "n2:sha256:" + "0".repeat(64), lookup });
    expect(next.id).toBe(`q-m1-math-${first.id_hash.slice(10, 20)}`);
    store.set(next.id, { content_hash: "other" });
    expect(ids.mintQuestionId(params, { contentHash: "n2:sha256:" + "1".repeat(64), lookup }).id).toBe(`q-m1-math-${first.id_hash.slice(20, 30)}`);
    // Regression: with a lookup but no content hash, an exact duplicate silently got the next hex.
    expect(() => ids.mintQuestionId(params, { lookup })).toThrow(/content_hash_required/);
    // A stored record whose full hash differs never counts as the same item.
    const collide = new Map([[first.id, { content_hash: hash, id_hash: "f".repeat(64) }]]);
    expect(ids.mintQuestionId(params, { contentHash: hash, lookup: (id) => collide.get(id) }).id).toBe(`q-m1-math-${first.id_hash.slice(10, 20)}`);
  });

  it("keeps ids within the 40-char key limit", () => {
    const long = ids.mintQuestionId({ ...params, grade: "h3", subject: "software-engineering" });
    expect(long.id.length).toBeLessThanOrEqual(39);
    expect(ids.KEY_RE.test(long.id)).toBe(true);
    expect(() => ids.mintQuestionId({ ...params, subject: "a-very-long-subject-identifier-x" })).toThrow(/id_too_long/);
    const t = ids.mintTemplateId({ grade: "h3", subject: "software-engineering", anchor: "l", type: "mcq", stem: "ما ناتج {a} × {b}؟", answerExpr: "a*b" }).id;
    expect(t).toMatch(/^t-h3-software-engineering-[0-9a-f]{10}$/);
    const v = ids.variantId(t, 7);
    expect(v).toBe(`v-${t.slice(2)}-07`);
    expect(v.length).toBeLessThanOrEqual(40);
    expect(ids.isVariantId(v) && ids.isQuestionKey(v)).toBe(true);
    // Regression: template ids up to 39 chars were minted, but their variants
    // (+3 chars) would exceed the 40-char key. Templates are capped at 37.
    expect(ids.TEMPLATE_ID_MAX).toBe(37);
    const maxT = ids.mintTemplateId({ grade: "apt", subject: "a".repeat(20), anchor: "l", type: "mcq", stem: "s", answerExpr: "a" }).id;
    expect(maxT).toHaveLength(37);
    expect(ids.variantId(maxT, 50)).toHaveLength(40);
    expect(ids.isQuestionKey(ids.variantId(maxT, 50))).toBe(true);
    expect(() => ids.mintTemplateId({ grade: "apt", subject: "a".repeat(21), anchor: "l", type: "mcq", stem: "s", answerExpr: "a" })).toThrow(/id_too_long/);
    expect(ids.isTemplateId(`t-apt-${"a".repeat(21)}-0c4e1d9a2b`)).toBe(false);
    expect(() => ids.variantId(t, 51)).toThrow(ids.IdError);
    expect(() => ids.variantId(t, 0)).toThrow(ids.IdError);
    expect(ids.isQuestionKey("aq-001") && ids.isQuestionId("ab-120")).toBe(true);
    expect(ids.isQuestionKey("Q-m1-math-3f9a1c2b7d") || ids.isQuestionKey("q-m1-math-3f9a1c2b7")).toBe(false);
  });

  it("content_hash covers the answer and normalized texts", () => {
    const h = ids.contentHash(question);
    expect(ids.contentHash({ ...question, stem: "ما ناتجُ 8 × 7 ؟" })).toBe(h);
    expect(ids.contentHash({ ...question, payload: { ...mcq, answer: { option_id: "a" } } })).not.toBe(h);
    expect(ids.contentHash(question, { stimulusText: "نص" })).not.toBe(h);
    expect(ids.canonicalJson({ b: 1, a: [2, { d: null, c: "x" }] })).toBe('{"a":[2,{"c":"x","d":null}],"b":1}');
  });

  it("content_hash does not depend on the stored order of shufflable lists; fixed-order items keep theirs", () => {
    const h = ids.contentHash(question);
    const flipped = { ...question, payload: { ...mcq, options: [...mcq.options].reverse() } };
    expect(ids.contentHash(flipped)).toBe(h);
    const fixed = (p) => ({ ...question, shuffle_options: false, payload: { ...p, fixed_order_reason: "numeric_ascending" } });
    expect(ids.contentHash(fixed(flipped.payload))).not.toBe(ids.contentHash(fixed(mcq)));
    expect(ids.contentHash({ ...question, shuffle_options: false })).not.toBe(ids.contentHash({ ...flipped, shuffle_options: false }));
    const ord = { question_type: "ordering", language: "ar", stem: "رتب", payload: { items: [{ id: "s1", text: "أ" }, { id: "s2", text: "ب" }, { id: "s3", text: "ج" }], answer: { order: ["s2", "s1", "s3"] }, criterion: "other" } };
    expect(ids.contentHash({ ...ord, payload: { ...ord.payload, items: [...ord.payload.items].reverse() } })).toBe(ids.contentHash(ord));
    expect(ids.contentHash({ ...ord, payload: { ...ord.payload, answer: { order: ["s1", "s2", "s3"] } } })).not.toBe(ids.contentHash(ord));
    const mat = { question_type: "matching", language: "ar", stem: "صل", payload: { left: [{ id: "l1", text: "1" }, { id: "l2", text: "2" }], right: [{ id: "r1", text: "x" }, { id: "r2", text: "y" }], answer: { pairs: [["l1", "r2"], ["l2", "r1"]] }, scoring: "partial" } };
    const matFlip = { ...mat, payload: { ...mat.payload, left: [...mat.payload.left].reverse(), right: [...mat.payload.right].reverse(), answer: { pairs: [["l2", "r1"], ["l1", "r2"]] } } };
    expect(ids.contentHash(matFlip)).toBe(ids.contentHash(mat));
    const tf = { question_type: "true_false", language: "ar", stem: "صح؟", payload: { options: [{ id: "t", text: "صح" }, { id: "f", text: "خطأ" }], answer: { option_id: "t" } } };
    expect(ids.contentHash({ ...tf, payload: { ...tf.payload, options: [...tf.payload.options].reverse() } })).not.toBe(ids.contentHash(tf));
  });

  it("attack: a question id is the same for every candidate answer (nothing to test offline)", () => {
    const cases = [
      ["mcq", { options: [{ id: "o1a2b3c", text: "٣٢" }, { id: "o4d5e6f", text: "٢٣" }, { id: "o7a8b9c", text: "٥" }], fixed_order_reason: null },
        (p) => p.options.map((o) => ({ ...p, answer: { option_id: o.id } }))],
      ["true_false", { options: [{ id: "t", text: "صح" }, { id: "f", text: "خطأ" }] }, (p) => p.options.map((o) => ({ ...p, answer: { option_id: o.id } }))],
      ["ordering", { items: [{ id: "s1", text: "أ" }, { id: "s2", text: "ب" }, { id: "s3", text: "ج" }], criterion: "other" },
        (p) => [["s1", "s2", "s3"], ["s1", "s3", "s2"], ["s2", "s1", "s3"], ["s2", "s3", "s1"], ["s3", "s1", "s2"], ["s3", "s2", "s1"]].map((order) => ({ ...p, answer: { order } }))],
      ["matching", { left: [{ id: "l1", text: "1" }, { id: "l2", text: "2" }], right: [{ id: "r1", text: "x" }, { id: "r2", text: "y" }], scoring: "partial" },
        (p) => [[["l1", "r1"], ["l2", "r2"]], [["l1", "r2"], ["l2", "r1"]]].map((pairs) => ({ ...p, answer: { pairs } }))],
      ["short_answer", { match: "normalized_exact", max_chars: 20 }, (p) => [["7"], ["سبعة"], ["8"]].map((accepted) => ({ ...p, accepted }))],
      ["numeric", { unit: { text: "سم", required: true, accepted: [] }, input: { allow_fraction: true, max_decimals: null } }, (p) => ["1", "2.5"].map((value) => ({ ...p, answer: { value, tolerance: { kind: "abs", value: "0" } } }))],
    ];
    for (const [type, base, candidates] of cases) {
      const minted = candidates(base).map((payload) => ids.mintQuestionId({ grade: "apt", subject: "quantitative", anchor: "prep:aptitude/quantitative/arithmetic", type, stem: "ما ناتج ٢٠ + ٣؟", payload }));
      expect(new Set(minted.map((m) => m.id_hash)).size, type).toBe(1);
    }
    // option order never matters either; option texts and the stem do
    const [, base] = cases[0];
    const at = (payload, stem = "س") => ids.questionIdHash({ anchor: "a", type: "mcq", stem, payload });
    expect(at({ ...base, options: [...base.options].reverse() })).toBe(at(base));
    expect(at({ ...base, options: base.options.slice(1) })).not.toBe(at(base));
    expect(at(base, "ص")).not.toBe(at(base));
    // the old answer-bearing form is refused outright
    expect(() => ids.questionIdHash({ anchor: "a", type: "mcq", stem: "س", answer: "٢٣" })).toThrow(/answer_in_id/);
    expect(() => ids.mintQuestionId({ ...params, answer: "56" })).toThrow(/answer_in_id/);
    expect(() => ids.questionIdHash({ anchor: "a", type: "mcq", stem: "س" })).toThrow(/payload_required/);
  });
});

// ── §5.2 randomness ────────────────────────────────────────────────────────
describe("prng.js — HASH-CTR u() and sfc32", () => {
  it("SHA-256 matches the published FIPS 180-2 test vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    expect(sha256Hex("a".repeat(1000000))).toBe("cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
    expect(sha256Hex("عين")).toBe(sha256Hex(Buffer.from("عين", "utf8")));
  });

  it("u() is the first 13 hex chars of SHA-256(seed:tag:key) as a 52-bit integer", () => {
    const seed = "00000000000000000000000000000000";
    const key = "q-m1-math-3f9a1c2b7d";
    expect(u(seed, "sel", key)).toBe(parseInt(sha256Hex(`${seed}:sel:${key}`).slice(0, 13), 16));
    expect(u(seed, "sel", key)).toBe(0xc9710d5125e1b); // pinned for the SQL twin (WP7)
    expect(u(seed, "sel", key)).toBe(3543798270549531);
    expect(u("0123456789abcdef0123456789abcdef", `opt:${key}`, "o1a2b3c")).toBe(44920975469138);
    for (let i = 0; i < 200; i++) {
      const v = u(seed, "ord", `k${i}`);
      expect(Number.isSafeInteger(v) && v >= 0 && v < 2 ** 52).toBe(true);
    }
    const keys = ["b", "a", "c", "d"];
    expect(sortByU(seed, "ord", keys)).toEqual(sortByU(seed, "ord", [...keys].reverse()));
  });

  it("server seeds are 128-bit lowercase hex", () => {
    const s = newSeed();
    expect(isSeed(s)).toBe(true);
    expect(newSeed()).not.toBe(s);
    expect(isSeed("ABCDEF0123456789abcdef0123456789")).toBe(false);
  });

  it("compareC is byte order (PostgreSQL C collation)", () => {
    expect(compareC("Z", "a")).toBeLessThan(0);
    expect(compareC("z", "é")).toBeLessThan(0);
    expect(["b", "B", "a", "_", "-"].sort(compareC)).toEqual(["-", "B", "_", "a", "b"]);
  });

  it("sfc32 matches an independent BigInt implementation of the reference algorithm", () => {
    const M = 0xffffffffn;
    const ref = (a, b, c, d) => {
      [a, b, c, d] = [a, b, c, d].map(BigInt);
      return () => {
        const t = (a + b + d) & M;
        d = (d + 1n) & M;
        a = b ^ (b >> 9n);
        b = (c + (c << 3n)) & M;
        c = ((c << 21n) | (c >> 11n)) & M;
        c = (c + t) & M;
        return Number(t);
      };
    };
    for (const seed of [[0, 0, 0, 0], [1, 2, 3, 4], [0xdeadbeef, 0xcafebabe, 0x12345678, 0xffffffff]]) {
      const x = sfc32(...seed);
      const y = ref(...seed);
      for (let i = 0; i < 1000; i++) expect(x()).toBe(y());
    }
  });

  it("seededRng is deterministic per template revision and unbiased in range", () => {
    const seedText = templateSeedText("t-m1-math-0c4e1d9a2b", 1);
    expect(seedText).toBe("t-m1-math-0c4e1d9a2b|1");
    const a = seededRng(seedText);
    const b = seededRng(seedText);
    const draws = Array.from({ length: 50 }, () => a.int(-12, 12));
    expect(Array.from({ length: 50 }, () => b.int(-12, 12))).toEqual(draws);
    expect(draws.every((v) => v >= -12 && v <= 12)).toBe(true);
    expect(seededRng(templateSeedText("t-m1-math-0c4e1d9a2b", 2)).next()).not.toBe(seededRng(seedText).next());
    expect(seededRng(seedText).next()).toBe(4044767816); // pinned
    const counts = [0, 0, 0];
    const r = seededRng("balance");
    for (let i = 0; i < 30000; i++) counts[r.int(0, 2)]++;
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(500);
    expect(() => r.int(3, 1)).toThrow(RangeError);
    const f = r.float();
    expect(f >= 0 && f < 1).toBe(true);
  });
});


// ── schemas ─────────────────────────────────────────────────────────────────
describe("data/schemas — draft 2020-12, AJV 8", () => {
  let S;
  beforeAll(async () => {
    S = await import("../../scripts/content/lib/schemas.mjs");
  });

  it("has every WP1 schema, compiled in strict mode", () => {
    const required = ["source", "resource", "term-evidence", "curriculum-node", "subject-term", "page-map", "toc", "exercise-index", "objective", "stimulus", "question", "question-template", "validation-record", "dedup-cluster", "exam-template", "manifest", "book-frontmatter", "catalog-map", "research-claims", "id-registry", "owner-decision", "prep-alignment", "crawl-changes", "runtime-bank-index", "runtime-bank-sel", "runtime-bank-content"];
    const names = S.schemaNames();
    for (const n of required) expect(names, n).toContain(n);
    for (const file of readdirSync(join(REPO, "data/schemas"))) {
      const doc = JSON.parse(readFileSync(join(REPO, "data/schemas", file), "utf8"));
      expect(doc.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    }
  });

  it("mirrors the enums of src/lib/content/enums.js", () => {
    const { schemas } = S.loadSchemas();
    const defs = schemas.get("common").$defs;
    const prop = (name, key) => schemas.get(name).properties[key].enum;
    expect(prop("question", "question_type")).toEqual([...enums.QUESTION_TYPES]);
    expect(prop("question", "item_style")).toEqual([...enums.ITEM_STYLES]);
    expect(prop("question", "status")).toEqual([...enums.QUESTION_STATUSES]);
    expect(prop("question", "scope")).toEqual([...enums.SCOPES]);
    expect(prop("resource", "kind")).toEqual([...enums.RESOURCE_KINDS]);
    expect(prop("resource", "availability")).toEqual([...enums.AVAILABILITY]);
    expect(prop("curriculum-node", "kind")).toEqual([...enums.NODE_KINDS]);
    expect(prop("curriculum-node", "status")).toEqual([...enums.NODE_STATUSES]);
    expect(prop("page-map", "kind")).toEqual([...enums.PAGE_KINDS]);
    expect(schemas.get("page-map").properties.flags.items.enum).toEqual([...enums.PAGE_FLAGS]);
    expect(prop("term-evidence", "method")).toEqual([...enums.TERM_EVIDENCE_METHODS]);
    expect(prop("validation-record", "role")).toEqual([...enums.VALIDATION_ROLES]);
    expect(prop("exam-template", "kind")).toEqual([...enums.TEMPLATE_KINDS]);
    expect(defs.term_status.enum).toEqual([...enums.TERM_STATUSES]);
    expect(defs.provenance_status.enum).toEqual([...enums.PROVENANCE_STATUSES]);
    expect(defs.provenance.properties.origin.enum).toEqual([...enums.ORIGINS]);
    expect(defs.provenance.properties.official).toEqual({ const: false });
    expect(Object.keys(enums.TERM_EVIDENCE_GRADE).sort()).toEqual([...enums.TERM_EVIDENCE_METHODS].sort());
    expect([1, 2, 3, 4, 5].map(enums.difficultyBand)).toEqual([1, 1, 2, 3, 3]);
    expect([1, 2, 3].map(enums.legacyDifficultyLevel)).toEqual([2, 3, 4]);
  });

  it("orders keys by schema and rejects unknown fields", () => {
    const rec = { status: "draft", origin: "authored", id: "obj-0123456789", text_ar: "يحسب", source: null, text_en: null, lesson_node_id: "middle/grade-1/math/n54", schema: "objective@1" };
    expect(Object.keys(JSON.parse(S.stringifyRecord("objective", rec)))).toEqual(["schema", "id", "lesson_node_id", "text_ar", "text_en", "origin", "source", "status"]);
    expect(S.validateRecord("objective", rec).ok).toBe(true);
    expect(S.validateRecord("objective", { ...rec, extra: 1 }).ok).toBe(false);
    expect(S.validateRecord("objective", { ...rec, schema: "objective@2" }).ok).toBe(false);
    expect(S.keyOrder("objective")[0]).toBe("schema");
  });

  it("rejects a negative numeric tolerance and a template id too long for its variants", () => {
    const fixtureQ = readFileSync(join(FIXTURE, "questions/middle/grade-1/math.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const numeric = fixtureQ.find((q) => q.question_type === "numeric");
    expect(numeric, "fixture has a numeric item").toBeTruthy();
    expect(S.validateRecord("question", numeric).ok).toBe(true);
    const withTol = (value) => ({ ...numeric, payload: { ...numeric.payload, answer: { ...numeric.payload.answer, tolerance: { kind: "abs", value } } } });
    expect(S.validateRecord("question", withTol("0.05")).ok).toBe(true);
    expect(S.validateRecord("question", withTol("-0.05")).ok).toBe(false);
    expect(S.validateRecord("question", withTol(-1)).ok).toBe(false);
    const defs = S.loadSchemas().schemas.get("common").$defs;
    expect(defs.template_id.maxLength).toBe(ids.TEMPLATE_ID_MAX);
  });

  it("maps every staging path to a rule", () => {
    expect(S.ruleFor("questions/middle/grade-1/math.jsonl").schema).toBe("question");
    expect(S.ruleFor("questions/high-school/grade-2/general/math.p02.jsonl").schema).toBe("question");
    expect(S.ruleFor("questions/prep/achievement-chemistry.jsonl").schema).toBe("question");
    expect(S.ruleFor("questions/stimuli/middle/grade-1/math.jsonl").schema).toBe("stimulus");
    expect(S.ruleFor("question-variants/templates/middle/grade-1/math.jsonl").schema).toBe("question-template");
    expect(S.ruleFor("question-variants/middle/grade-1/math.jsonl").id).toBe("variants");
    expect(S.ruleFor("sources/ien/changes-2026-10-01.jsonl").schema).toBe("crawl-changes");
    expect(S.ruleFor("validation/exchange/run-x/chatgpt-001.request.jsonl").format).toBe("ignored");
    expect(S.ruleFor("resources/page-maps/../x.jsonl")).toBeNull();
    expect(S.ruleFor("questions/middle/grade-1/math.json")).toBeNull();
    expect(S.ruleFor("resources/p001.jpg")).toBeNull();
    expect(S.runtimeRuleFor("sel/middle-grade-1-math.json").schema).toBe("runtime-bank-sel");
    expect(S.runtimeRuleFor("../index.json")).toBeNull();
    expect(S.shardBase("questions/a/b.p03.jsonl")).toBe("questions/a/b");
  });

  it("runtime-bank schemas: whitelist paths, no keys in content chunks", () => {
    const index = {
      schema: "runtime-bank-index@1", bank_revision: "0123456789abcdef",
      files: { "middle-grade-1-math": { path: "sel/middle-grade-1-math.json", sha256: "a".repeat(64), bytes: 10 } },
      nodes: { "middle/grade-1/math": { counts: { 1: 3, 2: 4, 3: 1 }, sel: "middle-grade-1-math" } },
    };
    expect(S.validateRecord("runtime-bank-index", index).ok).toBe(true);
    const evil = { ...index, files: { x: { path: "../../.env", sha256: "a".repeat(64), bytes: 1 } } };
    expect(S.validateRecord("runtime-bank-index", evil).ok).toBe(false);
    const sel = { schema: "runtime-bank-sel@1", file_id: "middle-grade-1-math", scope: "middle/grade-1/math", columns: ["key", "lesson", "band", "component", "type", "stimulus", "premium", "revision", "chunk", "objective"],
      rows: [["q-m1-math-3f9a1c2b7d", "middle/grade-1/math/n54", 1, "xg-0123456789", "mcq", null, false, 1, "c0001", "obj-0123456789"], ["q-m1-math-3f9a1c2b7e", "middle/grade-1/math/n54", 1, null, "mcq", null, false, 1, "c0001", null]] };
    expect(S.validateRecord("runtime-bank-sel", sel).ok).toBe(true);
    expect(S.validateRecord("runtime-bank-sel", { ...sel, rows: [["q-m1-math-3f9a1c2b7d", "x", 4, null, "mcq", null, false, 1, "c0001", null]] }).ok).toBe(false);
    // the objective column (lesson-quiz stratifies by objective, §2.12) is an objective id or null
    expect(S.validateRecord("runtime-bank-sel", { ...sel, rows: [["q-m1-math-3f9a1c2b7d", "middle/grade-1/math/n54", 1, null, "mcq", null, false, 1, "c0001", "lesson"]] }).ok).toBe(false);
    expect(S.validateRecord("runtime-bank-sel", { ...sel, rows: [["q-m1-math-3f9a1c2b7d", "middle/grade-1/math/n54", 1, null, "mcq", null, false, 1, "c0001"]] }).ok).toBe(false);
    const item = { key: "q-m1-math-3f9a1c2b7d", revision: 1, type: "mcq", stem: "…", options: [{ index: 0, text: "7" }] };
    expect(S.validateRecord("runtime-bank-content", { schema: "runtime-bank-content@1", chunk_id: "c0001", kind: "content", items: [item] }).ok).toBe(true);
    expect(S.validateRecord("runtime-bank-content", { schema: "runtime-bank-content@1", chunk_id: "c0001", kind: "content", items: [{ ...item, answer: { option_id: "o1" } }] }).ok).toBe(false);
    expect(S.validateRecord("runtime-bank-content", { schema: "runtime-bank-content@1", chunk_id: "c0001", kind: "content", items: [{ ...item, public: { accepted: ["7"] } }] }).ok).toBe(false);
    expect(S.validateRecord("runtime-bank-content", { schema: "runtime-bank-content@1", chunk_id: "k0001", kind: "keys", items: [{ key: item.key, revision: 1, answer: { option_id: "o1" }, explanation: { text: "…", steps: [] } }] }).ok).toBe(true);
  });
});

// ── JSONL and cache helpers ────────────────────────────────────────────────
describe("scripts/content/lib — jsonl, cache, id registry", () => {
  let J, K, R, tmp;
  beforeAll(async () => {
    J = await import("../../scripts/content/lib/jsonl.mjs");
    K = await import("../../scripts/content/lib/cache.mjs");
    R = await import("../../scripts/content/lib/id-registry.mjs");
    tmp = mkdtempSync(join(tmpdir(), "jz-foundation-"));
  });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it("writes deterministic shards split by sorted id ranges", () => {
    const base = join(tmp, "questions", "math");
    const records = Array.from({ length: 30 }, (_, i) => ({ id: `q-m1-math-${String(29 - i).padStart(10, "0")}`, stem: "x".repeat(50) }));
    const one = J.writeShards(base, records, { maxBytes: 1000 });
    expect(one.files.map((f) => f.path.replace(/\\/g, "/").split("/").pop())).toEqual(["math.p01.jsonl", "math.p02.jsonl", "math.p03.jsonl"]);
    expect(one.files.every((f) => f.bytes <= 1000 && f.changed)).toBe(true);
    const all = one.files.flatMap((f) => J.readJsonl(f.path).map((r) => r.id));
    expect(all).toEqual([...all].sort());
    expect(all).toHaveLength(30);
    const again = J.writeShards(base, [...records].reverse(), { maxBytes: 1000 });
    expect(again.files.every((f) => !f.changed)).toBe(true);
    expect(again.files.map((f) => f.sha256)).toEqual(one.files.map((f) => f.sha256));
    const small = J.writeShards(base, records.slice(0, 2), { maxBytes: 1000 });
    expect(small.files).toHaveLength(1);
    expect(small.files[0].path.endsWith("math.jsonl")).toBe(true);
    expect(small.removed).toHaveLength(3);
    expect(readdirSync(join(tmp, "questions")).sort()).toEqual(["math.jsonl"]);
    const text = readFileSync(small.files[0].path, "utf8");
    expect(text.endsWith("\n") && !text.includes("\r") && !text.startsWith("\uFEFF")).toBe(true);
    expect(() => J.planShards(["x".repeat(20)], 10)).toThrow(/shard limit/);
  });

  it("reports JSONL file-rule issues", () => {
    const { records, issues } = J.inspectJsonlText('\uFEFF{"a":1}\r\n\n[1]\n{bad\n{"b":2}');
    expect(records.map((r) => r.record)).toEqual([{ a: 1 }, { b: 2 }]);
    expect(issues.map((i) => i.code).sort()).toEqual(["blank_line", "bom", "crlf", "final_newline", "invalid_json", "not_object"]);
    writeFileSync(join(tmp, "bad.jsonl"), '{"a":1}\n{oops}\n');
    expect(() => J.readJsonl(join(tmp, "bad.jsonl"))).toThrow(/bad\.jsonl:2/);
  });

  it("streams records", async () => {
    writeFileSync(join(tmp, "s.jsonl"), '{"id":"a"}\n{"id":"b"}\n');
    const seen = [];
    for await (const { record, line } of J.readJsonlStream(join(tmp, "s.jsonl"))) seen.push(`${line}:${record.id}`);
    expect(seen).toEqual(["1:a", "2:b"]);
  });

  it("keeps the cache layout, sanitizes names and contains paths", () => {
    const root = join(tmp, "cache");
    expect(K.cacheRoot({ CONTENT_CACHE_DIR: root })).toBe(resolve(root));
    expect(K.cacheRoot({})).toBe(resolve("C:/jazira/content-cache"));
    const p = K.cachePaths(root);
    const rel = (x) => x.slice(resolve(root).length + 1).replace(/\\/g, "/");
    expect(rel(p.pdf("1448-GE-ME-K07-SM1-math-part1.pdf"))).toBe("ien/pdf/1448-GE-ME-K07-SM1-math-part1.pdf");
    expect(rel(p.textPage("1448-GE-PE-K01-SM1-ISLM.part.pdf", 7))).toBe("ien/text/1448-GE-PE-K01-SM1-ISLM.part/p007.txt");
    expect(rel(p.pageImage("1448-X-PART2.PDF", 1234))).toBe("ien/pages/1448-X-PART2/p1234.jpg");
    expect(rel(p.extractPages("ien-120607"))).toBe("extract/ien-120607/pages.jsonl");
    expect(rel(p.evidence(K.evidenceShard("q-m1-math-3f9a1c2b7d")))).toBe("evidence/q-m1-math.jsonl");
    expect(K.evidenceShard("v-h3-software-engineering-0c4e1d9a2b-07")).toBe("v-h3-software-engineering");
    expect(K.evidenceShard("aq-001")).toBe("legacy-aq");
    expect(rel(p.fetchQueue())).toBe("fetch/queue.jsonl");
    expect(rel(p.packetsDir("run-20260927-gen-01"))).toBe("packets/run-20260927-gen-01");
    for (const bad of ["..", "../x.pdf", "a/b.pdf", "a\\b.pdf", "CON.pdf", "con.PDF", "LPT1.pdf", "x.pdf.exe", ".pdf", "", "a b.pdf", "C:x.pdf", "Audio Files TG3.zip", "é.pdf"]) {
      expect(K.isSafePdfName(bad), bad).toBe(false);
      expect(() => p.pdf(bad), bad).toThrow(K.CachePathError);
    }
    expect(() => p.extractPages("../../etc")).toThrow(K.CachePathError);
    expect(() => p.importDir("NUL")).toThrow(K.CachePathError);
    expect(() => K.resolveInCache(root, "ien", "..", "..", "x")).toThrow(/outside_cache/);
    expect(() => K.resolveInCache(root, resolve(tmp, "elsewhere"))).toThrow(K.CachePathError);
    expect(K.resolveInCache(root, "ien", "pdf")).toBe(resolve(root, "ien", "pdf"));
    expect(K.pageName(1)).toBe("p001");
    expect(() => K.pageName(0)).toThrow(K.CachePathError);
    expect(K.isInside(REPO, join(REPO, "data"))).toBe(true);
    expect(K.isInside(REPO, K.cacheRoot({}))).toBe(false);
  });

  it("id registry reuses ids for typo-fixed titles and never renames", () => {
    const path = join(tmp, "curriculum", "id-registry.jsonl");
    mkdirSync(join(tmp, "curriculum"), { recursive: true });
    const now = () => "2026-09-27T08:00:00Z";
    const reg = new R.IdRegistry([], { now });
    const subject = "middle/grade-1/math";
    const a = reg.resolve({ kind: "x_node", scope: subject, nodeKind: "lesson", title: "تطبيقات على المعادلات الخطية" });
    expect(a).toEqual({ id: ids.xNodeId(subject, "lesson", "تطبيقات على المعادلات الخطية"), match: "minted" });
    expect(reg.resolve({ kind: "x_node", scope: subject, nodeKind: "lesson", title: "تطبيقاتٌ على المعادلات الخطيّة" })).toEqual({ id: a.id, match: "exact" });
    const typo = reg.resolve({ kind: "x_node", scope: subject, nodeKind: "lesson", title: "تطبيقات علي المعادلات الخطيه" });
    expect(typo).toEqual({ id: a.id, match: "exact" }); // folds ى/ة
    const fixed = reg.resolve({ kind: "x_node", scope: subject, nodeKind: "lesson", title: "تطبيقات على المعادلات الخطية." + "ا" });
    expect(fixed.id).toBe(a.id);
    expect(fixed.match).toBe("alias");
    expect(reg.get(a.id).aliases).toHaveLength(1);
    expect(reg.resolve({ kind: "x_node", scope: subject, nodeKind: "lesson", title: "النسبة والتناسب" }).match).toBe("minted");
    expect(reg.resolve({ kind: "x_node", scope: subject, nodeKind: "unit", title: "تطبيقات على المعادلات الخطية" }).id).not.toBe(a.id);
    expect(reg.resolve({ kind: "x_node", scope: "middle/grade-1/science", nodeKind: "lesson", title: "تطبيقات على المعادلات الخطية" }).id).not.toBe(a.id);
    // Two different TOC nodes with the same title in one run get different, stable ids.
    const taken = new Set();
    const r1 = reg.resolve({ kind: "x_node", scope: subject, nodeKind: "lesson", title: "مراجعة", taken });
    const r2 = reg.resolve({ kind: "x_node", scope: subject, nodeKind: "lesson", title: "مراجعة", taken });
    expect(r1.id).not.toBe(r2.id);
    reg.save(path);
    const text = readFileSync(path, "utf8");
    const reloaded = R.IdRegistry.load(path, { now });
    const taken2 = new Set();
    expect(reloaded.resolve({ kind: "x_node", scope: subject, nodeKind: "lesson", title: "مراجعة", taken: taken2 }).id).toBe(r1.id);
    expect(reloaded.resolve({ kind: "x_node", scope: subject, nodeKind: "lesson", title: "مراجعة", taken: taken2 }).id).toBe(r2.id);
    const o1 = reloaded.resolve({ kind: "objective", scope: "middle/grade-1/math/n54", title: "يحسب قيمة عبارة أسية." });
    expect(o1.id).toBe(ids.objectiveId("middle/grade-1/math/n54", "يحسب قيمة عبارة أسية."));
    expect(reloaded.resolve({ kind: "objective", scope: "middle/grade-1/math/n54", title: "يحسب قيمة عبارة أسيه" }).id).toBe(o1.id);
    // Regression: objectives were minted from the lam_order_folded key, so any
    // text with an alef/lam run («الأعداد» → «االعداد») got an id different from
    // §2.2 objectiveId(lesson, text). The registry id must equal it.
    const lamText = "يقارن بين الأعداد الصحيحة ويرتبها";
    expect(normalizeTitle(lamText)).not.toBe(searchNormalize(lamText));
    const o2 = reloaded.resolve({ kind: "objective", scope: "middle/grade-1/math/n55", title: lamText });
    expect(o2).toEqual({ id: ids.objectiveId("middle/grade-1/math/n55", lamText), match: "minted" });
    expect(reloaded.resolve({ kind: "objective", scope: "middle/grade-1/math/n55", title: "يقارن بين االعداد الصحيحة ويرتبها" })).toEqual({ id: o2.id, match: "exact" });
    const x2 = reloaded.resolve({ kind: "x_node", scope: subject, nodeKind: "lesson", title: "الأعداد النسبية" });
    expect(x2.id).toBe(ids.xNodeId(subject, "lesson", "الأعداد النسبية"));
    reloaded.save(path);
    expect(readFileSync(path, "utf8").startsWith(text.split("\n")[0].slice(0, 20))).toBe(true);
    expect(reloaded.missingFrom([a.id, "middle/grade-1/math/x00000000"])).toEqual(["middle/grade-1/math/x00000000"]);
    const lines = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l).id);
    expect(lines).toEqual([...lines].sort(compareC));
    expect(() => new R.IdRegistry([{ id: "x" }, { id: "x" }])).toThrow(/duplicate/);
    expect(() => reg.resolve({ kind: "x_node", scope: subject, title: "بلا نوع" })).toThrow(/nodeKind/);
  });
});

// ── validate-staging on the fixture tree ───────────────────────────────────
describe("validate-staging — fixture tree and seeded defects", () => {
  let V, S, work;
  let n = 0;
  beforeAll(async () => {
    V = await import("../../scripts/content/validate-staging.mjs");
    S = await import("../../scripts/content/lib/schemas.mjs");
    work = mkdtempSync(join(tmpdir(), "jz-staging-"));
  });
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  const copy = () => {
    const dir = join(work, `t${++n}`);
    cpSync(FIXTURE, dir, { recursive: true });
    return dir;
  };
  const run = (root, extra = {}) => V.validateStaging({ root, runtimeDir: null, registryBaseline: null, imageRoots: [], ...extra });
  const codes = (r) => [...new Set(r.errors.map((e) => e.code))].sort();
  const read = (root, rel) => readFileSync(join(root, rel), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const write = (root, rel, schema, records) => {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), records.map((r) => S.stringifyRecord(schema, r)).join("\n") + "\n");
  };
  const edit = (root, rel, schema, fn) => write(root, rel, schema, fn(read(root, rel)));
  /** Mutate, refresh the manifest (so only the seeded defect remains), validate. */
  const seeded = async (mutate, extra) => {
    const root = copy();
    mutate(root);
    await run(root, { writeManifest: true });
    return run(root, extra);
  };
  const QUESTIONS = "questions/middle/grade-1/math.jsonl";
  const PAGES = "resources/page-maps/ien-120607.jsonl";

  it("accepts the fixture tree, which holds every staging record type", async () => {
    const r = await run(FIXTURE);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    const walk = (dir, base = dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1).replace(/\\/g, "/")]));
    const used = new Set(walk(FIXTURE).map((f) => S.ruleFor(f)?.schema).filter(Boolean));
    const staging = S.schemaNames().filter((s) => !s.startsWith("runtime-bank"));
    expect(staging.filter((s) => !used.has(s))).toEqual([]);
  });

  it("checks the fixture against the repository image manifest too", async () => {
    const r = await V.validateStaging({ root: FIXTURE, runtimeDir: null, registryBaseline: null });
    expect(r.errors.filter((e) => e.code === "stray_image")).toEqual([]);
  });

  it("writes a byte-deterministic manifest (a rerun changes nothing)", async () => {
    const root = copy();
    const before = readFileSync(join(root, "manifest.json"), "utf8");
    const r = await run(root, { writeManifest: true });
    expect(r.manifestWritten).toBe(false);
    expect(readFileSync(join(root, "manifest.json"), "utf8")).toBe(before);
    const m = JSON.parse(before);
    expect(m.files.every((f) => f.path !== "manifest.json" && f.path !== "README.md" && !f.path.startsWith("reports/"))).toBe(true);
    expect(Object.values(m.published).flat()).toHaveLength(9);
    expect(m.removed).toEqual([]);
  });

  it("fails a bad reference", async () => {
    const r = await seeded((root) => edit(root, QUESTIONS, "question", (rows) => {
      rows[0].objective_id = "obj-ffffffffff";
      return rows;
    }));
    expect(codes(r)).toEqual(["bad_ref"]);
  });

  it("fails a question id filed under another grade or subject", async () => {
    // §2.2: q-<grade code>-<subject>-… names the record's own grade and subject.
    const r = await seeded((root) => {
      for (const rel of [QUESTIONS, "validation/records/middle/grade-1/math.jsonl"]) {
        const f = join(root, rel);
        writeFileSync(f, readFileSync(f, "utf8").replaceAll("q-m1-math-faa8c931d3", "q-m2-math-faa8c931d3"));
      }
    });
    expect(codes(r)).toEqual(["bad_ref"]);
    expect(r.errors[0].message).toMatch(/must start with q-m1-math-/);
  });

  it("fails a question whose term is not copied from its lesson", async () => {
    const r = await seeded((root) => edit(root, QUESTIONS, "question", (rows) => {
      const q = rows.find((x) => x.curriculum.term === "t1");
      q.curriculum.term = "t2";
      return rows;
    }));
    expect(codes(r)).toEqual(["bad_ref"]);
    expect(r.errors[0].message).toMatch(/not copied from the lesson/);
  });

  it("fails an unsorted file", async () => {
    const r = await seeded((root) => edit(root, QUESTIONS, "question", (rows) => rows.reverse()));
    expect(codes(r)).toEqual(["unsorted"]);
  });

  it("fails an oversized shard (> 4 MB)", async () => {
    const r = await seeded((root) => edit(root, PAGES, "page-map", (rows) => {
      const template = rows.find((p) => p.pdf_page === 14);
      return Array.from({ length: 14000 }, (_, i) => ({ ...template, pdf_page: i + 1, lesson_node_id: null, kind: "unknown" }));
    }));
    expect(codes(r)).toEqual(["oversized_shard"]);
  });

  it("fails a stale manifest", async () => {
    const root = copy();
    edit(root, "curriculum/nodes/middle/grade-1.jsonl", "curriculum-node", (rows) => {
      rows.find((x) => x.kind === "subject").title_en = "Maths";
      return rows;
    });
    const r = await run(root);
    expect(codes(r)).toEqual(["stale_manifest"]);
    rmSync(join(root, "manifest.json"));
    expect(codes(await run(root))).toEqual(["manifest_missing"]);
  });

  it("fails an 81-char excerpt", async () => {
    const r = await seeded((root) => edit(root, PAGES, "page-map", (rows) => {
      rows[0].headings = ["ا".repeat(81)];
      return rows;
    }));
    expect(codes(r)).toContain("excerpt_too_long");
    const ok = await seeded((root) => edit(root, PAGES, "page-map", (rows) => {
      rows[0].headings = ["ا".repeat(80)];
      return rows;
    }));
    expect(ok.errors).toEqual([]);
  });

  it("fails a quote in a question", async () => {
    const r = await seeded((root) => edit(root, QUESTIONS, "question", (rows) => {
      rows.find((x) => x.source?.evidence?.length).source.evidence[0].quote = "نص من الكتاب";
      return rows;
    }));
    expect(codes(r)).toContain("quote_in_question");
  });

  it("fails an absolute path or cache_dir", async () => {
    const r = await seeded((root) => {
      const f = join(root, "validation/runs/run-20260927-gen-01.json");
      const run1 = JSON.parse(readFileSync(f, "utf8"));
      run1.packets = "C:/jazira/content-cache/packets/run-20260927-gen-01";
      writeFileSync(f, JSON.stringify(run1, null, 2) + "\n");
    });
    expect(codes(r)).toEqual(["absolute_path"]);
    const fm = await seeded((root) => {
      const f = join(root, "sources/ien/book-frontmatter.jsonl");
      writeFileSync(f, readFileSync(f, "utf8").replace('"run_id"', '"cache_dir":"/home/u/cache","run_id"'));
    });
    expect(codes(fm)).toContain("absolute_path");
  });

  it("fails a stray .jpg and any unknown file", async () => {
    const jpg = await seeded((root) => writeFileSync(join(root, "resources/p001.jpg"), Buffer.from([0xff, 0xd8, 0xff])));
    expect(codes(jpg)).toEqual(["stray_image", "unknown_file"]);
    const unknown = await seeded((root) => writeFileSync(join(root, "curriculum/notes.txt"), "x\n"));
    expect(codes(unknown)).toEqual(["unknown_file"]);
    const misplaced = await seeded((root) => cpSync(join(root, QUESTIONS), join(root, "misc/math.jsonl")));
    expect(codes(misplaced)).toEqual(["unknown_file"]);
  });

  it("fails duplicate ids, bad id formats, non-canonical lines and shard layout", async () => {
    const dup = await seeded((root) => write(root, "curriculum/nodes/middle/grade-2.jsonl", "curriculum-node", read(root, "curriculum/nodes/middle/grade-1.jsonl").slice(0, 1)));
    expect(codes(dup)).toEqual(["duplicate_id"]);
    const badId = await seeded((root) => edit(root, "resources/term-evidence.jsonl", "term-evidence", (rows) => {
      rows[0].pdf_page = 3;
      return rows;
    }));
    expect(codes(badId)).toEqual(["bad_id"]);
    const order = await seeded((root) => {
      const f = join(root, "resources/extraction.jsonl");
      const rec = JSON.parse(readFileSync(f, "utf8"));
      const reversed = Object.fromEntries(Object.entries(rec).reverse());
      writeFileSync(f, JSON.stringify(reversed) + "\n");
    });
    expect(codes(order)).toEqual(["non_canonical"]);
    const crlf = await seeded((root) => {
      const f = join(root, "resources/extraction.jsonl");
      writeFileSync(f, readFileSync(f, "utf8").replace("\n", "\r\n"));
    });
    expect(codes(crlf)).toContain("crlf");
    const shards = await seeded((root) => cpSync(join(root, QUESTIONS), join(root, "questions/middle/grade-1/math.p02.jsonl")));
    expect(codes(shards)).toEqual(expect.arrayContaining(["duplicate_id", "shard_layout"]));
  });

  it("fails when an id disappears from the append-only id registry", async () => {
    const baseline = read(FIXTURE, "curriculum/id-registry.jsonl").map((r) => r.id);
    expect((await run(FIXTURE, { registryBaseline: baseline })).ok).toBe(true);
    const r = await run(FIXTURE, { registryBaseline: [...baseline, "middle/grade-1/math/xdeadbeef"] });
    expect(codes(r)).toEqual(["registry_id_removed"]);
  });

  it("lists unpublished keys in removed[] and keeps them across reruns", async () => {
    const root = copy();
    const q = read(root, QUESTIONS)[0];
    edit(root, QUESTIONS, "question", (rows) => {
      rows[0].status = "retired";
      return rows;
    });
    await run(root, { writeManifest: true });
    const m1 = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
    expect(m1.removed).toEqual([{ key: q.id, reason: "retired" }]);
    expect((await run(root, { writeManifest: true })).manifestWritten).toBe(false);
    expect((await run(root)).ok).toBe(true);
    edit(root, QUESTIONS, "question", (rows) => {
      rows[0].status = "published";
      return rows;
    });
    await run(root, { writeManifest: true });
    expect(JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")).removed).toEqual([]);
  });

  it("checks the runtime bank index against its files", async () => {
    const bank = join(work, `bank${++n}`);
    const J = await import("../../scripts/content/lib/jsonl.mjs");
    const put = (rel, value) => {
      mkdirSync(join(bank, rel, ".."), { recursive: true });
      const text = JSON.stringify(value);
      writeFileSync(join(bank, rel), text);
      return { path: rel, sha256: J.sha256(text), bytes: Buffer.byteLength(text) };
    };
    const key = "q-m1-math-3f9a1c2b7d";
    const files = {
      "middle-grade-1-math": put("sel/middle-grade-1-math.json", { schema: "runtime-bank-sel@1", file_id: "middle-grade-1-math", scope: "middle/grade-1/math", columns: ["key", "lesson", "band", "component", "type", "stimulus", "premium", "revision", "chunk", "objective"], rows: [[key, "middle/grade-1/math/n54", 1, null, "mcq", null, false, 1, "c0001", null]] }),
      c0001: put("c/c0001.json", { schema: "runtime-bank-content@1", chunk_id: "c0001", kind: "content", items: [{ key, revision: 1, type: "mcq", stem: "…" }] }),
      k0001: put("k/k0001.json", { schema: "runtime-bank-content@1", chunk_id: "k0001", kind: "keys", items: [{ key, revision: 1, answer: { option_id: "o1" } }] }),
    };
    const index = { schema: "runtime-bank-index@1", bank_revision: "0123456789abcdef", files, nodes: { "middle/grade-1/math": { counts: { 1: 1, 2: 0, 3: 0 }, sel: "middle-grade-1-math" } } };
    writeFileSync(join(bank, "index.json"), JSON.stringify(index));
    expect((await run(FIXTURE, { runtimeDir: bank, budget: true })).errors).toEqual([]);
    writeFileSync(join(bank, "c/c0001.json"), JSON.stringify({ schema: "runtime-bank-content@1", chunk_id: "c0001", kind: "content", items: [{ key, revision: 1, answer: { option_id: "o1" } }] }));
    writeFileSync(join(bank, "c/c0002.json"), "{}");
    writeFileSync(join(bank, "notes.txt"), "x");
    expect(codes(await run(FIXTURE, { runtimeDir: bank }))).toEqual(["chunk_kind", "key_in_content", "schema", "stale_index", "unknown_file", "unlisted_file"]);
  });

  it("keeps answers out of public runtime content chunks", async () => {
    // Regression: a c/ file declaring kind "keys" passed the schema with the
    // answers in it, and keys nested below payload/public were not seen.
    const J = await import("../../scripts/content/lib/jsonl.mjs");
    const key = "q-m1-math-3f9a1c2b7d";
    const build = (chunks) => {
      const bank = join(work, `bank${++n}`);
      const files = {};
      for (const [rel, value] of Object.entries(chunks)) {
        mkdirSync(join(bank, rel, ".."), { recursive: true });
        const text = JSON.stringify(value);
        writeFileSync(join(bank, rel), text);
        files[rel.split("/").pop().replace(".json", "")] = { path: rel, sha256: J.sha256(text), bytes: Buffer.byteLength(text) };
      }
      writeFileSync(join(bank, "index.json"), JSON.stringify({ schema: "runtime-bank-index@1", bank_revision: "0123456789abcdef", files, nodes: {} }));
      return bank;
    };
    const content = (items, extra = {}) => ({ schema: "runtime-bank-content@1", chunk_id: "c0001", kind: "content", items, ...extra });
    const clean = build({ "c/c0001.json": content([{ key, revision: 1, stem: "…", payload: { options: [{ id: "o1", text: "7" }] } }]), "k/k0001.json": { schema: "runtime-bank-content@1", chunk_id: "k0001", kind: "keys", items: [{ key, revision: 1, answer: { option_id: "o1" }, explanation: { text: "…", steps: [] } }] } });
    expect((await run(FIXTURE, { runtimeDir: clean })).errors).toEqual([]);
    const disguised = build({ "c/c0001.json": content([{ key, revision: 1, answer: { option_id: "o1" } }], { kind: "keys" }) });
    expect(codes(await run(FIXTURE, { runtimeDir: disguised }))).toEqual(["chunk_kind", "key_in_content"]);
    const nested = build({ "c/c0001.json": content([{ key, revision: 1, payload: { options: [{ id: "o1", text: "7", is_correct: true }] }, meta: { computation: { expr: "a*b" } } }]) });
    expect(codes(await run(FIXTURE, { runtimeDir: nested }))).toEqual(["key_in_content"]);
    const topLevel = build({ "c/c0001.json": content([{ key, revision: 1, answer_display: "7" }]) });
    expect(codes(await run(FIXTURE, { runtimeDir: topLevel }))).toEqual(["key_in_content", "schema"]);
    const misnamed = build({ "c/c0001.json": content([{ key, revision: 1 }], { chunk_id: "c0009" }) });
    expect(codes(await run(FIXTURE, { runtimeDir: misnamed }))).toEqual(["chunk_kind"]);
  });

  it("finds absolute paths inside longer strings, without flagging URLs", async () => {
    const at = (text) => seeded((root) => {
      const f = join(root, "validation/runs/run-20260927-gen-01.json");
      const run1 = JSON.parse(readFileSync(f, "utf8"));
      run1.note = text;
      writeFileSync(f, JSON.stringify(run1, null, 2) + "\n");
    });
    for (const text of ["packets in C:/jazira/content-cache/packets", "see D:\\data\\x.pdf", "log at /home/u/cache/x", "(\\\\server\\share\\x)", "open file:///tmp/x"]) {
      expect(codes(await at(text)), text).toEqual(["absolute_path"]);
    }
    for (const text of ["https://www.ien.edu.sa/#/x", "ratio 3:4, time 10:30", "data/staging/questions/x.jsonl", "a/b: c"]) {
      expect((await at(text)).errors, text).toEqual([]);
    }
  });

  it("exits 0 / 1 / 2 from the command line", () => {
    const cli = (...args) => spawnSync(process.execPath, [join(REPO, "scripts/content/validate-staging.mjs"), ...args], { encoding: "utf8", cwd: REPO });
    const ok = cli("--root", FIXTURE, "--no-runtime", "--registry-baseline", "none");
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(/0 errors/);
    const root = copy();
    writeFileSync(join(root, "stray.bin"), "x");
    const bad = cli("--root", root, "--no-runtime", "--registry-baseline", "none", "--json");
    expect(bad.status).toBe(1);
    expect(JSON.parse(bad.stdout).errors[0].code).toBe("unknown_file");
    expect(cli("--bogus").status).toBe(2);
    expect(cli("--root").status).toBe(2);
    expect(cli("--root", join(work, "nope"), "--no-runtime").status).toBe(2);
    expect(existsSync(join(FIXTURE, "manifest.json"))).toBe(true);
  });
});

describe("tests/fixtures/content/outline-tree.json (node-tree interface for WP2/WP6)", () => {
  const tree = JSON.parse(readFileSync(join(REPO, "tests/fixtures/content/outline-tree.json"), "utf8"));
  const byId = new Map(tree.nodes.map((x) => [x.id, x]));
  const kids = (id) => tree.nodes.filter((x) => x.parent_id === id).sort((a, b) => a.order - b.order);
  const under = (id) => (byId.get(id)?.kind === "lesson" ? [id] : kids(id).flatMap((c) => under(c.id)));

  it("is internally consistent", () => {
    for (const x of tree.nodes) {
      if (x.parent_id !== null) expect(byId.has(x.parent_id), x.id).toBe(true);
      expect(ids.isNodeId(x.id)).toBe(true);
    }
    for (const [id, want] of Object.entries(tree.expected.lessonsUnder)) expect(under(id), id).toEqual(want);
    for (const [scope, want] of Object.entries(tree.expected.eligibleLessons)) {
      const [id, term] = scope.split("@");
      let got = under(id).filter((l) => byId.get(l).status === "verified" && !byId.get(l).unit_opener);
      if (term === "t1" || term === "t2") got = got.filter((l) => [term, "both"].includes(byId.get(l).term) && ["verified", "inferred"].includes(byId.get(l).term_status));
      expect(got, scope).toEqual(want);
    }
    expect(tree.expected.eligibleLessons["middle/grade-1/science@t2"]).toEqual([]);
    expect(tree.expected.nodeById["middle/grade-1/math/n999"]).toBeNull();
  });
});
