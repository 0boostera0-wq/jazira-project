#!/usr/bin/env node
// Visual + accessibility QA with the locally installed Chrome (puppeteer-core).
//
//   node scripts/shot.mjs <url-or-path> <out.png> [--w=390] [--h=844] [--full] [--dark]
//                         [--wait=1500] [--auth] [--axe]
//
// --full   full-page capture (scrolls through the page first so lazy images load);
//          a page that fits the viewport is captured as the viewport (Chrome's
//          beyond-viewport capture shifts RTL pages sideways)
// --dark   dark theme
// --auth   sets a dummy Supabase auth cookie so the middleware's protected-route
//          gate lets the page render (the app still treats you as signed out —
//          use it for shells, guards and signed-out/expired states)
// --axe    runs axe-core (WCAG 2.2 A/AA) and prints violations. On Arabic pages
//          axe skips most text for color-contrast (its icon-ligature heuristic
//          mistakes joined Arabic letters for icon fonts), so a computed
//          contrast scan (foreground vs. alpha-blended background) runs there
//          and reports as { id: "color-contrast", source: "jz-contrast-scan" }.
//
// Paths resolve against JZ_BASE (default http://localhost:3100). Prints JSON:
//   horizontalOverflowPx  must be 0. Measured against the REQUESTED width: the
//                         layout viewport growing past it (mobile emulation
//                         zooms out instead of scrolling), the document's
//                         scroll width, and any element sticking out of
//                         [0, width] that no ancestor below <body> clips
//                         (body's `overflow-x: clip` hides the scrollbar, not
//                         the bug). `overflow` has the parts + worst elements.
//   consoleErrors         must be empty.
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

// ── in-page probes (serialised into the page; no closures) ─────────────────
function measureOverflow(w) {
  const pathOf = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.body && parts.length < 3; n = n.parentElement) {
      const cls = typeof n.className === "string" ? n.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
      parts.unshift(n.tagName.toLowerCase() + (n.id ? `#${n.id}` : "") + cls.map((c) => `.${c.replace(/[^\w-]/g, "\\$&")}`).join(""));
    }
    return parts.join(" > ");
  };
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      if (/(hidden|clip|auto|scroll)/.test(getComputedStyle(p).overflowX)) return true;
    }
    return false;
  };
  const layoutViewportPx = Math.max(0, Math.round(window.innerWidth - w));
  const documentPx = Math.max(0, document.documentElement.scrollWidth - w, document.body.scrollWidth - w);
  // Pin the root to the requested width while scanning: when mobile emulation
  // has widened the layout viewport, every block is wide; pinned, only the
  // elements that really don't fit stick out of the root box.
  const html = document.documentElement;
  const saved = html.getAttribute("style");
  html.style.width = `${w}px`;
  html.style.maxWidth = `${w}px`;
  const box = html.getBoundingClientRect();
  const offenders = [];
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    const px = Math.round(Math.max(r.right - box.right, box.left - r.left));
    if (px <= 1) continue;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) continue;
    if (clipped(el)) continue;
    offenders.push({ el, px, depth: pathOf(el).split(">").length });
  }
  if (saved === null) html.removeAttribute("style");
  else html.setAttribute("style", saved);
  // worst first; among equals the innermost (closest to the cause)
  offenders.sort((a, b) => b.px - a.px || b.depth - a.depth);
  const shown = [];
  for (const o of offenders) {
    if (shown.some((x) => x.el.contains(o.el) || o.el.contains(x.el))) continue;
    shown.push(o);
    if (shown.length === 5) break;
  }
  const elementPx = offenders.length ? offenders[0].px : 0;
  return {
    horizontalOverflowPx: Math.max(layoutViewportPx, documentPx, elementPx),
    overflow: {
      layoutViewportPx,
      documentPx,
      elementPx,
      visualScale: window.visualViewport ? Number(window.visualViewport.scale.toFixed(3)) : 1,
      elements: shown.map((o) => ({ selector: pathOf(o.el), px: o.px })),
    },
  };
}

function contrastScan() {
  const parse = (c) => {
    const m = /^rgba?\(([^)]+)\)$/.exec(c || "");
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.some((x) => Number.isNaN(x))) return null;
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const over = (top, bottom) => {
    const a = top[3] + bottom[3] * (1 - top[3]);
    if (!a) return [0, 0, 0, 0];
    const ch = (i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
    return [ch(0), ch(1), ch(2), a];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const pathOf = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.body && parts.length < 3; n = n.parentElement) {
      const cls = typeof n.className === "string" ? n.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
      parts.unshift(n.tagName.toLowerCase() + cls.map((c) => `.${c.replace(/[^\w-]/g, "\\$&")}`).join(""));
    }
    return parts.join(" > ");
  };
  const root = parse(getComputedStyle(document.documentElement).backgroundColor);
  const canvas = root && root[3] > 0 ? over(root, [255, 255, 255, 1]) : [255, 255, 255, 1];
  const failures = [];
  let checked = 0;
  let skipped = 0;
  for (const el of document.body.querySelectorAll("*")) {
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join("").trim();
    if (!text) continue;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none") continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1 || r.bottom < 0 || r.right < 0 || r.left > window.innerWidth) continue;
    if (el.closest("[disabled],[aria-disabled='true'],[inert]")) continue;
    // background: composite the ancestors' colours; an image / gradient → can't tell
    const layers = [];
    let opacity = 1;
    let unknown = false;
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      opacity *= Number(cs.opacity) || 1;
      if (cs.backgroundImage && cs.backgroundImage !== "none") { unknown = true; break; }
      const bg = parse(cs.backgroundColor);
      if (bg && bg[3] > 0) layers.push(bg);
      if (bg && bg[3] >= 1) break;
    }
    const fg0 = parse(s.color);
    if (unknown || !fg0) { skipped++; continue; }
    let bg = canvas;
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * opacity], bg);
    const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    const ratio = (l1 + 0.05) / (l2 + 0.05);
    const size = parseFloat(s.fontSize) || 16;
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    checked++;
    if (ratio + 0.005 < need) {
      failures.push({ node: pathOf(el), text: text.slice(0, 40), ratio: Number(ratio.toFixed(2)), required: need });
    }
  }
  return { checked, skipped, failures };
}

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
  let fits = true;
  if (flags.full) {
    // Walk the page so IntersectionObserver / loading="lazy" content renders.
    fits = await page.evaluate(async () => {
      const step = Math.max(200, window.innerHeight * 0.8);
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
      return document.documentElement.scrollHeight <= window.innerHeight + 1;
    });
    await new Promise((r) => setTimeout(r, 600));
  }
  const overflow = await page.evaluate(measureOverflow, width);
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: Boolean(flags.full) && !fits });

  let axe;
  let contrast;
  if (flags.axe) {
    const require = createRequire(import.meta.url);
    await page.addScriptTag({ content: readFileSync(require.resolve("axe-core/axe.min.js"), "utf8") });
    const res = await page.evaluate(async () =>
      // eslint-disable-next-line no-undef
      axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] })
    );
    axe = res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(" ")) }));
    const arabic = await page.evaluate(() => /^ar\b/i.test(document.documentElement.lang || ""));
    if (arabic) {
      contrast = await page.evaluate(contrastScan);
      if (contrast.failures.length) {
        axe.push({
          id: "color-contrast",
          impact: "serious",
          source: "jz-contrast-scan",
          help: "Elements must meet minimum color contrast ratio thresholds (computed scan)",
          count: contrast.failures.length,
          nodes: contrast.failures.slice(0, 6).map((f) => `${f.node} "${f.text}" ${f.ratio}:1 < ${f.required}:1`),
        });
      }
    }
  }
  console.log(JSON.stringify({
    url: page.url(), out, width, height, ...overflow, consoleErrors: errors.slice(0, 10),
    ...(axe ? { axe } : {}), ...(contrast ? { contrastScan: { checked: contrast.checked, skipped: contrast.skipped } } : {}),
  }));
} finally {
  await browser.close();
}
