import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, SUPABASE_CONNECTIVITY_HINT } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  restaurant_name: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    opts?: { fullName?: string; referralCode?: string; referredBy?: string; partnerId?: string }
  ) => Promise<{ error: Error | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setLoading(false);
    };

    // 1.5s hard cap — getSession/onAuthStateChange can hang (lock deadlock, 304).
    const timeoutId = setTimeout(finish, 1500);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        clearTimeout(timeoutId);
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }
        finish();
      }
    );

    // getSession can hang — race it with timeout, prefer onAuthStateChange
    Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("auth_timeout")), 1500)),
    ])
      .then(({ data: { session } }) => {
        if (!done) {
          clearTimeout(timeoutId);
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) fetchProfile(session.user.id);
          finish();
        }
      })
      .catch(() => {
        if (!done) clearTimeout(timeoutId);
        finish();
      });

    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, full_name, phone, restaurant_name')
      .eq('id', userId)
      .single();
    setProfile(data as Profile | null);
  };

  const signIn = async (email: string, password: string) => {
    setError(null);
    try {
      const { error } = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Request timed out")), 15000)
        ),
      ]);
      if (error) setError(error.message);
      return { error };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setError(msg.includes("fetch") || msg.includes("Failed") || msg.includes("timed out")
        ? SUPABASE_CONNECTIVITY_HINT
        : msg);
      return { error: err instanceof Error ? err : new Error(msg) };
    }
  };

  const signUp = async (email: string, password: string, opts?: { fullName?: string; referralCode?: string; referredBy?: string; partnerId?: string }) => {
    setError(null);

    const signUpPromise = supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin + "/onboarding" : undefined,
        data: {
          full_name: opts?.fullName,
          referral_code: opts?.referralCode,
          referred_by: opts?.referredBy,
          partner_id: opts?.partnerId,
        },
      },
    });

    // 10s timeout — prevents infinite spinner if Supabase unreachable
    const timeoutPromise = new Promise<{ error: { message: string } }>((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out. Check Supabase URL in Auth settings and project status.")), 10000)
    );

    try {
      const { data, error } = await Promise.race([signUpPromise, timeoutPromise]);
      if (error) setError(error.message);
      return {
        error,
        needsEmailConfirmation: Boolean(data?.user && !data?.session),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Signup failed";
      setError(
        msg.includes("fetch") || msg.includes("Failed") || msg.includes("timed out")
          ? SUPABASE_CONNECTIVITY_HINT
          : msg
      );
      return {
        error: err instanceof Error ? err : new Error(msg),
        needsEmailConfirmation: false,
      };
    }
  };

  const signOut = async () => {
    setError(null);
    await supabase.auth.signOut();
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        error,
        signIn,
        signUp,
        signOut,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
