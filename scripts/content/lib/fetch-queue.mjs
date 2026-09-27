// ============================================================================
// The shared, persisted, polite fetch queue (docs/CONTENT_ENGINE.md §4.1).
// Every request to *.ien.edu.sa (crawler, front matter, renders, full
// downloads) goes through it. The iEN CDN refused connections after ~80
// downloads in a burst, so:
//
//   - at most 2 requests in flight ACROSS PROCESSES (slot lock files
//     <cache>/fetch/slot-N.lock; a second process waits), 500 ms between
//     request starts, an identifying User-Agent, an hourly request budget
//     (default 600);
//   - exponential backoff with full jitter (base 2 s, cap 10 min) on
//     ECONNREFUSED, ECONNRESET, ETIMEDOUT, 429, 503 and other 5xx, honouring
//     Retry-After; no retry on other 4xx;
//   - a circuit breaker: 5 consecutive refusals → 60-minute cool-off
//     (persisted in <cache>/fetch/state.json, so a restart does not reset it);
//     3 trips in a (UTC) day → halted until the next day. Nothing is ever
//     rotated or disguised to evade a limit;
//   - jobs persist in <cache>/fetch/queue.jsonl
//     {id, url, kind: api|head|range|full, resource_id, state: pending|done|failed|parked,
//      attempts, last_error, next_at, updated_at} and resume over days.
//
//   const q = createFetchQueue();                 // defaults from the cache layout
//   const r = await q.request(url, { kind: "api" })       → { status, headers, body }
//   await q.enqueue([{ url, kind: "full", resource_id }]); await q.runJobs(handler)
//   await ensurePdf(name, { queue: q, url, expectedBytes, lastModified })
//
// A paused queue (breaker, halt, budget) throws QueuePausedError with `until`;
// callers stop cleanly and resume later.
// ============================================================================

import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, appendFileSync, openSync, readSync, closeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { cachePaths, cacheRoot, isInside, safePdfName } from "./cache.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** PDFs, page text and renders are copyrighted: the cache (and the queue files) must be outside the repository (§1.3). */
export function assertOutsideRepo(path, repoRoot = REPO_ROOT) {
  if (isInside(repoRoot, path)) throw new Error(`the content cache (${resolve(path)}) must be outside the repository (${repoRoot})`);
  return path;
}

export const USER_AGENT = "JaziraContentPipeline/1.0 (curriculum metadata; contact: support@jazira.sa)";
export const IEN_BOOKS_BASE = "https://iencontent.ien.edu.sa/books/";

export const DEFAULTS = Object.freeze({
  maxInFlight: 2,
  pauseMs: 500,
  budgetPerHour: 600,
  backoffBaseMs: 2000,
  backoffCapMs: 10 * 60 * 1000,
  breakerThreshold: 5,
  breakerCoolOffMs: 60 * 60 * 1000,
  maxTripsPerDay: 3,
  maxJobAttempts: 8,
  maxInlineRetries: 3,
  maxInlineWaitMs: 60 * 1000,
  timeoutMs: 60 * 1000,
  pollMs: 100,
  lockTimeoutMs: 5 * 60 * 1000,
});

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// ── errors ──────────────────────────────────────────────────────────────────
/** The queue is paused (breaker open, halted for the day, or hourly budget spent) until `until` (ms). */
export class QueuePausedError extends Error {
  constructor(reason, until) {
    super(`fetch queue paused (${reason}) until ${new Date(until).toISOString()}`);
    this.name = "QueuePausedError";
    this.reason = reason;
    this.until = until;
  }
}

/** A non-retryable HTTP answer (4xx other than 429). */
export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} ${url}`);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
  }
}

/** A retryable failure whose next attempt is not before `nextAt` (ms). */
export class RetryLaterError extends Error {
  constructor(message, nextAt, { code = null, status = null } = {}) {
    super(message);
    this.name = "RetryLaterError";
    this.nextAt = nextAt;
    this.code = code;
    this.status = status;
  }
}

// ── pure helpers ────────────────────────────────────────────────────────────
const REFUSAL_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET", "UND_ERR_CLOSED"]);

/** Error code of a fetch failure (undici wraps it in `cause`). */
export function errorCode(err) {
  if (!err) return null;
  if (err.name === "TimeoutError" || err.name === "AbortError") return "ETIMEDOUT";
  return err.code || err.cause?.code || err.cause?.cause?.code || null;
}

/**
 * Classify an outcome: { status } or { error }.
 * refusal: counts toward the breaker (ECONNREFUSED/ECONNRESET/ETIMEDOUT, 429, 503);
 * retryable: backoff and retry (refusals, other 5xx, other network errors); else fatal.
 */
export function classifyFailure({ status = null, error = null } = {}) {
  if (status !== null && status !== undefined) {
    if (status === 429 || status === 503) return { refusal: true, retryable: true, code: `HTTP_${status}` };
    if (status >= 500) return { refusal: false, retryable: true, code: `HTTP_${status}` };
    return { refusal: false, retryable: false, code: `HTTP_${status}` };
  }
  const code = errorCode(error) || "ENETWORK";
  return { refusal: REFUSAL_CODES.has(code), retryable: true, code };
}

/** Retry-After (delta seconds or HTTP date) → ms from `now`, or null. */
export function parseRetryAfter(value, now = Date.now()) {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value).trim();
  if (/^\d+$/.test(s)) return Number(s) * 1000;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : Math.max(0, t - now);
}

/** Full-jitter exponential backoff: random() × min(cap, base × 2^(attempt−1)). */
export function backoffDelay(attempt, { baseMs = DEFAULTS.backoffBaseMs, capMs = DEFAULTS.backoffCapMs, random = Math.random } = {}) {
  const ceiling = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.floor(random() * ceiling);
}

export const jobId = (kind, url) => `${kind}:${url}`;
const iso = (ms) => (ms === null || ms === undefined ? null : new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z"));
const ms = (isoText) => (isoText ? Date.parse(isoText) : null);

// ── sync file primitives (Windows-safe) ─────────────────────────────────────
const SLEEP_CELL = new Int32Array(new SharedArrayBuffer(4));
const sleepSync = (t) => Atomics.wait(SLEEP_CELL, 0, 0, t);
const realSleep = (t) => new Promise((r) => setTimeout(r, t));

function atomicWrite(path, content, token) {
  const tmp = `${path}.${token}.tmp`;
  writeFileSync(tmp, content);
  for (let i = 0; ; i++) {
    try {
      renameSync(tmp, path);
      return;
    } catch (e) {
      if (i >= 50 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) {
        try {
          unlinkSync(tmp);
        } catch {
          // already gone
        }
        throw e;
      }
      sleepSync(10);
    }
  }
}

function readTextRetry(path) {
  for (let i = 0; ; i++) {
    try {
      return readFileSync(path, "utf8");
    } catch (e) {
      if (e.code === "ENOENT") return null;
      if (i >= 50 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) throw e;
      sleepSync(10);
    }
  }
}

/** Is a process alive? (signal 0 works on Windows too) */
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

function tryLock(path, info) {
  try {
    writeFileSync(path, JSON.stringify(info), { flag: "wx" });
    return true;
  } catch (e) {
    if (e.code === "EEXIST" || e.code === "EPERM" || e.code === "EBUSY") return false;
    throw e;
  }
}

/** A lock is stale when its owner process is gone, or (maxAgeMs) it is older than that. */
function lockStale(path, maxAgeMs = null) {
  const text = readTextRetry(path);
  if (text === null) return true;
  let info = null;
  try {
    info = JSON.parse(text);
  } catch {
    // a lock file caught mid-write: judge by age
    try {
      return Date.now() - statSync(path).mtimeMs > 5000;
    } catch {
      return true;
    }
  }
  if (!pidAlive(info.pid)) return true;
  return maxAgeMs !== null && Date.now() - Number(info.at || 0) > maxAgeMs;
}

function removeQuietly(path) {
  try {
    unlinkSync(path);
  } catch {
    // someone else removed it
  }
}

function emptyState() {
  return {
    last_request_at: 0,
    budget: { window_start: 0, count: 0 },
    breaker: { consecutive_refusals: 0, open_until: 0, trips: [], halted_until: 0 },
    totals: { requests: 0, refusals: 0, trips: 0 },
  };
}

// ── the queue ───────────────────────────────────────────────────────────────
/**
 * @param {object} [options] DEFAULTS overrides plus:
 *   dir (default <cache>/fetch), cacheRoot, userAgent, fetch (impl), now, sleep, random, log
 */
export function createFetchQueue(options = {}) {
  const o = { ...DEFAULTS, ...Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)) };
  if (!Number.isFinite(o.budgetPerHour) || o.budgetPerHour < 1) throw new Error("budgetPerHour must be ≥ 1");
  if (!Number.isInteger(o.maxInFlight) || o.maxInFlight < 1) throw new Error("maxInFlight must be ≥ 1");
  const dir = assertOutsideRepo(o.dir ?? cachePaths(o.cacheRoot ?? cacheRoot()).fetchDir());
  mkdirSync(dir, { recursive: true });
  const files = {
    queue: join(dir, "queue.jsonl"),
    state: join(dir, "state.json"),
    lock: join(dir, "state.lock"),
    slot: (i) => join(dir, `slot-${i}.lock`),
  };
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? realSleep;
  const random = o.random ?? Math.random;
  const fetchImpl = o.fetch ?? globalThis.fetch;
  const userAgent = o.userAgent ?? USER_AGENT;
  const token = `${process.pid}-${randomUUID().slice(0, 8)}`;
  const log = o.log ?? (() => {});
  const inFlight = { current: 0, max: 0 };

  // Short critical sections (state and queue files) under one mutex file.
  async function withLock(fn) {
    const start = Date.now();
    for (;;) {
      if (tryLock(files.lock, { pid: process.pid, token, at: Date.now() })) break;
      if (lockStale(files.lock, 30 * 1000)) removeQuietly(files.lock);
      else if (Date.now() - start > o.lockTimeoutMs) throw new Error(`fetch queue: state lock busy (${files.lock})`);
      else await realSleep(5 + Math.floor(Math.random() * 15));
    }
    try {
      return fn();
    } finally {
      removeQuietly(files.lock);
    }
  }

  function readState() {
    const text = readTextRetry(files.state);
    const base = emptyState();
    if (!text) return base;
    try {
      const s = JSON.parse(text);
      return { ...base, ...s, budget: { ...base.budget, ...s.budget }, breaker: { ...base.breaker, ...s.breaker }, totals: { ...base.totals, ...s.totals } };
    } catch {
      return base;
    }
  }
  const writeState = (s) => atomicWrite(files.state, JSON.stringify(s, null, 2) + "\n", token);

  function gate(s, t) {
    const b = s.breaker;
    if (b.halted_until > t) throw new QueuePausedError("halted", b.halted_until);
    if (b.open_until > t) throw new QueuePausedError("breaker", b.open_until);
    const hour = Math.floor(t / HOUR) * HOUR;
    if (s.budget.window_start !== hour) s.budget = { window_start: hour, count: 0 };
    if (s.budget.count >= o.budgetPerHour) throw new QueuePausedError("budget", hour + HOUR);
  }

  /** Throws QueuePausedError when the queue may not send now. */
  async function checkGate() {
    await withLock(() => gate(readState(), now()));
  }

  async function acquireSlot() {
    const start = Date.now();
    for (;;) {
      for (let i = 0; i < o.maxInFlight; i++) {
        const p = files.slot(i);
        if (tryLock(p, { pid: process.pid, token, at: Date.now() })) return p;
        if (lockStale(p)) removeQuietly(p);
      }
      if (Date.now() - start > 6 * HOUR) throw new Error("fetch queue: no free slot for 6 hours");
      await realSleep(o.pollMs);
    }
  }

  // Admission after a slot is held: gate, 500 ms spacing between request
  // starts (all processes), hourly budget.
  async function admit() {
    for (;;) {
      const wait = await withLock(() => {
        const s = readState();
        gate(s, now());
        const w = s.last_request_at + o.pauseMs - Date.now();
        if (w > 0) return w;
        s.last_request_at = Date.now();
        s.budget.count++;
        s.totals.requests++;
        writeState(s);
        return 0;
      });
      if (wait <= 0) return;
      await realSleep(wait);
    }
  }

  async function record({ refusal, ok }) {
    return withLock(() => {
      const s = readState();
      const b = s.breaker;
      let tripped = false;
      if (refusal) {
        s.totals.refusals++;
        b.consecutive_refusals++;
        if (b.consecutive_refusals >= o.breakerThreshold) {
          const t = now();
          tripped = true;
          b.consecutive_refusals = 0;
          b.open_until = t + o.breakerCoolOffMs;
          const dayStart = Math.floor(t / DAY) * DAY;
          b.trips = [...b.trips.filter((x) => ms(x) >= dayStart), iso(t)];
          s.totals.trips++;
          if (b.trips.length >= o.maxTripsPerDay) b.halted_until = dayStart + DAY;
        }
      } else if (ok) b.consecutive_refusals = 0;
      writeState(s);
      return tripped;
    });
  }

  async function attemptOnce(url, { method, headers, timeoutMs, consume }) {
    try {
      const res = await fetchImpl(url, { method, headers: { "User-Agent": userAgent, ...headers }, signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
      if (res.status < 200 || res.status >= 400) {
        const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"), now());
        try {
          await res.body?.cancel();
        } catch {
          // body already closed
        }
        return { ok: false, status: res.status, retryAfterMs };
      }
      const value = await consume(res);
      return { ok: true, status: res.status, value };
    } catch (error) {
      if (error?.fatal) throw error; // a consumer's verdict, not a network failure
      return { ok: false, error };
    }
  }

  /**
   * One polite request (with inline retries for short waits).
   * @param {string} url
   * @param {{ method?, headers?: object|(() => object), kind?, consume?: (res) => any, timeoutMs?, retries? }} opts
   */
  async function request(url, { method = "GET", headers = {}, kind = "api", consume = null, timeoutMs = o.timeoutMs, retries = o.maxInlineRetries } = {}) {
    if (!/^https?:\/\//i.test(String(url))) throw new Error(`fetch queue: not an http(s) URL: ${url}`);
    const read = consume ?? (async (res) => ({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) }));
    for (let attempt = 1; ; attempt++) {
      const slot = await acquireSlot();
      let outcome;
      inFlight.current++;
      inFlight.max = Math.max(inFlight.max, inFlight.current);
      try {
        await admit();
        outcome = await attemptOnce(url, { method, headers: typeof headers === "function" ? headers() : headers, timeoutMs, consume: read });
      } finally {
        inFlight.current--;
        removeQuietly(slot);
      }
      const c = outcome.ok ? { refusal: false, retryable: false } : classifyFailure(outcome);
      const tripped = await record({ refusal: c.refusal, ok: outcome.ok || !c.retryable });
      if (outcome.ok) return outcome.value;
      const what = outcome.status ? `HTTP ${outcome.status}` : c.code;
      log(`${kind} ${url}: ${what}${tripped ? " — breaker tripped" : ""}`);
      if (!c.retryable) throw new HttpError(outcome.status, url);
      const delay = outcome.retryAfterMs ?? backoffDelay(attempt, { baseMs: o.backoffBaseMs, capMs: o.backoffCapMs, random });
      if (attempt > retries || delay > o.maxInlineWaitMs || tripped) {
        throw new RetryLaterError(`${what} ${url}`, now() + delay, { code: c.code, status: outcome.status ?? null });
      }
      await sleep(delay);
    }
  }

  // ── persisted jobs ──────────────────────────────────────────────────────
  function readJobs() {
    const text = readTextRetry(files.queue);
    if (!text) return [];
    const out = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        // a torn line cannot happen with atomic writes; skip defensively
      }
    }
    return out;
  }
  const writeJobs = (jobs) => atomicWrite(files.queue, jobs.map((j) => JSON.stringify(j)).join("\n") + (jobs.length ? "\n" : ""), token);
  const jobRow = (j) => ({
    id: j.id,
    url: j.url,
    kind: j.kind,
    resource_id: j.resource_id ?? null,
    state: j.state,
    attempts: j.attempts ?? 0,
    last_error: j.last_error ?? null,
    next_at: j.next_at ?? null,
    updated_at: j.updated_at ?? iso(now()),
    ...(j.claim ? { claim: j.claim } : {}),
  });

  /** Add jobs (idempotent by kind + url). `retry` re-opens failed/parked jobs, `reopen` any finished job. */
  async function enqueue(list, { retry = false, reopen = false } = {}) {
    return withLock(() => {
      const jobs = readJobs();
      const byId = new Map(jobs.map((j) => [j.id, j]));
      let added = 0;
      for (const j of list) {
        if (!["api", "head", "range", "full"].includes(j.kind)) throw new Error(`bad job kind ${j.kind}`);
        const id = jobId(j.kind, j.url);
        const prev = byId.get(id);
        if (!prev) {
          const row = jobRow({ id, url: j.url, kind: j.kind, resource_id: j.resource_id, state: "pending" });
          jobs.push(row);
          byId.set(id, row);
          added++;
        } else if ((reopen && prev.state !== "pending") || (retry && (prev.state === "failed" || prev.state === "parked"))) {
          Object.assign(prev, { state: "pending", attempts: 0, last_error: null, next_at: null, updated_at: iso(now()) });
        }
      }
      writeJobs(jobs);
      return added;
    });
  }

  async function updateJob(id, patch) {
    return withLock(() => {
      const jobs = readJobs();
      const j = jobs.find((x) => x.id === id);
      if (!j) return null;
      Object.assign(j, patch, { updated_at: iso(now()) });
      if (!patch.claim) delete j.claim;
      writeJobs(jobs.map(jobRow));
      return j;
    });
  }

  async function claimNext(filter) {
    return withLock(() => {
      const jobs = readJobs();
      const t = now();
      const j = jobs.find((x) => x.state === "pending" && (!x.next_at || ms(x.next_at) <= t) && (!x.claim || !pidAlive(x.claim.pid)) && filter(x));
      if (!j) return null;
      j.claim = { pid: process.pid, token, at: iso(t) };
      writeJobs(jobs.map(jobRow));
      return { ...j };
    });
  }

  /**
   * Run pending jobs with `handler(job, queue)` (at most `concurrency` ≤ maxInFlight at once).
   * @returns {Promise<{ done, failed, parked, deferred, paused: null | { reason, until } }>}
   */
  async function runJobs(handler, { filter = () => true, limit = Infinity, concurrency = 1 } = {}) {
    const result = { done: 0, failed: 0, parked: 0, deferred: 0, paused: null };
    let started = 0;
    const worker = async () => {
      while (!result.paused && started < limit) {
        try {
          await checkGate();
        } catch (e) {
          if (e instanceof QueuePausedError) {
            result.paused = { reason: e.reason, until: e.until };
            break;
          }
          throw e;
        }
        const job = await claimNext(filter);
        if (!job) break;
        started++;
        try {
          await handler(job, api);
          await updateJob(job.id, { state: "done", attempts: job.attempts + 1, last_error: null, next_at: null, claim: null });
          result.done++;
        } catch (e) {
          if (e instanceof QueuePausedError) {
            await updateJob(job.id, { next_at: iso(e.until), claim: null });
            result.paused = { reason: e.reason, until: e.until };
            break;
          }
          const attempts = job.attempts + 1;
          const message = String(e?.message || e).slice(0, 300);
          if (e instanceof HttpError || e?.fatal) {
            await updateJob(job.id, { state: "failed", attempts, last_error: message, next_at: null, claim: null });
            result.failed++;
          } else if (attempts >= o.maxJobAttempts) {
            await updateJob(job.id, { state: "parked", attempts, last_error: message, next_at: null, claim: null });
            result.parked++;
          } else {
            const nextAt = e instanceof RetryLaterError ? e.nextAt : now() + backoffDelay(attempts, { baseMs: o.backoffBaseMs, capMs: o.backoffCapMs, random });
            await updateJob(job.id, { state: "pending", attempts, last_error: message, next_at: iso(nextAt), claim: null });
            result.deferred++;
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, o.maxInFlight)) }, worker));
    return result;
  }

  /** Counts by state, deferred jobs, breaker and budget. */
  function status() {
    const jobs = readJobs();
    const t = now();
    const counts = { pending: 0, done: 0, failed: 0, parked: 0, deferred: 0 };
    const byKind = {};
    for (const j of jobs) {
      counts[j.state] = (counts[j.state] || 0) + 1;
      if (j.state === "pending" && j.next_at && ms(j.next_at) > t) counts.deferred++;
      byKind[j.kind] ??= { pending: 0, done: 0, failed: 0, parked: 0 };
      byKind[j.kind][j.state] = (byKind[j.kind][j.state] || 0) + 1;
    }
    const s = readState();
    const hour = Math.floor(t / HOUR) * HOUR;
    return {
      jobs: jobs.length,
      counts,
      by_kind: byKind,
      breaker: {
        open_until: s.breaker.open_until > t ? iso(s.breaker.open_until) : null,
        halted_until: s.breaker.halted_until > t ? iso(s.breaker.halted_until) : null,
        consecutive_refusals: s.breaker.consecutive_refusals,
        trips_today: s.breaker.trips.filter((x) => ms(x) >= Math.floor(t / DAY) * DAY).length,
      },
      budget: { per_hour: o.budgetPerHour, used_this_hour: s.budget.window_start === hour ? s.budget.count : 0 },
      totals: s.totals,
    };
  }

  const api = {
    dir,
    files,
    options: o,
    request,
    enqueue,
    runJobs,
    updateJob,
    jobs: readJobs,
    status,
    checkGate,
    inFlight,
  };
  return api;
}

let defaultQueue = null;
/** One queue per process with the default cache layout (options apply on first use). */
export function getFetchQueue(options = {}) {
  defaultQueue ??= createFetchQueue(options);
  return defaultQueue;
}

/** Human-readable status lines (for --status). */
export function formatStatus(st) {
  const c = st.counts;
  const lines = [
    `queue: ${st.jobs} jobs — done ${c.done || 0}, pending ${c.pending || 0} (deferred ${c.deferred || 0}), parked ${c.parked || 0}, failed ${c.failed || 0}`,
    `budget: ${st.budget.used_this_hour}/${st.budget.per_hour} requests this hour`,
    `breaker: ${st.breaker.halted_until ? `HALTED until ${st.breaker.halted_until}` : st.breaker.open_until ? `open until ${st.breaker.open_until}` : "closed"} (${st.breaker.consecutive_refusals} consecutive refusals, ${st.breaker.trips_today} trips today)`,
  ];
  for (const [k, v] of Object.entries(st.by_kind)) lines.push(`  ${k}: done ${v.done || 0}, pending ${v.pending || 0}, parked ${v.parked || 0}, failed ${v.failed || 0}`);
  return lines.join("\n");
}

// ── range reads ─────────────────────────────────────────────────────────────
async function cancelBody(res) {
  try {
    await res.body?.cancel();
  } catch {
    // body already closed
  }
}

/**
 * The bytes [begin, end) of `url`, as one `range` request of the queue.
 * The body is read only from a 206 answer whose Content-Range starts at
 * `begin` and whose length is at most the requested length; a server that
 * ignores Range (200) is cancelled before its body is read — range mode never
 * turns into a full download — and that error is fatal (no retry).
 * @returns {Promise<Uint8Array>}
 */
export async function fetchRangeBytes(queue, url, begin, end, { kind = "range" } = {}) {
  const want = end - begin;
  if (!Number.isInteger(begin) || !Number.isInteger(end) || begin < 0 || want <= 0) throw new Error(`bad range ${begin}-${end}`);
  const fatal = (message, code) => Object.assign(new Error(message), { fatal: true, code });
  return queue.request(url, {
    kind,
    headers: { Range: `bytes=${begin}-${end - 1}` },
    consume: async (res) => {
      if (res.status !== 206) {
        await cancelBody(res);
        throw fatal(`${url}: range request answered HTTP ${res.status} (no range support)`, "no_range_support");
      }
      const m = /bytes (\d+)-(\d+)\/(\d+|\*)/.exec(res.headers.get("content-range") || "");
      const declared = Number(res.headers.get("content-length"));
      if (!m || Number(m[1]) !== begin || Number(m[2]) - begin + 1 > want || (declared && declared > want)) {
        await cancelBody(res);
        throw fatal(`${url}: unexpected Content-Range ${res.headers.get("content-range")} for bytes=${begin}-${end - 1}`, "bad_content_range");
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length !== want) throw new Error(`${url}: range ${begin}-${end - 1} returned ${bytes.length} of ${want} bytes`); // retryable
      return bytes;
    },
  });
}

// ── full PDF downloads ──────────────────────────────────────────────────────
/** SHA-256 of a file (streamed). */
export async function sha256File(path) {
  const h = createHash("sha256");
  await pipeline(createReadStream(path), async function* (source) {
    for await (const chunk of source) h.update(chunk);
  });
  return h.digest("hex");
}

function hasPdfMagic(path) {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(5);
    const n = readSync(fd, buf, 0, 5, 0);
    return n === 5 && buf.toString("latin1") === "%PDF-";
  } finally {
    closeSync(fd);
  }
}

/** The download ledger <cache>/fetch/downloads.jsonl: { file, bytes, sha256, last_modified, url, completed_at }. */
export function readDownloads(root = cacheRoot()) {
  const path = join(cachePaths(root).fetchDir(), "downloads.jsonl");
  if (!existsSync(path)) return new Map();
  const out = new Map();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      out.set(r.file, r);
    } catch {
      // ignore a damaged ledger line; the file is re-verified on use
    }
  }
  return out;
}

/** Default iEN URL of a book file name. */
export const ienBookUrl = (name) => IEN_BOOKS_BASE + encodeURI(safePdfName(name));

/**
 * Make sure a full PDF is in <cache>/ien/pdf/<name> (the only PDF store).
 * Downloads through the queue as `<name>.part`, resuming with
 * `Range: bytes=<size>-` + `If-Range: <Last-Modified>`, then verifies the
 * `%PDF-` magic, the byte count and SHA-256 (against `expectedSha256` or the
 * ledger) before renaming. Hostile names (`..`, `\`, `CON.pdf`) throw
 * CachePathError before any request. A lock file (`<name>.part.lock`) keeps
 * a second process from writing the same file: it waits (`lockWaitMs`), then
 * gives RetryLaterError.
 * @returns {Promise<{ path, downloaded: boolean, bytes, sha256: string|null }>}
 */
export async function ensurePdf(name, options = {}) {
  const safe = safePdfName(name);
  const root = assertOutsideRepo(options.cacheRoot ?? cacheRoot());
  const paths = cachePaths(root);
  mkdirSync(join(paths.root, "ien", "pdf"), { recursive: true });
  // One writer per file across processes and tools (fetch-books, pdf-render):
  // two downloads appending to the same .part would corrupt it.
  const lock = `${paths.pdf(safe)}.part.lock`;
  const { lockWaitMs = 10 * 60 * 1000, lockPollMs = 1000 } = options;
  const start = Date.now();
  for (;;) {
    if (tryLock(lock, { pid: process.pid, at: Date.now() })) break;
    if (lockStale(lock)) removeQuietly(lock);
    else if (Date.now() - start >= lockWaitMs) throw new RetryLaterError(`${safe}: another process is downloading it`, Date.now() + 60 * 1000, { code: "download_locked" });
    else await realSleep(lockPollMs);
  }
  try {
    return await ensurePdfLocked(safe, { ...options, cacheRoot: root });
  } finally {
    removeQuietly(lock);
  }
}

async function ensurePdfLocked(safe, { queue = null, url = null, expectedBytes = null, lastModified = null, expectedSha256 = null, cacheRoot: root, maxBytes = Infinity, timeoutMs = 45 * 60 * 1000 }) {
  const paths = cachePaths(root);
  const file = paths.pdf(safe);
  const part = `${file}.part`;
  const ledger = readDownloads(root).get(safe);
  if (existsSync(file)) {
    const size = statSync(file).size;
    const sizeOk = expectedBytes ? size === expectedBytes : size > 1024;
    if (sizeOk && hasPdfMagic(file)) return { path: file, downloaded: false, bytes: size, sha256: ledger?.bytes === size ? ledger.sha256 : null };
    if (expectedBytes && size < expectedBytes && !existsSync(part)) renameSync(file, part); // a truncated copy becomes the resume point
    else throw new Error(`cached PDF ${safe} fails verification (size ${size}${expectedBytes ? ` ≠ ${expectedBytes}` : ""})`);
  }
  if (!queue) throw new Error(`no cached copy of ${safe} and no fetch queue`);
  if (expectedBytes && expectedBytes > maxBytes) throw new Error(`${safe}: ${expectedBytes} bytes exceeds the ${maxBytes}-byte guard`);
  const target = url ?? ienBookUrl(safe);
  let total = expectedBytes;
  for (let round = 0; round < 3; round++) {
    const headers = () => {
      const have = existsSync(part) ? statSync(part).size : 0;
      return have > 0 ? { Range: `bytes=${have}-`, ...(lastModified ? { "If-Range": lastModified } : {}) } : {};
    };
    await queue.request(target, {
      kind: "full",
      headers,
      timeoutMs,
      consume: async (res) => {
        const have = existsSync(part) ? statSync(part).size : 0;
        let append = false;
        if (res.status === 206) {
          const m = /bytes (\d+)-(\d+)\/(\d+|\*)/.exec(res.headers.get("content-range") || "");
          if (!m || Number(m[1]) !== have) throw Object.assign(new Error(`${safe}: unexpected Content-Range ${res.headers.get("content-range")}`), { fatal: true });
          if (m[3] !== "*") total = Number(m[3]);
          append = true;
        } else {
          const len = Number(res.headers.get("content-length"));
          if (len) total = len;
        }
        if (total && total > maxBytes) throw Object.assign(new Error(`${safe}: ${total} bytes exceeds the guard`), { fatal: true });
        await pipeline(Readable.fromWeb(res.body), createWriteStream(part, { flags: append ? "a" : "w" }));
        return { status: res.status };
      },
    });
    const size = statSync(part).size;
    if (total && size < total) continue; // the body ended early: resume from the new size
    if (total && size !== total) {
      unlinkSync(part);
      throw new Error(`${safe}: ${size} bytes on disk ≠ ${total} expected`);
    }
    if (!hasPdfMagic(part)) {
      unlinkSync(part);
      throw new Error(`${safe}: not a PDF (no %PDF- magic)`);
    }
    const sha = await sha256File(part);
    const known = expectedSha256 ?? (ledger && ledger.bytes === size ? ledger.sha256 : null);
    if (known && known !== sha) {
      unlinkSync(part);
      throw new Error(`${safe}: sha256 ${sha} ≠ expected ${known}`);
    }
    renameSync(part, file);
    const row = { file: safe, bytes: size, sha256: sha, last_modified: lastModified, url: target, completed_at: iso(Date.now()) };
    mkdirSync(paths.fetchDir(), { recursive: true });
    appendFileSync(join(paths.fetchDir(), "downloads.jsonl"), JSON.stringify(row) + "\n");
    return { path: file, downloaded: true, bytes: size, sha256: sha };
  }
  throw new Error(`${safe}: download did not complete after 3 resumes`);
}
