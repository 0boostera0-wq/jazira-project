import { createClient } from '@/lib/supabase-server';

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getUserProfile(userId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) return null;
  return data;
}

export async function signUpWithEmail(email, password, username, fullName) {
  const supabase = await createClient();

  // Sign up user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        full_name: fullName,
      },
    },
  });

  if (authError) {
    return { error: authError.message };
  }

  // Create profile
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: authData.user.id,
      username,
      full_name: fullName,
      email,
    });

  if (profileError) {
    return { error: profileError.message };
  }

  // Create subscription record
  await supabase.from('subscriptions').insert({
    user_id: authData.user.id,
    tier: 'free',
  });

  return { user: authData.user };
}

export async function signInWithEmail(email, password) {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  return { user: data.user };
}

export async function signOut() {
  const supabase = await createClient();
  return await supabase.auth.signOut({ scope: "local" });
}

export async function resetPassword(email) {
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password`,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function updatePassword(password) {
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
