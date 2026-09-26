// Owned by the landing feature. Keep keys identical in ar/landing.js and en/landing.js.
//
// Numbers that come from the product (limits, prices, presets) are NEVER typed
// here — they are interpolated from src/lib/constants.js and
// src/lib/exams/catalog.js so the homepage can't drift from the real rules.
const landing = {
  units: {
    questions: { one: "{count} question", other: "{count} questions" },
    minutes: { one: "{count} minute", other: "{count} minutes" },
    messages: { one: "{count} message", other: "{count} messages" },
    hours: { one: "hour", other: "{count} hours" },
    attempts: { one: "{count} attempt", other: "{count} attempts" },
  },

  hero: {
    eyebrow: "Curriculum · Qudurat & Tahsili · Assistant · Community",
    eyebrowShort: "Curriculum · Qudurat & Tahsili · Assistant",
    title: "Everything you need to study,",
    titleAccent: "on one island.",
    lead: "An organised curriculum for every grade, timed Qudurat and Tahsili practice, an assistant that explains in Arabic, and a community of students working toward the same goals.",
    primary: "Get started free",
    secondary: "Explore the curriculum",
    trustLabel: "Why Jazira",
    trust: {
      free: "Free to start",
      arabic: "Arabic-first",
      stages: "Elementary to high school",
    },
    chips: {
      quickTitle: "Quick practice",
      quickBody: "{questions} · {minutes}",
      assistantTitle: "Jazira Assistant",
      assistantBody: "Ask me about any lesson",
    },
  },

  stages: {
    eyebrow: "Start where you are",
    title: "Choose your school stage or exam",
    description: "Each stage has its own subjects and resources, and each exam its own sections and practice. Pick a starting point and switch whenever you like.",
    all: "All stages and resources",
    groups: {
      school: "School stages",
      exams: "Exam preparation",
    },
    items: {
      elementary: { title: "Elementary", body: "Subjects for all six grades, plus reading and writing activities.", meta: "6 grades" },
      middle: { title: "Middle school", body: "Resources organised by subject and term.", meta: "3 grades" },
      highSchool: { title: "High school", body: "The common first year, then the specialised tracks.", meta: "3 grades · 5 tracks" },
      aptitude: { title: "Qudurat (General Aptitude)", body: "Timed practice for the verbal and quantitative sections.", meta: "2 sections" },
      achievement: { title: "Tahsili (Achievement)", body: "Math, physics, chemistry and biology in one place.", meta: "4 subjects" },
    },
  },

  curriculum: {
    eyebrow: "Curriculum & resources",
    title: "Your grade's resources, organised the way you study",
    lead: "Every subject in the {year} AH study plan has its own place in the library: pick your stage, grade, subject and term to go straight to it. We add resources to each subject as they become available.",
    path: {
      label: "Your path to any resource",
      stage: "Stage",
      grade: "Grade",
      subject: "Subject",
      term: "Term",
    },
    points: {
      types: { title: "Three resource types", body: "Student book, activity book and sample exams — in the same order in every subject." },
      tracks: { title: "High school, track by track", body: "The common first year, then five specialised tracks in grades 11 and 12." },
      more: { title: "For every learner", body: "Sections for continuing education and special education alongside general education." },
    },
    cta: "Browse the curriculum",
    mock: {
      label: "Illustrative example",
      subject: "Mathematics",
      context: "Middle school, grade 2 · Term 1",
      student: "Student book",
      activity: "Activity book",
      exams: "Sample exams",
    },
  },

  exams: {
    eyebrow: "Qudurat & Tahsili",
    title: "Practise as if you were in the exam hall",
    lead: "Timed tests where you choose the sections and number of questions, then review your answers after submitting to see where to focus next.",
    points: {
      timed: { title: "Exam-like timing", body: "A timer stays in view the whole session, so managing time becomes a habit." },
      sections: { title: "Choose what to practise", body: "The verbal or quantitative section, or any of the four Tahsili subjects." },
      review: { title: "Review after you submit", body: "Your result for each section, and a review of your answers with explanations." },
    },
    cta: "Start a practice test",
    try: "Try it before you sign up",
    guest: "A short test of up to {questions}, graded as soon as you submit.",
    mock: {
      label: "Illustrative interface",
      caption: "Illustrative example of the exam interface: a timer, a multiple-choice question and a question map.",
      exam: "Qudurat · Quantitative",
      progress: "Question {current} of {total}",
      question: "What is 25% of 80?",
      choices: { a: "15", b: "20", c: "25", d: "30" },
      letters: { a: "A", b: "B", c: "C", d: "D" },
      navigator: "Question map",
      legend: { answered: "Answered", current: "Current", pending: "Not answered yet" },
      previous: "Previous",
      next: "Next",
    },
  },

  assistant: {
    eyebrow: "Jazira Assistant",
    title: "Ask whenever you're stuck, and get an explanation at your level",
    lead: "Jazira Assistant walks you through a lesson step by step in Arabic, and helps you understand how to solve a problem rather than copy the answer.",
    points: {
      explain: { title: "Step-by-step explanations", body: "It breaks a problem into clear steps, in simple language." },
      understand: { title: "Understanding, not copying", body: "It guides your thinking and won't help you cheat." },
      plan: { title: "Organised revision", body: "It helps you plan what to review before your exam." },
      guide: { title: "Your guide to the platform", body: "It points you to the right page in the curriculum, exams or community." },
    },
    limit: "On the free plan you get {messages} every {hours}; chat is unlimited on the Elite plan. You need to be signed in to use the assistant.",
    disclaimer: "The assistant can make mistakes, so check important information against your textbook or with your teacher.",
    cta: "Try Jazira Assistant",
    chat: {
      label: "Illustrative chat",
      caption: "Illustrative example of a chat in which Jazira Assistant explains how to work out a percentage.",
      name: "Jazira Assistant",
      question: "How do I work out 25% of 80?",
      answer: "“Percent” means “out of every 100”. Divide 80 by 100 to get 0.8, then multiply by 25 — that gives you 20.",
      suggestion: "Give me a similar problem",
    },
  },

  community: {
    eyebrow: "Learning community",
    title: "You don't have to study alone",
    lead: "Ask questions, share what you've learned and follow classmates with the same goals — in a community with clear guidelines that keep it respectful.",
    points: {
      ask: { title: "Ask and answer", body: "Post your question and get replies from other students." },
      tags: { title: "Subject tags", body: "Follow the discussions that matter to you." },
      follow: { title: "Follow classmates", body: "Build a study circle that keeps you going." },
      photo: { title: "Snap the problem", body: "Attach a photo of the question you're stuck on so classmates can help." },
    },
    cta: "Join the community",
    guidelines: "Community guidelines",
    mock: {
      label: "Illustrative post",
      caption: "Illustrative example of a community post: a question about verbal analogies with tags and a reply from another student.",
      body: "What's the fastest way to solve verbal analogy questions? My exam is in two weeks.",
      tagA: "#Qudurat",
      tagB: "#verbal",
      reply: "State the relationship between the two words in a short sentence, then test it on each choice.",
      like: "Like",
      comment: "Comment",
    },
  },

  progress: {
    eyebrow: "Progress & analytics",
    title: "Know where you stand, and what to review next",
    lead: "Every test you take builds a clearer picture of your level: your results in each section, your study streak and your achievements.",
    cta: "Start and track your progress",
    label: "Illustrative example",
    sections: {
      title: "Your results by section",
      body: "Your result in each section after every test, with detailed weak-spot analysis on the Elite plan.",
      caption: "Illustrative example of a results chart by subject and of scores across recent attempts.",
      math: "Math",
      physics: "Physics",
      chemistry: "Chemistry",
      biology: "Biology",
      trend: "Recent attempts",
    },
    streak: {
      title: "Your study streak",
      body: "Study a little every day and keep your streak alive.",
      days: { sun: "S", mon: "M", tue: "T", wed: "W", thu: "T", fri: "F", sat: "S" },
    },
    achievements: {
      title: "Achievements & badges",
      body: "Badges you earn by keeping at it, and XP that raises your level.",
    },
  },

  plans: {
    eyebrow: "Plans",
    title: "Start free, upgrade when you need to",
    lead: "The free plan is enough to get started and practise regularly. Elite is for intensive practice with no daily limit.",
    compare: "Compare plans in detail",
    free: {
      name: "Free",
      tagline: "Get started and practise regularly",
      priceNote: "No card needed",
      perks: {
        curriculum: "The curriculum library for every stage",
        practice: "Practice tests of up to {questions} each, {attempts} a day",
        assistant: "Jazira Assistant: {messages} every {hours}",
        community: "The learning community and subject discussions",
        progress: "Achievements and your study streak",
      },
      cta: "Create a free account",
    },
    elite: {
      name: "Elite",
      tagline: "For intensive practice before the exam",
      badge: "Most complete",
      period: "/ month",
      perks: {
        questions: "Up to {questions} per test",
        daily: "No daily test limit",
        simulation: "Full simulation: {questions} in {minutes}",
        assistant: "Unlimited chat with Jazira Assistant",
        analytics: "Advanced analytics that pinpoint your weak spots",
        badge: "The Elite badge next to your name in the community",
      },
      cta: "Go Elite",
    },
    facts: {
      label: "About the subscription",
      renewal: { title: "Monthly plan", body: "Renews automatically every month, and you can stop the renewal whenever you like." },
      activation: { title: "Automatic activation", body: "Elite features switch on in your account as soon as payment is confirmed." },
      checkout: { title: "Secure checkout", body: "You pay on a specialist payment provider's page; we never store your card details." },
    },
  },

  privacy: {
    eyebrow: "Privacy & security",
    title: "Learn with peace of mind — your data is yours",
    lead: "We keep your private details out of sight and give you control over what others can see.",
    points: {
      hidden: { title: "Email and phone stay hidden", body: "They never appear on your public profile or in the community." },
      control: { title: "You decide what's visible", body: "Post in the community without showing your name, from your privacy settings." },
      devices: { title: "Your devices at a glance", body: "See the devices signed in to your account and end any session." },
      delete: { title: "Your account, your call", body: "Permanently delete your account and all your data from Settings whenever you want." },
    },
    cta: "Read the privacy policy",
  },

  faq: {
    eyebrow: "FAQ",
    title: "Before you start",
    lead: "Short answers to what you'll want to know before creating an account.",
    all: "All frequently asked questions",
    contact: "Didn't find your answer? Contact us",
    items: {
      free: {
        q: "Is Jazira free?",
        a: "Yes. Creating an account is free and gives you the curriculum library, practice tests, Jazira Assistant and the community within the free plan's limits. Elite is optional, for intensive practice with no daily limit.",
      },
      who: {
        q: "Who is Jazira for?",
        a: "Students in general education from elementary through high school, and students preparing for the Qudurat (General Aptitude) and Tahsili (Achievement) exams.",
      },
      assistant: {
        q: "What does Jazira Assistant do?",
        a: "It explains lessons step by step and helps you understand how to solve problems and organise your revision. On the free plan you get {messages} every {hours}; chat is unlimited on Elite.",
      },
      elite: {
        q: "How much is Elite, and how do I subscribe?",
        a: "Elite costs {price} per month, and you can subscribe from the Plans page. Your plan activates automatically once payment is confirmed.",
      },
    },
  },

  cta: {
    title: "Start where you are, today",
    body: "Create your free account, choose your stage or exam, and take the first step with confidence.",
    primary: "Create a free account",
    secondary: "Explore the curriculum",
  },
};

export default landing;
