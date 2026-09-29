import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

type Turn = {
  ok?: boolean;
  error?: string;
  sessionId?: string;
  say?: string;
  status?: string;
  lines?: { name: string; quantity: number; lineTotal: number; modifiers: { optionName: string }[] }[];
  total?: number;
  transcript?: { role: string; text: string }[];
  clarification?: string | null;
};

const STATUS = ['listening', 'thinking', 'speaking', 'waiting', 'takeover'] as const;

export default function DriveThruPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [slug, setSlug] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [name, setName] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [utterance, setUtterance] = useState('');
  const [confidence, setConfidence] = useState('0.9');
  const [status, setStatus] = useState<string>('waiting');
  const [turn, setTurn] = useState<Turn | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from('food_trucks')
      .select('slug, name, drive_thru_enabled')
      .eq('owner_id', user.id)
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          toast.error(error?.message ?? 'Drive-thru is not available yet.');
          return;
        }
        setSlug(data.slug);
        setName(data.name);
        setEnabled(data.drive_thru_enabled);
      });
  }, [user]);

  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    setStatus('thinking');
    const { data, error } = await supabase.functions.invoke('channel-order', { body: { slug, channel: 'drive_thru', sessionId, ...body } });
    setBusy(false);
    const payload = (data ?? {}) as Turn;
    if (error || payload.ok === false) {
      setStatus('waiting');
      toast.error(payload.error || error?.message || 'Drive-thru request failed.');
      return null;
    }
    setTurn(payload);
    if (payload.sessionId) setSessionId(payload.sessionId);
    setStatus(payload.status || 'listening');
    return payload;
  };

  const enable = async () => {
    const { error } = await supabase.from('food_trucks').update({ drive_thru_enabled: !enabled }).eq('slug', slug);
    if (error) toast.error(error.message);
    else setEnabled(!enabled);
  };

  const onUtterance = (event: FormEvent) => {
    event.preventDefault();
    const text = utterance.trim();
    if (!text || !sessionId) return;
    setUtterance('');
    setStatus('listening');
    void call({ op: 'turn', utterance: text, transcriptConfidence: Number(confidence), turnId: crypto.randomUUID() });
  };

  const lines = turn?.lines ?? [];
  const low = Number(confidence) < 0.6;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-foreground text-background">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-background" onClick={() => navigate('/admin/dashboard')} aria-label="Back to dashboard">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <p className="text-xs uppercase tracking-widest text-background/70">Drive-thru monitor</p>
            <h1 className="text-lg font-semibold">{name || 'Current car'}</h1>
          </div>
          <span className="kk-status ml-auto bg-background text-foreground" aria-live="polite">{status.replace('_', ' ')}</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 grid gap-4 lg:grid-cols-[1.1fr_1fr_0.9fr]">
        <section className="kk-card p-4 space-y-3" aria-label="Live conversation">
          <p className="kk-kicker">Current car</p>
          <div className="min-h-48 space-y-2 text-sm" aria-live="polite">
            {(turn?.transcript ?? []).map((line, index) => (
              <p key={`${index}-${line.text}`}><span className="font-medium capitalize">{line.role}: </span>{line.text}</p>
            ))}
            {!turn && <p className="text-muted-foreground">Open a lane to start a simulated car.</p>}
          </div>
          <form onSubmit={onUtterance} className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="lane-utterance">Microphone simulation</label>
            <textarea id="lane-utterance" className="w-full min-h-20 rounded-xl border border-input bg-background px-3 py-2 text-sm" value={utterance} onChange={(event) => setUtterance(event.target.value)} placeholder="Give me a large fry" />
            <label className="block text-xs text-muted-foreground" htmlFor="confidence">Transcription confidence {confidence}</label>
            <input id="confidence" type="range" min="0.2" max="1" step="0.05" value={confidence} onChange={(event) => setConfidence(event.target.value)} className="w-full" />
            {low && <p className="text-sm text-warning" role="status">Low confidence. The cashier will ask again instead of guessing.</p>}
            <Button type="submit" disabled={!sessionId || busy}>Send speech</Button>
          </form>
        </section>

        <section className="kk-card p-4 space-y-3" aria-label="Current order">
          <p className="kk-kicker">Current order</p>
          {lines.length === 0 ? <p className="text-sm text-muted-foreground">Nothing on the order yet.</p> : lines.map((line) => (
            <div key={`${line.name}-${line.quantity}`} className="flex justify-between gap-3 text-sm">
              <span>
                {line.quantity} {line.name}
                {line.modifiers.length > 0 && <span className="block text-muted-foreground">{line.modifiers.map((mod) => mod.optionName).join(', ')}</span>}
              </span>
              <span>${line.lineTotal.toFixed(2)}</span>
            </div>
          ))}
          <p className="text-lg font-semibold">Total ${Number(turn?.total ?? 0).toFixed(2)}</p>
          {turn?.say && <p className="text-sm border-t border-border pt-3">{turn.say}</p>}
        </section>

        <section className="kk-card p-4 space-y-3" aria-label="Staff controls">
          <p className="kk-kicker">AI status</p>
          <ul className="grid grid-cols-2 gap-2 text-xs">
            {STATUS.map((item) => (
              <li key={item} className={`rounded-lg border px-2 py-2 text-center ${status === item ? 'border-foreground font-semibold' : 'border-border text-muted-foreground'}`}>{item}</li>
            ))}
          </ul>
          <Button type="button" variant="outline" disabled={!slug || busy} onClick={() => void enable()}>{enabled ? 'Drive-thru on' : 'Turn drive-thru on'}</Button>
          <Button type="button" disabled={!slug || busy} onClick={() => void call({ op: 'start', provider: 'simulation', lane: '1' })}>Open lane</Button>
          <Button type="button" variant="outline" disabled={!sessionId || busy} onClick={() => void call({ op: 'takeover', reason: 'staff_takeover' })}>Take over</Button>
          <Button type="button" variant="outline" disabled={!sessionId || busy} onClick={() => void call({ op: 'release' })}>Return to AI</Button>
          <label className="block text-sm font-medium" htmlFor="staff-message">Send message / speak</label>
          <input id="staff-message" className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" value={message} onChange={(event) => setMessage(event.target.value)} />
          <Button type="button" variant="outline" disabled={!sessionId || busy || !message.trim()} onClick={() => { const text = message.trim(); setMessage(''); void call({ op: 'staff_message', text }); }}>Speak</Button>
          <Button type="button" variant="outline" disabled={!sessionId || busy} onClick={() => void call({ op: 'simulate', proposals: [{ action: 'cancel_order' }] })}>Cancel order</Button>
          <Button type="button" disabled={!sessionId || busy} onClick={() => void call({ op: 'submit', confirmed: true })}>Confirm order</Button>
          <Button type="button" variant="ghost" disabled={!sessionId || busy} onClick={() => { setSessionId(null); setTurn(null); void call({ op: 'next' }); }}>Next customer</Button>
        </section>
      </div>
    </div>
  );
}
