# Supabase Integration Guide

This document covers the Supabase database setup for the Jazira Edu Platform.

## 📋 Table of Contents

1. [Environment Variables](#environment-variables)
2. [Database Schema](#database-schema)
3. [Row Level Security (RLS)](#row-level-security)
4. [How to Run SQL](#how-to-run-sql)
5. [Using Supabase in Your App](#using-supabase-in-your-app)
6. [API Endpoints](#api-endpoints)
7. [Debugging](#debugging)

---

## Environment Variables

Supabase keys are already in `.env.local`. However, you need to add the **Service Role Key** for server-side operations:

```env
# Client-side (safe in browser)
NEXT_PUBLIC_SUPABASE_URL=https://osbutymigkorsovnaatl.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_6R240tCb_omR3y26GiqQEQ_yH_30pGt

# Server-side (SECRET - keep private!)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### Getting Your Service Role Key

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project → **Settings** → **API**
3. Copy the **Service Role Key** (labeled `service_role secret`)
4. Paste it into `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`

⚠️ **Security**: Never commit `.env.local` to Git. It's already in `.gitignore`.

---

## Database Schema

The schema includes 11 tables with full Row Level Security:

### Tables

1. **profiles** — User account information + XP + elite status
2. **posts** — Community feed posts
3. **comments** — Comments on posts
4. **likes** — Likes on posts/comments
5. **notifications** — User notifications
6. **achievements** — Badges and milestones
7. **subscriptions** — Elite tier status
8. **payments** — Payment transaction records
9. **chat_history** — AI assistant conversation logs
10. **leaderboard** — View for ranking users by XP
11. **streaks** — User activity streaks (login, quiz, etc.)

### Key Features

- **Automatic timestamps**: `created_at` and `updated_at` on all tables
- **Foreign keys**: Relationships cascade on delete
- **Indexes**: Performance optimized for common queries
- **RLS policies**: Every table has policies for public/private access
- **Triggers**: Auto-increment likes/comments counts, update timestamps

---

## Row Level Security

Every table has RLS **enabled**. Policies define who can read/write/delete:

### Profile Policies
- **SELECT**: Public (anyone can view profiles)
- **UPDATE**: Only own profile
- **INSERT**: Only own profile

### Post Policies
- **SELECT**: Public
- **INSERT**: Authenticated users only
- **UPDATE**: Only post author
- **DELETE**: Only post author

### Comment Policies
- **SELECT**: Public
- **INSERT**: Authenticated users only
- **UPDATE**: Only comment author
- **DELETE**: Only comment author

### Like Policies
- **SELECT**: Public
- **INSERT**: Authenticated users only
- **DELETE**: Only like author

### Notification Policies
- **SELECT**: Only own notifications
- **UPDATE**: Only own notifications

### Payment Policies
- **SELECT**: Only own payments

### Chat History Policies
- **SELECT**: Only own chat messages
- **INSERT**: Only own chat messages

---

## How to Run SQL

### Step 1: Copy the SQL

All SQL is in `supabase-schema.sql` at the project root.

### Step 2: Open Supabase SQL Editor

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Click **SQL Editor** (left sidebar)
4. Click **+ New Query**

### Step 3: Paste & Execute

1. Copy all SQL from `supabase-schema.sql` (excluding comments if desired)
2. Paste into the SQL Editor
3. Click **Run** (or Cmd+Enter / Ctrl+Enter)
4. Wait for confirmation ✅

### Troubleshooting SQL Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `relation already exists` | Table created twice | Drop the table first or skip |
| `permission denied` | RLS blocking the operation | Ensure you're logged in as admin in Supabase |
| `UUID type does not exist` | Database too old | Enable the UUID extension: `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";` |

---

## Using Supabase in Your App

### Client-Side (Browser)

Use the `useSupabase` hooks for React components:

```javascript
'use client';

import { useProfile, useLeaderboard, usePosts } from '@/hooks/useSupabase';

export function Dashboard() {
  const { profile, loading } = useProfile(userId);
  const { leaderboard } = useLeaderboard(10);
  const { posts } = usePosts(20);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>{profile.full_name}</h1>
      <p>XP: {profile.xp}</p>
      {/* Render leaderboard and posts */}
    </div>
  );
}
```

### Server-Side (API Routes)

Use `createClient` from `supabase-server.js` in API routes:

```javascript
// src/app/api/posts/route.js
import { createClient } from '@/lib/supabase-server';

export async function POST(request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { content } = await request.json();

  const { data, error } = await supabase
    .from('posts')
    .insert({ user_id: user.id, content })
    .select();

  return Response.json(data);
}
```

### Importing Supabase in Non-React Files

```javascript
import { supabase } from '@/lib/supabase';

const { data } = await supabase
  .from('profiles')
  .select('*')
  .limit(10);
```

---

## API Endpoints

### Profile

- **GET** `/api/profile` — Get current user's profile
- **POST** `/api/profile` — Update current user's profile

Example:
```bash
curl -X POST http://localhost:3000/api/profile \
  -H "Content-Type: application/json" \
  -d '{ "full_name": "Ahmed Al-Zahra", "xp": 150 }'
```

### Posts

- **GET** `/api/posts` — Get all posts
- **POST** `/api/posts` — Create a new post

Example:
```bash
curl -X POST http://localhost:3000/api/posts \
  -H "Content-Type: application/json" \
  -d '{ "content": "Hello community!", "image_url": null }'
```

### Leaderboard

- **GET** `/api/leaderboard?limit=10` — Get top users by XP

### Chat History

- **GET** `/api/chat-history` — Get user's chat messages
- **POST** `/api/chat-history` — Save a chat message

---

## Integration with Existing Features

### Migrating from localStorage to Supabase

**Before (localStorage)**:
```javascript
const xp = readJSON(STORAGE.xp, 0);
```

**After (Supabase)**:
```javascript
const { profile } = useProfile(userId);
const xp = profile?.xp || 0;
```

### Replacing AppContext with Supabase

The `AppContext` currently stores state in localStorage. To fully migrate to Supabase:

1. **Profiles** table replaces `profiles` state
2. **Subscriptions** table replaces `subscription` state
3. **Chat history** table replaces `chatStore` state
4. **Posts** table replaces community feed localStorage

Example migration for XP:

```javascript
// Old (localStorage)
const { xp, setXp } = useAppContext();

// New (Supabase)
const { profile } = useProfile(userId);
const xp = profile.xp;

const updateXp = async (newXp) => {
  await supabase
    .from('profiles')
    .update({ xp: newXp })
    .eq('id', userId);
};
```

### Connecting with Clerk Auth

When a user signs up with Clerk, they are automatically added to the `auth.users` table. You then create a profile:

```javascript
import { createClient } from '@/lib/supabase-server';

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Create profile for new user
  const { error } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      username: user.email.split('@')[0],
      full_name: user.user_metadata?.full_name,
    });

  return Response.json({ success: !error });
}
```

---

## Debugging

### Check RLS Policies

If you can't read/write data, RLS policies might be blocking:

1. Go to **Authentication** → **Policies** in Supabase Dashboard
2. Verify policies for each table
3. Ensure your user role matches the policy conditions

### View Logs

1. Go to **Logs** → **Function Logs** or **API Logs**
2. Look for errors in operations

### Test Queries Directly

In Supabase SQL Editor, test queries:

```sql
-- Test reading profiles
SELECT * FROM profiles LIMIT 5;

-- Test inserting a post (as specific user)
INSERT INTO posts (user_id, content)
VALUES ('YOUR_USER_ID', 'Test post');

-- Check RLS is working
SELECT * FROM profiles WHERE id = 'DIFFERENT_USER_ID'; -- Should fail if not own profile
```

### Common Issues

| Issue | Solution |
|-------|----------|
| "undefined" in useProfile | Ensure user is logged in; check Supabase Auth settings |
| RLS blocks all reads | Remove RLS temporarily to debug: `ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;` |
| API 401 errors | Check Supabase auth session in cookies |
| Slow queries | Add indexes (already included in schema) |

---

## Next Steps

1. ✅ Run the SQL schema in Supabase
2. ✅ Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`
3. ✅ Test API endpoints with curl or Postman
4. ⏳ Create user profiles after first Clerk sign-up
5. ⏳ Migrate localStorage state to Supabase
6. ⏳ Set up realtime subscriptions (optional)

---

## Support

For issues:
- Check [Supabase Docs](https://supabase.com/docs)
- Review SQL errors in Supabase Dashboard
- Test RLS policies in SQL Editor
