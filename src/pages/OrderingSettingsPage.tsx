import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { friendlySupabaseError, menuStatusLabel, menuStatusPatch, readMenuStatus, type MenuStatus } from '@/lib/restaurant';
import { track } from '@/lib/analytics';

const DEFAULT_GREETING = 'Welcome to {{restaurant_name}}. What can I get started for you?';

type UpsellRow = { id: string; source_item_id: string; suggested_item_id: string };
type MenuChoice = { id: string; name: string };

const OrderingSettingsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [slug, setSlug] = useState<string | null>(null);
  const [status, setStatus] = useState<MenuStatus>('draft');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [voiceOn, setVoiceOn] = useState(false);
  const [upsellsOn, setUpsellsOn] = useState(true);
  const [spokenOn, setSpokenOn] = useState(false);
  const [greeting, setGreeting] = useState(DEFAULT_GREETING);
  const [menuChoices, setMenuChoices] = useState<MenuChoice[]>([]);
  const [upsells, setUpsells] = useState<UpsellRow[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [suggestedId, setSuggestedId] = useState('');

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data, error } = await supabase
        .from('food_trucks')
        .select('slug, menu_status, is_published, voice_ordering_enabled, upsells_enabled, spoken_responses_enabled, voice_greeting')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle();
      if (error) toast.error(friendlySupabaseError(error, 'Could not load settings.'));
      if (data) {
        setSlug(data.slug);
        setStatus(readMenuStatus(data));
        setVoiceOn(Boolean(data.voice_ordering_enabled));
        setUpsellsOn(data.upsells_enabled !== false);
        setSpokenOn(Boolean(data.spoken_responses_enabled));
        setGreeting(data.voice_greeting || DEFAULT_GREETING);
        const [{ data: items }, { data: rules }] = await Promise.all([
          supabase.from('menu_items').select('id, name').eq('truck_id', data.slug).order('name'),
          supabase.from('menu_upsells').select('id, source_item_id, suggested_item_id').eq('restaurant_slug', data.slug),
        ]);
        setMenuChoices(items ?? []);
        setUpsells(rules ?? []);
      }
      setLoading(false);
    };
    void load();
  }, [user]);

  const setMenu = async (next: MenuStatus) => {
    if (!slug || !user) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('food_trucks').update(menuStatusPatch(next)).eq('slug', slug).eq('owner_id', user.id);
      if (error) throw error;
      setStatus(next);
      if (next === 'published') track('menu_published', { restaurant_slug: slug });
      toast.success(next === 'published' ? 'Menu is live' : next === 'paused' ? 'Menu paused' : 'Menu saved as a draft');
    } catch (error) {
      toast.error(friendlySupabaseError(error, 'Could not update the menu.'));
    } finally {
      setBusy(false);
    }
  };

  const saveVoice = async () => {
    if (!slug || !user) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('food_trucks')
        .update({
          voice_ordering_enabled: voiceOn,
          upsells_enabled: upsellsOn,
          spoken_responses_enabled: spokenOn,
          voice_greeting: greeting.trim().slice(0, 240) || null,
        })
        .eq('slug', slug)
        .eq('owner_id', user.id);
      if (error) throw error;
      toast.success('Voice ordering saved');
    } catch (error) {
      toast.error(friendlySupabaseError(error, 'Could not save voice ordering.'));
    } finally {
      setBusy(false);
    }
  };

  const addUpsell = async () => {
    if (!slug || !sourceId || !suggestedId || sourceId === suggestedId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from('menu_upsells')
        .insert({ restaurant_slug: slug, source_item_id: sourceId, suggested_item_id: suggestedId })
        .select('id, source_item_id, suggested_item_id')
        .single();
      if (error) throw error;
      setUpsells((current) => [...current, data]);
      toast.success('Upsell saved');
    } catch (error) {
      toast.error(friendlySupabaseError(error, 'Could not save that upsell.'));
    } finally {
      setBusy(false);
    }
  };

  const removeUpsell = async (id: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('menu_upsells').delete().eq('id', id);
      if (error) throw error;
      setUpsells((current) => current.filter((row) => row.id !== id));
    } catch (error) {
      toast.error(friendlySupabaseError(error, 'Could not remove that upsell.'));
    } finally {
      setBusy(false);
    }
  };

  const itemName = (id: string) => menuChoices.find((item) => item.id === id)?.name ?? 'Menu item';

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 bg-background border-b border-border p-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/dashboard')}><ArrowLeft className="w-5 h-5" /></Button>
          <h1 className="text-xl font-bold">Ordering settings</h1>
        </div>
      </header>
      <div className="max-w-lg mx-auto p-4 space-y-8 pb-16">
        {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : !slug ? (
          <Button onClick={() => navigate('/onboarding')}>Create your restaurant</Button>
        ) : (
          <>
            <section className="space-y-3">
              <p className="text-sm text-muted-foreground">Menu status: <span className="font-medium text-foreground">{menuStatusLabel(status)}</span></p>
              <p className="text-sm text-muted-foreground">
                Published menus are public and can take pickup orders. Pause hides the menu without deleting items. Draft is the same for customers: they can’t open it yet.
              </p>
              <div className="flex flex-col gap-2">
                <Button variant="cart" disabled={busy || status === 'published'} onClick={() => void setMenu('published')}>Publish menu</Button>
                <Button variant="outline" disabled={busy || status === 'paused'} onClick={() => void setMenu('paused')}>Pause public menu</Button>
                <Button variant="outline" disabled={busy || status === 'draft'} onClick={() => void setMenu('draft')}>Mark as draft</Button>
              </div>
            </section>

            <section className="space-y-4 border-t border-border pt-6">
              <h2 className="text-lg font-semibold">Voice ordering</h2>
              <p className="text-sm text-muted-foreground">
                Customers can speak an order on the QR menu. Prices and options still come from your menu, not from the assistant.
              </p>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="voice-on">Voice ordering</Label>
                <Switch id="voice-on" checked={voiceOn} onCheckedChange={setVoiceOn} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="upsell-on">AI upselling</Label>
                <Switch id="upsell-on" checked={upsellsOn} onCheckedChange={setUpsellsOn} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="spoken-on">Spoken responses</Label>
                <Switch id="spoken-on" checked={spokenOn} onCheckedChange={setSpokenOn} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="greeting">Greeting</Label>
                <Textarea
                  id="greeting"
                  value={greeting}
                  maxLength={240}
                  onChange={(event) => setGreeting(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">Use {'{{restaurant_name}}'} where the restaurant name should go.</p>
              </div>
              <Button onClick={() => void saveVoice()} disabled={busy}>Save voice settings</Button>
            </section>

            <section className="space-y-3 border-t border-border pt-6">
              <h2 className="text-lg font-semibold">Upsell suggestions</h2>
              <p className="text-sm text-muted-foreground">
                When someone orders the first item, the cashier may offer the second. Only items on this menu can be suggested.
              </p>
              <div className="grid gap-2">
                <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={sourceId} onChange={(event) => setSourceId(event.target.value)} aria-label="When they order">
                  <option value="">When they order...</option>
                  {menuChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={suggestedId} onChange={(event) => setSuggestedId(event.target.value)} aria-label="Suggest">
                  <option value="">Suggest...</option>
                  {menuChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <Button variant="outline" disabled={busy || !sourceId || !suggestedId || sourceId === suggestedId} onClick={() => void addUpsell()}>
                  Add upsell
                </Button>
              </div>
              <ul className="space-y-2">
                {upsells.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{itemName(row.source_item_id)} → {itemName(row.suggested_item_id)}</span>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void removeUpsell(row.id)}>Remove</Button>
                  </li>
                ))}
              </ul>
            </section>

            <Button variant="ghost" onClick={() => { track('upgrade_clicked', { restaurant_slug: slug }); navigate('/admin/billing'); }}>
              Ordering upgrades and billing
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default OrderingSettingsPage;
