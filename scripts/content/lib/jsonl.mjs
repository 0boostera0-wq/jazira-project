// ============================================================================
// JSONL I/O for staging data (docs/CONTENT_ENGINE.md §3 "File rules").
//
//   for await (const { record, line } of readJsonlStream(path)) …   streaming
//   readJsonl(path)                                  → records (sync, small files)
//   inspectJsonlText(text)                           → { records, issues }
//   writeShards(base, records, { compare, serialize }) deterministic shards
//
// Output rules: UTF-8, LF, no BOM, one record per line, final newline, keys in
// schema order (pass `serialize`, e.g. (r) => stringifyRecord("question", r)),
// records sorted, byte-deterministic (unchanged content is not rewritten).
// Shards split at 4 MB into `<base>.p01.jsonl`, `<base>.p02.jsonl` … by
// sorted ranges; a set that fits is written as `<base>.jsonl`. Stale sibling
// shards of the same base are removed.
// ============================================================================

import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";

export const MAX_SHARD_BYTES = 4 * 1024 * 1024;

export class JsonlError extends Error {
  constructor(file, line, message) {
    super(`${file}:${line}: ${message}`);
    this.name = "JsonlError";
    this.file = file;
    this.line = line;
  }
}

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/** Stream records of a JSONL file: yields { record, line, raw }. Throws JsonlError on bad JSON. */
export async function* readJsonlStream(path) {
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  let n = 0;
  for await (const raw of rl) {
    n++;
    const text = n === 1 ? raw.replace(/^﻿/, "") : raw;
    if (text.trim() === "") continue;
    let record;
    try {
      record = JSON.parse(text);
    } catch (e) {
      throw new JsonlError(path, n, `invalid JSON (${e.message})`);
    }
    yield { record, line: n, raw: text };
  }
}

/**
 * Parse JSONL text and report file-rule issues (BOM, CR, missing final
 * newline, blank lines, invalid JSON, non-object records).
 * @returns {{ records: {record, line, raw}[], issues: {line, code, message}[] }}
 */
export function inspectJsonlText(text) {
  const issues = [];
  if (text.startsWith("﻿")) issues.push({ line: 1, code: "bom", message: "UTF-8 BOM" });
  if (text.includes("\r")) issues.push({ line: 0, code: "crlf", message: "CR characters (use LF)" });
  if (text.length > 0 && !text.endsWith("\n")) issues.push({ line: 0, code: "final_newline", message: "missing final newline" });
  const lines = text.replace(/^﻿/, "").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const records = [];
  lines.forEach((raw0, i) => {
    const raw = raw0.replace(/\r$/, "");
    if (raw.trim() === "") {
      issues.push({ line: i + 1, code: "blank_line", message: "blank line" });
      return;
    }
    try {
      const record = JSON.parse(raw);
      if (record === null || typeof record !== "object" || Array.isArray(record)) {
        issues.push({ line: i + 1, code: "not_object", message: "record is not a JSON object" });
      } else records.push({ record, line: i + 1, raw });
    } catch (e) {
      issues.push({ line: i + 1, code: "invalid_json", message: e.message });
    }
  });
  return { records, issues };
}

/** Records of a (small) JSONL file; throws JsonlError on the first bad line. */
export function readJsonl(path) {
  const { records, issues } = inspectJsonlText(readFileSync(path, "utf8"));
  const bad = issues.find((i) => i.code === "invalid_json" || i.code === "not_object");
  if (bad) throw new JsonlError(path, bad.line, bad.message);
  return records.map((r) => r.record);
}

/** Write `content` atomically; returns false (and writes nothing) when the file already has it. */
export function writeFileIfChanged(path, content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  if (existsSync(path) && readFileSync(path).equals(buf)) return false;
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.part`;
  writeFileSync(tmp, buf);
  renameSync(tmp, path);
  return true;
}

/** Split serialized lines into shards of at most `maxBytes` (each line + "\n"). */
export function planShards(lines, maxBytes = MAX_SHARD_BYTES) {
  const shards = [];
  let current = [];
  let size = 0;
  for (const line of lines) {
    const bytes = Buffer.byteLength(line, "utf8") + 1;
    if (bytes > maxBytes) throw new Error(`a single record is ${bytes} bytes, above the ${maxBytes}-byte shard limit`);
    if (size + bytes > maxBytes && current.length) {
      shards.push(current);
      current = [];
      size = 0;
    }
    current.push(line);
    size += bytes;
  }
  if (current.length || !shards.length) shards.push(current);
  return shards;
}

const byIdC = (a, b) => Buffer.compare(Buffer.from(String(a.id), "utf8"), Buffer.from(String(b.id), "utf8"));

/**
 * Deterministic shard writer.
 * @param {string} base  path without extension, e.g. data/staging/questions/middle/grade-1/math
 * @param {object[]} records
 * @param {object} [o] { compare (default: by id, C order), serialize (default JSON.stringify), maxBytes, dryRun }
 * @returns {{ files: {path, lines, bytes, sha256, changed}[], removed: string[] }}
 */
export function writeShards(base, records, { compare = byIdC, serialize = (r) => JSON.stringify(r), maxBytes = MAX_SHARD_BYTES, dryRun = false } = {}) {
  const sorted = compare ? [...records].sort(compare) : [...records];
  const lines = sorted.map((r) => {
    const s = serialize(r);
    if (s.includes("\n") || s.includes("\r")) throw new Error("serialized record contains a newline");
    return s;
  });
  const shards = planShards(lines, maxBytes);
  if (shards.length > 99) throw new Error(`${base}: more than 99 shards`); // checked before anything is written
  const files = shards.map((shard, i) => {
    const path = shards.length === 1 ? `${base}.jsonl` : `${base}.p${String(i + 1).padStart(2, "0")}.jsonl`;
    const content = shard.length ? shard.join("\n") + "\n" : "";
    const changed = dryRun ? !(existsSync(path) && readFileSync(path, "utf8") === content) : writeFileIfChanged(path, content);
    return { path, lines: shard.length, bytes: Buffer.byteLength(content, "utf8"), sha256: sha256(content), changed };
  });
  const keep = new Set(files.map((f) => basename(f.path)));
  const removed = [];
  const dir = dirname(base);
  const stem = basename(base).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sibling = new RegExp(`^${stem}(?:\\.p\\d{2})?\\.jsonl$`);
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (sibling.test(f) && !keep.has(f)) {
        if (!dryRun) unlinkSync(join(dir, f));
        removed.push(join(dir, f));
      }
    }
  }
  return { files, removed };
}

/** Write one JSONL file (no sharding); returns { path, lines, bytes, sha256, changed }. */
export function writeJsonl(path, records, { compare = null, serialize = (r) => JSON.stringify(r) } = {}) {
  const sorted = compare ? [...records].sort(compare) : records;
  const content = sorted.map(serialize).join("\n") + (sorted.length ? "\n" : "");
  const changed = writeFileIfChanged(path, content);
  return { path, lines: sorted.length, bytes: Buffer.byteLength(content, "utf8"), sha256: sha256(content), changed };
}

/** Pretty JSON file (2-space indent, final newline), rewritten only on change. */
export function writeJson(path, value) {
  return writeFileIfChanged(path, JSON.stringify(value, null, 2) + "\n");
}
