# Auth e-mail templates (Arabic / English)

Supabase Auth sends these e-mails; each file answers in the member's language:

| File | Supabase template | Used by |
|---|---|---|
| `confirmation.html` | Confirm signup | sign-up (6-digit code for `/verify-email` + link) |
| `recovery.html` | Reset password | forgot password → `/reset-password` |
| `email_change.html` | Change email address | e-mail change |
| `magic_link.html` | Magic link | OTP / magic-link sign-in (if enabled) |

## How the language is chosen

The templates branch on `{{ .Data.locale }}` (the user's `user_metadata.locale`):

- **sign-up** stores the page's locale (`src/hooks/useAuth.js` → `options.data.locale`);
- **changing the language** in the app updates it (`src/context/PreferencesProvider.jsx` →
  `auth.updateUser({ data: { locale } })`);
- no value (older accounts, first Google sign-in) → **Arabic**, the platform default.

`printf "%v"` makes a missing value compare as `"<nil>"` instead of failing.

## Applying them

The repository does not run the Supabase CLI, so the dashboard is the source
that sends mail. After changing a file:

1. Dashboard → **Authentication → Email Templates** → pick the template.
2. Paste the file's content as the message body.
3. Subject (templates can't vary it reliably): use a bilingual subject, e.g.
   `تأكيد بريدك الإلكتروني · Confirm your email`,
   `إعادة تعيين كلمة المرور · Reset your password`,
   `تأكيد البريد الجديد · Confirm your new email`,
   `رمز الدخول · Your sign-in code`.

With the CLI (`supabase/config.toml`), the same files plug in as
`[auth.email.template.<name>] content_path = "./supabase/templates/<file>.html"`
(`confirmation`, `recovery`, `email_change`, `magic_link`).

Keep both branches of a template saying the same thing.
