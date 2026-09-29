import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DEMO_CATALOG, DEMO_UPSELLS } from '../../supabase/functions/_shared/demoCatalog.ts';
import { prepareChannelTurn } from '@/lib/ordering/channel';
import { applyOrderTurn, parseModelActions, type CartLine, type OrderChannel } from '@/lib/ordering/engine';

type ChannelChoice = 'mobile' | 'phone' | 'drive_thru';

export default function OrderingLabPage() {
  const navigate = useNavigate();
  const [channel, setChannel] = useState<ChannelChoice>('phone');
  const [utterance, setUtterance] = useState('Give me a bottled water');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [awaiting, setAwaiting] = useState(false);
  const [misses, setMisses] = useState(0);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);

  const run = (event: FormEvent) => {
    event.preventDefault();
    const engineChannel: OrderChannel = channel === 'mobile' ? 'mobile_web' : channel;
    const prepared = prepareChannelTurn({
      channel: engineChannel,
      utterance,
      awaitingConfirmation: awaiting,
      misunderstandingCount: misses,
    });
    const named = DEMO_CATALOG.filter((item) => utterance.toLowerCase().includes(item.name.toLowerCase()));
    const proposals = prepared.blockedSay ? [] : prepared.proposals ?? (
      named.length === 1
        ? parseModelActions({ actions: [{ action: 'add_item', item_id: named[0].id, quantity: 1 }] })
        : named.length > 1
          ? parseModelActions({ actions: [{ action: 'ask_clarification', reason: 'ambiguous_item', candidate_ids: named.map((item) => item.id) }] })
          : parseModelActions({ actions: [{ action: 'ask_clarification', reason: 'unclear_item' }] })
    );
    const result = applyOrderTurn({
      channel: engineChannel,
      locale: 'en',
      catalog: DEMO_CATALOG,
      upsells: DEMO_UPSELLS,
      cart,
      proposals: prepared.proposals ?? proposals,
      alreadyConfirmed: prepared.alreadyConfirmed,
      confirmStyle: channel === 'mobile' ? 'tap' : 'spoken',
      handoffAvailable: false,
      facts: { hours: '11am to 9pm', location: 'Demo lane', prepMinutes: 12 },
    });
    const say = prepared.blockedSay ?? result.say;
    setCart(result.cart);
    setAwaiting(result.awaitingConfirmation);
    setMisses(result.clarification ? misses + 1 : 0);
    setReport({
      channel: engineChannel,
      rawTranscript: utterance,
      parsedIntent: prepared.proposals ?? proposals,
      resolvedItems: result.lines.map((line) => ({ id: line.itemId, name: line.name, total: line.lineTotal })),
      validation: result.rejected,
      cart: result.cart,
      response: say,
      readyToSubmit: result.readyToSubmit,
      handoff: result.handoff,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/dashboard')} aria-label="Back to dashboard">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <p className="kk-kicker">Ordering lab</p>
            <h1 className="text-xl font-semibold">Same engine, every channel</h1>
          </div>
        </div>
      </header>
      <form onSubmit={run} className="max-w-3xl mx-auto p-4 space-y-4">
        <label className="block text-sm font-medium" htmlFor="lab-channel">Channel</label>
        <select id="lab-channel" className="w-full rounded-xl border border-input bg-background px-3 py-2" value={channel} onChange={(event) => setChannel(event.target.value as ChannelChoice)}>
          <option value="mobile">Mobile</option>
          <option value="phone">Phone</option>
          <option value="drive_thru">Drive-thru</option>
        </select>
        <label className="block text-sm font-medium" htmlFor="lab-utterance">Utterance</label>
        <textarea id="lab-utterance" className="w-full min-h-24 rounded-xl border border-input bg-background px-3 py-2" value={utterance} onChange={(event) => setUtterance(event.target.value)} />
        <Button type="submit">Run turn</Button>
        {report && (
          <div className="grid gap-3">
            {Object.entries(report).map(([key, value]) => (
              <section key={key} className="kk-card p-4">
                <h2 className="kk-kicker mb-2">{key}</h2>
                <pre className="text-sm whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
              </section>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}
