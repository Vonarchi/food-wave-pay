import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export default function PaymentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [slug, setSlug] = useState('');
  const [requirePayment, setRequirePayment] = useState(false);
  const [payAtPickup, setPayAtPickup] = useState(true);
  const [testMode, setTestMode] = useState(false);
  const [connected, setConnected] = useState(false);
  const [route, setRoute] = useState('kds');
  const [menuSource, setMenuSource] = useState('kio');

  useEffect(() => {
    if (!user) return;
    void supabase
      .from('food_trucks')
      .select('slug, require_payment_before_kitchen, pay_at_pickup_enabled, test_mode, card_payments_enabled, order_route, menu_source')
      .eq('owner_id', user.id)
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          toast.error(error?.message ?? 'Payment settings are not available yet.');
          return;
        }
        setSlug(data.slug);
        setRequirePayment(data.require_payment_before_kitchen);
        setPayAtPickup(data.pay_at_pickup_enabled);
        setTestMode(data.test_mode);
        setConnected(data.card_payments_enabled);
        setRoute(data.order_route);
        setMenuSource(data.menu_source);
      });
  }, [user]);

  const save = async () => {
    const { error } = await supabase.from('food_trucks').update({
      require_payment_before_kitchen: requirePayment,
      pay_at_pickup_enabled: payAtPickup,
      test_mode: testMode,
      order_route: route,
      menu_source: menuSource,
    }).eq('slug', slug);
    if (error) toast.error(error.message);
    else toast.success('Payment settings saved');
  };

  const connect = async () => {
    const { data, error } = await supabase.functions.invoke('commerce', { body: { op: 'connect_stripe', slug, origin: window.location.origin } });
    const payload = data as { url?: string; error?: string } | null;
    if (error || !payload?.url) {
      toast.error(payload?.error || 'Card payouts are not turned on for this environment.');
      return;
    }
    window.location.assign(payload.url);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Back to dashboard" onClick={() => navigate('/admin/dashboard')}><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <p className="kk-kicker">Payments</p>
            <h1 className="text-xl font-semibold">Customer payments</h1>
          </div>
        </div>
      </header>
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <p className="text-sm text-muted-foreground">Food sales go to the restaurant's Stripe account. KioKitchen subscription billing stays on the billing page. Card numbers are never stored here.</p>
        <p className="kk-card p-4 text-sm">Card payouts: {connected ? 'Connected' : 'Not connected'}</p>
        <Button type="button" onClick={() => void connect()} disabled={!slug}>Connect payouts</Button>
        <label className="kk-card p-4 flex items-center justify-between gap-3"><span>Require payment before the kitchen</span><input type="checkbox" checked={requirePayment} onChange={(event) => setRequirePayment(event.target.checked)} /></label>
        <label className="kk-card p-4 flex items-center justify-between gap-3"><span>Pay at pickup</span><input type="checkbox" checked={payAtPickup} onChange={(event) => setPayAtPickup(event.target.checked)} /></label>
        <label className="kk-card p-4 flex items-center justify-between gap-3"><span>Test mode</span><input type="checkbox" checked={testMode} onChange={(event) => setTestMode(event.target.checked)} /></label>
        <p className="text-sm text-muted-foreground">Test mode sends a labeled test ticket and does not charge a card.</p>
        <label className="block text-sm font-medium">Menu source
          <select className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2" value={menuSource} onChange={(event) => setMenuSource(event.target.value)}>
            <option value="kio">KioKitchen menu</option>
            <option value="pos">POS menu</option>
            <option value="manual">Manual sync</option>
          </select>
        </label>
        <label className="block text-sm font-medium">Send orders to
          <select className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2" value={route} onChange={(event) => setRoute(event.target.value)}>
            <option value="kds">Kitchen display</option>
            <option value="pos">POS</option>
            <option value="both">Kitchen display and POS</option>
          </select>
        </label>
        <Button type="button" onClick={() => void save()} disabled={!slug}>Save</Button>
      </div>
    </div>
  );
}
