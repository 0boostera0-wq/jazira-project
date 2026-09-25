#!/usr/bin/env node
// Visual QA screenshots with the locally installed Chrome (puppeteer-core).
//
//   node scripts/shot.mjs <url-or-path> <out.png> [--w=390] [--h=844] [--full] [--dark] [--wait=1500]
//   node scripts/shot.mjs /en/exams C:/tmp/exams.png --w=1440 --h=900 --full
//
// Paths are resolved against JZ_BASE (default http://localhost:3100). Reports
// horizontal overflow (document wider than the viewport) and console errors,
// which are both release blockers.
import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => {
  const [k, v] = a.slice(2).split("=");
  return [k, v ?? true];
}));
const [target, out] = args.filter((a) => !a.startsWith("--"));
if (!target || !out) {
  console.error("usage: node scripts/shot.mjs <url|path> <out.png> [--w=390] [--h=844] [--full] [--dark] [--wait=1500]");
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
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, Number(flags.wait || 1500)));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: Boolean(flags.full) });
  console.log(JSON.stringify({ url: page.url(), out, width, height, horizontalOverflowPx: overflow, consoleErrors: errors.slice(0, 10) }));
} finally {
  await browser.close();
}
