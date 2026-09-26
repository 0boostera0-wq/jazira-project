// Owned by the assistant feature. Keep keys identical in ar/assistant.js and en/assistant.js.
// The assistant is always "Jazira Assistant" — never name the AI provider or model.
const assistant = {
  page: {
    title: "Jazira Assistant",
    status: {
      ready: "Ready to help",
      writing: "Writing a reply…",
      loading: "Opening the conversation…",
    },
    newChat: "New chat",
    history: "Chats",
    historyLabel: "Show past chats and your message balance",
    announceDone: "The assistant finished replying.",
    jumpToLatest: "Jump to the latest message",
  },

  welcome: {
    greeting: "Hi {name}, what can I help you with today?",
    greetingGuest: "Hi there, what can I help you with today?",
    lead: "Ask about any lesson or problem and I'll walk you through it step by step, in plain language at your level.",
    capabilitiesLabel: "Start with a task",
    capabilities: {
      explain: {
        title: "Explain a concept",
        body: "A simple explanation with examples and clear steps.",
        template: "Explain the concept of ",
      },
      summarize: {
        title: "Summarise a lesson",
        body: "The key ideas as short points that are easy to revise.",
        template: "Summarise the lesson on ",
      },
      quiz: {
        title: "Quiz me",
        body: "Short questions, with a correction and explanation for each answer.",
        template: "Quiz me with five short questions on ",
      },
      plan: {
        title: "Build a study plan",
        body: "A realistic schedule that fits your time and exam date.",
        template: "Build me a one-week study plan to prepare for ",
      },
    },
    suggestionsLabel: "Try asking",
    suggestions: [
      "Explain verbal analogies for Qudurat",
      "How do I work out 15% of 240 quickly?",
      "Speed vs. acceleration: what's the difference?",
      "A one-week revision plan for Tahsili",
    ],
  },

  composer: {
    label: "Your message to Jazira Assistant",
    placeholder: "Ask about a lesson or a problem…",
    send: "Send",
    stop: "Stop reply",
    counter: "{count} / {max}",
    tooLong: "Your message is longer than the limit ({max} characters).",
    disclaimer: "The assistant can make mistakes, so check important information against your textbook or with your teacher.",
    disclaimerShort: "Answers can contain mistakes. Check anything important.",
  },

  message: {
    you: "You",
    assistant: "Jazira Assistant",
    copy: "Copy reply",
    copyCode: "Copy code",
    copied: "Copied",
    retry: "Try again",
    stopped: "You stopped this reply before it finished.",
    thinking: "The assistant is thinking…",
    code: "Code",
  },

  errors: {
    generic: "We couldn't get a reply right now. Please try again.",
    network: "We couldn't connect. Check your internet connection and try again.",
    unavailable: "The assistant isn't available right now. Please try again shortly.",
    busy: "The assistant is busy with a lot of requests. Please try again in a minute.",
    rateLimited: "You've sent a lot of messages in a short time. Wait a moment, then carry on.",
    interrupted: "The reply was cut off before it finished.",
    invalid: "We couldn't send this message. Edit it and try again.",
    signedOut: "Your session has ended. Sign in again to continue.",
    signIn: "Sign in",
  },

  quota: {
    title: "Message balance",
    free: "Free",
    remainingLabel: "Messages left",
    remainingShort: "{count}/{limit} messages left",
    resetsAt: "Your next message is available at {time}",
    window: "{messages} every {hours} on the free plan.",
    bonus: "Includes your referral bonus",
    unlimited: "Unlimited messages",
    unlimitedBody: "Your Elite membership gives you unlimited chat.",
    unknown: "We couldn't load your balance right now. The limit is still applied when you send.",
    usedLabel: "Messages used",
    exhaustedTitle: "You've used your free messages",
    exhaustedBody: "You can continue at {time}, or join Elite for unlimited chat.",
    exhaustedBodyLater: "You can continue later, or join Elite for unlimited chat.",
    notSent: "This message wasn't sent because you've used your free messages for now.",
    upgrade: "Join Elite",
  },

  units: {
    messages: { zero: "no messages", one: "{count} message", other: "{count} messages" },
    hours: { zero: "0 hours", one: "{count} hour", other: "{count} hours" },
  },

  history: {
    title: "Past chats",
    new: "New chat",
    empty: "No chats yet",
    emptyBody: "Your conversations with the assistant will appear here, so you can pick them up again on any device.",
    guest: "Sign in to save your chats and return to them on any device.",
    unavailable: "Chat history isn't available right now.",
    error: "We couldn't load your chats.",
    retry: "Try again",
    loadMore: "Show older chats",
    untitled: "Untitled chat",
    groups: {
      today: "Today",
      yesterday: "Yesterday",
      week: "Previous 7 days",
      older: "Older",
    },
    delete: "Delete chat",
    deleteTitle: "Delete this chat?",
    deleteBody: "The chat will be permanently removed from your history. Deleting it doesn't give back messages already counted against your free balance.",
    deleteConfirm: "Delete chat",
    deleteError: "We couldn't delete the chat. Please try again.",
    openError: "We couldn't open this chat.",
    truncated: "Only the latest messages of this long chat are shown.",
  },

  guest: {
    title: "Sign in to start chatting",
    railTitle: "Free with your account",
    body: "Accounts are free and include {messages} every {hours} with Jazira Assistant.",
    signIn: "Sign in",
    signUp: "Create a free account",
    perks: {
      allowance: "{messages} every {hours} with the assistant",
      saved: "Your chats are saved, so you can continue on any device",
      bilingual: "Replies in Arabic or English, following the platform language",
      guide: "Points you to the right page on the platform",
    },
  },

  tips: {
    title: "For better answers",
    items: {
      grade: "Mention your grade and subject.",
      full: "Paste the full question as it's written.",
      steps: "Ask for the steps, not just the answer.",
      check: "Ask for a similar question to check you've understood.",
    },
  },

  prefill: {
    topic: "Explain the lesson “{topic}” step by step, with a worked example.",
  },
};

export default assistant;
