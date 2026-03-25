import { isSupabaseClientConfigured } from '@/integrations/supabase/client';

/**
 * Shown on auth screens when the production build was made without Supabase env vars.
 */
export function SupabaseEnvBanner() {
  if (isSupabaseClientConfigured) return null;

  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <p className="font-medium">Supabase is not configured in this build</p>
      <p className="mt-1 text-destructive/90">
        Add <code className="rounded bg-destructive/20 px-1">VITE_SUPABASE_URL</code> and{' '}
        <code className="rounded bg-destructive/20 px-1">VITE_SUPABASE_PUBLISHABLE_KEY</code> in
        Vercel → Settings → Environment Variables (values from Supabase → Project Settings → API),
        then trigger a new deployment.
      </p>
    </div>
  );
}
