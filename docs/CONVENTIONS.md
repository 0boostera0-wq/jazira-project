# Jazira Engineering Conventions

Stack: Next.js 15 App Router (JavaScript, no TypeScript), React 19, Tailwind 3,
Supabase (Postgres + Auth + Storage, RLS everywhere), deployed on Vercel.

## 1. Routing & file layout

```
src/app/
  [locale]/                 root layout (html lang/dir, fonts, providers)
    (site)/                 marketing shell — landing, about, faq, contact, support, reviews, legal
    (auth)/                 auth shell — sign-in, sign-up, forgot/reset password, verify-email, profile-setup
    (app)/                  app shell — dashboard, curriculum, stages, exams, community, profile, settings…
    [...rest]/page.js       → localized 404
  api/…                     route handlers (never localized)
  auth/callback/route.js    OAuth / email-link code exchange
```

- URLs: Arabic is unprefixed (`/exams`), English is `/en/exams`. The middleware
  rewrites unprefixed paths to `/ar/…` internally.
- Every `layout.js`/`page.js` under `[locale]` that uses translations calls
  `setRequestLocale(params.locale)` first.
- **Links**: import `Link`, `useRouter`, `usePathname` from `@/i18n/navigation`
  — never from `next/link` / `next/navigation` (ESLint enforces). Pass
  unprefixed hrefs (`"/exams"`); the locale prefix is added for you. Server
  redirects: `redirect(localizeHref("/sign-in", locale))`.
- Redirect targets taken from the URL (`?next=`) must go through
  `safeNextPath()` (src/i18n/config.js).

## 2. Internationalisation — zero leakage

- ALL user-visible strings (labels, placeholders, `aria-label`, `alt`, titles,
  toasts, errors, empty states, emails of UI, metadata) come from message files
  `src/i18n/messages/{ar,en}/<namespace>.js`. No hardcoded Arabic or English in
  components. `t(ar, en)` inline pairs from the legacy PreferencesProvider are
  forbidden in new code.
- Both locale files of a namespace must have **identical key trees**
  (`npm test` checks). Plural values are objects: Arabic uses
  `zero/one/two/few/many/other`, English `zero/one/other`, selected by
  `{ count }`.
- Server: `const t = await getT("exams")` → `t("start.title")`.
  Client: `const t = useT("exams")`. Client components only receive the
  namespaces a page wraps them in: `<Messages ns={["exams"]}>…</Messages>`
  (the root provides `common` + `nav`).
- Formatting: `formatNumber`, `formatDate`, `formatRelative`, `formatClock`,
  `formatPrice`, `formatPercent` from `@/i18n/format` with the active locale.
- Educational **content** (question stems, curriculum subject names from the
  catalog, community posts) may be Arabic in English mode; mark such blocks
  `lang="ar" dir="rtl"` when rendered inside English UI.
- Directional CSS: use logical utilities (`ms-/me-/ps-/pe-/start-/end-`,
  `text-start`), never `left/right/ml/mr/pl/pr` for layout.

## 3. Server vs client components

- Pages and layouts are **Server Components** by default. Put `"use client"`
  only on the smallest interactive leaf (forms, toggles, timers, feeds).
- Never make a whole page a client component just to read auth. Render the
  static shell/content on the server and isolate auth-dependent parts in small
  client islands that use `useAuthUser()` and show skeletons until `isLoaded`.
- Heavy client-only widgets (PDF viewer, drawing canvas, rich composer, exam
  runner extras) load with `next/dynamic` + a skeleton fallback.

## 4. Loading & data strategy (performance is a feature)

Order: **shell → skeleton → primary content → secondary → analytics →
recommendations**.

- Every route segment that fetches data ships a `loading.js` that mirrors the
  final layout with `Skeleton*` components (no spinners-only screens).
- Independent server fetches run in parallel (`Promise.all`) and are wrapped in
  separate `<Suspense fallback={<Skeleton…/>}>` boundaries so one slow query
  never blocks the page.
- Client data: fetch in effects after mount via `getSupabase()` (lazy client),
  select explicit columns, paginate with `range()` / keyset, debounce search
  inputs (250–300ms), cancel stale requests, cache results in memory for the
  session where useful.
- Lists that can exceed ~100 items paginate ("load more" / infinite with an
  IntersectionObserver sentinel); very long lists use windowing.
- Images: `Illustration` (lazy by default, `priority` only for the LCP hero).
  User media via `next/image` or `<img loading="lazy" decoding="async">` with
  explicit dimensions.
- Static content (legal, FAQ, curriculum catalog, marketing) must be statically
  rendered — do not call `cookies()`/`headers()` in those trees.

## 5. Supabase

- Browser: `const supabase = await getSupabase()` (`@/lib/supabase-lazy`) —
  may be `null` when env is missing → render the signed-out/empty state.
- Route handlers / server: `getRouteUser()` / `createClient()` from
  `@/lib/supabase-server` (may be `null` → respond `503`).
- Never `select("*")` on `profiles` (private columns are not granted). Use the
  column lists in `@/lib/profile`.
- RLS is the security boundary. Client code may assume nothing about access;
  premium content and answer keys are only released by SECURITY DEFINER RPCs
  that check entitlement server-side.
- Degrade gracefully: if a table/RPC is missing (PostgREST `PGRST202`,
  `PGRST205`, `42P01`, `42883`) show an honest "not available yet" state —
  never crash, never fake data.
- Service-role key: server route handlers ONLY (`process.env.SUPABASE_SERVICE_ROLE_KEY`),
  never imported into anything reachable from the client.

## 6. Security checklist (every change)

- Validate all input server-side (length, type, enum) — client validation is UX only.
- No secrets in `NEXT_PUBLIC_*`. No provider/model names (Gemini, Google AI…)
  anywhere in the UI or client bundle strings.
- Render user content as text (React escapes). Never `dangerouslySetInnerHTML`
  with user data. Links from user content: `https:` only, `rel="noopener noreferrer nofollow"`.
- Same-origin check + auth on mutating API routes; rate-limit expensive ones.

## 7. Quality gates

- `npx eslint --ext .js,.jsx <your files or folders>` must pass (the full `next build` is run centrally).
- `npm test` — unit tests (vitest): i18n key parity, pure logic.
- `npm run test:db` — database tests (PGlite + Supabase shim): schema, RLS,
  RPCs, constraints, pagination.
- New routes: metadata via `buildMetadata()` (src/lib/seo.js), `loading.js`,
  error/empty states, mobile layout at 375px, RTL + LTR.
