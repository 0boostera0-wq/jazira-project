// Anonymous community posting at the database level
// (supabase/migrations/0012_privacy_topics_analytics_search.sql, part A).
//
// Every block pairs what an ATTACKER (another member, a guest, a blocked
// member, the mentioned member) must NOT learn with the LEGITIMATE flows that
// keep working for the author. Runs the full chain, then a pre-0012 database
// for the backfill.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createDb, listMigrations, MIGRATIONS_DIR } from "./harness.js";

const MIGRATION = "0012_privacy_topics_analytics_search.sql";

let h;
beforeAll(async () => { h = await createDb({ skip: ["0011_seed_questions.sql"] }); });
afterAll(async () => { await h?.close(); });

// ── helpers ──────────────────────────────────────────────────────────────────
const DENIED = { code: "42501" };
const CHECK = { code: "23514" };
const raised = (msg) => new RegExp(`^${msg}$`);
const ORIGIN = "https://abcdefghijklmnopqrst.supabase.co";
const mediaUrl = (p) => `${ORIGIN}/storage/v1/object/public/post-media/${p}`;

let seq = 0;
const newUser = (meta = {}) => h.createUser({ meta: { full_name: "Test User", username: `anon_t_${++seq}`, ...meta } });
const anonMode = (uid, on = true) => h.sql("update public.profiles set anonymous_community = $2 where id = $1", [uid, on]);
const handleOf = async (uid) => (await h.sql("select username from public.profiles where id = $1", [uid]))[0].username;
const asU = (uid, q, p) => h.asUser(uid, (tx) => tx.sql(q, p));
const asA = (q, p) => h.asAnon((tx) => tx.sql(q, p));
const as = (uid, q, p) => (uid ? asU(uid, q, p) : asA(q, p));
const n = (uid, q, p) => h.asUser(uid, (tx) => tx.query(q, p)).then((r) => r.affectedRows);

/** Insert a post as its author; `anon` true/false = explicit choice, undefined = profile default. */
async function post(uid, content = "hello", anon) {
  const [r] = anon === undefined
    ? await asU(uid, "insert into public.community_posts (user_id, content) values ($1, $2) returning id, is_anonymous", [uid, content])
    : await asU(uid, "insert into public.community_posts (user_id, content, is_anonymous) values ($1, $2, $3) returning id, is_anonymous", [uid, content, anon]);
  return r;
}
async function comment(uid, postId, content = "a comment", anon) {
  const [r] = anon === undefined
    ? await asU(uid, "insert into public.post_comments (post_id, user_id, content) values ($1, $2, $3) returning id, is_anonymous", [postId, uid, content])
    : await asU(uid, "insert into public.post_comments (post_id, user_id, content, is_anonymous) values ($1, $2, $3, $4) returning id, is_anonymous", [postId, uid, content, anon]);
  return r;
}

const FEED_TYPES = { p_scope: "text", p_user: "uuid", p_tag: "text", p_ids: "uuid[]", p_before: "timestamptz", p_before_id: "uuid", p_limit: "int" };
/** community_feed(named args) as a user (uid) or a guest (null). */
function feed(uid, args = {}) {
  const parts = [];
  const params = [];
  for (const [k, v] of Object.entries(args)) {
    params.push(v);
    parts.push(`${k} => $${params.length}::${FEED_TYPES[k]}`);
  }
  return as(uid, `select * from public.community_feed(${parts.join(", ")})`, params);
}
const comments = (uid, postId, limit = 50, before = null, beforeId = null) =>
  as(uid, "select * from public.community_comments($1::uuid, $2::timestamptz, $3::uuid, $4::int)", [postId, before, beforeId, limit]);
const search = (uid, q, limit = 20) => as(uid, "select public.search_all($1, $2::int) r", [q, limit]).then((r) => r[0].r);
const AUTHOR_FIELDS = ["author_id", "author_username", "author_full_name", "author_avatar_url", "author_is_elite", "author_show_elite_badge"];
const masked = (row) => AUTHOR_FIELDS.every((k) => row[k] === null);

// ============================================================================
describe("snapshot: is_anonymous is fixed when the post or comment is created", () => {
  it("defaults to the author's anonymous_community setting at that moment", async () => {
    const [pub, anon] = [await newUser(), await newUser()];
    await anonMode(anon);
    expect((await post(pub)).is_anonymous).toBe(false);
    expect((await post(anon)).is_anonymous).toBe(true);
    const p = await post(pub);
    expect((await comment(pub, p.id)).is_anonymous).toBe(false);
    expect((await comment(anon, p.id)).is_anonymous).toBe(true);
  });

  it("an explicit per-post / per-comment choice wins over the profile setting (null = default)", async () => {
    const [pub, anon] = [await newUser(), await newUser()];
    await anonMode(anon);
    expect((await post(pub, "x", true)).is_anonymous).toBe(true);
    expect((await post(anon, "x", false)).is_anonymous).toBe(false);
    expect((await post(anon, "x", null)).is_anonymous).toBe(true);
    const p = await post(pub);
    expect((await comment(pub, p.id, "c", true)).is_anonymous).toBe(true);
    expect((await comment(anon, p.id, "c", false)).is_anonymous).toBe(false);
  });

  it("turning anonymous mode off later does NOT attribute earlier anonymous posts or comments", async () => {
    const [author, reader] = [await newUser({ full_name: "Former Anon" }), await newUser()];
    await anonMode(author);
    const p = await post(author, "written while anonymous");
    const c = await comment(author, p.id, "anonymous remark");
    await anonMode(author, false);
    const [row] = await feed(reader, { p_scope: "ids", p_ids: [p.id] });
    expect(row).toMatchObject({ id: p.id, is_anonymous: true, is_mine: false });
    expect(masked(row)).toBe(true);
    const [crow] = await comments(reader, p.id);
    expect(crow).toMatchObject({ id: c.id, is_anonymous: true });
    expect(masked(crow)).toBe(true);
    // and turning it on later does not hide earlier public posts (snapshot)
    const q = await post(author, "public now");
    await anonMode(author);
    const [qrow] = await feed(reader, { p_scope: "ids", p_ids: [q.id] });
    expect(qrow).toMatchObject({ is_anonymous: false, author_id: author, author_full_name: "Former Anon" });
  });

  it("ATTACK: nobody can flip the flag afterwards — not the author, not the service role, not the owner role", async () => {
    const author = await newUser();
    await anonMode(author);
    const p = await post(author);
    const c = await comment(author, p.id);
    await expect(n(author, "update public.community_posts set is_anonymous = false where id = $1", [p.id])).rejects.toMatchObject(DENIED);
    await expect(n(author, "update public.post_comments set is_anonymous = false where id = $1", [c.id])).rejects.toMatchObject(DENIED);
    await expect(h.asService((tx) => tx.sql("update public.community_posts set is_anonymous = false where id = $1", [p.id])))
      .rejects.toThrow(raised("anonymity_immutable"));
    await expect(h.sql("update public.post_comments set is_anonymous = false where id = $1", [c.id]))
      .rejects.toThrow(raised("anonymity_immutable"));
    // LEGIT: the author still edits the text; same-value writes pass
    expect(await n(author, "update public.community_posts set content = 'edited' where id = $1", [p.id])).toBe(1);
    await h.sql("update public.community_posts set is_anonymous = true where id = $1", [p.id]);
    const [r] = await h.sql("select is_anonymous, content from public.community_posts where id = $1", [p.id]);
    expect(r).toEqual({ is_anonymous: true, content: "edited" });
  });
});

// ============================================================================
describe("anonymous authors are hidden from other members and guests", () => {
  let author, reader, pub, anonPost, anonComment;
  beforeAll(async () => {
    author = await newUser({ full_name: "Hidden Author" });
    reader = await newUser({ full_name: "Curious Reader" });
    pub = await post(author, "my public post", false);
    anonPost = await post(author, "my anonymous post", true);
    anonComment = await comment(author, pub.id, "anonymous comment", true);
    await comment(author, pub.id, "public comment", false);
  });

  it("ATTACK: the table API returns no anonymous row (so no user_id), even when filtering by author", async () => {
    for (const uid of [reader, null]) {
      expect(await as(uid, "select id, user_id from public.community_posts where id = $1", [anonPost.id])).toEqual([]);
      expect(await as(uid, "select id, user_id from public.post_comments where id = $1", [anonComment.id])).toEqual([]);
      const own = await as(uid, "select id from public.community_posts where user_id = $1", [author]);
      expect(own.map((r) => r.id)).toEqual([pub.id]);
      const ownComments = await as(uid, "select content from public.post_comments where user_id = $1", [author]);
      expect(ownComments.map((r) => r.content)).toEqual(["public comment"]);
    }
  });

  it("profile post counts (head count by user_id) only count public posts for others; the author counts all", async () => {
    const count = (uid) => as(uid, "select count(*)::int c from public.community_posts where user_id = $1", [author]).then((r) => r[0].c);
    expect(await count(null)).toBe(1);
    expect(await count(reader)).toBe(1);
    expect(await count(author)).toBe(2);
  });

  it("LEGIT: the author reads their own anonymous rows (achievement / dashboard counts)", async () => {
    const [r] = await asU(author, "select user_id, is_anonymous from public.community_posts where id = $1", [anonPost.id]);
    expect(r).toEqual({ user_id: author, is_anonymous: true });
    expect(await asU(author, "select id from public.post_comments where id = $1", [anonComment.id])).toHaveLength(1);
  });

  it("community_feed masks the author for others and guests, keeps it for the author (is_mine)", async () => {
    for (const uid of [reader, null]) {
      const rows = await feed(uid, { p_scope: "ids", p_ids: [pub.id, anonPost.id] });
      const a = rows.find((r) => r.id === anonPost.id);
      const p = rows.find((r) => r.id === pub.id);
      expect(a).toMatchObject({ is_anonymous: true, is_mine: false, content: "my anonymous post" });
      expect(masked(a)).toBe(true);
      expect(p).toMatchObject({ is_anonymous: false, is_mine: false, author_id: author, author_full_name: "Hidden Author" });
    }
    const [mine] = await feed(author, { p_scope: "ids", p_ids: [anonPost.id] });
    expect(mine).toMatchObject({ is_anonymous: true, is_mine: true, author_id: author, author_full_name: "Hidden Author" });
  });

  it("community_comments masks anonymous commenters (and keeps them for themselves)", async () => {
    const byContent = (rows) => Object.fromEntries(rows.map((r) => [r.content, r]));
    const guest = byContent(await comments(null, pub.id));
    expect(masked(guest["anonymous comment"])).toBe(true);
    expect(guest["anonymous comment"]).toMatchObject({ is_anonymous: true, is_mine: false });
    expect(guest["public comment"]).toMatchObject({ author_id: author, is_mine: false });
    const own = byContent(await comments(author, pub.id));
    expect(own["anonymous comment"]).toMatchObject({ is_mine: true, author_id: author });
  });

  it("the RPCs expose only public profile columns", async () => {
    const [row] = await feed(reader, { p_scope: "ids", p_ids: [pub.id] });
    expect(Object.keys(row).some((k) => /phone|changed_at|user_id/.test(k))).toBe(false);
  });

  it("post_public_author(): the author of a public post only; not callable by guests", async () => {
    const pa = (id) => asU(reader, "select public.post_public_author($1::uuid) a", [id]).then((r) => r[0].a);
    expect(await pa(pub.id)).toBe(author);
    expect(await pa(anonPost.id)).toBeNull();
    await expect(asA("select public.post_public_author($1::uuid)", [pub.id])).rejects.toMatchObject(DENIED);
  });
});

// ============================================================================
describe("feed scopes, pagination and the new-posts counter", () => {
  let author, fan, stranger, pub, anonPost, tag;
  beforeAll(async () => {
    author = await newUser({ full_name: "Scope Author" });
    fan = await newUser({ full_name: "Scope Fan" });
    stranger = await newUser();
    tag = `scopetag${seq}`;
    pub = await post(author, `public #${tag}`, false);
    anonPost = await post(author, `anonymous #${tag}`, true);
    await asU(fan, "insert into public.follows (follower_id, followee_id) values ($1, $2)", [fan, author]);
    for (const p of [pub, anonPost]) {
      await asU(fan, "insert into public.post_likes (post_id, user_id) values ($1, $2)", [p.id, fan]);
      await asU(fan, "insert into public.post_reposts (post_id, user_id) values ($1, $2)", [p.id, fan]);
    }
  });
  const ids = (rows) => rows.map((r) => r.id);

  it("author: others see only public posts; the author also sees their anonymous ones", async () => {
    expect(ids(await feed(stranger, { p_scope: "author", p_user: author }))).toEqual([pub.id]);
    expect(ids(await feed(null, { p_scope: "author", p_user: author }))).toEqual([pub.id]);
    const own = await feed(author, { p_scope: "author", p_user: author });
    expect(ids(own)).toEqual([anonPost.id, pub.id]);
    expect(own[0]).toMatchObject({ is_anonymous: true, is_mine: true });
  });

  it("following never contains anonymous posts; guests get nothing", async () => {
    expect(ids(await feed(fan, { p_scope: "following" }))).toEqual([pub.id]);
    expect(await feed(null, { p_scope: "following" })).toEqual([]);
  });

  it("tag, liked and reposted lists include anonymous posts with the author masked", async () => {
    for (const args of [{ p_scope: "tag", p_tag: `#${tag.toUpperCase()}` }, { p_scope: "liked", p_user: fan }, { p_scope: "reposted", p_user: fan }]) {
      const rows = await feed(stranger, args);
      expect(ids(rows).sort(), JSON.stringify(args)).toEqual([pub.id, anonPost.id].sort());
      expect(masked(rows.find((r) => r.id === anonPost.id))).toBe(true);
    }
    expect(await feed(stranger, { p_scope: "tag", p_tag: "no_such_tag_here" })).toEqual([]);
  });

  it("liked / reposted respect the member's show_likes_on_profile / show_reposts_on_profile (except for themselves)", async () => {
    await asU(fan, "insert into public.user_social_settings (user_id, show_likes_on_profile) values ($1, false)", [fan]);
    expect(await feed(stranger, { p_scope: "liked", p_user: fan })).toEqual([]);
    expect(await feed(fan, { p_scope: "liked", p_user: fan })).toHaveLength(2);
    expect(await feed(stranger, { p_scope: "reposted", p_user: fan })).toHaveLength(2);
    await asU(fan, "update public.user_social_settings set show_likes_on_profile = true where user_id = $1", [fan]);
  });

  it("viewer reaction flags are the caller's own", async () => {
    const [fanRow] = await feed(fan, { p_scope: "ids", p_ids: [anonPost.id] });
    expect(fanRow).toMatchObject({ viewer_liked: true, viewer_reposted: true, viewer_disliked: false, likes_count: 1 });
    const [other] = await feed(stranger, { p_scope: "ids", p_ids: [anonPost.id] });
    expect(other).toMatchObject({ viewer_liked: false, viewer_reposted: false });
  });

  it("keyset pages (identical timestamps included) cover every row exactly once", async () => {
    const u = await newUser();
    const created = [];
    for (let i = 0; i < 5; i++) created.push((await post(u, `page ${i}`, i % 2 === 0)).id);
    await h.sql("update public.community_posts set created_at = timestamptz '2020-01-01 10:00:00+00' where id = any($1::uuid[])", [created.slice(0, 3)]);
    await h.sql("update public.community_posts set created_at = timestamptz '2020-01-01 09:00:00+00' where id = any($1::uuid[])", [created.slice(3)]);
    const all = await feed(stranger, { p_scope: "author", p_user: u, p_limit: 50 });
    expect(all).toHaveLength(2);                        // others: only the public ones (i = 1, 3)
    const own = await feed(u, { p_scope: "author", p_user: u, p_limit: 50 });
    expect(own).toHaveLength(5);
    const seen = [];
    let cur = {};
    for (let i = 0; i < 10; i++) {
      const page = await feed(u, { p_scope: "author", p_user: u, p_limit: 2, ...cur });
      if (!page.length) break;
      seen.push(...ids(page));
      const last = page[page.length - 1];
      cur = { p_before: last.cursor_at, p_before_id: last.cursor_id };
    }
    expect(seen).toEqual(ids(own));
  });

  it("validates its arguments", async () => {
    for (const args of [{ p_limit: 0 }, { p_limit: 51 }, { p_scope: "everything" }, { p_scope: "author" },
      { p_scope: "liked" }, { p_scope: "ids" }, { p_scope: "ids", p_ids: Array.from({ length: 101 }, () => randomUUID()) }]) {
      await expect(feed(stranger, args), JSON.stringify(args).slice(0, 60)).rejects.toThrow(raised("invalid_argument"));
    }
    await expect(comments(stranger, pub.id, 0)).rejects.toThrow(raised("invalid_argument"));
  });

  it("community_new_posts_count(): newer posts the caller would see, excluding their own, capped at 100", async () => {
    const [top] = await feed(stranger, { p_limit: 1 });
    const count = (uid) => as(uid, "select public.community_new_posts_count($1::timestamptz, $2::uuid) c", [top.cursor_at, top.cursor_id]).then((r) => r[0].c);
    expect(await count(stranger)).toBe(0);
    const w = await newUser();
    await post(w, "fresh public", false);
    await post(w, "fresh anonymous", true);
    expect(await count(stranger)).toBe(2);
    expect(await count(null)).toBe(2);
    expect(await count(w)).toBe(0);                   // own posts are prepended locally
    await asU(stranger, "insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [stranger, w]);
    expect(await count(stranger)).toBe(1);            // the blocked member's public post is hidden; the anonymous one is not
    await expect(asA("select public.community_new_posts_count(null)")).rejects.toThrow(raised("invalid_argument"));
  });
});

// ============================================================================
describe("blocks on anonymous posts are identity-blind", () => {
  let owner, troll, pub, anonPost;
  beforeAll(async () => {
    owner = await newUser({ full_name: "Block Owner" });
    troll = await newUser({ full_name: "Block Troll" });
    pub = await post(owner, "owner public", false);
    anonPost = await post(owner, "owner anonymous", true);
    await asU(owner, "insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [owner, troll]);
  });

  it("ATTACK (oracle): the blocked member is NOT refused on the anonymous post — a refusal would reveal its author", async () => {
    await asU(troll, "insert into public.post_likes (post_id, user_id) values ($1, $2)", [anonPost.id, troll]);
    await asU(troll, "insert into public.post_comments (post_id, user_id, content) values ($1, $2, 'hm')", [anonPost.id, troll]);
    // the public post keeps the 0009 rule
    await expect(asU(troll, "insert into public.post_likes (post_id, user_id) values ($1, $2)", [pub.id, troll])).rejects.toMatchObject(DENIED);
    await expect(asU(troll, "insert into public.post_comments (post_id, user_id, content) values ($1, $2, 'x')", [pub.id, troll]))
      .rejects.toMatchObject(DENIED);
  });

  it("…and the owner gets no notification from a member they blocked", async () => {
    const notes = await h.sql("select type from public.notifications where user_id = $1 and post_id = $2", [owner, anonPost.id]);
    expect(notes).toEqual([]);
  });

  it("the blocker's feed hides the blocked member's public posts, not anonymous ones", async () => {
    const tp = await post(troll, "troll public", false);
    const ta = await post(troll, "troll anonymous", true);
    const rows = await feed(owner, { p_scope: "ids", p_ids: [tp.id, ta.id] });
    expect(rows.map((r) => r.id)).toEqual([ta.id]);
    expect((await comments(owner, anonPost.id)).map((c) => c.content)).toEqual([]);   // the troll's public comment is hidden
    expect((await comments(null, anonPost.id)).map((c) => c.content)).toEqual(["hm"]);
  });
});

// ============================================================================
describe("notifications and mentions never carry an anonymous actor", () => {
  let owner, actor, target, ownerPost;
  const notes = (uid, type) => h.sql("select actor_id, data, comment_id, post_id from public.notifications where user_id = $1 and type = $2 order by created_at", [uid, type]);
  const feedOf = (uid) => asU(uid, "select * from public.get_notifications(100)");
  beforeAll(async () => {
    owner = await newUser({ full_name: "Note Owner" });
    actor = await newUser({ full_name: "Note Actor" });
    target = await newUser({ full_name: "Note Target" });
    ownerPost = await post(owner, "owner's public post", false);
  });

  it("an anonymous comment notifies the post owner without the actor (stored and served)", async () => {
    const c = await comment(actor, ownerPost.id, "anonymous feedback", true);
    const [row] = (await notes(owner, "comment")).filter((r) => r.comment_id === c.id);
    expect(row).toEqual({ actor_id: null, data: { anonymous: true }, comment_id: c.id, post_id: ownerPost.id });
    const served = (await feedOf(owner)).find((r) => r.comment_id === c.id);
    expect(served).toMatchObject({ actor_id: null, actor_full_name: null, actor_username: null, actor_avatar_url: null,
      actor_anonymous: true, actor_is_elite: false });
    // the recipient cannot recover the actor through the tables either
    expect(await asU(owner, "select actor_id from public.notifications where comment_id = $1", [c.id])).toEqual([{ actor_id: null }]);
    expect(await asU(owner, "select user_id from public.post_comments where id = $1", [c.id])).toEqual([]);
  });

  it("the actor's later settings never re-attribute it; a public comment stays attributed", async () => {
    await anonMode(actor, false);
    const pc = await comment(actor, ownerPost.id, "signed feedback", false);
    const rows = await feedOf(owner);
    expect(rows.filter((r) => r.type === "comment" && r.actor_anonymous).length).toBe(1);
    expect(rows.find((r) => r.comment_id === pc.id)).toMatchObject({ actor_id: actor, actor_full_name: "Note Actor", actor_anonymous: false });
  });

  it("a like on an anonymous post goes to its author (recipient = owner), naming the public liker", async () => {
    const mine = await post(owner, "owner's anonymous post", true);
    await asU(actor, "insert into public.post_likes (post_id, user_id) values ($1, $2)", [mine.id, actor]);
    const [row] = (await notes(owner, "like")).filter((r) => r.post_id === mine.id);
    expect(row).toMatchObject({ actor_id: actor, data: {} });
    // the liker learns nothing about the owner: not the notification, not the row
    expect(await asU(actor, "select id from public.notifications where post_id = $1", [mine.id])).toEqual([]);
    expect(await asU(actor, "select user_id from public.community_posts where id = $1", [mine.id])).toEqual([]);
  });

  it("mentions from anonymous posts / comments: actor-less notification; the mention row is the author's only", async () => {
    const handle = await handleOf(target);
    const ap = await post(actor, `hey @${handle}`, true);
    const ac = await comment(actor, ownerPost.id, `ping @${handle}`, true);
    const got = (await notes(target, "mention")).filter((r) => r.post_id === ap.id || r.comment_id === ac.id);
    expect(got).toHaveLength(2);
    for (const r of got) expect(r).toMatchObject({ actor_id: null, data: { anonymous: true } });
    expect((await feedOf(target)).filter((r) => r.type === "mention").every((r) => r.actor_anonymous && r.actor_id === null)).toBe(true);
    const q = "select actor_id, is_anonymous from public.mentions where post_id = $1 or comment_id = $2";
    expect(await asU(target, q, [ap.id, ac.id])).toEqual([]);
    expect(await asU(actor, q, [ap.id, ac.id])).toEqual([{ actor_id: actor, is_anonymous: true }, { actor_id: actor, is_anonymous: true }]);
    // LEGIT: a public mention is unchanged
    const pp = await post(actor, `public @${handle}`, false);
    expect(await asU(target, "select actor_id, is_anonymous from public.mentions where post_id = $1", [pp.id]))
      .toEqual([{ actor_id: actor, is_anonymous: false }]);
  });
});

// ============================================================================
describe("search_all respects anonymity", () => {
  let author, reader, blocked, token;
  beforeAll(async () => {
    token = `qzxanon${seq}`;
    author = await newUser({ full_name: "Searchable Author", username: `srch_auth_${seq}` });
    reader = await newUser();
    blocked = await newUser({ full_name: "Blocked Poster" });
    await post(author, `public ${token}`, false);
    await post(author, `anonymous ${token}`, true);
    await post(blocked, `blocked ${token}`, false);
    await asU(reader, "insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [reader, blocked]);
  });

  it("anonymous posts are found with author null for others and guests", async () => {
    for (const uid of [reader, null]) {
      const r = await search(uid, token);
      const anon = r.posts.find((p) => p.snippet.startsWith("anonymous"));
      expect(anon).toMatchObject({ author: null, is_anonymous: true, is_mine: false });
      expect(r.posts.find((p) => p.snippet.startsWith("public")).author).toMatchObject({ id: author, full_name: "Searchable Author" });
      expect(JSON.stringify(anon)).not.toContain(author);
    }
  });

  it("the author sees their own anonymous post as theirs", async () => {
    const r = await search(author, token);
    expect(r.posts.find((p) => p.snippet.startsWith("anonymous"))).toMatchObject({ is_mine: true, is_anonymous: true, author: { id: author } });
  });

  it("public posts by a member the caller blocked are skipped (guests still see them)", async () => {
    expect((await search(reader, token)).posts.map((p) => p.snippet.split(" ")[0]).sort()).toEqual(["anonymous", "public"]);
    expect((await search(null, token)).posts).toHaveLength(3);
    expect((await search(reader, token)).totals.posts).toBe(2);
  });

  it("people in anonymous mode are never listed, whatever they posted before", async () => {
    expect((await search(null, "Searchable Author")).people.map((p) => p.id)).toEqual([author]);
    await anonMode(author);
    expect((await search(null, "Searchable Author")).people).toEqual([]);
    await anonMode(author, false);
  });
});

// ============================================================================
describe("anonymous media: post-media/anon/<uuid>/<file>", () => {
  let author, other;
  const put = (uid, name, owner = uid) =>
    asU(uid, "insert into storage.objects (bucket_id, name, owner, owner_id) values ('post-media', $1, $2::uuid, $2::text) returning id", [name, owner]);
  const anonPath = () => `anon/${randomUUID()}/1700000000000-800x600.jpg`;
  const insMedia = (uid, anon, p, url = mediaUrl(p)) =>
    asU(uid, "insert into public.community_posts (user_id, content, is_anonymous, media_url, media_type, media_path) values ($1, null, $2, $3, 'image', $4) returning id",
      [uid, anon, url, p]);
  beforeAll(async () => {
    author = await newUser();
    other = await newUser();
  });

  it("any signed-in member uploads under anon/<uuid>/ as themselves; malformed paths, forged owners and guests are refused", async () => {
    await put(author, anonPath());
    for (const bad of ["anon/not-a-uuid/x.jpg", `anon/${randomUUID()}/a/b.jpg`, `anon/${randomUUID()}/..`, `anon/${randomUUID().toUpperCase()}/x.jpg`,
      `anon/${randomUUID()}/x y.jpg`, "anon/x.jpg"]) {
      await expect(put(author, bad), bad).rejects.toMatchObject(DENIED);
    }
    await expect(put(author, anonPath(), other)).rejects.toMatchObject(DENIED);     // owner must be the uploader
    await expect(asA("insert into storage.objects (bucket_id, name) values ('post-media', $1)", [anonPath()])).rejects.toMatchObject(DENIED);
  });

  it("only the uploader lists and deletes it; nobody can overwrite it", async () => {
    const p = anonPath();
    await put(author, p);
    const q = "select name from storage.objects where bucket_id = 'post-media' and name = $1";
    expect(await asU(author, q, [p])).toHaveLength(1);
    expect(await asU(other, q, [p])).toEqual([]);
    expect(await asA(q, [p])).toEqual([]);
    expect(await n(other, "delete from storage.objects where bucket_id = 'post-media' and name = $1", [p])).toBe(0);
    expect(await n(author, "update storage.objects set metadata = '{}' where bucket_id = 'post-media' and name = $1", [p])).toBe(0);
    expect(await n(author, "delete from storage.objects where bucket_id = 'post-media' and name = $1", [p])).toBe(1);
  });

  it("anonymous posts: only their author's own anon/ upload, matching URL and path", async () => {
    const p = anonPath();
    await put(author, p);
    const [{ id }] = await insMedia(author, true, p);
    expect(id).toBeTruthy();
    // someone else's anon upload, a missing object, a uid-folder path, URL ≠ path, a foreign host
    const theirs = anonPath();
    await put(other, theirs);
    await expect(insMedia(author, true, theirs)).rejects.toMatchObject({ ...CHECK, message: "invalid_media_url" });
    await expect(insMedia(author, true, anonPath())).rejects.toMatchObject(CHECK);
    const uidPath = `${author}/1700000000000.jpg`;
    await expect(insMedia(author, true, uidPath)).rejects.toMatchObject(CHECK);
    await expect(insMedia(author, true, p, mediaUrl(anonPath()))).rejects.toMatchObject(CHECK);
    await expect(insMedia(author, true, p, `https://evil.example/storage/v1/object/public/post-media/${p}`)).rejects.toMatchObject(CHECK);
    // LEGIT: replace with another own anon upload, then remove it
    const next = anonPath();
    await put(author, next);
    expect(await n(author, "update public.community_posts set media_url = $2, media_path = $3 where id = $1", [id, mediaUrl(next), next])).toBe(1);
    await expect(n(author, "update public.community_posts set media_url = $2, media_path = $3 where id = $1", [id, mediaUrl(uidPath), uidPath]))
      .rejects.toMatchObject(CHECK);
  });

  it("public posts cannot use the anon/ folder (their media stays in the author's folder)", async () => {
    const p = anonPath();
    await put(author, p);
    await expect(insMedia(author, false, p)).rejects.toMatchObject({ ...CHECK, message: "invalid_media_url" });
    const own = `${author}/1700000000001.jpg`;
    expect((await insMedia(author, false, own))[0].id).toBeTruthy();
  });

  it("is_anon_media_path() is a pure helper", async () => {
    const [r] = await h.sql("select provolatile v from pg_proc where oid = 'public.is_anon_media_path(text)'::regprocedure");
    expect(r.v).toBe("i");
  });
});

// ============================================================================
describe("realtime publication", () => {
  it("community_posts and post_comments (rows carry user_id) are no longer published", async () => {
    const t = (await h.sql("select tablename from pg_publication_tables where pubname = 'supabase_realtime'")).map((r) => r.tablename);
    expect(t).not.toContain("community_posts");
    expect(t).not.toContain("post_comments");
    expect(t).not.toContain("mentions");
    for (const keep of ["notifications", "messages"]) expect(t).toContain(keep);
    // 0013 also drops the reaction tables (nothing subscribes to them)
    for (const gone of ["post_likes", "post_dislikes", "post_reposts"]) expect(t).not.toContain(gone);
  });

  it("re-running 0012 keeps them out (and re-running 0005 then 0012 converges)", async () => {
    await h.exec(readFileSync(path.join(MIGRATIONS_DIR, "0005_batch2_community_ai_subscriptions.sql"), "utf8"));
    const mid = (await h.sql("select tablename from pg_publication_tables where pubname = 'supabase_realtime'")).map((r) => r.tablename);
    expect(mid).toContain("community_posts");                // 0005 re-adds it…
    await h.exec(readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), "utf8"));
    await h.exec(readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), "utf8"));
    const t = (await h.sql("select tablename from pg_publication_tables where pubname = 'supabase_realtime'")).map((r) => r.tablename);
    expect(t).not.toContain("community_posts");              // …0012 removes it again
    expect(t).not.toContain("post_comments");
    // and the read policy is the 0012 one again (0005 had re-opened it)
    const author = await newUser();
    const p = await post(author, "after rerun", true);
    expect(await asA("select id from public.community_posts where id = $1", [p.id])).toEqual([]);
    // 0005's world-readable storage listing (it would expose the owner of anon/ uploads) is gone again
    expect(await h.sql("select policyname from pg_policies where schemaname = 'storage' and policyname = 'post_media_public_read'")).toEqual([]);
    // the files after 0012 converge too (0005 had re-published and re-opened the reaction tables)
    for (const f of listMigrations().filter((x) => x > MIGRATION)) await h.exec(readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    const after = (await h.sql("select tablename from pg_publication_tables where pubname = 'supabase_realtime'")).map((r) => r.tablename);
    for (const gone of ["community_posts", "post_comments", "post_likes", "post_dislikes", "post_reposts"]) expect(after).not.toContain(gone);
  });
});

// ============================================================================
describe("backfill on a database that predates 0012", () => {
  let old;
  const oldU = (uid, q, p) => old.asUser(uid, (tx) => tx.sql(q, p));
  beforeAll(async () => {
    // 0012 is applied by the test itself; the files after it build on 0012.
    old = await createDb({ skip: ["0011_seed_questions.sql", MIGRATION, ...listMigrations().filter((f) => f > MIGRATION)] });
  });
  afterAll(async () => { await old?.close(); });

  it("snapshots every existing row from its author's current setting and strips anonymous actors", async () => {
    const mk = (meta) => old.createUser({ meta: { full_name: "Legacy User", ...meta } });
    const hidden = await mk({ username: "legacy_hidden" });
    const shown = await mk({ username: "legacy_shown" });
    const target = await mk({ username: "legacy_target" });
    await old.sql("update public.profiles set anonymous_community = true where id = $1", [hidden]);
    const [{ id: pubPost }] = await oldU(shown, "insert into public.community_posts (user_id, content) values ($1, 'legacy public') returning id", [shown]);
    const [{ id: anonPost }] = await oldU(hidden, "insert into public.community_posts (user_id, content) values ($1, 'legacy secret @legacy_target') returning id", [hidden]);
    const [{ id: anonComment }] = await oldU(hidden, "insert into public.post_comments (post_id, user_id, content) values ($1, $2, 'legacy note') returning id", [pubPost, hidden]);
    const before = await old.sql("select type, actor_id from public.notifications where actor_id = $1 order by type", [hidden]);
    expect(before.map((r) => r.type)).toEqual(["comment", "mention"]);   // pre-0012: the actor is stored

    const apply = () => old.exec(readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), "utf8"));
    await apply();
    const state = async () => ({
      posts: await old.sql("select id, is_anonymous from public.community_posts order by content"),
      comments: await old.sql("select id, is_anonymous from public.post_comments"),
      mentions: await old.sql("select is_anonymous from public.mentions"),
      notes: await old.sql("select type, actor_id, data from public.notifications where type in ('comment', 'mention') order by type"),
    });
    const s = await state();
    expect(s.posts).toEqual([{ id: pubPost, is_anonymous: false }, { id: anonPost, is_anonymous: true }]);
    expect(s.comments).toEqual([{ id: anonComment, is_anonymous: true }]);
    expect(s.mentions).toEqual([{ is_anonymous: true }]);
    expect(s.notes).toEqual([
      { type: "comment", actor_id: null, data: { anonymous: true } },
      { type: "mention", actor_id: null, data: { anonymous: true } },
    ]);
    expect(await old.asAnon((tx) => tx.sql("select id from public.community_posts where id = $1", [anonPost]))).toEqual([]);
    expect(await old.asUser(target, (tx) => tx.sql("select id from public.mentions"))).toEqual([]);
    await apply();                                   // idempotent
    expect(await state()).toEqual(s);
  });
});
