import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { track } from '@/lib/analytics';
import { readCampaign } from '@/lib/commerce';
import { importMenuFromGuestFile, type ImportedMenuItem } from '@/lib/menuImport';
import { friendlySupabaseError, isLowConfidenceItem } from '@/lib/restaurant';
import { hasScanDraft, loadScanDraft, saveScanDraft } from '@/lib/scanDraft';
import { supabase } from '@/integrations/supabase/client';

type Phase = 'capture' | 'working' | 'preview';

/**
 * Flyer QR landing: photograph the paper menu before any signup.
 * Draft items stay in sessionStorage until the owner creates an account.
 */
export default function ScanFirstPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const openedCamera = useRef(false);

  const [phase, setPhase] = useState<Phase>('capture');
  const [importStatus, setImportStatus] = useState('');
  const [drafts, setDrafts] = useState<ImportedMenuItem[]>([]);
  const [campaign, setCampaign] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(drafts.map((item) => item.category).filter(Boolean))],
    [drafts]
  );

  useEffect(() => {
    const fromQuery = readCampaign(window.location.search);
    const fromSession = sessionStorage.getItem('kk-campaign');
    const next = fromQuery ?? (fromSession && readCampaign(`?campaign=${fromSession}`) ? fromSession : null);
    if (next) {
      sessionStorage.setItem('kk-campaign', next);
      setCampaign(next);
      void supabase.from('campaign_visits').insert({ campaign: next, event_name: 'visit' }).then(({ error }) => {
        if (error) console.warn('[campaign]', error.message);
      });
    }

    const existing = loadScanDraft();
    if (existing) {
      setDrafts(existing.items);
      setPhase('preview');
      if (existing.campaign) setCampaign(existing.campaign);
    }
  }, [searchParams]);

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      navigate(hasScanDraft() ? '/onboarding' : '/admin/dashboard', { replace: true });
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (phase !== 'capture' || openedCamera.current || authLoading || user) return;
    openedCamera.current = true;
    const timer = window.setTimeout(() => cameraRef.current?.click(), 400);
    return () => window.clearTimeout(timer);
  }, [phase, authLoading, user]);

  const runImport = async (file: File) => {
    setPhase('working');
    setImportStatus('Scanning menu…');
    const beats = ['Finding categories…', 'Reading items…', 'Checking prices…', 'Building your digital menu…'];
    const timers = beats.map((label, index) => window.setTimeout(() => setImportStatus(label), (index + 1) * 900));
    track('menu_upload_started');
    const failsafe = window.setTimeout(() => {
      setPhase('capture');
      setImportStatus('');
      toast.error('That took too long. Try a smaller photo.');
    }, 200_000);
    try {
      const items = await importMenuFromGuestFile(file);
      saveScanDraft(items, campaign);
      setDrafts(items);
      track('menu_extraction_completed', { item_count: items.length });
      toast.success(`Found ${items.length} items — create an account to keep them.`);
      setPhase('preview');
    } catch (error) {
      toast.error(friendlySupabaseError(error, 'Could not read that menu.'));
      setPhase('capture');
    } finally {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(failsafe);
      setImportStatus('');
    }
  };

  const updateDraft = (index: number, patch: Partial<ImportedMenuItem>) => {
    setDrafts((items) => {
      const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
      saveScanDraft(next, campaign);
      return next;
    });
  };

  const keepMenu = () => {
    saveScanDraft(drafts, campaign);
    const qs = campaign ? `?campaign=${encodeURIComponent(campaign)}&from=scan` : '?from=scan';
    navigate(`/signup${qs}`);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto p-4 pb-28">
        <img src="/logo.png?v=3" alt="KioKitchen" className="h-16 w-auto mx-auto mb-4 object-contain" width={320} height={160} />

        {phase === 'capture' && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold text-center">Photograph your menu</h1>
            <p className="text-sm text-muted-foreground text-center">
              No account yet. Take a clear photo — we&apos;ll build your digital menu first.
            </p>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void runImport(file);
                e.target.value = '';
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void runImport(file);
                e.target.value = '';
              }}
            />
            <Button variant="cart" size="lg" className="w-full h-16 text-base" onClick={() => cameraRef.current?.click()}>
              <Camera className="w-5 h-5 mr-2" /> Open camera
            </Button>
            <Button variant="outline" size="lg" className="w-full h-14" onClick={() => fileRef.current?.click()}>
              <Upload className="w-5 h-5 mr-2" /> Upload photo or PDF
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate(campaign ? `/signup?campaign=${encodeURIComponent(campaign)}` : '/signup')}>
              Skip — create account first
            </Button>
          </div>
        )}

        {phase === 'working' && (
          <div className="rounded-xl border border-border p-8 flex flex-col items-center gap-4 text-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-base font-medium">{importStatus || 'Working…'}</p>
            <p className="text-sm text-muted-foreground">Hang tight — this usually takes under a minute.</p>
          </div>
        )}

        {phase === 'preview' && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">Your menu is ready</h1>
            <div className="kk-card p-4 text-sm space-y-1">
              <p>{drafts.length} items found</p>
              <p>{categories.length} categories</p>
              <p>{drafts.filter((item) => isLowConfidenceItem(item)).length} items need review</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Edit anything that looks off. Create a free account next so we can save this menu to your restaurant.
            </p>
            {categories.map((category) => (
              <div key={category}>
                <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{category}</h2>
                {drafts.map((item, index) =>
                  item.category === category ? (
                    <div key={`${category}-${index}`} className="border border-border rounded-xl p-3 mb-2 space-y-2">
                      {isLowConfidenceItem(item) && (
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Check this — price or reading was uncertain</p>
                      )}
                      <input
                        className="w-full text-base font-medium bg-transparent focus:outline-none"
                        value={item.name}
                        onChange={(e) => updateDraft(index, { name: e.target.value })}
                      />
                      <input
                        className="w-full text-sm text-muted-foreground bg-transparent focus:outline-none"
                        value={item.description}
                        placeholder="Description"
                        onChange={(e) => updateDraft(index, { description: e.target.value })}
                      />
                      <div className="flex gap-2 items-center">
                        <span className="text-sm">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-24 text-base bg-transparent focus:outline-none"
                          value={item.price}
                          onChange={(e) => updateDraft(index, { price: parseFloat(e.target.value) || 0 })}
                        />
                        <input
                          className="flex-1 text-sm bg-secondary rounded px-2 py-1"
                          value={item.category}
                          onChange={(e) => updateDraft(index, { category: e.target.value || 'Main' })}
                        />
                        <button type="button" aria-label="Delete item" onClick={() => {
                          setDrafts((rows) => {
                            const next = rows.filter((_, i) => i !== index);
                            saveScanDraft(next, campaign);
                            return next;
                          });
                        }}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            ))}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setDrafts((rows) => {
                  const next = [...rows, { name: '', description: '', price: 0, category: 'Main', modifiers: [], available: true }];
                  saveScanDraft(next, campaign);
                  return next;
                });
              }}
            >
              <Plus className="w-4 h-4 mr-2" /> Add an item
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => { setPhase('capture'); openedCamera.current = false; }}>
              Retake photo
            </Button>
          </div>
        )}
      </div>

      {phase === 'preview' && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border safe-bottom">
          <div className="max-w-lg mx-auto">
            <Button variant="cart" size="lg" className="w-full" disabled={drafts.filter((item) => item.name.trim()).length === 0} onClick={keepMenu}>
              Create account to keep this menu
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
