# Authentication System — Complete Guide

## Overview

The Jazira Edu Platform now uses **Supabase Auth** as the primary authentication system with email/password signup and login. The app requires authentication — there is no demo/guest mode.

## Architecture

```
┌─────────────────────────────────────────┐
│         Browser / Client                 │
│  ┌─────────────────────────────────────┐ │
│  │    React Components                 │ │
│  │  (useAuth hook)                     │ │
│  └──────────────┬──────────────────────┘ │
│                 │                         │
│  ┌──────────────▼──────────────────────┐ │
│  │    AuthProvider Context             │ │
│  │    (session + profile state)        │ │
│  └──────────────┬──────────────────────┘ │
│                 │                         │
└─────────────────┼──────────────────────────┘
                  │ (REST API calls)
        ┌─────────▼──────────┐
        │  Supabase Auth     │
        │  (Email/Password)  │
        └─────────┬──────────┘
                  │
        ┌─────────▼──────────┐
        │  PostgreSQL DB     │
        │  (sessions table)  │
        └────────────────────┘
```

## Files Created

| File | Purpose |
|------|---------|
| b/auth.js` | Server-side auth utilities |
| `src/hooks/useAuth.js` | React hook + context provider |
| `src/lib/session.js` | Server-side session helpers |
| `src/components/ProtectedRoute.jsx` | Route protection components |
| `src/app/sign-in/page.js` | Sign-in form (Supabase) |
| `src/app/sign-up/page.js` | Sign-up form (Supabase) |
| `src/app/api/auth/logout/route.js` | Logout endpoint |
| `src/middleware.js` | Route protection + redirects (updated) |

## Usage

### Client Component with useAuth

```jsx
'use client';

import { useAuth } from '@/hooks/useAuth';

export function Dashboard() {
  const { user, profile, isAuthenticated, signOut } = useAuth();

  if (!isAuthenticated) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>مرحبا، {profile?.full_name}</h1>
      <p>XP: {profile?.xp}</p>
      <button onClick={() => signOut()}>تسجيل الخروج</button>
    </div>
  );
}
```

### Server Component with Session

```jsx
import { requireAuth, getAuthProfile } from '@/lib/session';

export default async function AdminPage() {
  const user = await requireAuth(); // Redirect if not logged in
  const profile = await getAuthProfile();

  return <div>Admin Page for {profile.full_name}</div>;
}
```

### Route Protection

```jsx
import { ProtectedRoute, RequireElite } from '@/components/ProtectedRoute';

export default function PremiumContent() {
  return (
    <ProtectedRoute>
      <RequireElite>
        <div>This is premium content</div>
      </RequireElite>
    </ProtectedRoute>
  );
}
```

## useAuth Hook

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `user` | User object \| null | Authenticated user from Supabase Auth |
| `profile` | Profile object \| null | User profile from `profiles` table |
| `loading` | boolean | True while checking auth state |
| `isAuthenticated` | boolean | True if user is logged in |

### Methods

| Method | Signature | Returns |
|--------|-----------|---------|
| `signIn` | `(email, password)` | `{ success, user, error }` |
| `signUp` | `(email, password, username, fullName)` | `{ success, user, error }` |
| `signOut` | `()` | `{ success, error }` |
| `updateProfile` | `(updates)` | `{ success, profile, error }` |
| `resetPassword` | `(email)` | `{ success, error }` |
| `getRole` | `()` | `'student' \| 'teacher' \| 'admin'` |
| `isAdmin` | `()` | `boolean` |
| `isTeacher` | `()` | `boolean` |
| `isElite` | `()` | `boolean` |

### Example

```javascript
const { user, profile, signIn, isAdmin } = useAuth();

const handleLogin = async () => {
  const result = await signIn('user@example.com', 'password123');
  if (result.success) {
    console.log('Logged in!', result.user);
  } else {
    console.error('Login failed:', result.error);
  }
};

const userRole = getRole(); // 'student' | 'teacher' | 'admin'
const canManage = isAdmin(); // boolean
const isPremium = isElite(); // boolean
```

## Session Management

### Server-Side Sessions

```javascript
import { requireAuth, requireAdmin, getAuthProfile } from '@/lib/session';

// Get current user (throws if not authenticated)
const user = await requireAuth();

// Get profile data
const profile = await getAuthProfile();

// Require admin role (throws if not admin)
const adminProfile = await requireAdmin();

// Require elite subscription
const eliteProfile = await requireElite();
```

### Cookies

Sessions are stored in secure, httpOnly cookies:
- Cookie name: `sb-{project-id}-auth-token`
- Set automatically by Supabase Auth
- Sent with every request
- Cannot be accessed by JavaScript (secure)

### Session Refresh

Middleware automatically refreshes sessions on every request:

```javascript
// src/middleware.js
const { data: { session } } = await supabase.auth.getSession();
```

## Authentication Flow

### Sign Up Flow

1. User fills sign-up form (email, password, username, name)
2. Client calls `signUp()` from useAuth hook
3. Hook calls Supabase Auth API
4. Supabase creates user in `auth.users` table
5. Hook creates profile in `profiles` table
6. Hook creates subscription record in `subscriptions` table
7. User is authenticated and redirected to dashboard

### Sign In Flow

1. User fills sign-in form (email, password)
2. Client calls `signIn()` from useAuth hook
3. Hook calls Supabase Auth API
4. Supabase validates credentials
5. Session stored in secure cookie
6. Hook fetches profile from `profiles` table
7. User state updated in AuthContext
8. User redirected to dashboard

### Sign Out Flow

1. User clicks logout button
2. Component calls `signOut()` from useAuth hook
3. Hook posts to `/api/auth/logout`
4. API calls `supabase.auth.signOut()`
5. Session cookie is cleared
6. User state cleared
7. User redirected to sign-in page

## Protected Routes

### Middleware (Server-Side)

```javascript
// src/middleware.js
// All routes under /(app) require authentication
// If not authenticated, redirect to /sign-in

// If authenticated and visit /sign-in or /sign-up, redirect to /dashboard
```

### Components (Client-Side)

```jsx
// Option 1: ProtectedRoute wrapper
<ProtectedRoute>
  <MyComponent />
</ProtectedRoute>

// Option 2: RequireAdmin wrapper
<RequireAdmin>
  <AdminPanel />
</RequireAdmin>

// Option 3: RequireElite wrapper
<RequireElite>
  <PremiumContent />
</RequireElite>

// Option 4: useAuth hook manual check
const { isAuthenticated, isAdmin } = useAuth();
if (!isAdmin()) return <div>Access denied</div>;
```

## Password Reset

### Implementation (Future)

```javascript
// Step 1: User requests password reset
const { signIn } = useAuth();
const result = await resetPassword('user@example.com');

// Step 2: Supabase sends email with reset link
// Link points to: yoursite.com/auth/reset-password?token=...

// Step 3: User submits new password
const { updatePassword } = useAuth();
const result = await updatePassword('newpassword123');
```

## API Endpoints

### Login

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

# Response
{
  "user": { ... },
  "session": { ... }
}
```

### Logout

```bash
POST /api/auth/logout

# Response
{ "success": true }
```

## Security

### Best Practices

- ✅ Passwords hashed by Supabase (bcrypt)
- ✅ Sessions in secure, httpOnly cookies
- ✅ CSRF protection built-in
- ✅ RLS policies on all database tables
- ✅ Server-side session validation
- ✅ No secrets exposed to client

### What NOT to Do

- ❌ Don't store passwords in localStorage
- ❌ Don't pass tokens in URL params
- ❌ Don't skip RLS policy validation
- ❌ Don't trust client-side role checks (verify on server)
- ❌ Don't log sensitive data

## Troubleshooting

### "Unauthorized" Error

**Cause**: User session expired or invalid
**Fix**: Clear cookies, sign in again

### useAuth in non-client component

**Cause**: useAuth hook used in server component
**Fix**: Add `'use client'` at top of file

### Session not updating

**Cause**: AuthProvider not wrapping component
**Fix**: Ensure AuthProvider is in root layout

### "Forbidden" errors in API

**Cause**: RLS policy blocked operation
**Fix**: Check RLS policies in Supabase Dashboard

### Forgot password flow incomplete

**Status**: Not yet implemented
**When needed**: Create reset password page + email template

## Migration from localStorage

### Before (localStorage)

```javascript
const isElite = readJSON(STORAGE.subscription, {}).isElite;
```

### After (Supabase)

```javascript
const { profile } = useAuth();
const isElite = profile?.is_elite || false;
```

## Testing

### Test Sign Up

1. Go to `/sign-up`
2. Fill form with test data
3. Submit → Should redirect to `/dashboard`
4. Check Supabase Dashboard → User created in `auth.users`
5. Check `profiles` table → Profile created

### Test Sign In

1. Go to `/sign-in`
2. Enter credentials from test account
3. Submit → Should redirect to `/dashboard`
4. Refresh → Still authenticated

### Test Sign Out

1. In app, find logout button
2. Click → Should redirect to `/sign-in`
3. Try visiting `/dashboard` → Redirects to `/sign-in`

### Test Protected Routes

1. Sign out (clear cookies)
2. Visit `/dashboard` → Should redirect to `/sign-in`
3. Visit `/sign-in` while logged in → Should redirect to `/dashboard`

## Environment Variables

No additional env vars needed. Supabase auth uses existing:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## Next Steps

1. Test sign-up and sign-in flows
2. Verify routes are protected (middleware working)
3. Update Sidebar to show logged-in user
4. Replace localStorage state with useAuth hooks
5. Add password reset page (future)
6. Add email verification (future)
7. Add social login (future)

## Support

- Supabase Auth Docs: https://supabase.com/docs/guides/auth
- Next.js Server Components: https://nextjs.org/docs/app/building-your-application/rendering/server-components
- nextjs-supabase-ssr: https://supabase.com/docs/guides/auth/server-side-rendering
