// Owned by the settings feature. Keep keys identical in ar/settings.js and en/settings.js.
// Cooldown facts (profile.name.*, profile.avatar.*, profile.phone.*, subscription.free.perks.*)
// must match the RPCs (update_full_name 14 days / 24 h Elite, set_avatar 10 days / none for
// Elite, update_phone 24 h, update_bio 300 chars) and COOLDOWNS in src/components/settings/model.js.
const settings = {
  page: {
    eyebrow: "Your account",
    title: "Settings",
    lead: "Your profile, account security, privacy and notifications — all in one place.",
  },
  nav: {
    label: "Settings sections",
    groups: { account: "Account", experience: "Your experience", membership: "Membership" },
    back: "All settings",
  },
  sections: {
    profile: { title: "Profile", desc: "Your name, photo, bio and private details." },
    account: { title: "Account & security", desc: "Sign-in method, password and connected devices." },
    preferences: { title: "Preferences", desc: "Language, appearance, sounds and assistant suggestions." },
    notifications: { title: "Notifications", desc: "Choose which alerts reach you." },
    privacy: { title: "Privacy", desc: "How you appear in the community and who can message you." },
    subscription: { title: "Subscription", desc: "Your current plan and Elite benefits." },
    danger: { title: "Delete account", desc: "Permanently delete your account and data." },
  },
  summary: {
    free: "Free plan",
    noName: "Jazira account",
  },
  guest: {
    title: "Sign in to manage your settings",
    body: "Your session has ended or you haven't signed in yet. Sign in to edit your profile, preferences and privacy.",
    cta: "Sign in",
    manageTitle: "What you can manage here",
  },
  status: {
    saving: "Saving…",
    saved: "Saved",
  },
  errors: {
    generic: "We couldn't save that. Please try again.",
    network: "We couldn't connect. Check your internet connection and try again.",
    unavailable: "This isn't available right now.",
    sessionExpired: "Your session has ended. Sign in again, then retry.",
    forbidden: "You don't have permission to do that.",
    loadFailed: "We couldn't load this.",
    nameCooldown: "Your waiting period isn't over yet, so the name can't change right now.",
    invalidName: "Enter two names using Arabic or English letters only — no digits or symbols.",
    phoneCooldown: "Your mobile number can change once every 24 hours.",
    invalidPhone: "Enter a 9-digit Saudi mobile number starting with 5.",
    bioTooLong: "Your bio is longer than 300 characters.",
    avatarCooldown: "Your photo can change once every 10 days.",
    avatarInvalid: "We couldn't use that photo. Please upload it again.",
    avatarType: "Choose a JPG, PNG or WebP image.",
    avatarSize: "The image must be 2 MB or smaller.",
    avatarStorage: "We couldn't upload the photo. Try again in a moment.",
    retry: "Try again",
  },
  units: {
    hours: { zero: "0 hours", one: "{count} hour", other: "{count} hours" },
  },
  cooldown: {
    join: "{a} and {b}",
    availableIn: "You can change it again in {time}",
    availableOn: "Available again on {date}",
  },

  // ── Profile ───────────────────────────────────────────────────────────────
  profile: {
    publicCard: { title: "Public profile", desc: "What others see in the community and on your page." },
    viewPublic: "View my public profile",
    avatar: {
      label: "Profile photo",
      hint: "JPG, PNG or WebP, up to 2 MB.",
      upload: "Upload photo",
      change: "Change photo",
      remove: "Remove",
      view: "View your photo larger",
      uploading: "Uploading photo…",
      removing: "Removing photo…",
      updated: "Your photo is updated",
      removed: "Your photo was removed",
      rule: "You can change your photo once every 10 days.",
      ruleElite: "As an Elite member, you can change your photo whenever you like.",
      previewTitle: "Your profile photo",
    },
    name: {
      label: "Display name",
      placeholder: "e.g. Sara Alotaibi",
      hint: "Two names in Arabic or English letters, shown in the community and on your page. You can change it once every 14 days.",
      hintElite: "Two names in Arabic or English letters, shown in the community and on your page. As an Elite member you can change it once every 24 hours.",
      save: "Save name",
      saved: "Your name is saved",
      errors: {
        nameRequired: "Enter your display name.",
        nameOneWord: "Enter two names: your first name and family name.",
        nameTooMany: "Your display name must be exactly two words.",
        nameChars: "Use Arabic or English letters only — no digits or symbols.",
      },
    },
    bio: {
      label: "Bio",
      placeholder: "Introduce yourself in a couple of lines: your stage, interests and what you're preparing for.",
      hint: "Shown on your public profile.",
      counter: "{count} of {max}",
      save: "Save bio",
      saved: "Your bio is saved",
    },
    privateCard: { title: "Private details", desc: "Only you can see these. They never appear on your public profile." },
    email: {
      label: "Email",
      verified: "Verified",
      unverified: "Not verified",
      hint: "Your sign-in email. It can't be changed from settings yet.",
    },
    phone: {
      label: "Mobile number",
      countryCode: "Country code",
      placeholder: "5XXXXXXXX",
      none: "No mobile number added yet",
      hint: "Used to protect your account and for important account matters only. You can change it once every 24 hours.",
      add: "Add number",
      change: "Change",
      save: "Save number",
      cancel: "Cancel",
      remove: "Remove number",
      saved: "Your number is saved",
      removed: "Your number was removed",
      unavailable: "We couldn't load your number right now.",
    },
  },

  // ── Account & security ────────────────────────────────────────────────────
  account: {
    method: {
      title: "Sign-in method",
      desc: "The ways your account is linked.",
      email: "Email and password",
      google: "Google account",
      other: "External sign-in provider",
      linked: "Linked",
    },
    password: {
      title: "Password",
      desc: "Pick a strong password you don't use anywhere else.",
      new: "New password",
      confirm: "Confirm password",
      submit: "Update password",
      success: "Your password is updated.",
      rules: { length: "At least 8 characters", mix: "Letters and numbers" },
      errors: {
        passwordRequired: "Enter your new password.",
        passwordShort: "Too short — use at least 8 characters.",
        passwordMix: "Use both letters and numbers.",
        confirmRequired: "Re-enter the password to confirm it.",
        passwordMismatch: "The passwords don't match.",
        samePassword: "Choose a password different from your current one.",
        weakPassword: "That password is too weak. Add more letters and numbers.",
        sessionExpired: "For your security, sign out and sign back in before changing your password.",
        rateLimit: "Too many attempts. Wait a moment, then try again.",
        network: "We couldn't connect. Check your internet connection and try again.",
        generic: "We couldn't update your password. Please try again.",
      },
      googleOnly: {
        title: "You sign in with Google",
        body: "Your account is linked to Google, so it has no separate Jazira password. To protect it, turn on 2-Step Verification in your Google account's security settings.",
      },
    },
    sessions: {
      title: "Connected devices",
      desc: "Devices signed in to your account. End the session of any device you don't recognise.",
      current: "This device",
      activeNow: "Active now",
      lastActive: "Last active {time}",
      types: { mobile: "Phone", tablet: "Tablet", desktop: "Computer", unknown: "Device" },
      unknownOs: "Unknown system",
      signOut: "End session",
      signOutAria: "End the session on {device}",
      signOutThis: "Sign out of this device",
      signedOut: "That device's session has ended",
      signOutAll: "Sign out of all devices",
      signOutAllDesc: "Includes this device — you'll need to sign in again afterwards.",
      empty: "No devices recorded yet. This device will appear here in a moment.",
      note: "The other device is signed out within about a minute of its next activity.",
      unavailable: "The device list isn't available right now.",
    },
  },

  // ── Preferences ───────────────────────────────────────────────────────────
  preferences: {
    display: { title: "Display", desc: "Interface language and appearance." },
    language: { title: "Interface language", desc: "The interface switches instantly; learning content stays in its original language." },
    theme: { title: "Appearance", desc: "Saved on this device.", light: "Light", dark: "Dark" },
    experience: { title: "Experience", desc: "Saved to your account and applied on your devices." },
    sound: { title: "Sound effects", desc: "Short sounds in interactive activities. Turn them off to browse quietly." },
    suggestions: { title: "Jazira Assistant suggestions", desc: "Suggested questions to start a conversation with the assistant and on your dashboard." },
  },

  // ── Privacy ───────────────────────────────────────────────────────────────
  privacy: {
    intro: {
      title: "Your privacy, your call",
      body: "Choose how you appear in the community and who can reach you. Changes apply instantly on all your devices.",
    },
    identity: { title: "Your community identity", desc: "How your name and photo appear next to what you post." },
    anonymous: {
      title: "Post as “Anonymous”",
      desc: "Your posts and comments show as “Anonymous” with your photo hidden, and you won't appear in people search.",
    },
    eliteBadge: {
      title: "Show the Elite badge",
      desc: "The badge appears next to your name in the community and on your page.",
      locked: "Available to Elite members.",
      cta: "About Elite",
    },
    profile: { title: "Your public profile", desc: "What visitors to your page can see." },
    likes: { title: "Show my likes", desc: "Visitors to your page can see the posts you liked." },
    reposts: { title: "Show my reposts", desc: "A reposts tab appears on your page." },
    messages: { title: "Direct messages", desc: "Who can start a conversation with you." },
    allowMessages: {
      title: "Receive messages",
      desc: "When off, nobody can message you — not even in existing conversations.",
    },
    allowRequests: {
      title: "Message requests",
      desc: "People you don't follow send a request you can accept or decline; people you follow message you directly.",
    },
    muteRequests: {
      title: "Mute request notifications",
      desc: "Message requests arrive in your inbox without a notification.",
    },
    needsMessages: "Turn on “Receive messages” first.",
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  notifications: {
    note: "Notifications arrive inside Jazira, under the bell. Anything you switch off here isn't stored at all, so it won't appear later if you switch it back on.",
    viewAll: "View notifications",
    unavailable: "Notification settings aren't available right now; notifications use the default settings.",
    inApp: { title: "In Jazira", desc: "Shown under the bell and on your notifications page." },
    groups: {
      community: { title: "Community activity" },
      messages: { title: "Messages" },
      learning: { title: "Learning" },
      jazira: { title: "From Jazira" },
      email: { title: "Email", desc: "A periodic summary outside Jazira." },
    },
    items: {
      likes: { title: "Likes and reposts", desc: "When someone likes or reposts your post." },
      comments: { title: "Comments", desc: "When someone comments on your post." },
      follows: { title: "New followers", desc: "When someone starts following you." },
      mentions: { title: "Mentions", desc: "When someone @mentions you in a post." },
      messages: { title: "Messages and requests", desc: "A new message, a message request, or your request being accepted." },
      exam_results: { title: "Exam results and achievements", desc: "As soon as your exam is graded or you earn an achievement." },
      product_updates: { title: "Platform updates", desc: "New features and important notices about your account." },
      email_digest: {
        title: "Email digest",
        desc: "We don't send emails yet. Turn this on to get the digest once it launches.",
      },
    },
  },

  // ── Subscription ──────────────────────────────────────────────────────────
  subscription: {
    current: "Your current plan",
    active: "Active",
    elite: {
      title: "Elite plan",
      body: "Everything in Jazira, with no daily limits.",
      periodEnd: "Current period runs until {date}",
      perksTitle: "Your benefits in settings",
    },
    free: {
      title: "Free plan",
      body: "Learn and practise for free within daily limits, and upgrade to Elite when you need more.",
      perksTitle: "What Elite adds to your account",
      cta: "Explore Elite",
    },
    perks: {
      name: "Change your display name once every {elite} instead of every {free}",
      avatar: "Change your profile photo anytime instead of once every {free}",
      badge: "The Elite badge next to your name — shown or hidden, your choice",
    },
    compare: "Compare plans",
    help: "For billing or cancellation questions, message our support team.",
    support: "Contact support",
  },

  // ── Danger zone ───────────────────────────────────────────────────────────
  danger: {
    title: "Delete your account permanently",
    body: "Your account and everything linked to it are deleted immediately. This can't be undone.",
    what: {
      title: "What gets deleted?",
      profile: "Your profile, photo and private details",
      content: "Your posts, comments, likes and reviews",
      learning: "Your exam results, streak and XP",
      messages: "Your direct messages and Jazira Assistant conversations",
      settings: "Your preferences, settings and registered devices",
    },
    eliteNote: "Deleting your account doesn't cancel billing with the payment provider. Cancel your Elite subscription or contact support first.",
    open: "Delete my account",
    dialog: {
      title: "Delete your account permanently?",
      body: "All your data is deleted immediately and can't be recovered.",
      phrase: "delete my account",
      prompt: "To confirm, type “{phrase}” below.",
      confirm: "Delete account permanently",
      deleting: "Deleting your account…",
      cancel: "Cancel",
    },
    errors: {
      notConfigured: "Account deletion isn't enabled in settings yet. Message support and we'll delete your account for you.",
      unavailable: "The service isn't available right now. Try later or contact support.",
      unauthorized: "Your session has ended. Sign in again, then retry.",
      failed: "We couldn't delete your account right now. Try later or contact support.",
      network: "We couldn't reach the server. Check your connection and try again.",
    },
    contact: "Contact support",
  },
};

export default settings;
