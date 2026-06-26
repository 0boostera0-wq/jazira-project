#!/usr/bin/env node
/* ============================================================================
 * Jazira — Curriculum PDF importer (authorized content only)
 * ----------------------------------------------------------------------------
 * Downloads APPROVED curriculum PDFs ONCE from an authorized source you control
 * or are licensed to use, and stores them in YOUR OWN storage so the app serves
 * them from Jazira's own domain. It is deliberately SAFE and NARROW:
 *
 *   • Allow-listed sources  — only hosts in SOURCE_ALLOWLIST are ever fetched.
 *   • Allow-listed targets  — every `key` must exist in the curriculum catalog.
 *   • No traversal / no schemes in keys; redirects are re-checked per hop.
 *   • Content-Type + size are validated; it is NOT a general URL proxy.
 *   • Idempotent — already-imported files are skipped (use --force to refresh).
 *
 * It does NOT do scraping evasion, anti-detection, or source concealment. You
 * supply a manifest of { key, url } pairs (the files you are allowed to host).
 *
 * USAGE
 *   node scripts/import-curriculum.mjs --list-keys [prefix]
 *       Print catalog content keys (optionally filtered by a key prefix).
 *   node scripts/import-curriculum.mjs --emit-manifest <keyPrefix> [outFile]
 *       Write a manifest skeleton (url:"" to fill in) for the matching keys.
 *   node scripts/import-curriculum.mjs [--manifest f] [--store public|supabase]
 *                                      [--dry-run] [--force] [--limit N]
 *       Import every { key, url } entry in the manifest.
 *
 * ENV
 *   SOURCE_ALLOWLIST          required for import — comma-separated hostnames,
 *                             e.g. "ebook.moe.gov.sa,moe.gov.sa"
 *   CONTENT_STORE             public | supabase   (default: public)
 *   CONTENT_BUCKET            supabase bucket name (default: curriculum)
 *   NEXT_PUBLIC_SUPABASE_URL  } required for the supabase store
 *   SUPABASE_SERVICE_ROLE_KEY }  (server secret — local use only)
 *   CONTENT_MAX_MB            per-file size cap (default: 100)
 * ========================================================================== */

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public", "resources");

// ── tiny arg parser ────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const DRY = has("--dry-run");
const FORCE = has("--force");
const STORE = (val("--store", process.env.CONTENT_STORE) || "public").toLowerCase();
const BUCKET = process.env.CONTENT_BUCKET || "curriculum";
const MAX_BYTES = (Number(process.env.CONTENT_MAX_MB) || 100) * 1024 * 1024;
const LIMIT = Number(val("--limit", "0")) || 0;

const KEY_RE = /^[A-Za-z0-9_\-./]+\.pdf$/;
const C = { gray: "\x1b[90m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m", reset: "\x1b[0m" };
const log = (...a) => console.log(...a);

// ── load the catalog (pure data module) ─────────────────────────────────────
async function loadCatalog() {
  const mod = await import(pathToFileURL(path.join(ROOT, "src", "lib", "curriculum.js")).href);
  return mod;
}

// ── helper commands ─────────────────────────────────────────────────────────
async function cmdListKeys(catalog, prefix) {
  const rows = catalog.allResources().filter((r) => !prefix || r.key.startsWith(prefix));
  for (const r of rows) log(`${r.key}${C.gray}  — ${r.path} › ${r.title}${C.reset}`);
  log(`${C.cyan}${rows.length} keys${C.reset}`);
}

async function cmdEmitManifest(catalog, prefix, outFile) {
  if (!prefix) { log(`${C.red}--emit-manifest needs a <keyPrefix> (e.g. 1447/elementary/grade-1)${C.reset}`); process.exit(1); }
  const rows = catalog.allResources().filter((r) => r.key.startsWith(prefix));
  if (!rows.length) { log(`${C.yellow}No catalog keys match "${prefix}".${C.reset}`); process.exit(1); }
  const sources = rows.map((r) => ({ key: r.key, url: "", _note: `${r.path} › ${r.title}` }));
  const out = outFile || path.join(__dirname, "curriculum-sources.json");
  await fs.writeFile(out, JSON.stringify({ sources }, null, 2) + "\n", "utf8");
  log(`${C.green}Wrote ${sources.length} skeleton entries → ${out}${C.reset}`);
  log(`${C.gray}Fill each "url" with the AUTHORIZED source PDF, then run the import.${C.reset}`);
}

// ── safe download: https-only, allow-listed host, redirects re-checked ───────
async function safeDownload(rawUrl, allow, maxRedirects = 4) {
  let url = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let u;
    try { u = new URL(url); } catch { throw new Error("malformed URL"); }
    if (u.protocol !== "https:") throw new Error(`non-https source (${u.protocol})`);
    if (!allow.has(u.hostname)) throw new Error(`host not in SOURCE_ALLOWLIST: ${u.hostname}`);

    const res = await fetch(url, { redirect: "manual", headers: { Accept: "application/pdf,*/*" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location"), url).toString();
      continue; // re-validate the next hop's host on the next loop
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("pdf") && !ct.includes("octet-stream") && !ct.includes("binary")) {
      throw new Error(`unexpected content-type: ${ct || "none"}`);
    }
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared && declared > MAX_BYTES) throw new Error(`too large: ${(declared / 1048576).toFixed(1)}MB`);

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) throw new Error(`too large: ${(buf.byteLength / 1048576).toFixed(1)}MB`);
    if (buf.byteLength < 1024) throw new Error("suspiciously small (<1KB)");
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("not a PDF (bad magic bytes)");
    return buf;
  }
  throw new Error("too many redirects");
}

// ── storage drivers ─────────────────────────────────────────────────────────
function makeStore() {
  if (STORE === "supabase") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) { log(`${C.red}supabase store needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY${C.reset}`); process.exit(1); }
    let admin = null;
    const client = async () => {
      if (admin) return admin;
      const { createClient } = await import("@supabase/supabase-js");
      admin = createClient(url, key, { auth: { persistSession: false } });
      try { await admin.storage.createBucket(BUCKET, { public: true }); } catch { /* exists */ }
      return admin;
    };
    return {
      label: `Supabase Storage › bucket "${BUCKET}"`,
      async exists(k) {
        const a = await client();
        const dir = k.split("/").slice(0, -1).join("/");
        const name = k.split("/").pop();
        const { data } = await a.storage.from(BUCKET).list(dir, { search: name, limit: 100 });
        return Boolean(data?.some((f) => f.name === name));
      },
      async put(k, buf) {
        const a = await client();
        const { error } = await a.storage.from(BUCKET).upload(k, buf, {
          contentType: "application/pdf", upsert: true, cacheControl: "86400",
        });
        if (error) throw new Error(error.message);
      },
      hint(url) {
        const u = (url || "").replace(/\/$/, "");
        return `Set CONTENT_BASE_URL=${u}/storage/v1/object/public/${BUCKET} (and CONTENT_STORE=remote)`;
      },
    };
  }
  // default: local /public/resources
  return {
    label: "Local /public/resources",
    async exists(k) { try { await fs.access(path.join(PUBLIC_DIR, k)); return true; } catch { return false; } },
    async put(k, buf) {
      const dest = path.join(PUBLIC_DIR, k);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, buf);
    },
    hint() { return "Leave CONTENT_BASE_URL unset (CONTENT_STORE=public) — files are served from your own server."; },
  };
}

// ── main import ─────────────────────────────────────────────────────────────
async function cmdImport(catalog) {
  const allow = new Set((process.env.SOURCE_ALLOWLIST || "").split(",").map((s) => s.trim()).filter(Boolean));
  if (!allow.size) { log(`${C.red}SOURCE_ALLOWLIST is required (comma-separated source hostnames).${C.reset}`); process.exit(1); }

  const manifestPath = path.resolve(val("--manifest", path.join(__dirname, "curriculum-sources.json")));
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")); }
  catch { log(`${C.red}Cannot read manifest: ${manifestPath}${C.reset}\n${C.gray}Create it (see scripts/curriculum-sources.example.json) or use --emit-manifest.${C.reset}`); process.exit(1); }

  let entries = (manifest.sources || []).filter((e) => e && e.key && e.url);
  if (LIMIT) entries = entries.slice(0, LIMIT);
  if (!entries.length) { log(`${C.yellow}No { key, url } entries to import in ${manifestPath}.${C.reset}`); process.exit(0); }

  const store = makeStore();
  log(`${C.cyan}Importing ${entries.length} file(s)${C.reset}  ${C.gray}store=${store.label}  allow=[${[...allow].join(", ")}]  ${DRY ? "(dry-run)" : ""}${C.reset}\n`);

  const report = [];
  let imported = 0, skipped = 0, failed = 0;

  for (const e of entries) {
    const tag = e.key;
    // 1) target must be a real catalog key
    if (!KEY_RE.test(e.key) || e.key.includes("..") || !catalog.findResourceByKey(e.key)) {
      log(`${C.red}✗ ${tag}${C.reset} ${C.gray}— key not in catalog / invalid shape${C.reset}`);
      report.push({ key: e.key, status: "failed", error: "invalid_or_unknown_key" }); failed++; continue;
    }
    try {
      if (!FORCE && (await store.exists(e.key))) {
        log(`${C.gray}• ${tag} — already present, skipped${C.reset}`);
        report.push({ key: e.key, status: "skipped" }); skipped++; continue;
      }
      if (DRY) {
        // Validate the source host without downloading the whole file.
        const u = new URL(e.url);
        if (u.protocol !== "https:" || !allow.has(u.hostname)) throw new Error(`source not allowed: ${u.hostname}`);
        log(`${C.yellow}↪ ${tag} — would import from ${u.hostname}${C.reset}`);
        report.push({ key: e.key, status: "dry-run" }); continue;
      }
      const buf = await safeDownload(e.url, allow);
      await store.put(e.key, buf);
      log(`${C.green}✓ ${tag}${C.reset} ${C.gray}(${(buf.byteLength / 1048576).toFixed(2)}MB)${C.reset}`);
      report.push({ key: e.key, status: "imported", bytes: buf.byteLength }); imported++;
    } catch (err) {
      log(`${C.red}✗ ${tag}${C.reset} ${C.gray}— ${err.message}${C.reset}`);
      report.push({ key: e.key, status: "failed", error: err.message }); failed++;
    }
  }

  const reportPath = path.join(__dirname, "import-report.json");
  await fs.writeFile(reportPath, JSON.stringify({ when: new Date().toISOString(), store: store.label, imported, skipped, failed, report }, null, 2) + "\n", "utf8");

  log(`\n${C.cyan}Done.${C.reset} imported=${C.green}${imported}${C.reset} skipped=${skipped} failed=${C.red}${failed}${C.reset}`);
  log(`${C.gray}Report → ${reportPath}${C.reset}`);
  if (imported && !DRY) log(`${C.cyan}Next:${C.reset} ${store.hint(process.env.NEXT_PUBLIC_SUPABASE_URL)}`);
  if (failed) process.exitCode = 1;
}

// ── dispatch ────────────────────────────────────────────────────────────────
(async () => {
  const catalog = await loadCatalog();
  if (has("--list-keys")) return cmdListKeys(catalog, val("--list-keys", ""));
  if (has("--emit-manifest")) return cmdEmitManifest(catalog, val("--emit-manifest", ""), argv[argv.indexOf("--emit-manifest") + 2]);
  return cmdImport(catalog);
})().catch((e) => { console.error(`${C.red}Importer crashed:${C.reset}`, e); process.exit(1); });
