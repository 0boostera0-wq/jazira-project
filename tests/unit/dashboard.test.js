import { describe, it, expect, beforeEach } from "vitest";
import {
  greetingPeriod, firstName, practiceHref, attemptHref, findResumable, lastGraded, minutesLeft,
  attemptRow, splitTopics, normalizeStats, tipIndex, notificationHref,
  onboardingSteps, resumeSummary, minutesFromCountdown, streakStatus, isolate, TREND_DAYS,
} from "@/components/dashboard/model";
// The dashboard uses the exams helpers for days, series, sparkline and score colours (one implementation).
import { attemptsToday, dailySeries, sparkline } from "@/components/exams/stats-logic";
import { scoreTone } from "@/components/exams/results-logic";
import { notificationHref as centerHref } from "@/components/notifications/model";
import { parseBuilderParams } from "@/components/exams/builder-logic";
import { parseLastVisit, serializeLastVisit } from "@/components/dashboard/lastVisit";
import {
  loadProgress, loadOnboardingSignals, loadSubscription, recordActivityOnce, resetActivityCache, errorCode,
} from "@/components/dashboard/data";

const TODAY = "2026-09-25";

describe("dashboard: greeting", () => {
  it("maps hours to periods", () => {
    expect(greetingPeriod(4)).toBe("night");
    expect(greetingPeriod(5)).toBe("morning");
    expect(greetingPeriod(11)).toBe("morning");
    expect(greetingPeriod(12)).toBe("afternoon");
    expect(greetingPeriod(16)).toBe("afternoon");
    expect(greetingPeriod(17)).toBe("evening");
    expect(greetingPeriod(21)).toBe("evening");
    expect(greetingPeriod(22)).toBe("night");
    expect(greetingPeriod(-1)).toBe("night");
    expect(greetingPeriod("x")).toBe("night");
  });
  it("uses the first word of the display name", () => {
    expect(firstName("سارة العتيبي")).toBe("سارة");
    expect(firstName("  Omar   Haddad ")).toBe("Omar");
    expect(firstName("")).toBe("");
    expect(firstName(null)).toBe("");
  });
});

describe("dashboard: links", () => {
  it("builds exam builder deep links from catalog slugs only", () => {
    expect(practiceHref({ section: "quantitative", topic: "algebra" })).toBe("/exams/aptitude?section=quantitative&topic=algebra#builder");
    expect(practiceHref({ exam: "achievement", section: "physics" })).toBe("/exams/achievement?section=physics#builder");
    expect(practiceHref({ exam: "aptitude", section: "physics" })).toBe("/exams/aptitude#builder"); // mismatched section dropped
    expect(practiceHref({ section: "verbal", topic: "algebra" })).toBe("/exams/aptitude?section=verbal#builder"); // topic not in section
    expect(practiceHref({ exam: "evil", section: "nope" })).toBe("/exams");
    expect(practiceHref()).toBe("/exams");
  });
  it("produces links the exam builder parses back to the same selection", () => {
    const href = practiceHref({ section: "math", topic: "algebra" });
    const [path, rest] = href.split("?");
    expect(path).toBe("/exams/achievement");
    const params = new URLSearchParams(rest.split("#")[0]);
    expect(parseBuilderParams("achievement", params)).toMatchObject({ section: "math", topic: "algebra" });
  });
  it("encodes attempt ids", () => {
    expect(attemptHref("abc/../x")).toBe("/exams/attempt/abc%2F..%2Fx");
  });
});

describe("dashboard: attempts", () => {
  const now = Date.parse("2026-09-25T10:00:00Z");
  const items = [
    { id: "a", status: "in_progress", started_at: "2026-09-25T09:55:00Z", expires_at: "2026-09-25T09:59:00Z" }, // overdue
    { id: "b", status: "in_progress", started_at: "2026-09-25T09:50:00Z", expires_at: "2026-09-25T10:07:30Z" },
    { id: "c", status: "submitted", started_at: "2026-09-24T20:30:00Z", score_percent: 70 }, // 23:30 Riyadh on the 24th
    { id: "d", status: "expired", started_at: "2026-09-24T21:30:00Z", score_percent: 30 }, // 00:30 Riyadh on the 25th
  ];
  it("finds the newest resumable attempt and skips overdue ones", () => {
    expect(findResumable(items, now)?.id).toBe("b");
    expect(findResumable([], now)).toBeNull();
    expect(findResumable(null, now)).toBeNull();
  });
  it("finds the newest graded attempt", () => {
    expect(lastGraded(items)?.id).toBe("c");
    expect(lastGraded([{ status: "in_progress" }])).toBeNull();
  });
  it("rounds minutes left up and never goes negative", () => {
    expect(minutesLeft(items[1], now)).toBe(8);
    expect(minutesLeft(items[0], now)).toBe(0);
    expect(minutesLeft({}, now)).toBeNull();
  });
  it("summarises a resumable attempt from get_exam_attempt", () => {
    const running = {
      status: "in_progress", seconds_remaining: 437.8,
      attempt: { id: "b", question_count: 10 },
      answers: [{ position: 1, selected_index: 2 }, { position: 2, selected_index: null }, { position: 3, selected_index: 0 }, null],
    };
    expect(resumeSummary(running, "b")).toEqual({ id: "b", closed: false, answered: 2, total: 10, secondsLeft: 437 });
    expect(resumeSummary({ status: "expired", attempt: {} }, "b")).toEqual({ id: "b", closed: true });
    expect(resumeSummary({ status: "in_progress", questions: [{}, {}], answers: [{ selected_index: 1 }], seconds_remaining: -5 }, "c"))
      .toEqual({ id: "c", closed: false, answered: 1, total: 2, secondsLeft: 0 });
    expect(resumeSummary(null, "x")).toBeNull();
    expect(resumeSummary([], "x")).toBeNull();
  });
  it("counts down from the server's seconds_remaining", () => {
    const readAt = Date.parse("2026-09-25T10:00:00Z");
    expect(minutesFromCountdown(600, readAt, readAt)).toBe(10);
    expect(minutesFromCountdown(600, readAt, readAt + 61000)).toBe(9); // 8:59 left → 9 min
    expect(minutesFromCountdown(30, readAt, readAt + 120000)).toBe(0);
    expect(minutesFromCountdown(null, readAt, readAt)).toBeNull();
    expect(minutesFromCountdown(60, NaN, readAt)).toBeNull();
  });
  it("counts attempts started on the Saudi day", () => {
    expect(attemptsToday(items, now)).toBe(3);
    expect(attemptsToday(items, TODAY)).toBe(3);
    expect(attemptsToday(items, "2026-09-24")).toBe(1);
    expect(attemptsToday(null, now)).toBe(0);
  });
  it("bands scores on the app-wide scale (≥75 green, ≥50 gold, else danger)", () => {
    expect(scoreTone(92)).toBe("green");
    expect(scoreTone(75)).toBe("green");
    expect(scoreTone(74.9)).toBe("gold");
    expect(scoreTone(50)).toBe("gold");
    expect(scoreTone(49.9)).toBe("danger");
    expect(scoreTone(null)).toBe("neutral");
  });
  it("normalises list rows", () => {
    expect(attemptRow({ id: "x", exam: "aptitude", section: "verbal", status: "submitted", question_count: 10, score_percent: "60", correct_count: 6, total: 10, submitted_at: "t" }))
      .toMatchObject({ id: "x", exam: "aptitude", section: "verbal", questions: 10, score: 60, correct: 6, total: 10, at: "t" });
    const open = attemptRow({ id: "y", section: "physics", status: "in_progress", question_count: 5, score_percent: 0, started_at: "s" });
    expect(open).toMatchObject({ exam: "achievement", score: null, at: "s" });
    expect(attemptRow({ id: "z", section: "bogus" }).section).toBeNull();
  });
});

describe("dashboard: stats", () => {
  const topic = (t, a, s = "verbal") => ({ section: s, topic: t, total: 5, correct: 3, accuracy: a });

  it("splits strongest / focus topics without overlap", () => {
    expect(splitTopics([], [])).toEqual({ strongest: [], focus: [] });
    expect(splitTopics([topic("analogy", 90)], [topic("analogy", 90)])).toMatchObject({ strongest: [{ topic: "analogy" }], focus: [] });
    expect(splitTopics([topic("analogy", 40)], [topic("analogy", 40)])).toMatchObject({ strongest: [], focus: [{ topic: "analogy" }] });
    const two = splitTopics([topic("a", 90), topic("b", 50)], [topic("b", 50), topic("a", 90)]);
    expect(two.strongest.map((x) => x.topic)).toEqual(["a"]);
    expect(two.focus.map((x) => x.topic)).toEqual(["b"]);
    const six = splitTopics([topic("a", 95), topic("b", 90), topic("c", 80)], [topic("f", 20), topic("e", 30), topic("d", 40)]);
    expect(six.strongest.map((x) => x.topic)).toEqual(["a", "b", "c"]);
    expect(six.focus.map((x) => x.topic)).toEqual(["f", "e", "d"]); // weakest first
    const five = splitTopics([topic("a", 95), topic("b", 90), topic("c", 80)], [topic("e", 30), topic("d", 40), topic("c", 80)]);
    expect(five.strongest.map((x) => x.topic)).toEqual(["a", "b", "c"]);
    expect(five.focus.map((x) => x.topic)).toEqual(["e", "d"]);
    // same topic slug in two sections are different topics
    expect(splitTopics([topic("algebra", 80, "quantitative"), topic("algebra", 60, "math")], []).strongest).toHaveLength(1);
    // junk rows ignored
    expect(splitTopics([null, { topic: "x" }, { section: "s", topic: "t", accuracy: null }], "nope")).toEqual({ strongest: [], focus: [] });
  });

  it("builds a 30-day series ending today", () => {
    const s = dailySeries([
      { day: "2026-09-25", attempts: 1, accuracy: 70 },
      { day: "2026-08-27", attempts: 2, accuracy: 55 }, // 29 days ago = first cell
      { day: "2026-08-26", attempts: 1, accuracy: 99 }, // outside the window
      { day: "bad", attempts: 1, accuracy: 10 },
      { day: "2026-09-20", attempts: 0, accuracy: 10 },
      { day: "2026-09-21", attempts: 1, accuracy: 140 },
    ], TREND_DAYS, TODAY);
    expect(s).toHaveLength(TREND_DAYS);
    expect(s[0]).toMatchObject({ day: "2026-08-27", accuracy: 55, index: 0 });
    expect(s[29]).toMatchObject({ day: TODAY, accuracy: 70, index: 29 });
    expect(s.find((d) => d.day === "2026-09-20").accuracy).toBeNull();
    expect(s.find((d) => d.day === "2026-09-21").accuracy).toBe(100);
    expect(s.filter((d) => d.accuracy !== null)).toHaveLength(3);
  });

  it("normalises get_exam_stats() and computes the weekly delta", () => {
    expect(normalizeStats(null)).toBeNull();
    expect(normalizeStats([])).toBeNull();
    const fresh = normalizeStats({ completed_attempts: 0, totals: { attempts: 0, accuracy: null }, by_section: [], trend: { windows: {}, daily: [] }, best_topics: [], weakest_topics: [] }, TODAY);
    expect(fresh).toMatchObject({ completed: 0, totals: { accuracy: null, averageScore: null }, trend: { delta: null, last7: null }, sections: [], strongest: [], focus: [] });
    expect(fresh.daily).toHaveLength(TREND_DAYS);
    const s = normalizeStats({
      completed_attempts: 12, in_progress: 1,
      totals: { questions: 180, answered: 171, correct: 121, accuracy: 67.2, average_score: 66.1, best_score: 92 },
      by_section: [{ exam: "aptitude", section: "verbal", total: 60, correct: 44, accuracy: 73.3 }, { section: "bogus", total: 3 }, { exam: "achievement", section: "math", total: 0 }],
      trend: { windows: { last_7: { attempts: 4, accuracy: 68.3 }, prev_7: { attempts: 3, accuracy: 61.2 } }, daily: [] },
    }, TODAY);
    expect(s.completed).toBe(12);
    expect(s.inProgress).toBe(1);
    expect(s.totals).toMatchObject({ questions: 180, answered: 171, accuracy: 67.2, averageScore: 66.1, bestScore: 92 });
    expect(s.trend.delta).toBe(7.1);
    expect(s.sections).toEqual([{ exam: "aptitude", section: "verbal", total: 60, correct: 44, accuracy: 73.3 }]);
    // pre-0012 payload: no plan information
    expect(s).toMatchObject({ premium: null, locked: [] });
    // 0012: a free member's topic analytics are withheld and listed in `locked`
    const free = normalizeStats({ completed_attempts: 2, best_topics: [], weakest_topics: [], premium: false, locked: ["by_topic", "best_topics", "weakest_topics"] }, TODAY);
    expect(free).toMatchObject({ premium: false, locked: ["by_topic", "best_topics", "weakest_topics"], strongest: [], focus: [] });
  });

  it("computes the card's sparkline geometry in viewBox units (shared exams sparkline)", () => {
    const series = dailySeries([{ day: TODAY, attempts: 1, accuracy: 100 }, { day: "2026-08-27", attempts: 1, accuracy: 0 }], TREND_DAYS, TODAY);
    const size = { width: 320, height: 96, pad: 8, connectGaps: true };
    const g = sparkline(series.map((d) => d.accuracy), size);
    expect(g.points).toHaveLength(2);
    expect(g.points[0]).toMatchObject({ x: 8, y: 88 }); // oldest, 0 %
    expect(g.points[1]).toMatchObject({ x: 312, y: 8 }); // today, 100 %
    expect(g.segments).toEqual(["M8 88 L312 8"]);
    expect(g.area[0]).toMatch(/Z$/);
    const one = sparkline(dailySeries([{ day: TODAY, attempts: 1, accuracy: 50 }], TREND_DAYS, TODAY).map((d) => d.accuracy), size);
    expect(one.points).toHaveLength(1);
    expect(one.area).toEqual([]);
    expect(sparkline([], size).points).toEqual([]);
  });
});

describe("dashboard: daily tip", () => {
  it("is stable within a day, in range, and rotates daily", () => {
    const a = tipIndex(TODAY, 12);
    expect(a).toBe(tipIndex(TODAY, 12));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(12);
    expect(tipIndex("2026-09-26", 12)).toBe((a + 1) % 12);
    expect(tipIndex(TODAY, 0)).toBe(0);
    expect(tipIndex("garbage", 12)).toBe(0);
  });
});

describe("dashboard: notifications", () => {
  const uuid = "22222222-2222-4222-8222-222222222222";
  it("opens the same target as the notifications page, else the full list", () => {
    const rows = [
      { type: "exam_result", data: { attempt_id: uuid } },
      { type: "comment", post_id: uuid },
      { type: "message", conversation_id: uuid },
      { type: "follow", actor: { username: "sara_1", anonymous: false } },
      { type: "achievement" },
    ];
    for (const n of rows) expect(notificationHref(n)).toBe(centerHref(n));
    expect(notificationHref({ type: "exam_result", data: { attempt_id: uuid } })).toBe(`/exams/attempt/${uuid}`);
    expect(notificationHref({ type: "comment", post_id: uuid })).toBe(`/community/post/${uuid}`);
    expect(notificationHref({ type: "follow", actor: { username: "sara", anonymous: true } })).toBe("/notifications");
    expect(notificationHref({ type: "system", data: { url: "https://evil.example" } })).toBe("/notifications");
    expect(notificationHref({ type: "unknown" })).toBe("/notifications");
    expect(notificationHref(null)).toBe("/notifications");
  });
  it("isolates user names inside localized sentences", () => {
    expect(isolate("نورة القحطاني")).toBe("⁨نورة القحطاني⁩");
    expect(isolate(null)).toBe("⁨⁩");
  });
});

describe("dashboard: streak status", () => {
  it("never contradicts the number shown", () => {
    expect(streakStatus(null)).toBe("none");
    expect(streakStatus({ current: 0, lastActive: null, activeToday: false, alive: false })).toBe("none");
    expect(streakStatus({ current: 4, lastActive: TODAY, activeToday: true, alive: true })).toBe("keepGoing");
    expect(streakStatus({ current: 0, lastActive: TODAY, activeToday: true, alive: true })).toBe("startTomorrow");
    expect(streakStatus({ current: 4, lastActive: "2026-09-24", activeToday: false, alive: true })).toBe("lastYesterday");
    expect(streakStatus({ current: 0, lastActive: "2026-09-20", activeToday: false, alive: false })).toBe("none");
  });
});

describe("dashboard: onboarding", () => {
  it("ticks only measured, true signals", () => {
    const r = onboardingSteps({ stage: true, practice: false, assistant: null, community: true });
    expect(r.done).toBe(2);
    expect(r.total).toBe(4);
    expect(r.steps.map((s) => [s.key, s.done])).toEqual([["stage", true], ["practice", false], ["assistant", false], ["community", true]]);
    expect(onboardingSteps().done).toBe(0);
  });
});

describe("dashboard: last curriculum visit", () => {
  it("accepts only /curriculum/… slug paths", () => {
    expect(parseLastVisit({ path: "/curriculum/high-school/first-year", title: "  السنة  الأولى ", at: "2026-09-24T10:00:00Z" }))
      .toEqual({ path: "/curriculum/high-school/first-year", title: "السنة الأولى", context: null, lang: null, at: "2026-09-24T10:00:00Z" });
    for (const path of ["/curriculum", "/curriculum/", "//evil.com", "/curriculum/../admin", "https://x.y/curriculum/a", "/curriculum/a?x=1", "/en/curriculum/a", "/curriculum/A", "javascript:alert(1)"]) {
      expect(parseLastVisit({ path })).toBeNull();
    }
    expect(parseLastVisit("{not json")).toBeNull();
    expect(parseLastVisit(null)).toBeNull();
    expect(parseLastVisit({ path: "/curriculum/a", at: "nope" }).at).toBeNull();
  });
  it("round-trips through storage JSON and caps text", () => {
    const raw = serializeLastVisit({ path: "/curriculum/middle", title: "x".repeat(300), context: "y" }, new Date("2026-09-25T00:00:00Z"));
    const back = parseLastVisit(raw);
    expect(back.title).toHaveLength(120);
    expect(back).toMatchObject({ path: "/curriculum/middle", context: "y", at: "2026-09-25T00:00:00.000Z" });
    expect(serializeLastVisit({ path: "/exams" })).toBeNull();
  });
  it("keeps the language the title was written in (ar / en only)", () => {
    const at = new Date("2026-09-25T00:00:00Z");
    expect(parseLastVisit(serializeLastVisit({ path: "/curriculum/middle", title: "Middle school", lang: "en" }, at)).lang).toBe("en");
    expect(parseLastVisit(serializeLastVisit({ path: "/curriculum/middle", title: "المتوسطة", lang: "ar" }, at)).lang).toBe("ar");
    expect(parseLastVisit(serializeLastVisit({ path: "/curriculum/middle", lang: "fr" }, at)).lang).toBeNull();
    expect(parseLastVisit({ path: "/curriculum/middle", lang: "<script>" }).lang).toBeNull();
  });
});

// ── data loaders with a tiny Supabase stand-in ──────────────────────────────

function fakeSupabase({ rpc = {}, tables = {} } = {}) {
  const calls = { rpc: [], from: [] };
  const query = (table) => {
    const q = {
      filters: [],
      select() { return q; },
      eq(col, val) { q.filters.push([col, val]); return q; },
      limit() { return q; },
      maybeSingle() { return q; },
      then(resolve, reject) {
        const r = tables[table];
        return Promise.resolve(typeof r === "function" ? r(q.filters) : r || { data: null, error: null }).then(resolve, reject);
      },
    };
    return q;
  };
  return {
    calls,
    rpc(name) {
      calls.rpc.push(name);
      const r = rpc[name];
      return Promise.resolve(typeof r === "function" ? r() : r || { data: null, error: { code: "PGRST202" } });
    },
    from(table) {
      calls.from.push(table);
      return query(table);
    },
  };
}

describe("dashboard: data loaders", () => {
  beforeEach(() => resetActivityCache());

  it("records today's activity once and reads XP + streak", async () => {
    const sb = fakeSupabase({
      rpc: { record_daily_activity: { data: 8, error: null } },
      tables: {
        streaks: { data: { current_streak: 8, longest_streak: 13, last_active_date: TODAY }, error: null },
        profiles: { data: { xp: 740 }, error: null },
      },
    });
    const r = await loadProgress(sb, "u1", { today: TODAY });
    expect(r.xp).toBe(740);
    expect(r.level.level).toBe(4);
    expect(r.streak).toMatchObject({ current: 8, longest: 13, activeToday: true });
    await loadProgress(sb, "u1", { today: TODAY });
    expect(sb.calls.rpc.filter((n) => n === "record_daily_activity")).toHaveLength(1);
    await recordActivityOnce(sb, "u1", "2026-09-26");
    expect(sb.calls.rpc.filter((n) => n === "record_daily_activity")).toHaveLength(2);
  });

  it("shares record_daily_activity with the session tracker: skipped once the day is recorded on this device", async () => {
    const store = new Map();
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
    try {
      const sb = fakeSupabase({ rpc: { record_daily_activity: { data: 4, error: null } } });
      expect(await recordActivityOnce(sb, "u9", TODAY)).toBe(4);
      expect(store.get("jazira_active_day_v1:u9")).toBe(TODAY);
      resetActivityCache(); // e.g. a new page load later that day
      expect(await recordActivityOnce(sb, "u9", TODAY)).toBeNull();
      expect(sb.calls.rpc.filter((n) => n === "record_daily_activity")).toHaveLength(1);
      // a failed call is not remembered: the next caller tries again
      const failing = fakeSupabase({ rpc: { record_daily_activity: { data: null, error: { code: "500" } } } });
      expect(await recordActivityOnce(failing, "u8", TODAY)).toBeNull();
      expect(store.has("jazira_active_day_v1:u8")).toBe(false);
      await recordActivityOnce(failing, "u8", TODAY);
      expect(failing.calls.rpc).toHaveLength(2);
    } finally {
      delete globalThis.localStorage;
    }
  });

  it("degrades per metric and only fails when nothing is readable", async () => {
    const noStreakTable = fakeSupabase({
      rpc: { record_daily_activity: { data: 3, error: null } },
      tables: { streaks: { data: null, error: { code: "42P01" } }, profiles: { data: { xp: 0 }, error: null } },
    });
    const a = await loadProgress(noStreakTable, "u1", { today: TODAY });
    expect(a.streak).toMatchObject({ current: 3, activeToday: true });
    expect(a.level.level).toBe(1);

    const nothing = fakeSupabase({
      tables: { streaks: { data: null, error: { code: "42P01" } }, profiles: { data: null, error: { code: "42501" } } },
    });
    await expect(loadProgress(nothing, "u2", { today: TODAY })).rejects.toMatchObject({ code: "unavailable" });
    resetActivityCache();
    const fallback = await loadProgress(nothing, "u3", { today: TODAY, fallbackXp: 120 });
    expect(fallback).toMatchObject({ xp: 120, streak: null });
    await expect(loadProgress(null, "u1")).rejects.toMatchObject({ code: "unavailable" });
  });

  it("reads onboarding signals as true / false / null", async () => {
    const sb = fakeSupabase({
      tables: {
        chat_history: { data: [{ id: 1 }], error: null },
        community_posts: { data: [], error: null },
        post_comments: { data: null, error: { code: "42P01" } },
        follows: { data: [], error: null },
      },
    });
    expect(await loadOnboardingSignals(sb, "u1")).toEqual({ assistant: true, community: false });
    const none = fakeSupabase({ tables: { chat_history: { data: null, error: { code: "42P01" } }, community_posts: { error: { code: "x" } }, post_comments: { error: { code: "x" } }, follows: { error: { code: "x" } } } });
    expect(await loadOnboardingSignals(none, "u1")).toEqual({ assistant: null, community: null });
    const social = fakeSupabase({ tables: { follows: { data: [{ id: 2 }], error: null } } });
    expect((await loadOnboardingSignals(social, "u1")).community).toBe(true);
    expect(await loadOnboardingSignals(null, "u1")).toEqual({ assistant: null, community: null });
  });

  it("reads the Elite renewal date only for active subscriptions", async () => {
    const end = "2026-10-14T00:00:00Z";
    expect(await loadSubscription(fakeSupabase({ tables: { subscriptions: { data: { tier: "elite", status: "active", current_period_end: end }, error: null } } }), "u"))
      .toEqual({ tier: "elite", status: "active", periodEnd: end });
    expect((await loadSubscription(fakeSupabase({ tables: { subscriptions: { data: { tier: "elite", status: "cancelled", current_period_end: end }, error: null } } }), "u")).periodEnd).toBeNull();
    expect(await loadSubscription(fakeSupabase({ tables: { subscriptions: { data: null, error: { code: "42P01" } } } }), "u")).toBeNull();
  });

  it("maps errors to the codes the cards understand", () => {
    expect(errorCode({ code: "not_authenticated" })).toBe("not_authenticated");
    expect(errorCode({ code: "unavailable" })).toBe("unavailable");
    expect(errorCode({ code: "network" })).toBe("network");
    expect(errorCode({ code: "daily_limit_reached" })).toBe("unknown");
    expect(errorCode(null)).toBe("unknown");
  });
});
