import { describe, it, expect } from "vitest";
import { loadMessages } from "@/i18n/messages";
import { mergeMessages } from "@/i18n/merge";
import { createTranslator } from "@/i18n/translator";

// <Messages ns={["support.faq", …]}> ships only the picked branches of a
// namespace in the RSC payload, in the same nested shape as the full tree.

describe("loadMessages with dotted subtrees", () => {
  it("returns only the picked branches, nested under the namespace", async () => {
    const [full, picked] = await Promise.all([
      loadMessages("en", ["common"]),
      loadMessages("en", ["common.actions", "common.a11y.close"]),
    ]);
    expect(Object.keys(picked)).toEqual(["common"]);
    expect(Object.keys(picked.common).sort()).toEqual(["a11y", "actions"]);
    expect(picked.common.actions).toEqual(full.common.actions);
    expect(picked.common.a11y).toEqual({ close: full.common.a11y.close });
  });

  it("keeps useT(namespace) lookups working on a picked tree", async () => {
    const messages = await loadMessages("ar", ["common.actions"]);
    const t = createTranslator("ar", messages, "common");
    expect(t("actions.save")).toBe("حفظ");
  });

  it("whole namespaces and subtrees of other namespaces combine", async () => {
    const m = await loadMessages("en", ["nav", "common.brand"]);
    expect(m.nav.items.faq).toBe("FAQ");
    expect(m.common.brand.name).toBe("Jazira");
    expect(m.common.actions).toBeUndefined();
  });

  it("fails loudly on a mistyped path", async () => {
    await expect(loadMessages("en", ["common.nope"])).rejects.toThrow(/unknown message path/);
    await expect(loadMessages("en", ["nope"])).rejects.toThrow(/unknown namespace/);
  });
});

describe("mergeMessages (nested <Messages> providers)", () => {
  it("deep-merges so a child subtree never hides parent keys", () => {
    const parent = { common: { a: 1 }, support: { faq: { title: "FAQ" }, about: { x: 1 } } };
    const child = { support: { faq: { items: ["q"] } } };
    expect(mergeMessages(parent, child)).toEqual({
      common: { a: 1 },
      support: { faq: { title: "FAQ", items: ["q"] }, about: { x: 1 } },
    });
  });

  it("does not mutate its inputs and lets arrays/leaves from the child win", () => {
    const a = { x: { list: [1, 2], v: "a" } };
    const b = { x: { list: [3], v: "b" } };
    const out = mergeMessages(a, b);
    expect(out).toEqual({ x: { list: [3], v: "b" } });
    expect(a).toEqual({ x: { list: [1, 2], v: "a" } });
  });
});
