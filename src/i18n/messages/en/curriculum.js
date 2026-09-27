// Owned by the curriculum feature. Keep keys identical in ar/curriculum.js and en/curriculum.js.
// Catalog content (stage, grade, track and subject names) comes from src/lib/curriculum.js.
const curriculum = {
  year: "School year {year} AH",
  root: "Curriculum",

  // Page descriptions (override meta.pages.* so they never claim a per-term split).
  seo: {
    hub: "Browse school subjects by stage, grade and track as the official {year} AH study plan lists them, with their official sources — from elementary to high school.",
    node: "{name}: subjects as listed in the official {year} AH study plan, with their official sources and ways to study them on Jazira.",
    pending: "{name} isn't in Jazira's library yet; we'll add it once its plan is checked against official sources.",
  },

  count: {
    subjects: { zero: "No subjects", one: "{count} subject", other: "{count} subjects" },
    grades: { zero: "No grades", one: "{count} grade", other: "{count} grades" },
    tracks: { zero: "No tracks", one: "{count} track", other: "{count} tracks" },
    periods: { zero: "No periods", one: "{count} period", other: "{count} periods" },
    results: { zero: "No results", one: "{count} result", other: "{count} results" },
  },

  facts: {
    label: "Figures from the official study plan",
    stages: { zero: "school stages", one: "school stage", other: "school stages" },
    grades: { zero: "grades", one: "grade", other: "grades" },
    tracks: { zero: "high-school tracks", one: "high-school track", other: "high-school tracks" },
    subjects: { zero: "subjects in the plan", one: "subject in the plan", other: "subjects in the plan" },
    terms: { zero: "terms a year", one: "term a year", other: "terms a year" },
  },

  hub: {
    eyebrow: "Curriculum library",
    title: "Your curriculum, as the official plan sets it out",
    lead: "See the subjects for your grade or track in the {year} AH school year, open their books on the official platform, then study them with Jazira through practice, the assistant and the community.",
    stages: {
      eyebrow: "School stages",
      title: "Pick a stage, then a grade",
      lead: "Every grade lists its subjects exactly as the official plan does, with their resources and how to reach them.",
      grades: "Grades",
      items: {
        elementary: {
          range: "Grades 1–6",
          body: "Early grades 1 to 3 and upper grades 4 to 6. Social studies and digital skills start in grade 4.",
        },
        middle: {
          range: "Grades 1–3",
          body: "The same subjects run through all three grades, with critical thinking added in grade 3.",
        },
        "high-school": {
          range: "A common year, then five tracks",
          body: "Everyone takes the common first year, then chooses one of five tracks for years 2 and 3 — and each year has its own subjects.",
          common: "Common first year",
          track: "Track",
        },
      },
    },
    value: {
      eyebrow: "What Jazira adds",
      title: "From the textbook to mastery",
      lead: "The books live on their official platform; we help you understand and revise them.",
      practice: { title: "Practise in the exam centre", body: "Timed Qudurat and Tahsili practice with an explanation for every question." },
      assistant: { title: "Ask the Jazira Assistant", body: "Get a lesson explained, a summary, or review questions for any subject." },
      community: { title: "Study with others", body: "Ask questions and share notes with students taking the same subjects." },
    },
    other: {
      title: "Programmes with their own plans",
      lead: "These aren't in the library yet — we'll add them once we've checked their plans against official sources.",
      badge: "Not added yet",
      items: {
        continuing: "A separate plan for adult learners.",
        special: "Programmes and individual plans for students with disabilities.",
        tahfeez: {
          name: "Quran memorisation schools",
          body: "The same subjects with more Quran periods, plus a Tajweed subject from grade 4.",
        },
      },
    },
    sources: {
      eyebrow: "Transparency",
      title: "Where this data comes from",
      lead: "The library is built on official sources only, and we say clearly what we have and haven't been able to verify.",
      verified: "Verified",
      partial: "Partly verified",
      plan: {
        title: "The official study plan",
        body: "Subject lists, official names and annual periods for every grade and track come from the Study Plans Guide (5th edition), issued by the National Curriculum Center and published on the Ministry of Education website.",
        link: "Study Plans Guide (PDF)",
      },
      terms: {
        title: "Two terms",
        body: "The Council of Ministers approved two terms for general-education schools from 1447/1448 AH. The plan sets periods for the whole year without splitting them by term, so every subject appears in both terms — your school's actual split may differ.",
        link: "Ministry announcement",
      },
      books: {
        title: "Official textbooks",
        body: "The Ministry of Education provides digital textbooks through the Muqarrarati service on the Madrasati platform, which needs an active school account. We don't republish the books because no permission to do so exists; we point you to the official source instead.",
        link: "About the Muqarrarati service",
      },
      checked: "Sources last checked: {date}",
    },
  },

  finder: {
    label: "Search the curriculum",
    placeholder: "Search for a subject, grade or track",
    clear: "Clear search",
    filterLabel: "Filter by stage",
    filters: { all: "All", elementary: "Elementary", middle: "Middle", "high-school": "High school" },
    hint: "Type at least two letters. Search covers every grade, track and subject.",
    examplesLabel: "Try:",
    examples: ["Physics", "Grade 4", "Sharia track", "Artificial Intelligence"],
    loading: "Preparing the index…",
    error: "Couldn't load the index.",
    retry: "Try again",
    groups: { nodes: "Grades & tracks", subjects: "Subjects" },
    noneTitle: "No matching results",
    noneBody: "Try a shorter word, or choose “All” to include every stage.",
    showMore: "Show more",
  },

  node: {
    stageEyebrow: "School stage",
    leads: {
      elementary: "Six years that build the foundations of reading, maths and science. Choose your grade to see its subjects and official resources.",
      middle: "Three years that deepen the core subjects. Choose your grade to see its subjects and official resources.",
      "high-school": "A common first year, then one of five tracks for years 2 and 3. Choose your year and track to see the subjects.",
    },
    grades: { title: "Grades", lead: "Each card shows how many subjects the grade has and which ones are new." },
    newIn: "New this grade",
    sameAsPrev: "The same subjects and periods as the previous grade.",
    samePeriodsDiffer: "The same subjects as the previous grade; some have a different number of periods.",
    matrix: {
      title: "Subjects across the grades",
      lead: "Periods per year for each subject (the maximum), as printed in the official plan.",
      subject: "Subject",
      notTaught: "Not taught in this grade",
    },
    hs: {
      yearOne: { title: "Common first year", body: "Every student in the stage takes it before choosing a track.", open: "Year 1 subjects" },
      tracks: { title: "Tracks in years 2 and 3", lead: "Each year of a track has its own subjects." },
      shared: { title: "Subjects shared by all five tracks", empty: "No subject is shared by all five tracks this year." },
      more: { zero: "", one: "and 1 more", other: "and {count} more" },
    },
  },

  branch: {
    lead: "Choose your track to see its subjects for this year, exactly as the official plan lists them.",
    tracksTitle: "Tracks",
    distinctive: "Beyond the shared subjects",
    sharedFact: { zero: "subjects shared by every track", one: "subject shared by every track", other: "subjects shared by every track" },
  },

  leaf: {
    lead: "{subjects} in the official study plan. Choose a subject to see its official resources and how to study it on Jazira.",
    subjectsLabel: "Subjects",
  },

  switch: {
    grade: "Grade",
    year: "Year",
    track: "Track",
    grades: { g1: "1", g2: "2", g3: "3", g4: "4", g5: "5", g6: "6" },
    tracks: {
      "first-year": "Common",
      general: "General",
      sharia: "Sharia",
      business: "Business",
      "cs-eng": "CS & Engineering",
      health: "Health & Life",
    },
  },

  terms: {
    label: "Term",
    all: "Both terms",
    t1: "Term 1",
    t2: "Term 2",
    note: "The official plan sets periods for the whole year without splitting them by term, so subjects appear in both terms — your school's actual split may differ.",
    noteKnown: {
      verified: "Each subject's term is stated in its official books.",
      inferred: "Each subject's term is inferred from official listings, not stated in the books — your school's actual split may differ.",
    },
    count: "{subjects} in {term}",
  },

  subject: {
    open: "{name} details",
    periods: { zero: "No periods", one: "{count} period a year", other: "{count} periods a year" },
    periodsLabel: "Periods a year",
    periodsHint: "Maximum in the plan",
    planLabel: "Name in the plan",
    officialName: "Official name",
    termsLabel: "Terms",
    termsValue: "Terms 1 and 2",
    termsHint: "Split not published",
    termsKnown: { verified: "Stated in the official books", inferred: "Inferred from official listings" },
    resourcesTitle: "Official resources",
    studyTitle: "Study it with Jazira",
  },

  resources: {
    types: {
      student_book: { title: "Student book", body: "Available digitally through Muqarrarati on Madrasati." },
      activity_book: { title: "Activity book", body: "Where the subject has one, it's on the same official platform." },
      exam_samples: { title: "Sample exams", body: "We don't have an authorised official source for sample exams yet." },
    },
    availability: { external_official: "On the official platform", maybe: "On the official platform, if published", hosted: "Available on Jazira", unavailable: "Not available" },
    maybeBody: "If the subject has a book, it's available through Muqarrarati on Madrasati.",
    scope: { all: "For both terms", t1: "For Term 1", t2: "For Term 2" },
    view: "View {term}",
    hostedBody: "A copy hosted on Jazira with documented permission from the rights holder.",
    caveat: "We couldn't see the book listing on the official platform, so not every subject or term may have an activity book.",
  },

  channels: {
    title: "Official textbooks",
    body: "The Ministry of Education provides digital copies of the textbooks through the Muqarrarati service on Madrasati.",
    steps: [
      "Sign in to Madrasati with your school account.",
      "Open Muqarrarati and find your subject.",
      "Come back to Jazira to practise, ask the assistant and discuss with classmates.",
    ],
    madrasati: "Open Madrasati",
    maqarrarati: "About the Muqarrarati service",
    ien: "iEN portal (alternative)",
    account: "You need an active school account on Madrasati.",
    noDeepLinks: "Madrasati doesn't publish direct links to individual books; the iEN portal does. Jazira links to them and never republishes them.",
    newTab: "Opens in a new tab",
  },

  plan: {
    title: "About this grade's plan",
    hsTitle: "About the study plan",
    stageTitle: "About this stage's plan",
    source: "Source",
    guide: "Study Plans Guide, 5th edition",
    pages: { zero: "", one: "page {pages}", other: "pages {pages}" },
    total: "Total subject periods",
    terms: "Terms",
    termsValue: "Two; the split of subjects between them isn't published",
    termsValueKnown: {
      verified: "Two; each subject's term is stated in its official books",
      inferred: "Two; each subject's term is inferred from official listings",
    },
    checked: "Last checked",
    tahfeez: "Quran memorisation schools follow a closely related plan with more Quran periods; it isn't in the library yet.",
    open: "Open the guide (PDF)",
  },

  practice: {
    title: "Practise in the exam centre",
    sub: "{exam} · {section}",
    exams: { aptitude: "Qudurat", achievement: "Tahsili" },
    sections: {
      quantitative: "Quantitative",
      verbal: "Verbal",
      math: "Mathematics",
      physics: "Physics",
      chemistry: "Chemistry",
      biology: "Biology",
    },
  },
  assistant: {
    title: "Ask the Jazira Assistant",
    body: "A lesson explained, a summary or review questions.",
    signIn: "Requires sign-in",
    topic: "{subject} — {context}",
  },
  community: { title: "Discuss it in the community", body: "Posts tagged {tag}" },

  // Outline layer in the subject drawer (units, lessons, quizzes, iEN files).
  outline: {
    title: "Units and lessons",
    lead: "As the official iEN portal lists them. Open a lesson for its book pages and practice.",
    open: "Open the lessons page",
    more: { zero: "", one: "Show {count} more unit", other: "Show all {count} units" },
    loading: "Loading units and lessons…",
    error: "Units and lessons couldn't be loaded.",
    errorBody: "Check your connection and try again. The subject's plan and official links below are still available.",
  },
  ien: {
    title: "The books on iEN",
    lead: "Each file opens on the official iEN portal in a new tab.",
    loading: "Loading the books…",
  },

  notes: {
    islamicCombined: "The official plan has one combined subject for the Holy Quran and Islamic studies.",
    tilawa: "In grades 5 and 6 it includes a Quran recitation and Tajweed course.",
    arabicTitle: "The plan calls the subject “Arabic Language”; the printed book title may differ.",
    noTextbook: "This subject may not have a printed textbook; we couldn't confirm either way.",
    levelsInOrder: "Taught at two levels during the year, with level 1 before level 2.",
    afterLaw: "Taught after Principles of Law during the year.",
    electiveOptions: {
      title: "Elective field options",
      inPerson: "In person",
      selfPaced: "Self-paced e-learning",
    },
  },

  pending: {
    eyebrow: "Programme with its own plan",
    title: "This programme's plan isn't in the library yet",
    body: "{name} follows a separate study plan that we haven't yet verified against official sources, so we don't list subjects for it rather than risk inaccurate information.",
    official: "For the programme's courses and books, check with your school or the Ministry of Education's official channels.",
    back: "Back to the curriculum",
    explore: {
      title: "Stages in the library",
      lead: "Their plans are checked against official sources.",
    },
  },

  viewer: {
    label: "File viewer",
    loading: "Loading the file…",
    error: "Couldn't load the file. It may not be available right now.",
    retry: "Try again",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    reset: "Actual size",
    download: "Download",
    close: "Close viewer",
  },

  empty: {
    title: "No subjects here yet",
    body: "We found no subjects for this section in the official plan. Choose another grade or track.",
    cta: "Back to the curriculum",
  },
};

export default curriculum;
