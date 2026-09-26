// Owned by the auth feature. Keep keys identical in ar/auth.js and en/auth.js.
// Covers: sign-in, sign-up, verify-email, forgot/reset password, profile-setup.
const auth = {
  fields: {
    email: "Email",
    emailPlaceholder: "name@example.com",
    password: "Password",
    newPassword: "New password",
    confirmPassword: "Confirm password",
    name: "Display name",
    namePlaceholder: "e.g. Sara Alotaibi",
    nameHint: "Two names in Arabic or English letters, shown to classmates in the community.",
    phone: "Mobile number",
    phonePrefix: "+966",
    phonePlaceholder: "5XXXXXXXX",
    phoneHint: "9 digits starting with 5. It never appears on your public profile.",
  },

  validation: {
    emailRequired: "Enter your email address",
    emailInvalid: "Check the email address",
    passwordRequired: "Enter your password",
    passwordShort: "Use at least 8 characters",
    passwordMix: "Combine letters and numbers",
    confirmRequired: "Re-enter your password to confirm",
    passwordMismatch: "Passwords don't match",
    nameRequired: "Enter your display name",
    nameOneWord: "Add a second name, e.g. Sara Alotaibi",
    nameTooMany: "Use two names only",
    nameChars: "Use Arabic or English letters only, no numbers or symbols",
    phoneInvalid: "Enter a 9-digit Saudi mobile number starting with 5",
    codeIncomplete: "Enter the full 6-digit code",
  },

  password: {
    strength: "Password strength: {level}",
    levels: { weak: "weak", fair: "fair", good: "good", strong: "strong" },
    ruleLength: "At least 8 characters",
    ruleMix: "Letters and numbers",
    ruleMet: "done",
    ruleUnmet: "not yet",
  },

  errors: {
    invalidCredentials: "The email or password is incorrect.",
    emailNotConfirmed: "Your account isn't activated yet. Enter the confirmation code we emailed you.",
    userExists: "This email is already registered. Sign in, or reset your password if you've forgotten it.",
    weakPassword: "That password is easy to guess. Choose a longer one that mixes letters and numbers.",
    rateLimit: "Too many attempts in a short time. Wait a minute and try again.",
    otpInvalid: "That code is incorrect or has expired. Check it or request a new one.",
    samePassword: "Choose a password that's different from your current one.",
    invalidEmail: "We couldn't accept this email address. Check that it's typed correctly.",
    signupDisabled: "New sign-ups are paused for now. Please try again later.",
    sessionExpired: "Your session has expired. Request a new link and try again.",
    network: "We couldn't connect. Check your internet connection and try again.",
    notConfigured: "Accounts are unavailable right now. Please try again later.",
    oauth: "We couldn't continue with Google. Please try again.",
    avatarType: "Choose a JPG, PNG or WebP image.",
    avatarSize: "The image must be 2 MB or smaller.",
    avatarUpload: "We couldn't upload the photo. Try again or continue without it.",
    profileSave: "We couldn't save your profile. Please try again.",
    generic: "Something went wrong. Please try again.",
  },

  google: {
    label: "Continue with Google",
    loading: "Opening Google…",
  },
  divider: "or with email",
  legal: "By continuing, you agree to the {terms} and {privacy}.",
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  backToSignIn: "Back to sign in",
  redirecting: "You're signed in. Redirecting…",

  signIn: {
    title: "Welcome back",
    description: "Sign in to pick up your studies where you left off.",
    forgot: "Forgot password?",
    submit: "Sign in",
    noAccount: "New to Jazira?",
    createAccount: "Create a free account",
    confirmNow: "Enter confirmation code",
    revoked: {
      title: "You were signed out on this device",
      body: "Your session was ended from another device. Sign in again to continue.",
    },
    callbackError: {
      title: "Sign-in wasn't completed",
      body: "The link may have expired, or the sign-in was cancelled. Please try again.",
    },
    aside: {
      title: "All your studying in one place",
      points: [
        "A dashboard for your progress and exam results",
        "Practice tests for Qudurat and Tahsili",
        "Jazira Assistant explains what you find hard",
      ],
    },
  },

  signUp: {
    title: "Create your free account",
    description: "It takes a minute to start learning with Jazira.",
    submit: "Create account",
    legal: "By creating an account, you agree to the {terms} and {privacy}.",
    haveAccount: "Already have an account?",
    signIn: "Sign in",
    check: {
      title: "Check your email",
      sentTo: "We sent a 6-digit confirmation code to:",
      body: "Enter the code to activate your account. If you can't find the email, check your spam folder.",
      existing: "Already have an account with this email?",
      enterCode: "Enter confirmation code",
      changeEmail: "Use a different email",
    },
    aside: {
      title: "One account opens the whole platform",
      points: [
        "Organised curricula from elementary to high school",
        "Practice tests for Qudurat and Tahsili",
        "A student community to discuss and share",
      ],
    },
  },

  verify: {
    title: "Confirm your email",
    description: "Enter the 6-digit code we sent you.",
    sentTo: "Code sent to",
    change: "Change",
    emailPrompt: "Enter the email you signed up with. We need it to check the code or send a new one.",
    codeLabel: "Confirmation code",
    digit: "Digit {n} of 6",
    submit: "Confirm account",
    noCode: "Didn't get the code?",
    resend: "Send a new code",
    resendIn: "You can request a new code in {time}",
    resent: "We sent a new code. Use the most recent one you receive.",
    spamTip: "The email may land in your spam folder.",
    done: {
      title: "Your account is active",
      body: "You're all set. Redirecting you now…",
      cta: "Continue",
    },
    aside: {
      title: "One last step to activate your account",
      points: [
        "The code has 6 digits and works once",
        "If you requested more than one code, use the latest",
        "You can request a new code a minute after the last one",
      ],
    },
  },

  forgot: {
    title: "Reset your password",
    description: "Enter your email and we'll send you a link to choose a new password.",
    submit: "Send reset link",
    remembered: "Remembered your password?",
    sent: {
      title: "Check your email",
      body: "If this email belongs to a Jazira account, you'll receive a message with a link to set a new password:",
      tip: "Open the link in this same browser. If the email is slow to arrive, check your spam folder.",
      resend: "Send the link again",
      resendIn: "You can resend in {time}",
      resent: "We sent the link again.",
      otherEmail: "Use a different email",
    },
    aside: {
      title: "A safe way back into your account",
      points: [
        "We only send the reset link to your registered email",
        "The link works once and expires after a short time",
        "Choose a new password you don't use on other sites",
      ],
    },
  },

  reset: {
    title: "Choose a new password",
    forAccount: "For account",
    submit: "Save password",
    expired: {
      title: "This link has expired",
      body: "Reset links work once and only for a limited time. Request a new link and open it in this browser.",
      cta: "Request a new link",
    },
    done: {
      title: "Password updated",
      body: "Use your new password the next time you sign in.",
      cta: "Go to my dashboard",
    },
    aside: {
      title: "A password that's hard to guess",
      points: [
        "At least 8 characters mixing letters and numbers",
        "Avoid your name, birth date or phone number",
        "Don't reuse a password from another account",
      ],
    },
  },

  profileSetup: {
    title: "Complete your profile",
    description: "Choose the name your classmates will see. Your email stays private.",
    photo: "Profile photo",
    photoHint: "Optional. JPG, PNG or WebP up to 2 MB.",
    choosePhoto: "Choose a photo",
    changePhoto: "Change photo",
    removePhoto: "Remove",
    later: "You can change your name and photo later in Settings.",
    submit: "Save and continue",
    aside: {
      title: "How classmates will see you",
      points: [
        "Your display name appears with your community posts",
        "Your email and mobile number are never shown",
        "Several students can share the same name",
      ],
    },
  },
};

export default auth;
