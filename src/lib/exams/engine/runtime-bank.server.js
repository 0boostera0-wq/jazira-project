// ============================================================================
// Runtime bank reader and guest pool sources (docs/CONTENT_ENGINE.md §5.8).
// SERVER-ONLY: key chunks hold answers and explanations.
//
// Layout (written by scripts/content/pack-runtime-bank.mjs, schemas in
// data/schemas/runtime-bank-*.schema.json):
//   index.json        { schema, bank_revision, files: {<file id>: {path, sha256, bytes}},
//                       nodes: {<node id>: {counts: {1,2,3}, sel: <file id>}} }
//   sel/<name>.json   selection rows [key, lesson, band, component, type, stimulus, premium, revision, chunk, objective]
//   c/<chunk>.json    public content of the chunk's items   (file id c-<chunk>)
//   k/<chunk>.json    answers, explanations, objectives, sources (file id k-<chunk>)
//
// Safety: a file is opened only through the index's `files` whitelist (id
// pattern, own property, path pattern, containment under the bank dir, byte
// size and sha256 checked); a scope string is never turned into a path.
// Memory: parsed files live in a byte-bounded LRU (default 64 MB, size = file
// bytes × 3 as a heap estimate); content and key chunks are loaded only for
// picked keys.
//
//   createRuntimeBank({ dir, maxBytes })  → bank
//   getRuntimeBank()                       process singleton (RUNTIME_BANK_DIR or data/runtime/bank)
//   bankPoolSource(bank) · rpcPoolSource(admin)   the guest routes' pool sources
// ============================================================================
import { createHash } from "node:crypto";
import { readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";

if (typeof window !== "undefined") {
  throw new Error("runtime-bank.server.js is server-only (it reads answer keys)");
}

export const LRU_MAX_BYTES = 64 * 1024 * 1024;
export const HEAP_FACTOR = 3;
/** The read log (stats().reads, for tests and diagnostics) keeps the most recent entries only. */
export const READ_LOG_MAX = 2048;
export const SEL_COLUMNS = Object.freeze(["key", "lesson", "band", "component", "type", "stimulus", "premium", "revision", "chunk", "objective"]);
const FILE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const FILE_PATH_RE = /^(?:sel|c|k)\/[a-z0-9][a-z0-9_-]{0,63}\.json$/;
const hasOwn = (o, k) => o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
const MISSING = new Set(["PGRST202", "PGRST205", "42P01", "42883"]);

export class BankError extends Error {
  constructor(code, detail = "") {
    super(`${code}${detail ? `: ${detail}` : ""}`);
    this.name = "BankError";
    this.code = code;
  }
}

/**
 * @param {object} o
 * @param {string} o.dir                bank directory
 * @param {number} [o.maxBytes]         LRU budget (heap estimate)
 * @param {Function} [o.readFile]       injectable reader (tests count reads)
 */
export function createRuntimeBank({ dir, maxBytes = LRU_MAX_BYTES, readFile = fsReadFile } = {}) {
  const root = path.resolve(dir);
  const lru = new Map(); // file id → { value, size }
  let used = 0;
  let indexPromise = null;
  const reads = [];

  async function loadIndex() {
    const buf = await readFile(path.join(root, "index.json"));
    const index = JSON.parse(buf.toString("utf8"));
    if (index?.schema !== "runtime-bank-index@1" || !index.files || !index.nodes || typeof index.bank_revision !== "string") {
      throw new BankError("bank_invalid", "index.json");
    }
    return index;
  }
  const index = () => {
    if (!indexPromise) indexPromise = loadIndex().catch((e) => {
      indexPromise = null;
      throw e;
    });
    return indexPromise;
  };

  /** Whitelisted absolute path of a file id (never built from a scope). */
  async function resolveFile(fileId) {
    const idx = await index();
    if (typeof fileId !== "string" || !FILE_ID_RE.test(fileId) || !hasOwn(idx.files, fileId)) throw new BankError("bank_file_unknown", String(fileId).slice(0, 80));
    const entry = idx.files[fileId];
    if (!entry || typeof entry.path !== "string" || !FILE_PATH_RE.test(entry.path)) throw new BankError("bank_file_unknown", fileId);
    const abs = path.resolve(root, entry.path);
    if (!abs.startsWith(root + path.sep)) throw new BankError("bank_file_unknown", fileId);
    return { abs, entry };
  }

  function remember(fileId, value, size) {
    if (size > maxBytes) return; // never cache a file larger than the whole budget
    lru.set(fileId, { value, size });
    used += size;
    for (const [k, v] of lru) {
      if (used <= maxBytes) break;
      if (k === fileId) continue;
      lru.delete(k);
      used -= v.size;
    }
  }

  async function file(fileId) {
    if (lru.has(fileId)) {
      const hit = lru.get(fileId);
      lru.delete(fileId);
      lru.set(fileId, hit); // most recently used
      return hit.value;
    }
    const { abs, entry } = await resolveFile(fileId);
    const buf = await readFile(abs);
    reads.push(entry.path);
    if (reads.length > READ_LOG_MAX) reads.splice(0, reads.length - READ_LOG_MAX / 2); // bounded: the singleton lives as long as the instance
    if (buf.length !== entry.bytes || createHash("sha256").update(buf).digest("hex") !== entry.sha256) throw new BankError("bank_invalid", entry.path);
    const value = JSON.parse(buf.toString("utf8"));
    remember(fileId, value, buf.length * HEAP_FACTOR);
    return value;
  }

  /** Index entry of a node id, or null (own properties only). */
  async function nodeInfo(nodeId) {
    const idx = await index();
    return typeof nodeId === "string" && hasOwn(idx.nodes, nodeId) ? idx.nodes[nodeId] : null;
  }

  /** Selection rows of a sel file as objects. */
  async function selection(selId) {
    const sel = await file(selId);
    if (sel?.schema !== "runtime-bank-sel@1" || !Array.isArray(sel.rows)) throw new BankError("bank_invalid", selId);
    // a row without the objective column (an older bank) reads objective: null
    return sel.rows.map((r) => Object.fromEntries(SEL_COLUMNS.map((c, i) => [c, c === "objective" ? r[i] ?? null : r[i]])));
  }

  /** Rows of the selection file serving a node (subject-or-narrower, prep section/topic). */
  async function rowsForNode(nodeId) {
    const info = await nodeInfo(nodeId);
    return info ? selection(info.sel) : null;
  }

  async function chunkItems(prefix, rows) {
    const byChunk = new Map();
    for (const r of rows) {
      if (!byChunk.has(r.chunk)) byChunk.set(r.chunk, new Set());
      byChunk.get(r.chunk).add(r.key);
    }
    const out = new Map();
    for (const [chunk, keys] of [...byChunk.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const c = await file(`${prefix}-${chunk}`);
      for (const it of c.items ?? []) if (keys.has(it.key)) out.set(it.key, it);
    }
    return out;
  }

  return {
    dir: root,
    index,
    nodeInfo,
    selection,
    rowsForNode,
    /** Public content rows of the given selection rows (loads only their c/ chunks). */
    content: (rows) => chunkItems("c", rows),
    /** Key rows (answers) of the given selection rows (loads only their k/ chunks). */
    keys: (rows) => chunkItems("k", rows),
    stats: () => ({ bytes: used, cached: [...lru.keys()], reads: [...reads], maxBytes }),
  };
}

let singleton = null;
/** The process-wide bank (RUNTIME_BANK_DIR, default <cwd>/data/runtime/bank). */
export function getRuntimeBank() {
  if (!singleton) {
    const dir = process.env.RUNTIME_BANK_DIR ? path.resolve(process.env.RUNTIME_BANK_DIR) : path.join(process.cwd(), "data", "runtime", "bank");
    singleton = createRuntimeBank({ dir });
  }
  return singleton;
}
/** Tests: forget the singleton (e.g. after changing RUNTIME_BANK_DIR). */
export function resetRuntimeBank() {
  singleton = null;
}

// ── pool sources ────────────────────────────────────────────────────────────
/** The selection-file node of a scope: the node itself (term suffix dropped) or the prep node. */
export const scopeNodeOf = (parsed) => parsed.node;

/**
 * Pool source over the runtime bank (the JS engine selects).
 *   rows(parsed, resolution) → pool rows with lesson context, or null (scope not in the bank)
 *   rowsForKeys(parsed, keys) → Map key → selection row (check/submit)
 *   content(rows) / keys(rows) → Map key → c/ or k/ item
 */
export function bankPoolSource(bank) {
  return {
    kind: "bank",
    bankRevision: async () => (await bank.index()).bank_revision,
    async rows(parsed, resolution) {
      const all = await bank.rowsForNode(scopeNodeOf(parsed));
      if (!all) return null;
      if (parsed.type === "prep") {
        return all
          .filter((r) => r.lesson === parsed.node || r.lesson.startsWith(`${parsed.node}/`))
          .map((r) => ({ ...r, topic: r.lesson.split("/")[2] ?? null, unit: null, chapter: null, term: null, objective: null }));
      }
      const ctx = new Map(resolution.lessons.map((l) => [l.id, l]));
      return all
        .filter((r) => ctx.has(r.lesson))
        .map((r) => {
          const l = ctx.get(r.lesson);
          // objective: lesson-quiz stratifies by it (§2.12); stratumOf falls back to the lesson when null
          return { ...r, unit: l.unit, chapter: l.chapter, term: l.term, topic: null, objective: r.objective ?? null };
        });
    },
    async rowsForKeys(parsed, keys) {
      const all = await bank.rowsForNode(scopeNodeOf(parsed));
      const want = new Set(keys);
      return new Map((all ?? []).filter((r) => want.has(r.key)).map((r) => [r.key, r]));
    },
    content: (rows) => bank.content(rows),
    keys: (rows) => bank.keys(rows),
  };
}

/**
 * Pool source over the service-role RPCs (§5.8, §6.2): the selection runs in
 * SQL (ce_guest_start) and only the picked public rows come back;
 * ce_guest_items returns content (and keys at check/submit time).
 * Contract: tests/fixtures/contracts/rpc/ce_guest_start.json, ce_guest_items.json.
 * A missing function (PGRST202 / 42883 …) reports { missing: true } so the
 * route falls back to the runtime bank.
 */
export function rpcPoolSource(admin) {
  const call = async (fn, args) => {
    let res;
    try {
      res = await admin.rpc(fn, args);
    } catch (e) {
      return { error: { code: "network", message: String(e?.message || e) } };
    }
    const { data, error } = res ?? {};
    if (error) return { error, missing: MISSING.has(error.code) || /could not find the function|schema cache/i.test(error.message || "") };
    return { data };
  };
  return {
    kind: "rpc",
    start: ({ template, scope, seed, seen, count }) => call("ce_guest_start", { p_template: template, p_scope: scope, p_seed: seed, p_seen: seen, p_count: count }),
    items: (keys, withKeys) => call("ce_guest_items", { p_keys: keys, p_with_keys: withKeys }),
  };
}

/** Split a ce_guest_items row into the content row and the key row. */
export function splitRpcItem(row) {
  const { key_data: keyData = null, ...content } = row ?? {};
  return { content, key: keyData ? { key: content.key, revision: content.revision, ...keyData } : null };
}

/**
 * Content (and keys) of a session's items at check / submit time: through
 * ce_guest_items when the service role is there and the function exists,
 * otherwise from the runtime bank (only the chunks of these keys).
 * @returns {Promise<{ ok:true, content: Map, keys: Map, source: "rpc"|"bank" } | { ok:false, error:"unavailable" }>}
 */
export async function loadSessionItems({ admin = null, bank = null, parsed, keys, withKeys = true }) {
  if (admin) {
    const res = await rpcPoolSource(admin).items(keys, withKeys);
    if (!res.error && Array.isArray(res.data)) {
      const content = new Map();
      const keyRows = new Map();
      for (const row of res.data) {
        const { content: c, key } = splitRpcItem(row);
        if (!keys.includes(c.key)) continue;
        content.set(c.key, c);
        if (key) keyRows.set(c.key, key);
      }
      return { ok: true, content, keys: keyRows, source: "rpc" };
    }
    if (!res.missing) return { ok: false, error: "unavailable" };
  }
  if (!bank) return { ok: false, error: "unavailable" };
  try {
    const src = bankPoolSource(bank);
    const rows = [...(await src.rowsForKeys(parsed, keys)).values()];
    return { ok: true, content: await src.content(rows), keys: withKeys ? await src.keys(rows) : new Map(), source: "bank" };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
