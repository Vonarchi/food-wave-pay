import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { BarChart3, ChefHat, CreditCard, ExternalLink, Headphones, LogOut, Mic, Monitor, Plug, QrCode, Settings, Users, UtensilsCrossed, Wallet } from 'lucide-react';
import { RestaurantQrCard } from '@/components/restaurant/RestaurantQrCard';
import { menuStatusLabel, readMenuStatus, type MenuStatus } from '@/lib/restaurant';
import { setupProgress } from '@/lib/commerce';
import { OwnerInsights } from '@/pages/InsightsPage';
import { track } from '@/lib/analytics';

interface RestaurantRow {
  slug: string;
  name: string;
  menu_status: string | null;
  is_published: boolean;
  ordering_paused?: boolean;
  pay_at_pickup_enabled?: boolean;
  card_payments_enabled?: boolean;
}

const OwnerDashboardPage = () => {
  const navigate = useNavigate();
  const { user, signOut, profile } = useAuth();
  const [restaurant, setRestaurant] = useState<RestaurantRow | null>(null);
  const [itemCount, setItemCount] = useState(0);
  const [ordersToday, setOrdersToday] = useState(0);
  const [revenueToday, setRevenueToday] = useState(0);
  const [aiOrders, setAiOrders] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<{ slug: string; name: string }[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ percent: number; next: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const listResult = await supabase.from('food_trucks').select('slug, name').eq('owner_id', user.id).order('name');
        if (listResult.error) throw listResult.error;
        const list = listResult.data ?? [];
        if (cancelled) return;
        setLocations(list);
        const chosen = activeSlug && list.some((row) => row.slug === activeSlug) ? activeSlug : list[0]?.slug ?? null;
        if (!chosen) {
          setRestaurant(null);
          setSetup(null);
          return;
        }
        if (chosen !== activeSlug) {
          setActiveSlug(chosen);
          return;
        }
        const truckResult = await supabase
          .from('food_trucks')
          .select('slug, name, menu_status, is_published, ordering_paused, pay_at_pickup_enabled, card_payments_enabled')
          .eq('slug', chosen)
          .maybeSingle();
        let row = truckResult.data;
        if (truckResult.error && /column/i.test(truckResult.error.message)) {
          const fallback = await supabase.from('food_trucks').select('slug, name').eq('slug', chosen).maybeSingle();
          if (fallback.error) throw fallback.error;
          row = fallback.data ? { ...fallback.data, menu_status: 'draft', is_published: false, ordering_paused: false, pay_at_pickup_enabled: true, card_payments_enabled: false } : null;
        } else if (truckResult.error) {
          throw truckResult.error;
        }
        if (!row) {
          if (!cancelled) setRestaurant(null);
          return;
        }
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const [items, orders] = await Promise.all([
          supabase.from('menu_items').select('id', { count: 'exact', head: true }).eq('truck_id', row.slug),
          supabase.from('orders').select('total, source').eq('truck_id', row.slug).gte('created_at', start.toISOString()),
        ]);
        if (cancelled) return;
        setRestaurant(row);
        setItemCount(items.count ?? 0);
        let todays: { total: number; source?: string | null }[] = orders.data ?? [];
        if (orders.error && /column/i.test(orders.error.message)) {
          const plain = await supabase.from('orders').select('total').eq('truck_id', row.slug).gte('created_at', start.toISOString());
          todays = plain.data ?? [];
        }
        setOrdersToday(todays.length);
        setRevenueToday(todays.reduce((sum, order) => sum + Number(order.total || 0), 0));
        setAiOrders(todays.filter((order) => order.source === 'phone' || order.source === 'drive_thru' || order.source === 'mobile_voice' || order.source === 'voice_qr').length);
        const tests = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('truck_id', row.slug).eq('is_test', true);
        const menuStatus = readMenuStatus(row);
        const kitchenSeen = window.localStorage.getItem('kk-kitchen-seen') === '1';
        setSetup(setupProgress({
          profile: Boolean(row.name),
          menuImported: (items.count ?? 0) > 0,
          menuReviewed: menuStatus === 'published',
          payments: row.pay_at_pickup_enabled !== false || row.card_payments_enabled === true,
          qr: menuStatus === 'published',
          ordering: menuStatus === 'published' && row.ordering_paused !== true,
          kitchen: kitchenSeen,
          testOrder: (tests.count ?? 0) > 0,
        }));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your restaurant.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user, activeSlug]);

  const status: MenuStatus = restaurant ? readMenuStatus(restaurant) : 'draft';

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 bg-foreground text-background p-4 z-30">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-background/70">Restaurant dashboard</p>
            <h1 className="text-xl font-bold truncate">{restaurant?.name || profile?.restaurant_name || 'Your restaurant'}</h1>
            {locations.length > 1 && (
              <label className="mt-2 block text-xs text-background/80">
                Location
                <select
                  className="mt-1 block w-full rounded-md bg-background text-foreground px-2 py-1"
                  value={activeSlug ?? ''}
                  onChange={(event) => setActiveSlug(event.target.value)}
                >
                  {locations.map((location) => (
                    <option key={location.slug} value={location.slug}>{location.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <Button variant="ghost" size="sm" className="text-background" onClick={() => void signOut().then(() => navigate('/'))}>
            <LogOut className="w-4 h-4 mr-1" /> Log out
          </Button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 space-y-4 pb-16">
        {loading && <p className="text-sm text-muted-foreground">Loading your restaurant…</p>}
        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
            {error}
            <Button variant="outline" size="sm" className="mt-3" onClick={() => window.location.reload()}>Retry</Button>
          </div>
        )}
        {!loading && !restaurant && (
          <div className="rounded-2xl border border-border p-6 space-y-3">
            <h2 className="text-lg font-semibold">No restaurant yet</h2>
            <p className="text-sm text-muted-foreground">Create your restaurant, scan a menu, and publish a QR code.</p>
            <Button variant="cart" onClick={() => navigate('/onboarding')}>Create my digital menu</Button>
          </div>
        )}

        {restaurant && (
          <>
            <div className="flex flex-wrap gap-2 text-xs font-medium">
              <span className="kk-status">{status === 'published' ? 'Open' : 'Closed'}</span>
              <span className="kk-status">{status === 'published' && restaurant.ordering_paused !== true ? 'Ordering active' : 'Ordering paused'}</span>
            </div>
            {setup && setup.percent < 100 && (
              <div className="kk-card p-4">
                <p className="kk-kicker">Setup {setup.percent}% complete</p>
                <p className="mt-1 font-medium">Next: {setup.next}</p>
              </div>
            )}
            <div className="kk-card p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="kk-kicker">Menu</p>
                <p className="text-2xl font-semibold mt-1">{status === 'published' ? 'Live' : status === 'paused' ? 'Paused' : 'Draft'}</p>
                <p className="text-sm text-muted-foreground">{itemCount} items · {menuStatusLabel(status)}</p>
              </div>
              <Button onClick={() => window.open(`/menu/${restaurant.slug}`, '_blank', 'noopener,noreferrer')}>
                <ExternalLink className="w-4 h-4 mr-2" /> View live menu
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Orders today" value={String(ordersToday)} />
              <Stat label="Revenue today" value={`$${revenueToday.toFixed(2)}`} />
              <Stat label="Average ticket" value={ordersToday ? `$${(revenueToday / ordersToday).toFixed(2)}` : '$0.00'} />
              <Stat label="AI orders" value={String(aiOrders)} />
            </div>
            <OwnerInsights slug={restaurant.slug} compact />
            <RestaurantQrCard slug={restaurant.slug} description="Customers use this link. A draft or paused menu shows a not-available screen until you publish." />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button variant="outline" className="justify-start" onClick={() => navigate('/admin')}><UtensilsCrossed className="w-4 h-4 mr-2" /> Edit menu</Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/onboarding')}><QrCode className="w-4 h-4 mr-2" /> Scan new menu</Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/admin/ordering')}><QrCode className="w-4 h-4 mr-2" /> Download QR</Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/kitchen')}><ChefHat className="w-4 h-4 mr-2" /> Kitchen display</Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate(`/menu/${restaurant.slug}`)}><Mic className="w-4 h-4 mr-2" /> AI cashier</Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/admin/phone')}><Headphones className="w-4 h-4 mr-2" /> Phone AI</Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/admin/drive-thru')}><Monitor className="w-4 h-4 mr-2" /> Drive-thru</Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/admin/ordering-lab')}><Settings className="w-4 h-4 mr-2" /> Ordering lab</Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/admin/payments')}><Wallet className="w-4 h-4 mr-2" /> Payments</Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/admin/integrations')}><Plug className="w-4 h-4 mr-2" /> Integrations</Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/admin/analytics')}><BarChart3 className="w-4 h-4 mr-2" /> Analytics</Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate('/admin/staff')}><Users className="w-4 h-4 mr-2" /> Staff</Button>
              <Button variant="outline" className="justify-start" onClick={() => { track('upgrade_clicked', { restaurant_slug: restaurant.slug }); navigate('/admin/billing'); }}><CreditCard className="w-4 h-4 mr-2" /> Billing</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  );
}

export default OwnerDashboardPage;
