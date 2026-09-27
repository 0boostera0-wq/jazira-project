#!/usr/bin/env node
// ============================================================================
// Template validation from its previews (docs/CONTENT_ENGINE.md §4.6).
//
//   node scripts/content/promote-templates.mjs [--staging data/staging] [--now iso] [--dry-run]
//
// A template is validated through Stages 1–3 on its first three
// instantiations: the materialized variants 01..03 (`previewInstances`),
// which run through check-questions, the Claude validator, the cross-AI
// exchange and resolve-validation like any other item. This script reads
// their outcome for every template revision and sets the template's status:
//   - all three previews `validated` (or `published`)  → template `validated`,
//     validation.record_ids = the previews' current records, checked_revision
//     = the template revision;
//   - any preview `rejected` or `review_required`       → template
//     `review_required` (a person decides; its variants stay `candidate`);
//   - a counted noun after a parameter (T003)           → template
//     `review_required` whatever the previews show;
//   - otherwise (a preview missing or still pending)    → unchanged.
// A template already rejected or retired is never touched. Run
// build-variants afterwards: variants of a validated template inherit
// `validated` (templates.js variantRecord). Exit: 0 ok, 1 error, 2 usage.
// ============================================================================

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { variantId } from "../../src/lib/content/ids.js";
import { DEFAULT_STAGING, isoNow, loadStaging, recordsFor } from "./check-questions.mjs";
import { countedNounAfterParam, saveTemplates } from "./ingest-templates.mjs";

export const PREVIEWS = 3;
const DONE = new Set(["validated", "published"]);
const BLOCKED = new Set(["rejected", "review_required"]);

/** The decision for one template: { status, validation, reason } or null (unchanged). */
export function decideTemplate(t, bank) {
  if (t.status === "rejected" || t.status === "retired") return null;
  // T003 (ingest rule added after some templates were ingested): a counted
  // noun after a parameter is wrong Arabic for some variants, whatever the
  // three previews show; a person rephrases the template.
  const counted = countedNounAfterParam(t);
  if (counted) return { status: "review_required", validation: { status: "review_required", record_ids: t.validation?.record_ids ?? [], checked_revision: t.revision }, reason: `T003 «${counted}»` };
  const previews = Array.from({ length: PREVIEWS }, (_, i) => bank.questions.get(variantId(t.id, i + 1)) ?? null);
  // A template edit bumps its revision and build-variants re-materializes the
  // variants as candidates, so a stale preview is never `validated` here.
  const current = previews.map((q) => (q && q.variant?.template_id === t.id ? q : null));
  if (current.some((q) => q && BLOCKED.has(q.status))) {
    const bad = current.filter((q) => q && BLOCKED.has(q.status)).map((q) => `${q.id}:${q.status}`);
    return { status: "review_required", validation: { status: "review_required", record_ids: recordIdsOf(current, bank), checked_revision: t.revision }, reason: `preview ${bad.join(", ")}` };
  }
  if (current.every((q) => q && DONE.has(q.status))) {
    return { status: "validated", validation: { status: "validated", record_ids: recordIdsOf(current, bank), checked_revision: t.revision }, reason: "3/3 previews validated" };
  }
  return null;
}

function recordIdsOf(previews, bank) {
  const ids = [];
  for (const q of previews) if (q) for (const r of recordsFor(bank, q)) ids.push(r.id);
  return [...new Set(ids)].sort().slice(0, 50);
}

export function promoteTemplates(bank, { now }) {
  const changes = [];
  for (const t of bank.templates.values()) {
    const d = decideTemplate(t, bank);
    if (!d) continue;
    const same = t.status === d.status && JSON.stringify(t.validation) === JSON.stringify(d.validation);
    if (same) continue;
    changes.push({ id: t.id, from: t.status, to: d.status, reason: d.reason });
    t.status = d.status;
    t.validation = d.validation;
    t.updated_at = now;
  }
  return changes;
}

export async function main(argv = process.argv.slice(2), log = console) {
  const o = { staging: DEFAULT_STAGING, now: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--staging") o.staging = resolve(argv[++i]);
    else if (a === "--now") o.now = argv[++i];
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--help" || a === "-h") {
      log.log("usage: node scripts/content/promote-templates.mjs [--staging dir] [--now iso] [--dry-run]");
      return 0;
    } else {
      log.error(`error: unknown option ${a}`);
      return 2;
    }
  }
  try {
    const bank = loadStaging(o.staging);
    const changes = promoteTemplates(bank, { now: o.now ?? isoNow() });
    for (const c of changes) log.log(`${c.id}: ${c.from} → ${c.to} (${c.reason})`);
    const by = {};
    for (const t of bank.templates.values()) by[t.status] = (by[t.status] ?? 0) + 1;
    log.log(`${changes.length} template(s) changed; now ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`);
    if (!o.dryRun && changes.length) saveTemplates(bank);
    return 0;
  } catch (e) {
    log.error(`error: ${e.message}`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().then((code) => { process.exitCode = code; });
