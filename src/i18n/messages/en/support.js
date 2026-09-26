// Owned by the support feature: about, support center, FAQ, contact, reviews,
// feedback. Keep keys identical in ar/support.js and en/support.js.
//
// FAQ answers may use {price}, {messages}, {hours}, {guestQuestions},
// {freeQuestions}, {eliteQuestions} and {freeDaily} — filled by faqVars() from
// src/lib/constants.js and src/lib/exams/catalog.js (counts via faq.units) so
// the copy never drifts from what the product enforces. Category membership and links live in
// src/components/support/faqCatalog.js.
const support = {
  shared: {
    external: "Opens in a new tab",
    whatsapp: {
      title: "WhatsApp support",
      body: "For quick questions and following up on an open issue.",
      cta: "Start a chat",
    },
    form: {
      title: "Contact form",
      body: "For detailed requests. We reply to your email address.",
      cta: "Write to us",
    },
    center: {
      title: "Support center",
      body: "Help topics and quick answers to common requests.",
      cta: "Visit the support center",
    },
    faq: {
      title: "FAQ",
      body: "Straight answers about accounts, exams and subscriptions.",
      cta: "Browse the FAQ",
    },
    response: {
      title: "When will we reply?",
      body: "We read every message and reply in the order it arrives. We don't promise a fixed response time.",
    },
  },

  topics: {
    account: { title: "Account & sign-in", desc: "Creating an account, passwords, name and photo, privacy." },
    exams: { title: "Exams", desc: "Qudurat and Tahsili practice, timing, reviewing answers." },
    curriculum: { title: "Curriculum & resources", desc: "Subjects by grade and track, textbooks and sample tests." },
    subscription: { title: "Subscription & payment", desc: "Elite plan, price, payment, cancellation and refunds." },
    assistant: { title: "Jazira Assistant", desc: "What it can do, usage limits, saved conversations." },
    community: { title: "Learning community", desc: "Posting and commenting, posting anonymously, the rules." },
    technical: { title: "Technical issues", desc: "Devices and browsers, language and theme, fixing glitches." },
  },

  about: {
    eyebrow: "About Jazira",
    title: "One organised place to learn, practise and ask",
    lead: "Jazira is an Arabic-first learning platform that supports students from first grade all the way to Qudurat and Tahsili prep: a curriculum organised the way you study it, timed practice with an explanation for every question, a community that has your back, and an assistant for when you get stuck.",
    primaryCta: "Start for free",
    secondaryCta: "Browse the curriculum",
    factsLabel: "Jazira at a glance",
    facts: {
      stages: "Elementary to high school",
      exams: "Qudurat & Tahsili",
      languages: "Arabic & English interface",
      free: "Free to get started",
    },
    mission: {
      eyebrow: "Our mission",
      title: "Make studying clearer, not heavier",
      body: "Most students don't lack effort — they lack structure: scattered resources, practice without review, and questions that go unanswered. We built Jazira to bring all of that into one clear path, so you always know what to study, how to practise and where to find help.",
    },
    approach: {
      structure: { title: "Organised the way you study", body: "Subjects are arranged by stage, grade, track and term, so you reach what you need without digging." },
      practice: { title: "Practise, then understand", body: "Timed sessions that feel like the real thing, followed by a review of every answer with its explanation — so you learn why, not just the score." },
      help: { title: "Help when you need it", body: "Jazira Assistant explains, summarises and plans with you, and the learning community is where you ask and share with classmates." },
    },
    offer: {
      eyebrow: "What Jazira offers",
      title: "Four parts that work together",
      lead: "Each part is useful on its own, but they're designed to connect: study from the curriculum, practise for the exam, and ask when you're stuck.",
      curriculum: {
        title: "Curriculum & resources",
        body: "School subjects from first grade to the final year of high school, including the common first year and the high-school tracks.",
        points: {
          a: "Organised by grade, track and term",
          b: "Student book, activity book and sample tests",
          c: "Browsing the curriculum needs no subscription",
        },
        cta: "Explore the curriculum",
      },
      exams: {
        title: "Qudurat & Tahsili",
        body: "Practise both tests across the same sections and subjects you'll be tested on.",
        sections: {
          aptitude: "Verbal · Quantitative",
          achievement: "Maths · Physics · Chemistry · Biology",
        },
        points: { a: "Timed sessions", b: "An explanation for every question", c: "Performance insights" },
        cta: "Exam center",
      },
      community: {
        title: "Learning community",
        body: "Ask questions, share notes and milestones, and follow classmates and the tags you care about.",
        cta: "Visit the community",
      },
      assistant: {
        title: "Jazira Assistant",
        body: "Explains concepts in plain language, works through problems step by step, and helps you build a study plan.",
        cta: "Try the assistant",
      },
    },
    sourcing: {
      eyebrow: "How we make content",
      title: "Clear about what we offer — and what we don't",
      lead: "We'd rather you know exactly where your study material comes from than overpromise.",
      original: {
        title: "Original practice questions",
        body: "Jazira's exam questions are written for practice in the style and skills of the official tests. They are not copied from the Education & Training Evaluation Commission's exams.",
      },
      structure: {
        title: "Official curriculum structure",
        body: "Subjects follow the structure of the Saudi school curriculum — stages, grades, tracks and terms — and resources are added progressively.",
      },
      numbers: {
        title: "No made-up numbers",
        body: "We don't publish user counts or success rates we can't back up, and every published review was written by a registered user.",
      },
      corrections: {
        title: "We fix what's found",
        body: "Spotted a mistake in a question, an explanation or a resource? Tell us and we'll review and correct it.",
        cta: "Report a mistake",
      },
    },
    values: {
      eyebrow: "What we stand by",
      title: "Values behind every decision",
      lead: "Not slogans on a wall — they're what we come back to when deciding what to build and how.",
      clarity: { title: "Clarity", body: "A calm interface and plain language, without clutter or noise." },
      honesty: { title: "Honesty", body: "Real features and a clear price before you pay, with no inflated promises." },
      time: { title: "Respect for your time", body: "Fast pages and content where you expect it, so you spend time learning, not searching." },
      privacy: { title: "Your privacy", body: "Your email and phone number are never shown to others, and we don't sell your personal data." },
    },
    cta: {
      title: "Start your journey with Jazira today",
      body: "Create a free account to save your progress, and move to Elite whenever you need more.",
      primary: "Create a free account",
      secondary: "Contact us",
    },
  },

  center: {
    eyebrow: "Support center",
    title: "How can we help?",
    lead: "Search the answers or pick a topic. If you can't find what you need, our support team is one message away.",
    search: {
      label: "Search the FAQ",
      placeholder: "e.g. I forgot my password",
      submit: "Search",
      suggestions: "Try:",
      terms: {
        password: "password",
        payment: "payment",
        deleteAccount: "delete account",
        assistant: "assistant",
      },
    },
    topics: {
      eyebrow: "Topics",
      title: "Browse by topic",
      lead: "Each topic takes you straight to its answers in the FAQ.",
      answers: {
        zero: "No answers",
        one: "1 answer",
        other: "{count} answers",
      },
      contactTitle: "Can't find your topic?",
      contactDesc: "Write to us and we'll help you directly.",
      contactCta: "Contact us",
    },
    quick: {
      eyebrow: "Quick answers",
      title: "Start here",
      lead: "Practical answers about accounts, payment, exams and the assistant.",
      all: "All FAQs",
    },
    rail: {
      title: "Talk to our support team",
      body: "Choose the channel that suits your request.",
    },
    tips: {
      title: "Help us help you faster",
      device: "Tell us your device and the browser you're using.",
      steps: "Describe the steps before the problem and what you expected to happen.",
      screenshot: "Copy the exact error message, or send a screenshot on WhatsApp.",
      email: "Write from the email on your account so we can find it quickly.",
      never: "We will never ask for your password — don't share it with anyone.",
    },
    policies: {
      eyebrow: "Policies",
      title: "Policies & guidelines",
      lead: "What we commit to, and what we expect from everyone on the platform.",
    },
  },

  faq: {
    eyebrow: "FAQ",
    title: "Clear answers to the questions we hear most",
    lead: "Answers are grouped by topic. Type a word in the search box to filter them instantly.",
    searchLabel: "Search questions",
    searchPlaceholder: "Search for a question or keyword…",
    clear: "Clear search",
    all: "All topics",
    categoriesLabel: "Topics",
    results: {
      zero: "No results",
      one: "1 result",
      other: "{count} results",
    },
    empty: {
      title: "No questions match “{query}”",
      body: "Try another word or browse the topics — or ask our support team directly.",
      clear: "Clear search",
      contact: "Ask our support team",
    },
    help: {
      title: "Didn't find your answer?",
      body: "Send us your question and we'll get back to you.",
      contact: "Message us",
      whatsapp: "WhatsApp",
    },
    units: {
      questions: { one: "1 question", other: "{count} questions" },
      attempts: { one: "1 attempt", other: "{count} attempts" },
      messages: { one: "1 message", other: "{count} messages" },
      hours: { one: "hour", other: "{count} hours" },
    },
    items: {
      createAccount: {
        q: "How do I create a Jazira account?",
        a: "On the Sign up page, register with your email and a password, or continue with your Google account. You'll then confirm your email and choose a display name — and you're ready to go.",
        link: "Create an account",
      },
      guest: {
        q: "Can I use Jazira without an account?",
        a: "Yes — without signing up you can browse the curriculum and public pages, and try a short practice test of up to {guestQuestions}. Saving your progress and exam results, posting in the community and chatting with Jazira Assistant need a free account.",
      },
      forgotPassword: {
        q: "I forgot my password. What should I do?",
        a: "Choose “Forgot password” on the sign-in page and enter your email; we'll send you a link to set a new password. If you sign in with Google, you don't need a separate Jazira password.",
        link: "Reset your password",
      },
      profile: {
        q: "How do I change my display name or photo?",
        a: "In Settings you can edit your display name and upload a profile photo. Display names are two words in Arabic or English letters and don't have to be unique. There's a waiting period between changes, and it's shorter on Elite.",
        link: "Open settings",
      },
      privacy: {
        q: "Who can see my email address and phone number?",
        a: "No other user. Others only see your display name and photo. In Settings you can also post in the community anonymously or hide your Elite badge.",
        link: "Privacy policy",
      },
      deleteAccount: {
        q: "How do I delete my account?",
        a: "In Settings, choose “Delete account” and confirm. Your account and the data linked to it are permanently deleted — this can't be undone.",
        link: "Open settings",
      },
      whichExams: {
        q: "Which exams can I practise for?",
        a: "The General Aptitude Test (Qudurat) with its verbal and quantitative sections, and the Achievement Test (Tahsili) in its four subjects: maths, physics, chemistry and biology.",
        link: "Exam center",
      },
      questionSource: {
        q: "Are the questions taken from the official Qiyas exams?",
        a: "No. Jazira's questions are original practice questions modelled on the format and skills of the official tests — they are not copied from the Education & Training Evaluation Commission's exams. For official test dates and registration, please use the official channels.",
      },
      timing: {
        q: "Are exams timed, and can I see the correct answers?",
        a: "Yes. Practice sessions are timed so you get used to the pressure, and afterwards you review every question with its correct answer and explanation.",
      },
      freeExams: {
        q: "Are the exams free?",
        a: "Yes, within the free plan's limits: {freeDaily} a day, with up to {freeQuestions} per test. Elite removes the daily limit, raises it to {eliteQuestions} per test and adds advanced performance insights.",
        link: "See Elite benefits",
      },
      curriculumContent: {
        q: "What's in the curriculum section?",
        a: "School subjects organised by stage, grade, track and term, from first grade to the final year of high school. Each subject has its resources: the student book, the activity book and sample tests.",
        link: "Browse the curriculum",
      },
      curriculumOfficial: {
        q: "Does the content follow the official curriculum?",
        a: "Yes — we follow the structure of the Saudi school curriculum: stages, grades, tracks and terms, and we add resources progressively. If you notice a missing resource or a mistake, let us know and we'll review it.",
      },
      curriculumFree: {
        q: "Are curriculum resources free?",
        a: "Yes. Browsing subjects and their resources doesn't require an Elite subscription.",
      },
      elite: {
        q: "What does the Elite plan include?",
        a: "Qudurat and Tahsili practice with no daily limit and up to {eliteQuestions} per test, Jazira Assistant with no message limit, advanced performance insights that highlight your strengths and weak spots, and the Elite badge next to your name in the community.",
        link: "Plan details",
      },
      price: {
        q: "How much does Elite cost?",
        a: "{price} per month. The amount is shown clearly on the checkout page before you confirm your subscription.",
      },
      payment: {
        q: "How does payment work, and is it secure?",
        a: "You pay on a secure checkout page hosted by our payment provider, so your card details never pass through or get stored on Jazira's servers. Elite activates automatically once the payment is confirmed.",
      },
      cancel: {
        q: "Can I cancel my subscription? What about refunds?",
        a: "Yes. Elite renews automatically every month. To stop the renewal, message our support team at any time and we'll turn it off for you. When the subscription ends, your account returns to the free plan and your data and progress are kept. Our refund policy explains when a refund is possible.",
        link: "Refund policy",
      },
      notActivated: {
        q: "I paid but Elite isn't active. What should I do?",
        a: "Reload the page, then sign out and back in. If Elite benefits still don't appear, message us with the “Billing & payment” topic and include the email you used at checkout so we can look into it.",
        link: "Message support",
      },
      assistantAbilities: {
        q: "What can Jazira Assistant do?",
        a: "It explains lessons and concepts in plain language, works through problems step by step, summarises for you, and helps you build a study plan around your goal.",
        link: "Open the assistant",
      },
      assistantLimit: {
        q: "How many free messages can I send the assistant?",
        a: "The free plan includes {messages} every {hours}. On Elite, there's no message limit.",
      },
      assistantAccuracy: {
        q: "Are the assistant's answers always accurate?",
        a: "The assistant aims to be accurate but can make mistakes. Use it to understand and practise, and double-check important information in your textbook or with your teacher.",
      },
      assistantHistory: {
        q: "Are my conversations with the assistant saved?",
        a: "Yes. Your conversations are saved to your account so you can come back to them, and other users can't see them.",
      },
      communityWhat: {
        q: "What is the learning community?",
        a: "A space for students to ask questions and share notes and milestones — with likes, comments, and the option to follow classmates and the tags you care about.",
        link: "Visit the community",
      },
      communityAnonymous: {
        q: "Can I take part without showing my name?",
        a: "Yes. Turn on anonymous posting in Settings and your community posts will appear without your name or photo.",
      },
      communityRules: {
        q: "What are the community rules?",
        a: "We want a respectful, useful community: no abuse, no inappropriate content and no advertising. Please read the community guidelines before posting — content that breaks them may be removed.",
        link: "Community guidelines",
      },
      devices: {
        q: "Which devices does Jazira work on?",
        a: "Jazira runs in the browser on phones, tablets and computers. We recommend the latest version of Chrome, Safari, Edge or Firefox. You can also add Jazira to your phone's home screen from the browser menu.",
      },
      troubleshooting: {
        q: "A page isn't working properly. What should I do?",
        a: "Reload the page, check your internet connection and make sure your browser is up to date, then try a private window. If the problem continues, message us with a description of what happened.",
        link: "Report a problem",
      },
      languageTheme: {
        q: "How do I change the language or switch to dark mode?",
        a: "Use the controls at the top of the page (or in the menu on phones) to switch between Arabic and English, and between light and dark themes — your choice is saved on your device. Some educational content, such as subject names and certain questions, may remain in Arabic.",
      },
    },
  },

  contact: {
    eyebrow: "Contact us",
    title: "Write to the Jazira team",
    lead: "A question about your account, a technical problem, feedback on content or a partnership idea — write to us and we'll read your message carefully.",
    form: {
      title: "Send a message",
      name: "Name",
      namePlaceholder: "What should we call you?",
      email: "Email",
      emailPlaceholder: "name@example.com",
      emailHint: "We'll send our reply to this address.",
      topic: "Topic",
      topicPlaceholder: "Choose a topic",
      message: "Message",
      messagePlaceholder: "Tell us the details…",
      counter: "{count} / {max}",
      submit: "Send message",
      sending: "Sending…",
      note: "Please don't include your password or card details in your message.",
    },
    topics: {
      general: "General question",
      technical: "Technical problem",
      billing: "Billing & payment",
      content: "Feedback on content",
      partnership: "Partnerships",
      other: "Something else",
    },
    errors: {
      name: "Enter your name (at least 2 characters).",
      nameLong: "That name is too long.",
      email: "Enter a valid email address.",
      topic: "Choose a topic for your message.",
      messageShort: "Write at least {min} characters.",
      messageLong: "Your message is longer than {max} characters.",
      summary: "Please check the highlighted fields and try again.",
    },
    status: {
      rate_limited: {
        title: "You've sent several messages in a short time",
        body: "Please wait a little and try again, or reach us on WhatsApp.",
      },
      invalid: {
        title: "We couldn't accept this message",
        body: "Check the details you entered and send it again.",
      },
      unavailable: {
        title: "Messaging is unavailable right now",
        body: "Sorry about that. You can reach us on WhatsApp until it's back.",
      },
      network: {
        title: "Couldn't connect",
        body: "Check your internet connection and try again.",
      },
    },
    success: {
      title: "Message received",
      body: "Thanks for getting in touch. We'll reply to {email} as soon as we can.",
      again: "Send another message",
      back: "Back to the support center",
      next: {
        title: "What happens next",
        inbox: "Our reply will arrive by email, so it's worth checking your spam folder too.",
        duplicate: "There's no need to send the same message again — we've got it.",
        urgent: "If it's urgent, message us on WhatsApp and mention that you've sent the form.",
      },
    },
    side: {
      title: "Other ways to get help",
    },
  },

  reviews: {
    eyebrow: "Student reviews",
    title: "What Jazira users say",
    lead: "Opinions from students who actually use Jazira — the praise and the criticism. Share your experience to help others.",
    policy: {
      title: "How we show reviews",
      registered: "Every review was written by a registered user.",
      asIs: "Reviews appear exactly as written, newest first.",
      average: "The average and breakdown are calculated from all published reviews.",
    },
    fallback: {
      title: "Share your opinion another way",
      body: "Until reviews are back, you can send your feedback straight to the Jazira team.",
      cta: "Share your feedback",
    },
    summary: {
      title: "Ratings summary",
      average: "Average rating",
      outOf: "out of 5",
      basedOn: {
        zero: "No reviews yet",
        one: "Based on 1 review",
        other: "Based on {count} reviews",
      },
      distribution: "Rating breakdown",
      stars: {
        one: "1 star",
        other: "{count} stars",
      },
      emptyTitle: "No ratings yet",
      emptyBody: "Once users publish reviews, the average and the rating breakdown will appear here.",
    },
    composer: {
      title: "Share your experience",
      body: "Your review helps other students — and helps us improve.",
      signedOutTitle: "Sign in to write a review",
      signedOutBody: "We ask you to sign in so every review comes from a real user.",
      signIn: "Sign in",
      signUp: "Create an account",
      rating: "Your rating",
      text: "Your review",
      optional: "Optional",
      textPlaceholder: "What did you like? What would you improve?",
      counter: "{count} / {max}",
      submit: "Publish review",
      update: "Save changes",
      cancel: "Cancel",
      edit: "Edit",
      delete: "Delete",
      yours: "Your review",
      yoursMeta: "Published {date}",
      created: "Thank you — your review is live.",
      updated: "Changes saved.",
      deleted: "Your review was deleted.",
      confirmTitle: "Delete your review?",
      confirmBody: "The review will be permanently removed from the page and can't be restored.",
      confirm: "Delete review",
      errors: {
        rating: "Choose a rating from one to five stars.",
        long: "Your review is longer than {max} characters.",
        generic: "We couldn't save your review. Please try again.",
      },
    },
    list: {
      title: "Latest reviews",
      you: "You",
      member: "Jazira member",
      loadMore: "Show more",
      end: "That's every published review.",
      emptyTitle: "No reviews yet",
      emptyBody: "Be the first to share your experience with Jazira.",
      errorTitle: "Couldn't load reviews",
      errorBody: "Check your connection and try again.",
      unavailableTitle: "Reviews aren't available right now",
      unavailableBody: "This service isn't enabled at the moment. Sorry about that.",
      moreError: "Couldn't load more. Please try again.",
    },
    stars: {
      label: "Rated {rating} out of 5",
      option: {
        one: "1 star",
        other: "{count} stars",
      },
    },
  },

  feedback: {
    eyebrow: "Your feedback",
    title: "Share your feedback",
    lead: "Your feedback goes straight to the Jazira team, and it helps us decide what to improve next.",
    rating: {
      legend: "How satisfied are you with Jazira?",
      r1: "Unsatisfied",
      r2: "Below expectations",
      r3: "Okay",
      r4: "Good",
      r5: "Excellent",
    },
    area: {
      legend: "Which part is this about?",
      optional: "Optional",
      curriculum: "Curriculum",
      exams: "Exams",
      assistant: "Assistant",
      community: "Community",
      design: "Design & ease of use",
      other: "Something else",
    },
    text: {
      label: "Your feedback",
      placeholder: "What do you like? What would you like us to add or improve?",
    },
    identity: {
      title: "Your contact details",
      body: "So we can get back to you if we need more details.",
      sendingAs: "Sent as {name}. If we need to follow up, we'll reply to {email}.",
    },
    submit: "Send feedback",
    errors: {
      rating: "Choose a rating first.",
    },
    success: {
      title: "Thank you — we've got your feedback",
      body: "The Jazira team reads every note, and we use them to set our development priorities.",
      again: "Send more feedback",
      review: "Post a public review",
    },
    rail: {
      title: "Where does your feedback go?",
      private: {
        title: "Private to the Jazira team",
        body: "Your feedback isn't published on the platform — only our team sees it.",
      },
      public: {
        title: "Want to share your opinion publicly?",
        body: "Write a review on the student reviews page so others can benefit.",
        cta: "Student reviews",
      },
      urgent: {
        title: "Need a problem solved?",
        body: "If something is stopping you from using Jazira, contact support directly.",
        cta: "Support center",
      },
    },
    composed: {
      header: "Feedback from the “Share your feedback” page",
      rating: "Rating: {rating} out of 5",
      area: "Area: {area}",
    },
  },
};

export default support;
