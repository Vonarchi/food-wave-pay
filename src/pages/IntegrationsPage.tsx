import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { POS_CATALOG, hasFeature, resolvePlan } from '@/lib/commerce';
import { supabase } from '@/integrations/supabase/client';

type ProviderState = { id: string; name: string; implemented: boolean; configured?: boolean };

export default function IntegrationsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const [slug, setSlug] = useState('');
  const [providers, setProviders] = useState<ProviderState[]>(POS_CATALOG);
  const [squareStatus, setSquareStatus] = useState('disconnected');
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const [truck, profile, catalog] = await Promise.all([
        supabase.from('food_trucks').select('slug').eq('owner_id', user.id).limit(1).maybeSingle(),
        supabase.from('profiles').select('subscription_status, plan_code').eq('id', user.id).maybeSingle(),
        supabase.functions.invoke('commerce', { body: { op: 'providers' } }),
      ]);
      if (truck.data?.slug) setSlug(truck.data.slug);
      const plan = resolvePlan(profile.data?.subscription_status, profile.data?.plan_code);
      setAllowed(hasFeature(plan, 'pos_integration'));
      const remote = (catalog.data as { providers?: ProviderState[] } | null)?.providers;
      if (remote?.length) setProviders(remote);
      if (truck.data?.slug) {
        const connection = await supabase.from('pos_connections').select('status').eq('restaurant_slug', truck.data.slug).eq('provider', 'square').maybeSingle();
        if (connection.data?.status) setSquareStatus(connection.data.status);
      }
    })();
  }, [user]);

  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state || !slug) return;
    void supabase.functions.invoke('commerce', { body: { op: 'square_callback', slug, code, state } }).then(({ data, error }) => {
      const payload = data as { ok?: boolean; error?: string } | null;
      if (error || !payload?.ok) toast.error(payload?.error || 'Square did not connect.');
      else {
        setSquareStatus('connected');
        toast.success('Square connected');
      }
    });
  }, [params, slug]);

  const connectSquare = async () => {
    const { data, error } = await supabase.functions.invoke('commerce', { body: { op: 'square_start', slug } });
    const payload = data as { url?: string; error?: string } | null;
    if (error || !payload?.url) {
      toast.error(payload?.error || 'Square is not configured for this environment.');
      return;
    }
    window.location.assign(payload.url);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Back to dashboard" onClick={() => navigate('/admin/dashboard')}><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <p className="kk-kicker">Integrations</p>
            <h1 className="text-xl font-semibold">POS</h1>
          </div>
        </div>
      </header>
      <div className="max-w-3xl mx-auto p-4 grid gap-3 sm:grid-cols-2">
        {!allowed && <p className="sm:col-span-2 text-sm text-muted-foreground">POS sync is included with Pro. You can still review what is ready.</p>}
        {providers.map((provider) => {
          const ready = provider.implemented && provider.configured !== false && provider.id === 'square' && provider.configured;
          const label = !provider.implemented ? 'Coming soon' : provider.configured ? (provider.id === 'square' && squareStatus === 'connected' ? 'Connected' : 'Available') : 'Setup required';
          return (
            <article key={provider.id} className="kk-card p-4 space-y-3">
              <h2 className="text-lg font-semibold">{provider.name}</h2>
              <p className="kk-status bg-muted text-muted-foreground">{label}</p>
              {provider.id === 'square' && provider.implemented && (
                <Button type="button" disabled={!slug || !allowed} onClick={() => void connectSquare()}>{ready || provider.configured ? 'Connect Square' : 'Square setup required'}</Button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
