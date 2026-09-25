// Security regression tests for supabase/migrations/0009_security_hardening.sql.
//
// Every block pairs the ATTACK found in the 0000–0008 audit (must now fail)
// with the LEGITIMATE flow that has to keep working (owner, other user, anon,
// SECURITY DEFINER RPCs, service role). Runs the full migration chain, so a
// later migration that re-opens a hole fails here too.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb } from "./harness.js";
import { PUBLIC_PROFILE_COLUMNS, OWN_PROFILE_COLUMNS, BASIC_PROFILE_COLUMNS } from "@/lib/profile";

let h;
beforeAll(async () => { h = await createDb(); });
afterAll(async () => { await h?.close(); });

// ── helpers ──────────────────────────────────────────────────────────────────
const DENIED = { code: "42501" };   // permission denied (grants) or RLS WITH CHECK
const CHECK = { code: "23514" };
const UNIQUE = { code: "23505" };
const raised = (msg) => new RegExp(`^${msg}$`);

const ORIGIN = "https://abcdefghijklmnopqrst.supabase.co";
const avatarUrl = (uid, file = "avatar-1.png", origin = ORIGIN) =>
  `${origin}/storage/v1/object/public/avatars/${uid}/${file}?t=1700000000000`;
const mediaUrl = (path, origin = ORIGIN) => `${origin}/storage/v1/object/public/post-media/${path}`;

let seq = 0;
const newUser = (meta = {}, extra = {}) => h.createUser({ meta: { full_name: "Test User", ...meta }, ...extra });
const handleUser = (prefix) => newUser({ username: `${prefix}_${++seq}` });
const asU = (uid, q, p) => h.asUser(uid, (tx) => tx.sql(q, p));
const asA = (q, p) => h.asAnon((tx) => tx.sql(q, p));
const n = (uid, q, p) => h.asUser(uid, (tx) => tx.query(q, p)).then((r) => r.affectedRows);
/** select public.fn($1, $2, …) as r → r */
const rpc = (uid, fn, ...args) =>
  h.asUser(uid, (tx) => tx.sql(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args))
    .then((rows) => rows[0].r);
const prof = async (uid) => (await h.sql("select * from public.profiles where id = $1", [uid]))[0];

async function newPost(uid, content = "hello") {
  const [row] = await asU(uid, "insert into public.community_posts (user_id, content) values ($1, $2) returning id", [uid, content]);
  return row.id;
}
const block = (blocker, blocked) =>
  asU(blocker, "insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [blocker, blocked]);
const follow = (a, b) => asU(a, "insert into public.follows (follower_id, followee_id) values ($1, $2)", [a, b]);
const startConv = (a, b) => rpc(a, "start_conversation", b);
const send = (uid, conv, text = "hi") =>
  asU(uid, "insert into public.messages (conversation_id, sender_id, content) values ($1, $2, $3) returning id", [conv, uid, text])
    .then((r) => r[0].id);
const notes = (uid, type) =>
  h.sql("select actor_id, type, conversation_id, post_id, comment_id from public.notifications where user_id = $1 and type = $2", [uid, type]);

// ============================================================================
describe("profiles: protected columns (guard trigger + column grants)", () => {
  it.each([
    ["is_elite", "true"],
    ["role", "'admin'"],
    ["xp", "999999"],
    ["username", "'hijacked_handle'"],
    ["full_name", "'Evil Name'"],
    ["avatar_url", "'https://evil.example/pixel.png'"],
    ["phone", "'+966500000000'"],
    ["bio", "'written directly'"],
    ["full_name_changed_at", "now() - interval '1 year'"],
    ["avatar_changed_at", "now() - interval '1 year'"],
    ["phone_changed_at", "now() - interval '1 year'"],
    ["created_at", "now() - interval '5 years'"],
  ])("ATTACK: the owner cannot set %s directly", async (col, value) => {
    const u = await newUser();
    const before = await prof(u);
    await expect(n(u, `update public.profiles set ${col} = ${value} where id = $1`, [u]))
      .rejects.toMatchObject({ ...DENIED, message: `profiles.${col} is not client-writable` });
    expect(await prof(u)).toEqual(before);
  });

  it("ATTACK: a protected column cannot ride along with an allowed one", async () => {
    const u = await newUser();
    await expect(n(u, "update public.profiles set show_elite_badge = false, is_elite = true where id = $1", [u]))
      .rejects.toMatchObject(DENIED);
    expect((await prof(u)).show_elite_badge).toBe(true);
  });

  it("ATTACK: an upsert cannot change protected columns through ON CONFLICT DO UPDATE", async () => {
    const u = await newUser();
    await expect(n(u,
      `insert into public.profiles (id, username) values ($1, 'upsert_takeover')
       on conflict (id) do update set username = excluded.username`, [u])).rejects.toMatchObject(DENIED);
  });

  it("ATTACK: a client-created profile cannot carry privileged values (column INSERT grants)", async () => {
    const [{ id: orphan }] = await h.sql("insert into auth.users (email) values ($1) returning id", [`orph_${Date.now()}@t.local`]);
    await h.sql("delete from public.profiles where id = $1", [orphan]); // as if the trigger never ran
    for (const [col, v] of [["is_elite", "true"], ["role", "'admin'"], ["xp", "5000"], ["phone", "'+966511111111'"],
      ["avatar_url", "'https://evil.example/a.png'"], ["full_name_changed_at", "now()"], ["created_at", "now()"]]) {
      await expect(asU(orphan, `insert into public.profiles (id, username, ${col}) values ($1, 'orph_handle', ${v})`, [orphan]))
        .rejects.toMatchObject(DENIED);
    }
    // LEGIT: the app's fallback upsert (useAuth.signUp) still creates a clean row
    expect(await n(orphan,
      "insert into public.profiles (id, username, full_name) values ($1, 'orph_handle', 'Orphan User') on conflict (id) do nothing",
      [orphan])).toBe(1);
    expect(await prof(orphan)).toMatchObject({ username: "orph_handle", is_elite: false, role: "student", xp: 0, phone: null });
  });

  it("LEGIT: display prefs are directly writable; no-op upserts (ProfileSetupForm) still pass", async () => {
    const u = await newUser();
    expect(await n(u, "update public.profiles set show_elite_badge = false, anonymous_community = true where id = $1", [u])).toBe(1);
    expect(await prof(u)).toMatchObject({ show_elite_badge: false, anonymous_community: true });
    // A PostgREST merge-duplicates upsert re-sends every column it was given:
    // SET id = EXCLUDED.id, username = EXCLUDED.username — unchanged values pass.
    const { username } = await prof(u);
    expect(await n(u,
      `insert into public.profiles (id, username) values ($1, $2)
       on conflict (id) do update set id = excluded.id, username = excluded.username`, [u, username])).toBe(1);
    // … and an update that "sets" a protected column to its current value is a no-op, not an attack
    expect(await n(u, "update public.profiles set username = $2 where id = $1", [u, username])).toBe(1);
    // the insert-only upsert used by useAuth.signUp is a no-op for an existing row
    expect(await n(u, "insert into public.profiles (id, username, full_name) values ($1, 'other_handle', 'Other Name') on conflict (id) do nothing", [u])).toBe(0);
  });

  it("LEGIT: SECURITY DEFINER RPCs, the service role (payment webhook) and admins still write", async () => {
    const u = await newUser();
    await rpc(u, "update_bio", "hello there");
    await rpc(u, "update_full_name", "Nora Saleh");
    await rpc(u, "update_phone", "512345678");
    await rpc(u, "set_avatar", avatarUrl(u));
    await h.asService((tx) => tx.sql("update public.profiles set is_elite = true where id = $1", [u]));
    await h.sql("update public.profiles set xp = xp + 10 where id = $1", [u]);
    expect(await prof(u)).toMatchObject({
      bio: "hello there", full_name: "Nora Saleh", phone: "+966512345678", avatar_url: avatarUrl(u), is_elite: true, xp: 10,
    });
  });

  it("other users and anon still cannot touch someone else's row", async () => {
    const [a, b] = [await newUser(), await newUser()];
    expect(await n(b, "update public.profiles set show_elite_badge = false where id = $1", [a])).toBe(0);
    expect(await h.asAnon((tx) => tx.query("update public.profiles set show_elite_badge = false where id = $1", [a]))
      .then((r) => r.affectedRows)).toBe(0);
    expect((await prof(a)).show_elite_badge).toBe(true);
  });
});

// ============================================================================
describe("profiles: private columns are not readable by clients", () => {
  let alice, bob;
  beforeAll(async () => {
    alice = await newUser({ full_name: "Alice Private", phone: "0512345678" });
    bob = await newUser();
  });

  it.each(["phone", "full_name_changed_at", "avatar_changed_at", "phone_changed_at", "updated_at"])(
    "ATTACK: anon, other users and the owner cannot select %s",
    async (col) => {
      await expect(asA(`select ${col} from public.profiles where id = $1`, [alice])).rejects.toMatchObject(DENIED);
      await expect(asU(bob, `select ${col} from public.profiles where id = $1`, [alice])).rejects.toMatchObject(DENIED);
      await expect(asU(alice, `select ${col} from public.profiles where id = $1`, [alice])).rejects.toMatchObject(DENIED);
    },
  );

  it("ATTACK: select * on profiles fails (why the app must never select('*'))", async () => {
    await expect(asA("select * from public.profiles limit 1")).rejects.toMatchObject(DENIED);
    await expect(asU(alice, "select * from public.profiles where id = $1", [alice])).rejects.toMatchObject(DENIED);
  });

  it("LEGIT: the app's PUBLIC / OWN / BASIC column sets and head counts still work for anon and users", async () => {
    for (const cols of [PUBLIC_PROFILE_COLUMNS, OWN_PROFILE_COLUMNS, BASIC_PROFILE_COLUMNS]) {
      expect(await asA(`select ${cols} from public.profiles where id = $1`, [alice])).toHaveLength(1);
      expect(await asU(bob, `select ${cols} from public.profiles where id = $1`, [alice])).toHaveLength(1);
    }
    const [{ c }] = await asA("select count(*)::int c from (select id from public.profiles where xp >= 0) t");
    expect(c).toBeGreaterThan(0);
  });

  it("LEGIT: get_my_private_profile() returns only the caller's private columns; anon cannot call it", async () => {
    await h.sql("update public.profiles set full_name_changed_at = now() where id = $1", [alice]);
    const [mine] = await asU(alice, "select * from public.get_my_private_profile()");
    expect(mine.phone).toBe("+966512345678");
    expect(mine.full_name_changed_at).toBeInstanceOf(Date);
    expect(Object.keys(mine).sort()).toEqual(["avatar_changed_at", "full_name_changed_at", "phone", "phone_changed_at"]);
    const [other] = await asU(bob, "select * from public.get_my_private_profile()");
    expect(other.phone).toBeNull();
    await expect(asA("select * from public.get_my_private_profile()")).rejects.toMatchObject(DENIED);
  });
});

// ============================================================================
describe("public display name: letters only", () => {
  it.each([["محمد ١٢٣"], ["علي ۱۲"], ["علي، محمد"], ["ـــ علي"], ["Name 123"]])(
    "ATTACK: update_full_name rejects %s (digits / punctuation / tatweel)",
    async (name) => {
      const u = await newUser();
      await expect(rpc(u, "update_full_name", name)).rejects.toThrow(raised("invalid_name_format"));
    },
  );

  it("LEGIT: Arabic with harakat and Latin names pass; whitespace is collapsed", async () => {
    const u = await newUser();
    await rpc(u, "update_full_name", "مُحَمَّد علي");
    expect((await prof(u)).full_name).toBe("مُحَمَّد علي");
    const v = await newUser();
    await rpc(v, "update_full_name", "  Sara    Omar ");
    expect((await prof(v)).full_name).toBe("Sara Omar");
  });

  it("sign-up metadata with digits is dropped (profile setup asks again); the CHECK blocks every writer", async () => {
    const u = await h.createUser({ meta: { full_name: "محمد ١٢٣", username: "digits_name_1" } });
    expect(await prof(u)).toMatchObject({ full_name: null, username: "digits_name_1" });
    await expect(h.sql("update public.profiles set full_name = 'محمد ١٢٣' where id = $1", [u])).rejects.toMatchObject(CHECK);
  });
});

// ============================================================================
describe("set_avatar: only this project's avatars/<uid>/ URLs", () => {
  it.each([
    ["an external tracking pixel", (u) => "https://evil.example/pixel.gif"],
    ["another user's folder", () => avatarUrl("00000000-0000-0000-0000-000000000000")],
    ["another bucket", (u) => `${ORIGIN}/storage/v1/object/public/post-media/${u}/a.png`],
    ["a non-Supabase host", (u) => avatarUrl(u, "a.png", "https://cdn.evil.example")],
    ["userinfo host smuggling", (u) => avatarUrl(u, "a.png", "https://abc.supabase.co@evil.example")],
    ["a nested path", (u) => `${ORIGIN}/storage/v1/object/public/avatars/${u}/x/../../other/a.png`],
    ["an encoded slash", (u) => `${ORIGIN}/storage/v1/object/public/avatars/${u}/..%2F..%2Fother.png`],
    ["javascript:", () => "javascript:alert(1)"],
  ])("ATTACK: rejects %s without consuming the cooldown", async (_label, make) => {
    const u = await newUser();
    await expect(rpc(u, "set_avatar", make(u))).rejects.toThrow(raised("invalid_avatar_url"));
    expect(await prof(u)).toMatchObject({ avatar_url: null, avatar_changed_at: null });
  });

  it("LEGIT: own URL (with the ?t= cache buster, or a local Supabase) is accepted", async () => {
    const u = await newUser();
    await rpc(u, "set_avatar", avatarUrl(u));
    expect((await prof(u)).avatar_url).toBe(avatarUrl(u));
    const local = await newUser();
    const url = `http://127.0.0.1:54321/storage/v1/object/public/avatars/${local}/avatar-9.jpg`;
    await rpc(local, "set_avatar", url);
    expect((await prof(local)).avatar_url).toBe(url);
  });

  it("app.storage_origin pins the exact origin when configured", async () => {
    const u = await newUser();
    const pinned = "https://pinnedprojectref00.supabase.co";
    const call = (url) => h.asUser(u, async (tx) => {
      await tx.sql("select set_config('app.storage_origin', $1, true)", [pinned]);
      return tx.sql("select public.set_avatar($1)", [url]);
    });
    await expect(call(avatarUrl(u))).rejects.toThrow(raised("invalid_avatar_url"));
    await call(avatarUrl(u, "avatar-2.png", pinned));
    expect((await prof(u)).avatar_url).toBe(avatarUrl(u, "avatar-2.png", pinned));
  });

  it("set_avatar(null) removes the photo without resetting the cooldown clock", async () => {
    const u = await newUser();
    await rpc(u, "set_avatar", avatarUrl(u));
    const { avatar_changed_at } = await prof(u);
    await rpc(u, "set_avatar", null);
    expect(await prof(u)).toMatchObject({ avatar_url: null, avatar_changed_at });
    await expect(rpc(u, "set_avatar", avatarUrl(u, "avatar-3.png"))).rejects.toThrow(raised("avatar_cooldown"));
  });
});

// ============================================================================
describe("storage: bucket limits and listing", () => {
  it("buckets carry size and MIME limits (no SVG / HTML)", async () => {
    const rows = await h.sql("select id, file_size_limit::bigint::text lim, allowed_mime_types m from storage.buckets order by id");
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.avatars.lim).toBe(String(2 * 1024 * 1024));
    expect(byId["post-media"].lim).toBe(String(50 * 1024 * 1024));
    expect(byId.avatars.m.every((t) => t.startsWith("image/"))).toBe(true);
    expect(byId["post-media"].m).toEqual(expect.arrayContaining(["video/mp4", "video/webm", "video/quicktime", "image/jpeg"]));
    for (const b of rows) {
      expect(b.m).not.toContain("image/svg+xml");
      expect(b.m).not.toContain("text/html");
    }
  });

  it("ATTACK: anon and other users cannot list (enumerate) objects; LEGIT: the owner lists and removes own files", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const put = (bucket, name) =>
      asU(a, "insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)", [bucket, name, a]);
    await put("avatars", `${a}/avatar-1.png`);
    await put("post-media", `${a}/1.jpg`);
    for (const bucket of ["avatars", "post-media"]) {
      expect(await asA("select name from storage.objects where bucket_id = $1", [bucket])).toEqual([]);
      expect(await asU(b, "select name from storage.objects where bucket_id = $1 and name like $2", [bucket, `${a}/%`])).toEqual([]);
      expect(await asU(a, "select name from storage.objects where bucket_id = $1 and name like $2", [bucket, `${a}/%`])).toHaveLength(1);
    }
    expect(await n(a, "delete from storage.objects where bucket_id = 'avatars' and name = $1", [`${a}/avatar-1.png`])).toBe(1);
  });
});

// ============================================================================
describe("community posts: counters, timestamps, content and media", () => {
  let author, other, post;
  beforeAll(async () => {
    author = await newUser();
    other = await newUser();
    post = await newPost(author, "original");
  });

  it("ATTACK: cannot create a post with counters, a pinned created_at or a chosen id", async () => {
    for (const [col, v] of [["likes_count", "999"], ["comments_count", "5"], ["reposts_count", "5"], ["dislikes_count", "0"],
      ["created_at", "now() + interval '10 years'"], ["id", "gen_random_uuid()"]]) {
      await expect(asU(author, `insert into public.community_posts (user_id, content, ${col}) values ($1, 'x', ${v})`, [author]))
        .rejects.toMatchObject(DENIED);
    }
  });

  it("ATTACK: the owner cannot rewrite counters, created_at or user_id", async () => {
    for (const set of ["likes_count = 999", "comments_count = 0", "created_at = now() + interval '1 year'", `user_id = '${other}'`]) {
      await expect(n(author, `update public.community_posts set ${set} where id = $1`, [post])).rejects.toMatchObject(DENIED);
    }
  });

  it("LEGIT: owner edits content; others cannot; counters still follow the triggers", async () => {
    expect(await n(author, "update public.community_posts set content = 'edited' where id = $1", [post])).toBe(1);
    expect(await n(other, "update public.community_posts set content = 'hijack' where id = $1", [post])).toBe(0);
    await asU(other, "insert into public.post_likes (post_id, user_id) values ($1, $2)", [post, other]);
    const [r] = await h.sql("select content, likes_count from public.community_posts where id = $1", [post]);
    expect(r).toEqual({ content: "edited", likes_count: 1 });
  });

  it("CHECK: content ≤ 2000 chars and non-empty unless there is media", async () => {
    await expect(newPost(author, "x".repeat(2001))).rejects.toMatchObject(CHECK);
    await expect(newPost(author, "   ")).rejects.toMatchObject(CHECK);
    await expect(asU(author, "insert into public.community_posts (user_id) values ($1)", [author])).rejects.toMatchObject(CHECK);
    expect(await newPost(author, "x".repeat(2000))).toBeTruthy();
  });

  it("media: only the author's own post-media URL, matching media_path and with a media_type", async () => {
    const path = `${author}/1700000000000.jpg`;
    const ins = (url, type, p) => asU(author,
      "insert into public.community_posts (user_id, content, media_url, media_type, media_path) values ($1, null, $2, $3, $4) returning id",
      [author, url, type, p]);
    await expect(ins("https://evil.example/x.jpg", "image", path)).rejects.toMatchObject({ ...CHECK, message: "invalid_media_url" });
    await expect(ins(mediaUrl(`${other}/1.jpg`), "image", `${other}/1.jpg`)).rejects.toMatchObject(CHECK);
    await expect(ins(mediaUrl(path), "image", `${author}/other.jpg`)).rejects.toMatchObject(CHECK);
    await expect(ins(mediaUrl(path), null, path)).rejects.toMatchObject(CHECK);
    await expect(ins(mediaUrl(path), "pdf", path)).rejects.toMatchObject(CHECK);
    // LEGIT: media-only post, then "replace media" and "remove media" (CommunityFeed)
    const [{ id }] = await ins(mediaUrl(path), "image", path);
    const next = `${author}/1700000000001.mp4`;
    expect(await n(author, "update public.community_posts set media_url = $2, media_type = 'video', media_path = $3 where id = $1",
      [id, mediaUrl(next), next])).toBe(1);
    await expect(n(author, "update public.community_posts set media_url = 'https://evil.example/v.mp4' where id = $1", [id]))
      .rejects.toMatchObject(CHECK);
    await n(author, "update public.community_posts set content = 'caption' where id = $1", [id]);
    expect(await n(author, "update public.community_posts set media_url = null, media_type = null, media_path = null where id = $1", [id])).toBe(1);
  });
});

// ============================================================================
describe("comments, follows, reviews: immutable fields and limits", () => {
  it("ATTACK: a comment cannot be moved to another post or re-attributed; LEGIT: content edits", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const [p1, p2] = [await newPost(a), await newPost(a)];
    const [{ id }] = await asU(b, "insert into public.post_comments (post_id, user_id, content) values ($1, $2, 'hi') returning id", [p1, b]);
    await expect(n(b, "update public.post_comments set post_id = $2 where id = $1", [id, p2])).rejects.toMatchObject(DENIED);
    await expect(n(b, "update public.post_comments set user_id = $2 where id = $1", [id, a])).rejects.toMatchObject(DENIED);
    await expect(n(b, "update public.post_comments set created_at = now() - interval '1 year' where id = $1", [id])).rejects.toMatchObject(DENIED);
    expect(await n(b, "update public.post_comments set content = 'edited' where id = $1", [id])).toBe(1);
    const counts = await h.sql("select id, comments_count from public.community_posts where id = any($1::uuid[]) order by comments_count", [[p1, p2]]);
    expect(counts.map((r) => r.comments_count)).toEqual([0, 1]);
  });

  it("CHECK: comments are 1–1000 characters", async () => {
    const a = await newUser();
    const p = await newPost(a);
    const ins = (c) => asU(a, "insert into public.post_comments (post_id, user_id, content) values ($1, $2, $3)", [p, a, c]);
    await expect(ins("x".repeat(1001))).rejects.toMatchObject(CHECK);
    await expect(ins("  ")).rejects.toMatchObject(CHECK);
    await ins("x".repeat(1000));
  });

  it("ATTACK: a follower cannot retarget a follow; LEGIT: notify_pref still changes", async () => {
    const [a, b, c] = [await newUser(), await newUser(), await newUser()];
    await follow(a, b);
    await expect(n(a, "update public.follows set followee_id = $2 where follower_id = $1", [a, c])).rejects.toMatchObject(DENIED);
    expect(await n(a, "update public.follows set notify_pref = 'off' where follower_id = $1 and followee_id = $2", [a, b])).toBe(1);
  });

  it("reviews: one per user, content ≤ 1000, no back-/future-dating; LEGIT: edit your review", async () => {
    const u = await newUser();
    const [{ id }] = await asU(u, "insert into public.reviews (user_id, rating, content) values ($1, 5, 'great') returning id", [u]);
    await expect(asU(u, "insert into public.reviews (user_id, rating, content) values ($1, 1, 'again')", [u])).rejects.toMatchObject(UNIQUE);
    await expect(n(u, "update public.reviews set content = $2 where id = $1", [id, "x".repeat(1001)])).rejects.toMatchObject(CHECK);
    await expect(n(u, "update public.reviews set rating = 0 where id = $1", [id])).rejects.toMatchObject(CHECK);
    await expect(n(u, "update public.reviews set created_at = now() + interval '1 year' where id = $1", [id])).rejects.toMatchObject(DENIED);
    await expect(n(u, "update public.reviews set user_id = gen_random_uuid() where id = $1", [id])).rejects.toMatchObject(DENIED);
    expect(await n(u, "update public.reviews set rating = 4, content = 'good' where id = $1", [id])).toBe(1);
    expect(await n(u, "delete from public.reviews where id = $1", [id])).toBe(1);
    await asU(u, "insert into public.reviews (user_id, rating) values ($1, 3)", [u]); // a fresh one after deleting
  });
});

// ============================================================================
describe("blocks are enforced", () => {
  let owner, troll, bystander, post;
  beforeAll(async () => {
    owner = await newUser();
    troll = await newUser();
    bystander = await newUser();
    post = await newPost(owner);
    await block(owner, troll);
  });

  it("ATTACK: a blocked user cannot comment, react, repost or follow", async () => {
    await expect(asU(troll, "insert into public.post_comments (post_id, user_id, content) values ($1, $2, 'x')", [post, troll]))
      .rejects.toMatchObject(DENIED);
    for (const t of ["post_likes", "post_dislikes", "post_reposts"]) {
      await expect(asU(troll, `insert into public.${t} (post_id, user_id) values ($1, $2)`, [post, troll])).rejects.toMatchObject(DENIED);
    }
    await expect(follow(troll, owner)).rejects.toMatchObject(DENIED);
  });

  it("the block works both ways, and bystanders are unaffected", async () => {
    const trollPost = await newPost(troll);
    await expect(asU(owner, "insert into public.post_comments (post_id, user_id, content) values ($1, $2, 'x')", [trollPost, owner]))
      .rejects.toMatchObject(DENIED);
    await asU(bystander, "insert into public.post_comments (post_id, user_id, content) values ($1, $2, 'fine')", [post, bystander]);
    await follow(bystander, owner);
  });

  it("has_block_with() only answers about the caller (no oracle for other pairs)", async () => {
    expect(await rpc(troll, "has_block_with", owner)).toBe(true);
    expect(await rpc(bystander, "has_block_with", owner)).toBe(false);
    expect(await rpc(bystander, "has_block_with", troll)).toBe(false);
  });

  it("unblocking restores normal interaction", async () => {
    expect(await n(owner, "delete from public.blocks where blocker_id = $1 and blocked_id = $2", [owner, troll])).toBe(1);
    await asU(troll, "insert into public.post_likes (post_id, user_id) values ($1, $2)", [post, troll]);
    await block(owner, troll);
  });
});

// ============================================================================
describe("notifications: no client inserts", () => {
  it("ATTACK: users and anon cannot create notifications of any type, for anyone", async () => {
    const [a, b] = [await newUser(), await newUser()];
    for (const type of ["request_accepted", "follow", "message", "like"]) {
      await expect(asU(a, "insert into public.notifications (user_id, actor_id, type) values ($1, $2, $3)", [b, a, type]))
        .rejects.toMatchObject(DENIED);
    }
    await expect(asU(a, "insert into public.notifications (user_id, actor_id, type) values ($1, $1, 'like')", [a]))
      .rejects.toMatchObject(DENIED);
    await expect(asA("insert into public.notifications (user_id, type) values ($1, 'like')", [b])).rejects.toMatchObject(DENIED);
    expect(await h.sql("select id from public.notifications where user_id = any($1::uuid[])", [[a, b]])).toEqual([]);
  });

  it("LEGIT: trigger notifications still arrive; the recipient marks them read but cannot rewrite them", async () => {
    const [a, b] = [await newUser(), await newUser()];
    await follow(a, b);
    expect(await notes(b, "follow")).toHaveLength(1);
    expect(await n(b, "update public.notifications set read = true where user_id = $1", [b])).toBe(1);
    await expect(n(b, "update public.notifications set type = 'request_accepted' where user_id = $1", [b])).rejects.toMatchObject(DENIED);
    await expect(n(b, "update public.notifications set user_id = $2 where user_id = $1", [b, a])).rejects.toMatchObject(DENIED);
    expect(await n(a, "update public.notifications set read = false where user_id = $1", [b])).toBe(0);
  });
});

// ============================================================================
describe("hashtags, post_hashtags and mentions", () => {
  it("ATTACK: clients cannot create, rename or recount hashtags", async () => {
    const u = await newUser();
    await newPost(u, "learning #counted");
    await expect(asU(u, "insert into public.hashtags (tag) values ('spam_tag')")).rejects.toMatchObject(DENIED);
    await expect(n(u, "update public.hashtags set post_count = 99999 where tag = 'counted'")).rejects.toMatchObject(DENIED);
    await expect(n(u, "update public.hashtags set tag = 'renamed' where tag = 'counted'")).rejects.toMatchObject(DENIED);
    await expect(n(u, "delete from public.hashtags where tag = 'counted'")).rejects.toMatchObject(DENIED);
  });

  it("LEGIT: #tags in post content are indexed and counted by the trigger, and follow edits", async () => {
    const u = await newUser();
    const p = await newPost(u, "Study #Algebra and #هندسة today");
    const tags = async () => (await h.sql(
      `select h.tag, h.post_count from public.post_hashtags ph join public.hashtags h on h.id = ph.hashtag_id
        where ph.post_id = $1 order by h.tag`, [p]));
    expect(await tags()).toEqual([{ tag: "algebra", post_count: 1 }, { tag: "هندسة", post_count: 1 }]);
    await n(u, "update public.community_posts set content = 'only #هندسة now' where id = $1", [p]);
    expect(await tags()).toEqual([{ tag: "هندسة", post_count: 1 }]);
    expect((await h.sql("select post_count from public.hashtags where tag = 'algebra'"))[0].post_count).toBe(0);
  });

  it("ATTACK: nobody can tag someone else's post; LEGIT: the author tags / untags their own", async () => {
    const [a, b] = [await newUser(), await newUser()];
    await newPost(a, "seed #shared_tag");
    const [{ id: tag }] = await h.sql("select id from public.hashtags where tag = 'shared_tag'");
    const victim = await newPost(a, "no tags here");
    await expect(asU(b, "insert into public.post_hashtags (post_id, hashtag_id) values ($1, $2)", [victim, tag]))
      .rejects.toMatchObject(DENIED);
    const mine = await newPost(b, "mine");
    await asU(b, "insert into public.post_hashtags (post_id, hashtag_id) values ($1, $2)", [mine, tag]);
    expect((await h.sql("select post_count from public.hashtags where id = $1", [tag]))[0].post_count).toBe(2);
    expect(await n(a, "delete from public.post_hashtags where post_id = $1", [mine])).toBe(0);
    expect(await n(b, "delete from public.post_hashtags where post_id = $1", [mine])).toBe(1);
    expect((await h.sql("select post_count from public.hashtags where id = $1", [tag]))[0].post_count).toBe(1);
  });

  it("LEGIT: @mentions create a mention + notification (not for self, blocked users or notify_mentions = off)", async () => {
    const author = await handleUser("author");
    const target = await handleUser("target");
    const muted = await handleUser("muted");
    const blocker = await handleUser("blocker");
    const [t, m, bl, self] = await Promise.all([target, muted, blocker, author].map(async (id) => (await prof(id)).username));
    await asU(muted, "insert into public.user_social_settings (user_id, notify_mentions) values ($1, false)", [muted]);
    await block(blocker, author);
    const p = await newPost(author, `hi @${t} @${m} @${bl} @${self} @nobody_here`);
    const mentions = await h.sql("select mentioned_user_id from public.mentions where post_id = $1", [p]);
    expect(mentions.map((r) => r.mentioned_user_id).sort()).toEqual([target, muted].sort());
    expect(await notes(target, "mention")).toEqual([{ actor_id: author, type: "mention", conversation_id: null, post_id: p, comment_id: null }]);
    expect(await notes(muted, "mention")).toEqual([]);
    expect(await notes(blocker, "mention")).toEqual([]);
    // editing the post does not re-notify
    await n(author, "update public.community_posts set content = $2 where id = $1", [p, `hi again @${t}`]);
    expect(await notes(target, "mention")).toHaveLength(1);
    // comments mention too
    const [{ id: cid }] = await asU(author, "insert into public.post_comments (post_id, user_id, content) values ($1, $2, $3) returning id",
      [p, author, `thanks @${t}`]);
    expect((await notes(target, "mention")).map((r) => r.comment_id)).toContain(cid);
  });

  it("ATTACK: mentions cannot be forged and are private to the two people involved", async () => {
    const author = await handleUser("mauthor");
    const target = await handleUser("mtarget");
    const stranger = await newUser();
    await expect(asU(stranger, "insert into public.mentions (actor_id, mentioned_user_id) values ($1, $2)", [stranger, target]))
      .rejects.toMatchObject(DENIED);
    const p = await newPost(author, `@${(await prof(target)).username} look`);
    const q = "select id from public.mentions where post_id = $1";
    expect(await asA(q, [p])).toEqual([]);
    expect(await asU(stranger, q, [p])).toEqual([]);
    expect(await asU(target, q, [p])).toHaveLength(1);
    expect(await asU(author, q, [p])).toHaveLength(1);
  });
});

// ============================================================================
describe("direct messages: conversations, participants and requests", () => {
  it("ATTACK: joining a foreign conversation (or forcing a victim into one) is impossible", async () => {
    const [a, b, mallory] = [await newUser(), await newUser(), await newUser()];
    await follow(b, a);
    const conv = await startConv(a, b);
    await send(a, conv, "private");
    await expect(asU(mallory, "insert into public.conversation_participants (conversation_id, user_id) values ($1, $2)", [conv, mallory]))
      .rejects.toMatchObject(DENIED);
    expect(await asU(mallory, "select id from public.messages where conversation_id = $1", [conv])).toEqual([]);
    expect(await asU(mallory, "select id from public.conversations where id = $1", [conv])).toEqual([]);
    // a victim cannot be pulled into the attacker's conversation either
    const own = await startConv(mallory, b);
    await expect(asU(mallory, "insert into public.conversation_participants (conversation_id, user_id) values ($1, $2)", [own, a]))
      .rejects.toMatchObject(DENIED);
    await expect(asA("select id from public.messages where conversation_id = $1", [conv])).resolves.toEqual([]);
  });

  it("ATTACK: conversations and message requests cannot be written directly (no self-accept)", async () => {
    const [a, b] = [await newUser(), await newUser()];
    await expect(asU(a, "insert into public.conversations (created_by, is_request) values ($1, false)", [a])).rejects.toMatchObject(DENIED);
    const conv = await startConv(a, b);
    await expect(n(a, "update public.conversations set is_request = false where id = $1", [conv])).rejects.toMatchObject(DENIED);
    await expect(n(a, "update public.message_requests set status = 'accepted' where conversation_id = $1", [conv])).rejects.toMatchObject(DENIED);
    await expect(asU(a, "insert into public.message_requests (conversation_id, requester_id, recipient_id) values ($1, $2, $3)", [conv, a, b]))
      .rejects.toMatchObject(DENIED);
    await expect(n(a, "update public.conversation_participants set user_id = $2 where conversation_id = $1 and user_id = $3", [conv, b, a]))
      .rejects.toMatchObject(DENIED);
    const [c] = await h.sql("select is_request from public.conversations where id = $1", [conv]);
    expect(c.is_request).toBe(true);
  });

  it("start_conversation: request flow — atomic rows, notification, reuse, request gate, accept", async () => {
    const [alice, bob, mallory] = [await newUser(), await newUser(), await newUser()];
    await expect(asA("select public.start_conversation(gen_random_uuid())")).rejects.toMatchObject(DENIED);
    await expect(startConv(alice, alice)).rejects.toThrow(raised("invalid_recipient"));
    await expect(startConv(alice, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(raised("invalid_recipient"));

    const conv = await startConv(alice, bob);
    expect(await startConv(alice, bob)).toBe(conv); // reused
    const [c] = await h.sql("select created_by, is_request from public.conversations where id = $1", [conv]);
    expect(c).toEqual({ created_by: alice, is_request: true });
    expect((await h.sql("select user_id from public.conversation_participants where conversation_id = $1", [conv]))
      .map((r) => r.user_id).sort()).toEqual([alice, bob].sort());
    const [req] = await h.sql("select id, requester_id, recipient_id, status from public.message_requests where conversation_id = $1", [conv]);
    expect(req).toMatchObject({ requester_id: alice, recipient_id: bob, status: "pending" });
    expect(await notes(bob, "message_request")).toEqual([{ actor_id: alice, type: "message_request", conversation_id: conv, post_id: null, comment_id: null }]);

    // while pending: only the requester writes
    await send(alice, conv, "hello bob");
    await expect(send(bob, conv, "reply")).rejects.toMatchObject(DENIED);
    await expect(send(mallory, conv, "spam")).rejects.toMatchObject(DENIED);
    await expect(asU(mallory, "insert into public.messages (conversation_id, sender_id, content) values ($1, $2, 'x')", [conv, alice]))
      .rejects.toMatchObject(DENIED);

    // only the recipient can answer
    await expect(rpc(alice, "respond_message_request", req.id, true)).rejects.toThrow(raised("request_not_found"));
    await expect(rpc(mallory, "respond_message_request", req.id, true)).rejects.toThrow(raised("request_not_found"));
    expect(await rpc(bob, "respond_message_request", req.id, true)).toBe("accepted");
    expect((await h.sql("select is_request from public.conversations where id = $1", [conv]))[0].is_request).toBe(false);
    expect(await notes(alice, "request_accepted")).toHaveLength(1);
    await send(bob, conv, "hi alice");

    // last_message_at is maintained by the trigger
    const [t] = await h.sql("select last_message_at from public.conversations where id = $1", [conv]);
    expect(t.last_message_at).toBeInstanceOf(Date);
  });

  it("start_conversation: direct when the recipient follows the caller; respects allow_messages / allow_message_requests", async () => {
    const [a, fan, closed, noReq] = [await newUser(), await newUser(), await newUser(), await newUser()];
    await follow(fan, a);
    const direct = await startConv(a, fan);
    expect((await h.sql("select is_request from public.conversations where id = $1", [direct]))[0].is_request).toBe(false);
    expect(await h.sql("select id from public.message_requests where conversation_id = $1", [direct])).toEqual([]);
    await send(fan, direct, "no request needed");

    await asU(closed, "insert into public.user_social_settings (user_id, allow_messages) values ($1, false)", [closed]);
    await expect(startConv(a, closed)).rejects.toThrow(raised("messages_disabled"));

    await asU(noReq, "insert into public.user_social_settings (user_id, allow_message_requests) values ($1, false)", [noReq]);
    await expect(startConv(a, noReq)).rejects.toThrow(raised("requests_disabled"));
    await follow(noReq, a); // people they follow can still reach them
    expect(await startConv(a, noReq)).toBeTruthy();
  });

  it("start_conversation: blocks both ways; a block also stops messages in an existing conversation", async () => {
    const [a, b, c] = [await newUser(), await newUser(), await newUser()];
    await block(b, a);
    await expect(startConv(a, b)).rejects.toThrow(raised("blocked"));
    await expect(startConv(b, a)).rejects.toThrow(raised("blocked"));
    await follow(c, a);
    const conv = await startConv(a, c);
    await send(a, conv, "before");
    await block(c, a);
    await expect(send(a, conv, "after")).rejects.toMatchObject(DENIED);
    await expect(send(c, conv, "after")).rejects.toMatchObject(DENIED);
  });

  it("rejected requests stay closed for the requester; the recipient can still reach out (accepts)", async () => {
    const [dave, erin] = [await newUser(), await newUser()];
    const conv = await startConv(dave, erin);
    const [{ id }] = await h.sql("select id from public.message_requests where conversation_id = $1", [conv]);
    expect(await rpc(erin, "respond_message_request", id, false)).toBe("rejected");
    await expect(send(dave, conv, "please")).rejects.toMatchObject(DENIED);
    await expect(startConv(dave, erin)).rejects.toThrow(raised("request_rejected"));
    expect(await startConv(erin, dave)).toBe(conv);
    expect((await h.sql("select status from public.message_requests where id = $1", [id]))[0].status).toBe("accepted");
    await send(dave, conv, "thanks");
    await expect(rpc(erin, "respond_message_request", id, false)).rejects.toThrow(raised("request_already_accepted"));
  });
});

// ============================================================================
describe("direct messages: message rows", () => {
  let a, b, mallory, conv;
  beforeAll(async () => {
    [a, b, mallory] = [await newUser(), await newUser(), await newUser()];
    await follow(b, a);
    conv = await startConv(a, b);
  });

  it("ATTACK: forged created_at / read_at / delivered_at / media on insert are rejected", async () => {
    for (const [col, v] of [["created_at", "now() + interval '1 year'"], ["read_at", "now()"], ["delivered_at", "now()"],
      ["media_url", "'https://evil.example/p.png'"], ["deleted_for_all", "true"]]) {
      await expect(asU(a, `insert into public.messages (conversation_id, sender_id, content, ${col}) values ($1, $2, 'x', ${v})`, [conv, a]))
        .rejects.toMatchObject(DENIED);
    }
  });

  it("CHECK: messages are non-empty and ≤ 4000 characters", async () => {
    await expect(send(a, conv, "x".repeat(4001))).rejects.toMatchObject(CHECK);
    await expect(send(a, conv, "   ")).rejects.toMatchObject(CHECK);
    await send(a, conv, "x".repeat(4000));
  });

  it("ATTACK: the sender cannot rewrite content, receipts or the conversation; others cannot touch it", async () => {
    const id = await send(a, conv, "original");
    for (const set of ["content = 'rewritten'", "read_at = now()", "delivered_at = now()", `conversation_id = gen_random_uuid()`, `sender_id = '${b}'`]) {
      await expect(n(a, `update public.messages set ${set} where id = $1`, [id])).rejects.toMatchObject(DENIED);
    }
    expect(await n(b, "update public.messages set deleted_for_all = true where id = $1", [id])).toBe(0);
    expect(await n(mallory, "update public.messages set deleted_for_all = true where id = $1", [id])).toBe(0);
    expect((await h.sql("select content, deleted_for_all from public.messages where id = $1", [id]))[0])
      .toEqual({ content: "original", deleted_for_all: false });
  });

  it("delete-for-everyone: sender only, within 30 minutes, one way, and the content is wiped", async () => {
    const id = await send(a, conv, "oops");
    expect(await n(a, "update public.messages set deleted_for_all = true where id = $1", [id])).toBe(1);
    expect((await asU(b, "select content, deleted_for_all from public.messages where id = $1", [id]))[0])
      .toEqual({ content: null, deleted_for_all: true });
    await expect(n(a, "update public.messages set deleted_for_all = false where id = $1", [id])).rejects.toThrow(raised("message_undelete_forbidden"));

    const old = await send(a, conv, "too late");
    await h.sql("update public.messages set created_at = now() - interval '31 minutes' where id = $1", [old]);
    await expect(n(a, "update public.messages set deleted_for_all = true where id = $1", [old])).rejects.toThrow(raised("message_delete_window_expired"));
    expect((await h.sql("select content from public.messages where id = $1", [old]))[0].content).toBe("too late");
  });

  it("read receipts: mark_conversation_read marks only the other side's messages; non-participants are refused", async () => {
    const mine = await send(a, conv, "read me");
    const theirs = await send(b, conv, "from b");
    expect(await rpc(b, "mark_conversation_read", conv)).toBeGreaterThan(0);
    const rows = await h.sql("select id, read_at from public.messages where id = any($1::uuid[])", [[mine, theirs]]);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.read_at]));
    expect(byId[mine]).toBeInstanceOf(Date);
    expect(byId[theirs]).toBeNull();
    const [p] = await h.sql("select last_read_at from public.conversation_participants where conversation_id = $1 and user_id = $2", [conv, b]);
    expect(p.last_read_at).toBeInstanceOf(Date);
    await expect(rpc(mallory, "mark_conversation_read", conv)).rejects.toThrow(raised("not_a_participant"));
  });

  it("participants update only their own row's last_read_at / muted / hidden", async () => {
    expect(await n(a, "update public.conversation_participants set muted = true, hidden = false, last_read_at = now() where conversation_id = $1 and user_id = $2", [conv, a])).toBe(1);
    expect(await n(a, "update public.conversation_participants set muted = true where conversation_id = $1 and user_id = $2", [conv, b])).toBe(0);
    expect(await n(mallory, "update public.conversation_participants set hidden = true where conversation_id = $1", [conv])).toBe(0);
  });
});

// ============================================================================
describe("social settings privacy", () => {
  it("ATTACK: other users and anon cannot read someone's settings row; LEGIT: owner reads, profile page gets public prefs", async () => {
    const [u, other] = [await newUser(), await newUser()];
    await asU(u, "insert into public.user_social_settings (user_id, show_likes_on_profile, notif_sound) values ($1, false, false)", [u]);
    const q = "select user_id from public.user_social_settings where user_id = $1";
    expect(await asA(q, [u])).toEqual([]);
    expect(await asU(other, q, [u])).toEqual([]);
    expect(await asU(u, q, [u])).toHaveLength(1);
    expect(await n(other, "update public.user_social_settings set allow_messages = false where user_id = $1", [u])).toBe(0);

    const pub = "select * from public.get_public_social_settings($1)";
    expect(await asA(pub, [u])).toEqual([{ show_likes_on_profile: false, show_reposts_on_profile: true, allow_messages: true }]);
    expect(await asU(other, pub, [other])).toEqual([{ show_likes_on_profile: true, show_reposts_on_profile: true, allow_messages: true }]);
  });
});

// ============================================================================
describe("referrals", () => {
  const record = (uid, referrer) =>
    asU(uid, "insert into public.referrals (referrer_id, referred_id) values ($1, $2) on conflict (referred_id) do nothing", [referrer, uid]);

  it("ATTACK: unknown / self referrer, old accounts and unconfirmed accounts cannot record a referral", async () => {
    const referrer = await newUser();
    const fresh = await newUser();
    await expect(record(fresh, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(raised("invalid_referrer"));
    await expect(record(fresh, fresh)).rejects.toThrow(raised("invalid_referrer"));

    const veteran = await newUser();
    await h.sql("update auth.users set created_at = now() - interval '8 days' where id = $1", [veteran]);
    await expect(record(veteran, referrer)).rejects.toThrow(raised("referral_window_closed"));

    const unconfirmed = await newUser({}, { confirmed: false });
    await expect(record(unconfirmed, referrer)).rejects.toThrow(raised("referral_unverified_account"));

    const [c] = await h.sql("select count(*)::int c from public.referrals where referrer_id = $1", [referrer]);
    expect(c.c).toBe(0);
  });

  it("LEGIT: a new confirmed account records its inviter once", async () => {
    const referrer = await newUser();
    const invited = await newUser();
    await record(invited, referrer);
    await record(invited, referrer);
    expect(await asU(referrer, "select referred_id from public.referrals where referrer_id = $1", [referrer]))
      .toEqual([{ referred_id: invited }]);
  });
});

// ============================================================================
describe("length limits on the remaining free-text columns", () => {
  it("chat_history: non-negative tokens, bounded content / session id", async () => {
    const u = await newUser();
    const ins = (content, tokens, sid = "s1") => asU(u,
      "insert into public.chat_history (user_id, session_id, message_type, content, tokens_used) values ($1, $2, 'user', $3, $4)",
      [u, sid, content, tokens]);
    await expect(ins("hi", -50)).rejects.toMatchObject(CHECK);
    await expect(ins("x".repeat(20001), 0)).rejects.toMatchObject(CHECK);
    await expect(ins("hi", 0, "s".repeat(201))).rejects.toMatchObject(CHECK);
    await ins("hi", 0);
  });

  it("user_sessions and reports", async () => {
    const u = await newUser();
    await expect(asU(u, "insert into public.user_sessions (user_id, session_id, device_label) values ($1, 'sid', $2)", [u, "d".repeat(201)]))
      .rejects.toMatchObject(CHECK);
    await asU(u, "insert into public.user_sessions (user_id, session_id, device_label, user_agent) values ($1, 'sid', 'Laptop', $2)", [u, "U".repeat(600)]);
    await expect(asU(u, "insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'user', $1, $2)", [u, "r".repeat(1001)]))
      .rejects.toMatchObject(CHECK);
    await asU(u, "insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'user', $1, 'spam')", [u]);
  });

  it("bio stays ≤ 300 for every writer", async () => {
    const u = await newUser();
    await expect(rpc(u, "update_bio", "b".repeat(301))).rejects.toThrow(raised("bio_too_long"));
    await expect(h.sql("update public.profiles set bio = $2 where id = $1", [u, "b".repeat(301)])).rejects.toMatchObject(CHECK);
  });
});

// ============================================================================
describe("function and table privileges", () => {
  const RPCS = [
    "record_daily_activity()", "update_full_name(text)", "set_avatar(text)", "update_phone(text)", "update_bio(text)",
    "get_my_private_profile()", "is_conversation_participant(uuid)", "has_block_with(uuid)", "can_send_message(uuid)",
    "start_conversation(uuid)", "respond_message_request(uuid, boolean)", "mark_conversation_read(uuid)",
    "unread_notification_count()",
  ];
  const TRIGGER_FNS = [
    "handle_new_user()", "set_updated_at()", "sync_post_counts()", "sync_hashtag_count()", "notify_on_post_interaction()",
    "notify_on_follow()", "profiles_guard_protected_columns()", "community_posts_validate_media()", "index_post_entities()",
    "messages_guard()", "touch_conversation_last_message()", "referrals_validate()",
  ];
  const can = async (role, fn) =>
    (await h.sql("select has_function_privilege($1, $2, 'EXECUTE') ok", [role, `public.${fn}`]))[0].ok;

  it("SECURITY DEFINER RPCs are executable by signed-in users only (not anon / PUBLIC)", async () => {
    for (const fn of RPCS) {
      expect(await can("anon", fn), `anon → ${fn}`).toBe(false);
      expect(await can("authenticated", fn), `authenticated → ${fn}`).toBe(true);
    }
    expect(await can("anon", "get_public_social_settings(uuid)")).toBe(true);
  });

  it("trigger functions are not callable through the API at all", async () => {
    for (const fn of TRIGGER_FNS) {
      expect(await can("anon", fn), `anon → ${fn}`).toBe(false);
      expect(await can("authenticated", fn), `authenticated → ${fn}`).toBe(false);
    }
  });

  it("every SECURITY DEFINER function from 0000–0009 pins search_path", async () => {
    const rows = await h.sql(
      `select p.proname, p.proconfig from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'public' and p.prosecdef and p.proname = any($1::text[])`,
      [[...RPCS, ...TRIGGER_FNS, "get_public_social_settings()"].map((f) => f.replace(/\(.*$/, ""))]);
    expect(rows.length).toBeGreaterThan(10);
    for (const r of rows) expect((r.proconfig || []).some((c) => c.startsWith("search_path=")), r.proname).toBe(true);
  });

  it("API roles have no TRUNCATE / TRIGGER / REFERENCES on the app tables", async () => {
    const tables = ["profiles", "community_posts", "post_comments", "reviews", "notifications", "messages",
      "conversations", "conversation_participants", "message_requests", "subscriptions", "payment_events", "referrals"];
    for (const t of tables) {
      for (const role of ["anon", "authenticated"]) {
        const [r] = await h.sql(
          `select has_table_privilege($1, $2, 'TRUNCATE') tr, has_table_privilege($1, $2, 'TRIGGER') tg,
                  has_table_privilege($1, $2, 'REFERENCES') rf`, [role, `public.${t}`]);
        expect(r, `${role} on ${t}`).toEqual({ tr: false, tg: false, rf: false });
      }
    }
  });
});
