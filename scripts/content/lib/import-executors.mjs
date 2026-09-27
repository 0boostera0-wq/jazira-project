// ============================================================================
// Import executors (docs/CONTENT_ENGINE.md §6.3 step 8): `{ target, rpc(name,
// args), close() }` over the service role.
//
//   pglite    tests/db/harness.js createDb() (fresh in-memory database with
//             every migration, or an existing harness passed in) + asService
//   supabase  createAdminClient() (src/lib/supabase-admin.js) with the
//             service key from the environment
//
// rpc() resolves to the function's result or throws an ImportRpcError
// { code, message, details, network }. `network: true` marks errors the
// importer retries with backoff (connection failures, 5xx, timeouts).
// ============================================================================

export class ImportRpcError extends Error {
  constructor({ code = null, message = "rpc_error", details = null, network = false } = {}) {
    super(message);
    this.name = "ImportRpcError";
    this.code = code;
    this.details = details;
    this.network = network;
  }
}

const NETWORK_RE = /fetch failed|network|ECONN(?:RESET|REFUSED|ABORTED)|ETIMEDOUT|EAI_AGAIN|socket hang up|UND_ERR/i;
const SQLSTATE_RE = /^[0-9A-Z]{5}$/;
const TRANSIENT_SQLSTATE_RE = /^(?:08|53|57P|40001|40P01)/;

/** Classify a thrown error or a PostgREST error object. */
export function toRpcError(e) {
  if (e instanceof ImportRpcError) return e;
  const code = e?.code ?? null;
  const message = e?.message ?? String(e);
  const status = Number(e?.status ?? 0);
  // A database error (5-character SQLSTATE) is retried only when it is transient
  // (connection, resources, shutdown, serialization); anything else, such as a
  // statement timeout that PostgREST reports as HTTP 500, is split like a bad batch.
  const sqlState = typeof code === "string" && SQLSTATE_RE.test(code);
  const network = code === "network" || NETWORK_RE.test(message) || NETWORK_RE.test(String(code ?? ""))
    || (sqlState ? TRANSIENT_SQLSTATE_RE.test(code) : status >= 500 || status === 429);
  let details = e?.details ?? e?.detail ?? null;
  if (typeof details === "string") {
    try {
      details = JSON.parse(details);
    } catch {
      /* plain text detail */
    }
  }
  return new ImportRpcError({ code, message, details, network });
}

/** pg_proc signature lookup → `name => $n::type` calls (PostgREST-like named arguments). */
async function signatureOf(sql, fn, cache) {
  if (!cache.has(fn)) {
    const rows = await sql(
      `select p.proargnames as names,
              array(select format_type(t, null) from unnest(p.proargtypes::oid[]) with ordinality u(t, o) order by o) as types
         from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [fn]);
    cache.set(fn, rows);
  }
  return cache.get(fn);
}

/**
 * PGlite executor.
 * @param {object} [o]
 * @param {object} [o.harness]  an existing tests/db/harness.js database (not closed by close())
 */
export async function createPgliteExecutor({ harness = null } = {}) {
  let h = harness;
  let own = false;
  if (!h) {
    const { createDb } = await import("../../../tests/db/harness.js");
    h = await createDb();
    own = true;
  }
  const signatures = new Map();
  return {
    target: "pglite",
    harness: h,
    async rpc(fn, args = {}) {
      const overloads = await signatureOf(h.sql, fn, signatures);
      const keys = Object.keys(args);
      const sig = overloads.find((s) => keys.every((k) => (s.names ?? []).includes(k)));
      if (!sig) throw new ImportRpcError({ code: "PGRST202", message: `Could not find the function public.${fn}` });
      const params = [];
      const parts = keys.map((k) => {
        const i = sig.names.indexOf(k);
        const v = args[k];
        params.push(v !== null && typeof v === "object" && sig.types[i] === "jsonb" ? JSON.stringify(v) : v);
        return `${k} => $${params.length}::${sig.types[i]}`;
      });
      try {
        const rows = await h.asService((tx) => tx.sql(`select public.${fn}(${parts.join(", ")}) as r`, params));
        return rows[0]?.r ?? null;
      } catch (e) {
        throw new ImportRpcError({ code: e.code ?? null, message: e.message, details: parseDetail(e.detail), network: false });
      }
    },
    async close() {
      if (own) await h.close();
    },
  };
}

function parseDetail(d) {
  if (d === undefined || d === null || d === "") return null;
  try {
    return JSON.parse(d);
  } catch {
    return d;
  }
}

/**
 * Supabase executor (service role). Requires NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in the environment.
 * @param {object} [o]
 * @param {object} [o.client]  a supabase-js client (tests)
 */
export async function createSupabaseExecutor({ client = null } = {}) {
  let admin = client;
  if (!admin) {
    const { createAdminClient } = await import("../../../src/lib/supabase-admin.js");
    admin = createAdminClient();
  }
  if (!admin) throw new ImportRpcError({ code: "unavailable", message: "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --target supabase" });
  return {
    target: "supabase",
    async rpc(fn, args = {}) {
      let res;
      try {
        res = await admin.rpc(fn, args);
      } catch (e) {
        throw new ImportRpcError({ code: "network", message: String(e?.message ?? e), network: true });
      }
      if (res?.error) throw toRpcError({ ...res.error, status: res.status });
      return res?.data ?? null;
    },
    async close() {},
  };
}

/** Executor for a target name. */
export async function createExecutor(target, options = {}) {
  if (target === "pglite") return createPgliteExecutor(options);
  if (target === "supabase") return createSupabaseExecutor(options);
  throw new ImportRpcError({ code: "invalid_argument", message: `unknown target ${target}` });
}
