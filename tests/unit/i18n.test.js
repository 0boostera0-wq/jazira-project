import { describe, it, expect } from "vitest";
import { NAMESPACES, loadMessages } from "@/i18n/messages";
import { createTranslator } from "@/i18n/translator";
import { localizeHref, splitLocale, safeNextPath } from "@/i18n/config";

const PLURAL = new Set(["zero", "one", "two", "few", "many", "other"]);
const isPlural = (v) => v && typeof v === "object" && !Array.isArray(v) && "other" in v && Object.keys(v).every((k) => PLURAL.has(k));

// Flatten a message tree to "a.b.c" leaf paths. Plural objects and arrays are leaves.
function leaves(node, prefix = "", out = new Map()) {
  if (node && typeof node === "object" && !Array.isArray(node) && !isPlural(node)) {
    for (const [k, v] of Object.entries(node)) leaves(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out.set(prefix, node);
  }
  return out;
}

const ARABIC = /[؀-ۿ]/;

describe("i18n message catalogues", () => {
  for (const ns of NAMESPACES) {
    it(`"${ns}" has identical keys in ar and en`, async () => {
      const [ar, en] = await Promise.all([loadMessages("ar", [ns]), loadMessages("en", [ns])]);
      const a = leaves(ar[ns]);
      const e = leaves(en[ns]);
      const missingInEn = [...a.keys()].filter((k) => !e.has(k));
      const missingInAr = [...e.keys()].filter((k) => !a.has(k));
      expect({ ns, missingInEn, missingInAr }).toEqual({ ns, missingInEn: [], missingInAr: [] });
    });

    it(`"${ns}" English strings contain no Arabic UI text`, async () => {
      const { [ns]: en } = await loadMessages("en", [ns]);
      // Language names are intentionally shown in their own script.
      const offenders = [...leaves(en)].filter(([k, v]) => typeof v === "string" && ARABIC.test(v) && !/^languages\.|\.ar$|nativeName/.test(k));
      expect(offenders.map(([k]) => k)).toEqual([]);
    });

    it(`"${ns}" plural objects are well formed`, async () => {
      const [ar, en] = await Promise.all([loadMessages("ar", [ns]), loadMessages("en", [ns])]);
      for (const tree of [ar[ns], en[ns]]) {
        for (const [, v] of leaves(tree)) if (isPlural(v)) expect(typeof v.other).toBe("string");
      }
    });
  }
});

describe("translator", () => {
  const messages = {
    x: {
      hello: "مرحبا {name}",
      q: { zero: "لا توجد أسئلة", one: "سؤال واحد", two: "سؤالان", few: "{count} أسئلة", many: "{count} سؤالًا", other: "{count} سؤال" },
    },
  };
  const t = createTranslator("ar", messages, "x");
  it("interpolates", () => expect(t("hello", { name: "سارة" })).toBe("مرحبا سارة"));
  it("selects Arabic plural categories", () => {
    expect(t("q", { count: 0 })).toBe("لا توجد أسئلة");
    expect(t("q", { count: 1 })).toBe("سؤال واحد");
    expect(t("q", { count: 2 })).toBe("سؤالان");
    expect(t("q", { count: 5 })).toBe("5 أسئلة");
    expect(t("q", { count: 11 })).toBe("11 سؤالًا");
    expect(t("q", { count: 100 })).toBe("100 سؤال");
  });
  it("never throws on missing keys", () => expect(() => t("nope.nothing")).not.toThrow());
});

describe("locale routing helpers", () => {
  it("localizes hrefs", () => {
    expect(localizeHref("/exams", "ar")).toBe("/exams");
    expect(localizeHref("/exams", "en")).toBe("/en/exams");
    expect(localizeHref("/", "en")).toBe("/en");
    expect(localizeHref("/#features", "en")).toBe("/en#features");
    expect(localizeHref("/en/exams?x=1", "ar")).toBe("/exams?x=1");
    expect(localizeHref("/api/chat", "en")).toBe("/api/chat");
    expect(localizeHref("https://example.com", "en")).toBe("https://example.com");
    expect(localizeHref("//evil.com", "en")).toBe("//evil.com");
  });
  it("splits prefixes", () => {
    expect(splitLocale("/en/a/b")).toEqual({ locale: "en", path: "/a/b" });
    expect(splitLocale("/en")).toEqual({ locale: "en", path: "/" });
    expect(splitLocale("/english")).toEqual({ locale: "ar", path: "/english" });
  });
  it("rejects unsafe redirect targets", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.com")).toBe("/dashboard");
    expect(safeNextPath("@evil.com")).toBe("/dashboard");
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
    expect(safeNextPath("/ok\nbad")).toBe("/dashboard");
    expect(safeNextPath(undefined, "/x")).toBe("/x");
  });
});

describe("learn pool hint agrees with the number", () => {
  it("uses the Arabic plural categories for the required count", async () => {
    const [ar, en] = await Promise.all([loadMessages("ar", ["learn"]), loadMessages("en", ["learn"])]);
    const ta = createTranslator("ar", ar, "learn");
    const te = createTranslator("en", en, "learn");
    const hint = (t, count) => t("entry.reasonHint.insufficient_pool", { count, available: "0" });
    expect(hint(ta, 3)).toContain("أسئلة مختلفة");
    expect(hint(ta, 12)).toContain("سؤالًا مختلفًا");
    expect(hint(ta, 100)).toContain("سؤال مختلف");
    expect(hint(ta, 1)).toContain("سؤال واحد");
    expect(hint(te, 5)).toBe("Needs 5 distinct questions; 0 available so far.");
  });
});
