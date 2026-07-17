'use client';

import { useEffect, useState, useContext, createContext, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase-lazy';
import { genHandle } from '@/lib/profile';

// PERF: Supabase is imported dynamically (supabase-lazy) so @supabase is not in
// the critical-path bundle of every route. Behaviour is unchanged — the session
// resolves a tick after hydration and `loading` already gates consumers.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    let subscription;

    const loadProfile = async (supabase, id) => {
      const { data } = await supabase.from('profiles').select('*').eq('id', id).single();
      return data;
    };

    (async () => {
      const supabase = await getSupabase();
      if (!alive) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!alive) return;
        if (session?.user) {
          setUser(session.user);
          const profileData = await loadProfile(supabase, session.user.id);
          if (alive) setProfile(profileData);
        }
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }

      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!alive) return;
        if (session?.user) {
          setUser(session.user);
          const profileData = await loadProfile(supabase, session.user.id);
          if (alive) setProfile(profileData);
        } else {
          setUser(null);
          setProfile(null);
        }
      });
      subscription = data.subscription;
      if (!alive) subscription.unsubscribe();
    })();

    return () => { alive = false; subscription?.unsubscribe(); };
  }, []);

  const value = {
    user,
    profile,
    loading,
    error,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  const { user, profile, loading, isAuthenticated } = context;

  const signIn = useCallback(async (email, password) => {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { success: true, user: data.user };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  const signUp = useCallback(async (email, password, username, fullName, phone) => {
    try {
      const supabase = await getSupabase();
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) throw authError;

      const uid = authData.user.id;

      // Insert only guaranteed columns so signup never fails on optional schema.
      // username is a UNIQUE internal handle (never displayed); full_name is the
      // public, duplicate-allowed display name.
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({ id: uid, username: genHandle(username || fullName), full_name: fullName });

      if (profileError) throw profileError;

      // Best-effort extras — these columns may not exist until migrations run.
      // PostgREST returns (not throws) on a missing column, so we simply ignore.
      if (phone) {
        await supabase.from('profiles').update({ phone }).eq('id', uid);
      }
      // Start the name-change cooldown from first signup.
      await supabase.from('profiles').update({ full_name_changed_at: new Date().toISOString() }).eq('id', uid);

      // Create free subscription record (ignore if it already exists)
      await supabase.from('subscriptions').insert({ user_id: uid, tier: 'free' });

      return { success: true, user: authData.user };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  const updateProfile = useCallback(async (updates) => {
    try {
      if (!user) throw new Error('No user logged in');
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      return { success: true, profile: data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [user]);

  const resetPassword = useCallback(async (email) => {
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) throw error;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  const getRole = () => profile?.role || 'student';
  const isAdmin = () => profile?.role === 'admin';
  const isTeacher = () => profile?.role === 'teacher';
  const isElite = () => profile?.is_elite || false;

  return {
    user,
    profile,
    loading,
    isAuthenticated,
    signIn,
    signUp,
    signOut,
    updateProfile,
    resetPassword,
    getRole,
    isAdmin,
    isTeacher,
    isElite,
  };
}
