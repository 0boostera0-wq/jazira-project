// WP3 — the shared polite fetch queue (docs/CONTENT_ENGINE.md §4.1) and full
// PDF downloads (§4.2). Everything runs against a local mock server; nothing
// touches the network or the real cache.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULTS,
  HttpError,
  QueuePausedError,
  RetryLaterError,
  backoffDelay,
  classifyFailure,
  createFetchQueue,
  ensurePdf,
  fetchRangeBytes,
  parseRetryAfter,
  readDownloads,
} from "../../scripts/content/lib/fetch-queue.mjs";
import { CachePathError } from "../../scripts/content/lib/cache.mjs";

const QUEUE_MODULE = pathToFileURL(join(process.cwd(), "scripts/content/lib/fetch-queue.mjs")).href;

// ── mock server ───────────────────────────────────────────────────────────
let server;
let base;
const hits = [];
let inFlight = 0;
let maxInFlight = 0;
const scripted = new Map(); // path → array of behaviours consumed per hit
const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(60000, 7), Buffer.from("\n%%EOF\n")]);
const LAST_MODIFIED = "Sun, 26 Apr 2026 11:35:10 GMT";

function servePdf(req, res, { truncateAt = null } = {}) {
  const range = req.headers.range;
  const ifRange = req.headers["if-range"];
  let start = 0;
  let status = 200;
  if (range && (!ifRange || ifRange === LAST_MODIFIED)) {
    start = Number(/bytes=(\d+)-/.exec(range)[1]);
    status = 206;
  }
  const body = PDF.subarray(start);
  const headers = { "Content-Type": "application/pdf", "Last-Modified": LAST_MODIFIED, "Accept-Ranges": "bytes", "Content-Length": body.length };
  if (status === 206) headers["Content-Range"] = `bytes ${start}-${PDF.length - 1}/${PDF.length}`;
  res.writeHead(status, headers);
  if (truncateAt !== null) {
    res.write(body.subarray(0, truncateAt));
    setTimeout(() => res.socket.destroy(), 20);
    return;
  }
  res.end(body);
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url.split("?")[0];
    hits.push({ path, at: Date.now(), headers: req.headers, method: req.method });
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    res.on("close", () => inFlight--);
    const queue = scripted.get(path);
    const step = queue && queue.length ? queue.shift() : null;
    if (step === "reset") return req.socket.destroy();
    if (step && step.status) {
      res.writeHead(step.status, step.headers || {});
      return res.end(step.body || "");
    }
    if (path === "/slow") return setTimeout(() => res.end("ok"), 120);
    if (path === "/book.pdf") return servePdf(req, res, step && step.truncateAt ? step : {});
    if (path === "/missing") {
      res.writeHead(404);
      return res.end();
    }
    if (path === "/down") {
      res.writeHead(503);
      return res.end();
    }
    res.end("ok");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jz-queue-"));
  hits.length = 0;
  maxInFlight = 0;
  scripted.clear();
});

const fast = (extra = {}) => createFetchQueue({ dir, pauseMs: 0, pollMs: 5, backoffBaseMs: 10, backoffCapMs: 100, sleep: async () => {}, ...extra });

describe("fetch queue policy (pure)", () => {
  it("has the §4.1 defaults", () => {
    expect(DEFAULTS).toMatchObject({ maxInFlight: 2, pauseMs: 500, budgetPerHour: 600, backoffBaseMs: 2000, backoffCapMs: 600000, breakerThreshold: 5, breakerCoolOffMs: 3600000, maxTripsPerDay: 3 });
  });

  it("classifies refusals, retryable and fatal outcomes", () => {
    const err = (code) => Object.assign(new TypeError("fetch failed"), { cause: { code } });
    for (const code of ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"]) expect(classifyFailure({ error: err(code) })).toMatchObject({ refusal: true, retryable: true, code });
    expect(classifyFailure({ error: Object.assign(new Error("t"), { name: "TimeoutError" }) })).toMatchObject({ refusal: true, code: "ETIMEDOUT" });
    expect(classifyFailure({ status: 429 })).toMatchObject({ refusal: true, retryable: true });
    expect(classifyFailure({ status: 503 })).toMatchObject({ refusal: true, retryable: true });
    expect(classifyFailure({ status: 502 })).toMatchObject({ refusal: false, retryable: true });
    for (const status of [400, 403, 404, 410]) expect(classifyFailure({ status })).toMatchObject({ retryable: false });
  });

  it("parses Retry-After as seconds or an HTTP date", () => {
    expect(parseRetryAfter("7")).toBe(7000);
    const now = Date.parse("2026-09-26T10:00:00Z");
    expect(parseRetryAfter("Sat, 26 Sep 2026 10:00:30 GMT", now)).toBe(30000);
    expect(parseRetryAfter("soon")).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });

  it("uses full-jitter exponential backoff capped at 10 minutes", () => {
    expect(backoffDelay(1, { random: () => 0.999999 })).toBe(1999);
    expect(backoffDelay(3, { random: () => 0.5 })).toBe(4000);
    expect(backoffDelay(20, { random: () => 0.999999 })).toBe(599999);
    expect(backoffDelay(5, { random: () => 0 })).toBe(0);
  });
});

describe("politeness", () => {
  it("never has more than 2 requests in flight in one process", async () => {
    const q = fast();
    const results = await Promise.all(Array.from({ length: 8 }, () => q.request(`${base}/slow`)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(maxInFlight).toBe(2);
    expect(q.inFlight.max).toBeLessThanOrEqual(2);
  });

  it("never has more than 2 requests in flight across two processes", async () => {
    const child = join(dir, "child.mjs");
    writeFileSync(
      child,
      `import { createFetchQueue } from ${JSON.stringify(QUEUE_MODULE)};
const q = createFetchQueue({ dir: process.argv[2], pauseMs: 10, pollMs: 5 });
await Promise.all(Array.from({ length: 4 }, () => q.request(process.argv[3])));
console.log("done");`,
    );
    const run = () =>
      new Promise((resolve, reject) => {
        const p = spawn(process.execPath, [child, dir, `${base}/slow`], { stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        let err = "";
        p.stdout.on("data", (d) => (out += d));
        p.stderr.on("data", (d) => (err += d));
        p.on("exit", (code) => (code === 0 ? resolve(out) : reject(new Error(err))));
      });
    const outs = await Promise.all([run(), run()]);
    expect(outs.map((o) => o.trim())).toEqual(["done", "done"]);
    expect(hits.filter((h) => h.path === "/slow")).toHaveLength(8);
    expect(maxInFlight).toBe(2);
  });

  it("spaces request starts by the pause and sends an identifying User-Agent", async () => {
    // Request starts are measured where the queue sends them (server arrival
    // times jitter under load).
    const sent = [];
    const q = createFetchQueue({ dir, pauseMs: 150, pollMs: 5, fetch: (url, init) => (sent.push(Date.now()), globalThis.fetch(url, init)) });
    await Promise.all([q.request(`${base}/a`), q.request(`${base}/b`), q.request(`${base}/c`)]);
    const starts = sent.sort((a, b) => a - b);
    expect(starts).toHaveLength(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(149);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(149);
    expect(hits[0].headers["user-agent"]).toMatch(/^JaziraContentPipeline\/1\.0 \(/);
  });
});

describe("backoff and retries", () => {
  it("backs off on 429 honouring Retry-After", async () => {
    const waits = [];
    const q = fast({ sleep: async (ms) => waits.push(ms) });
    scripted.set("/ra", [{ status: 429, headers: { "Retry-After": "2" } }]);
    const r = await q.request(`${base}/ra`);
    expect(r.status).toBe(200);
    expect(waits).toEqual([2000]);
    expect(hits.filter((h) => h.path === "/ra")).toHaveLength(2);
  });

  it("backs off with jitter on 503 without Retry-After", async () => {
    const waits = [];
    const q = fast({ sleep: async (ms) => waits.push(ms), backoffBaseMs: 1000, backoffCapMs: 600000, random: () => 0.5 });
    scripted.set("/busy", [{ status: 503 }, { status: 503 }]);
    await q.request(`${base}/busy`);
    expect(waits).toEqual([500, 1000]);
  });

  it("retries ECONNRESET and gives up on ECONNREFUSED with a retry time", async () => {
    const q = fast();
    scripted.set("/reset", ["reset"]);
    expect((await q.request(`${base}/reset`)).status).toBe(200);
    const closed = createServer();
    await new Promise((r) => closed.listen(0, "127.0.0.1", r));
    const port = closed.address().port;
    await new Promise((r) => closed.close(r));
    const err = await q.request(`http://127.0.0.1:${port}/x`, { retries: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(RetryLaterError);
    expect(err.code).toBe("ECONNREFUSED");
    expect(err.nextAt).toBeGreaterThan(Date.now() - 1000);
  });

  it("does not retry other 4xx", async () => {
    const q = fast();
    const err = await q.request(`${base}/missing`).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(404);
    expect(hits.filter((h) => h.path === "/missing")).toHaveLength(1);
  });

  it("defers a long Retry-After to the job's next_at instead of sleeping", async () => {
    let t = Date.parse("2026-09-26T10:00:00Z");
    const q = fast({ now: () => t });
    scripted.set("/later", [{ status: 429, headers: { "Retry-After": "900" } }]);
    const err = await q.request(`${base}/later`).catch((e) => e);
    expect(err).toBeInstanceOf(RetryLaterError);
    expect(err.nextAt).toBe(t + 900000);
  });
});

describe("circuit breaker and budget (persisted)", () => {
  it("trips after 5 consecutive refusals, survives a restart and reopens after the cool-off", async () => {
    let t = Date.parse("2026-09-26T10:00:00Z");
    const q = fast({ now: () => t, maxInlineRetries: 20, maxInlineWaitMs: 1e12 });
    const err = await q.request(`${base}/down`).catch((e) => e);
    expect(err).toBeInstanceOf(RetryLaterError);
    expect(hits.filter((h) => h.path === "/down")).toHaveLength(5);
    const again = await q.request(`${base}/ok`).catch((e) => e);
    expect(again).toBeInstanceOf(QueuePausedError);
    expect(again.reason).toBe("breaker");
    expect(again.until).toBe(t + 3600000);
    const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
    expect(state.breaker.open_until).toBe(t + 3600000);
    const restarted = fast({ now: () => t });
    await expect(restarted.request(`${base}/ok`)).rejects.toBeInstanceOf(QueuePausedError);
    expect(hits.filter((h) => h.path === "/ok")).toHaveLength(0);
    t += 61 * 60 * 1000;
    expect((await restarted.request(`${base}/ok`)).status).toBe(200);
  });

  it("halts until the next UTC day after 3 trips", async () => {
    let t = Date.parse("2026-09-26T10:00:00Z");
    const q = fast({ now: () => t, maxInlineRetries: 20, maxInlineWaitMs: 1e12 });
    for (let trip = 0; trip < 3; trip++) {
      await q.request(`${base}/down`).catch(() => {});
      t += 61 * 60 * 1000;
    }
    const err = await q.request(`${base}/ok`).catch((e) => e);
    expect(err).toBeInstanceOf(QueuePausedError);
    expect(err.reason).toBe("halted");
    expect(new Date(err.until).toISOString()).toBe("2026-09-27T00:00:00.000Z");
    expect(q.status().breaker.trips_today).toBe(3);
  });

  it("a success resets the consecutive refusal count", async () => {
    const q = fast({ maxInlineRetries: 20, maxInlineWaitMs: 1e12 });
    scripted.set("/flaky", [{ status: 503 }, { status: 503 }, { status: 503 }, { status: 503 }]);
    expect((await q.request(`${base}/flaky`)).status).toBe(200);
    scripted.set("/flaky", [{ status: 503 }, { status: 503 }, { status: 503 }, { status: 503 }]);
    expect((await q.request(`${base}/flaky`)).status).toBe(200);
  });

  it("enforces the hourly request budget", async () => {
    const t = Date.parse("2026-09-26T10:20:00Z");
    const q = fast({ now: () => t, budgetPerHour: 3 });
    for (let i = 0; i < 3; i++) await q.request(`${base}/ok`);
    const err = await q.request(`${base}/ok`).catch((e) => e);
    expect(err).toBeInstanceOf(QueuePausedError);
    expect(err.reason).toBe("budget");
    expect(new Date(err.until).toISOString()).toBe("2026-09-26T11:00:00.000Z");
    expect(q.status().budget).toEqual({ per_hour: 3, used_this_hour: 3 });
  });
});

describe("persisted jobs (queue.jsonl)", () => {
  it("resumes pending and deferred jobs after a restart", async () => {
    let t = Date.parse("2026-09-26T10:00:00Z");
    const q = fast({ now: () => t });
    await q.enqueue([
      { url: `${base}/j1`, kind: "range", resource_id: "ien-1" },
      { url: `${base}/j2`, kind: "range", resource_id: "ien-2" },
      { url: `${base}/j3`, kind: "full", resource_id: "ien-3" },
    ]);
    expect(await q.enqueue([{ url: `${base}/j1`, kind: "range", resource_id: "ien-1" }])).toBe(0);
    scripted.set("/j2", [{ status: 429, headers: { "Retry-After": "600" } }]);
    const seen = [];
    const handler = async (job, queue) => {
      seen.push(job.url.split("/").pop());
      await queue.request(job.url, { kind: job.kind });
    };
    const first = await q.runJobs(handler, { limit: 2 });
    expect(first).toMatchObject({ done: 1, deferred: 1, paused: null });
    const rows = readFileSync(join(dir, "queue.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(Object.keys(rows[0])).toEqual(["id", "url", "kind", "resource_id", "state", "attempts", "last_error", "next_at", "updated_at"]);
    const j2 = rows.find((r) => r.resource_id === "ien-2");
    expect(j2).toMatchObject({ state: "pending", attempts: 1, next_at: "2026-09-26T10:10:00Z" });
    expect(j2.last_error).toMatch(/HTTP 429/);

    const restarted = fast({ now: () => t });
    expect(restarted.status().counts).toMatchObject({ done: 1, pending: 2, deferred: 1 });
    await restarted.runJobs(handler);
    expect(seen).toEqual(["j1", "j2", "j3"]);
    t += 11 * 60 * 1000;
    const last = await restarted.runJobs(handler);
    expect(last.done).toBe(1);
    expect(seen).toEqual(["j1", "j2", "j3", "j2"]);
    expect(restarted.status().counts).toMatchObject({ done: 3, pending: 0 });
  });

  it("stops when the breaker trips and keeps the job pending until the cool-off", async () => {
    let t = Date.parse("2026-09-26T10:00:00Z");
    const q = fast({ now: () => t, maxInlineRetries: 20, maxInlineWaitMs: 1e12 });
    await q.enqueue([{ url: `${base}/down`, kind: "range", resource_id: "ien-9" }, { url: `${base}/ok`, kind: "range", resource_id: "ien-10" }]);
    const r = await q.runJobs((job, queue) => queue.request(job.url));
    expect(r.paused).toMatchObject({ reason: "breaker", until: t + 3600000 });
    expect(hits.filter((h) => h.path === "/ok")).toHaveLength(0);
    expect(q.jobs().every((j) => j.state === "pending")).toBe(true);
  });

  it("marks 4xx jobs failed and parks jobs after too many attempts", async () => {
    let t = Date.parse("2026-09-26T10:00:00Z");
    const q = fast({ now: () => t, maxJobAttempts: 2 });
    await q.enqueue([{ url: `${base}/missing`, kind: "head", resource_id: "ien-4" }, { url: `${base}/flap`, kind: "api", resource_id: null }]);
    scripted.set("/flap", Array.from({ length: 20 }, () => ({ status: 502 })));
    const handler = (job, queue) => queue.request(job.url, { retries: 0 });
    await q.runJobs(handler);
    t += 3600 * 1000;
    await q.runJobs(handler);
    const byUrl = Object.fromEntries(q.jobs().map((j) => [j.url.split("/").pop(), j]));
    expect(byUrl.missing).toMatchObject({ state: "failed", attempts: 1 });
    expect(byUrl.flap).toMatchObject({ state: "parked", attempts: 2 });
    expect(await q.enqueue([{ url: `${base}/flap`, kind: "api" }], { retry: true })).toBe(0);
    expect(q.jobs().find((j) => j.url.endsWith("/flap")).state).toBe("pending");
  });
});

describe("full downloads (ensurePdf)", () => {
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "jz-cache-"));
  });
  const sha = createHash("sha256").update(PDF).digest("hex");
  const BS = String.fromCharCode(92);

  it("resumes a truncated .part file with Range + If-Range and verifies the result", async () => {
    const q = fast();
    mkdirSync(join(root, "ien/pdf"), { recursive: true });
    const part = join(root, "ien/pdf/book.pdf.part");
    writeFileSync(part, PDF.subarray(0, 20000));
    const r = await ensurePdf("book.pdf", { queue: q, url: `${base}/book.pdf`, expectedBytes: PDF.length, lastModified: LAST_MODIFIED, cacheRoot: root });
    expect(r).toMatchObject({ downloaded: true, bytes: PDF.length, sha256: sha });
    const get = hits.filter((h) => h.path === "/book.pdf");
    expect(get).toHaveLength(1);
    expect(get[0].headers.range).toBe("bytes=20000-");
    expect(get[0].headers["if-range"]).toBe(LAST_MODIFIED);
    expect(readFileSync(join(root, "ien/pdf/book.pdf")).equals(PDF)).toBe(true);
    expect(existsSync(part)).toBe(false);
    expect(readDownloads(root).get("book.pdf")).toMatchObject({ bytes: PDF.length, sha256: sha });
    const again = await ensurePdf("book.pdf", { queue: q, url: `${base}/book.pdf`, expectedBytes: PDF.length, cacheRoot: root });
    expect(again).toMatchObject({ downloaded: false, sha256: sha });
    expect(hits.filter((h) => h.path === "/book.pdf")).toHaveLength(1);
  });

  it("resumes after the connection drops mid-body", async () => {
    const q = fast();
    scripted.set("/book.pdf", [{ truncateAt: 30000 }]);
    const r = await ensurePdf("book.pdf", { queue: q, url: `${base}/book.pdf`, expectedBytes: PDF.length, lastModified: LAST_MODIFIED, cacheRoot: root });
    expect(r.bytes).toBe(PDF.length);
    const get = hits.filter((h) => h.path === "/book.pdf");
    expect(get.length).toBeGreaterThanOrEqual(2);
    expect(get[0].headers.range).toBeUndefined();
    expect(get[get.length - 1].headers.range).toMatch(/^bytes=\d+-$/);
    expect(readFileSync(join(root, "ien/pdf/book.pdf")).equals(PDF)).toBe(true);
  });

  it("restarts from zero when If-Range no longer matches (file changed)", async () => {
    const q = fast();
    mkdirSync(join(root, "ien/pdf"), { recursive: true });
    writeFileSync(join(root, "ien/pdf/book.pdf.part"), Buffer.alloc(5000, 1));
    const r = await ensurePdf("book.pdf", { queue: q, url: `${base}/book.pdf`, expectedBytes: PDF.length, lastModified: "Mon, 01 Jan 2024 00:00:00 GMT", cacheRoot: root });
    expect(r.sha256).toBe(sha);
  });

  it("rejects a sha256 mismatch and a non-PDF body", async () => {
    const q = fast();
    await expect(ensurePdf("book.pdf", { queue: q, url: `${base}/book.pdf`, expectedBytes: PDF.length, expectedSha256: "0".repeat(64), cacheRoot: root })).rejects.toThrow(/sha256/);
    expect(existsSync(join(root, "ien/pdf/book.pdf"))).toBe(false);
    scripted.set("/fake.pdf", [{ status: 200, body: "<html>not a pdf</html>" }]);
    await expect(ensurePdf("fake.pdf", { queue: q, url: `${base}/fake.pdf`, cacheRoot: root })).rejects.toThrow(/%PDF-/);
  });

  it("rejects hostile file names before any request", async () => {
    const q = fast();
    const names = ["..", "../x.pdf", ".." + BS + "x.pdf", "a" + BS + "b.pdf", "a/b.pdf", "CON.pdf", "con.PDF", "NUL.pdf", "x.pdf.exe", "", ".pdf"];
    for (const name of names) {
      await expect(ensurePdf(name, { queue: q, url: `${base}/book.pdf`, cacheRoot: root }), name).rejects.toBeInstanceOf(CachePathError);
    }
    expect(hits).toHaveLength(0);
  });

  it("refuses a download above the size guard", async () => {
    const q = fast();
    await expect(ensurePdf("book.pdf", { queue: q, url: `${base}/book.pdf`, expectedBytes: PDF.length, maxBytes: 1000, cacheRoot: root })).rejects.toThrow(/guard/);
    expect(hits).toHaveLength(0);
  });
});

// ── ien-crawl on the shared queue (§4.1) ───────────────────────────────────
describe("ien-crawl: pure helpers and a crawl through the queue", () => {
  let crawlMod;
  let api;
  let apiBase;
  const apiHits = [];
  const J = (x) => JSON.stringify(x);
  const ROUTES = {
    "/portal/api/Lmstree/GetPrimaryStudentStages": J([{ id: 1, title: "الصف  الأول", codeId: "K01", codeType: "K", fullPath: "1", orderInParent: 1 }]),
    "/portal/api/Lmstree/GetMidSecondaryStudentStages": J([]),
    "/lms/api/tree?parentId=1": J([{ id: 2, title: "مقررات العام الدراسي", codeId: "SM1", codeType: "SM", fullPath: "1-2", orderInParent: 1 }]),
    "/lms/api/tree?parentId=2": J([]),
    "/lms/api/tree/AllChildren?parentId=2": J([{ id: 3, title: "الرياضيات", codeId: "math", codeType: "SUB", fullPath: "1-2-3", orderInParent: 2, isActive: true, questionsCount: 7 }]),
    "/lms/api/SubjectBooks?top=100&skip=0&treeId=3": J({ subjectBooks: [
      { id: 10, title: "مقرر الرياضيات /  الجزء الأول", path: "1448-GE-PE-K01-SM1-math-part1.pdf", isActive: true, downloadCount: 5, treePath: "t" },
      { id: 11, title: "نسخة", path: "1448-GE-PE-K01-SM1-math-part1.pdf", isActive: true, downloadCount: 1, treePath: "t" },
    ] }),
    "/lms/api/Questions/SelfAssessments/3": J([{ treeId: 4, subjectPath: "الأعداد - العد", lessonId: 5, lesson: "العد  حتى 10", count: 0, totalCount: 10 }]),
  };
  beforeAll(async () => {
    crawlMod = await import("../../scripts/content/ien-crawl.mjs");
    api = createServer((req, res) => {
      apiHits.push(`${req.method} ${req.url}`);
      if (req.url.startsWith("/files/")) {
        res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": 1234, "Last-Modified": LAST_MODIFIED, "Accept-Ranges": "bytes" });
        return res.end();
      }
      const body = ROUTES[req.url];
      if (!body) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(body);
    });
    await new Promise((r) => api.listen(0, "127.0.0.1", r));
    apiBase = `http://127.0.0.1:${api.address().port}`;
  });
  afterAll(() => new Promise((r) => api.close(r)));
  const endpoints = () => ({ portal: `${apiBase}/portal/`, lms: `${apiBase}/lms/`, files: `${apiBase}/files/` });

  it("parses book file names as evidence only", () => {
    expect(crawlMod.parseBookPath("1448-GE-ME-K07-SM1-math-part1.pdf")).toMatchObject({ parsed: true, year_hijri: 1448, grade_code: "K07", semester_code: "SM1", slug: "math-part1", part: 1 });
    expect(crawlMod.parseBookPath("1448-GE-PE-K01-SM1-ISLM.part.pdf")).toMatchObject({ part: "unnumbered" });
    expect(crawlMod.parseBookPath("1448-GE-CBM-GNRL-TRC2-SM1-CHMI2.1.pdf")).toMatchObject({ grade_code: "TRC2", track_code: "GNRL", part: null });
    expect(crawlMod.parseBookPath("audio.zip")).toEqual({ parsed: false, file_ext: "zip" });
  });

  it("crawls through the queue with the unchanged output format, one HEAD per URL, then resumes from the cache", async () => {
    const cacheDir = join(dir, "api");
    const q = createFetchQueue({ dir, pauseMs: 0, pollMs: 5 });
    const client = crawlMod.createIenClient({ queue: q, cacheDir });
    const rows = await crawlMod.crawl({ client, endpoints: endpoints() });
    expect(client.errors).toEqual([]);
    const committed = (f) => JSON.parse(readFileSync(join(process.cwd(), "data/staging/sources/ien", f), "utf8").split("\n")[0]);
    expect(Object.keys(rows.books[0])).toEqual(Object.keys(committed("books.jsonl")));
    expect(Object.keys(rows.lessons[0])).toEqual(Object.keys(committed("lessons.jsonl")));
    expect(Object.keys(rows.nodeRows[0])).toEqual(Object.keys(committed("nodes.jsonl")));
    expect(rows.nodeRows.map((n) => [n.ien_id, n.stage, n.grade_code, n.year_node_ien_id, n.depth])).toEqual([[1, "elementary", "K01", null, 0], [2, "elementary", "K01", 2, 1], [3, "elementary", "K01", 2, 2]]);
    expect(rows.nodeRows[0].title).toBe("الصف الأول");
    expect(rows.books.map((b) => [b.ien_book_id, b.http_status, b.bytes, b.last_modified])).toEqual([[10, 200, 1234, LAST_MODIFIED], [11, 200, 1234, LAST_MODIFIED]]);
    expect(rows.lessons[0]).toMatchObject({ unit_title: "الأعداد", lesson_title: "العد حتى 10", ien_bank_total: 10 });
    expect(apiHits.filter((h) => h.startsWith("HEAD "))).toHaveLength(1); // same URL listed twice
    expect(apiHits.every((h) => !h.startsWith("GET /files/"))).toBe(true); // books are never downloaded
    expect(q.status().totals.requests).toBe(apiHits.length);
    const report = crawlMod.crawlReport({ ...rows, retrievedAt: "2026-09-26T21:00:11Z", requests: client.stats.requests, cacheHits: 0, errors: [] });
    expect(report).toMatchObject({ provenance_status: "PROVENANCE_REVIEW_REQUIRED", counts: { nodes: 3, subjects: 1, books: 2, lessons: 1, books_head_ok: 2 } });

    const before = apiHits.length;
    const again = crawlMod.createIenClient({ queue: q, cacheDir });
    expect(await crawlMod.crawl({ client: again, endpoints: endpoints() })).toEqual(rows);
    expect(apiHits.length).toBe(before);
    expect(again.stats).toMatchObject({ requests: 0 });
    const refreshed = crawlMod.createIenClient({ queue: q, cacheDir, refresh: true });
    await crawlMod.crawl({ client: refreshed, endpoints: endpoints() });
    expect(apiHits.length).toBeGreaterThan(before);
  });

  it("records 404 as missing without an error, and stops cleanly when the queue pauses", async () => {
    const q = createFetchQueue({ dir, pauseMs: 0, pollMs: 5 });
    const client = crawlMod.createIenClient({ queue: q, cacheDir: join(dir, "api2") });
    expect(await client.getJson(`${apiBase}/lms/api/nothing`)).toBeNull();
    expect(client.errors).toEqual([]);
    const tight = createFetchQueue({ dir: join(dir, "tight"), pauseMs: 0, pollMs: 5, budgetPerHour: 2 });
    const paused = crawlMod.createIenClient({ queue: tight, cacheDir: join(dir, "api3") });
    await expect(crawlMod.crawl({ client: paused, endpoints: endpoints() })).rejects.toBeInstanceOf(QueuePausedError);
  });
});

// ── verifier regressions (WP3 review) ──────────────────────────────────────
describe("range reads never turn into full downloads (fetchRangeBytes)", () => {
  it("returns exactly the requested bytes from a 206 answer", async () => {
    const q = fast();
    scripted.set("/rng", [{ status: 206, headers: { "Content-Range": "bytes 10-19/100", "Content-Length": "10" }, body: "0123456789" }]);
    const bytes = await fetchRangeBytes(q, `${base}/rng`, 10, 20);
    expect(Buffer.from(bytes).toString()).toBe("0123456789");
    expect(hits[0].headers.range).toBe("bytes=10-19");
  });

  it("refuses a server that ignores Range (200) without retrying, as a fatal error", async () => {
    const q = fast();
    const err = await fetchRangeBytes(q, `${base}/ok`, 0, 5).catch((e) => e);
    expect(err).toMatchObject({ fatal: true, code: "no_range_support" });
    expect(hits.filter((h) => h.path === "/ok")).toHaveLength(1);
  });

  it("refuses a 206 that starts elsewhere or sends more than was asked", async () => {
    const q = fast();
    scripted.set("/shifted", [{ status: 206, headers: { "Content-Range": "bytes 5-9/100" }, body: "xxxxx" }]);
    await expect(fetchRangeBytes(q, `${base}/shifted`, 0, 5)).rejects.toMatchObject({ fatal: true, code: "bad_content_range" });
    // the mock PDF server answers bytes=0-4 with the whole file as 206
    await expect(fetchRangeBytes(q, `${base}/book.pdf`, 0, 5)).rejects.toMatchObject({ fatal: true, code: "bad_content_range" });
  });
});

describe("ensurePdf: one writer per file across processes", () => {
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "jz-lock-"));
    mkdirSync(join(root, "ien/pdf"), { recursive: true });
  });

  it("waits for a live download lock, then defers without any request", async () => {
    const q = fast();
    writeFileSync(join(root, "ien/pdf/book.pdf.part.lock"), JSON.stringify({ pid: process.pid, at: Date.now() }));
    const err = await ensurePdf("book.pdf", { queue: q, url: `${base}/book.pdf`, expectedBytes: PDF.length, cacheRoot: root, lockWaitMs: 30, lockPollMs: 5 }).catch((e) => e);
    expect(err).toBeInstanceOf(RetryLaterError);
    expect(err.code).toBe("download_locked");
    expect(hits).toHaveLength(0);
  });

  it("takes over a stale lock of a dead process and releases its own", async () => {
    const q = fast();
    const lock = join(root, "ien/pdf/book.pdf.part.lock");
    writeFileSync(lock, JSON.stringify({ pid: 2 ** 22 + 12345, at: 0 }));
    const r = await ensurePdf("book.pdf", { queue: q, url: `${base}/book.pdf`, expectedBytes: PDF.length, cacheRoot: root, lockWaitMs: 1000, lockPollMs: 5 });
    expect(r).toMatchObject({ downloaded: true, bytes: PDF.length });
    expect(existsSync(lock)).toBe(false);
  });
});

describe("the cache and the queue files stay outside the repository", () => {
  it("refuses a queue dir or a PDF cache inside the repo before writing anything", async () => {
    const inside = join(process.cwd(), "tmp-cache-should-not-exist");
    expect(() => createFetchQueue({ dir: join(inside, "fetch") })).toThrow(/outside the repository/);
    await expect(ensurePdf("book.pdf", { queue: fast(), url: `${base}/book.pdf`, cacheRoot: inside })).rejects.toThrow(/outside the repository/);
    expect(existsSync(inside)).toBe(false);
    expect(hits).toHaveLength(0);
  });
});
