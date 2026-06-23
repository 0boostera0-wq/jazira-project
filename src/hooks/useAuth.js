'use client';

import { useEffect, useState, useContext, createContext, useCallback } from 'react';
import { createClient } from '@/lib/supabase-client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const supabase = createClient();

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          setUser(session.user);

          // Fetch user profile
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          setProfile(profileData);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user);

          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          setProfile(profileData);
        } else {
          setUser(null);
          setProfile(null);
        }
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, [supabase]);

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

  const supabase = createClient();
  const { user, profile, loading, isAuthenticated } = context;

  const signIn = useCallback(async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return { success: true, user: data.user };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [supabase]);

  const signUp = useCallback(async (email, password, username, fullName, phone) => {
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      // Build profile row — try with phone first, fall back without it
      const baseProfile = {
        id: authData.user.id,
        username,
        full_name: fullName,
      };

      const profileWithPhone = phone ? { ...baseProfile, phone } : baseProfile;

      let { error: profileError } = await supabase
        .from('profiles')
        .insert(profileWithPhone);

      // If insert failed because phone column doesn't exist, retry without it
      if (profileError && phone && /column|phone/i.test(profileError.message || '')) {
        ({ error: profileError } = await supabase
          .from('profiles')
          .insert(baseProfile));
      }

      if (profileError) throw profileError;

      // Create free subscription record (ignore if it already exists)
      await supabase.from('subscriptions').insert({
        user_id: authData.user.id,
        tier: 'free',
      });

      return { success: true, user: authData.user };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [supabase]);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [supabase]);

  const updateProfile = useCallback(async (updates) => {
    try {
      if (!user) throw new Error('No user logged in');

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
  }, [user, supabase]);

  const resetPassword = useCallback(async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) throw error;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [supabase]);

  const getRole = () => {
    return profile?.role || 'student';
  };

  const isAdmin = () => {
    return profile?.role === 'admin';
  };

  const isTeacher = () => {
    return profile?.role === 'teacher';
  };

  const isElite = () => {
    return profile?.is_elite || false;
  };

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
