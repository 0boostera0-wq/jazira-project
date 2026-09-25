// ============================================================================
// Supabase-like PGlite test harness.
//
//   const h = await createDb();          // shim + every supabase/migrations/*.sql
//   const alice = await h.createUser({ meta: { full_name: "Alice Smith" } });
//   await h.asUser(alice, (tx) => tx.sql("insert into public.reviews ..."));
//   await expect(h.asAnon((tx) => tx.sql("..."))).rejects.toThrow(/row-level security/);
//
// Boot once per test file (beforeAll) and isolate tests with fresh users.
//
// How it mimics Supabase
//  * tests/db/supabase-shim.sql creates roles anon/authenticated/service_role,
//    the auth + storage schemas, the extensions schema, the supabase_realtime
//    publication and Supabase's default privileges.
//  * Migrations run unmodified, one file at a time, in filename order, as the
//    PGlite superuser `postgres` (so their objects are owned by postgres, and
//    SECURITY DEFINER functions bypass RLS exactly like Supabase's postgres).
//  * asUser/asAnon/asService open a transaction and do what PostgREST does per
//    request: `set local role <role>` + `set_config('request.jwt.claims', …, true)`
//    (+ the legacy request.jwt.claim.sub / .role GUCs), so auth.uid(),
//    auth.role() and auth.jwt() resolve like in production and RLS applies.
//  * Realtime: PGlite 0.5.8 supports CREATE/ALTER PUBLICATION natively, so the
//    `alter publication supabase_realtime add table …` blocks in the migrations
//    run as-is — nothing is stripped. (No WAL is streamed; only membership in
//    the publication can be asserted, via pg_publication_tables.)
//  * pg_trgm is loaded (available) but NOT created — like Supabase, a migration
//    must `create extension if not exists pg_trgm` before using it. pgcrypto
//    and uuid-ossp are pre-created in schema `extensions` like Supabase.
//
// Differences from Supabase worth knowing
//  * Migration owner is a real superuser here (Supabase's postgres is not), so
//    a migration using a superuser-only command could pass here and fail there.
//  * Storage is table-level only: "uploading" = inserting into storage.objects
//    as the user (owner = uid), which is what the Storage API does under RLS.
//  * No GoTrue: createUser() inserts straight into auth.users (the
//    on_auth_user_created trigger still fires).
// ============================================================================
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..");
export const MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase", "migrations");
export const SHIM_FILE = path.join(HERE, "supabase-shim.sql");

const ROLES = new Set(["anon", "authenticated", "service_role"]);

/** Sorted list of migration filenames (what a fresh Supabase project gets, in order). */
export function listMigrations(dir = MIGRATIONS_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

// `sql` accepts either (text, params[]) or a tagged template: sql`select ${x}`.
function makeSql(runner) {
  return async function sql(text, ...rest) {
    if (Array.isArray(text) && Object.prototype.hasOwnProperty.call(text, "raw")) {
      let q = text[0];
      const params = [];
      for (let i = 0; i < rest.length; i++) {
        params.push(rest[i]);
        q += `$${params.length}${text[i + 1]}`;
      }
      return (await runner.query(q, params)).rows;
    }
    return (await runner.query(text, rest[0] ?? [])).rows;
  };
}

function wrapRunner(runner) {
  return {
    /** Full PGlite result: { rows, fields, affectedRows }. Single statement. */
    query: (text, params = []) => runner.query(text, params),
    /** Rows only. (text, params) or tagged template. Single statement. */
    sql: makeSql(runner),
    /** Multi-statement script, no params. Returns PGlite results[]. */
    exec: (text) => runner.exec(text),
  };
}

async function applyFile(db, file, label) {
  const text = readFileSync(file, "utf8");
  try {
    await db.exec(text);
  } catch (err) {
    // A failed file may leave an explicit BEGIN open; end it so the error is clean.
    try { await db.exec("rollback"); } catch { /* no transaction open */ }
    const e = new Error(`[db harness] ${label} failed: ${err.message}`);
    e.cause = err;
    e.code = err.code;
    e.file = label;
    throw e;
  }
}

/**
 * Boot a fresh in-memory Supabase-like database.
 *
 * @param {object}   [opts]
 * @param {string}   [opts.until]  apply migrations up to and including the first
 *                                 file whose name starts with this (e.g. "0005").
 * @param {string[]} [opts.skip]   migration filenames to skip.
 * @param {boolean}  [opts.migrate=true] false → shim only.
 * @returns {Promise<Harness>}
 */
export async function createDb(opts = {}) {
  const { until, skip = [], migrate = true } = opts;
  const db = new PGlite({ extensions: { pg_trgm, pgcrypto, uuid_ossp } });
  await db.waitReady;

  await applyFile(db, SHIM_FILE, "tests/db/supabase-shim.sql");

  const applied = [];
  if (migrate) {
    for (const f of listMigrations()) {
      if (skip.includes(f)) continue;
      await applyFile(db, path.join(MIGRATIONS_DIR, f), `supabase/migrations/${f}`);
      applied.push(f);
      if (until && f.startsWith(until)) break;
    }
  }

  // Claims cache so asUser() can put email / app_metadata in the JWT like GoTrue.
  const claimsByUid = new Map();

  async function asRole(role, claims, fn, { rollback = false } = {}) {
    if (!ROLES.has(role)) throw new Error(`[db harness] unknown role: ${role}`);
    const full = { role, ...(claims || {}) };
    return db.transaction(async (tx) => {
      await tx.exec(`set local role ${role}`);
      await tx.query(
        `select set_config('request.jwt.claims', $1, true),
                set_config('request.jwt.claim.sub', $2, true),
                set_config('request.jwt.claim.role', $3, true)`,
        [JSON.stringify(full), full.sub ?? "", role],
      );
      const result = await fn(wrapRunner(tx));
      if (rollback && !tx.closed) await tx.rollback();
      return result;
    });
  }

  const superuser = wrapRunner(db);

  return {
    db,
    /** Applied migration filenames, in order. */
    migrations: applied,
    /** Superuser (postgres, bypasses RLS). Rows only; (text, params) or tagged template. */
    sql: superuser.sql,
    /** Superuser full result ({ rows, affectedRows, fields }). */
    query: superuser.query,
    /** Superuser multi-statement script. */
    exec: superuser.exec,

    /**
     * Run fn(tx) as an authenticated user in one transaction (committed unless
     * fn throws or opts.rollback). Errors propagate; the transaction always ends.
     * @param {string} uid
     * @param {(tx) => Promise<any>} fn
     * @param {{ claims?: object, rollback?: boolean }} [opts]
     */
    asUser(uid, fn, opts = {}) {
      const base = claimsByUid.get(uid) || {};
      const claims = { aud: "authenticated", ...base, sub: uid, ...(opts.claims || {}) };
      return asRole("authenticated", claims, fn, opts);
    },
    /** Run fn(tx) as the anon role (no sub). */
    asAnon(fn, opts = {}) {
      return asRole("anon", { ...(opts.claims || {}) }, fn, opts);
    },
    /** Run fn(tx) as service_role (BYPASSRLS, like the server's service key). */
    asService(fn, opts = {}) {
      return asRole("service_role", { ...(opts.claims || {}) }, fn, opts);
    },
    /** Generic: asRole("authenticated", { sub, … }, fn, { rollback }). */
    asRole,

    /**
     * Insert into auth.users (fires handle_new_user) and return the new id.
     * @param {{ email?: string, meta?: object, appMeta?: object, id?: string, confirmed?: boolean }} [u]
     * @returns {Promise<string>}
     */
    async createUser({ email, meta = {}, appMeta, id, confirmed = true } = {}) {
      const mail = email || `u_${Math.random().toString(36).slice(2, 10)}@test.local`;
      const app = appMeta || { provider: "email", providers: ["email"] };
      const rows = await superuser.sql(
        `insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at)
         values (coalesce($1::uuid, gen_random_uuid()), $2, $3::jsonb, $4::jsonb,
                 case when $5::boolean then now() end)
         returning id`,
        [id ?? null, mail, JSON.stringify(meta), JSON.stringify(app), confirmed],
      );
      const uid = rows[0].id;
      claimsByUid.set(uid, { email: mail, app_metadata: app, user_metadata: meta, is_anonymous: false });
      return uid;
    },

    /** Close the database (call in afterAll). */
    close: () => db.close(),
  };
}
