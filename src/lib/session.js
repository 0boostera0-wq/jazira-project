import { createClient } from '@/lib/supabase-server';
import { OWN_PROFILE_COLUMNS } from '@/lib/profile';

export async function getAuthSession() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getAuthProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select(OWN_PROFILE_COLUMNS) // never select('*'): private columns are not granted
    .eq('id', user.id)
    .single();

  return profile;
}

export async function requireAuth() {
  const user = await getAuthUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  return user;
}

export async function requireAdmin() {
  const profile = await getAuthProfile();

  if (!profile || profile.role !== 'admin') {
    throw new Error('Forbidden: Admin access required');
  }

  return profile;
}

export async function requireElite() {
  const profile = await getAuthProfile();

  if (!profile || !profile.is_elite) {
    throw new Error('Forbidden: Elite subscription required');
  }

  return profile;
}
