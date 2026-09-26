// Owned by the stages feature. Keep keys identical in ar/stages.js and en/stages.js.
//
// Counts shown as figures (grades, subjects, terms, tracks) are NEVER typed
// here — they are computed from the curriculum catalog (src/lib/curriculum.js)
// and interpolated. Textbooks are official MoE books reached through Madrasati
// (not hosted), sample exams have no authorised source yet, and the term split
// of subjects is unpublished — so copy never promises files or a per-term order.
const stages = {
  shared: {
    year: "{year} AH curriculum",
    factsLabel: "This stage at a glance",
    // Nouns shown under a large number, so they agree with the count.
    facts: {
      grades: { zero: "grades", one: "grade", other: "grades" },
      // High school counts years (Year 1–3), matching the curriculum library.
      years: { zero: "years", one: "year", other: "years" },
      subjects: { zero: "subjects", one: "subject", other: "subjects" },
      terms: { zero: "terms a year", one: "term a year", other: "terms a year" },
      tracks: { zero: "specialised tracks", one: "specialised track", other: "specialised tracks" },
      commonSubjects: { zero: "subjects in the common year", one: "subject in the common year", other: "subjects in the common year" },
    },
    tracksCount: { zero: "No tracks", one: "{count} track", other: "{count} tracks" },
    moreSubjects: "+{count}",
    resourcesNote: "Each subject page shows its official resources and how to open them on Madrasati.",
    signInRequired: "Sign-in required",
    empty: {
      title: "No grades in this stage yet",
      body: "We're adding this stage's subjects. In the meantime, browse the other stages in the curriculum library.",
      cta: "Open the curriculum library",
    },
    tools: {
      curriculum: { title: "Curriculum library", body: "Every stage, grade and track as the official study plan sets them out, with how to reach each subject's books." },
      exams: { title: "Exam center", body: "Timed Qudurat and Tahsili practice tests, with an answer review after you submit." },
      assistant: { title: "Jazira Assistant", body: "Ask for a clear explanation of a lesson you're stuck on, or a revision plan that fits your time." },
      community: { title: "Learning community", body: "Ask classmates, share what you've learned and follow discussions by subject." },
      achievements: { title: "Achievements", body: "Your study streak and the badges you earn by keeping at it." },
    },
  },

  elementary: {
    hero: {
      eyebrow: "Elementary · Grades 1 to 6",
      title: "A confident start in reading, writing and maths",
      lead: "Subjects for all six grades as the official study plan sets them out — plus short games where your child practises writing Arabic letters and reading words aloud.",
      primary: "Choose a grade",
      secondary: "Try the learning games",
    },
    grades: {
      eyebrow: "Grades",
      title: "Choose your grade",
      lead: "Open a grade to see its subjects and their official resources.",
      all: "All elementary resources",
      groups: {
        early: "Early grades",
        upper: "Upper grades",
      },
      names: {
        g1: "Grade 1",
        g2: "Grade 2",
        g3: "Grade 3",
        g4: "Grade 4",
        g5: "Grade 5",
        g6: "Grade 6",
      },
    },
    subjects: {
      eyebrow: "Subjects",
      title: "What your child learns at this stage",
      lead: "Subjects that build the basics step by step, from counting and reading to observing and experimenting.",
      items: {
        math: { title: "Mathematics", body: "Counting, shapes and the four operations, then fractions and measurement in the upper grades." },
        science: { title: "Science", body: "Discovering living things, materials and energy around us, through simple experiments and curious questions." },
      },
      index: {
        title: "All subjects at this stage",
        note: "Choose your grade to reach each subject's official resources.",
      },
    },
    games: {
      eyebrow: "Learning games",
      title: "Practise through play",
      lead: "Two short activities for the early grades: writing Arabic letters on a drawing pad, and reading words aloud.",
      tabsLabel: "Choose a game",
      tabs: {
        write: "Letter writing",
        read: "Reading challenge",
      },
      loading: "Loading the game…",
      howTo: {
        title: "How to play",
        write: "Pick a letter, trace it over the faint guide with a finger or the mouse, then press “Done”.",
        read: "Listen to the word, then press the microphone button and read it clearly.",
      },
      mic: "The reading challenge uses your browser's speech recognition and may ask for microphone access the first time.",
      parents: {
        title: "For parents",
        body: "A short session every day works better than one long session at the weekend. Sit with your child for the first few times.",
      },
    },
    more: {
      eyebrow: "Keep learning",
      title: "Tools that help beyond the textbook",
      examsBody: "For when your child reaches high school: timed Qudurat and Tahsili practice.",
    },
    tips: {
      title: "Tips for parents",
      items: [
        "Set a short, regular study time every day.",
        "Read aloud together, then ask what your child understood.",
        "Use the activity book after each lesson to reinforce the skill.",
        "Celebrate small wins — that's what builds confidence.",
      ],
    },
  },

  middle: {
    hero: {
      eyebrow: "Middle school · Grades 1 to 3",
      title: "Organised study that paves the way to high school",
      lead: "All three grades as the official study plan sets them out, a clear way to organise your week, and practice that gets you used to exam-style questions before you need it.",
      primary: "Choose a grade",
      secondary: "Exam center",
    },
    grades: {
      eyebrow: "Grades",
      title: "Choose your grade",
      lead: "Open a grade to see its subjects and their official resources.",
      all: "All middle-school resources",
      names: {
        g1: "Grade 1",
        g2: "Grade 2",
        g3: "Grade 3",
      },
    },
    subjects: {
      eyebrow: "Subjects",
      title: "Subjects that build scientific thinking",
      lead: "Middle-school maths and science are the foundation for everything you'll study in high school, so give them your attention now.",
      partOfScience: "Part of Science",
      items: {
        math: { title: "Mathematics", body: "Algebra, geometry, statistics and probability, with step-by-step problem solving." },
        science: { title: "Science", body: "One subject that brings together life and earth science, physics and chemistry." },
        physics: { title: "Physics", body: "Forces, motion, energy, electricity and magnetism." },
        chemistry: { title: "Chemistry", body: "Matter and its properties, reactions and solutions." },
      },
      index: {
        title: "All subjects at this stage",
        note: "Choose your grade to reach each subject's official resources.",
      },
    },
    plan: {
      eyebrow: "Study plan",
      title: "Organise your study week",
      lead: "Middle school is the right time to build a steady study habit. Four simple steps are enough to get started.",
      steps: [
        { title: "Spread subjects across the week", body: "Two or three subjects a day, plus a short review of what you covered." },
        { title: "Student book first, then activities", body: "Understand the lesson first, then reinforce it with the activity book exercises." },
        { title: "Practise against the clock early", body: "Answer review questions in a set time before exam week, as if you were in the hall." },
        { title: "Write down your mistakes", body: "A small mistakes notebook cuts your revision time." },
      ],
      assistant: {
        title: "Plan with Jazira Assistant",
        body: "Ask for a revision plan that fits your timetable and subjects, or a clear explanation of a lesson you're stuck on.",
        cta: "Open the assistant",
      },
    },
    practice: {
      eyebrow: "Practice & progress",
      title: "Practise and track your progress",
      next: "Next stage: high school",
    },
  },

  highSchool: {
    hero: {
      eyebrow: "High school · Tracks system",
      title: "A common first year, then a track that fits your goals",
      lead: "You start with a common first year, then choose one of five tracks for years 2 and 3. This is also where you prepare for the Qudurat and Tahsili exams.",
      primary: "Explore the tracks",
      secondary: "Exam center",
    },
    journey: {
      eyebrow: "Your high-school journey",
      title: "Three years, step by step",
      lead: "Open any year to reach its subjects and their official resources.",
      all: "All high-school resources",
      grades: {
        g1: { name: "Year 1", tag: "Common first year", body: "Shared subjects for every student, laying the ground for choosing a track." },
        g2: { name: "Year 2", tag: "Your track begins", body: "You start studying the subjects of your chosen track." },
        g3: { name: "Year 3", tag: "Final year", body: "You complete your track and prepare for Qudurat, Tahsili and university admission." },
      },
    },
    tracks: {
      eyebrow: "Tracks",
      title: "Explore the five tracks",
      lead: "Each track has its own subjects and the university majors it leads to most naturally. Compare them before you choose.",
      listLabel: "Specialised tracks",
      subjectsTitle: "Track subjects in year 2",
      fitsTitle: "A good fit if you're considering",
      grade2: "Year 2 subjects",
      grade3: "Year 3 subjects",
      items: {
        general: { name: "General track", short: "General", body: "Combines maths and the natural sciences with humanities such as history, keeping a wide range of university options open.", fits: "A broad range of majors, if you haven't settled on one yet" },
        sharia: { name: "Sharia track", short: "Sharia", body: "For students drawn to Islamic sciences and Arabic, covering the Quran, qira'at, tafsir, hadith, tawhid and fiqh.", fits: "Sharia, Islamic studies and Arabic" },
        business: { name: "Business administration track", short: "Business", body: "For students interested in management and economics, with subjects such as introduction to business, economics and financial management, then law in the final year.", fits: "Business, accounting and economics" },
        "cs-eng": { name: "Computer science & engineering track", short: "CS & engineering", body: "For students into technology and engineering, with a focus on maths and physics, subjects such as data science and the Internet of Things, then AI and cybersecurity in the final year.", fits: "Computer science, engineering and IT" },
        health: { name: "Health & life track", short: "Health & life", body: "For students aiming at health careers, with a focus on biology, chemistry and the principles of health sciences, then healthcare in the final year.", fits: "Medicine, nursing and the health sciences" },
      },
    },
    tahsili: {
      eyebrow: "Tahsili subjects",
      title: "The science subjects Tahsili covers",
      lead: "Tahsili tests what you've learned in high-school maths, physics, chemistry and biology. Review each subject as you study it, then practise it in the exam center.",
      cta: "Practise for Tahsili",
      items: {
        math: { title: "Mathematics", body: "Functions, geometry and statistics, plus differential and integral calculus." },
        physics: { title: "Physics", body: "Motion, forces, energy, waves and electricity." },
        chemistry: { title: "Chemistry", body: "Matter, reactions, chemical bonding and organic chemistry." },
        biology: { title: "Biology", body: "Cells, genetics, body systems and ecology." },
      },
    },
    exams: {
      eyebrow: "Exam preparation",
      title: "Qudurat and Tahsili in one place",
      lead: "Timed practice tests where you choose the sections and number of questions, then review your answers after submitting to see where to focus.",
      all: "Open the exam center",
      aptitude: { title: "Qudurat (General Aptitude)", body: "The verbal and quantitative sections, in timed practice sessions.", cta: "Start Qudurat practice" },
      achievement: { title: "Tahsili (Achievement)", body: "Maths, physics, chemistry and biology, with explanations that help you understand your mistakes.", cta: "Start Tahsili practice" },
    },
    tips: {
      title: "Tips for high school",
      items: [
        "Choose your track based on your interests and likely major, not on your friends' choices.",
        "Start Qudurat practice early, even in short timed sessions.",
        "Review Tahsili subjects every term instead of leaving them for the final year.",
        "Go through your mistakes after every practice test — it's the quickest way to improve.",
      ],
    },
    more: {
      eyebrow: "Tools that help",
      title: "You're not on your own at this stage",
    },
  },

  // Learning games (client islands on /elementary)
  games: {
    writing: {
      prompt: "Write this letter",
      position: "Letter {current} of {total}",
      pickLetter: "Choose a letter",
      letter: "Letter {letter}",
      pad: "Writing pad: write the letter {letter}",
      colorsLabel: "Pen colour",
      colors: {
        ink: "Dark brown",
        gold: "Gold",
        green: "Green",
        coral: "Coral",
        blue: "Blue",
      },
      size: "Pen size",
      eraser: "Eraser",
      clear: "Clear",
      save: "Save image",
      done: "Done",
      success: "Well done! That's a lovely {letter}.",
      next: "Next letter",
      fileName: "jazira-letter-{n}",
    },
    reading: {
      score: "Score",
      progress: "Word {current} of {total}",
      wordLabel: "Read this word",
      instruction: "Press the microphone, then read the word clearly.",
      listen: "Listen",
      speak: "Read aloud",
      listening: "Listening…",
      next: "New word",
      correct: "Great reading — that's right!",
      wrong: "Almost! Try again.",
      heard: "I heard: “{heard}”",
      noSpeech: "I didn't hear anything. Move closer to the microphone and try again.",
      micBlocked: "Allow microphone access in your browser so we can check your reading.",
      unsupported: "Your browser doesn't support speech recognition. You can still listen to each word and practise reading it, or open the challenge in a recent version of Chrome, Edge or Safari.",
      words: {
        sun: "Sun",
        moon: "Moon",
        sea: "Sea",
        book: "Book",
        rose: "Rose",
        star: "Star",
        clouds: "Clouds",
        mountain: "Mountain",
      },
    },
  },
};

export default stages;
