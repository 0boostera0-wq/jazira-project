// Owned by the subscriptions feature. Keep keys identical in ar/subscriptions.js and en/subscriptions.js.
//
// Every number that describes a plan (price, limits, quotas, cooldowns, the
// referral target) is interpolated from code (src/components/subscriptions/plan.js)
// — never typed here — so the copy can't drift from what the product enforces.
// {provider} is the payment provider's brand name as used in the code.
const subscriptions = {
  plan: {
    free: "Free",
    elite: "Elite",
    eliteName: "Elite plan",
    perMonth: "/ month",
    monthly: "Monthly plan",
    renewNote: "Renews automatically every month. Cancel whenever you like.",
  },

  units: {
    messages: { zero: "no messages", one: "{count} message", other: "{count} messages" },
    hours: { zero: "0 hours", one: "{count} hour", other: "{count} hours" },
    exams: { zero: "no exams", one: "{count} exam", other: "{count} exams" },
    invites: { zero: "no invites", one: "{count} invite", other: "{count} invites" },
  },

  perks: {
    questions: "Up to {questions} per exam",
    daily: "No daily exam limit",
    simulation: "Full-length simulation: {questions} in {minutes}",
    assistant: "Jazira Assistant with no message cap",
    analytics: "Advanced analytics that pinpoint weak spots",
    badge: "Elite badge next to your name in the community",
  },

  hero: {
    eyebrow: "Elite plan",
    title: "Practise without daily caps. See exactly what to work on.",
    lead: "Elite lifts the practice limits on Qudurat and Tahsili exams, removes the message cap on Jazira Assistant, and adds advanced performance analytics so you can focus on what actually needs work.",
    compare: "See the full comparison",
    includes: "What's included",
    cardLabel: "Elite plan details",
    secureNote: "Secure payment via {provider}",
    points: {
      monthly: { title: "Flexible monthly plan", body: "Renews every month with no long commitment — request cancellation any time through support." },
      secure: { title: "Secure payment", body: "Payments are processed by {provider}. We never store your card details." },
      verified: { title: "Automatic activation", body: "Benefits switch on in your account as soon as the payment provider confirms payment." },
    },
    free: {
      title: "Start free — no card needed",
      body: "The Free plan is always available with these limits. Move to Elite whenever you need more.",
      questions: "per exam",
      daily: "per day",
      assistant: "with Jazira Assistant every {hours}",
    },
  },

  cta: {
    subscribe: "Get Elite",
    signIn: "Sign in to subscribe",
    noAccount: "No account yet?",
    createAccount: "Create a free account",
  },

  status: {
    title: "You're an Elite member",
    active: "Your plan is active and every benefit is unlocked.",
    renews: "Renews on {date}",
    manage: "To cancel or ask about billing, contact support.",
    startExam: "Start an exam",
    support: "Contact support",
  },

  features: {
    eyebrow: "What Elite adds",
    title: "Benefits that directly support your prep",
    description: "Higher practice limits and tools that help you understand your performance — all switched on the moment your subscription is confirmed.",
    analytics: {
      title: "Advanced performance analytics",
      body: "Detailed stats on your results and a breakdown of your weak spots, so you know where to start revising instead of guessing.",
    },
    exams: {
      unit: { zero: "questions per exam", one: "question per exam", other: "questions per exam" },
      title: "Longer exams, no daily limit",
      body: "Build exams of up to {questions} and practise as often as you like each day.",
      simulation: "Full-length simulation: {questions} in {minutes}",
    },
    assistant: {
      title: "Jazira Assistant, no message cap",
      body: "Ask, follow up and get step-by-step explanations without waiting. The Free plan includes {messages} every {hours}.",
    },
    badge: {
      title: "Elite badge",
      body: "Shown next to your name in the community and on the leaderboard. You can hide it in Settings.",
    },
    profile: {
      title: "More profile flexibility",
      body: "Change your display name every {elitePeriod} instead of every {freePeriod}, and your profile photo any time.",
    },
  },

  compare: {
    eyebrow: "Comparison",
    title: "Compare plans",
    description: "These are the limits the platform actually applies to each plan.",
    caption: "Free plan compared with the Elite plan",
    feature: "Feature",
    groups: {
      exams: "Qudurat & Tahsili exams",
      assistant: "Jazira Assistant",
      analytics: "Analytics",
      profile: "Profile & community",
    },
    rows: {
      questions: "Questions per exam",
      daily: "Exams per day",
      simulation: "Full-length simulation ({questions} · {minutes})",
      messages: "Messages",
      analytics: "Advanced performance analytics",
      badge: "Elite badge next to your name",
      name: "Change display name",
      avatar: "Change profile photo",
    },
    values: {
      upTo: "Up to {questions}",
      perDay: "{exams} a day",
      noDailyLimit: "No daily limit",
      noLimit: "No cap",
      perWindow: "{messages} every {hours}",
      every: "Every {period}",
      anytime: "Any time",
      included: "Included",
      notIncluded: "Not included",
    },
    both: "On both plans: curriculum & resources, the learning community, achievements and daily streaks.",
  },

  faq: {
    eyebrow: "Billing",
    title: "Questions about your plan and payment",
    items: {
      price: {
        q: "How much is Elite, and how is it billed?",
        a: "{price} a month. Your plan renews automatically every month from the day you subscribe until you cancel.",
      },
      methods: {
        q: "Which payment methods can I use?",
        a: "You pay on a secure checkout page hosted by {provider}, which shows the payment methods available to you before you confirm.",
      },
      activation: {
        q: "When do Elite benefits switch on?",
        a: "As soon as the payment provider confirms your payment — usually within moments. If confirmation takes a few minutes, Elite appears in your account automatically; you don't need to do anything.",
      },
      cancel: {
        q: "How do I cancel?",
        a: "Contact our support team and we'll cancel your plan so it doesn't renew. Once it's cancelled, your account returns to the Free plan, and your data and progress stay exactly as they were.",
      },
      refund: {
        q: "Can I get a refund?",
        a: "Because digital benefits are available immediately, payments are generally non-refundable. If a technical problem stopped you from using your plan, contact us and we'll review your case fairly.",
      },
      card: {
        q: "Does Jazira keep my card details?",
        a: "No. You enter payment details directly on the payment provider's page — they never pass through or stay on our servers.",
      },
      referral: {
        q: "Do invites give me Elite?",
        a: "No. Once {invites} succeed, your Jazira Assistant limit rises to {total} every {hours} instead of {free}. It's a limited bonus — not an Elite subscription, and it doesn't include the Elite badge.",
      },
    },
  },

  referral: {
    eyebrow: "Invites",
    title: "Invite your friends",
    body: "Share your personal link. When a friend opens it and then creates an account or signs in, it counts as a successful invite — once per account.",
    progressLabel: "Successful invites",
    progress: "{count} of {target}",
    remaining: "Left to unlock: {invites}",
    rewardTitle: "Your bonus when {invites} succeed",
    reward: "A higher Jazira Assistant limit: {total} every {hours} instead of {free}.",
    notElite: "A limited bonus — not an Elite subscription, and it doesn't include the Elite badge.",
    unlocked: "Invite bonus unlocked",
    linkLabel: "Your invite link",
    copy: "Copy link",
    copied: "Copied",
    copyFailed: "Couldn't copy. Select the link and copy it manually.",
    share: "Share",
    shareTitle: "Jazira",
    shareText: "Join me on Jazira and let's practise for Qudurat and Tahsili together.",
    countError: "We couldn't refresh your invite count right now. We'll try again on your next visit.",
    signedOutTitle: "Sign in to get your invite link",
    signedOutBody: "Your link is personal and tied to your account, so invites are credited to you.",
    signIn: "Sign in",
  },

  trust: {
    title: "Clear terms, no surprises",
    provider: { title: "Trusted payment provider", body: "Payments are processed by {provider}. Your card details never touch our servers." },
    verified: { title: "Verified activation", body: "Elite is only switched on after the payment provider confirms the payment directly to our servers." },
    cancel: { title: "No long commitment", body: "Cancel whenever you like by contacting support. Your data and progress stay saved." },
    terms: "Terms of service",
    refund: "Refund policy",
  },

  policies: {
    title: "Terms & policies",
    body: "Billing, renewal, cancellation and refunds are set out in our policies.",
    privacy: "Privacy policy",
  },

  help: {
    title: "A question about your plan?",
    body: "Our support team can help with payment, renewal and cancellation.",
    cta: "Support center",
  },

  checkout: {
    breadcrumb: "Checkout",
    title: "Checkout",
    lead: "Review your order, then pay on the secure checkout page. You'll come back to Jazira automatically once payment is complete.",
    summary: {
      title: "Order summary",
      plan: "Elite plan",
      period: "Monthly · renews automatically",
      total: "Total",
      taxNote: "The final amount, including any taxes that apply where you live, is shown on the checkout page before you confirm.",
    },
    pay: {
      cta: "Continue to secure payment",
      preparing: "Preparing your checkout…",
      redirecting: "Taking you to the checkout page…",
      agreeBefore: "By continuing you agree to the ",
      agreeTerms: "Terms of service",
      agreeBetween: " and the ",
      agreeRefund: "Refund policy",
      agreeAfter: ".",
      secure: "Checkout page hosted by {provider}",
    },
    states: {
      notConfiguredTitle: "Online payments will be enabled soon",
      notConfiguredBody: "We haven't switched on online subscriptions yet, and you haven't been charged. If you have a question, our support team is happy to help.",
      errorTitle: "We couldn't open the checkout page",
      errorBody: "You haven't been charged. Please try again, and contact us if it keeps happening.",
      rateLimitedTitle: "Too many attempts in a short time",
      rateLimitedBody: "Wait a minute, then try again.",
      eliteTitle: "Your Elite plan is active",
      eliteBody: "There's no need to pay again — every benefit is already unlocked on your account.",
      signedOutTitle: "Sign in to complete your subscription",
      signedOutBody: "We link your plan to your account so the benefits switch on there automatically.",
      viewPlan: "Plan details",
    },
    steps: {
      title: "What happens when you pay?",
      pay: { title: "Pay on a secure page", body: "You complete payment on {provider}'s page — that's where you enter your payment details." },
      back: { title: "Come back to Jazira", body: "After paying, you're returned automatically to the confirmation page." },
      active: { title: "Elite switches on", body: "As soon as the payment confirmation reaches our servers — usually within moments." },
    },
    included: {
      title: "What you get",
    },
  },

  success: {
    breadcrumb: "Subscription status",
    confirming: {
      eyebrow: "Thank you",
      title: "Confirming your payment…",
      body: "This usually takes a few seconds. Keep this page open — it updates automatically.",
    },
    active: {
      eyebrow: "Welcome to Elite",
      title: "Elite is now active",
      body: "Every benefit is unlocked. Start a new exam, or review your plan details.",
      cta: "Start an exam",
      secondary: "Plan details",
    },
    pending: {
      eyebrow: "Processing",
      title: "We haven't received payment confirmation yet",
      body: "If you've just paid, activation can occasionally take a few minutes. Please don't pay again — Elite will appear on your account automatically as soon as confirmation arrives.",
      check: "Check again",
      dashboard: "Go to my dashboard",
      notPaid: "Didn't finish paying?",
      backToCheckout: "Back to checkout",
      support: "If Elite isn't active within an hour, contact support.",
    },
    signedOut: {
      title: "Sign in to see your subscription status",
      body: "We show the status for the account you paid with.",
    },
    steps: {
      label: "Activation progress",
      received: "Back from checkout",
      confirm: "Payment confirmation from the provider",
      activate: "Elite activation on your account",
    },
    next: {
      title: "Good to know",
      receipt: { title: "Your receipt", body: "{provider} emails your payment receipt to the address you used at checkout." },
      renewal: { title: "Renewal", body: "Your plan renews automatically every month. Contact support any time to cancel." },
      nothing: { title: "Nothing else to do", body: "Activation happens on our side automatically once payment is confirmed." },
    },
  },

  upgrade: {
    title: "This is an Elite feature",
    titleFeature: "{feature} is part of Elite",
    body: "Subscribe to Elite to unlock it, along with everything else in the plan:",
    price: "{price} a month · cancel any time",
    cta: "See the Elite plan",
    later: "Not now",
  },
};

export default subscriptions;
