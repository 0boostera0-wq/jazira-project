#!/usr/bin/env node
// ============================================================================
// Pack the runtime bank (docs/CONTENT_ENGINE.md §5.8, §3) — the pre-DB
// fallback the guest exam routes select from.
//
//   node scripts/content/pack-runtime-bank.mjs [--staging data/staging] [--out data/runtime/bank]
//        [--policy strict|all] [--check] [--no-budget] [--json]
//
// Input (read only): published questions and materialized variants
// (questions/**, question-variants/** except templates/), stimuli, curriculum
// nodes and objectives, resources, sources/registry.json.
// Output (byte-deterministic; stale files removed):
//   index.json          runtime-bank-index@1 (whitelist of files + node counts)
//   sel/<file>.json     runtime-bank-sel@1 per subject / prep section (rows carry the
//                       objective id so lesson-quiz can stratify by objective)
//   c/<chunk>.json      public content (≤ 256 KB), k/<chunk>.json keys (≤ 256 KB)
// --policy strict (default): only items whose source may be published
//   (publish_policy derived_questions_allowed, an internal source, or no
//   textbook source); `all` packs every published item (test / staging banks).
// --check: build in memory and report, write nothing (exit 1 on budget errors).
// Budget: the bank must stay ≤ 40 MB and ~60k items (§3); beyond that the DB
// path is required.
// ============================================================================
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonl, writeFileIfChanged } from "./lib/jsonl.mjs";
import { publicPayload } from "../../src/lib/content/answers.js";

const REPO = resolve(fileURLToPath(import.meta.url), "../../..");
export const CHUNK_MAX_BYTES = 256 * 1024;
const CHUNK_TARGET = 250 * 1024;
export const BANK_MAX_BYTES = 40 * 1024 * 1024;
export const BANK_MAX_ITEMS = 60000;
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/** Selection-row columns; `objective` (objective id | null) lets lesson-quiz stratify by objective (§2.12). */
export const SEL_COLUMNS = Object.freeze(["key", "lesson", "band", "component", "type", "stimulus", "premium", "revision", "chunk", "objective"]);

const readFileText = (p) => readFileSync(p, "utf8").replace(/^\uFEFF/, "");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const cmpC = (a, b) => Buffer.compare(Buffer.from(String(a), "utf8"), Buffer.from(String(b), "utf8"));

function walkJsonl(dir, skip = () => false) {
  const out = [];
  if (!existsSync(dir)) return out;
  const visit = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) {
        if (!skip(p)) visit(p);
      } else if (name.endsWith(".jsonl")) out.push(p);
    }
  };
  visit(dir);
  return out;
}

/** A file id under the index pattern: readable when short, hashed when long. */
export function fileIdFor(prefix, name) {
  const slug = `${prefix}-${name.replace(/\//g, "_").replace(/[^a-z0-9_-]/g, "-")}`;
  return ID_RE.test(slug) ? slug : `${prefix}-${sha256(name).slice(0, 24)}`;
}

/** The bank's content projection of a question (never an answer field). */
function contentItem(q, { stimuli, nodes }) {
  const pub = publicPayload(q.question_type, q.payload);
  if (pub.unit) pub.unit = { text: pub.unit.text, required: pub.unit.required }; // accepted spellings stay with the key
  const lessonId = q.scope === "curriculum" ? q.curriculum.lesson : `prep:${q.prep.exam}/${q.prep.section}/${q.prep.topic}`;
  const lesson = nodes.get(lessonId);
  const st = q.stimulus_id ? stimuli.get(q.stimulus_id) : null;
  return {
    key: q.id,
    revision: q.revision,
    type: q.question_type,
    language: q.language,
    stem: q.stem,
    stimulus: st ? { id: st.id, text: st.text } : null,
    public: pub,
    shuffle_options: q.shuffle_options !== false,
    fixed_order_reason: q.payload?.fixed_order_reason ?? null,
    time_limit_seconds: q.time_limit_seconds ?? null,
    band: q.difficulty_band,
    lesson: { id: lessonId, title: lesson?.title_ar ?? null, term: q.scope === "curriculum" ? q.curriculum.term ?? null : null },
    topic: q.prep?.topic ?? null,
  };
}

function keyItem(q, { objectives, resources }) {
  const obj = q.objective_id ? objectives.get(q.objective_id) : null;
  const res = q.source?.resource_id ? resources.get(q.source.resource_id) : null;
  const page = q.source?.pdf_page_start ?? null;
  // missing is shown as missing (§1.6): no link-out to a resource recorded as unavailable
  const reachable = res && res.availability !== "unavailable" && res.status !== "unavailable";
  return {
    key: q.id,
    revision: q.revision,
    payload: q.payload,
    explanation: q.explanation ? { text: q.explanation.text ?? "", steps: q.explanation.steps ?? [] } : null,
    objective: obj && obj.status === "validated" ? { text: obj.text_ar } : null,
    source: res ? {
      resource_id: res.id,
      title: res.title,
      printed_start: q.source.printed_page_start ?? null,
      printed_end: q.source.printed_page_end ?? null,
      url: !reachable || !res.url ? null : page && res.file_type === "pdf" ? `${res.url}#page=${page}` : res.url,
    } : null,
  };
}

function allowedByPolicy(q, registry, policy) {
  if (policy === "all") return true;
  const sid = q.source?.source_id ?? null;
  if (!sid) return true;
  const src = registry.get(sid);
  return Boolean(src) && (src.kind === "internal" || src.publish_policy === "derived_questions_allowed");
}

/**
 * Build the bank in memory.
 * @returns {{ files: Map<string, Buffer>, report: object }}  files keyed by bank-relative path
 */
export function buildRuntimeBank({ stagingDir, policy = "strict" }) {
  const S = (p) => join(stagingDir, p);
  const registry = new Map((existsSync(S("sources/registry.json")) ? JSON.parse(readFileText(S("sources/registry.json"))) : []).map((s) => [s.id, s]));
  const nodes = new Map();
  for (const f of walkJsonl(S("curriculum/nodes"))) for (const n of readJsonl(f)) nodes.set(n.id, n);
  const objectives = new Map();
  for (const f of walkJsonl(S("curriculum/objectives"))) for (const o of readJsonl(f)) objectives.set(o.id, o);
  const resources = new Map();
  for (const f of walkJsonl(S("resources")).filter((p) => /resources(?:\.p\d{2})?\.jsonl$/.test(p))) for (const r of readJsonl(f)) resources.set(r.id, r);
  const stimuli = new Map();
  for (const f of walkJsonl(S("questions/stimuli"))) for (const s of readJsonl(f)) stimuli.set(s.id, s);

  const questionFiles = [
    ...walkJsonl(S("questions"), (d) => d === S("questions/stimuli")),
    ...walkJsonl(S("question-variants"), (d) => d === S("question-variants/templates")),
  ];
  const report = { policy, read: 0, published: 0, packed: 0, skipped_policy: 0, skipped_unmapped: 0, by_file: {} };
  const groups = new Map(); // sel name → questions
  const seen = new Set();
  for (const f of questionFiles) {
    for (const q of readJsonl(f)) {
      report.read += 1;
      if (q.status !== "published") continue;
      report.published += 1;
      if (seen.has(q.id)) throw new Error(`duplicate question id ${q.id}`);
      seen.add(q.id);
      if (!allowedByPolicy(q, registry, policy)) {
        report.skipped_policy += 1;
        continue;
      }
      let name;
      if (q.scope === "curriculum" && q.curriculum?.subject && q.curriculum?.lesson) name = q.curriculum.subject;
      else if (q.prep?.exam && q.prep?.section && q.prep?.topic) name = `prep:${q.prep.exam}/${q.prep.section}`;
      else {
        report.skipped_unmapped += 1;
        continue;
      }
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(q);
    }
  }

  const files = new Map();
  const index = { schema: "runtime-bank-index@1", bank_revision: "", files: {}, nodes: {} };
  const put = (fileId, relPath, value) => {
    const buf = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
    files.set(relPath, buf);
    index.files[fileId] = { path: relPath, sha256: sha256(buf), bytes: buf.length };
    return buf.length;
  };
  const ctx = { stimuli, nodes, objectives, resources };
  const bump = (nodeId, band, selId) => {
    if (!index.nodes[nodeId]) index.nodes[nodeId] = { counts: { 1: 0, 2: 0, 3: 0 }, sel: selId };
    index.nodes[nodeId].counts[band] += 1;
  };

  for (const name of [...groups.keys()].sort(cmpC)) {
    const qs = groups.get(name).sort((a, b) => cmpC(a.id, b.id));
    const isPrep = name.startsWith("prep:");
    const selName = isPrep ? name.slice(5).replace("/", "_") : name;
    const selId = fileIdFor("s", selName);
    const rows = [];
    let chunkNo = 0;
    let content = [];
    let keys = [];
    let size = 0;
    const flush = () => {
      if (!content.length) return;
      chunkNo += 1;
      const chunkId = fileIdFor("x", `${selName}-${String(chunkNo).padStart(2, "0")}`).slice(2);
      const cBytes = put(`c-${chunkId}`, `c/${chunkId}.json`, { schema: "runtime-bank-content@1", chunk_id: chunkId, kind: "content", items: content });
      const kBytes = put(`k-${chunkId}`, `k/${chunkId}.json`, { schema: "runtime-bank-content@1", chunk_id: chunkId, kind: "keys", items: keys });
      if (cBytes > CHUNK_MAX_BYTES || kBytes > CHUNK_MAX_BYTES) throw new Error(`chunk ${chunkId} exceeds 256 KB (a single item is too large)`);
      for (const r of rows) if (r[8] === null) r[8] = chunkId;
      content = [];
      keys = [];
      size = 0;
    };
    for (const q of qs) {
      const c = contentItem(q, ctx);
      const k = keyItem(q, ctx);
      const add = Math.max(Buffer.byteLength(JSON.stringify(c)), Buffer.byteLength(JSON.stringify(k))) + 1;
      if (size + add > CHUNK_TARGET) flush();
      content.push(c);
      keys.push(k);
      size += add;
      const lesson = c.lesson.id;
      rows.push([q.id, lesson, q.difficulty_band, q.dedup?.exclusion_group ?? null, q.question_type, q.stimulus_id ?? null, q.is_premium === true, q.revision, null, q.objective_id ?? null]);
      // counts: the lesson (prep topic), its ancestors up to the subject (prep section)
      if (isPrep) {
        bump(lesson, q.difficulty_band, selId);
        bump(name, q.difficulty_band, selId);
      } else {
        let id = lesson;
        let reached = false;
        for (let depth = 0; id && depth < 8; depth++) {
          bump(id, q.difficulty_band, selId);
          if (id === name) {
            reached = true;
            break;
          }
          id = nodes.get(id)?.parent_id ?? null;
        }
        if (!reached) bump(name, q.difficulty_band, selId);
      }
      report.packed += 1;
    }
    flush();
    put(selId, `sel/${selId.slice(2)}.json`, { schema: "runtime-bank-sel@1", file_id: selId, scope: name, columns: SEL_COLUMNS, rows });
    report.by_file[selId] = rows.length;
  }

  // deterministic key order in the index
  index.files = Object.fromEntries(Object.entries(index.files).sort((a, b) => cmpC(a[0], b[0])));
  index.nodes = Object.fromEntries(Object.entries(index.nodes).sort((a, b) => cmpC(a[0], b[0])));
  index.bank_revision = sha256(Object.values(index.files).map((f) => `${f.path} ${f.sha256}`).join("\n")).slice(0, 32);
  files.set("index.json", Buffer.from(`${JSON.stringify(index)}\n`, "utf8"));
  const bytes = [...files.values()].reduce((s, b) => s + b.length, 0);
  report.bytes = bytes;
  report.files = files.size;
  report.bank_revision = index.bank_revision;
  report.errors = [];
  if (bytes > BANK_MAX_BYTES) report.errors.push(`bank is ${bytes} bytes > ${BANK_MAX_BYTES} (use the DB path)`);
  if (report.packed > BANK_MAX_ITEMS) report.errors.push(`bank has ${report.packed} items > ${BANK_MAX_ITEMS} (use the DB path)`);
  return { files, index, report };
}

/** Write the bank; files not in the new set (sel/, c/, k/) are removed. */
export function writeRuntimeBank(outDir, files) {
  const root = resolve(outDir);
  let written = 0;
  for (const [rel, buf] of files) {
    const abs = resolve(root, rel);
    if (!abs.startsWith(root + sep)) throw new Error(`path escapes the bank: ${rel}`);
    if (writeFileIfChanged(abs, buf)) written += 1;
  }
  const removed = [];
  for (const sub of ["sel", "c", "k"]) {
    const d = join(root, sub);
    if (!existsSync(d)) continue;
    for (const name of readdirSync(d)) {
      const rel = `${sub}/${name}`;
      if (!files.has(rel)) {
        rmSync(join(d, name));
        removed.push(rel);
      }
    }
  }
  return { written, removed };
}

export function packRuntimeBank({ stagingDir = join(REPO, "data/staging"), outDir = join(REPO, "data/runtime/bank"), policy = "strict", check = false, budget = true } = {}) {
  const { files, report } = buildRuntimeBank({ stagingDir, policy });
  if (budget && report.errors.length) return { ok: false, report };
  if (!check) Object.assign(report, writeRuntimeBank(outDir, files), { out: relative(REPO, outDir).replace(/\\/g, "/") || "." });
  return { ok: true, report };
}

const USAGE = "usage: pack-runtime-bank [--staging <dir>] [--out <dir>] [--policy strict|all] [--check] [--no-budget] [--json]";

async function main(argv) {
  const o = {};
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--staging") o.stagingDir = resolve(value());
    else if (a === "--out") o.outDir = resolve(value());
    else if (a === "--policy") {
      o.policy = value();
      if (o.policy !== "strict" && o.policy !== "all") throw new Error("--policy must be strict or all");
    } else if (a === "--check") o.check = true;
    else if (a === "--no-budget") o.budget = false;
    else if (a === "--json") json = true;
    else throw new Error(`unknown argument ${a}`);
  }
  const res = packRuntimeBank(o);
  if (json) console.log(JSON.stringify(res.report, null, 2));
  else {
    const r = res.report;
    console.log(`runtime bank ${r.bank_revision ?? "-"}: ${r.packed} items (${r.published} published, ${r.skipped_policy} held back by publish policy, ${r.skipped_unmapped} unmapped), ${r.files} files, ${r.bytes} bytes${r.written !== undefined ? `, ${r.written} written, ${r.removed.length} removed` : ""}`);
    for (const e of r.errors) console.error(`error: ${e}`);
  }
  return res.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    console.error(e.message);
    console.error(USAGE);
    process.exit(2);
  });
}
