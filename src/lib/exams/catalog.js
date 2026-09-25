// ============================================================================
// Exam catalog — shared vocabulary for the question bank, the database
// (check constraints mirror these slugs), the exam builder UI and analytics.
// Labels live in the `exams` i18n namespace:
//   exams.types.<exam>, exams.sections.<section>, exams.topics.<topic>
// ============================================================================

export const EXAMS = {
  aptitude: {
    // اختبار القدرات العامة (Qiyas GAT)
    slug: "aptitude",
    icon: "Brain",
    illustration: "aptitude.hero",
    sections: ["quantitative", "verbal"],
  },
  achievement: {
    // الاختبار التحصيلي (Qiyas SAAT, science track)
    slug: "achievement",
    icon: "FlaskConical",
    illustration: "achievement.hero",
    sections: ["math", "physics", "chemistry", "biology"],
  },
};

export const SECTIONS = {
  quantitative: {
    exam: "aptitude", icon: "Sigma", color: "#B88C3C", illustration: "aptitude.quantitative",
    topics: ["arithmetic", "fractions-percent", "ratio-proportion", "algebra", "geometry", "statistics", "data-interpretation", "comparison"],
  },
  verbal: {
    exam: "aptitude", icon: "BookOpenText", color: "#4F7A5E", illustration: "aptitude.verbal",
    topics: ["analogy", "sentence-completion", "contextual-error", "odd-word-out", "reading-comprehension"],
  },
  math: {
    exam: "achievement", icon: "Pi", color: "#B88C3C", illustration: "high-school.math",
    topics: ["algebra", "functions", "trigonometry", "geometry", "calculus", "statistics-probability", "sequences", "matrices"],
  },
  physics: {
    exam: "achievement", icon: "Atom", color: "#446A8A", illustration: "high-school.physics",
    topics: ["kinematics", "forces-motion", "energy-work", "electricity", "waves-sound", "optics", "thermodynamics", "modern-physics"],
  },
  chemistry: {
    exam: "achievement", icon: "FlaskConical", color: "#8A5A9E", illustration: "high-school.chemistry",
    topics: ["atomic-structure", "periodic-table", "bonding", "stoichiometry", "solutions", "acids-bases", "thermochemistry", "organic"],
  },
  biology: {
    exam: "achievement", icon: "Dna", color: "#4F7A5E", illustration: "high-school.biology",
    topics: ["cells", "genetics", "human-body", "plants", "ecology", "classification-evolution", "microbiology", "biochemistry"],
  },
};

export const DIFFICULTIES = [1, 2, 3]; // 1 = easy, 2 = medium, 3 = hard  (labels: exams.difficulty.<n>)

// Builder presets and limits (the database RPC enforces the same bounds).
export const LIMITS = {
  minQuestions: 5,
  maxQuestions: 100,
  minMinutes: 1,
  maxMinutes: 240,
  guestMaxQuestions: 10,       // local practice mode for signed-out visitors
  freeMaxQuestions: 25,        // free plan, per attempt
  freeDailyAttempts: 5,        // free plan, attempts per Riyadh day
  defaultSecondsPerQuestion: 60,
};

export const PRESETS = [
  { id: "quick", count: 10, minutes: 10 },
  { id: "standard", count: 25, minutes: 25 },
  { id: "full", count: 50, minutes: 55, premium: true },
];

export const QUESTION_FILES = [
  "aptitude-quantitative",
  "aptitude-verbal",
  "achievement-math",
  "achievement-physics",
  "achievement-chemistry",
  "achievement-biology",
];
