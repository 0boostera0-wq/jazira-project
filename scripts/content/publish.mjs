#!/usr/bin/env node
// ============================================================================
// Publish step (docs/CONTENT_ENGINE.md §2.15 lifecycle):
//
//   validated ──dedup: canonical or UNIQUE, source publish_policy allows──► published
//
//   node scripts/content/publish.mjs [--staging data/staging] [--now iso] [--dry-run] [--json]
//
// A question (questions/**, question-variants/** without templates) is
// published when all of these hold:
//   - status and validation.status are `validated` for the current revision
//     (validation.checked_revision = revision);
//   - dedup has classified it (dedup.class set) and it is not a duplicate of
//     another item (no dedup.duplicate_of): the cluster canonical or UNIQUE;
//   - its source may be published: no source (internal authored), a source of
//     kind `internal`, or a source whose publish_policy is
//     `derived_questions_allowed` (sources/registry.json). A policy of
//     `pending_owner_decision` holds the item as `validated`: protected
//     content is never redistributed without the owner's decision.
// Nothing else changes; the report lists every held item's reason. Items
// already published that are no longer eligible are reported, never
// silently unpublished. Exit: 0 ok, 1 error, 2 usage.
// ============================================================================

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_STAGING, isoNow, loadStaging, saveQuestions } from "./check-questions.mjs";

/** "ok" or the reason an item cannot be published now. */
export function publishBlocker(q, sources) {
  if (q.status !== "validated" && q.status !== "published") return `status ${q.status}`;
  if (q.validation?.status !== "validated") return `validation ${q.validation?.status}`;
  if (q.validation?.checked_revision !== null && q.validation?.checked_revision !== undefined && q.validation.checked_revision !== q.revision) return "validation is for an older revision";
  if (!q.dedup?.class) return "not deduplicated yet";
  if (q.dedup.duplicate_of) return `duplicate of ${q.dedup.duplicate_of}`;
  const sid = q.source?.source_id ?? null;
  if (!sid) return "ok";
  const src = sources.get(sid);
  if (!src) return `source ${sid} is not registered`;
  if (src.kind === "internal" || src.publish_policy === "derived_questions_allowed") return "ok";
  return `publish_policy ${src.publish_policy} (source ${sid})`;
}

export function publishBank(bank, { now }) {
  const counts = { published_now: 0, already_published: 0, held: 0, no_longer_eligible: 0 };
  const held = new Map();
  const noLonger = [];
  for (const q of bank.questions.values()) {
    if (q.status !== "validated" && q.status !== "published") continue;
    const why = publishBlocker(q, bank.sources);
    if (q.status === "published") {
      counts.already_published++;
      if (why !== "ok") {
        counts.no_longer_eligible++;
        noLonger.push({ id: q.id, reason: why });
      }
      continue;
    }
    if (why === "ok") {
      q.status = "published";
      q.updated_at = now;
      counts.published_now++;
    } else {
      counts.held++;
      held.set(why, (held.get(why) ?? 0) + 1);
    }
  }
  return { counts, held: Object.fromEntries([...held].sort((a, b) => b[1] - a[1])), noLonger };
}

export async function main(argv = process.argv.slice(2), log = console) {
  const o = { staging: DEFAULT_STAGING, now: null, dryRun: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--staging") o.staging = resolve(argv[++i]);
    else if (a === "--now") o.now = argv[++i];
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--json") o.json = true;
    else if (a === "--help" || a === "-h") {
      log.log("usage: node scripts/content/publish.mjs [--staging dir] [--now iso] [--dry-run] [--json]");
      return 0;
    } else {
      log.error(`error: unknown option ${a}`);
      return 2;
    }
  }
  try {
    const bank = loadStaging(o.staging);
    const r = publishBank(bank, { now: o.now ?? isoNow() });
    if (!o.dryRun && r.counts.published_now) saveQuestions(bank);
    if (o.json) log.log(JSON.stringify(r, null, 2));
    else {
      log.log(`publish${o.dryRun ? " (dry run)" : ""}: ${r.counts.published_now} published now, ${r.counts.already_published} already published, ${r.counts.held} validated but held`);
      for (const [why, n] of Object.entries(r.held)) log.log(`  held ${n}: ${why}`);
      for (const x of r.noLonger) log.log(`  published but no longer eligible: ${x.id} (${x.reason})`);
    }
    return 0;
  } catch (e) {
    log.error(`error: ${e.message}`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main().then((code) => { process.exitCode = code; });
