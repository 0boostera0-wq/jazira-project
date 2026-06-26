// ============================================================================
// Al-Jazira — Educational Curriculum & Resources (Academic Year 1447H)
// ----------------------------------------------------------------------------
// Pure data + resolvers. This module fetches NOTHING. Each resource carries a
// `key` that resolves to YOUR OWN / licensed content store via CONTENT_BASE_URL
// (see src/app/api/content/fetch/route.js). Replace the generated placeholder
// resources with your actual licensed files (e.g. official MoE / "عين" content,
// or material you own the rights to redistribute).
// ============================================================================

export const ACADEMIC_YEAR = "1447هـ";
const YEAR_KEY = "1447";

const ORD = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"];

// --- terms -----------------------------------------------------------------
// Saudi 1447 system runs on THREE terms. "all" = full year (every term's files).
export const TERMS = [
  { id: "t1", name: "الفصل الدراسي الأول", short: "الأول" },
  { id: "t2", name: "الفصل الدراسي الثاني", short: "الثاني" },
  { id: "t3", name: "الفصل الدراسي الثالث", short: "الثالث" },
];
export const TERM_FILTERS = [{ id: "all", name: "كامل العام", short: "كامل العام" }, ...TERMS];

// --- resources -------------------------------------------------------------
// A standard resource set per subject PER TERM so the catalog + viewer are fully
// wired. `key` is a path under YOUR content namespace; the API route validates
// it and joins it to CONTENT_BASE_URL. Files that don't exist yet simply surface
// a friendly "content not available" state in the viewer — nothing breaks.
function resourcesFor(path, subjectId) {
  const base = `${path}/${subjectId}`;
  const docs = [
    { suffix: "student", title: "كتاب الطالب", kind: "textbook", file: "student-book.pdf" },
    { suffix: "activity", title: "كتاب النشاط", kind: "workbook", file: "activity-book.pdf" },
    { suffix: "exams", title: "نماذج اختبارات", kind: "exam", file: "exams.pdf" },
  ];
  const out = [];
  for (const t of TERMS) {
    for (const d of docs) {
      out.push({
        id: `${subjectId}-${t.id}-${d.suffix}`,
        title: d.title,
        kind: d.kind,
        term: t.id,
        termName: t.name,
        key: `${base}/${t.id}/${d.file}`,
      });
    }
  }
  return out;
}

// --- subject factory -------------------------------------------------------
// tuple shape: [id, name, iconKey, accentHex]  →  full subject w/ resources
const mk = (path, list) =>
  list.map(([id, name, icon, color]) => ({
    id,
    name,
    icon,
    color,
    resources: resourcesFor(path, id),
  }));

// --- subject sets (per stage) ---------------------------------------------
const ELEMENTARY = (p) =>
  mk(p, [
    ["quran", "القرآن الكريم", "quran", "#7C9A6A"],
    ["islamic", "الدراسات الإسلامية", "islamic", "#5E8C7B"],
    ["arabic", "لغتي الجميلة", "arabic", "#C9A227"],
    ["math", "الرياضيات", "math", "#C97B3B"],
    ["science", "العلوم", "science", "#3B82A6"],
    ["social", "الدراسات الاجتماعية", "social", "#A6643B"],
    ["english", "اللغة الإنجليزية", "english", "#6A6AC9"],
    ["digital", "المهارات الرقمية", "digital", "#4B5563"],
    ["art", "التربية الفنية", "art", "#C93B7B"],
    ["pe", "التربية البدنية والصحية", "pe", "#3BA67B"],
  ]);

const MIDDLE = (p) =>
  mk(p, [
    ["quran", "القرآن الكريم", "quran", "#7C9A6A"],
    ["islamic", "الدراسات الإسلامية", "islamic", "#5E8C7B"],
    ["arabic", "اللغة العربية", "arabic", "#C9A227"],
    ["math", "الرياضيات", "math", "#C97B3B"],
    ["science", "العلوم", "science", "#3B82A6"],
    ["social", "الدراسات الاجتماعية", "social", "#A6643B"],
    ["english", "اللغة الإنجليزية", "english", "#6A6AC9"],
    ["digital", "المهارات الرقمية", "digital", "#4B5563"],
    ["art", "التربية الفنية", "art", "#C93B7B"],
    ["pe", "التربية البدنية والدفاع عن النفس", "pe", "#3BA67B"],
    ["life", "المهارات الحياتية والأسرية", "life", "#8B5C9E"],
  ]);

const HS_COMMON = (p) =>
  mk(p, [
    ["quran", "القرآن الكريم", "quran", "#7C9A6A"],
    ["islamic", "الدراسات الإسلامية", "islamic", "#5E8C7B"],
    ["arabic", "الكفايات اللغوية", "arabic", "#C9A227"],
    ["math", "الرياضيات", "math", "#C97B3B"],
    ["physics", "الفيزياء", "physics", "#3B82A6"],
    ["chemistry", "الكيمياء", "chemistry", "#3BA67B"],
    ["biology", "الأحياء", "biology", "#7C9A6A"],
    ["english", "اللغة الإنجليزية", "english", "#6A6AC9"],
    ["social", "الدراسات الاجتماعية", "social", "#A6643B"],
    ["digital", "التقنية الرقمية", "digital", "#4B5563"],
    ["critical", "التفكير الناقد", "critical", "#8B5C9E"],
  ]);

const HS_GENERAL = (p) =>
  mk(p, [
    ["islamic", "الدراسات الإسلامية", "islamic", "#5E8C7B"],
    ["arabic", "اللغة العربية", "arabic", "#C9A227"],
    ["math", "الرياضيات", "math", "#C97B3B"],
    ["physics", "الفيزياء", "physics", "#3B82A6"],
    ["chemistry", "الكيمياء", "chemistry", "#3BA67B"],
    ["biology", "الأحياء", "biology", "#7C9A6A"],
    ["english", "اللغة الإنجليزية", "english", "#6A6AC9"],
    ["social", "الدراسات الاجتماعية", "social", "#A6643B"],
    ["digital", "التقنية الرقمية", "digital", "#4B5563"],
    ["critical", "التفكير الناقد", "critical", "#8B5C9E"],
  ]);

const HS_SHARIA = (p) =>
  mk(p, [
    ["tafsir", "التفسير", "quran", "#7C9A6A"],
    ["hadith", "الحديث", "hadith", "#5E8C7B"],
    ["fiqh", "الفقه", "law", "#A6643B"],
    ["tawhid", "التوحيد", "tawhid", "#C9A227"],
    ["arabic", "الدراسات الأدبية", "arabic", "#C97B3B"],
    ["english", "اللغة الإنجليزية", "english", "#6A6AC9"],
    ["critical", "التفكير الناقد", "critical", "#8B5C9E"],
  ]);

const HS_BUSINESS = (p) =>
  mk(p, [
    ["business", "إدارة الأعمال", "business", "#C97B3B"],
    ["finance", "المالية", "finance", "#3BA67B"],
    ["law", "القانون", "law", "#A6643B"],
    ["math", "الرياضيات", "math", "#C9A227"],
    ["english", "اللغة الإنجليزية", "english", "#6A6AC9"],
    ["digital", "التقنية الرقمية", "digital", "#4B5563"],
    ["social", "علم الاجتماع", "social", "#3B82A6"],
  ]);

const HS_CS = (p) =>
  mk(p, [
    ["cs", "علوم الحاسب", "cs", "#4B5563"],
    ["math", "الرياضيات", "math", "#C9A227"],
    ["physics", "الفيزياء", "physics", "#3B82A6"],
    ["engineering", "الهندسة", "engineering", "#A6643B"],
    ["digital", "التقنية الرقمية", "digital", "#6A6AC9"],
    ["english", "اللغة الإنجليزية", "english", "#3BA67B"],
    ["critical", "التفكير الناقد", "critical", "#8B5C9E"],
  ]);

const HS_HEALTH = (p) =>
  mk(p, [
    ["biology", "الأحياء", "biology", "#7C9A6A"],
    ["chemistry", "الكيمياء", "chemistry", "#3BA67B"],
    ["health", "الصحة واللياقة", "health", "#C9485E"],
    ["physics", "الفيزياء", "physics", "#3B82A6"],
    ["math", "الرياضيات", "math", "#C9A227"],
    ["english", "اللغة الإنجليزية", "english", "#6A6AC9"],
    ["critical", "التفكير الناقد", "critical", "#8B5C9E"],
  ]);

const CONTINUING = (p) =>
  mk(p, [
    ["islamic", "الدراسات الإسلامية", "islamic", "#5E8C7B"],
    ["arabic", "اللغة العربية", "arabic", "#C9A227"],
    ["math", "الرياضيات", "math", "#C97B3B"],
    ["science", "العلوم", "science", "#3B82A6"],
    ["social", "الدراسات الاجتماعية", "social", "#A6643B"],
    ["english", "اللغة الإنجليزية", "english", "#6A6AC9"],
    ["digital", "المهارات الرقمية", "digital", "#4B5563"],
  ]);

const SPECIAL_ELEM = (p) =>
  mk(p, [
    ["quran", "القرآن الكريم", "quran", "#7C9A6A"],
    ["islamic", "الدراسات الإسلامية", "islamic", "#5E8C7B"],
    ["arabic", "التواصل اللغوي", "arabic", "#C9A227"],
    ["math", "المفاهيم الكمية", "math", "#C97B3B"],
    ["science", "العلوم", "science", "#3B82A6"],
    ["life", "المهارات الحياتية", "life", "#8B5C9E"],
  ]);

const SPECIAL_MID = (p) =>
  mk(p, [
    ["islamic", "الدراسات الإسلامية", "islamic", "#5E8C7B"],
    ["arabic", "التواصل اللغوي", "arabic", "#C9A227"],
    ["math", "المفاهيم الكمية", "math", "#C97B3B"],
    ["science", "العلوم", "science", "#3B82A6"],
    ["digital", "المهارات الرقمية", "digital", "#4B5563"],
    ["life", "المهارات الحياتية", "life", "#8B5C9E"],
  ]);

const SPECIAL_REHAB = (p) =>
  mk(p, [
    ["life", "المهارات الحياتية", "life", "#8B5C9E"],
    ["arabic", "التواصل اللغوي", "arabic", "#C9A227"],
    ["math", "المفاهيم الكمية", "math", "#C97B3B"],
    ["pe", "المهارات الحركية", "pe", "#3BA67B"],
    ["digital", "المهارات المهنية", "digital", "#4B5563"],
  ]);

const SPECIAL_GUIDE = (p) =>
  mk(p, [["teacher", "الدليل المرجعي للمعلم", "teacher", "#4B5563"]]);

// --- grade-leaf builder ----------------------------------------------------
function gradeLeaves(stageId, count, subjFn, color) {
  return Array.from({ length: count }, (_, i) => {
    const g = i + 1;
    const id = `grade-${g}`;
    return {
      id,
      name: `الصف ${ORD[g]}`,
      icon: "grade",
      color,
      subjects: subjFn(`${YEAR_KEY}/${stageId}/${id}`),
    };
  });
}

// ============================================================================
// The tree.  branch node → has `children`.  leaf node → has `subjects`.
// ============================================================================
export const CURRICULUM = [
  {
    id: "elementary",
    name: "المرحلة الابتدائية",
    sub: "الصفوف من الأول إلى السادس",
    icon: "islamic",
    color: "#7C9A6A",
    children: gradeLeaves("elementary", 6, ELEMENTARY, "#7C9A6A"),
  },
  {
    id: "middle",
    name: "المرحلة المتوسطة",
    sub: "الصفوف من الأول إلى الثالث",
    icon: "science",
    color: "#3B82A6",
    children: gradeLeaves("middle", 3, MIDDLE, "#3B82A6"),
  },
  {
    id: "high-school",
    name: "الثانوية العامة",
    sub: "السنة الأولى المشتركة + 5 مسارات",
    icon: "physics",
    color: "#C97B3B",
    children: [
      { id: "first-year", name: "السنة الأولى المشتركة", icon: "grade", color: "#C97B3B", subjects: HS_COMMON(`${YEAR_KEY}/high-school/first-year`) },
      { id: "general", name: "المسار العام", icon: "critical", color: "#6A6AC9", subjects: HS_GENERAL(`${YEAR_KEY}/high-school/general`) },
      { id: "sharia", name: "المسار الشرعي", icon: "quran", color: "#7C9A6A", subjects: HS_SHARIA(`${YEAR_KEY}/high-school/sharia`) },
      { id: "business", name: "مسار إدارة الأعمال", icon: "business", color: "#A6643B", subjects: HS_BUSINESS(`${YEAR_KEY}/high-school/business`) },
      { id: "cs-eng", name: "مسار علوم الحاسب والهندسة", icon: "cs", color: "#4B5563", subjects: HS_CS(`${YEAR_KEY}/high-school/cs-eng`) },
      { id: "health", name: "مسار الصحة والحياة", icon: "health", color: "#C9485E", subjects: HS_HEALTH(`${YEAR_KEY}/high-school/health`) },
    ],
  },
  {
    id: "continuing",
    name: "التعليم المستمر",
    sub: "الصفوف من الأول إلى الثالث",
    icon: "social",
    color: "#8B5C9E",
    children: gradeLeaves("continuing", 3, CONTINUING, "#8B5C9E"),
  },
  {
    id: "special",
    name: "التربية الخاصة",
    sub: "ابتدائي، متوسط، التأهيلية، والدليل المرجعي",
    icon: "rehab",
    color: "#3BA67B",
    children: [
      { id: "elementary", name: "التربية الخاصة — ابتدائي", icon: "islamic", color: "#7C9A6A", subjects: SPECIAL_ELEM(`${YEAR_KEY}/special/elementary`) },
      { id: "middle", name: "التربية الخاصة — متوسط", icon: "science", color: "#3B82A6", subjects: SPECIAL_MID(`${YEAR_KEY}/special/middle`) },
      { id: "rehab", name: "البرامج التأهيلية", icon: "rehab", color: "#3BA67B", subjects: SPECIAL_REHAB(`${YEAR_KEY}/special/rehab`) },
      { id: "teacher-guide", name: "الدليل المرجعي للمعلم", icon: "teacher", color: "#4B5563", subjects: SPECIAL_GUIDE(`${YEAR_KEY}/special/teacher-guide`) },
    ],
  },
];

// ============================================================================
// Resolvers
// ============================================================================

// Walk a slug array (e.g. ["high-school","sharia"]) → { node, trail } or null.
export function resolveCurriculum(slug = []) {
  let nodes = CURRICULUM;
  let node = null;
  const trail = [];
  for (const seg of slug) {
    node = (nodes || []).find((n) => n.id === seg) || null;
    if (!node) return null;
    trail.push(node);
    nodes = node.children;
  }
  return { node, trail };
}

// Every branch + leaf path, for generateStaticParams (static/ISR pre-render).
export function allCurriculumPaths() {
  const out = [];
  const walk = (nodes, prefix) => {
    for (const n of nodes) {
      const p = [...prefix, n.id];
      out.push(p);
      if (n.children) walk(n.children, p);
    }
  };
  walk(CURRICULUM, []);
  return out;
}

// Flat lookup of a single resource by its content key (used by the API route to
// confirm a requested key actually belongs to the catalog — allow-list).
export function findResourceByKey(key) {
  let found = null;
  const visit = (nodes) => {
    for (const n of nodes) {
      if (found) return;
      for (const s of n.subjects || []) {
        for (const r of s.resources || []) {
          if (r.key === key) { found = r; return; }
        }
      }
      if (n.children) visit(n.children);
    }
  };
  visit(CURRICULUM);
  return found;
}
