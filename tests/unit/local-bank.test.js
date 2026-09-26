// Local practice mode: bank registry, input validation, question picking and
// grading (src/lib/exams/local-bank.js) + the two route handlers.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { LIMITS, QUESTION_FILES, SECTIONS } from "@/lib/exams/catalog";
import {
  createBank, buildRegistry, loadLocalBank, parseStartBody, parseGradeBody, pickLocalQuestions, gradeLocalAnswers,
  publicQuestion, localBankCounts, isSameOrigin, createRateLimiter,
} from "@/lib/exams/local-bank";
import { POST as startRoute } from "@/app/api/exams/local/start/route";
import { POST as gradeRoute } from "@/app/api/exams/local/grade/route";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const fixture = JSON.parse(readFileSync(path.join(ROOT, "tests", "fixtures", "questions-sample.json"), "utf8"));
const bank = createBank([fixture], { names: ["fixture"] });

/** deterministic rng for reproducible picks */
function seeded(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("bank registry", () => {
  it("loads the fixture", () => {
    expect(bank.list).toHaveLength(12);
    expect(bank.byKey.get("fx-aq-05")).toMatchObject({ exam: "aptitude", section: "quantitative", topic: "algebra", answer: 1 });
    expect(bank.loaded).toEqual(["fixture"]);
    expect(bank.skipped).toBe(0);
  });

  it("skips malformed questions, duplicate keys and unusable files instead of failing", () => {
    const bad = structuredClone(fixture);
    bad.questions[0].answer = 9;                  // out of range
    bad.questions[1].topic = "calculus";          // not a quantitative topic
    bad.questions[2].choices = ["only"];          // too few
    bad.questions[3].key = "Bad Key";
    bad.questions[4] = "not an object";
    const b = createBank([bad, fixture, { exam: "nope" }, null]);
    expect(b.list).toHaveLength(12);              // 7 valid from `bad` + the 5 missing ones from the clean copy
    expect(b.byKey.get("fx-aq-01").answer).toBe(1);
    expect(b.skipped).toBe(5 + 7 + 2);            // 5 malformed, 7 duplicates, 2 unusable files
  });

  it("tolerates missing files (records them) with an injected loader", async () => {
    const reg = await buildRegistry(async (name) => {
      if (name === "aptitude-quantitative") return fixture;
      throw new Error("Cannot find module");
    });
    expect(reg.loaded).toEqual(["aptitude-quantitative"]);
    expect(reg.missing).toEqual(QUESTION_FILES.filter((f) => f !== "aptitude-quantitative"));
    expect(reg.list).toHaveLength(12);
  });

  it("the real registry loads whatever src/content/questions provides", async () => {
    const real = await loadLocalBank();
    const present = QUESTION_FILES.filter((f) => existsSync(path.join(ROOT, "src", "content", "questions", `${f}.json`)));
    expect(real.loaded).toEqual(present);         // the template-literal import resolves every bundled file
    expect(real.loaded.length + real.missing.length).toBe(QUESTION_FILES.length);
    for (const q of real.list) {
      expect(SECTIONS[q.section].topics).toContain(q.topic);
      expect(q.answer).toBeLessThan(q.choices.length);
    }
    expect(await loadLocalBank()).toBe(real);     // cached per instance
    const counts = localBankCounts(real);
    const total = Object.values(counts).reduce((s, e) => s + e.total, 0);
    expect(total).toBe(real.list.filter((q) => !q.premium).length);
  });
});

describe("parseStartBody", () => {
  it("accepts a valid request and caps guests at LIMITS.guestMaxQuestions", () => {
    expect(parseStartBody({ exam: "aptitude", count: 5 })).toEqual({
      ok: true, value: { exam: "aptitude", section: null, difficulty: null, count: 5, requested: 5, time_limit_seconds: null, limited: false },
    });
    const r = parseStartBody({ exam: "aptitude", section: "quantitative", difficulty: 2, count: 25, time_limit_seconds: 600 });
    expect(r.value).toMatchObject({ count: LIMITS.guestMaxQuestions, requested: 25, limited: true, difficulty: 2, time_limit_seconds: 600 });
    expect(parseStartBody({ exam: "aptitude", count: 25 }, { maxQuestions: LIMITS.freeMaxQuestions }).value.limited).toBe(false);
  });

  it("rejects invalid input with the offending field", () => {
    const cases = [
      [null, "body"], [[], "body"], [{ exam: "tahsili", count: 5 }, "exam"], [{ exam: "toString", count: 5 }, "exam"],
      [{ exam: "aptitude", section: "physics", count: 5 }, "section"], [{ exam: "aptitude", section: "__proto__", count: 5 }, "section"],
      [{ exam: "aptitude", difficulty: 4, count: 5 }, "difficulty"], [{ exam: "aptitude", difficulty: "1", count: 5 }, "difficulty"],
      [{ exam: "aptitude", count: 4 }, "count"], [{ exam: "aptitude", count: 101 }, "count"], [{ exam: "aptitude", count: 5.5 }, "count"],
      [{ exam: "aptitude", count: 5, time_limit_seconds: 59 }, "time_limit_seconds"],
      [{ exam: "aptitude", count: 5, time_limit_seconds: 14401 }, "time_limit_seconds"],
      [{ exam: "aptitude", count: 5, answers: [] }, "answers"],
    ];
    for (const [body, field] of cases) {
      expect(parseStartBody(body), JSON.stringify(body)).toEqual({ ok: false, error: "invalid_argument", field });
    }
  });
});

describe("pickLocalQuestions", () => {
  it("returns a random set WITHOUT answers or explanations", () => {
    const set = pickLocalQuestions(bank, { exam: "aptitude", count: 5 }, seeded(1));
    expect(set.question_count).toBe(5);
    expect(set.questions.map((q) => q.position)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(set.questions.map((q) => q.key)).size).toBe(5);
    for (const q of set.questions) {
      expect(Object.keys(q).sort()).toEqual(["choices", "difficulty", "id", "key", "passage", "position", "section", "stem", "time_limit_seconds", "topic"]);
      expect(q.id).toBe(q.key);
    }
    expect(JSON.stringify(set)).not.toMatch(/"answer"|explanation|correct/);
    expect(set.time_limit_seconds).toBe(set.questions.reduce((s, q) => s + q.time_limit_seconds, 0));
  });

  it("is uniformly shuffled (different seeds → different sets) and respects filters", () => {
    const a = pickLocalQuestions(bank, { exam: "aptitude", count: 5 }, seeded(1)).questions.map((q) => q.key);
    const b = pickLocalQuestions(bank, { exam: "aptitude", count: 5 }, seeded(99)).questions.map((q) => q.key);
    expect(a).not.toEqual(b);
    const hard = pickLocalQuestions(bank, { exam: "aptitude", section: "quantitative", difficulty: 2, count: 10 });
    expect(hard.question_count).toBe(5);                       // only 5 difficulty-2 items in the fixture
    expect(hard.questions.every((q) => q.difficulty === 2)).toBe(true);
    expect(pickLocalQuestions(bank, { exam: "achievement", count: 5 }).question_count).toBe(0);
  });

  it("clamps the default time limit to 60 s … 4 h and honours an explicit one", () => {
    const one = createBank([{ ...fixture, questions: [fixture.questions[0]] }]);
    expect(pickLocalQuestions(one, { exam: "aptitude", count: 5 }).time_limit_seconds).toBe(60);
    expect(pickLocalQuestions(bank, { exam: "aptitude", count: 5, time_limit_seconds: 900 }).time_limit_seconds).toBe(900);
  });

  it("never serves premium items", () => {
    const withPremium = structuredClone(fixture);
    withPremium.questions.forEach((q, i) => { q.premium = i < 10; });
    const b = createBank([withPremium]);
    const set = pickLocalQuestions(b, { exam: "aptitude", count: 10 });
    expect(set.questions.map((q) => q.key).sort()).toEqual(["fx-aq-11", "fx-aq-12"]);
    expect(parseGradeBody({ answers: [{ key: "fx-aq-01", selected_index: 0 }] }, b)).toMatchObject({ ok: false, error: "unknown_key" });
  });
});

describe("parseGradeBody + gradeLocalAnswers", () => {
  it("grades correct, wrong and unanswered items with explanations", () => {
    const parsed = parseGradeBody({ answers: [
      { key: "fx-aq-01", selected_index: 1 },   // correct (15)
      { key: "fx-aq-02", selected_index: 3 },   // wrong
      { key: "fx-aq-08", selected_index: null },
      { key: "fx-aq-12", selected_index: 0 },   // correct
    ] }, bank);
    expect(parsed.ok).toBe(true);
    const g = gradeLocalAnswers(bank, parsed.value);
    expect(g.summary).toEqual({ correct: 2, total: 4, answered: 3, score_percent: 50 });
    expect(g.items.map((i) => [i.position, i.key, i.is_correct, i.correct_index])).toEqual([
      [1, "fx-aq-01", true, 1], [2, "fx-aq-02", false, 0], [3, "fx-aq-08", false, 0], [4, "fx-aq-12", true, 0],
    ]);
    expect(g.items[0].explanation).toContain("15");
    expect(g.items[0].question_id).toBe("fx-aq-01");
    expect(g.by_topic).toEqual([
      { section: "quantitative", topic: "arithmetic", correct: 1, total: 1 },
      { section: "quantitative", topic: "comparison", correct: 1, total: 1 },
      { section: "quantitative", topic: "fractions-percent", correct: 0, total: 1 },
      { section: "quantitative", topic: "geometry", correct: 0, total: 1 },
    ]);
  });

  it("score_percent keeps two decimals", () => {
    const parsed = parseGradeBody({ answers: [
      { key: "fx-aq-01", selected_index: 1 }, { key: "fx-aq-02", selected_index: 1 }, { key: "fx-aq-03", selected_index: 0 },
    ] }, bank);
    expect(gradeLocalAnswers(bank, parsed.value).summary.score_percent).toBe(33.33);
  });

  it("rejects malformed, oversized, duplicate and unknown input", () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ key: `k-${i}`, selected_index: 0 }));
    const cases = [
      [null, "invalid_argument", "body"], [{}, "invalid_argument", "answers"], [{ answers: [] }, "invalid_argument", "answers"],
      [{ answers: many }, "invalid_argument", "answers"], [{ answers: [], extra: 1 }, "invalid_argument", "extra"],
      [{ answers: ["fx-aq-01"] }, "invalid_argument", "answers[0]"],
      [{ answers: [{ key: "FX AQ", selected_index: 0 }] }, "invalid_argument", "answers[0].key"],
      [{ answers: [{ key: "fx-aq-01", selected_index: 0, correct_index: 0 }] }, "invalid_argument", "answers[0].correct_index"],
      [{ answers: [{ key: "fx-aq-01", selected_index: 4 }] }, "invalid_argument", "answers[0].selected_index"],
      [{ answers: [{ key: "fx-aq-01", selected_index: -1 }] }, "invalid_argument", "answers[0].selected_index"],
      [{ answers: [{ key: "fx-aq-01", selected_index: 1.5 }] }, "invalid_argument", "answers[0].selected_index"],
      [{ answers: [{ key: "fx-aq-01", selected_index: "1" }] }, "invalid_argument", "answers[0].selected_index"],
      [{ answers: [{ key: "fx-aq-99", selected_index: 0 }] }, "unknown_key", "answers[0].key"],
    ];
    for (const [body, error, field] of cases) {
      expect(parseGradeBody(body, bank), JSON.stringify(body)?.slice(0, 60)).toMatchObject({ ok: false, error, field });
    }
    expect(parseGradeBody({ answers: [{ key: "fx-aq-01", selected_index: 0 }, { key: "fx-aq-01", selected_index: 1 }] }, bank))
      .toMatchObject({ ok: false, reason: "duplicate" });
  });

  it("publicQuestion copies choices (no shared references to the bank)", () => {
    const q = publicQuestion(bank.byKey.get("fx-aq-01"), 1);
    q.choices.push("x");
    expect(bank.byKey.get("fx-aq-01").choices).toHaveLength(4);
  });
});

describe("route helpers", () => {
  const req = (headers) => new Request("https://jazira.example/api/exams/local/grade", { method: "POST", headers });

  it("same-origin check", () => {
    expect(isSameOrigin(req({}))).toBe(true);
    expect(isSameOrigin(req({ origin: "https://jazira.example" }))).toBe(true);
    expect(isSameOrigin(req({ origin: "https://evil.example" }))).toBe(false);
    expect(isSameOrigin(req({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "not a url" }))).toBe(false);
  });

  it("rate limiter", () => {
    const limited = createRateLimiter({ windowMs: 1000, max: 2 });
    expect([limited("a"), limited("a"), limited("a"), limited("b")]).toEqual([false, false, true, false]);
  });
});

describe("route handlers (real bundled bank)", () => {
  const post = async (mod, body, headers = {}) => {
    const POST = mod === "start" ? startRoute : gradeRoute;
    const res = await POST(new Request(`http://localhost/api/exams/local/${mod}`, {
      method: "POST", headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }));
    return { status: res.status, json: await res.json(), headers: res.headers };
  };

  it("start → grade round trip without leaking answers", async () => {
    const real = await loadLocalBank();
    if (!real.list.some((q) => q.exam === "aptitude" && !q.premium)) return;   // bank not bundled yet
    const s = await post("start", { exam: "aptitude", count: 25 });
    expect(s.status).toBe(200);
    expect(s.headers.get("cache-control")).toBe("no-store");
    expect(s.json).toMatchObject({ mode: "local", exam: "aptitude", limited: true, max_questions: LIMITS.guestMaxQuestions });
    expect(s.json.questions.length).toBeLessThanOrEqual(LIMITS.guestMaxQuestions);
    expect(JSON.stringify(s.json)).not.toMatch(/"answer"|explanation|correct_index/);
    expect(typeof s.json.token).toBe("string");
    const answers = s.json.questions.map((q) => ({ key: q.key, selected_index: real.byKey.get(q.key).answer }));
    const g = await post("grade", { answers, token: s.json.token });
    expect(g.status).toBe(200);
    expect(g.json.summary).toMatchObject({ correct: answers.length, total: answers.length, score_percent: 100 });
  });

  it("grades only a set /start handed out (no answer-key oracle)", async () => {
    const real = await loadLocalBank();
    const free = real.list.filter((q) => q.exam === "aptitude" && !q.premium);
    if (free.length < 12) return;                                                  // bank not bundled yet
    const s = await post("start", { exam: "aptitude", count: 5 });
    const mine = s.json.questions.map((q) => ({ key: q.key, selected_index: null }));
    // no token, a forged token, a token for another set
    expect((await post("grade", { answers: mine })).json).toEqual({ error: "invalid_token" });
    const [payload, sig] = s.json.token.split(".");
    const forged = Buffer.from(JSON.stringify({ v: 1, k: free.map((q) => q.key), e: Date.now() + 1e6 })).toString("base64url");
    expect((await post("grade", { answers: mine, token: `${forged}.${sig}` })).json).toEqual({ error: "invalid_token" });
    expect((await post("grade", { answers: mine, token: `${payload}.${sig.slice(0, -2)}AA` })).json).toEqual({ error: "invalid_token" });
    const other = free.find((q) => !mine.some((m) => m.key === q.key));
    const g = await post("grade", { answers: [...mine, { key: other.key, selected_index: null }], token: s.json.token });
    expect(g.status).toBe(400);
    expect(g.json).toMatchObject({ error: "unknown_key" });
    // a subset of the set is fine (e.g. the answered ones)
    expect((await post("grade", { answers: mine.slice(0, 2), token: s.json.token })).status).toBe(200);
  });

  it("rejects cross-site, malformed and oversized requests", async () => {
    expect((await post("start", { exam: "aptitude", count: 5 }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post("start", "{nope")).json).toEqual({ error: "invalid_json" });
    expect((await post("start", { exam: "x", count: 5 })).json).toEqual({ error: "invalid_argument", field: "exam" });
    expect((await post("grade", "x".repeat(30 * 1024))).status).toBe(413);
    expect((await post("grade", { answers: [{ key: "zz-999", selected_index: 0 }] })).json).toMatchObject({ error: "unknown_key" });
  });
});
