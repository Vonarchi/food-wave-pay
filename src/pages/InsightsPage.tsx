import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { answerQuestion, type ActionCard, type InsightReport } from '@/lib/insights';

type StoredAction = ActionCard & { status: string };
type Payload = Omit<InsightReport, 'actions'> & { actions: StoredAction[]; locationNotes?: string[] };

export function OwnerInsights({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const load = async () => {
    const { data, error: invokeError } = await supabase.functions.invoke('insights', { body: { op: 'snapshot', slug } });
    const body = data as { ok?: boolean; error?: string; report?: Payload } | null;
    if (invokeError || !body?.ok || !body.report) {
      setError(body?.error || 'Insights are not available yet.');
      return;
    }
    setError(null);
    setPayload(body.report);
  };

  useEffect(() => {
    void load();
  }, [slug]);

  const decide = async (card: StoredAction, decision: 'approve' | 'reject' | 'publish') => {
    const { data } = await supabase.functions.invoke('insights', { body: { op: 'decide', slug, dedupeKey: card.id, decision } });
    const body = data as { ok?: boolean; error?: string } | null;
    if (!body?.ok) {
      toast.error(body?.error || 'That suggestion was not changed.');
      return;
    }
    toast.success(decision === 'reject' ? 'Suggestion ignored' : 'Saved. No menu, price, or message was sent on its own.');
    await load();
  };

  const ask = (event: FormEvent) => {
    event.preventDefault();
    if (!payload) return;
    setAnswer(answerQuestion(question, payload));
  };

  if (error) return <p className="text-sm text-muted-foreground">{error}</p>;
  if (!payload) return <p className="text-sm text-muted-foreground">Reading this restaurant's orders…</p>;

  const cards = (compact ? payload.actions.slice(0, 3) : payload.actions) as StoredAction[];
  const growth = payload.actions.filter((card) => card.kind === 'upsell' || card.kind === 'promotion' || card.kind === 'campaign' || card.kind === 'retention').slice(0, 3);

  return (
    <div className="space-y-4">
      <section className="kk-card p-5">
        <p className="kk-kicker">Your restaurant health</p>
        <p className="text-3xl font-semibold mt-1">{payload.health.overall == null ? 'Not scored' : payload.health.overall}</p>
        <p className="text-sm text-muted-foreground mt-2">
          {payload.health.overall == null
            ? 'Not enough of your own history is on file to score this restaurant.'
            : `Weighted from the signals that have data. Blank signals are not treated as zero. Last 30 days: ${payload.ordersIn30Days} orders.`}
        </p>
        {!compact && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {payload.health.parts.map((part) => (
              <div key={part.key} className="rounded-xl border border-border p-3">
                <p className="text-sm font-medium">{part.label}{part.score == null ? '' : ` · ${part.score}`}</p>
                <p className="text-xs text-muted-foreground mt-1">{part.reason}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="kk-card p-5">
        <p className="kk-kicker">What the numbers support</p>
        <ul className="mt-2 space-y-2 text-sm">
          {payload.briefing.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </section>

      <section className="space-y-2">
        <p className="kk-kicker">What needs attention</p>
        {cards.length === 0 && <p className="text-sm text-muted-foreground">No suggestion met the evidence thresholds.</p>}
        {cards.map((card) => (
          <article key={card.id} className="kk-card p-4 space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.priority} · {card.effort} effort · {card.status}</p>
            <h3 className="font-semibold">{card.title}</h3>
            <p className="text-sm">{card.evidence}</p>
            <p className="text-sm text-muted-foreground">{card.action}</p>
            <div className="flex flex-wrap gap-2">
              {card.status === 'suggested' && card.kind === 'upsell' && <Button type="button" size="sm" onClick={() => void decide(card, 'approve')}>Accept</Button>}
              {card.status === 'suggested' && card.kind !== 'upsell' && <Button type="button" size="sm" onClick={() => void decide(card, 'approve')}>Approve draft</Button>}
              {card.status === 'suggested' && <Button type="button" size="sm" variant="outline" onClick={() => void decide(card, 'reject')}>Ignore</Button>}
              {card.status === 'approved' && (card.kind === 'promotion' || card.kind === 'campaign') && (
                <Button type="button" size="sm" variant="outline" onClick={() => void decide(card, 'publish')}>Mark active</Button>
              )}
            </div>
          </article>
        ))}
        {compact && <Button type="button" variant="outline" onClick={() => navigate('/admin/insights')}>Open the full briefing</Button>}
      </section>

      {compact && growth.length > 0 && (
        <section className="kk-card p-4">
          <p className="kk-kicker">Growth opportunities</p>
          <ul className="mt-2 text-sm space-y-1">
            {growth.map((card) => <li key={card.id}>{card.title}</li>)}
          </ul>
        </section>
      )}

      {!compact && (
        <>
          <section className="kk-card p-4 space-y-2">
            <p className="kk-kicker">Menu intelligence</p>
            {payload.topItems.length === 0 && <p className="text-sm text-muted-foreground">No item lines on recent orders.</p>}
            {payload.topItems.map((item) => <p key={item.name} className="text-sm">{item.name}: {item.quantity} sold across {item.orders} orders</p>)}
            {payload.lowItems.length > 0 && <p className="text-sm">No orders in this window: {payload.lowItems.map((item) => item.name).join(', ')}.</p>}
            {payload.gaps.map((gap) => <p key={gap} className="text-xs text-muted-foreground">{gap}</p>)}
          </section>
          {(payload.locationNotes ?? []).length > 0 && (
            <section className="kk-card p-4 space-y-2">
              <p className="kk-kicker">Locations</p>
              {payload.locationNotes?.map((note) => <p key={note} className="text-sm">{note}</p>)}
            </section>
          )}
        </>
      )}

      <form className="kk-card p-4 space-y-2" onSubmit={ask}>
        <p className="kk-kicker">Ask Kio</p>
        <input
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Why were sales down yesterday?"
          aria-label="Ask about this restaurant"
        />
        <Button type="submit" size="sm" disabled={!question.trim()}>Ask</Button>
        {answer && <p className="text-sm">{answer}</p>}
      </form>
    </div>
  );
}

export default function InsightsPage() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState('');

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const truck = await supabase.from('food_trucks').select('slug').eq('owner_id', data.user.id).limit(1).maybeSingle();
      if (truck.data?.slug) setSlug(truck.data.slug);
    });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Back to dashboard" onClick={() => navigate('/admin/dashboard')}><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <p className="kk-kicker">Owner briefing</p>
            <h1 className="text-xl font-semibold">What the numbers support</h1>
          </div>
        </div>
      </header>
      <div className="max-w-3xl mx-auto p-4">
        {slug ? <OwnerInsights slug={slug} /> : <p className="text-sm text-muted-foreground">Sign in as the restaurant owner to see this briefing.</p>}
      </div>
    </div>
  );
}
