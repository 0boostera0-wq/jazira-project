// Public Supabase connection settings (safe for the browser: the publishable /
// anon key only grants what Row Level Security allows). NEVER put the
// service-role key here — it is read exclusively in server route handlers via
// process.env.SUPABASE_SERVICE_ROLE_KEY.
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const validUrl =
  /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(SUPABASE_URL) ||
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(SUPABASE_URL);
const validKey = Boolean(SUPABASE_KEY) && !SUPABASE_KEY.startsWith("your_");

export const isSupabaseConfigured = validUrl && validKey;
