import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import {
  getSupabaseBuildHost,
  isSupabaseClientConfigured,
  supabase,
  SUPABASE_CONNECTIVITY_HINT,
} from '@/integrations/supabase/client';

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  restaurant_name: string | null;
  subscription_status: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
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

function formatAuthFailure(message: string) {
  const host = getSupabaseBuildHost();

  if (!isSupabaseClientConfigured) {
    return SUPABASE_CONNECTIVITY_HINT;
  }

  if (message.includes('timed out')) {
    return `Auth request timed out while calling ${host}. Supabase is configured in this build, so this is more likely a slow/blocked auth request than missing Vercel env vars. Check the browser Network tab for /auth/v1/token or /auth/v1/signup.`;
  }

  if (message.includes('fetch') || message.includes('Failed')) {
    return `Auth request failed while calling ${host}. Supabase URL is present in this build. Check the browser Network tab for the exact /auth/v1/* failure before changing Vercel env vars.`;
  }

  if (/redirect|redirect_uri|email link/i.test(message)) {
    return `${message} — In Supabase → Authentication → URL Configuration, add this site origin to Redirect URLs (e.g. https://your-app.vercel.app/**).`;
  }

  return message;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const res = await Promise.race([
        supabase
          .from('profiles')
          .select('id, email, full_name, phone, restaurant_name, subscription_status')
          .eq('id', userId)
          .single(),
        new Promise<'profile_fetch_timeout'>((resolve) => setTimeout(() => resolve('profile_fetch_timeout'), 8000)),
      ]);

      if (res === "profile_fetch_timeout") {
        console.warn("[auth] fetchProfile timed out (non-blocking)");
        setProfile(null);
        return;
      }

      const { data, error: qErr } = res;
      if (qErr) console.warn("[auth] fetchProfile:", qErr.message);
      setProfile((data as Profile | null) ?? null);
    } catch (e) {
      console.warn("[auth] fetchProfile failed", e);
      setProfile(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const uid = user?.id;
    if (uid) await fetchProfile(uid);
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setLoading(false);
    };

    // 1.5s hard cap — getSession/onAuthStateChange can hang (lock deadlock, 304).
    const timeoutId = setTimeout(finish, 1500);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      clearTimeout(timeoutId);
      console.info("[auth] onAuthStateChange", event, session?.user?.id ?? "no-session");
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // Never block loading=false on profile fetch — hung REST calls caused infinite spinners in production.
        void fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      finish();
    });

    // getSession can hang — race it with timeout, prefer onAuthStateChange
    Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("auth_timeout")), 1500)),
    ])
      .then(({ data: { session } }) => {
        if (!done) {
          clearTimeout(timeoutId);
          console.info("[auth] getSession resolved", session?.user?.id ?? "no-session");
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) void fetchProfile(session.user.id);
          finish();
        }
      })
      .catch((e) => {
        if (!done) clearTimeout(timeoutId);
        console.warn("[auth] getSession race finished:", e instanceof Error ? e.message : e);
        finish();
      });

    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    setError(null);
    console.info("[sign-in] attempting signInWithPassword");
    try {
      const { data, error } = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Request timed out")), 20_000)
        ),
      ]);
      if (error) {
        console.warn("[sign-in] supabase error:", error.message);
        setError(error.message);
        return { error };
      }
      // Apply session immediately so /admin doesn't render before onAuthStateChange (avoids redirect loop / stuck guard).
      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
        void fetchProfile(data.session.user.id);
      }
      console.info("[sign-in] success");
      return { error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      console.warn("[sign-in] failed:", msg);
      setError(formatAuthFailure(msg));
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

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Request timed out. Check Supabase URL in Auth settings and project status.")),
        20_000
      )
    );

    try {
      const { data, error } = await Promise.race([signUpPromise, timeoutPromise]);
      if (error) {
        setError(error.message);
        return {
          error,
          needsEmailConfirmation: false,
        };
      }
      if (data.session && data.user) {
        setSession(data.session);
        setUser(data.user);
        void fetchProfile(data.user.id);
      }
      return {
        error: null,
        needsEmailConfirmation: Boolean(data?.user && !data?.session),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Signup failed";
      setError(formatAuthFailure(msg));
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
        refreshProfile,
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
