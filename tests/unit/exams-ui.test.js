// Exam center UI logic: bank counts, builder deep links & limits, runner
// session/reducer/keyboard/timer, autosave queue, results and analytics helpers
// (src/components/exams/*-logic.js, bank.js, autosave.js).
import { describe, it, expect, vi, afterEach } from "vitest";
import { LIMITS, PRESETS } from "@/lib/exams/catalog";
import { normalizeBankStats, summarizeQuestions, availableCount, countOf, totalOf } from "@/components/exams/bank";
import {
  maxQuestionsFor, parseBuilderParams, builderHref, presetLock, countLock, initialBuilderState, builderReducer,
  toStartConfig, estimateMinutes, clampMinutes,
} from "@/components/exams/builder-logic";
import {
  toRunnerSession, runnerReducer, summarize, answersPayload, keyAction, timerTone, mergeDrafts, twoColumnChoices, choiceDir, ltrRuns,
} from "@/components/exams/runner-logic";
import { itemStatus, reviewCounts, filterReview, scoreBand, scoreTone, ringTone, sortTopics, retryPlan, usedSeconds } from "@/components/exams/results-logic";
import {
  riyadhDay, attemptsToday, lastNDays, dailySeries, sparkline, windowDelta, sortSections, rankTopics, hasStats, topicAnalyticsLocked,
} from "@/components/exams/stats-logic";
import { createAutosave } from "@/components/exams/autosave";

// ── bank ────────────────────────────────────────────────────────────────────
describe("bank counts", () => {
  const raw = {
    total: 12, free: 10, premium: 2,
    by_exam: [{ exam: "aptitude", free: 10, premium: 2 }],
    by_section: [{ exam: "aptitude", section: "verbal", free: 4, premium: 2 }, { exam: "aptitude", section: "quantitative", free: 6, premium: 0 }],
    by_difficulty: [
      { exam: "aptitude", section: "verbal", difficulty: 1, free: 3, premium: 0 },
      { exam: "aptitude", section: "verbal", difficulty: 3, free: 1, premium: 2 },
      { exam: "aptitude", section: "quantitative", difficulty: 1, free: 6, premium: 0 },
    ],
    by_topic: [{ exam: "aptitude", section: "verbal", topic: "analogy", free: 4, premium: 2 }],
    mode: "db", available: true,
  };

  it("normalises the RPC payload", () => {
    const b = normalizeBankStats(raw);
    expect(b.source).toBe("db");
    expect(totalOf(b)).toBe(12);
    expect(b.exams.aptitude.sections.verbal.topics.analogy).toEqual({ free: 4, premium: 2 });
    expect(b.exams.aptitude.sections.verbal.difficulties[3]).toEqual({ free: 1, premium: 2 });
  });

  it("returns null when unavailable", () => {
    expect(normalizeBankStats({ mode: "local", available: false })).toBeNull();
    expect(normalizeBankStats(null)).toBeNull();
  });

  it("counts what each viewer can draw", () => {
    const b = normalizeBankStats(raw);
    expect(availableCount(b, { exam: "aptitude" })).toBe(10);
    expect(availableCount(b, { exam: "aptitude", premium: true })).toBe(12);
    expect(availableCount(b, { exam: "aptitude", section: "verbal", difficulty: 3 })).toBe(1);
    expect(availableCount(b, { exam: "aptitude", section: "verbal", difficulty: 3, premium: true })).toBe(3);
    expect(availableCount(b, { exam: "aptitude", difficulty: 1 })).toBe(9);
    expect(availableCount(b, { exam: "achievement" })).toBe(0);
    expect(availableCount(null, { exam: "aptitude" })).toBeNull();
    // one skill (0012 topic practice); topic × difficulty isn't counted, so it stays unknown
    expect(availableCount(b, { exam: "aptitude", section: "verbal", topic: "analogy" })).toBe(4);
    expect(availableCount(b, { exam: "aptitude", section: "verbal", topic: "analogy", premium: true })).toBe(6);
    expect(availableCount(b, { exam: "aptitude", section: "verbal", topic: "analogy", difficulty: 1 })).toBeNull();
    expect(availableCount(b, { exam: "aptitude", section: "verbal", topic: "sentence-completion" })).toBe(0);
  });

  it("summarises bundled questions without premium items", () => {
    const s = summarizeQuestions([
      { exam: "aptitude", section: "verbal", topic: "analogy", difficulty: 1 },
      { exam: "aptitude", section: "verbal", topic: "analogy", difficulty: 2 },
      { exam: "aptitude", section: "verbal", topic: "analogy", difficulty: 2, premium: true },
      { exam: "achievement", section: "math", topic: "algebra", difficulty: 3 },
    ]);
    expect(s.free).toBe(3);
    expect(countOf(s.exams.aptitude.sections.verbal)).toBe(2);
    expect(s.exams.aptitude.sections.verbal.difficulties[2].free).toBe(1);
    expect(availableCount(s, { exam: "achievement", difficulty: 3 })).toBe(1);
  });
});

// ── builder ─────────────────────────────────────────────────────────────────
describe("builder", () => {
  const params = (o) => new URLSearchParams(o);

  it("tier limits follow the catalog", () => {
    expect(maxQuestionsFor("guest")).toBe(LIMITS.guestMaxQuestions);
    expect(maxQuestionsFor("free")).toBe(LIMITS.freeMaxQuestions);
    expect(maxQuestionsFor("elite")).toBe(LIMITS.maxQuestions);
  });

  it("parses deep-link params and rejects foreign values", () => {
    expect(parseBuilderParams("aptitude", params({ section: "verbal", topic: "analogy", difficulty: "2", count: "15" })))
      .toEqual({ section: "verbal", topic: "analogy", difficulty: 2, count: 15 });
    expect(parseBuilderParams("aptitude", params({ section: "physics", difficulty: "9", count: "abc" })))
      .toEqual({ section: null, topic: null, difficulty: null, count: null });
    expect(parseBuilderParams("aptitude", params({ count: "500" })).count).toBe(LIMITS.maxQuestions);
    expect(parseBuilderParams("aptitude", params({ count: "1" })).count).toBe(LIMITS.minQuestions);
  });

  it("infers the section from an unambiguous topic", () => {
    expect(parseBuilderParams("achievement", params({ topic: "optics" }))).toMatchObject({ section: "physics", topic: "optics" });
    // a topic that is not in the chosen section is dropped
    expect(parseBuilderParams("achievement", params({ section: "biology", topic: "optics" }))).toMatchObject({ section: "biology", topic: null });
    // plain objects (server searchParams) work too
    expect(parseBuilderParams("aptitude", { topic: "analogy" })).toMatchObject({ section: "verbal", topic: "analogy" });
  });

  it("builds hrefs that round-trip", () => {
    const href = builderHref("achievement", { section: "math", topic: "calculus", difficulty: 3, count: 12 });
    expect(href).toBe("/exams/achievement?section=math&topic=calculus&difficulty=3&count=12#builder");
    const qs = href.split("?")[1].split("#")[0];
    expect(parseBuilderParams("achievement", new URLSearchParams(qs))).toEqual({ section: "math", topic: "calculus", difficulty: 3, count: 12 });
    expect(builderHref("aptitude")).toBe("/exams/aptitude#builder");
  });

  it("locks presets by tier", () => {
    const [quick, standard, full] = PRESETS;
    expect(presetLock(quick, "guest")).toBeNull();
    expect(presetLock(standard, "guest")).toBe("signIn");
    expect(presetLock(standard, "free")).toBeNull();
    expect(presetLock(full, "free")).toBe("elite");
    expect(presetLock(full, "elite")).toBeNull();
    expect(countLock(20, "guest")).toBe("signIn");
    expect(countLock(40, "guest")).toBe("elite");
    expect(countLock(40, "free")).toBe("elite");
    expect(countLock(25, "free")).toBeNull();
  });

  it("starts from the quick preset and applies deep-link counts", () => {
    const s = initialBuilderState("aptitude", null);
    expect(s).toMatchObject({ preset: "quick", count: 10, timeMode: "preset", minutes: 10, section: null });
    expect(initialBuilderState("aptitude", params({ count: "25" }))).toMatchObject({ preset: "standard", count: 25 });
    expect(initialBuilderState("aptitude", params({ count: "12" }))).toMatchObject({ preset: "custom", count: 12, timeMode: "auto" });
  });

  it("reduces builder changes and clamps to the tier", () => {
    let s = initialBuilderState("aptitude", params({ section: "verbal", topic: "analogy" }));
    s = builderReducer(s, { type: "section", value: "quantitative" });
    expect(s.topic).toBeNull();
    s = builderReducer(s, { type: "count", value: 40, tier: "free" });
    expect(s).toMatchObject({ preset: "custom", count: 25, timeMode: "auto" });
    s = builderReducer(s, { type: "minutes", value: 999 });
    expect(s).toMatchObject({ timeMode: "custom", minutes: LIMITS.maxMinutes });
    s = builderReducer(s, { type: "preset", value: "full" });
    expect(s).toMatchObject({ preset: "full", count: 50, minutes: 55, timeMode: "preset" });
    s = builderReducer(s, { type: "tier", value: "free" });
    expect(s).toMatchObject({ preset: "quick", count: 10 });
    s = builderReducer(builderReducer(s, { type: "count", value: 30, tier: "elite" }), { type: "tier", value: "guest" });
    expect(s.count).toBe(LIMITS.guestMaxQuestions);
  });

  it("produces the startExam() config", () => {
    const s = initialBuilderState("achievement", params({ section: "physics", difficulty: "2" }));
    expect(toStartConfig(s)).toEqual({ exam: "achievement", section: "physics", topic: null, difficulty: 2, count: 10, timeLimitSeconds: 600 });
    // a deep-linked skill is sent to startExam (topic practice, 0012) and can be cleared
    const withTopic = initialBuilderState("achievement", params({ section: "physics", topic: "optics" }));
    expect(toStartConfig(withTopic)).toMatchObject({ section: "physics", topic: "optics" });
    expect(toStartConfig(builderReducer(withTopic, { type: "topic", value: null })).topic).toBeNull();
    expect(builderReducer(withTopic, { type: "topic", value: "algebra" }).topic).toBeNull(); // not a physics skill
    const auto = builderReducer(s, { type: "timeMode", value: "auto" });
    expect(toStartConfig(auto).timeLimitSeconds).toBeNull();
    expect(estimateMinutes(25)).toBe(25);
    expect(clampMinutes(0)).toBe(LIMITS.minMinutes);
  });
});

// ── runner ──────────────────────────────────────────────────────────────────
const q = (position, extra = {}) => ({ position, id: `q${position}`, stem: "…", passage: null, choices: ["a", "b", "c", "d"], section: "verbal", topic: "analogy", difficulty: 1, time_limit_seconds: 60, ...extra });

describe("runner session", () => {
  it("anchors the deadline to the server clock (start payload)", () => {
    const s = toRunnerSession({
      mode: "db", attempt_id: "A", exam: "aptitude", section: null, difficulty: null, time_limit_seconds: 600,
      started_at: "2026-09-25T10:00:00Z", server_now: "2026-09-25T10:00:05Z", expires_at: "2026-09-25T10:10:00Z",
      questions: [q(2), q(1)],
    }, { now: 1000 });
    expect(s.deadline).toBe(1000 + 595000);
    expect(s.questions.map((x) => x.position)).toEqual([1, 2]);
    expect(s.current).toBe(1);
    expect(s.mode).toBe("db");
  });

  it("resumes with saved answers and seconds_remaining", () => {
    const s = toRunnerSession({
      mode: "local", status: "in_progress", attempt: { id: "local-1", exam: "aptitude", section: "verbal", time_limit_seconds: 300 },
      questions: [q(1), q(2), q(3)],
      answers: [{ position: 1, selected_index: 2, flagged: false, time_spent_seconds: 30 }, { position: 2, selected_index: null, flagged: true, time_spent_seconds: 4 }],
      seconds_remaining: 120,
    }, { now: 0 });
    expect(s.deadline).toBe(120000);
    expect(s.answers[1]).toEqual({ selected: 2, flagged: false });
    expect(s.answers[2]).toEqual({ selected: null, flagged: true });
    expect(s.spent[1]).toBe(30);
    expect(s.current).toBe(2); // first unanswered
    expect(s.section).toBe("verbal");
    expect(s.topic).toBeNull();
    expect(toRunnerSession({ mode: "db", attempt_id: "T", exam: "aptitude", section: "verbal", topic: "analogy", questions: [q(1)], seconds_remaining: 60 }).topic).toBe("analogy");
  });

  it("rejects unusable payloads", () => {
    expect(toRunnerSession(null)).toBeNull();
    expect(toRunnerSession({ attempt_id: "x", questions: [] })).toBeNull();
  });

  it("reduces answers, flags and navigation", () => {
    let st = { answers: { 1: { selected: null, flagged: false }, 2: { selected: null, flagged: false } }, current: 1, positions: [1, 2] };
    st = runnerReducer(st, { type: "select", position: 1, index: 3 });
    expect(st.answers[1].selected).toBe(3);
    expect(runnerReducer(st, { type: "select", position: 1, index: 3 })).toBe(st); // no-op keeps identity
    st = runnerReducer(st, { type: "flag", position: 2 });
    expect(st.answers[2].flagged).toBe(true);
    st = runnerReducer(st, { type: "next" });
    expect(st.current).toBe(2);
    expect(runnerReducer(st, { type: "next" })).toBe(st);
    st = runnerReducer(st, { type: "prev" });
    expect(st.current).toBe(1);
    st = runnerReducer(st, { type: "clear", position: 1 });
    expect(st.answers[1].selected).toBeNull();
    expect(runnerReducer(st, { type: "goto", position: 9 })).toBe(st);
  });

  it("summarises and builds the submit payload", () => {
    const answers = { 1: { selected: 0, flagged: false }, 2: { selected: null, flagged: true }, 3: { selected: 1, flagged: true } };
    expect(summarize(answers, [1, 2, 3])).toEqual({ total: 3, answered: 2, unanswered: 1, flagged: 2, firstUnanswered: 2, firstFlagged: 2 });
    expect(answersPayload([1, 2], answers, { 1: 12.4 })).toEqual([
      { position: 1, selected_index: 0, time_spent_seconds: 12, flagged: false },
      { position: 2, selected_index: null, time_spent_seconds: 0, flagged: true },
    ]);
  });

  it("maps keyboard shortcuts in both reading directions", () => {
    expect(keyAction({ key: "2", code: "Digit2" })).toEqual({ type: "choose", index: 1 });
    expect(keyAction({ key: "٣", code: "Digit3" })).toEqual({ type: "choose", index: 2 });
    expect(keyAction({ key: "5", code: "Digit5" }, { choices: 4 })).toBeNull();
    expect(keyAction({ key: "ب", code: "KeyF" })).toEqual({ type: "flag" });
    expect(keyAction({ key: "ArrowLeft" }, { rtl: true })).toEqual({ type: "next" });
    expect(keyAction({ key: "ArrowLeft" }, { rtl: false })).toEqual({ type: "prev" });
    expect(keyAction({ key: "ArrowRight" }, { rtl: true })).toEqual({ type: "prev" });
    expect(keyAction({ key: "1", code: "Digit1", ctrlKey: true })).toBeNull();
  });

  it("colours the countdown", () => {
    expect(timerTone(3000, 3600)).toBe("normal");
    expect(timerTone(700, 3600)).toBe("normal");
    expect(timerTone(600, 3600)).toBe("warning");
    expect(timerTone(119, 300)).toBe("warning");
    expect(timerTone(121, 300)).toBe("normal");
    expect(timerTone(60, 3600)).toBe("danger");
    expect(timerTone(0, 600)).toBe("danger");
  });

  it("merges offline drafts over server answers", () => {
    const { answers, spent, dirty } = mergeDrafts(
      { 1: { selected: null, flagged: false }, 2: { selected: 1, flagged: false } },
      { 2: 40 },
      { 1: { selected: 3, flagged: true, spent: 22 }, 2: { selected: null, spent: 10 }, 9: { selected: 0 } },
    );
    expect(answers[1]).toEqual({ selected: 3, flagged: true });
    expect(answers[2]).toEqual({ selected: null, flagged: false });
    expect(spent).toEqual({ 1: 22, 2: 40 });
    expect(dirty).toEqual([1, 2]);
  });

  it("lays out short choices in two columns", () => {
    expect(twoColumnChoices(["20", "24", "28", "32"])).toBe(true);
    expect(twoColumnChoices(["a", "b", "c"])).toBe(false);
    expect(twoColumnChoices(["مكانة النخلة في حياة الإنسان قديمًا وحديثًا", "b", "c", "d"])).toBe(false);
  });

  it("keeps math-only options left-to-right inside the Arabic list", () => {
    for (const c of ["−1", "−4/5", "{5, −2}", "√2/2", "30°", "47.5%", "12"]) expect(choiceDir(c)).toBe("ltr");
    for (const c of ["2 : 5", "12 : 15", "−i", "i", "مطر : سحاب", "3 سم", "2، 4"]) expect(choiceDir(c)).toBe("auto");
    expect(choiceDir(null)).toBe("ltr");
  });

  it("isolates Latin-script math inside Arabic text", () => {
    const ltr = (text) => ltrRuns(text).filter((p) => p.ltr).map((p) => p.text);
    expect(ltr("ما مجموعة حل المعادلة |2x − 3| = 7؟")).toEqual(["|2x − 3| = 7"]);
    expect(ltr("عدد الكروموسومات 2n = 24، تنقسم خلية.")).toEqual(["2n = 24"]);
    expect(ltr("حيث i الوحدة التخيلية (i² = −1)؟")).toEqual(["i", "(i² = −1)"]);
    expect(ltr("أليل الساق (T) سائد على (t).")).toEqual(["(T)", "(t)"]);
    // sets, roots, degrees and negative numbers are LTR notation too
    expect(ltr("فمجموعة الحل {5, −2}.")).toEqual(["{5, −2}"]);
    expect(ltr("الناتج = −7 تقريبًا")).toEqual(["−7"]);
    expect(ltr("قياس الزاوية 30° تمامًا")).toEqual(["30°"]);
    // digits-only arithmetic, ratios and sequences keep the text direction
    expect(ltr("ما ناتج 48 ÷ 4 + 3 × 5؟")).toEqual([]);
    expect(ltr("المدى = أكبر قيمة − أصغر قيمة = 23 − 6 = 17.")).toEqual([]);
    expect(ltr("النسبة 2 : 3، والنسبة 4 : 5.")).toEqual([]);
    expect(ltr("ما الحد التالي: 2، 4، 8، 16؟")).toEqual([]);
    // nothing is lost or reordered
    const s = "المدى = أكبر قيمة − أصغر قيمة، و x = 3.\nسطر ثانٍ";
    expect(ltrRuns(s).map((p) => p.text).join("")).toBe(s);
    expect(ltrRuns("")).toEqual([]);
  });
});

// ── autosave ────────────────────────────────────────────────────────────────
describe("autosave queue", () => {
  afterEach(() => vi.useRealTimers());

  it("debounces and sends the latest payload once", async () => {
    vi.useFakeTimers();
    const sent = [];
    let value = 0;
    const q2 = createAutosave({ save: async (p, payload) => sent.push([p, payload]), getPayload: () => value, delay: 500, isOnline: () => true });
    value = 1;
    q2.queue(1);
    value = 2;
    q2.queue(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([[1, 2]]);
    expect(q2.status()).toBe("saved");
  });

  it("retries with backoff after a network error", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const statuses = [];
    const saved = [];
    const q2 = createAutosave({
      save: async () => {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error("network"), { code: "network" });
      },
      getPayload: () => null,
      delay: 100,
      isOnline: () => true,
      onStatus: (s) => statuses.push(s),
      onSaved: (p) => saved.push(p),
    });
    q2.queue(3);
    await vi.advanceTimersByTimeAsync(100);
    expect(q2.status()).toBe("offline");
    expect(q2.pending()).toEqual([3]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(2);
    expect(saved).toEqual([3]);
    expect(statuses).toEqual(["pending", "saving", "offline", "saving", "saved"]);
  });

  it("waits while offline and flushes when back online", async () => {
    vi.useFakeTimers();
    let online = false;
    const sent = [];
    const q2 = createAutosave({ save: async (p) => sent.push(p), getPayload: () => null, delay: 50, isOnline: () => online });
    q2.queue(1);
    q2.queue(2);
    await vi.advanceTimersByTimeAsync(60);
    expect(q2.status()).toBe("offline");
    expect(sent).toEqual([]);
    online = true;
    q2.online();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([1, 2]);
  });

  it("stops when the attempt is closed and drops invalid input", async () => {
    vi.useFakeTimers();
    const closed = vi.fn();
    const q2 = createAutosave({
      save: async (p) => {
        if (p === 1) throw Object.assign(new Error("x"), { code: "invalid_argument" });
        throw Object.assign(new Error("x"), { code: "attempt_closed" });
      },
      getPayload: () => null,
      delay: 10,
      isOnline: () => true,
      onClosed: closed,
    });
    q2.queue(1);
    q2.queue(2);
    await vi.advanceTimersByTimeAsync(20);
    expect(closed).toHaveBeenCalledWith("attempt_closed");
    q2.queue(3);
    await vi.advanceTimersByTimeAsync(50);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("drain() sends every pending answer on unmount, even after cancel()", async () => {
    vi.useFakeTimers();
    const sent = [];
    const q2 = createAutosave({
      save: (p) => new Promise((resolve) => setTimeout(() => resolve(sent.push(p)), 20)),
      getPayload: (p) => ({ p }),
      delay: 700,
      isOnline: () => true,
    });
    q2.queue(1);
    q2.queue(2);
    q2.queue(3);
    q2.drain(); // runner cleanup: drain, then cancel
    q2.cancel();
    await vi.advanceTimersByTimeAsync(100);
    expect(sent.sort()).toEqual([1, 2, 3]);
    expect(q2.pending()).toEqual([]);
  });

  it("drain() waits for the save in flight and never sends a position twice", async () => {
    vi.useFakeTimers();
    const sent = [];
    const q2 = createAutosave({
      save: (p) => new Promise((resolve) => setTimeout(() => resolve(sent.push(p)), 20)),
      getPayload: (p) => ({ p }),
      delay: 10,
      isOnline: () => true,
    });
    q2.queue(1);
    q2.queue(2);
    q2.queue(3);
    await vi.advanceTimersByTimeAsync(11); // the sequential flush has sent 1
    q2.drain(); // "Leave": the loop is still running
    await vi.advanceTimersByTimeAsync(200);
    expect(sent.sort()).toEqual([1, 2, 3]);
  });

  it("drain() keeps failed answers pending", async () => {
    vi.useFakeTimers();
    const q2 = createAutosave({
      save: async (p) => {
        if (p === 2) throw Object.assign(new Error("x"), { code: "network" });
      },
      getPayload: () => null,
      isOnline: () => true,
    });
    q2.queue(1);
    q2.queue(2);
    await q2.drain();
    expect(q2.pending()).toEqual([2]);
  });

  it("hands the saved payload to onSaved (drafts keep newer answers)", async () => {
    vi.useFakeTimers();
    let value = "a";
    const seen = [];
    const q2 = createAutosave({
      save: () => new Promise((resolve) => setTimeout(resolve, 20)),
      getPayload: () => ({ selected: value }),
      delay: 10,
      isOnline: () => true,
      onSaved: (p, payload) => seen.push([p, payload.selected]),
    });
    q2.queue(5);
    await vi.advanceTimersByTimeAsync(15); // "a" in flight
    value = "b";
    q2.queue(5);
    await vi.advanceTimersByTimeAsync(100);
    expect(seen).toEqual([[5, "a"], [5, "b"]]);
  });
});

// ── results ─────────────────────────────────────────────────────────────────
describe("results", () => {
  const items = [
    { position: 1, selected_index: 1, is_correct: true, section: "verbal", topic: "analogy", flagged: false },
    { position: 2, selected_index: 0, is_correct: false, section: "verbal", topic: "analogy", flagged: true },
    { position: 3, selected_index: null, is_correct: false, section: "verbal", topic: "odd-word-out", flagged: false },
    { position: 4, selected_index: 2, is_correct: false, section: "quantitative", topic: "algebra", flagged: false },
  ];

  it("classifies and filters review items", () => {
    expect(items.map(itemStatus)).toEqual(["correct", "incorrect", "unanswered", "incorrect"]);
    expect(reviewCounts(items)).toEqual({ all: 4, correct: 1, incorrect: 2, unanswered: 1, flagged: 1 });
    expect(filterReview(items, "incorrect").map((i) => i.position)).toEqual([2, 4]);
    expect(filterReview(items, "unanswered").map((i) => i.position)).toEqual([3]);
    expect(filterReview(items, "flagged").map((i) => i.position)).toEqual([2]);
    expect(filterReview(items, "all")).toHaveLength(4);
  });

  it("bands scores and accuracy", () => {
    expect([90, 70, 45, 10].map(scoreBand)).toEqual(["excellent", "good", "fair", "low"]);
    // one colour scale for scores and accuracy everywhere (dashboard, history, results)
    expect([80, 75, 74.9, 60, 50, 49.9, 20, null, "", "x"].map(scoreTone)).toEqual(["green", "green", "gold", "gold", "gold", "danger", "danger", "neutral", "neutral", "neutral"]);
    expect([90, 70, 10].map(ringTone)).toEqual(["green", "gold", "gold"]);
  });

  it("sorts topics weakest first", () => {
    const rows = sortTopics([
      { section: "verbal", topic: "analogy", correct: 2, total: 2 },
      { section: "verbal", topic: "odd-word-out", correct: 0, total: 1 },
      { section: "quantitative", topic: "algebra", correct: 1, total: 3 },
    ]);
    expect(rows.map((r) => r.topic)).toEqual(["odd-word-out", "algebra", "analogy"]);
    expect(rows[1].accuracy).toBe(33.3);
  });

  it("plans a retry of the weakest area", () => {
    expect(retryPlan({ attempt: { exam: "aptitude" }, items })).toEqual({ exam: "aptitude", section: "verbal", topic: null, count: LIMITS.minQuestions });
    const oneTopic = retryPlan({ attempt: { exam: "aptitude" }, items: items.slice(0, 2) });
    expect(oneTopic).toMatchObject({ section: "verbal", topic: "analogy" });
    const tie = retryPlan({ attempt: { exam: "aptitude" }, items: [items[1], items[3]] });
    expect(tie).toMatchObject({ section: null, topic: null });
    expect(retryPlan({ attempt: { exam: "aptitude" }, items: [items[0]] })).toBeNull();
  });

  it("caps the used time at the limit", () => {
    expect(usedSeconds({ duration_seconds: 700, time_limit_seconds: 600 })).toBe(600);
    expect(usedSeconds({ duration_seconds: 42, time_limit_seconds: 600 })).toBe(42);
    expect(usedSeconds({})).toBeNull();
  });
});

// ── analytics ───────────────────────────────────────────────────────────────
describe("analytics", () => {
  it("uses the Riyadh calendar day", () => {
    expect(riyadhDay("2026-09-24T21:30:00Z")).toBe("2026-09-25"); // 00:30 in Riyadh
    expect(riyadhDay("2026-09-24T20:30:00Z")).toBe("2026-09-24");
    expect(riyadhDay("nope")).toBeNull();
  });

  it("counts today's attempts for the free daily limit", () => {
    const now = Date.parse("2026-09-25T12:00:00Z");
    const items = [{ started_at: "2026-09-25T08:00:00Z" }, { started_at: "2026-09-24T21:10:00Z" }, { started_at: "2026-09-24T20:00:00Z" }];
    expect(attemptsToday(items, now)).toBe(2);
  });

  it("builds a gap-aware daily series", () => {
    expect(lastNDays(3, "2026-03-01")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
    const s = dailySeries([{ day: "2026-09-24", attempts: 1, total: 10, correct: 7, accuracy: 70 }, { day: "2026-09-22", attempts: 1, total: 4, correct: 1 }], 4, "2026-09-25");
    expect(s.map((d) => d.accuracy)).toEqual([25, null, 70, null]);
    expect(s[2].attempts).toBe(1);
    expect(s.map((d) => d.index)).toEqual([0, 1, 2, 3]);
  });

  it("locks topic analytics as the database says (0012), else by plan", () => {
    expect(topicAnalyticsLocked({ premium: false, locked: ["by_topic", "best_topics", "weakest_topics"] }, true)).toBe(true);
    expect(topicAnalyticsLocked({ premium: true, locked: [] }, false)).toBe(false);
    // pre-0012 database: no premium / locked keys → the member's plan decides
    expect(topicAnalyticsLocked({ locked: [] }, false)).toBe(true);
    expect(topicAnalyticsLocked({ locked: [] }, true)).toBe(false);
    expect(topicAnalyticsLocked(null, false)).toBe(true);
  });

  it("draws sparkline segments, areas and dots", () => {
    const g = sparkline([0, 100, null, 50], { width: 100, height: 50, pad: 0 });
    expect(g.segments).toEqual(["M0 50 L33.33 0"]);
    expect(g.dots).toEqual([{ x: 100, y: 25, v: 50, i: 3 }]);
    expect(g.area).toHaveLength(1);
    expect(g.points).toHaveLength(3);
    expect(sparkline([null, null]).points).toEqual([]);
    const joined = sparkline([0, null, 100], { width: 100, height: 50, pad: 0, connectGaps: true });
    expect(joined.segments).toEqual(["M0 50 L100 0"]);
    expect(joined.dots).toEqual([]);
    // scale positions on the same grid (dashboard labels)
    const grid = sparkline([], { width: 320, height: 96, pad: 8 });
    expect([grid.topY, grid.midY, grid.baseY, grid.yAt(25)]).toEqual([8, 48, 88, 68]);
  });

  it("computes window deltas", () => {
    expect(windowDelta({ accuracy: 68.3 }, { accuracy: 60 })).toEqual({ value: 8.3, direction: "up" });
    expect(windowDelta({ accuracy: 50 }, { accuracy: 55.56 })).toEqual({ value: -5.6, direction: "down" });
    expect(windowDelta({ accuracy: 50 }, { accuracy: null })).toBeNull();
  });

  it("orders sections by the catalog and topics by volume", () => {
    expect(sortSections([{ section: "biology" }, { section: "verbal" }, { section: "quantitative" }]).map((r) => r.section)).toEqual(["quantitative", "verbal", "biology"]);
    expect(rankTopics([{ topic: "b", total: 2 }, { topic: "a", total: 5 }, { topic: "c", total: 2 }]).map((r) => r.topic)).toEqual(["a", "b", "c"]);
    expect(hasStats({ completed_attempts: 0 })).toBe(false);
    expect(hasStats({ completed_attempts: 3 })).toBe(true);
  });
});
