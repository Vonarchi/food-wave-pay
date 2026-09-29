import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const noopLock = async <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>) => fn();

/** Anon client that sends x-order-token so RLS can return one order and nothing else. */
export function createGuestOrderClient(token: string): SupabaseClient<Database> {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  return createClient<Database>(url, key, {
    global: { headers: { 'x-order-token': token } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `guest-order-${token}`,
      lock: noopLock,
    },
  });
}
