# Authentication Quick Reference

## Sign Up Example

```jsx
'use client';
import { useAuth } from '@/hooks/useAuth';

export function SignUpForm() {
  const { signUp, loading } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await signUp(
      'user@example.com',
      'password123',
      'username123',
      'Full Name'
    );
    if (result.success) {
      // User is now authenticated
    }
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

## Sign In Example

```jsx
'use client';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

export function LoginForm() {
  const { signIn } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await signIn('user@example.com', 'password123');
    if (result.success) {
      router.push('/dashboard');
    }
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

## Sign Out Example

```jsx
'use client';
import { useAuth } from '@/hooks/useAuth';

export function LogoutButton() {
  const { signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    // User is logged out, middleware redirects to /sign-in
  };

  return <button onClick={handleLogout}>Logout</button>;
}
```

## Protected Component

```jsx
'use client';
import { useAuth } from '@/hooks/useAuth';

export function UserProfile() {
  const { user, profile, loading, isAuthenticated } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!isAuthenticated) return <div>Not authenticated</div>;

  return (
    <div>
      <h1>{profile.full_name}</h1>
      <p>XP: {profile.xp}</p>
      <p>Role: {profile.role}</p>
    </div>
  );
}
```

## Check Role

```jsx
'use client';
import { useAuth } from '@/hooks/useAuth';

export function AdminPanel() {
  const { isAdmin, isTeacher, isElite } = useAuth();

  if (!isAdmin()) return <div>Admin only</div>;
  return <div>Admin Controls</div>;
}
```

## Server Component Protection

```jsx
import { requireAuth, requireAdmin } from '@/lib/session';

export default async function AdminDashboard() {
  const user = await requireAuth(); // Throws if not authenticated
  const profile = await requireAdmin(); // Throws if not admin

  return <div>Admin Dashboard</div>;
}
```

## Protected Route Component

```jsx
'use client';
import { ProtectedRoute, RequireElite } from '@/components/ProtectedRoute';

export function PremiumFeature() {
  return (
    <ProtectedRoute>
      <RequireElite>
        <div>Elite-only content</div>
      </RequireElite>
    </ProtectedRoute>
  );
}
```

## API Route with Auth

```javascript
// src/app/api/protected/route.js
import { requireAuth } from '@/lib/session';

export async function POST(request) {
  const user = await requireAuth(); // Throws 401 if not authenticated

  const data = await request.json();
  // Do something with authenticated user

  return Response.json({ success: true });
}
```

## Update Profile

```jsx
'use client';
import { useAuth } from '@/hooks/useAuth';

export function EditProfile() {
  const { profile, updateProfile } = useAuth();

  const handleUpdate = async () => {
    const result = await updateProfile({
      full_name: 'New Name',
      bio: 'New bio',
      avatar_url: 'https://...',
    });

    if (result.success) {
      // Profile updated
    }
  };

  return <button onClick={handleUpdate}>Update</button>;
}
```

## Common Patterns

### Pattern 1: Redirect if not authenticated

```jsx
'use client';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function PrivatePage() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/sign-in');
    }
  }, [isAuthenticated, loading, router]);

  if (loading) return <div>Loading...</div>;
  return <div>Private content</div>;
}
```

### Pattern 2: Show/hide UI based on auth

```jsx
'use client';
import { useAuth } from '@/hooks/useAuth';

export function NavBar() {
  const { isAuthenticated, user, signOut } = useAuth();

  return (
    <nav>
      {isAuthenticated ? (
        <>
          <span>Hello, {user.email}</span>
          <button onClick={signOut}>Logout</button>
        </>
      ) : (
        <a href="/sign-in">Login</a>
      )}
    </nav>
  );
}
```

### Pattern 3: Check role and show options

```jsx
'use client';
import { useAuth } from '@/hooks/useAuth';

export function Dashboard() {
  const { profile, isAdmin, isTeacher } = useAuth();

  return (
    <div>
      <h1>{profile.full_name}</h1>
      {isTeacher() && <button>Create Class</button>}
      {isAdmin() && <button>Manage Users</button>}
      {!isAdmin() && !isTeacher() && <p>You are a student</p>}
    </div>
  );
}
```

## Middleware Flow

```
Request → Middleware checks session
  ├─ If visiting /(app) without session → Redirect to /sign-in
  ├─ If visiting /sign-in with session → Redirect to /dashboard
  └─ Otherwise → Continue to route
```

## State Management

```jsx
// AuthProvider is already in root layout
// All components can use useAuth() hook
// No manual context setup needed

export function MyComponent() {
  // Just use the hook
  const { user, profile, isAuthenticated } = useAuth();
}
```

## Errors Handled

| Error | Handler |
|-------|---------|
| Invalid email/password | Display error message |
| Email already exists | Display error message |
| Network error | Display error message |
| Session expired | Redirect to /sign-in |
| Unauthorized API call | Return 401 status |
| Non-admin accessing admin | Redirect to dashboard |

## Files to Update Next

1. **Sidebar.jsx** — Show logged-in user info, logout button
2. **AppContext.jsx** — Use useAuth instead of localStorage
3. **Dashboard page** — Show user profile from useAuth
4. **Community feed** — Get posts with user.id from useAuth
5. **Leaderboard** — Pull from Supabase instead of localStorage

## Testing Credentials

Create test accounts:
- Sign up at `/sign-up` with any email/password
- Each signup creates user in Supabase Auth

No hardcoded test credentials needed.
