// The publish step (scripts/content/publish.mjs; docs/CONTENT_ENGINE.md §2.15):
// validated + dedup canonical/UNIQUE + a source whose publish_policy allows it.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const FIXTURE = join(resolve(__dirname, "../.."), "tests/fixtures/content/staging");
const NOW = "2026-09-28T12:00:00Z";
const quiet = { log: () => {}, error: () => {} };
let P, C, work;

beforeAll(async () => {
  P = await import("../../scripts/content/publish.mjs");
  C = await import("../../scripts/content/check-questions.mjs");
  work = mkdtempSync(join(tmpdir(), "jz-publish-"));
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

const validated = (q, over = {}) => ({
  ...structuredClone(q),
  status: "validated",
  validation: { ...q.validation, status: "validated", checked_revision: q.revision },
  dedup: { class: "UNIQUE", cluster_id: null, exclusion_group: null },
  ...over,
});

describe("publishBlocker", () => {
  it("publishes only validated, deduplicated items whose source allows it", () => {
    cpSync(FIXTURE, join(work, "a"), { recursive: true });
    const bank = C.loadStaging(join(work, "a"));
    const base = [...bank.questions.values()].find((q) => q.source?.source_id === "ien");
    const s = bank.sources;
    expect(P.publishBlocker(validated(base), s)).toBe("publish_policy pending_owner_decision (source ien)");
    expect(P.publishBlocker(validated(base, { source: null }), s)).toBe("ok");
    expect(P.publishBlocker(validated(base, { source: { ...base.source, source_id: "jazira-original" } }), s)).toBe("ok");
    expect(P.publishBlocker(validated(base, { source: null, dedup: { class: null, cluster_id: null, exclusion_group: null } }), s)).toBe("not deduplicated yet");
    expect(P.publishBlocker(validated(base, { source: null, dedup: { class: "NEAR_DUPLICATE", cluster_id: null, exclusion_group: null, duplicate_of: "q-m1-math-0000000000" } }), s)).toMatch(/^duplicate of/);
    expect(P.publishBlocker(validated(base, { source: null, status: "candidate" }), s)).toBe("status candidate");
    expect(P.publishBlocker(validated(base, { source: null, validation: { ...base.validation, status: "validated", checked_revision: base.revision + 1 } }), s)).toBe("validation is for an older revision");
    expect(P.publishBlocker(validated(base, { source: { ...base.source, source_id: "nowhere" } }), s)).toBe("source nowhere is not registered");
    const variant = validated(base, { source: null, variant: { kind: "template", template_id: "t-m1-math-0000000000", variant_no: 1, params: {} } });
    expect(P.publishBlocker(variant, s, new Map([["t-m1-math-0000000000", { status: "review_required" }]]))).toBe("template t-m1-math-0000000000 is review_required");
    expect(P.publishBlocker(variant, s, new Map([["t-m1-math-0000000000", { status: "validated" }]]))).toBe("ok");
    expect(P.publishBlocker(variant, s, new Map())).toBe("template t-m1-math-0000000000 is missing");
  });
});

describe("publish.mjs", () => {
  it("promotes eligible items, holds the rest with reasons and never unpublishes", async () => {
    const root = join(work, "b");
    cpSync(FIXTURE, root, { recursive: true });
    const bank = C.loadStaging(root);
    const qs = [...bank.questions.values()].filter((q) => q.source?.source_id === "ien").slice(0, 2);
    const [free, derived] = qs;
    bank.questions.set(free.id, validated(free, { source: null }));
    bank.questions.set(derived.id, validated(derived));
    C.saveQuestions(bank);
    const r = P.publishBank(C.loadStaging(root), { now: NOW });
    expect(r.counts.published_now).toBe(1);
    expect(r.held).toMatchObject({ "publish_policy pending_owner_decision (source ien)": 1 });
    // already-published fixture items that are ineligible are reported, not unpublished
    expect(r.counts.already_published).toBeGreaterThan(0);
    expect(r.noLonger.every((x) => typeof x.reason === "string")).toBe(true);
    expect(await P.main(["--staging", root, "--now", NOW], quiet)).toBe(0);
    const after = C.loadStaging(root);
    expect(after.questions.get(free.id).status).toBe("published");
    expect(after.questions.get(derived.id).status).toBe("validated");
    expect(await P.main(["--bogus"], quiet)).toBe(2);
  });
});
