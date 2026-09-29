import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export default function PayLinkPage() {
  const { orderId = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const [message, setMessage] = useState('Checking this order…');
  const [total, setTotal] = useState<number | null>(null);
  const [found, setFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const slug = params.get('r') ?? 'demo';
    void supabase.functions.invoke('channel-order', {
      body: { op: 'payment_lookup', slug, orderId, token, channel: 'phone' },
    }).then(({ data, error }) => {
      if (cancelled) return;
      const payload = data as { ok?: boolean; total?: number; message?: string; error?: string } | null;
      if (error || !payload?.ok) {
        setMessage(payload?.error || 'This payment link is not valid.');
        return;
      }
      setTotal(Number(payload.total));
      setFound(true);
      setMessage(payload.message || 'Pay when you pick up.');
    });
    return () => {
      cancelled = true;
    };
  }, [orderId, token, params]);

  return (
    <main className="min-h-screen bg-background px-6 py-16">
      <div className="max-w-md mx-auto kk-card p-6 space-y-3">
        <p className="kk-kicker">Pickup payment</p>
        <h1 className="text-2xl font-semibold">{found ? 'Your order is confirmed' : 'Payment link'}</h1>
        {total !== null && <p className="text-3xl font-semibold">${total.toFixed(2)}</p>}
        <p className="text-sm text-muted-foreground" role="status">{message}</p>
      </div>
    </main>
  );
}
