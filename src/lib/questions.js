// Simulated question bank for اختبارات القدرات والتحصيلي.
// In production this would come from a secured backend / database.
// Each question: { id, section, category, text, options[], answerIndex, explanation }

export const QUESTION_BANK = [
  // ===== القدرات - لفظي (Verbal) =====
  {
    id: "v1",
    section: "qudurat",
    category: "لفظي - تناظر لفظي",
    text: "الكتاب : المكتبة، فإن اللوحة : ......",
    options: ["المتحف", "الرسام", "الإطار", "الجدار"],
    answerIndex: 0,
    explanation: "الكتاب يُحفظ في المكتبة كما تُحفظ اللوحة في المتحف.",
  },
  {
    id: "v2",
    section: "qudurat",
    category: "لفظي - إكمال الجمل",
    text: "لم يكن النجاح ......، بل ثمرة جهدٍ ومثابرة.",
    options: ["وليدَ الصدفة", "أمرًا حتميًا", "بعيدَ المنال", "سهلَ المراس"],
    answerIndex: 0,
    explanation: "السياق ينفي العشوائية ويثبت الجهد، فالأنسب «وليد الصدفة».",
  },
  {
    id: "v3",
    section: "qudurat",
    category: "لفظي - الخطأ السياقي",
    text: "اختر الكلمة التي لا تنتمي للمجموعة:",
    options: ["فرح", "سرور", "بهجة", "حزن"],
    answerIndex: 3,
    explanation: "جميع الكلمات تدل على السعادة عدا «حزن».",
  },
  {
    id: "v4",
    section: "qudurat",
    category: "لفظي - المعنى",
    text: "معنى كلمة «الوَجل» هو:",
    options: ["الفرح", "الخوف", "الكِبر", "الكسل"],
    answerIndex: 1,
    explanation: "الوَجل في اللغة هو الخوف والفزع.",
  },
  {
    id: "v5",
    section: "qudurat",
    category: "لفظي - تناظر لفظي",
    text: "طبيب : مستشفى، فإن معلّم : ......",
    options: ["كتاب", "مدرسة", "طالب", "سبورة"],
    answerIndex: 1,
    explanation: "مكان عمل الطبيب المستشفى كما أن مكان عمل المعلّم المدرسة.",
  },

  // ===== القدرات - كمي (Quantitative) =====
  {
    id: "q1",
    section: "qudurat",
    category: "كمي - حساب",
    text: "إذا كان ٣ × س = ٢١، فما قيمة س؟",
    options: ["٥", "٦", "٧", "٨"],
    answerIndex: 2,
    explanation: "٢١ ÷ ٣ = ٧.",
  },
  {
    id: "q2",
    section: "qudurat",
    category: "كمي - نِسب",
    text: "ما هي ٢٥٪ من ٢٠٠؟",
    options: ["٢٥", "٤٠", "٥٠", "٧٥"],
    answerIndex: 2,
    explanation: "٢٥٪ = ربع، وربع ٢٠٠ = ٥٠.",
  },
  {
    id: "q3",
    section: "qudurat",
    category: "كمي - متتابعات",
    text: "أكمل المتتابعة: ٢، ٤، ٨، ١٦، ......",
    options: ["٢٠", "٢٤", "٣٠", "٣٢"],
    answerIndex: 3,
    explanation: "كل حدّ ضِعف ما قبله، فالتالي ١٦ × ٢ = ٣٢.",
  },
  {
    id: "q4",
    section: "qudurat",
    category: "كمي - هندسة",
    text: "مجموع زوايا المثلث الداخلية يساوي:",
    options: ["٩٠°", "١٨٠°", "٢٧٠°", "٣٦٠°"],
    answerIndex: 1,
    explanation: "مجموع زوايا أي مثلث = ١٨٠ درجة.",
  },
  {
    id: "q5",
    section: "qudurat",
    category: "كمي - معادلات",
    text: "إذا كان س + ٥ = ١٢، فإن س =",
    options: ["٥", "٦", "٧", "٨"],
    answerIndex: 2,
    explanation: "س = ١٢ − ٥ = ٧.",
  },
  {
    id: "q6",
    section: "qudurat",
    category: "كمي - متوسطات",
    text: "ما متوسط الأعداد: ٤، ٨، ١٢؟",
    options: ["٦", "٨", "١٠", "١٢"],
    answerIndex: 1,
    explanation: "(٤+٨+١٢) ÷ ٣ = ٢٤ ÷ ٣ = ٨.",
  },

  // ===== التحصيلي =====
  {
    id: "t1",
    section: "tahsili",
    category: "تحصيلي - أحياء",
    text: "الوحدة الأساسية في بناء الكائنات الحية هي:",
    options: ["الذرة", "الخلية", "النواة", "النسيج"],
    answerIndex: 1,
    explanation: "الخلية هي الوحدة البنائية والوظيفية للكائن الحي.",
  },
  {
    id: "t2",
    section: "tahsili",
    category: "تحصيلي - كيمياء",
    text: "الرمز الكيميائي للماء هو:",
    options: ["CO₂", "O₂", "H₂O", "NaCl"],
    answerIndex: 2,
    explanation: "الماء يتكوّن من ذرتي هيدروجين وذرة أكسجين: H₂O.",
  },
  {
    id: "t3",
    section: "tahsili",
    category: "تحصيلي - فيزياء",
    text: "وحدة قياس القوة في النظام الدولي هي:",
    options: ["الجول", "النيوتن", "الواط", "الأمبير"],
    answerIndex: 1,
    explanation: "تُقاس القوة بوحدة النيوتن (N).",
  },
  {
    id: "t4",
    section: "tahsili",
    category: "تحصيلي - رياضيات",
    text: "قيمة جا (٣٠°) تساوي:",
    options: ["٠", "١/٢", "١", "√٣/٢"],
    answerIndex: 1,
    explanation: "جا ٣٠° = ٠٫٥ = ١/٢.",
  },
  {
    id: "t5",
    section: "tahsili",
    category: "تحصيلي - فيزياء",
    text: "سرعة الضوء في الفراغ تقارب:",
    options: ["٣٠٠ كم/ث", "٣٠٠٠٠٠ كم/ث", "١٥٠٠ م/ث", "٣٤٠ م/ث"],
    answerIndex: 1,
    explanation: "سرعة الضوء ≈ ٣٠٠٬٠٠٠ كم/ث.",
  },
  {
    id: "t6",
    section: "tahsili",
    category: "تحصيلي - كيمياء",
    text: "العدد الذري لعنصر الكربون هو:",
    options: ["٤", "٦", "٨", "١٢"],
    answerIndex: 1,
    explanation: "العدد الذري للكربون ٦ (عدد البروتونات).",
  },
];

// Fisher–Yates shuffle — returns a new array (used to randomize order & options).
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a randomized test. Questions AND their option order are shuffled each
 * time to deter cheating / memorizing positions.
 * @param {("qudurat"|"tahsili"|"all")} section
 * @param {number} count
 */
export function generateTest(section = "qudurat", count = 10) {
  const pool =
    section === "all"
      ? QUESTION_BANK
      : QUESTION_BANK.filter((q) => q.section === section);

  const picked = shuffle(pool).slice(0, Math.min(count, pool.length));

  return picked.map((q) => {
    const correct = q.options[q.answerIndex];
    const options = shuffle(q.options);
    return {
      id: q.id,
      category: q.category,
      text: q.text,
      options,
      answerIndex: options.indexOf(correct),
      explanation: q.explanation,
    };
  });
}
