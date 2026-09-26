import { describe, it, expect, beforeAll } from "vitest";
import { loadMessages } from "@/i18n/messages";
import { createTranslator } from "@/i18n/translator";
import {
  FILTERS, filterItems, mergePages, setRead, dayOf, buildFeed, aggregateKey,
  uniqueActors, notificationHref, actorsPhrase, describe as describeGroup, textDir, isolateHandles, newerItems,
} from "@/components/notifications/model";

const NOW = new Date(2026, 8, 25, 15, 0, 0); // local time, 25 Sep 2026 15:00
const at = (daysAgo, hour = 10) => new Date(2026, 8, 25 - daysAgo, hour, 0, 0).toISOString();
const actor = (id, name, extra = {}) => ({ id, full_name: name, username: name ? name.toLowerCase().replace(/\s+/g, "") : null, avatar_url: null, is_elite: false, show_elite_badge: true, anonymous: false, ...extra });

let seq = 0;
const n = (type, extra = {}) => ({
  id: `n${++seq}`, type, read: false, created_at: at(0), post_id: null, comment_id: null,
  conversation_id: null, data: {}, actor: null, post_snippet: null, ...extra,
});

let tAr;
let tEn;
beforeAll(async () => {
  const [ar, en] = await Promise.all([loadMessages("ar", ["notifications"]), loadMessages("en", ["notifications"])]);
  tAr = createTranslator("ar", ar, "notifications");
  tEn = createTranslator("en", en, "notifications");
});

describe("filters", () => {
  const items = [
    n("like", { read: true }), n("mention"), n("exam_result", { read: true }), n("achievement"), n("comment"),
  ];
  it("knows the four filters", () => expect(FILTERS).toEqual(["all", "unread", "mentions", "exams"]));
  it("all keeps everything", () => expect(filterItems(items, "all")).toHaveLength(5));
  it("unread keeps unread only", () => expect(filterItems(items, "unread").every((x) => !x.read)).toBe(true));
  it("mentions keeps mention rows", () => expect(filterItems(items, "mentions").map((x) => x.type)).toEqual(["mention"]));
  it("exams keeps exam results and achievements", () =>
    expect(filterItems(items, "exams").map((x) => x.type)).toEqual(["exam_result", "achievement"]));
});

describe("pages and read state", () => {
  it("merges pages without duplicates", () => {
    const a = [{ id: "1" }, { id: "2" }];
    expect(mergePages(a, [{ id: "2" }, { id: "3" }]).map((x) => x.id)).toEqual(["1", "2", "3"]);
  });
  it("marks given ids read immutably", () => {
    const items = [n("like"), n("like")];
    const out = setRead(items, [items[0].id]);
    expect(out[0].read).toBe(true);
    expect(out[1].read).toBe(false);
    expect(items[0].read).toBe(false);
  });
  it("null ids marks everything", () => expect(setRead([n("like"), n("follow")], null).every((x) => x.read)).toBe(true));
  it("can revert to unread", () => expect(setRead([n("like", { read: true })], null, false)[0].read).toBe(false));

  it("finds rows newer than the loaded head (live check)", () => {
    const loaded = [
      { id: "b", created_at: "2026-09-25T10:00:00.000Z" },
      { id: "a", created_at: "2026-09-25T09:00:00.000Z" },
    ];
    const page = [
      { id: "d", created_at: "2026-09-25T11:30:00.000Z" },
      { id: "c", created_at: "2026-09-25T10:00:00.000Z" }, // same instant as the head, unseen → new
      { id: "b", created_at: "2026-09-25T10:00:00.000Z" },
      { id: "a", created_at: "2026-09-25T09:00:00.000Z" },
    ];
    expect(newerItems(loaded, page).map((x) => x.id)).toEqual(["d", "c"]);
    expect(newerItems(loaded, loaded)).toEqual([]);
    // An old row we simply haven't paged to yet is not "new".
    expect(newerItems(loaded, [{ id: "z", created_at: "2026-09-24T09:00:00.000Z" }])).toEqual([]);
    // Empty list: everything on the page is new.
    expect(newerItems([], page).length).toBe(4);
    expect(newerItems(null, null)).toEqual([]);
  });
});

describe("day buckets (viewer's calendar)", () => {
  it("today", () => expect(dayOf(at(0, 0), NOW)).toBe("today"));
  it("yesterday, early and late", () => {
    expect(dayOf(at(1, 0), NOW)).toBe("yesterday");
    expect(dayOf(at(1, 23), NOW)).toBe("yesterday");
  });
  it("earlier", () => expect(dayOf(at(2, 23), NOW)).toBe("earlier"));
  it("invalid dates fall into earlier", () => expect(dayOf("nope", NOW)).toBe("earlier"));
});

describe("aggregation", () => {
  const sara = actor("a1", "Sara Ali");
  const omar = actor("a2", "Omar Haddad");
  const lina = actor("a3", "Lina Saad");
  const anon = actor("a4", null, { anonymous: true, username: null });

  it("collapses likes on the same post on the same day", () => {
    const items = [
      n("like", { post_id: "p1", actor: sara }),
      n("like", { post_id: "p1", actor: omar, read: true }),
      n("like", { post_id: "p1", actor: lina }),
      n("like", { post_id: "p2", actor: sara }),
    ];
    const feed = buildFeed(items, NOW);
    expect(feed).toHaveLength(1);
    const [g1, g2] = feed[0].groups;
    expect(g1.count).toBe(3);
    expect(g1.actors.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(g1.unreadIds).toHaveLength(2);
    expect(g1.read).toBe(false);
    expect(g2.count).toBe(1);
  });

  it("does not merge across days", () => {
    const items = [n("like", { post_id: "p1", actor: sara }), n("like", { post_id: "p1", actor: omar, created_at: at(1) })];
    const feed = buildFeed(items, NOW);
    expect(feed.map((s) => s.day)).toEqual(["today", "yesterday"]);
  });

  it("collapses follows per day and messages per conversation", () => {
    expect(aggregateKey(n("follow"), "today")).toBe("today|follow");
    expect(aggregateKey(n("message", { conversation_id: "c1" }), "today")).toBe("today|message|conv:c1");
  });

  it("never merges exam results, mentions or requests", () => {
    const items = [n("exam_result", { data: { attempt_id: "x" } }), n("exam_result"), n("mention", { post_id: "p1" }), n("mention", { post_id: "p1" })];
    expect(buildFeed(items, NOW)[0].groups).toHaveLength(4);
  });

  it("keeps anonymous actors distinct and dedupes repeat actors", () => {
    const items = [n("like", { actor: sara }), n("like", { actor: sara }), n("like", { actor: anon }), n("like", { actor: null })];
    expect(uniqueActors(items).map((a) => a.id)).toEqual(["a1", "a4"]);
  });

  it("orders days today → yesterday → earlier", () => {
    const items = [n("follow", { created_at: at(5) }), n("follow", { created_at: at(0) }), n("follow", { created_at: at(1) })];
    expect(buildFeed(items, NOW).map((s) => s.day)).toEqual(["today", "yesterday", "earlier"]);
  });
});

describe("targets", () => {
  it("post interactions open the post in the community", () => {
    expect(notificationHref(n("like", { post_id: "p 1" }))).toBe("/community/post/p%201");
    expect(notificationHref(n("comment", { post_id: "p1", comment_id: "c9" }))).toBe("/community/post/p1");
    expect(notificationHref(n("mention"))).toBe("/community");
  });
  it("follows open the follower's profile unless anonymous", () => {
    expect(notificationHref(n("follow", { actor: actor("a1", "Sara Ali") }))).toBe("/u/saraali");
    expect(notificationHref(n("follow", { actor: actor("a1", null, { anonymous: true, username: null }) }))).toBeNull();
  });
  it("messages open the conversation, never ?to= (it would accept requests)", () => {
    const href = notificationHref(n("message_request", { conversation_id: "c1" }));
    expect(href).toBe("/chat?c=c1");
    expect(href).not.toContain("to=");
    expect(notificationHref(n("message"))).toBe("/chat");
  });
  it("exam results open the attempt; bad ids fall back to history", () => {
    const id = "3f1c2a4e-9b7d-4c1e-8f00-1234567890ab";
    expect(notificationHref(n("exam_result", { data: { attempt_id: id } }))).toBe(`/exams/attempt/${id}`);
    expect(notificationHref(n("exam_result", { data: { attempt_id: "../../x" } }))).toBe("/exams/history");
  });
  it("system links must be internal paths", () => {
    expect(notificationHref(n("system", { data: { url: "/subscriptions" } }))).toBe("/subscriptions");
    expect(notificationHref(n("system", { data: { url: "https://evil.example" } }))).toBeNull();
    expect(notificationHref(n("system", { data: { url: "//evil.example" } }))).toBeNull();
    expect(notificationHref(n("system", { data: { url: "/\\evil" } }))).toBeNull();
  });
  it("achievements open the achievements page", () => expect(notificationHref(n("achievement"))).toBe("/achievements"));
});

describe("user content direction", () => {
  it("Arabic anywhere → rtl, even after a leading @handle", () => {
    expect(textDir("@sara_a هل عندك ملخص؟")).toBe("rtl");
    expect(textDir("Great summary!")).toBe("ltr");
    expect(textDir(null)).toBe("ltr");
  });
  it("wraps @handles in LTR isolates so the @ stays in front", () => {
    expect(isolateHandles("@sara_a هل عندك ملخص؟")).toBe("⁦@sara_a⁩ هل عندك ملخص؟");
    expect(isolateHandles("شكرًا @omar و @x")).toBe("شكرًا ⁦@omar⁩ و @x");
    expect(isolateHandles("mail a@b.co")).toBe("mail a@b.co");
    expect(isolateHandles(null)).toBe("");
  });
});

describe("copy (real message files)", () => {
  const people = (k) => Array.from({ length: k }, (_, i) => actor(`p${i}`, i === 0 ? "سارة علي" : `Person ${i}`));
  const likeGroup = (k) => ({ type: "like", lead: n("like"), actors: people(k), count: k });

  it("Arabic actor phrases use proper plural forms (genitive)", () => {
    expect(actorsPhrase(people(1), tAr)).toBe("سارة علي");
    expect(actorsPhrase(people(2), tAr)).toBe("سارة علي وPerson 1");
    expect(actorsPhrase(people(3), tAr)).toBe("سارة علي وشخصين آخرين");
    expect(actorsPhrase(people(4), tAr)).toBe("سارة علي و3 آخرين");
    expect(actorsPhrase(people(12), tAr)).toBe("سارة علي و11 شخصًا آخر");
    expect(actorsPhrase(people(101), tAr)).toBe("سارة علي و100 شخص آخر");
  });

  it("Arabic like sentence is gender-neutral", () => {
    expect(describeGroup(likeGroup(4), tAr, "ar").text).toBe("نال منشورك إعجاب سارة علي و3 آخرين");
  });

  it("English actor phrases", () => {
    expect(describeGroup(likeGroup(1), tEn, "en").text).toBe("سارة علي liked your post");
    expect(actorsPhrase(people(3), tEn)).toBe("سارة علي and 2 others");
  });

  it("anonymous and nameless actors get labels", () => {
    expect(actorsPhrase([actor("x", null, { anonymous: true })], tAr)).toBe("عضو مجهول");
    expect(actorsPhrase([actor("x", null)], tEn)).toBe("A Jazira member");
    expect(actorsPhrase([], tEn)).toBe("Someone");
  });

  it("comment and message counts pluralise", () => {
    const g = (type, count) => ({ type, lead: n(type), actors: people(1), count });
    expect(describeGroup(g("comment", 2), tAr, "ar").text).toBe("تعليقان جديدان من سارة علي على منشورك");
    expect(describeGroup(g("comment", 5), tAr, "ar").text).toBe("5 تعليقات جديدة من سارة علي على منشورك");
    expect(describeGroup(g("message", 1), tEn, "en").text).toBe("New message from سارة علي");
    expect(describeGroup(g("message", 3), tEn, "en").text).toBe("3 new messages from سارة علي");
  });

  it("exam results show exam, section, score and correct count", () => {
    const lead = n("exam_result", { data: { exam: "aptitude", section: "quantitative", score_percent: 80, correct: 8, total: 10, status: "submitted" } });
    const ar = describeGroup({ type: "exam_result", lead, actors: [], count: 1 }, tAr, "ar");
    expect(ar.text).toContain("اختبار القدرات (الكمي)");
    expect(ar.text).toContain("80");
    expect(ar.detail).toBe("8 إجابات صحيحة من 10");
    const en = describeGroup({ type: "exam_result", lead: { ...lead, data: { ...lead.data, status: "expired", correct: 1 } }, actors: [], count: 1 }, tEn, "en");
    expect(en.text).toBe("Your Aptitude test (Quantitative) result: 80%");
    expect(en.detail).toBe("1 of 10 correct · Submitted automatically when time ran out");
  });

  it("unknown exam data degrades gracefully", () => {
    const lead = n("exam_result", { data: { exam: "<script>" } });
    expect(describeGroup({ type: "exam_result", lead, actors: [], count: 1 }, tEn, "en")).toEqual({ text: "Your exam result is ready", detail: null, emphasis: null });
  });

  it("system rows use their own title, else a generic line", () => {
    expect(describeGroup({ type: "system", lead: n("system", { data: { title: "New feature" } }), actors: [], count: 1 }, tEn, "en").text).toBe("New feature");
    expect(describeGroup({ type: "system", lead: n("system"), actors: [], count: 1 }, tAr, "ar").text).toBe("تحديث من جزيرة");
    expect(describeGroup({ type: "mystery", lead: n("mystery"), actors: [], count: 1 }, tEn, "en").text).toBe("New notification");
  });
});
