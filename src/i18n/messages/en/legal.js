// Owned by the legal feature. Keep keys identical in ar/legal.js and en/legal.js.
//
// Document bodies are arrays of blocks rendered by components/legal/LegalBlocks:
//   "text"            → paragraph
//   ["a", "b"]        → bullet list
//   { note: "text" }  → highlighted note
// Inline markup inside any string: **bold** and [label](/path) or [label](/path#section).
// Section keys double as stable anchor ids (identical in both languages).
const legal = {
  ui: {
    eyebrow: "Legal",
    home: "Home",
    breadcrumb: "Breadcrumb",
    updated: "Last updated {date}",
    readingTime: {
      zero: "Under a minute to read",
      one: "{count} min read",
      other: "{count} min read",
    },
    sections: {
      zero: "No sections",
      one: "{count} section",
      other: "{count} sections",
    },
    summaryTitle: "In short",
    summaryNote: "This summary is here for convenience. The full text below is what applies.",
    tocTitle: "On this page",
    tocToggle: "Contents",
    anchor: "Link to the “{title}” section",
    backToTop: "Back to top",
    docsTitle: "Legal documents",
    relatedTitle: "Other documents",
    help: {
      title: "Questions about this document?",
      body: "Our support team is happy to explain any part of it and to help with requests about your account, data or subscription.",
      contact: "Contact us",
      whatsapp: "WhatsApp",
      more: "Answers to common questions are in the [support center](/support).",
    },
  },

  docs: {
    terms: { label: "Terms of service", blurb: "The rules for using Jazira, and your rights and responsibilities." },
    privacy: { label: "Privacy policy", blurb: "What data we collect, and how we use and protect it." },
    refund: { label: "Subscriptions & refunds", blurb: "Payment, renewal, cancellation and refunds for the Elite plan." },
    acceptableUse: { label: "Acceptable use", blurb: "What's allowed on Jazira, and what isn't." },
    communityGuidelines: { label: "Community guidelines", blurb: "How we treat each other in the learning community." },
  },

  // ── Privacy policy ────────────────────────────────────────────────────────
  privacy: {
    title: "Privacy policy",
    intro: "This policy explains what data we collect when you use Jazira, how we use and protect it, and the choices you have to control it.",
    summary: [
      "We collect what's needed to run your account and save your progress, and we never sell your personal data.",
      "Your conversations with Jazira Assistant are used to answer you and are saved to your account. They're never used for advertising.",
      "Your card details never reach our servers. Payments are handled directly by our payment provider.",
      "You can edit your data or permanently delete your account from Settings at any time.",
    ],
    sections: {
      commitment: {
        title: "Our commitment to your privacy",
        body: [
          "Your privacy matters to us. This policy covers the Jazira website and all of its services, including the curriculum library, practice tests, the learning community, direct messages and Jazira Assistant.",
          "Please read it together with our [Terms of service](/terms), which govern your use of Jazira.",
        ],
      },
      data: {
        title: "Data we collect",
        body: [
          "Depending on how you use Jazira, we collect:",
          [
            "**Account data:** your name, email address and password; your mobile number if you choose to add it; and a profile photo and bio if you add them. If you sign in with Google, we receive the name, email address and photo on that Google account.",
            "**Learning data:** your progress, practice-test attempts and results, daily streak, experience points and in-app preferences.",
            "**Content you share:** posts, comments, reactions, photos and media you upload to the community, reviews you write, and direct messages you send to other users.",
            "**Your conversations with Jazira Assistant:** the messages you send to the assistant, the replies it gives, and a count of your messages so usage limits can be applied.",
            "**Subscription data:** your Elite plan status and renewal date, and the payment notifications our payment provider sends us.",
            "**Limited technical data:** device type, browser and operating system, and an approximate city- and country-level location inferred from your internet connection. We use these to show the devices signed in to your account and to keep it secure.",
            "**Invitations:** if you join through a friend's invite link, we record it so the invite is credited to them.",
            "**Messages to our team:** when you write to us through the [contact form](/contact), we receive your name, email address, the topic you choose and your message.",
          ],
          { note: "We never ask for access to your device's precise location." },
        ],
      },
      use: {
        title: "How we use your data",
        body: [
          "We use your data only to:",
          [
            "Run your account, sign you in, and keep your progress and preferences in sync across your devices.",
            "Provide Jazira's features, such as practice tests, the community, direct messages and Jazira Assistant.",
            "Activate and manage your Elite subscription once payment is confirmed.",
            "Protect your account and the platform from misuse, review reports, and enforce our [Community guidelines](/community-guidelines).",
            "Answer your questions and support requests, and improve the learning experience.",
          ],
        ],
      },
      sharing: {
        title: "When we share data",
        body: [
          "We never sell your personal data to third parties. We share it only in these cases:",
          [
            "**With service providers** that help us run Jazira, limited to what they need to do their job: Supabase for sign-in, our database and file storage; Vercel, which hosts the website; an AI service provider that processes Jazira Assistant messages; and Lemon Squeezy for payments, once payments are enabled.",
            "**With Google**, if you choose to sign in with your Google account, to complete authentication.",
            "**With other users**, for what you choose to share: your public profile (such as your name, username, photo, bio, points and badges), your place on the leaderboard, and your posts, comments and reviews are visible to others, and your direct messages reach the people you send them to.",
            "**When required by law** or by a competent authority, or to protect the safety of our users and the platform.",
          ],
        ],
      },
      ai: {
        title: "Jazira Assistant and your data",
        body: [
          "When you use Jazira Assistant, your message and the context of the current conversation are sent to an AI service provider to generate a reply. We limit what we send to what the feature needs to work.",
          "Your conversations are saved to your account so you can come back to them, and a copy is kept in your browser so they load quickly. We also count the messages you send so we can apply the free plan's usage limits. Your conversations are never used for advertising.",
          "Conversations saved to your account are permanently deleted when you delete your account.",
          { note: "Please avoid sharing sensitive information in conversations, such as passwords or health or financial details." },
        ],
      },
      payments: {
        title: "Payments",
        body: [
          "Once paid subscriptions are enabled, you pay on the checkout page of our payment provider, Lemon Squeezy. Your card details never reach our servers and we don't store them.",
          "The payment provider sends us notifications about your subscription and payments. We keep them to activate and manage your subscription and for our records. Our [Subscription and refund policy](/refund) explains payment and renewal in detail.",
        ],
      },
      security: {
        title: "How we protect your data",
        body: [
          "We use technical and organisational safeguards, including encrypting the connection between your device and Jazira, and database-level access rules that stop any user from reaching another user's private data.",
          "Passwords are handled by our sign-in service and are never stored in readable form.",
          "No system is perfectly secure, so we recommend a strong password you don't use anywhere else. Review the devices signed in to your account in [Settings](/settings) and end any session you don't recognise.",
        ],
      },
      rights: {
        title: "Your rights and choices",
        body: [
          [
            "**Access and correction:** review and update your profile details in [Settings](/settings).",
            "**Visibility:** appear as “Anonymous”, with your photo hidden, in the community and on the leaderboard. Elite members can also hide their Elite badge.",
            "**Devices and sessions:** see the devices signed in to your account and end any of those sessions.",
            "**Account deletion:** permanently delete your account from [Settings](/settings). This removes your profile and photo; your posts, comments, reactions and reviews; your direct messages, test attempts, preferences and streak; and your assistant conversations. It can't be undone.",
          ],
          "We may keep some records after an account is deleted where applicable law requires it, or for payment and security purposes, such as payment notifications from our payment provider and messages you've sent us through the contact form.",
          "For any other request about your data, [contact us](/contact).",
        ],
      },
      cookies: {
        title: "Cookies and browser storage",
        body: [
          "We use essential cookies to keep you signed in and remember your preferred language. Jazira can't work without them.",
          "We also store some data in your browser, such as your light or dark theme, an identifier for your session so we can list your signed-in devices, and a copy of your assistant conversations. Because that copy stays in the browser, we recommend not using the assistant on a shared device, or clearing the site's data from the browser when you're done.",
          "We don't use advertising cookies or third-party tracking tools.",
        ],
      },
      changes: {
        title: "Changes to this policy",
        body: [
          "We may update this policy from time to time. When we do, we'll change the “Last updated” date at the top of this page.",
        ],
      },
    },
  },

  // ── Terms of service ──────────────────────────────────────────────────────
  terms: {
    title: "Terms of service",
    intro: "These terms govern your use of the Jazira learning platform and set out your rights and responsibilities, and ours. Please read them carefully.",
    summary: [
      "By using Jazira, you agree to these terms and the policies linked to them.",
      "You're responsible for your account and everything posted from it.",
      "Jazira Assistant can make mistakes, so check important information before relying on it.",
      "You can stop using Jazira and delete your account at any time.",
    ],
    sections: {
      acceptance: {
        title: "Accepting these terms",
        body: [
          "By using the Jazira learning platform, you agree to these terms and to the policies linked to them: our [Privacy policy](/privacy), [Acceptable use policy](/acceptable-use), [Community guidelines](/community-guidelines) and [Subscription and refund policy](/refund). If you don't agree with any part of them, please stop using Jazira.",
          "We may update these terms from time to time. Updates take effect when they're published on this page, and continuing to use Jazira after an update means you accept the revised version.",
        ],
      },
      services: {
        title: "About Jazira and its services",
        body: [
          "Jazira is a digital learning platform offering curriculum resources from elementary to high school, practice for the Qudurat (General Aptitude) and Tahsili (Achievement) tests, a learning community, an AI study assistant called Jazira Assistant, and interactive tools that support your learning.",
          "We work to keep the service stable and high quality, but we can't guarantee it will be available without interruption at all times. Maintenance and updates may require temporary downtime.",
        ],
      },
      accounts: {
        title: "Your account",
        body: [
          "You can create an account with an email address and password, or sign in with your Google account. You're responsible for keeping your sign-in details confidential and not sharing them with anyone.",
          "When you use Jazira, you agree to:",
          [
            "Provide accurate, truthful information when you create your account.",
            "Tell us immediately if you suspect any unauthorised use of your account.",
            "Take responsibility for all activity that happens through your account.",
          ],
          "We may suspend or close any account that breaks these terms or puts the safety of Jazira or its users at risk.",
        ],
      },
      ai: {
        title: "Jazira Assistant",
        body: [
          "Jazira Assistant provides explanations and study help using artificial intelligence. Its answers can sometimes contain mistakes or incomplete information, so check important information before relying on it, and don't treat it as a replacement for your teacher or your study materials.",
          "The assistant is for legitimate educational use only. Using it to cheat or to generate harmful or unlawful content is not allowed.",
          "Use of the assistant may be subject to limits that differ between the free plan and the Elite plan; see the [Elite plan page](/subscriptions) for details. To learn how we handle your conversations, see our [Privacy policy](/privacy#ai).",
        ],
      },
      content: {
        title: "Content and intellectual property",
        body: [
          "All visual elements, text, designs and software of the platform are owned by or licensed to Jazira and are protected by intellectual property laws.",
          "Official curricula and sources belong to their original owners and are shown on Jazira for educational purposes. You may not republish, sell or distribute any content from Jazira without prior written permission.",
        ],
      },
      subscriptions: {
        title: "Subscriptions and payments",
        body: [
          "Jazira offers a free plan and a paid Elite plan that unlocks additional features. Pricing and features are shown clearly on the [Elite plan page](/subscriptions) before you subscribe.",
          "Once enabled, payments are processed by our payment provider, Lemon Squeezy, and we don't store your card details on our servers. Your subscription is activated after the payment provider confirms the payment.",
          "Our [Subscription and refund policy](/refund) explains renewal, cancellation and refunds.",
        ],
      },
      community: {
        title: "Community and user content",
        body: [
          "You're responsible for the posts, comments, photos and media you share in the community, and for the direct messages you send.",
          "Content that is abusive, misleading or unlawful, or that violates other people's privacy or rights, is not allowed. Our [Community guidelines](/community-guidelines) describe the behaviour we expect, and we may remove any content that breaks them.",
        ],
      },
      restrictions: {
        title: "Restrictions",
        body: [
          "When using Jazira, you agree not to:",
          [
            "Attempt to hack or disrupt the platform, or gain unauthorised access to its data.",
            "Use automated tools to collect data or otherwise misuse the service.",
            "Impersonate any user or organisation.",
            "Use Jazira for any unlawful purpose.",
          ],
          "Our [Acceptable use policy](/acceptable-use) sets out these rules in more detail.",
        ],
      },
      liability: {
        title: "Disclaimers and limitation of liability",
        body: [
          "The service is provided “as is” and “as available”. We do our best to keep content accurate, but we're not responsible for decisions made on the basis of information shown on Jazira without checking it.",
          "To the extent permitted by law, Jazira is not liable for any indirect damages arising from using the service or being unable to access it.",
        ],
      },
      termination: {
        title: "Changes and termination",
        body: [
          "We may change the service, discontinue some features, or close accounts that break these terms, and we'll make reasonable efforts to let users know when needed.",
          "You can stop using Jazira at any time by deleting your account in [Settings](/settings). Your data is then deleted as described in our [Privacy policy](/privacy#rights).",
        ],
      },
    },
  },

  // ── Subscription and refund policy ────────────────────────────────────────
  refund: {
    title: "Subscription and refund policy",
    intro: "A clear explanation of how the Elite plan works: payment, activation, renewal, cancellation and refunds.",
    summary: [
      "You can use the free plan without paying. Elite is a paid subscription that renews automatically until you cancel.",
      "Your subscription activates as soon as payment is confirmed and is linked to the account you subscribed from.",
      "Payments are generally non-refundable, and we review technical problems fairly.",
      "Cancelling never affects your learning data or progress.",
    ],
    sections: {
      plans: {
        title: "Plans",
        body: [
          "Jazira offers a free plan with the core features, and a paid Elite plan that unlocks advanced features such as longer practice tests with no daily limit, Jazira Assistant with no message cap, and in-depth performance analytics.",
          "The features, current limits and price of each plan are shown clearly on the [Elite plan page](/subscriptions) before you subscribe.",
        ],
      },
      billing: {
        title: "Payment and activation",
        body: [
          "Payments are processed by Lemon Squeezy, our payment provider, on its secure checkout page. Your card details never reach our servers and we don't store them.",
          "Your subscription is activated automatically once the payment provider confirms the payment, and it's linked to the account you were signed in to when you paid, so make sure you're signed in to the right account before paying.",
          { note: "If online payment isn't available yet, you'll see a message saying so, and you won't be asked to pay anything." },
        ],
      },
      renewal: {
        title: "Renewal and cancellation",
        body: [
          "Your Elite subscription renews automatically unless you cancel it. You can stop renewal at any time: [contact us](/contact) and we'll turn it off for you.",
          "When your subscription is cancelled or ends, your account returns to the free plan, and your learning data and progress stay saved.",
          "If you plan to delete your account, cancel your subscription renewal first so you aren't charged for a new period.",
        ],
      },
      refunds: {
        title: "Refunds",
        body: [
          "Because digital content becomes available as soon as you subscribe, payments are generally non-refundable.",
          "If a technical problem prevented you from using your paid subscription, write to us through the [contact page](/contact) and we'll review your case fairly.",
          "To help us review your request quickly, include the email address on your account, the date of the payment and a short description of the problem.",
        ],
      },
    },
  },

  // ── Acceptable use policy ─────────────────────────────────────────────────
  acceptableUse: {
    title: "Acceptable use policy",
    intro: "These rules keep Jazira a safe, respectful place to learn for every member.",
    summary: [
      "Use Jazira and its tools to learn and grow.",
      "No cheating, no abuse and no impersonation.",
      "Don't try to hack Jazira or misuse it with automated tools.",
      "Violations can lead to content removal, or to an account being restricted or suspended.",
    ],
    sections: {
      purpose: {
        title: "Purpose of this policy",
        body: [
          "This policy keeps Jazira a safe and respectful learning environment for everyone. It applies to everything you do on the platform: study content, practice tests, the community, direct messages and Jazira Assistant. By using Jazira, you agree to follow it.",
          "It complements our [Terms of service](/terms) and [Community guidelines](/community-guidelines).",
        ],
      },
      allowed: {
        title: "What Jazira is for",
        body: [
          "Jazira is built to be your space for learning. We encourage you to:",
          [
            "Use the content and tools to learn and to grow personally.",
            "Interact with other members positively and respectfully.",
            "Use Jazira Assistant to understand, review and practise.",
          ],
        ],
      },
      prohibited: {
        title: "What's not allowed",
        body: [
          "The following are not allowed on Jazira:",
          [
            "Academic cheating, or posting and passing around test answers inappropriately.",
            "Using Jazira Assistant to cheat or to generate harmful or unlawful content.",
            "Posting abusive or violent content, or content that incites hatred.",
            "Harassing or impersonating any user.",
            "Attempting to hack or disrupt the platform, or exploiting its vulnerabilities.",
            "Using automated programs to collect data or send spam.",
            "Sharing harmful links or files, or any unlawful content.",
          ],
          { note: "If you discover a security vulnerability, please report it through the [contact page](/contact) instead of exploiting it." },
        ],
      },
      enforcement: {
        title: "Enforcement",
        body: [
          "When we find a violation, we may remove the content, or restrict or suspend the account, depending on how serious the violation is and whether it has happened before.",
          "Where the law requires it, we may report the matter to the competent authorities.",
          "If you disagree with an action taken on your account, write to us through the [contact page](/contact).",
        ],
      },
    },
  },

  // ── Community guidelines ──────────────────────────────────────────────────
  communityGuidelines: {
    title: "Community guidelines",
    intro: "A few simple values that make the Jazira community a respectful, inspiring place for every learner.",
    summary: [
      "Be respectful, even when you disagree.",
      "Share what helps people learn, and skip repetitive or promotional posts.",
      "Protect your privacy and other people's.",
      "Report content that breaks the rules so we can review it.",
    ],
    sections: {
      spirit: {
        title: "The spirit of the community",
        body: [
          "The Jazira community is a place to learn and motivate each other: ask your questions, share your achievements and help others. We want every interaction here to be useful and inspiring.",
          "These guidelines apply to posts, comments, hashtags, photos, media, direct messages and profiles.",
        ],
      },
      respect: {
        title: "Respect comes first",
        body: [
          "Treat others the way you'd like to be treated. Disagreeing is fine; abuse never is.",
          [
            "Avoid mockery, bullying and hurtful language.",
            "Give constructive feedback that helps rather than hurts.",
            "Don't keep messaging someone who doesn't want to hear from you.",
          ],
        ],
      },
      privacy: {
        title: "Privacy and safety",
        body: [
          [
            "Don't share other people's personal information, such as phone numbers, addresses or photos, without their permission.",
            "Don't share your password or sensitive personal details in posts or messages.",
            "If you'd rather hide your name and photo, you can turn on posting as “Anonymous” in [Settings](/settings).",
          ],
        ],
      },
      quality: {
        title: "Quality content",
        body: [
          "Share useful content related to learning, and avoid repetitive, spammy or promotional posts.",
          [
            "Use relevant hashtags so your posts reach the people interested in them.",
            "Don't post content you don't have the right to share, and credit your source when you quote.",
            "Don't post test answers in a way that helps others cheat.",
          ],
        ],
      },
      reporting: {
        title: "Reporting and review",
        body: [
          "If you see content that breaks these guidelines, report it using the report option where it's available, or through the [contact page](/contact). Your reports help keep the community safe.",
          "We review reports and take appropriate action, which may include removing the content, or restricting or suspending the account involved, in line with our [Acceptable use policy](/acceptable-use#enforcement).",
          { note: "If you believe someone is in real danger, contact the relevant emergency authorities right away." },
        ],
      },
    },
  },
};

export default legal;
