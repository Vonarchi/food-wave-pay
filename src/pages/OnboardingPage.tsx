import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Camera, ChevronRight, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { track } from '@/lib/analytics';
import { importMenuFromFile, type ImportedMenuItem } from '@/lib/menuImport';
import {
  RESTAURANT_TYPES,
  friendlySupabaseError,
  isLowConfidenceItem,
  menuStatusPatch,
  readMenuStatus,
  slugifyRestaurantName,
  type MenuStatus,
} from '@/lib/restaurant';
import { clearScanDraft, loadScanDraft } from '@/lib/scanDraft';
import { RestaurantQrCard } from '@/components/restaurant/RestaurantQrCard';
import type { Json } from '@/integrations/supabase/types';

const PROGRESS = ['Restaurant', 'Scan Menu', 'Review', 'Preview', 'Publish'] as const;

const OnboardingPage = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [businessType, setBusinessType] = useState<string>(RESTAURANT_TYPES[0]);
  const [slug, setSlug] = useState('');
  const [menuStatus, setMenuStatus] = useState<MenuStatus>('draft');
  const [drafts, setDrafts] = useState<ImportedMenuItem[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [fromScanDraft, setFromScanDraft] = useState(false);

  const categories = useMemo(
    () => [...new Set(drafts.map((item) => item.category).filter(Boolean))],
    [drafts]
  );

  useEffect(() => {
    const draft = loadScanDraft();
    if (!draft?.items.length) return;
    setDrafts(draft.items);
    setFromScanDraft(true);
    setStep(0);
  }, []);

  useEffect(() => {
    if (profile?.restaurant_name) setRestaurantName(profile.restaurant_name);
    if (profile?.phone) setPhone(profile.phone);
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from('food_trucks')
        .select('slug, name, location, phone, website, business_type, menu_status, is_published')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setSlug(data.slug);
      setRestaurantName(data.name || '');
      setLocation(data.location || '');
      setPhone(data.phone || '');
      setWebsite(data.website || '');
      setBusinessType(data.business_type || RESTAURANT_TYPES[0]);
      setMenuStatus(readMenuStatus(data));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    const nextSlug = slug || slugifyRestaurantName(restaurantName);
    if (!restaurantName.trim() || !nextSlug) {
      toast.error('Enter a restaurant name with letters or numbers.');
      return;
    }
    if (!location.trim()) {
      toast.error('Add an address or area so customers know where you are.');
      return;
    }
    setSaving(true);
    try {
      // Restaurant row is the source of truth for onboarding. Profile sync is best-effort
      // so a profiles privilege/trigger failure cannot block creating the menu.
      if (!slug) {
        const { error: insertError } = await supabase.from('food_trucks').insert({
          slug: nextSlug,
          name: restaurantName.trim(),
          location: location.trim(),
          phone: phone.trim() || null,
          website: website.trim() || null,
          business_type: businessType,
          owner_id: user.id,
          menu_status: 'draft',
          is_published: false,
        });
        if (insertError) throw insertError;
        setSlug(nextSlug);
        track('restaurant_created', { restaurant_slug: nextSlug });
      } else {
        const { error: updateError } = await supabase
          .from('food_trucks')
          .update({
            name: restaurantName.trim(),
            location: location.trim(),
            phone: phone.trim() || null,
            website: website.trim() || null,
            business_type: businessType,
          })
          .eq('slug', slug)
          .eq('owner_id', user.id);
        if (updateError) throw updateError;
      }

      const profileFields = {
        full_name: profile?.full_name || null,
        restaurant_name: restaurantName.trim(),
        phone: phone.trim() || null,
        email: user.email,
      };
      const { error: profileError } = await supabase
        .from('profiles')
        .update(profileFields)
        .eq('id', user.id);
      if (profileError) {
        console.warn('[kiokitchen:onboarding] profile sync skipped', profileError.message);
      }

      const activeSlug = slug || nextSlug;
      if (logoFile) {
        const ext = logoFile.name.split('.').pop() || 'png';
        const path = `${user.id}/logo-${activeSlug}-${Date.now()}.${ext}`;
        const upload = await supabase.storage.from('menu-images').upload(path, logoFile, { upsert: false });
        if (upload.error) throw upload.error;
        const { data: urlData } = supabase.storage.from('menu-images').getPublicUrl(path);
        const { error: logoError } = await supabase.from('food_trucks').update({ logo_url: urlData.publicUrl }).eq('slug', activeSlug).eq('owner_id', user.id);
        if (logoError) throw logoError;
      }
      toast.success('Restaurant saved');
      // Flyer scan-first: skip the camera step and jump to review of the claimed draft.
      setStep(fromScanDraft && drafts.length > 0 ? 2 : 1);
    } catch (error) {
      toast.error(friendlySupabaseError(error, 'Could not save the restaurant.'));
    } finally {
      setSaving(false);
    }
  };

  const runImport = async (file: File) => {
    if (!user || !slug) {
      toast.error('Save your restaurant profile first.');
      return;
    }
    setImporting(true);
    setImportStatus('Scanning menu…');
    const beats = ['Finding categories…', 'Reading items…', 'Checking prices…', 'Building your digital menu…'];
    const timers = beats.map((label, index) => window.setTimeout(() => setImportStatus(label), (index + 1) * 900));
    track('menu_upload_started', { restaurant_slug: slug });
    const failsafe = window.setTimeout(() => {
      setImporting(false);
      setImportStatus('');
      toast.error('That took too long. Try a smaller photo or PDF.');
    }, 200_000);
    try {
      const items = await importMenuFromFile(file, user.id);
      setDrafts(items);
      track('menu_extraction_completed', { restaurant_slug: slug, item_count: items.length });
      toast.success(`Found ${items.length} items. Review them before anything is published.`);
      setStep(2);
    } catch (error) {
      toast.error(friendlySupabaseError(error, 'Could not read that menu.'));
    } finally {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(failsafe);
      setImporting(false);
      setImportStatus('');
    }
  };

  const saveReview = async () => {
    if (!slug) return;
    const ready = drafts.filter((item) => item.name.trim());
    if (ready.length === 0) {
      toast.error('Add at least one item with a name.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('menu_items').insert(
        ready.map((item) => ({
          truck_id: slug,
          name: item.name.trim(),
          description: item.description.trim() || null,
          price: item.price,
          category: item.category.trim() || 'Main',
          is_available: item.available,
          modifiers: (item.modifiers || []) as unknown as Json,
        }))
      );
      if (error) throw error;
      setSavedCount(ready.length);
      clearScanDraft();
      setFromScanDraft(false);
      track('menu_review_completed', { restaurant_slug: slug, item_count: ready.length });
      toast.success('Menu saved. Nothing is public until you publish.');
      setStep(3);
    } catch (error) {
      toast.error(friendlySupabaseError(error, 'Could not save the menu.'));
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!slug) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('food_trucks')
        .update(menuStatusPatch('published'))
        .eq('slug', slug)
        .eq('owner_id', user?.id ?? '');
      if (error) throw error;
      setMenuStatus('published');
      track('menu_published', { restaurant_slug: slug });
      toast.success('Your menu is live.');
      navigate('/admin/dashboard');
    } catch (error) {
      toast.error(friendlySupabaseError(error, 'Could not publish. Your draft is still saved.'));
    } finally {
      setSaving(false);
    }
  };

  const updateDraft = (index: number, patch: Partial<ImportedMenuItem>) => {
    setDrafts((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto p-4 pb-28">
        <div className="flex gap-1 mb-3" aria-hidden>
          {PROGRESS.map((label, index) => (
            <div key={label} className={`h-1 flex-1 rounded-full ${index <= Math.min(step, 4) ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>
        <ol className="grid grid-cols-5 gap-1 mb-4 text-[11px] text-muted-foreground">
          {PROGRESS.map((label, index) => (
            <li key={label} className={index === Math.min(step, 4) ? 'font-semibold text-foreground' : ''}>{label}</li>
          ))}
        </ol>

        {step === 0 && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">Create your restaurant</h1>
            <p className="text-sm text-muted-foreground">
              {fromScanDraft
                ? `We saved your ${drafts.length}-item scan. Add your restaurant details, then review the menu.`
                : 'This is what customers see at the top of your menu.'}
            </p>
            <label className="block text-sm font-medium">Restaurant name</label>
            <input className="w-full p-3 text-base rounded-lg border border-border bg-background" value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} placeholder="Mario's Pizza" />
            <label className="block text-sm font-medium">Address or area</label>
            <input className="w-full p-3 text-base rounded-lg border border-border bg-background" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="12 Main St, or Downtown" />
            <label className="block text-sm font-medium">Phone</label>
            <input className="w-full p-3 text-base rounded-lg border border-border bg-background" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(555) 123-4567" />
            <label className="block text-sm font-medium">Website (optional)</label>
            <input className="w-full p-3 text-base rounded-lg border border-border bg-background" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
            <label className="block text-sm font-medium">Logo (optional)</label>
            <input className="w-full text-sm" type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
            <label className="block text-sm font-medium">Restaurant type</label>
            <select className="w-full p-3 text-base rounded-lg border border-border bg-background" value={businessType} onChange={(e) => setBusinessType(e.target.value)}>
              {RESTAURANT_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            {slug && <p className="text-xs text-muted-foreground">Your menu link is locked to /menu/{slug}</p>}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">Scan your menu</h1>
            <p className="text-sm text-muted-foreground">We'll turn your menu into editable items automatically.</p>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void runImport(file); e.target.value = ''; }} />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void runImport(file); e.target.value = ''; }} />
            <input ref={pdfRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void runImport(file); e.target.value = ''; }} />
            <Button variant="cart" size="lg" className="w-full h-16 text-base" disabled={importing} onClick={() => cameraRef.current?.click()}>
              <Camera className="w-5 h-5 mr-2" /> Take photo
            </Button>
            <Button variant="outline" size="lg" className="w-full h-14" disabled={importing} onClick={() => fileRef.current?.click()}>
              <Upload className="w-5 h-5 mr-2" /> Upload menu
            </Button>
            <Button variant="outline" size="lg" className="w-full h-14" disabled={importing} onClick={() => pdfRef.current?.click()}>
              <Upload className="w-5 h-5 mr-2" /> Upload PDF
            </Button>
            {importing && (
              <div className="rounded-xl border border-border p-4 flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <p className="text-sm">{importStatus || 'Working…'}</p>
              </div>
            )}
            <Button variant="ghost" className="w-full" onClick={() => navigate('/admin')}>I’ll type items in Menu Admin instead</Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">Your menu is ready</h1>
            <div className="kk-card p-4 text-sm space-y-1">
              <p>{drafts.length} items found</p>
              <p>{categories.length} categories</p>
              <p>{drafts.filter((item) => isLowConfidenceItem(item)).length} items need review</p>
            </div>
            <p className="text-sm text-muted-foreground">Fix names and prices. Items marked “Check this” need a look, often because the price was hard to read.</p>
            {categories.map((category) => (
              <div key={category}>
                <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{category}</h2>
                {drafts.map((item, index) => item.category === category ? (
                  <div key={`${category}-${index}`} className="border border-border rounded-xl p-3 mb-2 space-y-2">
                    {isLowConfidenceItem(item) && (
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Check this — price or reading was uncertain</p>
                    )}
                    <input className="w-full text-base font-medium bg-transparent focus:outline-none" value={item.name} onChange={(e) => updateDraft(index, { name: e.target.value })} />
                    <input className="w-full text-sm text-muted-foreground bg-transparent focus:outline-none" value={item.description} placeholder="Description" onChange={(e) => updateDraft(index, { description: e.target.value })} />
                    <div className="flex gap-2 items-center">
                      <span className="text-sm">$</span>
                      <input type="number" min="0" step="0.01" className="w-24 text-base bg-transparent focus:outline-none" value={item.price} onChange={(e) => updateDraft(index, { price: parseFloat(e.target.value) || 0 })} />
                      <input className="flex-1 text-sm bg-secondary rounded px-2 py-1" value={item.category} onChange={(e) => updateDraft(index, { category: e.target.value || 'Main' })} />
                      <button type="button" className="text-xs underline" onClick={() => updateDraft(index, { available: !item.available })}>
                        {item.available ? 'Available' : 'Hidden'}
                      </button>
                      <button type="button" aria-label="Delete item" onClick={() => setDrafts((rows) => rows.filter((_, i) => i !== index))}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                    {item.modifiers.length > 0 && (
                      <p className="text-xs text-muted-foreground">{item.modifiers.length} option group{item.modifiers.length === 1 ? '' : 's'} will be saved with this item.</p>
                    )}
                  </div>
                ) : null)}
              </div>
            ))}
            <Button variant="outline" className="w-full" onClick={() => setDrafts((rows) => [...rows, { name: '', description: '', price: 0, category: 'Main', modifiers: [], available: true }])}>
              <Plus className="w-4 h-4 mr-2" /> Add an item
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">Preview</h1>
            <p className="text-sm text-muted-foreground">This is the customer view. It stays private until you publish.</p>
            <Button variant="cart" className="w-full" onClick={() => window.open(`/menu/${slug}`, '_blank', 'noopener,noreferrer')}>
              Open customer preview
            </Button>
            <p className="text-sm text-muted-foreground">{savedCount} items saved as a draft.</p>
          </div>
        )}

        {step === 4 && slug && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">Your QR code</h1>
            <RestaurantQrCard slug={slug} description="Print this or show it on a phone. It opens your menu. Guests see it only after you publish." />
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">Publish your menu</h1>
            <p className="text-sm text-muted-foreground">
              Publishing is free. Customers can open the menu and place pickup orders. You can pause the menu later without deleting it.
              {menuStatus === 'published' ? ' This menu is already live.' : ''}
            </p>
            <Button variant="cart" size="lg" className="w-full" disabled={saving} onClick={() => void publish()}>
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Publish menu'}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => navigate('/admin/dashboard')}>
              Keep as draft and go to dashboard
            </Button>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border safe-bottom">
        <div className="max-w-lg mx-auto flex gap-3">
          <Button variant="outline" className="flex-1" disabled={saving || importing || step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>
            Back
          </Button>
          {step === 0 && (
            <Button variant="cart" className="flex-1" disabled={saving} onClick={() => void saveProfile()}>
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save and continue'}
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
          {step === 2 && (
            <Button variant="cart" className="flex-1" disabled={saving} onClick={() => void saveReview()}>
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save reviewed menu'}
            </Button>
          )}
          {step !== 0 && step !== 2 && step < 5 && (
            <Button variant="cart" className="flex-1" disabled={importing || (step === 1 && drafts.length === 0)} onClick={() => setStep((value) => Math.min(5, value + 1))}>
              Continue
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingPage;
