#!/usr/bin/env node
// ============================================================================
// Pre-merge environment contract check (docs/CONTENT_ENGINE.md §5.8, §10.2).
//
//   node scripts/check-env-contract.mjs [--env-file <file>]… [--json]
//
// Reads the target environment's variable listing — a dotenv file
// (`vercel env pull`), or a names-only listing (`vercel env ls` output, one
// variable per line / table row) — or, without --env-file, process.env.
// Fails (exit 1) when:
//   - EXAM_SECRET_REQUIRED is on (1/true; in a names-only listing: present)
//     and LOCAL_EXAM_SECRET is missing, or shorter than 32 characters when
//     its value is known — live practice would answer 503;
//   - LOCAL_EXAM_SECRET_PREVIOUS is set (value known) and shorter than 16;
//   - a server secret is exposed as NEXT_PUBLIC_* (LOCAL_EXAM_SECRET,
//     SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, LEMONSQUEEZY_WEBHOOK_SECRET).
// Warns (exit 0) when LOCAL_EXAM_SECRET is not set at all (tokens use a key
// derived from another server secret) or is shorter than 32 characters.
// Exit 2 = usage error.
// ============================================================================
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const NAME_RE = /^[A-Z_][A-Z0-9_]*$/;
const SERVER_SECRETS = ["LOCAL_EXAM_SECRET", "LOCAL_EXAM_SECRET_PREVIOUS", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY", "LEMONSQUEEZY_WEBHOOK_SECRET", "LEMONSQUEEZY_API_KEY"];

const unquote = (v) => {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t.replace(/\s+#.*$/, "");
};

/**
 * Parse a listing into Map name → value (string) | null (value unknown).
 * Dotenv lines `NAME=value` (optional `export `) give values; other lines
 * whose first token is a variable name (vercel env ls) give names only.
 */
export function parseListing(text) {
  const vars = new Map();
  for (const raw of String(text).replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (m) {
      vars.set(m[1], unquote(m[2]));
      continue;
    }
    const first = line.split(/\s+/)[0];
    if (NAME_RE.test(first) && first !== "NAME") vars.set(first, vars.get(first) ?? null);
  }
  return vars;
}

/**
 * @param {Map<string, string|null>} vars
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function checkEnvContract(vars) {
  const errors = [];
  const warnings = [];
  const has = (k) => vars.has(k) && vars.get(k) !== "";
  const flag = vars.get("EXAM_SECRET_REQUIRED");
  const flagOn = vars.has("EXAM_SECRET_REQUIRED") && (flag === null || flag === "1" || flag === "true");
  const secret = vars.get("LOCAL_EXAM_SECRET");
  if (flagOn) {
    if (!has("LOCAL_EXAM_SECRET")) errors.push("EXAM_SECRET_REQUIRED is on but LOCAL_EXAM_SECRET is missing: the exam routes would answer 503");
    else if (typeof secret === "string" && secret.length < 32) errors.push("EXAM_SECRET_REQUIRED is on but LOCAL_EXAM_SECRET is shorter than 32 characters");
  } else if (!has("LOCAL_EXAM_SECRET")) {
    warnings.push("LOCAL_EXAM_SECRET is not set: exam tokens use a key derived from another server secret (set it, then EXAM_SECRET_REQUIRED=1)");
  } else if (typeof secret === "string" && secret.length < 32) {
    warnings.push("LOCAL_EXAM_SECRET is shorter than 32 characters");
  }
  const prev = vars.get("LOCAL_EXAM_SECRET_PREVIOUS");
  if (typeof prev === "string" && prev !== "" && prev.length < 16) errors.push("LOCAL_EXAM_SECRET_PREVIOUS is shorter than 16 characters");
  for (const s of SERVER_SECRETS) if (vars.has(`NEXT_PUBLIC_${s}`)) errors.push(`NEXT_PUBLIC_${s} would ship a server secret to the browser`);
  return { ok: errors.length === 0, errors, warnings };
}

function main(argv) {
  const files = [];
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--env-file" && argv[i + 1]) files.push(resolve(argv[++i]));
    else if (argv[i] === "--json") json = true;
    else {
      console.error("usage: check-env-contract [--env-file <file>]… [--json]");
      return 2;
    }
  }
  let vars;
  if (files.length) {
    vars = new Map();
    for (const f of files) for (const [k, v] of parseListing(readFileSync(f, "utf8"))) vars.set(k, v);
  } else {
    vars = new Map(Object.entries(process.env).filter(([k]) => NAME_RE.test(k)));
  }
  const r = checkEnvContract(vars);
  if (json) console.log(JSON.stringify(r, null, 2));
  else {
    for (const w of r.warnings) console.warn(`warning: ${w}`);
    for (const e of r.errors) console.error(`error: ${e}`);
    if (r.ok) console.log("env contract ok");
  }
  return r.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
