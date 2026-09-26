// Core database tests: the full migration chain on a fresh Supabase-like DB,
// plus RLS / trigger / RPC behaviour of every feature the app uses today.
// Every feature is checked for the positive path AND for another user / anon.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createDb, listMigrations, MIGRATIONS_DIR } from "./harness.js";
import { PUBLIC_PROFILE_COLUMNS, OWN_PROFILE_COLUMNS, BASIC_PROFILE_COLUMNS } from "@/lib/profile";

let h;
beforeAll(async () => { h = await createDb(); });
afterAll(async () => { await h?.close(); });

// ── helpers ──────────────────────────────────────────────────────────────────
const RLS_DENIED = { code: "42501" };                 // insufficient_privilege / RLS WITH CHECK
const UNIQUE = { code: "23505" };
const CHECK = { code: "23514" };
const raised = (msg) => new RegExp(`^${msg}$`);       // RAISE EXCEPTION '<msg>'

const newUser = (meta = {}, extra = {}) => h.createUser({ meta: { full_name: "Test User", ...meta }, ...extra });
/** rows as user */
const asU = (uid, q, p) => h.asUser(uid, (tx) => tx.sql(q, p));
/** rows as anon */
const asA = (q, p) => h.asAnon((tx) => tx.sql(q, p));
/** affected row count of a write as user */
const n = (uid, q, p) => h.asUser(uid, (tx) => tx.query(q, p)).then((r) => r.affectedRows);
const nAnon = (q, p) => h.asAnon((tx) => tx.query(q, p)).then((r) => r.affectedRows);
const cols = (list) => list.split(",").map((s) => s.trim()).filter(Boolean);
const riyadhToday = async () => (await h.sql("select ((now() at time zone 'Asia/Riyadh')::date)::text as d"))[0].d;

async function newPost(uid, content = "hello #jazira") {
  const [row] = await asU(uid, "insert into public.community_posts (user_id, content) values ($1, $2) returning id", [uid, content]);
  return row.id;
}
async function postCounts(id) {
  const [r] = await h.sql(
    "select likes_count, dislikes_count, comments_count, reposts_count from public.community_posts where id = $1", [id]);
  return r;
}

// ============================================================================
describe("harness emulates Supabase requests", () => {
  it("asUser / asAnon / asService set the role and JWT claims like PostgREST", async () => {
    const u = await newUser();
    const [x] = await h.asUser(u, (tx) => tx.sql(
      "select auth.uid()::text uid, auth.role() r, current_user cu, auth.jwt() ->> 'aud' aud, auth.email() is not null has_email"));
    expect(x).toEqual({ uid: u, r: "authenticated", cu: "authenticated", aud: "authenticated", has_email: true });
    const [y] = await h.asAnon((tx) => tx.sql("select auth.uid() uid, auth.role() r, current_user cu"));
    expect(y).toEqual({ uid: null, r: "anon", cu: "anon" });
    const [z] = await h.asService((tx) => tx.sql("select auth.role() r, current_user cu"));
    expect(z).toEqual({ r: "service_role", cu: "service_role" });
    const [after] = await h.sql("select current_user cu, auth.uid() uid");
    expect(after).toEqual({ cu: "postgres", uid: null });
  });

  it("errors propagate, the transaction rolls back, and { rollback: true } discards work", async () => {
    const u = await newUser();
    const ins = "insert into public.reviews (user_id, rating, content) values ($1, 3, $2)";
    await expect(h.asUser(u, async (tx) => { await tx.sql(ins, [u, "lost"]); await tx.sql("select 1/0"); }))
      .rejects.toMatchObject({ code: "22012" });
    await h.asUser(u, (tx) => tx.sql(ins, [u, "discarded"]), { rollback: true });
    expect(await h.sql("select content from public.reviews where user_id = $1", [u])).toEqual([]);
  });

  it("auth.users is not readable by API roles (like Supabase)", async () => {
    const u = await newUser();
    await expect(asU(u, "select id from auth.users")).rejects.toMatchObject(RLS_DENIED);
    await expect(asA("select id from auth.users")).rejects.toMatchObject(RLS_DENIED);
  });

  it("rejects top-level calls nested in a callback instead of deadlocking", async () => {
    const u = await newUser();
    await expect(h.asUser(u, () => h.sql("select 1"))).rejects.toThrow(/inside an as-authenticated callback/);
    await expect(h.asUser(u, () => h.asAnon((tx) => tx.sql("select 1")))).rejects.toThrow(/would deadlock/);
  });
});

// ============================================================================
describe("migration chain on a fresh project", () => {
  it("applies every supabase/migrations file in filename order, starting with 0000_core", () => {
    const files = listMigrations();
    expect(files[0]).toBe("0000_core.sql");
    expect(files).toContain("0008_social_layer.sql");
    expect(h.migrations).toEqual(files);
  });

  const APP_TABLES = [
    "profiles", "streaks", "user_preferences", "community_posts", "post_likes", "post_dislikes",
    "post_comments", "post_reposts", "reviews", "chat_history", "subscriptions", "payment_events",
    "referrals", "user_sessions", "follows", "user_social_settings", "notifications", "hashtags",
    "post_hashtags", "mentions", "conversations", "conversation_participants", "message_requests",
    "messages", "message_deletes", "blocks", "reports",
  ];

  it("creates every table the app uses, all with RLS enabled", async () => {
    const rows = await h.sql(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
        where ns.nspname = 'public' and c.relkind = 'r'`);
    const byName = Object.fromEntries(rows.map((r) => [r.relname, r.relrowsecurity]));
    for (const t of APP_TABLES) expect(byName[t], `table ${t}`).toBe(true);
    // no public table may exist without RLS
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it("does not create the legacy objects (posts/comments/likes/achievements/payments/leaderboard)", async () => {
    const [r] = await h.sql(
      `select to_regclass('public.posts') p, to_regclass('public.comments') c, to_regclass('public.likes') l,
              to_regclass('public.achievements') a, to_regclass('public.payments') pay,
              to_regclass('public.leaderboard') lb`);
    expect(Object.values(r).every((v) => v === null)).toBe(true);
  });

  it("has every column the app selects / writes (src/** audit)", async () => {
    const APP_COLUMNS = {
      profiles: [...new Set([
        ...cols(PUBLIC_PROFILE_COLUMNS), ...cols(OWN_PROFILE_COLUMNS), ...cols(BASIC_PROFILE_COLUMNS),
        "phone", "full_name_changed_at", "avatar_changed_at", "phone_changed_at", "updated_at",
      ])],
      community_posts: ["id", "user_id", "content", "media_url", "media_type", "media_path", "likes_count",
        "dislikes_count", "comments_count", "reposts_count", "created_at"],
      post_likes: ["id", "post_id", "user_id", "created_at"],
      post_dislikes: ["id", "post_id", "user_id"],
      post_reposts: ["id", "post_id", "user_id", "created_at"],
      post_comments: ["id", "post_id", "user_id", "content", "created_at"],
      reviews: ["id", "user_id", "rating", "content", "created_at"],
      chat_history: ["user_id", "session_id", "message_type", "content", "tokens_used", "created_at"],
      subscriptions: ["user_id", "tier", "status", "provider", "provider_subscription_id", "current_period_end", "updated_at"],
      payment_events: ["provider", "event_id", "event_type", "raw"],
      referrals: ["id", "referrer_id", "referred_id"],
      user_preferences: ["user_id", "sound", "ai_suggestions", "language", "updated_at"],
      user_sessions: ["user_id", "session_id", "device_label", "browser", "os", "device_type", "user_agent",
        "last_active_at", "created_at", "revoked_at", "location"],
      follows: ["follower_id", "followee_id", "notify_pref"],
      user_social_settings: ["user_id", "allow_message_requests", "hide_message_requests", "allow_messages",
        "notif_sound", "show_likes_on_profile", "show_reposts_on_profile", "notify_followers", "notify_mentions", "updated_at"],
      notifications: ["id", "user_id", "actor_id", "type", "read", "created_at", "post_id", "comment_id"],
      hashtags: ["id", "tag", "post_count"],
      post_hashtags: ["post_id", "hashtag_id"],
      conversations: ["id", "is_request", "last_message_at"],
      conversation_participants: ["conversation_id", "user_id", "last_read_at"],
      message_requests: ["recipient_id", "status", "created_at"],
      messages: ["conversation_id", "sender_id", "content", "created_at"],
    };
    const rows = await h.sql(
      "select table_name, column_name from information_schema.columns where table_schema = 'public'");
    const have = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
    const missing = Object.entries(APP_COLUMNS).flatMap(([t, cs]) => cs.map((c) => `${t}.${c}`)).filter((k) => !have.has(k));
    expect(missing).toEqual([]);
  });

  it("creates every RPC the app calls", async () => {
    const [r] = await h.sql(
      `select to_regprocedure('public.record_daily_activity()') a, to_regprocedure('public.update_full_name(text)') b,
              to_regprocedure('public.set_avatar(text)') c, to_regprocedure('public.update_phone(text)') d,
              to_regprocedure('public.update_bio(text)') e, to_regprocedure('public.unread_notification_count()') f`);
    expect(Object.values(r).every((v) => v !== null)).toBe(true);
  });

  it("creates the public avatars and post-media buckets", async () => {
    const rows = await h.sql("select id, public from storage.buckets order by id");
    expect(rows).toEqual([{ id: "avatars", public: true }, { id: "post-media", public: true }]);
  });

  it("publishes the realtime tables the app subscribes to", async () => {
    const rows = await h.sql("select tablename from pg_publication_tables where pubname = 'supabase_realtime'");
    const t = rows.map((r) => r.tablename);
    for (const name of ["notifications", "messages", "follows"]) {
      expect(t).toContain(name);
    }
    // 0012: rows of these tables carry the author of possibly anonymous
    // content, so they are no longer published (the feed polls instead).
    expect(t).not.toContain("community_posts");
    expect(t).not.toContain("post_comments");
    // 0013: nothing subscribes to reactions (each one used to fan out to
    // every open feed); their rows are also no longer public.
    for (const name of ["post_likes", "post_dislikes", "post_reposts"]) expect(t).not.toContain(name);
  });
});

// ============================================================================
describe("sign-up trigger (handle_new_user)", () => {
  it("creates the profile from raw_user_meta_data with safe defaults", async () => {
    const uid = await h.createUser({ meta: { full_name: "Ahmed Ali", username: "ahmed_core_1", phone: "+966512345678" } });
    const [p] = await h.sql("select * from public.profiles where id = $1", [uid]);
    expect(p).toMatchObject({
      username: "ahmed_core_1", full_name: "Ahmed Ali", phone: "+966512345678", role: "student",
      is_elite: false, xp: 0, show_elite_badge: true, anonymous_community: false,
      full_name_changed_at: null, avatar_url: null,
    });
  });

  it("never fails on a username collision — falls back to a unique generated handle", async () => {
    const a = await h.createUser({ meta: { full_name: "Sara Omar", username: "sara_dup" } });
    const b = await h.createUser({ meta: { full_name: "Sara Omar", username: "sara_dup" } });
    const rows = await h.sql("select id, username from public.profiles where id = any($1::uuid[])", [[a, b]]);
    expect(rows).toHaveLength(2);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.username]));
    expect(byId[a]).toBe("sara_dup");
    expect(byId[b]).not.toBe("sara_dup");
    expect(byId[b]).toMatch(/^sara_dup_[0-9a-f]{6,}$/);
  });

  it("lower-cases a valid requested handle and replaces an invalid one", async () => {
    const up = await h.createUser({ meta: { username: "Mixed_Case9" } });
    const bad = await h.createUser({ meta: { username: "Bad Name!" } });
    const tiny = await h.createUser({ meta: { username: "ab" } });
    const [r1] = await h.sql("select username from public.profiles where id = $1", [up]);
    const [r2] = await h.sql("select username from public.profiles where id = $1", [bad]);
    const [r3] = await h.sql("select username from public.profiles where id = $1", [tiny]);
    expect(r1.username).toBe("mixed_case9");
    expect(r2.username).toMatch(/^bad_name_[0-9a-f]{6,}$/);
    expect(r3.username).toMatch(/^ab_[0-9a-f]{6,}$/);
  });

  it.each([
    ["+966512345678", "+966512345678"],
    ["00966512345678", "+966512345678"],
    ["0512345678", "+966512345678"],
    ["512345678", "+966512345678"],
    ["51 234-5678", "+966512345678"],
    ["12345", null],
    ["+1 555 123 4567", null],
    ["not a phone", null],
  ])("normalises phone %s → %s", async (input, expected) => {
    const uid = await h.createUser({ meta: { phone: input } });
    const [p] = await h.sql("select phone from public.profiles where id = $1", [uid]);
    expect(p.phone).toBe(expected);
  });

  it.each([["Ahmed"], ["Ahmed Ali Hassan"], ["Ahmed 123"], ["Ahmed 😀"], [`${"a".repeat(40)} ${"b".repeat(30)}`]])(
    "drops a full_name that breaks the public-name rule (%s) so the app asks for one",
    async (name) => {
      const uid = await h.createUser({ meta: { full_name: name } });
      const [p] = await h.sql("select full_name from public.profiles where id = $1", [uid]);
      expect(p.full_name).toBeNull();
    },
  );

  it("keeps an Arabic two-word name and collapses whitespace", async () => {
    const uid = await h.createUser({ meta: { full_name: "  عبدالله   محمد " } });
    const [p] = await h.sql("select full_name from public.profiles where id = $1", [uid]);
    expect(p.full_name).toBe("عبدالله محمد");
  });

  it("never blocks sign-up on missing or malformed metadata", async () => {
    const none = await h.createUser({ meta: {} });
    const junk = await h.createUser({ meta: { full_name: 42, username: { x: 1 }, phone: true } });
    const rows = await h.sql(
      "select id, username, full_name, phone from public.profiles where id = any($1::uuid[])", [[none, junk]]);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.username).toMatch(/^[a-z0-9_]{3,40}$/);
      expect(r.full_name).toBeNull();
      expect(r.phone).toBeNull();
    }
  });

  it("is not callable through the API and deleting the auth user cascades", async () => {
    const [priv] = await h.sql(
      `select has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE') a,
              has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE') b`);
    expect(priv).toEqual({ a: false, b: false });

    const uid = await newUser();
    await newPost(uid);
    await h.sql("delete from auth.users where id = $1", [uid]);
    const [r] = await h.sql(
      `select (select count(*) from public.profiles where id = $1)::int p,
              (select count(*) from public.community_posts where user_id = $1)::int c`, [uid]);
    expect(r).toEqual({ p: 0, c: 0 });
  });
});

// ============================================================================
describe("profiles", () => {
  let alice, bob;
  beforeAll(async () => {
    alice = await newUser({ full_name: "Alice Smith" });
    bob = await newUser({ full_name: "Bob Jones" });
  });

  it("public columns are readable by anon and by other users", async () => {
    const a = await asA(`select ${PUBLIC_PROFILE_COLUMNS} from public.profiles where id = $1`, [alice]);
    const b = await asU(bob, `select ${PUBLIC_PROFILE_COLUMNS} from public.profiles where id = $1`, [alice]);
    expect(a[0].full_name).toBe("Alice Smith");
    expect(b[0].full_name).toBe("Alice Smith");
  });

  it("the owner can read their own settings columns (private ones via get_my_private_profile)", async () => {
    const [p] = await asU(alice, `select ${OWN_PROFILE_COLUMNS} from public.profiles where id = $1`, [alice]);
    expect(p.id).toBe(alice);
    // 0009: phone / *_changed_at are no longer granted on the table (they were
    // world-readable); the owner reads them through the definer RPC.
    const [priv] = await asU(alice,
      "select phone, full_name_changed_at, avatar_changed_at, phone_changed_at from public.get_my_private_profile()");
    expect(priv).toHaveProperty("phone");
  });

  it("the owner can update their own display prefs; updated_at moves", async () => {
    const [before] = await h.sql("select updated_at from public.profiles where id = $1", [alice]);
    const changed = await n(alice,
      "update public.profiles set show_elite_badge = false, anonymous_community = true where id = $1", [alice]);
    expect(changed).toBe(1);
    const [after] = await h.sql(
      "select show_elite_badge, anonymous_community, updated_at from public.profiles where id = $1", [alice]);
    expect(after.show_elite_badge).toBe(false);
    expect(after.anonymous_community).toBe(true);
    expect(after.updated_at.getTime()).toBeGreaterThanOrEqual(before.updated_at.getTime());
  });

  it("other users and anon cannot update or delete someone else's profile", async () => {
    expect(await n(bob, "update public.profiles set bio = 'pwned' where id = $1", [alice])).toBe(0);
    expect(await nAnon("update public.profiles set bio = 'pwned' where id = $1", [alice])).toBe(0);
    expect(await n(bob, "delete from public.profiles where id = $1", [alice])).toBe(0);
    expect(await n(alice, "delete from public.profiles where id = $1", [alice])).toBe(0); // no delete policy
    const [p] = await h.sql("select bio from public.profiles where id = $1", [alice]);
    expect(p.bio).toBeNull();
  });

  it("cannot insert a profile for another id (or as anon)", async () => {
    const orphan = (await h.sql("insert into auth.users (email) values ($1) returning id", [`orphan_${Date.now()}@t.local`]))[0].id;
    await h.sql("delete from public.profiles where id = $1", [orphan]); // pretend the trigger never ran
    await expect(asU(bob, "insert into public.profiles (id, username) values ($1, 'stolen_handle')", [orphan]))
      .rejects.toMatchObject(RLS_DENIED);
    await expect(asA("insert into public.profiles (id, username) values ($1, 'anon_handle')", [orphan]))
      .rejects.toMatchObject(RLS_DENIED);
  });

  it("enforces data-shape constraints", async () => {
    await expect(h.sql("update public.profiles set xp = -1 where id = $1", [alice])).rejects.toMatchObject(CHECK);
    await expect(h.sql("update public.profiles set role = 'owner' where id = $1", [alice])).rejects.toMatchObject(CHECK);
    await expect(h.sql("update public.profiles set username = 'Has Space' where id = $1", [alice])).rejects.toMatchObject(CHECK);
    await expect(h.sql("update public.profiles set phone = '0512345678' where id = $1", [alice])).rejects.toMatchObject(CHECK);
    await expect(h.sql("update public.profiles set full_name = 'One' where id = $1", [alice])).rejects.toMatchObject(CHECK);
    await expect(h.sql("update public.profiles set bio = $2 where id = $1", [alice, "x".repeat(301)])).rejects.toMatchObject(CHECK);
    await expect(h.sql("update public.profiles set username = $2 where id = $1", [alice, (await h.sql(
      "select username from public.profiles where id = $1", [bob]))[0].username])).rejects.toMatchObject(UNIQUE);
  });

  it("serves the Leaderboard component query (profiles ordered by xp) to anon and users", async () => {
    const top = await newUser({ full_name: "Top Scorer" });
    const second = await newUser({ full_name: "Second Place" });
    await h.sql("update public.profiles set xp = 900000 where id = $1", [top]);
    await h.sql("update public.profiles set xp = 800000 where id = $1", [second]);
    const q = "select id, username, full_name, avatar_url, xp, is_elite, role from public.profiles order by xp desc limit 2";
    expect((await asA(q)).map((r) => r.id)).toEqual([top, second]);
    expect((await asU(bob, q)).map((r) => r.xp)).toEqual([900000, 800000]);
  });
});

// ============================================================================
describe("community posts, interactions and counter triggers", () => {
  let author, fan, stranger, post;
  beforeAll(async () => {
    author = await newUser({ full_name: "Post Author" });
    fan = await newUser({ full_name: "Big Fan" });
    stranger = await newUser({ full_name: "Some Stranger" });
    post = await newPost(author);
  });

  it("posts are world-readable", async () => {
    expect(await asA("select id from public.community_posts where id = $1", [post])).toHaveLength(1);
    expect(await asU(fan, "select id from public.community_posts where id = $1", [post])).toHaveLength(1);
  });

  it("nobody can post as someone else; anon cannot post", async () => {
    await expect(asU(fan, "insert into public.community_posts (user_id, content) values ($1, 'x')", [author]))
      .rejects.toMatchObject(RLS_DENIED);
    await expect(asA("insert into public.community_posts (user_id, content) values ($1, 'x')", [author]))
      .rejects.toMatchObject(RLS_DENIED);
    await expect(asU(author, "insert into public.community_posts (user_id, media_type) values ($1, 'pdf')", [author]))
      .rejects.toMatchObject(CHECK);
  });

  it("only the owner can edit or delete a post", async () => {
    expect(await n(fan, "update public.community_posts set content = 'hijack' where id = $1", [post])).toBe(0);
    expect(await n(fan, "delete from public.community_posts where id = $1", [post])).toBe(0);
    expect(await nAnon("delete from public.community_posts where id = $1", [post])).toBe(0);
    expect(await n(author, "update public.community_posts set content = 'edited' where id = $1", [post])).toBe(1);
    const own = await newPost(author);
    expect(await n(author, "delete from public.community_posts where id = $1", [own])).toBe(1);
  });

  it("likes: insert/delete keep likes_count exact and notify the author", async () => {
    await asU(fan, "insert into public.post_likes (post_id, user_id) values ($1, $2)", [post, fan]);
    expect((await postCounts(post)).likes_count).toBe(1);
    // duplicate like rejected; the app's upsert(ignoreDuplicates) is a no-op
    await expect(asU(fan, "insert into public.post_likes (post_id, user_id) values ($1, $2)", [post, fan]))
      .rejects.toMatchObject(UNIQUE);
    await asU(fan, "insert into public.post_likes (post_id, user_id) values ($1, $2) on conflict (post_id, user_id) do nothing", [post, fan]);
    expect((await postCounts(post)).likes_count).toBe(1);

    const notes = await asU(author, "select type, actor_id, post_id from public.notifications where user_id = $1 and type = 'like'", [author]);
    expect(notes).toEqual([{ type: "like", actor_id: fan, post_id: post }]);

    // a stranger can neither like on the fan's behalf nor remove the fan's like
    await expect(asU(stranger, "insert into public.post_likes (post_id, user_id) values ($1, $2)", [post, fan]))
      .rejects.toMatchObject(RLS_DENIED);
    expect(await n(stranger, "delete from public.post_likes where post_id = $1 and user_id = $2", [post, fan])).toBe(0);
    await expect(asA("insert into public.post_likes (post_id, user_id) values ($1, $2)", [post, fan]))
      .rejects.toMatchObject(RLS_DENIED);

    expect(await n(fan, "delete from public.post_likes where post_id = $1 and user_id = $2", [post, fan])).toBe(1);
    expect((await postCounts(post)).likes_count).toBe(0);
  });

  it("liking your own post does not notify yourself", async () => {
    const mine = await newPost(stranger);
    await asU(stranger, "insert into public.post_likes (post_id, user_id) values ($1, $2)", [mine, stranger]);
    const [c] = await h.sql("select count(*)::int c from public.notifications where post_id = $1", [mine]);
    expect(c.c).toBe(0);
  });

  it("dislikes: counted, owner-only removal, no notification", async () => {
    const notes = async () => (await h.sql("select count(*)::int c from public.notifications where user_id = $1", [author]))[0].c;
    const before = await notes();
    await asU(fan, "insert into public.post_dislikes (post_id, user_id) values ($1, $2)", [post, fan]);
    expect((await postCounts(post)).dislikes_count).toBe(1);
    expect(await notes()).toBe(before);
    expect(await n(stranger, "delete from public.post_dislikes where post_id = $1", [post])).toBe(0);
    await expect(asU(stranger, "insert into public.post_dislikes (post_id, user_id) values ($1, $2)", [post, fan]))
      .rejects.toMatchObject(RLS_DENIED);
    expect(await n(fan, "delete from public.post_dislikes where post_id = $1 and user_id = $2", [post, fan])).toBe(1);
    expect((await postCounts(post)).dislikes_count).toBe(0);
  });

  it("comments: counted, notify the author with the comment id, owner-only edit/delete", async () => {
    const [cm] = await asU(fan,
      "insert into public.post_comments (post_id, user_id, content) values ($1, $2, 'nice') returning id", [post, fan]);
    expect((await postCounts(post)).comments_count).toBe(1);
    const notes = await asU(author,
      "select type, actor_id, comment_id from public.notifications where user_id = $1 and type = 'comment'", [author]);
    expect(notes).toEqual([{ type: "comment", actor_id: fan, comment_id: cm.id }]);

    await expect(asU(stranger, "insert into public.post_comments (post_id, user_id, content) values ($1, $2, 'x')", [post, fan]))
      .rejects.toMatchObject(RLS_DENIED);
    expect(await n(stranger, "update public.post_comments set content = 'hijack' where id = $1", [cm.id])).toBe(0);
    expect(await n(stranger, "delete from public.post_comments where id = $1", [cm.id])).toBe(0);
    expect(await asA("select id from public.post_comments where id = $1", [cm.id])).toHaveLength(1);

    expect(await n(fan, "delete from public.post_comments where id = $1", [cm.id])).toBe(1);
    expect((await postCounts(post)).comments_count).toBe(0);
  });

  it("reposts: counted, notify the author, owner-only removal", async () => {
    await asU(fan, "insert into public.post_reposts (post_id, user_id) values ($1, $2)", [post, fan]);
    expect((await postCounts(post)).reposts_count).toBe(1);
    const notes = await asU(author, "select actor_id from public.notifications where user_id = $1 and type = 'repost'", [author]);
    expect(notes).toEqual([{ actor_id: fan }]);
    expect(await n(stranger, "delete from public.post_reposts where post_id = $1", [post])).toBe(0);
    expect(await n(fan, "delete from public.post_reposts where post_id = $1 and user_id = $2", [post, fan])).toBe(1);
    expect((await postCounts(post)).reposts_count).toBe(0);
  });

  it("deleting a post cascades its interactions and notifications", async () => {
    const p = await newPost(author);
    await asU(fan, "insert into public.post_likes (post_id, user_id) values ($1, $2)", [p, fan]);
    await asU(fan, "insert into public.post_comments (post_id, user_id, content) values ($1, $2, 'c')", [p, fan]);
    expect(await n(author, "delete from public.community_posts where id = $1", [p])).toBe(1);
    const [r] = await h.sql(
      `select (select count(*) from public.post_likes where post_id = $1)::int l,
              (select count(*) from public.post_comments where post_id = $1)::int c,
              (select count(*) from public.notifications where post_id = $1)::int nt`, [p]);
    expect(r).toEqual({ l: 0, c: 0, nt: 0 });
  });
});

// ============================================================================
describe("follows + notifications", () => {
  let a, b, c;
  beforeAll(async () => {
    a = await newUser({ full_name: "Follower Person" });
    b = await newUser({ full_name: "Followed Person" });
    c = await newUser({ full_name: "Third Person" });
  });

  it("following notifies the followee; follows are publicly countable", async () => {
    await asU(a, "insert into public.follows (follower_id, followee_id) values ($1, $2)", [a, b]);
    const notes = await asU(b, "select type, actor_id, read from public.notifications where user_id = $1", [b]);
    expect(notes).toEqual([{ type: "follow", actor_id: a, read: false }]);
    const [cnt] = await asA("select count(*)::int c from public.follows where followee_id = $1", [b]);
    expect(cnt.c).toBe(1);
  });

  it("rejects self-follow, duplicates and following on someone else's behalf", async () => {
    await expect(asU(a, "insert into public.follows (follower_id, followee_id) values ($1, $1)", [a])).rejects.toThrow();
    await expect(asU(a, "insert into public.follows (follower_id, followee_id) values ($1, $2)", [a, b])).rejects.toMatchObject(UNIQUE);
    await expect(asU(c, "insert into public.follows (follower_id, followee_id) values ($1, $2)", [b, c])).rejects.toMatchObject(RLS_DENIED);
    await expect(asA("insert into public.follows (follower_id, followee_id) values ($1, $2)", [a, c])).rejects.toMatchObject(RLS_DENIED);
  });

  it("notify_pref: follower can change it (valid values only); others cannot", async () => {
    expect(await n(a, "update public.follows set notify_pref = 'posts' where follower_id = $1 and followee_id = $2", [a, b])).toBe(1);
    await expect(n(a, "update public.follows set notify_pref = 'loud' where follower_id = $1", [a])).rejects.toMatchObject(CHECK);
    expect(await n(b, "update public.follows set notify_pref = 'off' where follower_id = $1", [a])).toBe(0);
  });

  it("unread_notification_count() counts only the caller's unread rows; anon has no access", async () => {
    const count = (uid) => h.asUser(uid, (tx) => tx.sql("select public.unread_notification_count() as c")).then((r) => r[0].c);
    expect(await count(b)).toBe(1);
    expect(await count(a)).toBe(0);
    expect(await count(c)).toBe(0);
    await expect(asA("select public.unread_notification_count()")).rejects.toMatchObject(RLS_DENIED);
  });

  it("notifications are private to the recipient", async () => {
    expect(await asU(a, "select id from public.notifications where user_id = $1", [b])).toHaveLength(0);
    expect(await asU(c, "select id from public.notifications where user_id = $1", [b])).toHaveLength(0);
    expect(await asA("select id from public.notifications where user_id = $1", [b])).toHaveLength(0);
    expect(await n(c, "update public.notifications set read = true where user_id = $1", [b])).toBe(0);
    expect(await n(b, "update public.notifications set read = true where user_id = $1 and read = false", [b])).toBe(1);
  });

  it("only the follower can unfollow", async () => {
    expect(await n(b, "delete from public.follows where follower_id = $1 and followee_id = $2", [a, b])).toBe(0);
    expect(await n(a, "delete from public.follows where follower_id = $1 and followee_id = $2", [a, b])).toBe(1);
  });
});

// ============================================================================
describe("reviews", () => {
  let owner, other, rid;
  beforeAll(async () => {
    owner = await newUser({ full_name: "Review Owner" });
    other = await newUser({ full_name: "Review Other" });
  });

  it("owner creates; everyone (incl. anon) reads", async () => {
    [{ id: rid }] = await asU(owner, "insert into public.reviews (user_id, rating, content) values ($1, 5, 'great') returning id", [owner]);
    expect(await asA("select id from public.reviews where id = $1", [rid])).toHaveLength(1);
    expect(await asU(other, "select id from public.reviews where id = $1", [rid])).toHaveLength(1);
  });

  it("cannot review as someone else, as anon, or out of the 1–5 range", async () => {
    await expect(asU(other, "insert into public.reviews (user_id, rating) values ($1, 1)", [owner])).rejects.toMatchObject(RLS_DENIED);
    await expect(asA("insert into public.reviews (user_id, rating) values ($1, 1)", [owner])).rejects.toMatchObject(RLS_DENIED);
    await expect(asU(owner, "insert into public.reviews (user_id, rating) values ($1, 6)", [owner])).rejects.toMatchObject(CHECK);
  });

  it("only the owner edits / deletes", async () => {
    expect(await n(other, "update public.reviews set rating = 1 where id = $1", [rid])).toBe(0);
    expect(await n(other, "delete from public.reviews where id = $1", [rid])).toBe(0);
    expect(await nAnon("delete from public.reviews where id = $1", [rid])).toBe(0);
    expect(await n(owner, "update public.reviews set rating = 4, content = 'good' where id = $1", [rid])).toBe(1);
    expect(await n(owner, "delete from public.reviews where id = $1", [rid])).toBe(1);
  });
});

// ============================================================================
describe("user_preferences", () => {
  it("own upsert (insert then update), private to the owner", async () => {
    const u = await newUser();
    const other = await newUser();
    const upsert = `insert into public.user_preferences (user_id, sound, ai_suggestions, language, updated_at)
                    values ($1, $2, true, $3, now())
                    on conflict (user_id) do update set sound = excluded.sound, language = excluded.language, updated_at = now()`;
    await asU(u, upsert, [u, false, "ar"]);
    await asU(u, upsert, [u, true, "en"]);
    expect(await asU(u, "select sound, language from public.user_preferences where user_id = $1", [u]))
      .toEqual([{ sound: true, language: "en" }]);
    expect(await asU(other, "select * from public.user_preferences where user_id = $1", [u])).toHaveLength(0);
    expect(await asA("select * from public.user_preferences where user_id = $1", [u])).toHaveLength(0);
    expect(await n(other, "update public.user_preferences set sound = false where user_id = $1", [u])).toBe(0);
    await expect(asU(other, upsert, [u, false, "ar"])).rejects.toMatchObject(RLS_DENIED);
    await expect(asU(u, upsert, [u, false, "fr"])).rejects.toMatchObject(CHECK);
  });
});

// ============================================================================
describe("user_sessions", () => {
  it("own upsert/touch/revoke incl. location; invisible and immutable to others", async () => {
    const u = await newUser();
    const other = await newUser();
    const up = `insert into public.user_sessions (user_id, session_id, device_label, browser, os, device_type, user_agent, last_active_at)
                values ($1, $2, 'Laptop', 'Chrome', 'Windows', 'desktop', 'UA', now())
                on conflict (user_id, session_id) do update set last_active_at = excluded.last_active_at`;
    await asU(u, up, [u, "sid-1"]);
    await asU(u, up, [u, "sid-1"]);
    expect(await n(u, "update public.user_sessions set location = 'Riyadh, SA' where user_id = $1 and session_id = 'sid-1'", [u])).toBe(1);
    const mine = await asU(u, "select session_id, location, revoked_at from public.user_sessions where user_id = $1", [u]);
    expect(mine).toEqual([{ session_id: "sid-1", location: "Riyadh, SA", revoked_at: null }]);

    expect(await asU(other, "select * from public.user_sessions where user_id = $1", [u])).toHaveLength(0);
    expect(await asA("select * from public.user_sessions where user_id = $1", [u])).toHaveLength(0);
    expect(await n(other, "update public.user_sessions set revoked_at = now() where user_id = $1", [u])).toBe(0);
    expect(await n(other, "delete from public.user_sessions where user_id = $1", [u])).toBe(0);
    await expect(asU(other, up, [u, "sid-x"])).rejects.toMatchObject(RLS_DENIED);

    expect(await n(u, "update public.user_sessions set revoked_at = now() where user_id = $1 and session_id = 'sid-1'", [u])).toBe(1);
  });
});

// ============================================================================
describe("record_daily_activity (Asia/Riyadh streaks)", () => {
  const call = (uid) => h.asUser(uid, (tx) => tx.sql("select public.record_daily_activity() as s")).then((r) => r[0].s);
  const streak = async (uid) => (await h.sql(
    "select current_streak, longest_streak, last_active_date::text d from public.streaks where user_id = $1", [uid]))[0];

  it("rejects anon", async () => {
    // 0009 revokes EXECUTE from anon; the function's own auth.uid() check still guards a JWT without sub.
    await expect(h.asAnon((tx) => tx.sql("select public.record_daily_activity()"))).rejects.toMatchObject(RLS_DENIED);
    await expect(h.asRole("authenticated", {}, (tx) => tx.sql("select public.record_daily_activity()")))
      .rejects.toThrow(raised("not_authenticated"));
  });

  it("starts at 0, never double-counts a day, increments on consecutive days, resets after a gap", async () => {
    const u = await newUser();
    const today = await riyadhToday();
    expect(await call(u)).toBe(0);
    expect(await streak(u)).toEqual({ current_streak: 0, longest_streak: 0, d: today });
    expect(await call(u)).toBe(0);

    await h.sql(`update public.streaks set current_streak = 3, longest_streak = 3,
                 last_active_date = (now() at time zone 'Asia/Riyadh')::date - 1 where user_id = $1`, [u]);
    expect(await call(u)).toBe(4);
    expect(await call(u)).toBe(4);
    expect(await streak(u)).toEqual({ current_streak: 4, longest_streak: 4, d: today });

    await h.sql(`update public.streaks set last_active_date = (now() at time zone 'Asia/Riyadh')::date - 2 where user_id = $1`, [u]);
    expect(await call(u)).toBe(0);
    expect(await streak(u)).toEqual({ current_streak: 0, longest_streak: 4, d: today });
  });

  it("streak rows are private and not client-writable", async () => {
    const u = await newUser();
    const other = await newUser();
    await call(u);
    expect(await asU(u, "select user_id from public.streaks where user_id = $1", [u])).toHaveLength(1);
    expect(await asU(other, "select user_id from public.streaks where user_id = $1", [u])).toHaveLength(0);
    expect(await n(u, "update public.streaks set current_streak = 999 where user_id = $1", [u])).toBe(0);
    await expect(asU(other, "insert into public.streaks (user_id, current_streak) values ($1, 999)", [other]))
      .rejects.toMatchObject(RLS_DENIED);
  });
});

// ============================================================================
describe("profile RPCs: validation and cooldowns", () => {
  const rpc = (uid, fn, arg) => h.asUser(uid, (tx) => tx.sql(`select public.${fn}($1) as r`, [arg])).then((r) => r[0].r);
  const prof = async (uid) => (await h.sql("select * from public.profiles where id = $1", [uid]))[0];
  const ago = (uid, col, interval) => h.sql(`update public.profiles set ${col} = now() - $2::interval where id = $1`, [uid, interval]);
  const makeElite = (uid) => h.asService((tx) => tx.sql("update public.profiles set is_elite = true where id = $1", [uid]));

  it("every RPC rejects anon", async () => {
    for (const [fn, arg] of [["update_full_name", "Anon Person"], ["set_avatar", "https://x/y.png"], ["update_phone", "512345678"], ["update_bio", "hi"]]) {
      // 0009: anon has no EXECUTE any more (was: callable, refused inside) …
      await expect(h.asAnon((tx) => tx.sql(`select public.${fn}($1)`, [arg]))).rejects.toMatchObject(RLS_DENIED);
      // … and each function still refuses a missing auth.uid() itself.
      await expect(h.asRole("authenticated", {}, (tx) => tx.sql(`select public.${fn}($1)`, [arg])))
        .rejects.toThrow(raised("not_authenticated"));
    }
  });

  it("update_full_name: two words, letters only; free users wait 14 days", async () => {
    const u = await newUser({ full_name: "First Name" });
    const other = await newUser({ full_name: "Other Person" });
    for (const bad of ["Single", "Three Word Name", "Name 123", "Name 😀", "Name-Dash Two", ""]) {
      await expect(rpc(u, "update_full_name", bad)).rejects.toThrow(raised("invalid_name_format"));
    }
    await rpc(u, "update_full_name", "  Sara Omar ");
    const p = await prof(u);
    expect(p.full_name).toBe("Sara Omar");
    expect(p.full_name_changed_at).toBeInstanceOf(Date);
    expect((await prof(other)).full_name).toBe("Other Person");

    await expect(rpc(u, "update_full_name", "Nora Omar")).rejects.toThrow(raised("name_cooldown"));
    await ago(u, "full_name_changed_at", "13 days");
    await expect(rpc(u, "update_full_name", "Nora Omar")).rejects.toThrow(raised("name_cooldown"));
    await ago(u, "full_name_changed_at", "15 days");
    await rpc(u, "update_full_name", "نورة عمر");
    expect((await prof(u)).full_name).toBe("نورة عمر");
  });

  it("update_full_name: elite users wait 24 hours", async () => {
    const u = await newUser();
    await makeElite(u);
    await rpc(u, "update_full_name", "Elite Member");
    await ago(u, "full_name_changed_at", "23 hours");
    await expect(rpc(u, "update_full_name", "Elite Again")).rejects.toThrow(raised("name_cooldown"));
    await ago(u, "full_name_changed_at", "25 hours");
    await rpc(u, "update_full_name", "Elite Again");
    expect((await prof(u)).full_name).toBe("Elite Again");
  });

  it("set_avatar: 10-day cooldown for free users, elite bypasses", async () => {
    // 0009: set_avatar only accepts this project's public avatars/<uid>/… URL
    // (it used to accept any URL, e.g. an external tracking pixel).
    const av = (uid, file) => `https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/avatars/${uid}/${file}`;
    const u = await newUser();
    await rpc(u, "set_avatar", av(u, "1.png"));
    expect((await prof(u)).avatar_url).toBe(av(u, "1.png"));
    await expect(rpc(u, "set_avatar", av(u, "2.png"))).rejects.toThrow(raised("avatar_cooldown"));
    await ago(u, "avatar_changed_at", "11 days");
    await rpc(u, "set_avatar", av(u, "2.png"));
    expect((await prof(u)).avatar_url).toBe(av(u, "2.png"));

    const e = await newUser();
    await makeElite(e);
    await rpc(e, "set_avatar", av(e, "a.png"));
    await rpc(e, "set_avatar", av(e, "b.png"));
    expect((await prof(e)).avatar_url).toBe(av(e, "b.png"));
  });

  it("update_phone: 9 local digits → +966…, 24h cooldown, empty clears", async () => {
    const u = await newUser();
    await expect(rpc(u, "update_phone", "12345")).rejects.toThrow(raised("invalid_phone"));
    await rpc(u, "update_phone", "51-234-5678");
    expect((await prof(u)).phone).toBe("+966512345678");
    await expect(rpc(u, "update_phone", "598765432")).rejects.toThrow(raised("phone_cooldown"));
    await ago(u, "phone_changed_at", "25 hours");
    await rpc(u, "update_phone", "");
    expect((await prof(u)).phone).toBeNull();
  });

  it("update_bio: trims, empty → null, max 300 chars, own row only", async () => {
    const u = await newUser();
    const other = await newUser();
    expect(await rpc(u, "update_bio", "  hello  ")).toBe("hello");
    expect((await prof(u)).bio).toBe("hello");
    expect(await rpc(u, "update_bio", "   ")).toBeNull();
    await expect(rpc(u, "update_bio", "x".repeat(301))).rejects.toThrow(raised("bio_too_long"));
    expect(await rpc(u, "update_bio", "x".repeat(300))).toHaveLength(300);
    expect((await prof(other)).bio).toBeNull();
  });
});

// ============================================================================
describe("referrals", () => {
  let referrer, invited, stranger;
  beforeAll(async () => {
    referrer = await newUser({ full_name: "Refer Rer" });
    invited = await newUser({ full_name: "Invited Friend" });
    stranger = await newUser({ full_name: "Stranger Danger" });
  });

  it("the invited account records its referrer once; both parties can see it", async () => {
    const ins = `insert into public.referrals (referrer_id, referred_id) values ($1, $2)
                 on conflict (referred_id) do nothing`;
    await asU(invited, ins, [referrer, invited]);
    await asU(invited, ins, [stranger, invited]); // app's upsert(ignoreDuplicates): no second credit
    await expect(asU(invited, "insert into public.referrals (referrer_id, referred_id) values ($1, $2)", [stranger, invited]))
      .rejects.toMatchObject(UNIQUE);

    const [c] = await asU(referrer, "select count(*)::int c from public.referrals where referrer_id = $1", [referrer]);
    expect(c.c).toBe(1);
    expect(await asU(invited, "select referrer_id from public.referrals where referred_id = $1", [invited]))
      .toEqual([{ referrer_id: referrer }]);
    expect(await asU(stranger, "select * from public.referrals where referred_id = $1", [invited])).toHaveLength(0);
    expect(await asA("select * from public.referrals where referred_id = $1", [invited])).toHaveLength(0);
  });

  it("rejects self-referral and recording a referral for another account", async () => {
    await expect(asU(stranger, "insert into public.referrals (referrer_id, referred_id) values ($1, $1)", [stranger])).rejects.toThrow();
    const fresh = await newUser();
    await expect(asU(stranger, "insert into public.referrals (referrer_id, referred_id) values ($1, $2)", [stranger, fresh]))
      .rejects.toMatchObject(RLS_DENIED);
    await expect(asA("insert into public.referrals (referrer_id, referred_id) values ($1, $2)", [stranger, fresh]))
      .rejects.toMatchObject(RLS_DENIED);
  });

  it("clients cannot rewrite or delete referrals", async () => {
    expect(await n(invited, "update public.referrals set referrer_id = $1 where referred_id = $2", [stranger, invited])).toBe(0);
    expect(await n(invited, "delete from public.referrals where referred_id = $1", [invited])).toBe(0);
    expect(await n(referrer, "delete from public.referrals where referrer_id = $1", [referrer])).toBe(0);
  });
});

// ============================================================================
describe("chat_history (AI assistant)", () => {
  it("own insert/read/delete only", async () => {
    const u = await newUser();
    const other = await newUser();
    await asU(u, "insert into public.chat_history (user_id, session_id, message_type, content) values ($1, 's1', 'user', 'hi')", [u]);
    expect(await asU(u, "select content from public.chat_history where user_id = $1", [u])).toEqual([{ content: "hi" }]);
    expect(await asU(other, "select * from public.chat_history where user_id = $1", [u])).toHaveLength(0);
    expect(await asA("select * from public.chat_history where user_id = $1", [u])).toHaveLength(0);
    await expect(asU(other, "insert into public.chat_history (user_id, session_id, message_type, content) values ($1, 's', 'user', 'x')", [u]))
      .rejects.toMatchObject(RLS_DENIED);
    await expect(asU(u, "insert into public.chat_history (user_id, session_id, message_type, content) values ($1, 's', 'system', 'x')", [u]))
      .rejects.toMatchObject(CHECK);
    expect(await n(other, "delete from public.chat_history where user_id = $1", [u])).toBe(0);
    expect(await n(u, "update public.chat_history set content = 'edited' where user_id = $1", [u])).toBe(0); // no update policy
    expect(await n(u, "delete from public.chat_history where user_id = $1", [u])).toBe(1);
  });
});

// ============================================================================
describe("subscriptions + payment_events", () => {
  it("only the service role writes; users read only their own row", async () => {
    const u = await newUser();
    const other = await newUser();
    await h.asService((tx) => tx.sql(
      `insert into public.subscriptions (user_id, tier, status, provider, current_period_end)
       values ($1, 'elite', 'active', 'lemonsqueezy', now() + interval '30 days')
       on conflict (user_id) do update set tier = excluded.tier, status = excluded.status`, [u]));

    expect(await asU(u, "select tier, status from public.subscriptions where user_id = $1", [u])).toEqual([{ tier: "elite", status: "active" }]);
    expect(await asU(other, "select * from public.subscriptions where user_id = $1", [u])).toHaveLength(0);
    expect(await asA("select * from public.subscriptions where user_id = $1", [u])).toHaveLength(0);

    await expect(asU(other, "insert into public.subscriptions (user_id, tier, status) values ($1, 'elite', 'active')", [other]))
      .rejects.toMatchObject(RLS_DENIED);
    expect(await n(u, "update public.subscriptions set current_period_end = now() + interval '10 years' where user_id = $1", [u])).toBe(0);
    expect(await n(u, "delete from public.subscriptions where user_id = $1", [u])).toBe(0);
  });

  it("payment_events are service-role only", async () => {
    const u = await newUser();
    await h.asService((tx) => tx.sql(
      "insert into public.payment_events (provider, event_id, event_type, raw) values ('lemonsqueezy', $1, 'order_created', '{}')",
      [`evt_${u}`]));
    await expect(h.asService((tx) => tx.sql(
      "insert into public.payment_events (provider, event_id) values ('lemonsqueezy', $1)", [`evt_${u}`]))).rejects.toMatchObject(UNIQUE);
    expect(await asU(u, "select * from public.payment_events")).toHaveLength(0);
    expect(await asA("select * from public.payment_events")).toHaveLength(0);
    await expect(asU(u, "insert into public.payment_events (provider, event_id) values ('x', 'y')")).rejects.toMatchObject(RLS_DENIED);
  });
});

// ============================================================================
describe("storage: avatars (and post-media) owner-folder policies", () => {
  let a, b;
  const put = (uid, bucket, name) =>
    asU(uid, "insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3) returning id", [bucket, name, uid]);
  beforeAll(async () => {
    a = await newUser({ full_name: "Avatar Owner" });
    b = await newUser({ full_name: "Avatar Thief" });
  });

  it("storage.foldername has Supabase semantics", async () => {
    const [r] = await h.sql("select storage.foldername('a/b/c.png') f, storage.foldername('c.png') root, storage.filename('a/b/c.png') fn, storage.extension('a/b/c.tar.png') ext");
    expect(r).toEqual({ f: ["a", "b"], root: [], fn: "c.png", ext: "png" });
  });

  it("owner uploads into their own folder; only the owner can list it (public URLs need no RLS)", async () => {
    await put(a, "avatars", `${a}/avatar-1.png`);
    // 0009: the buckets stay public (/object/public/… bypasses RLS), but the
    // table is no longer listable by everyone — that enumerated every user id.
    expect(await asA("select name from storage.objects where bucket_id = 'avatars' and name = $1", [`${a}/avatar-1.png`])).toHaveLength(0);
    expect(await asU(a, "select name from storage.objects where bucket_id = 'avatars' and name = $1", [`${a}/avatar-1.png`])).toHaveLength(1);
    await put(a, "post-media", `${a}/1.jpg`);
  });

  it("rejects uploads into another user's folder, at the bucket root, or by anon", async () => {
    await expect(put(b, "avatars", `${a}/evil.png`)).rejects.toMatchObject(RLS_DENIED);
    await expect(put(b, "avatars", "root.png")).rejects.toMatchObject(RLS_DENIED);
    await expect(put(b, "post-media", `${a}/evil.jpg`)).rejects.toMatchObject(RLS_DENIED);
    await expect(asA("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${a}/anon.png`]))
      .rejects.toMatchObject(RLS_DENIED);
  });

  it("only the owner can replace (update) or delete their files", async () => {
    const name = `${a}/avatar-1.png`;
    expect(await n(b, "update storage.objects set metadata = '{\"x\":1}' where bucket_id = 'avatars' and name = $1", [name])).toBe(0);
    expect(await n(b, "delete from storage.objects where bucket_id = 'avatars' and name = $1", [name])).toBe(0);
    expect(await nAnon("delete from storage.objects where bucket_id = 'avatars' and name = $1", [name])).toBe(0);
    // owner cannot move a file into someone else's folder
    await expect(n(a, "update storage.objects set name = $2 where bucket_id = 'avatars' and name = $1", [name, `${b}/moved.png`]))
      .rejects.toMatchObject(RLS_DENIED);
    expect(await n(a, "update storage.objects set metadata = '{\"size\":1}' where bucket_id = 'avatars' and name = $1", [name])).toBe(1);
    expect(await n(a, "delete from storage.objects where bucket_id = 'avatars' and name = $1", [name])).toBe(1);
  });
});

// ============================================================================
describe("re-running the chain", () => {
  it("every migration is idempotent (re-applying the whole chain succeeds)", async () => {
    for (const f of listMigrations()) {
      await expect(h.exec(readFileSync(path.join(MIGRATIONS_DIR, f), "utf8")), f).resolves.toBeDefined();
    }
    const [r] = await h.sql("select count(*)::int c from pg_trigger where tgname = 'on_auth_user_created'");
    expect(r.c).toBe(1);
  });
});
