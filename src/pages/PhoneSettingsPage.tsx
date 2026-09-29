import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

type PhoneSettings = {
  slug: string;
  name: string;
  phone_ordering_enabled: boolean;
  phone_greeting: string;
  phone_fallback_number: string;
  phone_hours: string;
  phone_accept_orders: boolean;
  phone_speak_prices: boolean;
  phone_language: string;
  phone_pay_at_pickup: boolean;
  phone_payment_link_enabled: boolean;
  ordering_phone_number: string;
  phone_prep_minutes: string;
  upsells_enabled: boolean;
};

const EMPTY: PhoneSettings = {
  slug: '',
  name: '',
  phone_ordering_enabled: false,
  phone_greeting: 'Thanks for calling {{restaurant_name}}. I can help you place an order.',
  phone_fallback_number: '',
  phone_hours: '',
  phone_accept_orders: true,
  phone_speak_prices: true,
  phone_language: 'en',
  phone_pay_at_pickup: true,
  phone_payment_link_enabled: false,
  ordering_phone_number: '',
  phone_prep_minutes: '',
  upsells_enabled: true,
};

export default function PhoneSettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [settings, setSettings] = useState<PhoneSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testSay, setTestSay] = useState('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from('food_trucks')
        .select('slug, name, phone_ordering_enabled, phone_greeting, phone_fallback_number, phone_hours, phone_accept_orders, phone_speak_prices, phone_language, phone_pay_at_pickup, phone_payment_link_enabled, ordering_phone_number, phone_prep_minutes, upsells_enabled')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error(error?.message ?? 'Phone settings are not available yet.');
        setLoading(false);
        return;
      }
      setSettings({
        slug: data.slug,
        name: data.name,
        phone_ordering_enabled: data.phone_ordering_enabled,
        phone_greeting: data.phone_greeting || EMPTY.phone_greeting,
        phone_fallback_number: data.phone_fallback_number ?? '',
        phone_hours: data.phone_hours ?? '',
        phone_accept_orders: data.phone_accept_orders,
        phone_speak_prices: data.phone_speak_prices,
        phone_language: data.phone_language || 'en',
        phone_pay_at_pickup: data.phone_pay_at_pickup,
        phone_payment_link_enabled: data.phone_payment_link_enabled,
        ordering_phone_number: data.ordering_phone_number ?? '',
        phone_prep_minutes: data.phone_prep_minutes ? String(data.phone_prep_minutes) : '',
        upsells_enabled: data.upsells_enabled,
      });
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings.slug) return;
    setSaving(true);
    const prep = settings.phone_prep_minutes.trim();
    const { error } = await supabase
      .from('food_trucks')
      .update({
        phone_ordering_enabled: settings.phone_ordering_enabled,
        phone_greeting: settings.phone_greeting.slice(0, 240),
        phone_fallback_number: settings.phone_fallback_number.trim() || null,
        phone_hours: settings.phone_hours.trim() || null,
        phone_accept_orders: settings.phone_accept_orders,
        phone_speak_prices: settings.phone_speak_prices,
        phone_language: settings.phone_language === 'es' ? 'es' : 'en',
        phone_pay_at_pickup: settings.phone_pay_at_pickup,
        phone_payment_link_enabled: settings.phone_payment_link_enabled,
        ordering_phone_number: settings.ordering_phone_number.trim() || null,
        phone_prep_minutes: prep ? Math.min(180, Math.max(1, Number(prep) || 1)) : null,
        upsells_enabled: settings.upsells_enabled,
      })
      .eq('slug', settings.slug);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success('Phone settings saved');
  };

  const testCall = async () => {
    if (!settings.slug) return;
    setTesting(true);
    setTestSay('');
    const started = await supabase.functions.invoke('channel-order', {
      body: { op: 'start', slug: settings.slug, channel: 'phone', provider: 'test' },
    });
    const startData = started.data as { ok?: boolean; sessionId?: string; greeting?: string; error?: string } | null;
    if (started.error || !startData?.ok || !startData.sessionId) {
      setTesting(false);
      toast.error(startData?.error || started.error?.message || 'Test call could not start.');
      return;
    }
    const turned = await supabase.functions.invoke('channel-order', {
      body: {
        op: 'turn',
        slug: settings.slug,
        channel: 'phone',
        sessionId: startData.sessionId,
        utterance: 'What are your hours?',
        turnId: crypto.randomUUID(),
      },
    });
    const turnData = turned.data as { say?: string; error?: string } | null;
    setTestSay([startData.greeting, turnData?.say || turnData?.error].filter(Boolean).join(' '));
    setTesting(false);
  };

  const set = (patch: Partial<PhoneSettings>) => setSettings((current) => ({ ...current, ...patch }));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/dashboard')} aria-label="Back to dashboard">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <p className="kk-kicker">AI phone ordering</p>
            <h1 className="text-xl font-semibold">{settings.name || 'Phone'}</h1>
          </div>
          <span className={`kk-status ml-auto ${settings.phone_ordering_enabled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
            {settings.phone_ordering_enabled ? 'Active' : 'Inactive'}
          </span>
        </div>
      </header>
      <form onSubmit={(event) => void save(event)} className="max-w-2xl mx-auto p-4 space-y-4 pb-16">
        {loading && <p className="text-sm text-muted-foreground">Loading phone settings…</p>}
        <p className="text-sm text-muted-foreground">
          Live calls need a phone provider connected to this restaurant. Test Call uses the same ordering engine without a carrier.
          The assistant will not take a card number.
        </p>
        <Toggle label="AI phone ordering" checked={settings.phone_ordering_enabled} onChange={(value) => set({ phone_ordering_enabled: value })} />
        <Field label="Phone number" value={settings.ordering_phone_number} onChange={(value) => set({ ordering_phone_number: value })} placeholder="Not connected yet" />
        <label className="block space-y-1">
          <span className="text-sm font-medium">Greeting</span>
          <textarea
            className="w-full min-h-24 rounded-xl border border-input bg-background px-3 py-2 text-sm"
            value={settings.phone_greeting}
            maxLength={240}
            onChange={(event) => set({ phone_greeting: event.target.value })}
          />
        </label>
        <Field label="Ordering hours" value={settings.phone_hours} onChange={(value) => set({ phone_hours: value })} placeholder="11:00–21:00" />
        <Field label="Human fallback number" value={settings.phone_fallback_number} onChange={(value) => set({ phone_fallback_number: value })} placeholder="Optional" />
        <Field label="Typical prep minutes" value={settings.phone_prep_minutes} onChange={(value) => set({ phone_prep_minutes: value })} placeholder="15" />
        <label className="block space-y-1">
          <span className="text-sm font-medium">Language</span>
          <select className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" value={settings.phone_language} onChange={(event) => set({ phone_language: event.target.value })}>
            <option value="en">English</option>
            <option value="es">Spanish</option>
          </select>
        </label>
        <Toggle label="Accept phone orders" checked={settings.phone_accept_orders} onChange={(value) => set({ phone_accept_orders: value })} />
        <Toggle label="Pay at pickup" checked={settings.phone_pay_at_pickup} onChange={(value) => set({ phone_pay_at_pickup: value })} />
        <Toggle label="Hold a payment link" checked={settings.phone_payment_link_enabled} onChange={(value) => set({ phone_payment_link_enabled: value })} />
        <Toggle label="Upselling" checked={settings.upsells_enabled} onChange={(value) => set({ upsells_enabled: value })} />
        <Toggle label="Speak prices" checked={settings.phone_speak_prices} onChange={(value) => set({ phone_speak_prices: value })} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving || loading}>{saving ? 'Saving…' : 'Save'}</Button>
          <Button type="button" variant="outline" disabled={testing || !settings.slug} onClick={() => void testCall()}>
            {testing ? 'Calling…' : 'Test Call'}
          </Button>
        </div>
        {testSay && <p className="kk-card p-4 text-sm" aria-live="polite">{testSay}</p>}
      </form>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="kk-card px-4 py-3 flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <input type="checkbox" className="h-5 w-5" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
