import { describe, it, expect } from "vitest";
import {
  FEED_INITIAL, MEDIA_LIMITS, applyReaction, buildMediaPath, composeContent, cursorOf, extractTags, feedReducer,
  keysetFilter, mediaAspect, mergeTopics, normalizePost, normalizeTag, normalizeUsername, parseEntities, parseMediaDims,
  publicIdentity, scriptOf, tokenizePost, validateMediaFile,
} from "@/components/community/model";
import { POST_KINDS, STARTER_TOPICS, curatedFor, tagInline, tagLabel } from "@/components/community/topics";

const UID = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const PID = "11111111-2222-4333-8444-555555555555";

describe("community tags & usernames", () => {
  it("normalizes tags to the stored grammar (hashtags_tag_format)", () => {
    expect(normalizeTag("#Math")).toBe("math");
    expect(normalizeTag("%23%D8%B3%D8%A4%D8%A7%D9%84")).toBe("سؤال");
    expect(normalizeTag("القدرات")).toBe("القدرات");
    expect(normalizeTag("a")).toBeNull();
    expect(normalizeTag("with space")).toBeNull();
    expect(normalizeTag("x".repeat(51))).toBeNull();
    expect(normalizeTag("%E0%A4%A")).toBeNull();
    expect(normalizeTag(null)).toBeNull();
  });

  it("every curated tag is a valid stored tag and resolves back", () => {
    for (const x of [...POST_KINDS, ...STARTER_TOPICS]) {
      expect(normalizeTag(x.tag)).toBe(x.tag);
      expect(curatedFor(x.tag)).toBe(x);
    }
  });

  it("labels tags: Arabic UI shows the tag, English UI translates curated ones", () => {
    const t = (k) => `T:${k}`;
    expect(tagLabel(t, "رياضيات", "ar")).toBe("رياضيات");
    expect(tagLabel(t, "رياضيات", "en")).toBe("T:topics.math");
    expect(tagLabel(t, "سؤال", "en")).toBe("T:filters.kinds.question");
    expect(tagLabel(t, "anything", "en")).toBe("anything");
  });

  it("tagInline: a bidi-isolated \"#tag\" in sentences, the translated name for curated tags in English", () => {
    const t = (k) => `T:${k}`;
    const FSI = "⁨";
    const PDI = "⁩";
    expect(tagInline(t, "رياضيات", "ar")).toBe(`${FSI}#رياضيات${PDI}`);
    expect(tagInline(t, "رياضيات", "en")).toBe(`${FSI}T:topics.math${PDI}`);
    expect(tagInline(t, "جبر", "en")).toBe(`${FSI}#جبر${PDI}`);
    expect(tagInline(t, "algebra", "ar")).toBe(`${FSI}#algebra${PDI}`);
  });

  it("normalizes usernames (profiles_username_format)", () => {
    expect(normalizeUsername("@Sara_1")).toBe("sara_1");
    expect(normalizeUsername("%D8%B3%D8%A7%D8%B1%D8%A9")).toBe("سارة");
    expect(normalizeUsername("ab")).toBeNull();
    expect(normalizeUsername("a.b.c")).toBeNull();
    expect(normalizeUsername("../etc")).toBeNull();
  });
});

describe("tokenizePost (mirrors index_post_entities grammar)", () => {
  it("splits tags, mentions and https links; keeps the rest as text", () => {
    const toks = tokenizePost("سؤال عن #الجبر من @Sara_1: https://example.com/a.");
    expect(toks).toEqual([
      { t: "text", v: "سؤال عن " },
      { t: "tag", v: "#الجبر", tag: "الجبر" },
      { t: "text", v: " من " },
      { t: "mention", v: "@Sara_1", handle: "sara_1" },
      { t: "text", v: ": " },
      { t: "url", v: "https://example.com/a", href: "https://example.com/a" },
      { t: "text", v: "." },
    ]);
  });

  it("needs whitespace (or start) before # and @, like the trigger", () => {
    expect(tokenizePost("a#b1 x@yy mail@site.com").every((t) => t.t === "text")).toBe(true);
    expect(tokenizePost("#ab").map((t) => t.t)).toEqual(["tag"]);
  });

  it("never linkifies http: or javascript: and keeps URL fragments out of tags", () => {
    expect(tokenizePost("http://x.com javascript:alert(1)").every((t) => t.t === "text")).toBe(true);
    const toks = tokenizePost("see https://x.com/page#frag");
    expect(toks.filter((t) => t.t === "tag")).toEqual([]);
    expect(toks.find((t) => t.t === "url").href).toBe("https://x.com/page#frag");
  });

  it("handles empty / non-string input", () => {
    expect(tokenizePost("")).toEqual([]);
    expect(tokenizePost(null)).toEqual([]);
  });

  it("extractTags: distinct, lower-cased, max 10", () => {
    expect(extractTags("#Math #math #فيزياء")).toEqual(["math", "فيزياء"]);
    const many = Array.from({ length: 14 }, (_, i) => `#tag${i}`).join(" ");
    expect(extractTags(many)).toHaveLength(10);
    expect(parseEntities("#A1 @Bob hi")).toEqual({ tags: ["a1"], handles: ["bob"] });
  });
});

describe("composeContent", () => {
  it("appends composer tags on their own line, skipping ones already typed", () => {
    expect(composeContent("  كيف أبدأ؟ #سؤال ", ["سؤال", "رياضيات"])).toBe("كيف أبدأ؟ #سؤال\n\n#رياضيات");
    expect(composeContent("hello", [])).toBe("hello");
    expect(composeContent("", ["سؤال"])).toBe("#سؤال");
    expect(composeContent("x", ["bad tag", null, "#Math", "math"])).toBe("x\n\n#math");
  });

  it("the appended tags are indexed by the same grammar", () => {
    expect(extractTags(composeContent("سؤال", ["سؤال", "القدرات"]))).toEqual(["سؤال", "القدرات"]);
  });
});

describe("media helpers", () => {
  const file = (type, size) => ({ type, size });
  it("validates type and size per kind (bucket rules)", () => {
    expect(validateMediaFile(file("image/png", 1000), "image")).toBeNull();
    expect(validateMediaFile(file("image/svg+xml", 1000), "image")).toBe("imageType");
    expect(validateMediaFile(file("image/jpeg", MEDIA_LIMITS.imageBytes + 1), "image")).toBe("imageSize");
    expect(validateMediaFile(file("video/mp4", 1000), "video")).toBeNull();
    expect(validateMediaFile(file("video/x-msvideo", 1000), "video")).toBe("videoType");
    expect(validateMediaFile(file("video/webm", MEDIA_LIMITS.videoBytes + 1), "video")).toBe("videoSize");
    expect(validateMediaFile(null, "image")).toBe("mediaType");
  });

  it("builds owner-folder paths with encoded dimensions and reads them back", () => {
    const path = buildMediaPath(UID, "image/jpeg", { width: 1080, height: 1350 }, 1700000000000);
    expect(path).toBe(`${UID}/1700000000000-1080x1350.jpg`);
    expect(path).toMatch(/^[^/]+\/[A-Za-z0-9._~-]+$/); // one URL-safe file segment
    expect(parseMediaDims(`https://x.supabase.co/storage/v1/object/public/post-media/${path}`)).toEqual({ width: 1080, height: 1350 });
    expect(buildMediaPath(UID, "video/quicktime", null, 5)).toBe(`${UID}/5.mov`);
    expect(buildMediaPath("not-a-uuid", "image/png", null)).toBeNull();
    expect(buildMediaPath(UID, "image/svg+xml", null)).toBeNull();
    expect(parseMediaDims(`${UID}/1700000000000.jpg`)).toBeNull();
    expect(parseMediaDims(null)).toBeNull();
  });

  it("clamps the display ratio and falls back per type", () => {
    expect(mediaAspect({ width: 1600, height: 900 })).toBeCloseTo(16 / 9);
    expect(mediaAspect({ width: 500, height: 2000 })).toBe(0.8);
    expect(mediaAspect({ width: 4000, height: 500 })).toBe(1.91);
    expect(mediaAspect(null, "video")).toBeCloseTo(16 / 9);
    expect(mediaAspect(null)).toBeCloseTo(4 / 3);
  });
});

describe("applyReaction (optimistic, with the writes to perform)", () => {
  const base = { liked: false, disliked: false, reposted: false, likes: 3, dislikes: 1, reposts: 0 };

  it("like / unlike", () => {
    const a = applyReaction(base, "like");
    expect(a.next).toMatchObject({ liked: true, likes: 4 });
    expect(a.ops).toEqual([{ table: "post_likes", op: "insert" }]);
    const b = applyReaction(a.next, "like");
    expect(b.next).toMatchObject({ liked: false, likes: 3 });
    expect(b.ops).toEqual([{ table: "post_likes", op: "delete" }]);
  });

  it("like and not-helpful are mutually exclusive", () => {
    const d = applyReaction({ ...base, disliked: true, dislikes: 2 }, "like");
    expect(d.next).toMatchObject({ liked: true, disliked: false, likes: 4, dislikes: 1 });
    expect(d.ops).toEqual([{ table: "post_dislikes", op: "delete" }, { table: "post_likes", op: "insert" }]);
    const e = applyReaction(d.next, "dislike");
    expect(e.next).toMatchObject({ liked: false, disliked: true, likes: 3, dislikes: 2 });
  });

  it("repost toggles independently and counts never go negative", () => {
    const r = applyReaction({ ...base, reposted: true, reposts: 0 }, "repost");
    expect(r.next).toMatchObject({ reposted: false, reposts: 0 });
    expect(r.ops).toEqual([{ table: "post_reposts", op: "delete" }]);
    expect(applyReaction(base, "unknown").ops).toEqual([]);
  });
});

describe("keyset pagination", () => {
  it("builds a tie-safe filter from a valid cursor only", () => {
    const iso = "2026-09-25T10:00:00.123456+00:00";
    expect(keysetFilter(iso, PID)).toBe(`created_at.lt."${iso}",and(created_at.eq."${iso}",id.lt.${PID})`);
    expect(keysetFilter(iso, PID, "created_at", "post_id")).toContain("post_id.lt.");
    expect(keysetFilter(iso, null)).toBe(`created_at.lt."${iso}"`);
    expect(keysetFilter(null, PID)).toBeNull();
    expect(keysetFilter('2026-01-01T00:00:00Z",id.gt.0', PID)).toBeNull(); // injection attempt
    expect(keysetFilter(iso, "1) or (true")).toBe(`created_at.lt."${iso}"`);
  });

  it("returns a cursor only for full pages", () => {
    const rows = [{ id: "a", created_at: "t1" }, { id: "b", created_at: "t2" }];
    expect(cursorOf(rows, 2)).toEqual({ before: "t2", beforeId: "b" });
    expect(cursorOf(rows, 3)).toBeNull();
    expect(cursorOf([{ post_id: "p", created_at: "t" }], 1, "created_at", "post_id")).toEqual({ before: "t", beforeId: "p" });
  });
});

describe("identities & post mapping", () => {
  const profile = { id: UID, username: "sara", full_name: "سارة العتيبي", avatar_url: "https://x/a.png", is_elite: true, show_elite_badge: true, anonymous_community: false };

  it("anonymous members expose nothing linkable", () => {
    const anon = publicIdentity({ ...profile, anonymous_community: true });
    expect(anon).toEqual({ anonymous: true });
    expect(JSON.stringify(anon)).not.toContain(UID);
  });

  it("the Elite badge needs is_elite AND show_elite_badge", () => {
    expect(publicIdentity(profile).elite).toBe(true);
    expect(publicIdentity({ ...profile, show_elite_badge: false }).elite).toBe(false);
    expect(publicIdentity({ ...profile, is_elite: false }).elite).toBe(false);
    expect(publicIdentity(null)).toMatchObject({ anonymous: false, name: null, id: null });
  });

  it("normalizePost maps counts, media, ownership and viewer reactions — never the raw user_id", () => {
    const row = {
      id: PID, user_id: UID, content: "hi", created_at: "2026-09-25T10:00:00Z",
      media_url: `https://x/post-media/${UID}/1-640x480.png`, media_type: "image", media_path: `${UID}/1-640x480.png`,
      likes_count: 2, dislikes_count: -1, comments_count: 1, reposts_count: null,
    };
    const post = normalizePost(row, { ...profile, anonymous_community: true }, { viewerId: UID, liked: true });
    expect(post.mine).toBe(true);
    expect(post.author).toEqual({ anonymous: true });
    expect(post).not.toHaveProperty("user_id");
    expect(post.counts).toEqual({ likes: 2, dislikes: 0, comments: 1, reposts: 0 });
    expect(post.media).toMatchObject({ type: "image", dims: { width: 640, height: 480 } });
    expect(post.viewer).toEqual({ liked: true, disliked: false, reposted: false });
    expect(normalizePost({ ...row, media_type: "pdf" }, profile).media).toBeNull();
    expect(normalizePost(row, profile, { viewerId: "other" }).mine).toBe(false);
  });

  it("mergeTopics: curated first, real popular tags after, with counts, deduped", () => {
    const out = mergeTopics(
      [{ id: "math", tag: "رياضيات" }, { id: "q", tag: "القدرات" }],
      [{ tag: "القدرات", post_count: 9 }, { tag: "Chemistry", post_count: 4 }, { tag: "bad tag", post_count: 3 }, { tag: "extra", post_count: 1 }],
      3
    );
    expect(out).toEqual([
      { id: "math", tag: "رياضيات", count: null },
      { id: "q", tag: "القدرات", count: 9 },
      { id: null, tag: "chemistry", count: 4 },
    ]);
  });
});

describe("feedReducer", () => {
  const p = (id, extra = {}) => ({ id, author: { id: `u-${id}` }, content: "", counts: { likes: 0, dislikes: 0, comments: 0, reposts: 0 }, ...extra });

  it("loads, appends (deduped) and reports unavailability", () => {
    let s = feedReducer(FEED_INITIAL, { type: "page", items: [p("a"), p("b")], nextCursor: { before: "t" }, available: true });
    expect(s.status).toBe("ready");
    s = feedReducer(feedReducer(s, { type: "loadingMore" }), { type: "page", items: [p("b"), p("c")], nextCursor: null, available: true, append: true });
    expect(s.items.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(s.cursor).toBeNull();
    expect(s.loadingMore).toBe(false);
    expect(feedReducer(s, { type: "page", available: false, reason: "not_configured" })).toMatchObject({ status: "unavailable", items: [], reason: "not_configured" });
  });

  it("keeps items when a later page fails; resets on a first-page failure", () => {
    const s = feedReducer(FEED_INITIAL, { type: "page", items: [p("a")], available: true });
    expect(feedReducer(s, { type: "error", code: "network", append: true })).toMatchObject({ status: "ready", error: "network", items: [p("a")] });
    expect(feedReducer(s, { type: "error", code: "network" })).toMatchObject({ status: "error", items: [] });
  });

  it("prepends, patches (object or function), removes and drops blocked authors", () => {
    let s = feedReducer(FEED_INITIAL, { type: "page", items: [p("a"), p("b")], available: true });
    s = feedReducer(s, { type: "prepend", post: p("n") });
    s = feedReducer(s, { type: "prepend", post: p("n") });
    expect(s.items.map((x) => x.id)).toEqual(["n", "a", "b"]);
    s = feedReducer(s, { type: "patch", id: "a", patch: { content: "edited" } });
    s = feedReducer(s, { type: "patch", id: "a", patch: (post) => ({ counts: { ...post.counts, comments: post.counts.comments + 1 } }) });
    expect(s.items[1]).toMatchObject({ content: "edited", counts: { comments: 1 } });
    s = feedReducer(s, { type: "remove", id: "n" });
    s = feedReducer(s, { type: "removeAuthor", userId: "u-b" });
    expect(s.items.map((x) => x.id)).toEqual(["a"]);
  });

  it("applies realtime row updates to counts and text only", () => {
    let s = feedReducer(FEED_INITIAL, { type: "page", items: [p("a", { mine: true })], available: true });
    s = feedReducer(s, { type: "row", row: { id: "a", likes_count: 5, comments_count: 2, content: "new", user_id: "x" } });
    expect(s.items[0]).toMatchObject({ content: "new", mine: true, counts: { likes: 5, comments: 2, dislikes: 0, reposts: 0 } });
    expect(s.items[0]).not.toHaveProperty("user_id");
    expect(feedReducer(s, { type: "row", row: null })).toBe(s);
  });
});

describe("scriptOf (lang + font for member text)", () => {
  it("uses the first strong letter", () => {
    expect(scriptOf("  12 — سؤال about math")).toBe("ar");
    expect(scriptOf("#Tahsili اختبار")).toBe("en");
    expect(scriptOf("123 !!")).toBeNull();
    expect(scriptOf(undefined)).toBeNull();
  });
});
