# 🚀 Supabase Quick Reference

## Files Created

```
src/
├── lib/
│   ├── supabase.js                 # Client instance
│   ├── supabase-client.js          # Browser client
│   └── supabase-server.js          # Server-side SSR
├── hooks/
│   └── useSupabase.js              # 6 custom hooks
├── middleware.js                   # Updated with Supabase
└── app/api/
    ├── profile/route.js
    ├── posts/route.js
    ├── leaderboard/route.js
    └── chat-history/route.js

Project Root:
├── supabase-schema.sql             # Complete SQL schema
├── SUPABASE_SETUP.md               # Full guide
├── SUPABASE_SQL_EXECUTE.md         # Exact SQL to run
└── .env.local (updated)            # Supabase keys
```

## Database Tables

| Table | Rows | RLS | Purpose |
|-------|------|-----|---------|
| **profiles** | Many | ✅ | User accounts, XP, elite status |
| **posts** | Many | ✅ | Community feed |
| **comments** | Many | ✅ | Post comments |
| **likes** | Many | ✅ | Like tracking |
| **notifications** | Many | ✅ | User alerts |
| **achievements** | Many | ✅ | Badges/milestones |
| **subscriptions** | 1 per user | ✅ | Elite tier status |
| **payments** | Many | ✅ | Transaction records |
| **chat_history** | Many | ✅ | AI chat logs |
| **leaderboard** | View | ✅ | Top users by XP |
| **streaks** | 1 per user | ✅ | Activity streaks |

## RLS Policies

### Public Read-Only
- `profiles` — anyone can view
- `posts` — anyone can view
- `comments` — anyone can view
- `likes` — anyone can view
- `achievements` — anyone can view
- `subscriptions` — anyone can view (for UI display)
- `streaks` — anyone can view (for leaderboards)
- `leaderboard` — view (auto-generated)

### Private (Own Data Only)
- `notifications` — only own
- `payments` — only own
- `chat_history` — only own

### Write Policies
- `profiles` — INSERT/UPDATE own only
- `posts` — INSERT/UPDATE/DELETE own only
- `comments` — INSERT/UPDATE/DELETE own only
- `likes` — INSERT own, DELETE own
- `achievements` — UPDATE own only
- `subscriptions` — UPDATE own only
- `streaks` — UPDATE own only
- `chat_history` — INSERT own only

## Using in Components

### Client Component
```jsx
'use client';

import { useProfile, useLeaderboard } from '@/hooks/useSupabase';

export function MyComponent() {
  const { profile, loading } = useProfile(userId);
  const { leaderboard } = useLeaderboard(10);
  
  return <div>{profile?.full_name}</div>;
}
```

### Server Component
```jsx
import { createClient } from '@/lib/supabase-server';

export default async function Page() {
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .limit(10);
  
  return <div>{posts?.length}</div>;
}
```

## API Routes

```bash
# Profile
GET  /api/profile          # Get current user
POST /api/profile          # Update profile

# Posts
GET  /api/posts            # Get all posts
POST /api/posts            # Create post

# Leaderboard
GET  /api/leaderboard?limit=10

# Chat
GET  /api/chat-history     # Get messages
POST /api/chat-history     # Save message
```

## Authentication

### Automatic Setup
- When user signs up with Clerk, they're added to `auth.users`
- Create their profile via API route:
  ```javascript
  await supabase.from('profiles').insert({
    id: user.id,
    username: user.email.split('@')[0],
    full_name: user.user_metadata?.full_name
  });
  ```

### Session Management
- Middleware automatically refreshes Supabase sessions
- Sessions stored in secure, httpOnly cookies
- No manual refresh needed

## localStorage → Supabase Migration

```javascript
// OLD (localStorage)
const xp = readJSON(STORAGE.xp, 0);
localStorage.setItem(STORAGE.xp, JSON.stringify(150));

// NEW (Supabase)
const { profile } = useProfile(userId);
const xp = profile?.xp;

await supabase
  .from('profiles')
  .update({ xp: 150 })
  .eq('id', userId);
```

## Debugging

### Check if RLS is blocking
```sql
-- In Supabase SQL Editor:
SELECT * FROM profiles;  -- Should work
```

### View user's data
```sql
SELECT * FROM profiles WHERE id = 'user-uuid';
SELECT * FROM posts WHERE user_id = 'user-uuid';
```

### Check triggers are working
```sql
-- Insert a post
INSERT INTO posts (user_id, content)
VALUES ('user-uuid', 'Test');

-- Check likes_count auto-incremented
SELECT likes_count FROM posts WHERE id = '...';
```

### Monitor RLS
Go to **Authentication** → **Policies** in Supabase Dashboard

## Environment Variables

```env
# Public (safe in browser)
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

# Secret (server-side only!)
SUPABASE_SERVICE_ROLE_KEY=eyJ0eXAiOiJKV1QiLCJhbGc...
```

⚠️ Never commit `.env.local` — it's in `.gitignore`

## Triggers Explained

| Trigger | Does | When |
|---------|------|------|
| `profiles_updated_at_trigger` | Set `updated_at = NOW()` | Profile updated |
| `posts_updated_at_trigger` | Set `updated_at = NOW()` | Post updated |
| `post_likes_increment_trigger` | `likes_count++` | Like added to post |
| `post_likes_decrement_trigger` | `likes_count--` | Like removed from post |
| `post_comments_increment_trigger` | `comments_count++` | Comment added |
| `post_comments_decrement_trigger` | `comments_count--` | Comment deleted |

## Common Queries

```javascript
// Get user profile
const { data } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', userId)
  .single();

// Get leaderboard
const { data } = await supabase
  .from('leaderboard')
  .select('*')
  .limit(10);

// Get user's posts
const { data } = await supabase
  .from('posts')
  .select('*, profiles(username)')
  .eq('user_id', userId);

// Get posts with engagement
const { data } = await supabase
  .from('posts')
  .select('*, likes(id), comments(id)')
  .order('created_at', { ascending: false });

// Get notifications
const { data } = await supabase
  .from('notifications')
  .select('*')
  .eq('user_id', userId)
  .eq('read', false);

// Get chat history
const { data } = await supabase
  .from('chat_history')
  .select('*')
  .eq('session_id', sessionId)
  .order('created_at', { ascending: true });
```

## Performance Tips

- ✅ Indexes already created on all common query columns
- ✅ Use `.limit()` to paginate large datasets
- ✅ Use `.select()` to only fetch needed columns
- ✅ RLS policies are automatically optimized by Postgres
- ✅ Leaderboard is a view (query-optimized)

## Next Steps

1. Get Service Role Key → Add to `.env.local`
2. Run SQL in Supabase SQL Editor
3. Test API endpoints with curl/Postman
4. Replace localStorage with Supabase calls
5. Monitor performance via Supabase Dashboard
