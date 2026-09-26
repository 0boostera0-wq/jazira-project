import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/content/fetch/route.js";

const call = (qs) => GET(new Request(`http://localhost/api/content/fetch${qs}`));

// Only keys the curriculum manifest marks "hosted" are served; there are none
// today (official textbooks stay on Madrasati), so every request is refused
// with JSON — never a placeholder PDF.
describe("/api/content/fetch", () => {
  it("rejects malformed keys", async () => {
    for (const qs of ["", "?key=", "?key=../../.env", "?key=1447/a/../../b.pdf", "?key=https://evil.example/x.pdf", "?key=1447//x.pdf", "?key=1447/x.txt"]) {
      const res = await call(qs);
      expect(res.status, qs).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_key" });
    }
  });

  it("answers 404 JSON for catalog keys that are not hosted", async () => {
    const res = await call("?key=1447/elementary/grade-1/math/t1/student-book.pdf");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "not_available" });
  });

  it("answers 404 JSON for unknown keys", async () => {
    const res = await call("?key=1447/nowhere/file.pdf");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_available" });
  });
});
