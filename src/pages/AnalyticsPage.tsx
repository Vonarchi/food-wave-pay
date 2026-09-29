import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { summarizeOrders, type AnalyticsSummary } from '@/lib/commerce';
import { supabase } from '@/integrations/supabase/client';

const EMPTY: AnalyticsSummary = { orders: 0, revenue: 0, averageTicket: 0, cancelled: 0, byChannel: {} };

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [summary, setSummary] = useState<AnalyticsSummary>(EMPTY);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const truck = await supabase.from('food_trucks').select('slug').eq('owner_id', user.id).limit(1).maybeSingle();
      if (!truck.data?.slug) return;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const orders = await supabase.from('orders').select('total, source, status, is_test, created_at').eq('truck_id', truck.data.slug).gte('created_at', start.toISOString());
      if (orders.error || !orders.data) return;
      setSummary(summarizeOrders(orders.data.map((row) => ({
        total: Number(row.total),
        source: row.source,
        status: row.status,
        isTest: row.is_test,
        createdAt: row.created_at,
      }))));
    })();
  }, [user]);

  const channels = Object.entries(summary.byChannel);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Back to dashboard" onClick={() => navigate('/admin/dashboard')}><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <p className="kk-kicker">Today</p>
            <h1 className="text-xl font-semibold">Restaurant analytics</h1>
          </div>
        </div>
      </header>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Orders" value={String(summary.orders)} />
          <Stat label="Revenue" value={`$${summary.revenue.toFixed(2)}`} />
          <Stat label="Average ticket" value={`$${summary.averageTicket.toFixed(2)}`} />
          <Stat label="Cancelled" value={String(summary.cancelled)} />
        </div>
        <section className="kk-card p-4">
          <h2 className="font-semibold mb-3">By channel</h2>
          {channels.length === 0 ? <p className="text-sm text-muted-foreground">No orders yet today.</p> : channels.map(([channel, bucket]) => (
            <div key={channel} className="flex justify-between text-sm py-1">
              <span>{channel}</span>
              <span>{bucket.orders} · ${bucket.revenue.toFixed(2)}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="kk-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold mt-1">{value}</p></div>;
}
