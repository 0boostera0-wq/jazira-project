// Generates a small, valid, branded PDF served when a curriculum file hasn't
// been imported yet — so every resource OPENS a real PDF instead of failing.
// The approved official file replaces it per-key once imported. Latin text only
// (the PDF base-14 fonts don't shape Arabic); shows Jazira branding + the key.

function esc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function pendingPdf(key = "", title = "") {
  const lines = [
    "JAZIRA  PLATFORM",
    "",
    "Curriculum resource" + (title ? "  —  " + translit(title) : ""),
    "",
    "key: " + key,
    "",
    "This document is a placeholder.",
    "The approved official PDF will appear here",
    "automatically once it is imported into your",
    "content store (see scripts/README.md).",
  ];

  let y = 760;
  let content = "BT\n/F1 15 Tf\n0.29 0.25 0.18 rg\n";
  for (const ln of lines) {
    content += `1 0 0 1 64 ${y} Tm (${esc(ln)}) Tj\n`;
    y -= 26;
  }
  content += "ET";

  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>",
    `<</Length ${Buffer.byteLength(content, "latin1")}>>\nstream\n${content}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOff = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += String(off).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefOff}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

// Best-effort transliteration so the placeholder line is readable in Latin fonts.
function translit(s) {
  const map = {
    "كتاب الطالب": "Student Book",
    "كتاب النشاط": "Activity Book",
    "نماذج اختبارات": "Exam Samples",
  };
  return map[s] || "";
}
