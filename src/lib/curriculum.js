// ============================================================================
// Al-Jazira — Educational Curriculum & Resources (Academic Year 1447H)
// ----------------------------------------------------------------------------
// Pure data + resolvers. Fetches NOTHING. Each resource carries a `key` that
// resolves to YOUR OWN hosted file via /api/content/fetch (local public store
// or your remote store). See scripts/README.md for importing real PDFs.
//
// Model:  stage → (grade | grade→track) → subject → term → resource
//   • TERMS: two terms only (الأول، الثاني) + "كامل العام" filter.
//   • Each subject declares which terms it runs in (`terms`); resources are
//     generated only for those terms — subjects are NOT forced into both.
//   • Resource types are ALWAYS exactly three, in this order:
//        كتاب الطالب → كتاب النشاط → نماذج اختبارات
// ============================================================================

export const ACADEMIC_YEAR = "1447هـ";
const YEAR_KEY = "1447";
const ORD = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"];

// --- terms (exactly two) ---------------------------------------------------
export const TERMS = [
  { id: "t1", name: "الفصل الدراسي الأول", short: "الأول" },
  { id: "t2", name: "الفصل الدراسي الثاني", short: "الثاني" },
];
export const TERM_FILTERS = [{ id: "all", name: "كامل العام", short: "كامل العام" }, ...TERMS];
export const termName = (id) => TERMS.find((t) => t.id === id)?.name || "";

// --- resource types (exactly three, fixed order) ---------------------------
const DOC_TYPES = [
  { suffix: "student", title: "كتاب الطالب", kind: "textbook", file: "student-book.pdf" },
  { suffix: "activity", title: "كتاب النشاط", kind: "workbook", file: "activity-book.pdf" },
  { suffix: "exams", title: "نماذج اختبارات", kind: "exam", file: "exams.pdf" },
];

// Build a subject's resources: for each term it runs in, the 3 types in order.
function subjectResources(path, subjectId, terms) {
  const base = `${path}/${subjectId}`;
  const out = [];
  for (const t of TERMS) {
    if (!terms.includes(t.id)) continue;
    DOC_TYPES.forEach((d, i) => {
      out.push({
        id: `${subjectId}-${t.id}-${d.suffix}`,
        title: d.title,
        kind: d.kind,
        order: i, // 0=student, 1=activity, 2=exams — UI sorts on this
        term: t.id,
        termName: t.name,
        key: `${base}/${t.id}/${d.file}`,
      });
    });
  }
  return out;
}

// subject tuple: [id, name, icon, color, terms?]   terms defaults to BOTH.
// Pass ["t1"] or ["t2"] for subjects that run in only one term.
const mk = (path, list) =>
  list.map(([id, name, icon, color, terms = ["t1", "t2"]]) => ({
    id,
    name,
    icon,
    color,
    terms,
    resources: subjectResources(path, id, terms),
  }));

// ---------------------------------------------------------------------------
// Subject sets per stage. Most core subjects run BOTH terms (realistic for the
// Saudi plan); a few single-term examples below demonstrate the per-term model
// (the `terms` field). Confirm exact per-term availability against the official
// source and edit `terms` here — the UI updates automatically.
// ---------------------------------------------------------------------------
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
    ["critical", "التفكير الناقد", "critical", "#8B5C9E", ["t1"]], // example: term 1 only
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
  ]);

const HS_SHARIA = (p) =>
  mk(p, [
    ["tafsir", "التفسير", "quran", "#7C9A6A"],
    ["hadith", "الحديث", "hadith", "#5E8C7B"],
    ["fiqh", "الفقه", "law", "#A6643B"],
    ["tawhid", "التوحيد", "tawhid", "#C9A227"],
    ["arabic", "الدراسات الأدبية", "arabic", "#C97B3B"],
    ["english", "اللغة الإنجليزية", "english", "#6A6AC9"],
  ]);

const HS_BUSINESS = (p) =>
  mk(p, [
    ["business", "إدارة الأعمال", "business", "#C97B3B"],
    ["finance", "المالية", "finance", "#3BA67B"],
    ["law", "القانون", "law", "#A6643B"],
    ["math", "الرياضيات", "math", "#C9A227"],
    ["english", "اللغة الإنجليزية", "english", "#6A6AC9"],
    ["digital", "التقنية الرقمية", "digital", "#4B5563"],
  ]);

const HS_CS = (p) =>
  mk(p, [
    ["cs", "علوم الحاسب", "cs", "#4B5563"],
    ["math", "الرياضيات", "math", "#C9A227"],
    ["physics", "الفيزياء", "physics", "#3B82A6"],
    ["engineering", "الهندسة", "engineering", "#A6643B"],
    ["english", "اللغة الإنجليزية", "english", "#6A6AC9"],
    ["capstone", "مشروع التخرج", "engineering", "#8B5C9E", ["t2"]], // example: term 2 only
  ]);

const HS_HEALTH = (p) =>
  mk(p, [
    ["biology", "الأحياء", "biology", "#7C9A6A"],
    ["chemistry", "الكيمياء", "chemistry", "#3BA67B"],
    ["health", "الصحة واللياقة", "health", "#C9485E"],
    ["physics", "الفيزياء", "physics", "#3B82A6"],
    ["math", "الرياضيات", "math", "#C9A227"],
    ["english", "اللغة الإنجليزية", "english", "#6A6AC9"],
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

// --- grade-leaf builder (elementary / middle / continuing) -----------------
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

// --- high-school tracks (shared by ثاني/ثالث ثانوي) ------------------------
const HS_TRACKS = (gradeKey, color) => [
  { id: "general", name: "المسار العام", icon: "critical", color: "#6A6AC9", subjects: HS_GENERAL(`${gradeKey}/general`) },
  { id: "sharia", name: "المسار الشرعي", icon: "quran", color: "#7C9A6A", subjects: HS_SHARIA(`${gradeKey}/sharia`) },
  { id: "business", name: "مسار إدارة الأعمال", icon: "business", color: "#A6643B", subjects: HS_BUSINESS(`${gradeKey}/business`) },
  { id: "cs-eng", name: "مسار علوم الحاسب والهندسة", icon: "cs", color: "#4B5563", subjects: HS_CS(`${gradeKey}/cs-eng`) },
  { id: "health", name: "مسار الصحة والحياة", icon: "health", color: "#C9485E", subjects: HS_HEALTH(`${gradeKey}/health`) },
];

// ============================================================================
// The tree.  branch node → `children`.  leaf node → `subjects`.
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
    sub: "اختر الصف ثم المسار",
    icon: "physics",
    color: "#C97B3B",
    children: [
      {
        id: "grade-1",
        name: "أول ثانوي",
        sub: "السنة الأولى المشتركة",
        icon: "grade",
        color: "#C97B3B",
        children: [
          { id: "first-year", name: "السنة الأولى المشتركة", icon: "grade", color: "#C97B3B", subjects: HS_COMMON(`${YEAR_KEY}/high-school/grade-1/first-year`) },
        ],
      },
      {
        id: "grade-2",
        name: "ثاني ثانوي",
        sub: "خمسة مسارات تخصّصية",
        icon: "grade",
        color: "#C97B3B",
        children: HS_TRACKS(`${YEAR_KEY}/high-school/grade-2`),
      },
      {
        id: "grade-3",
        name: "ثالث ثانوي",
        sub: "خمسة مسارات تخصّصية",
        icon: "grade",
        color: "#C97B3B",
        children: HS_TRACKS(`${YEAR_KEY}/high-school/grade-3`),
      },
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

// Walk a slug array → { node, trail } or null.
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

// Flat list of every resource (importer + tooling).
export function allResources() {
  const out = [];
  const visit = (nodes, trail) => {
    for (const n of nodes) {
      const t = [...trail, n.name];
      for (const s of n.subjects || []) {
        for (const r of s.resources || []) {
          out.push({ ...r, subjectId: s.id, subjectName: s.name, path: t.join(" › ") });
        }
      }
      if (n.children) visit(n.children, t);
    }
  };
  visit(CURRICULUM, []);
  return out;
}

// Allow-list lookup used by the content API (confirms a key belongs to the
// catalog) and returns the resource (for its title in the pending fallback).
export function findResourceByKey(key) {
  let found = null;
  const visit = (nodes) => {
    for (const n of nodes) {
      if (found) return;
      for (const s of n.subjects || []) {
        for (const r of s.resources || []) {
          if (r.key === key) { found = { ...r, subjectName: s.name }; return; }
        }
      }
      if (n.children) visit(n.children);
    }
  };
  visit(CURRICULUM);
  return found;
}
