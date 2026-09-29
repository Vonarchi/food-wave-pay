import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export default function PlatformAdminPage() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [restaurants, setRestaurants] = useState(0);
  const [failedJobs, setFailedJobs] = useState(0);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.functions.invoke('commerce', { body: { op: 'platform_snapshot' } });
      const payload = data as { ok?: boolean; restaurants?: number; failedJobs?: number } | null;
      if (!payload?.ok) {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      setRestaurants(payload.restaurants ?? 0);
      setFailedJobs(payload.failedJobs ?? 0);
    })();
  }, []);

  if (allowed === false) {
    return (
      <main className="min-h-screen bg-background p-8">
        <p className="text-sm">This area is for KioKitchen operators.</p>
        <button type="button" className="underline mt-4" onClick={() => navigate('/admin/dashboard')}>Back to the restaurant</button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-8 max-w-3xl mx-auto space-y-4">
      <p className="kk-kicker">KioKitchen</p>
      <h1 className="text-2xl font-semibold">Platform</h1>
      {allowed === null ? <p>Checking access…</p> : (
        <div className="grid grid-cols-2 gap-3">
          <div className="kk-card p-4"><p className="text-xs text-muted-foreground">Restaurants</p><p className="text-2xl font-semibold">{restaurants}</p></div>
          <div className="kk-card p-4"><p className="text-xs text-muted-foreground">Failed jobs</p><p className="text-2xl font-semibold">{failedJobs}</p></div>
        </div>
      )}
    </main>
  );
}
