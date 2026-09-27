// ============================================================================
// Data-quality dashboard (docs/CONTENT_ENGINE.md §8 `reports/quality.html`, WP10).
//
//   renderQualityHtml(model) → one self-contained HTML string
//
// Inline CSS and JS only, the data embedded as JSON, no external request of
// any kind (no fonts, scripts, images or links to other origins). Arabic
// (RTL) by default with an English (LTR) toggle; light and dark themes follow
// the system and can be toggled. Tables are rendered statically (readable
// without JS) and sortable with JS. Every number comes from the report model.
// ============================================================================

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
/** JSON safe inside <script type="application/json"> (no "</script>", no U+2028/2029). */
export const scriptJson = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

export const LABELS = Object.freeze({
  title: ["لوحة جودة المحتوى", "Content data quality"],
  generated: ["تاريخ التوليد", "Generated"],
  manifest: ["بصمة البيان", "Manifest sha"],
  manifest_status: ["حالة البيان", "Manifest status"],
  lang: ["English", "العربية"],
  theme: ["تبديل المظهر", "Toggle theme"],
  totals: ["الإجماليات", "Totals"],
  sources: ["المصادر", "Sources"],
  pdfs: ["ملفات PDF", "PDFs"],
  pages_processed: ["الصفحات المعالجة", "Pages processed"],
  lessons: ["الدروس", "Lessons"],
  candidates: ["الأسئلة المرشحة", "Candidates"],
  validated: ["المتحقق منها", "Validated"],
  rejected: ["المرفوضة", "Rejected"],
  exact_duplicates: ["مكررات مطابقة", "Exact duplicates"],
  near_duplicates: ["مكررات متقاربة", "Near duplicates"],
  review_required: ["تحتاج مراجعة", "Review required"],
  canonical: ["الأسئلة الأصلية المنشورة", "Canonical"],
  published: ["المنشورة", "Published"],
  variants: ["المتغيرات", "Variants"],
  exam_templates: ["قوالب الاختبارات", "Exam templates"],
  templates_defined: ["قوالب معرفة", "defined"],
  pairs_offered: ["أزواج قالب × نطاق متاحة", "template × scope pairs offered"],
  text: ["نص", "text"],
  vision: ["رؤية", "vision"],
  front_matter_only: ["منها صفحات تمهيدية فقط", "of which front-matter only"],
  verified: ["موثقة", "verified"],
  needs_review: ["تحتاج مراجعة", "needs review"],
  breakdown: ["التفصيل", "Breakdown"],
  stage: ["حسب المرحلة", "By stage"],
  grade: ["حسب الصف", "By grade"],
  term: ["حسب الفصل الدراسي", "By term"],
  subject: ["حسب المادة", "By subject"],
  chapter: ["حسب الوحدة أو الفصل", "By unit / chapter"],
  key: ["المعرف", "Id"],
  name: ["الاسم", "Name"],
  rules: ["قواعد العد", "Counting rules"],
  sort: ["رتب حسب", "Sort by"],
  none: ["لا شيء", "none"],
});

const t = (key) => {
  const [ar, en] = LABELS[key] ?? [key, key];
  return `<span class="t" data-ar="${escapeHtml(ar)}" data-en="${escapeHtml(en)}">${escapeHtml(ar)}</span>`;
};
const num = (v) => (v === null || v === undefined ? "—" : escapeHtml(String(v)));
const kv = (obj) => Object.entries(obj ?? {}).map(([k, v]) => `${escapeHtml(k)}: ${num(v)}`).join(" · ");

const CSS = `
:root{--bg:#f7f5f0;--surface:#fff;--text:#1d2320;--muted:#5d6661;--line:#dcd8cf;--accent:#136f63;--accent-2:#e3f1ee}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#121614;--surface:#1b201d;--text:#e9eeeb;--muted:#a3ada7;--line:#303833;--accent:#5cc4b3;--accent-2:#1f3531}}
:root[data-theme="dark"]{--bg:#121614;--surface:#1b201d;--text:#e9eeeb;--muted:#a3ada7;--line:#303833;--accent:#5cc4b3;--accent-2:#1f3531}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px 48px}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:20px}
h1{font-size:1.5rem;margin:0}
h2{font-size:1.15rem;margin:28px 0 12px}
.meta{color:var(--muted);font-size:.85rem;margin-top:4px;word-break:break-all}
.actions{display:flex;gap:8px}
button{font:inherit;cursor:pointer;border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:8px;padding:6px 12px}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.card .v{font-size:1.6rem;font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums}
.card .l{color:var(--muted);font-size:.85rem}
.card .d{color:var(--muted);font-size:.78rem;margin-top:4px}
.table-wrap{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:start;white-space:nowrap}
td.n,th.n{text-align:end}
th button{border:0;background:none;padding:0;font-weight:600;color:var(--text)}
th[aria-sort="ascending"] button::after{content:" ▲"}
th[aria-sort="descending"] button::after{content:" ▼"}
tbody tr:hover{background:var(--accent-2)}
code{font-size:.85em}
ol{padding-inline-start:20px;color:var(--muted);overflow-wrap:anywhere}
`;

const JS = `
(function(){
  var root=document.documentElement;
  function setLang(lang){
    root.lang=lang;root.dir=lang==="ar"?"rtl":"ltr";
    var els=document.querySelectorAll(".t");
    for(var i=0;i<els.length;i++){els[i].textContent=els[i].getAttribute("data-"+lang);}
    try{localStorage.setItem("jz-report-lang",lang);}catch(e){}
  }
  function setTheme(theme){
    root.setAttribute("data-theme",theme);
    try{localStorage.setItem("jz-report-theme",theme);}catch(e){}
  }
  var saved=null,theme=null;
  try{saved=localStorage.getItem("jz-report-lang");theme=localStorage.getItem("jz-report-theme");}catch(e){}
  if(saved==="en"||saved==="ar")setLang(saved);
  if(theme==="dark"||theme==="light")root.setAttribute("data-theme",theme);
  document.getElementById("toggle-lang").addEventListener("click",function(){setLang(root.lang==="ar"?"en":"ar");});
  document.getElementById("toggle-theme").addEventListener("click",function(){
    var cur=root.getAttribute("data-theme")||(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");
    setTheme(cur==="dark"?"light":"dark");
  });
  var tables=document.querySelectorAll("table[data-sortable]");
  for(var i=0;i<tables.length;i++){(function(table){
    var heads=table.querySelectorAll("th");
    for(var c=0;c<heads.length;c++){(function(th,col){
      var b=th.querySelector("button");if(!b)return;
      b.addEventListener("click",function(){
        var dir=th.getAttribute("aria-sort")==="ascending"?"descending":"ascending";
        for(var k=0;k<heads.length;k++)heads[k].removeAttribute("aria-sort");
        th.setAttribute("aria-sort",dir);
        var body=table.tBodies[0],rows=Array.prototype.slice.call(body.rows);
        rows.sort(function(x,y){
          var a=x.cells[col].getAttribute("data-v"),z=y.cells[col].getAttribute("data-v");
          var na=Number(a),nz=Number(z),r;
          if(a!==""&&z!==""&&!isNaN(na)&&!isNaN(nz))r=na-nz;else r=a<z?-1:a>z?1:0;
          return dir==="ascending"?r:-r;
        });
        for(var k=0;k<rows.length;k++)body.appendChild(rows[k]);
      });
    })(heads[c],c);}
  })(tables[i]);}
})();
`;

function card(labelKey, value, detail = "") {
  return `<div class="card"><div class="v">${num(value)}</div><div class="l">${t(labelKey)}</div>${detail ? `<div class="d">${detail}</div>` : ""}</div>`;
}

function breakdownTable(dim, rows, columns) {
  const head = [`<th scope="col"><button type="button">${t("key")}</button></th>`, `<th scope="col"><button type="button">${t("name")}</button></th>`]
    .concat(columns.map((c) => `<th scope="col" class="n"><button type="button">${t(c)}</button></th>`))
    .join("");
  const body = rows
    .map((r) => {
      const ar = r.title_ar ?? "";
      const en = r.title_en ?? r.title_ar ?? "";
      const cells = [
        `<td data-v="${escapeHtml(r.key)}"><code dir="ltr">${escapeHtml(r.key)}</code></td>`,
        `<td data-v="${escapeHtml(ar)}" dir="auto"><span class="t" data-ar="${escapeHtml(ar)}" data-en="${escapeHtml(en)}">${escapeHtml(ar)}</span></td>`,
        ...columns.map((c) => `<td class="n" data-v="${num(r[c])}">${num(r[c])}</td>`),
      ];
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("\n");
  return `<section aria-labelledby="h-${dim}"><h2 id="h-${dim}">${t(dim)}</h2><div class="table-wrap"><table data-sortable><thead><tr>${head}</tr></thead><tbody>\n${body}\n</tbody></table></div></section>`;
}

/**
 * @param {object} model  buildReportModel() result (uses meta and quality)
 * @returns {string}
 */
export function renderQualityHtml(model) {
  const { meta, quality } = model;
  const q = quality.totals;
  const pages = q.pages_processed;
  const cards = [
    card("sources", q.sources),
    card("pdfs", q.pdfs.total, `${kv(q.pdfs.by_availability)}<br>${kv(q.pdfs.by_extraction)}`),
    card("pages_processed", pages.total, `${t("text")}: ${num(pages.text)} · ${t("vision")}: ${num(pages.vision)}<br>${t("front_matter_only")}: ${num(pages.front_matter_only)}`),
    card("lessons", q.lessons.total, `${t("verified")}: ${num(q.lessons.verified)} · ${t("needs_review")}: ${num(q.lessons.needs_review)}`),
    card("candidates", q.candidates),
    card("validated", q.validated),
    card("rejected", q.rejected),
    card("exact_duplicates", q.exact_duplicates),
    card("near_duplicates", q.near_duplicates),
    card("review_required", q.review_required),
    card("canonical", q.canonical),
    card("published", q.published),
    card("variants", q.variants),
    card("exam_templates", q.exam_templates.defined, `${t("templates_defined")} · ${t("pairs_offered")}: ${num(q.exam_templates.template_scope_pairs_offered)}`),
  ].join("\n");
  const sections = Object.keys(quality.breakdowns).map((dim) => breakdownTable(dim, quality.breakdowns[dim], quality.columns)).join("\n");
  const rules = meta.counting_rules.map((r) => `<li>${escapeHtml(r)}</li>`).join("");
  // the breakdown rows are embedded once, in the tables (data-v cells); the JSON block carries meta and totals
  const data = { meta: { generated_at: meta.generated_at, manifest_sha256: meta.manifest_sha256, manifest_status: meta.manifest_status, counting_rules: meta.counting_rules }, totals: q, columns: quality.columns };
  return `<!doctype html>
<html lang="ar" dir="rtl" data-generated="${escapeHtml(meta.generated_at)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>Jazira data quality</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header>
<div>
<h1>${t("title")}</h1>
<div class="meta">${t("generated")}: <span dir="ltr">${escapeHtml(meta.generated_at)}</span> · ${t("manifest")}: <code dir="ltr">${escapeHtml(meta.manifest_sha256 ?? "—")}</code> · ${t("manifest_status")}: <code dir="ltr">${escapeHtml(meta.manifest_status)}</code></div>
</div>
<div class="actions"><button type="button" id="toggle-lang">${t("lang")}</button><button type="button" id="toggle-theme">${t("theme")}</button></div>
</header>
<section aria-labelledby="h-totals"><h2 id="h-totals">${t("totals")}</h2><div class="cards">
${cards}
</div></section>
${sections}
<section aria-labelledby="h-rules"><h2 id="h-rules">${t("rules")}</h2><ol dir="ltr">${rules}</ol></section>
</main>
<script type="application/json" id="report-data">${scriptJson(data)}</script>
<script>${JS}</script>
</body>
</html>
`;
}
