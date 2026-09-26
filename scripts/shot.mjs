#!/usr/bin/env node
// Visual + accessibility QA with the locally installed Chrome (puppeteer-core).
//
//   node scripts/shot.mjs <url-or-path> <out.png> [--w=390] [--h=844] [--full] [--dark]
//                         [--wait=1500] [--auth] [--axe]
//
// --full   full-page capture (scrolls through the page first so lazy images load)
// --dark   dark theme
// --auth   sets a dummy Supabase auth cookie so the middleware's protected-route
//          gate lets the page render (the app still treats you as signed out —
//          use it for shells, guards and signed-out/expired states)
// --axe    runs axe-core (WCAG 2.2 A/AA) and prints violations
//
// Paths resolve against JZ_BASE (default http://localhost:3100). Prints JSON with
// horizontalOverflowPx (must be 0) and consoleErrors (must be empty).
import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => {
  const [k, v] = a.slice(2).split("=");
  return [k, v ?? true];
}));
const [target, out] = args.filter((a) => !a.startsWith("--"));
if (!target || !out) {
  console.error("usage: node scripts/shot.mjs <url|path> <out.png> [--w=390] [--h=844] [--full] [--dark] [--wait=1500] [--auth] [--axe]");
  process.exit(2);
}
const base = process.env.JZ_BASE || "http://localhost:3100";
// Git Bash (MSYS) rewrites "/en/x" to "C:/Program Files/Git/en/x" — undo that.
const cleaned = target.replace(/\\/g, "/").replace(/^[A-Za-z]:\/.*?\/Git(?=\/)/, "");
const url = /^https?:/.test(cleaned) ? cleaned : base + (cleaned.startsWith("/") ? cleaned : "/" + cleaned);
const width = Number(flags.w || 390);
const height = Number(flags.h || 844);
const CHROME = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => p && existsSync(p));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--hide-scrollbars"] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768 });
  if (flags.dark) {
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem("jazira_theme_v1", JSON.stringify("dark")); } catch {} });
  }
  if (flags.auth) {
    const { hostname } = new URL(url);
    await page.setCookie({ name: "sb-qa-auth-token", value: "qa", domain: hostname, path: "/" });
  }
  await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
  await new Promise((r) => setTimeout(r, Number(flags.wait || 1500)));
  if (flags.full) {
    // Walk the page so IntersectionObserver / loading="lazy" content renders.
    await page.evaluate(async () => {
      const step = Math.max(200, window.innerHeight * 0.8);
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await new Promise((r) => setTimeout(r, 600));
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: Boolean(flags.full) });

  let axe;
  if (flags.axe) {
    const require = createRequire(import.meta.url);
    await page.addScriptTag({ content: readFileSync(require.resolve("axe-core/axe.min.js"), "utf8") });
    const res = await page.evaluate(async () =>
      // eslint-disable-next-line no-undef
      axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] })
    );
    axe = res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(" ")) }));
  }
  console.log(JSON.stringify({ url: page.url(), out, width, height, horizontalOverflowPx: overflow, consoleErrors: errors.slice(0, 10), ...(axe ? { axe } : {}) }));
} finally {
  await browser.close();
}
