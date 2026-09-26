'use client';

// Auth ACTIONS (sign in / up / out, reset password, profile update) layered on
// the single app-wide session owned by context/AuthProvider (the only auth
// subscription).
//
// E-mail language: sign-up stores the page's locale in the user's metadata
// (`locale`), and PreferencesProvider updates it when the language changes,
// so the auth e-mail templates (supabase/templates) answer in Arabic or
// English via {{ .Data.locale }}.

import { useCallback } from 'react';
import { getSupabase } from '@/lib/supabase-lazy';
import { useAuthUser } from '@/context/AuthProvider';
import { useLocale } from '@/i18n/client';
import { genHandle } from '@/lib/profile';

// Where Supabase email links (confirm sign-up, reset password) land. The OAuth
// callback exchanges the PKCE code for a session, then forwards to `next`.
function callbackUrl(nextPath) {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}

export function useAuth() {
  const ctx = useAuthUser();
  const { user, profile, isLoaded, isSignedIn, refreshUser, signOut: ctxSignOut } = ctx;
  const { locale } = useLocale();

  const signIn = useCallback(async (email, password) => {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { success: true, user: data.user };
    } catch (err) {
      return { success: false, error: err.message, code: err.code };
    }
  }, []);

  /**
   * Create an account. The profile row is created by the `handle_new_user`
   * database trigger from the metadata below (works even when e-mail
   * confirmation means there is no session yet). A best-effort client upsert
   * remains as a fallback for databases without the trigger.
   */
  const signUp = useCallback(async (email, password, username, fullName, phone, { nextPath = '/dashboard' } = {}) => {
    try {
      const supabase = await getSupabase();
      const handle = genHandle(username || fullName);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: callbackUrl(nextPath),
          data: { full_name: fullName, username: handle, phone: phone || null, locale: locale === 'en' ? 'en' : 'ar' },
        },
      });
      if (error) throw error;

      if (data.session && data.user) {
        await supabase
          .from('profiles')
          .upsert({ id: data.user.id, username: handle, full_name: fullName }, { onConflict: 'id', ignoreDuplicates: true });
      }
      return { success: true, user: data.user, needsConfirmation: !data.session };
    } catch (err) {
      return { success: false, error: err.message, code: err.code };
    }
  }, [locale]);

  const signOut = useCallback(async () => {
    try {
      await ctxSignOut();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [ctxSignOut]);

  const updateProfile = useCallback(async (updates) => {
    try {
      if (!user) throw new Error('not_authenticated');
      const supabase = await getSupabase();
      const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
      if (error) throw error;
      await refreshUser();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [user, refreshUser]);

  /** Sends a recovery e-mail. `resetPath` must be the localized /reset-password path. */
  const resetPassword = useCallback(async (email, resetPath = '/reset-password') => {
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl(resetPath) });
      if (error) throw error;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message, code: err.code };
    }
  }, []);

  return {
    user,
    profile,
    loading: !isLoaded,
    isAuthenticated: isSignedIn,
    signIn,
    signUp,
    signOut,
    updateProfile,
    resetPassword,
    getRole: () => profile?.role || 'student',
    isAdmin: () => profile?.role === 'admin',
    isTeacher: () => profile?.role === 'teacher',
    isElite: () => !!profile?.is_elite,
  };
}
