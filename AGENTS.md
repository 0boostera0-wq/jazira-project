# 🏝️ منصة جزيرة التعليمية — Agent Instructions

**Jazira Edu Platform** is a production-ready Next.js 14 Arabic RTL educational platform with luxury beige/gold theming, optional Clerk auth, and Google Gemini AI integration.

## Architecture Overview

### Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS with luxury beige theme (#FBF6EC bg, #C9A86A accent)
- **Auth**: Clerk (optional—app runs in demo mode if keys missing)
- **AI**: Google Generative AI (Gemini) with streaming responses
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Font**: Tajawal Arabic (weight: 400, 500, 700, 800)
- **State**: localStorage for prototype (subscriptions, XP, referrals, AI usage limits)

### File Structure

```
src/
├─ app/                      # Next.js 14 App Router
│  ├─ layout.js             # Root: RTL, Clerk/AppContext setup
│  ├─ globals.css           # Luxury beige + glass theme
│  ├─ page.js               # Welcome page
│  ├─ (app)/                # Protected layout with Sidebar + AIAssistant
│  │  ├─ layout.js
│  │  ├─ dashboard/         # Home/XP display
│  │  ├─ elementary/        # DrawingCanvas (handwriting) + ReadingChallenge
│  │  ├─ middle/            # QuduratTest (standardized exam simulator)
│  │  ├─ high-school/       # QuduratTest for older students
│  │  ├─ community/         # CommunityFeed (social engagement)
│  │  ├─ competitions/      # Leaderboard (XP-based rankings)
│  │  ├─ subscriptions/     # Elite tier (19 SAR, referral gate)
│  │  ├─ achievements/      # Trophy display
│  │  └─ settings/          # Preferences
│  ├─ api/chat/route.js     # POST /api/chat → Gemini stream
│  ├─ sign-in/              # Clerk auth pages
│  └─ sign-up/
├─ components/              # React components
│  ├─ Sidebar.jsx           # RTL nav, user card, demo/auth state toggle
│  ├─ AIAssistant.jsx       # Chat widget (floating + expanded)
│  ├─ ChatMascots.jsx       # Robot mascot states (idle/thinking)
│  ├─ RobotMascot.jsx       # Animated SVG mascot
│  ├─ QuduratTest.jsx       # Question timer, 40s per Q, auto-submit
│  ├─ DrawingCanvas.jsx     # Handwriting practice
│  ├─ ReadingChallenge.jsx  # Voice + visual feedback
│  ├─ CommunityFeed.jsx     # Posts, likes, comments, gold badge
│  ├─ Leaderboard.jsx       # Sorted by XP
│  ├─ SubscriptionCard.jsx  # Elite purchase + referral UI
│  ├─ ReferralProgress.jsx  # 5-invite gate
│  ├─ GlassCard.jsx         # Backdrop blur wrapper
│  ├─ PageHeader.jsx        # Section titles with icons
│  └─ DefaultAvatar.jsx     # Fallback user avatar
├─ context/
│  ├─ AppContext.jsx        # Subscription, XP, referrals, AI usage state
│  └─ AuthProvider.jsx      # User auth state + demo toggle
├─ hooks/
│  └─ useAiUsage.js         # Track AI messages (3/8h for free, unlimited for elite)
├─ lib/
│  ├─ authConfig.js         # Clerk env detection (isClerkEnabled)
│  ├─ constants.js          # STORAGE keys, REFERRAL_TARGET, Gemini config
│  ├─ questions.js          # Bank of ~50 Qudurat test questions
│  ├─ chatStore.js          # localStorage for chat history
│  └─ faq.js                # AI context docs for Gemini
├─ middleware.js            # Clerk auth middleware
└─ app/not-found.js         # 404 page
```

## Core Concepts & Reasoning Patterns

### 1. Client vs. Server Boundaries
**Pattern**: Use `"use client"` sparingly. Auth checks, data fetching, and sensitive logic belong on server pages.

**Reasoning to apply**:
- Page components (in `app/(app)/**/page.js`) should default to **server components** unless they need interactivity
- Wrap interactive widgets in `"use client"` components, import them into server pages
- Example: `dashboard/page.js` (server) renders `<Dashboard />` (client)
- **Why**: Reduces JavaScript bundle, improves SEO, keeps secrets server-side

### 2. Authentication: Demo Mode vs. Real Clerk
**Pattern**: Auth is optional. If `CLERK_SECRET_KEY` is missing, app runs in safe demo mode.

**Reasoning to apply**:
- Check `isClerkEnabled` in `src/lib/authConfig.js` before requiring auth
- When implementing new features, **always provide a demo path**
- Example: Subscription logic works in localStorage even without Clerk
- **Why**: Allows rapid prototyping and testing without keys; reduces friction for new devs

### 3. State Management: localStorage
**Pattern**: All state persists to localStorage via `AppContext`. No backend database yet.

**Reasoning to apply**:
- When reading state: use `readJSON(key, fallback)` helper (handles SSR + parse errors)
- When saving state: call `persist(key, value)` in AppContext callbacks
- **Storage keys** are constants in `src/lib/constants.js` (e.g., `STORAGE.subscription`, `STORAGE.xp`)
- **Hydration**: AppContext waits for client mount (`hydrated` flag) before rendering state-dependent UI
- **Why**: Prototype stability; easy to demo; can swap to database later
- **Gotcha**: localStorage survives page reloads but is lost on cache clear—design UX accordingly

### 4. RTL & Arabic Text
**Pattern**: HTML `dir="rtl"` in root layout; Tailwind handles mirroring via RTL plugin.

**Reasoning to apply**:
- All text labels, headings, and body copy should default to Arabic (in `src/lib/constants.js`)
- When adding form inputs: use standard HTML inputs; Tailwind RTL automatically reverses padding/margin
- Icons and positioning: be careful with absolute positioning (e.g., `right-0` becomes left in RTL)
- **Example layout**: `<div className="flex gap-4">` works in RTL (Tailwind auto-reverses)
- **Why**: Cultural fit + legal requirement for Arabic content
- **Testing**: Always check in RTL mode (browser DevTools → Elements → toggle `dir` attribute)

### 5. AI Integration: Gemini with Streaming
**Pattern**: `/api/chat` endpoint streams Gemini responses. Chat history and usage limits stored in localStorage.

**Reasoning to apply**:
- Chat requests POST to `/api/chat` with `{ message, history? }` payload
- Response is streamed text; UI reads via EventSource or fetch ReadableStream
- **Usage limits**: 3 messages per 8 hours (free) → unlimited (elite)
- **Context**: `src/lib/faq.js` contains knowledge docs that get prepended to Gemini prompt
- **Mascot states**: idle → thinking (when waiting) → speaking (when response arrives)
- **Why**: Streaming reduces perceived latency; localStorage usage tracking avoids backend queries
- **Gotcha**: Gemini API key is sensitive; only use server-side (`route.js`)

### 6. Qudurat Test Logic: Auto-Submit Timer
**Pattern**: Each question has 40-second timer. Time up → auto-submit + move to next.

**Reasoning to apply**:
- Question randomization: shuffle array from `src/lib/questions.js`
- Score tracking: increment `xp` on correct answer, save via AppContext
- Timer state: use `useEffect` cleanup to prevent memory leaks when unmounting mid-quiz
- When auto-submitting: disable input immediately (prevent double-submit race)
- **Why**: Standardized exam format; prevents gaming by refreshing
- **Gotcha**: Timer doesn't pause if tab loses focus (by design—prevents cheating)

### 7. Community & Social Features
**Pattern**: Posts, likes, comments stored in localStorage. Gold badges for "elite" users only.

**Reasoning to apply**:
- Post object: `{ id, author, content, likes, comments[], createdAt }`
- Filter elite posts by `user.isElite` flag from AppContext
- When querying community data: default to empty array if localStorage is corrupted
- **Why**: Sandbox social features without backend complexity
- **Testing**: Simulate posts by manually writing to localStorage in DevTools

### 8. Subscription & Referral Mechanics
**Pattern**: Elite tier costs 19 SAR (mock payment) + requires 5 successful referrals to unlock.

**Reasoning to apply**:
- `ReferralProgress` shows 0/5 referrals until user hits target, then gate disappears
- Referral code: auto-generated on first app load, shared via link (not implemented yet)
- Subscription state: `{ isElite: boolean, purchasedAt: timestamp?, referralCodeUsed?: string }`
- "Simulate successful referral" button for demo (hardcoded in `subscriptions/page.js`)
- **Why**: Freemium model + viral loop; localStorage allows instant state changes for prototyping
- **Gotcha**: No backend validation yet—don't rely on referral verification for security

## Common Development Patterns

### Adding a New Page
1. **Create page component** in `src/app/(app)/your-feature/page.js`
2. **If interactive**: Extract UI into `src/components/YourFeature.jsx` with `"use client"`
3. **Access app state**: Import `useAppContext()` from `AppContext`
4. **Add nav link**: Update Sidebar items in `src/lib/constants.js`
5. **Test in demo mode**: No auth keys required; component renders with defaults

### Adding a New Quiz or Test Section
1. **Add questions to** `src/lib/questions.js` (object: `{ id, question, choices, correct }`)
2. **Create page**: `src/app/(app)/your-test/page.js`
3. **Render QuduratTest**: Pass questions array + onScore callback
4. **Update XP**: Callback increments AppContext.xp and persists
5. **Show result**: Display score + congratulatory animation (Framer Motion)

### Modifying Styling (Luxury Beige Theme)
- **Color palette** in `src/app/globals.css`:
  - Background: `#FBF6EC` (cream)
  - Accent: `#C9A86A` (champagne gold)
  - Text: `#4A3F2F` (dark brown)
- **Glass effect**: `GlassCard` component wraps content with `backdrop-blur-md`
- **Responsive breakpoints**: Use Tailwind defaults (`sm`, `md`, `lg`, `xl`)
- **RTL-safe spacing**: Prefer `gap` over individual margin/padding

## Debugging Tips

### 1. State Not Persisting?
- Check browser DevTools → Application → Storage → localStorage
- Look for key in `src/lib/constants.js` → `STORAGE` object
- Verify `persist()` is called in AppContext callback
- Check console for localStorage quota errors

### 2. RTL Layout Broken?
- Verify HTML `dir="rtl"` is set (should be in root layout)
- Check for hardcoded `left`/`right` in CSS (use `start`/`end` instead)
- Test in Firefox (better RTL support for debugging)
- Use Chrome DevTools → More Tools → Rendering → Emulate CSS media → prefers-color-scheme

### 3. Gemini API Not Responding?
- Check `.env.local` has valid `GEMINI_API_KEY`
- Verify API key quota in Google AI Studio dashboard
- Check `/api/chat` route.js for console logs (`vercel logs` or local `console.error`)
- Network tab → XHR → check response status (401 → bad key, 429 → rate limited)

### 4. Timer Issues in Tests?
- Check `useEffect` cleanup in `QuduratTest.jsx` (should clear interval)
- Verify `setInterval` is not called multiple times (watch React StrictMode in dev)
- Test in incognito mode (localStorage isolation)

## Development Workflow

### Local Setup
```bash
# 1. No Node.js on this machine—install if needed
npm install

# 2. Copy .env.example → .env.local, add Gemini key (or leave blank for demo)
cp .env.example .env.local
# Edit .env.local: GEMINI_API_KEY=sk_...

# 3. Start dev server
npm run dev

# 4. Open http://localhost:3000
# App runs in demo mode if Clerk keys are missing
```

### Before Committing
- Run `npm run lint` (Next.js ESLint rules)
- Test in RTL mode (toggle `dir` in browser DevTools)
- Clear localStorage and reload (check hydration works)
- Verify component is responsive (resize to mobile)

### Moving to Production
- Replace localStorage with real database (Supabase, Firebase, etc.)
- Implement referral verification on backend
- Move all Gemini API calls behind authentication
- Rotate API keys in `.env.local` (never commit secrets)
- Set up error tracking (Sentry, LogRocket)

## Pitfalls & Gotchas

1. **localStorage quota exceeded**: App silently fails on some devices. Add error boundary + user message.
2. **Hydration mismatch**: If server renders one state and client another, pages flicker. Always check `hydrated` flag.
3. **Timer doesn't pause on tab blur**: Intentional (exam integrity). Document this in test instructions.
4. **RTL text alignment**: Numbers and URLs are LTR even in RTL pages. Use `dir="ltr"` on specific elements.
5. **Clerk auth optional but confusing**: Add prominent "Demo Mode" badge to Sidebar when not authenticated.
6. **Gemini rate limits**: Free tier has hard limits. Implement backoff + user-friendly error messages.
7. **No database validation**: Subscription state can be forged in localStorage. Validate on backend before processing payments.

## Before Implementing a Feature

1. **Understand the user journey**: Who uses this feature? (Student, teacher, admin?)
2. **Check if localStorage is appropriate**: Can state be lost on cache clear? If critical, plan database migration.
3. **Plan RTL layout**: Sketch component in RTL first; avoid mirror-image designs.
4. **Define auth gates**: Does feature require Clerk login? Clerk keys? Just demo? Document fallback.
5. **Consider mobile UX**: Sidebar collapses on mobile; ensure feature works on small screens.
6. **Audit Gemini usage**: Will feature trigger API calls? Check free tier limits + cost.
7. **Test in demo mode first**: Verify component renders without auth keys.
