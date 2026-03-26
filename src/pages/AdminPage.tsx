import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatEdgeFunctionFailure } from '@/lib/edgeFunctionErrors';
import { isPaidSubscriptionActive } from '@/lib/subscription';
import { mapApiModifiersToApp, normalizeExtractionPayload } from '@/lib/menuExtraction';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Upload, ArrowLeft, Trash2, Check, Loader2, ImageIcon, Plus, Edit2, Image as ImageIconLucide, QrCode, Download, Settings2, LogOut, CreditCard, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { ModifierEditor } from '@/components/admin/ModifierEditor';
import { BrandingSettings } from '@/components/admin/BrandingSettings';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ModifierGroup } from '@/types';

const CATEGORY_OPTIONS = ['Appetizers', 'Mains', 'Sides', 'Drinks', 'Desserts', 'Specials', 'Main'];

function EditItemDialog({
  item,
  onClose,
  onSave,
}: {
  item: { id: string; name: string; description: string | null; price: number; category: string; is_available: boolean };
  onClose: () => void;
  onSave: (u: { name?: string; description?: string; price?: number; category?: string; is_available?: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description || '');
  const [price, setPrice] = useState(item.price);
  const [category, setCategory] = useState(item.category);
  const [isAvailable, setIsAvailable] = useState(item.is_available);
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Menu Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 rounded-lg border border-border bg-background text-foreground"
              placeholder="Item name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-3 rounded-lg border border-border bg-background text-foreground min-h-[80px]"
              placeholder="Optional"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Price ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                className="w-full p-3 rounded-lg border border-border bg-background text-foreground"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-3 rounded-lg border border-border bg-background text-foreground"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="available"
              checked={isAvailable}
              onChange={(e) => setIsAvailable(e.target.checked)}
            />
            <label htmlFor="available" className="text-sm">Available</label>
          </div>
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button
              variant="cart"
              className="flex-1"
              disabled={!name.trim() || saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await onSave({
                    name: name.trim(),
                    description: description || null,
                    price,
                    category,
                    is_available: isAvailable,
                  });
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Draft row after AI extraction (owner can edit before save) */
interface ExtractedItem {
  name: string;
  description?: string;
  price: number;
  category: string;
  selected?: boolean;
  /** Draft modifiers mapped for menu_items.modifiers JSONB */
  modifiers?: ModifierGroup[];
}

/** Storage uploads should fail fast; extraction can take longer (Gemini + model fallbacks on the server). */
const UPLOAD_TIMEOUT_MS = 60_000;
const EXTRACTION_INVOKE_TIMEOUT_MS = 180_000;
const EXISTING_MENU_FETCH_MS = 20_000;
/** Failsafe if any awaited step misbehaves and never settles (must exceed upload + invoke caps). */
const PIPELINE_FAILSAFE_MS = UPLOAD_TIMEOUT_MS + EXTRACTION_INVOKE_TIMEOUT_MS + 15_000;

const AdminPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, signOut, profile, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [truckId, setTruckId] = useState('demo');
  const [isSaving, setIsSaving] = useState(false);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.info('[kiokitchen:extract] Image selected:', file.name, `${Math.round(file.size / 1024)}KB`);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to storage
    await uploadAndProcess(file);
  };

  const uploadAndProcess = async (file: File) => {
    setIsProcessing(true);
    setExtractedItems([]);

    let failsafeCleared = false;
    const failsafeId = window.setTimeout(() => {
      failsafeCleared = true;
      setIsProcessing(false);
      toast.error('Menu extraction took too long and was stopped. Try again or use a smaller image.');
    }, PIPELINE_FAILSAFE_MS);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    try {
      console.info(
        '[kiokitchen:extract] Supabase project host:',
        supabaseUrl ? new URL(supabaseUrl).hostname : '(VITE_SUPABASE_URL missing — deploy will fail)'
      );
    } catch {
      console.warn('[kiokitchen:extract] Invalid VITE_SUPABASE_URL');
    }

    try {
      console.info('[kiokitchen:extract] Storage upload started → bucket menu-images');
      const fileName = `menu-${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await Promise.race([
        supabase.storage.from('menu-images').upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Upload timed out after ${UPLOAD_TIMEOUT_MS / 1000} seconds`)),
            UPLOAD_TIMEOUT_MS
          )
        ),
      ]);

      if (uploadError) {
        console.error('[kiokitchen:extract] Upload failed:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }
      console.info('[kiokitchen:extract] Upload succeeded:', fileName);

      const { data: urlData } = supabase.storage.from('menu-images').getPublicUrl(fileName);
      const imageUrl = urlData.publicUrl;
      console.info('[kiokitchen:extract] Public imageUrl:', imageUrl);

      console.info('[kiokitchen:extract] Invoking edge function extract-menu…');
      const invokeResult = await supabase.functions.invoke('extract-menu', {
        body: { imageUrl },
        timeout: EXTRACTION_INVOKE_TIMEOUT_MS,
      });
      const { data, error } = invokeResult;
      console.info(
        '[kiokitchen:extract] extract-menu response received:',
        error ? `error: ${error.message}` : `ok, raw items=${Array.isArray(data?.items) ? data.items.length : 0}`
      );

      if (error) {
        let detail = await formatEdgeFunctionFailure(error, invokeResult.response);
        if (/\b404\b/.test(detail) || detail.toLowerCase().includes('not found')) {
          detail += ' — deploy the function: supabase functions deploy extract-menu (project awryxczjacqrgjlctrjc)';
        }
        console.error('[kiokitchen:extract] Extraction failed:', detail);
        throw new Error(`Extraction failed: ${detail}`);
      }

      if (data?.error) {
        throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
      }

      const drafts = normalizeExtractionPayload(data?.items);
      const itemsWithSelection: ExtractedItem[] = drafts.map((d) => ({
        name: d.name,
        description: d.description || '',
        price: d.price,
        category: d.category,
        modifiers: mapApiModifiersToApp(d.modifier_groups),
        selected: true,
      }));

      if (itemsWithSelection.length > 0) {
        setExtractedItems(itemsWithSelection);
        const withMods = itemsWithSelection.filter((i) => (i.modifiers?.length ?? 0) > 0).length;
        toast.success(
          withMods > 0
            ? `Draft ready: ${itemsWithSelection.length} items (${withMods} with add-on groups — review below).`
            : `Draft ready: ${itemsWithSelection.length} items. Review and edit before saving.`
        );
      } else {
        console.warn('[kiokitchen:extract] No items after normalization');
        toast.error('No menu items could be extracted. Try a clearer, well-lit photo.');
      }
    } catch (error) {
      console.error('[kiokitchen:extract] Pipeline error:', error);
      const msg = error instanceof Error ? error.message : 'Failed to process menu';
      toast.error(msg);
    } finally {
      window.clearTimeout(failsafeId);
      if (!failsafeCleared) setIsProcessing(false);
      console.info('[kiokitchen:extract] Loading state cleared (finally)');
    }
  };

  const toggleItemSelection = (index: number) => {
    setExtractedItems((items) =>
      items.map((item, i) =>
        i === index ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const updateItem = (index: number, field: keyof ExtractedItem, value: string | number) => {
    setExtractedItems((items) =>
      items.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const removeItem = (index: number) => {
    setExtractedItems((items) => items.filter((_, i) => i !== index));
  };

  const addManualItem = () => {
    setExtractedItems((items) => [
      ...items,
      { name: '', description: '', price: 0, category: 'Main', modifiers: [], selected: true },
    ]);
  };

  const categoryChoices = [
    ...new Set([...CATEGORY_OPTIONS, ...extractedItems.map((i) => i.category).filter(Boolean)]),
  ].sort((a, b) => a.localeCompare(b));

  const saveSelectedItems = async () => {
    if (truckId.trim() === 'demo') {
      toast.error(
        'The slug "demo" is reserved for the built-in sample menu. Change Food Truck ID to your restaurant slug before saving items.'
      );
      return;
    }

    const selectedItems = extractedItems.filter((item) => item.selected && item.name);

    if (selectedItems.length === 0) {
      toast.error('No items selected to save');
      return;
    }

    setIsSaving(true);

    try {
      const itemsToInsert = selectedItems.map((item) => ({
        truck_id: truckId,
        name: item.name,
        description: item.description || null,
        price: item.price,
        category: item.category,
        is_available: true,
        modifiers: item.modifiers?.length ? item.modifiers : [],
      }));

      const { error } = await supabase.from('menu_items').insert(itemsToInsert);

      if (error) {
        throw error;
      }

      toast.success(`Saved ${selectedItems.length} menu items!`);
      setExtractedItems([]);
      setImagePreview(null);
    } catch (error) {
      console.error('Error saving items:', error);
      toast.error('Failed to save menu items');
    } finally {
      setIsSaving(false);
    }
  };

  const categories = [...new Set(extractedItems.map((item) => item.category))];

  // --- Existing menu items management ---
  interface DbMenuItem {
    id: string;
    name: string;
    description: string | null;
    price: number;
    category: string;
    image_url: string | null;
    is_available: boolean;
    modifiers: unknown;
  }
  const [existingItems, setExistingItems] = useState<DbMenuItem[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [editingModifiersItem, setEditingModifiersItem] = useState<DbMenuItem | null>(null);
  const [editingItem, setEditingItem] = useState<DbMenuItem | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const itemImageInputRef = useRef<HTMLInputElement>(null);

  // Load owner's restaurant slug when logged in
  useEffect(() => {
    if (!user) return;
    const loadOwnerTruck = async () => {
      const { data } = await supabase
        .from('food_trucks')
        .select('slug')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle();
      if (data?.slug) setTruckId(data.slug);
    };
    loadOwnerTruck();
  }, [user?.id]);

  const [truckBranding, setTruckBranding] = useState<{ logo_url?: string; accent_color?: string }>({});
  const [truckPublished, setTruckPublished] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);

  useEffect(() => {
    if (searchParams.get('checkout') !== 'success') return;
    void (async () => {
      await refreshProfile();
      toast.success('Subscription updated — you can publish your menu.');
    })();
    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, refreshProfile]);

  useEffect(() => {
    const fetchTruck = async () => {
      const { data } = await supabase
        .from('food_trucks')
        .select('logo_url, accent_color, is_published')
        .eq('slug', truckId)
        .maybeSingle();
      const row = data as { logo_url?: string; accent_color?: string; is_published?: boolean } | null;
      setTruckBranding({ logo_url: row?.logo_url, accent_color: row?.accent_color });
      setTruckPublished(Boolean(row?.is_published));
    };
    fetchTruck();
  }, [truckId]);

  const handlePublishMenu = async () => {
    if (!isPaidSubscriptionActive(profile?.subscription_status)) {
      toast.error('Subscribe first to publish your menu.');
      navigate('/admin/billing');
      return;
    }
    setPublishBusy(true);
    try {
      const { error } = await supabase.from('food_trucks').update({ is_published: true }).eq('slug', truckId);
      if (error) throw error;
      setTruckPublished(true);
      toast.success('Menu is live — customers can order from your links and the home page.');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Could not publish');
    } finally {
      setPublishBusy(false);
    }
  };

  const handleUnpublishMenu = async () => {
    setPublishBusy(true);
    try {
      const { error } = await supabase.from('food_trucks').update({ is_published: false }).eq('slug', truckId);
      if (error) throw error;
      setTruckPublished(false);
      toast.success('Menu is no longer public.');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Could not unpublish');
    } finally {
      setPublishBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const fetchExisting = async () => {
      setLoadingExisting(true);
      try {
        const result = await Promise.race([
          supabase
            .from('menu_items')
            .select('id, name, description, price, category, image_url, is_available, modifiers')
            .eq('truck_id', truckId)
            .order('category')
            .order('name'),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('existing_menu_timeout')), EXISTING_MENU_FETCH_MS)
          ),
        ]);
        if (cancelled) return;
        setExistingItems((result.data as DbMenuItem[]) || []);
      } catch (e) {
        console.warn('[admin] load existing menu items:', e);
        if (!cancelled) setExistingItems([]);
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    };
    fetchExisting();
    return () => {
      cancelled = true;
    };
  }, [truckId, isSaving]); // re-fetch after saving new items

  const handleItemImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !uploadingItemId) return;

    try {
      const fileName = `item-${uploadingItemId}-${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from('menu-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('menu-images')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('menu_items')
        .update({ image_url: urlData.publicUrl })
        .eq('id', uploadingItemId);

      if (updateError) throw updateError;

      setExistingItems((items) =>
        items.map((item) =>
          item.id === uploadingItemId ? { ...item, image_url: urlData.publicUrl } : item
        )
      );
      toast.success('Image uploaded!');
    } catch (err) {
      console.error('Image upload error:', err);
      toast.error('Failed to upload image');
    } finally {
      setUploadingItemId(null);
      if (itemImageInputRef.current) itemImageInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 bg-foreground text-background p-4 z-30">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
              className="text-background hover:bg-background/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Menu Admin</h1>
              <p className="text-background/70 text-sm">Capture menu from image</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin/billing')}
              className="text-background hover:bg-background/10"
            >
              <CreditCard className="w-4 h-4 mr-1" />
              Billing
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut().then(() => navigate('/'))}
              className="text-background hover:bg-background/10"
            >
              <LogOut className="w-4 h-4 mr-1" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Truck ID Selection */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl border border-border p-4"
        >
          <label className="block text-sm font-medium text-foreground mb-2">
            Food Truck ID
          </label>
          <input
            type="text"
            value={truckId}
            onChange={(e) => setTruckId(e.target.value)}
            placeholder="Enter truck ID"
            className="w-full p-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </motion.section>

        {/* Publish & subscription gate */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl border border-border p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Publish to customers</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Until you publish, your menu stays private: it won&apos;t appear on the home page and ordering links
            show a &quot;not public yet&quot; screen for guests.
          </p>
          {truckId === 'demo' ? (
            <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              Switch <strong>Food Truck ID</strong> to your restaurant slug before publishing. &quot;demo&quot; is the
              shared sample truck.
            </p>
          ) : null}
          {truckId === 'demo' ? null : truckPublished ? (
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <p className="text-sm font-medium text-success">Your menu is live.</p>
              <Button
                variant="outline"
                size="sm"
                disabled={publishBusy}
                onClick={() => void handleUnpublishMenu()}
              >
                Unpublish
              </Button>
            </div>
          ) : !isPaidSubscriptionActive(profile?.subscription_status) ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="cart"
                disabled={publishBusy}
                onClick={() => navigate('/admin/billing')}
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Subscribe to publish
              </Button>
              <p className="text-xs text-muted-foreground self-center">
                Active subscription required to take orders on KioKitchen.
              </p>
            </div>
          ) : (
            <Button variant="cart" disabled={publishBusy} onClick={() => void handlePublishMenu()}>
              {publishBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Publish menu
            </Button>
          )}
        </motion.section>

        {/* Branding Settings */}
        <BrandingSettings
          truckId={truckId}
          currentLogoUrl={truckBranding.logo_url}
          currentAccentColor={truckBranding.accent_color}
          onUpdate={(updates) => setTruckBranding((p) => ({ ...p, ...updates }))}
        />

        {/* Image Capture Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-2xl border border-border p-6"
        >
          <h2 className="font-semibold text-foreground mb-4">Capture Menu Image</h2>

          {!imagePreview ? (
            <div className="grid grid-cols-2 gap-4">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />

              <Button
                variant="outline"
                size="lg"
                className="h-32 flex-col gap-2"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="w-8 h-8 text-primary" />
                <span>Take Photo</span>
              </Button>

              <Button
                variant="outline"
                size="lg"
                className="h-32 flex-col gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 text-primary" />
                <span>Upload Image</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden border border-border">
                <img
                  src={imagePreview}
                  alt="Menu preview"
                  className="w-full max-h-64 object-contain bg-secondary/20"
                />
                {isProcessing && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                    <div className="text-center">
                      <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Extracting menu items...</p>
                    </div>
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setImagePreview(null);
                  setExtractedItems([]);
                }}
                disabled={isProcessing}
              >
                <ImageIcon className="w-4 h-4 mr-2" />
                Choose Different Image
              </Button>
            </div>
          )}
        </motion.section>

        {/* Extracted Items */}
        <AnimatePresence>
          {extractedItems.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-card rounded-2xl border border-border p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-foreground">
                  Extracted Items ({extractedItems.filter((i) => i.selected).length} selected)
                </h2>
                <Button variant="outline" size="sm" onClick={addManualItem}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-3">
                {categories.map((category) => (
                  <div key={category}>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                      {category}
                    </h3>
                    {extractedItems
                      .map((item, index) => ({ item, index }))
                      .filter(({ item }) => item.category === category)
                      .map(({ item, index }) => (
                        <motion.div
                          key={index}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className={`p-3 rounded-lg border mb-2 transition-colors ${
                            item.selected
                              ? 'border-primary/50 bg-primary/5'
                              : 'border-border bg-secondary/20'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() => toggleItemSelection(index)}
                              className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                item.selected
                                  ? 'bg-primary border-primary'
                                  : 'border-muted-foreground'
                              }`}
                            >
                              {item.selected && <Check className="w-3 h-3 text-primary-foreground" />}
                            </button>

                            <div className="flex-1 space-y-2">
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => updateItem(index, 'name', e.target.value)}
                                placeholder="Item name"
                                className="w-full bg-transparent font-medium text-foreground focus:outline-none"
                              />
                              <input
                                type="text"
                                value={item.description || ''}
                                onChange={(e) => updateItem(index, 'description', e.target.value)}
                                placeholder="Description (optional)"
                                className="w-full bg-transparent text-sm text-muted-foreground focus:outline-none"
                              />
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">$</span>
                                <input
                                  type="number"
                                  value={item.price}
                                  onChange={(e) => updateItem(index, 'price', parseFloat(e.target.value) || 0)}
                                  step="0.01"
                                  min="0"
                                  className="w-20 bg-transparent text-sm font-medium text-foreground focus:outline-none"
                                />
                                <select
                                  value={item.category}
                                  onChange={(e) => updateItem(index, 'category', e.target.value)}
                                  className="ml-auto text-xs bg-secondary px-2 py-1 rounded border border-border max-w-[140px]"
                                >
                                  {categoryChoices.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              {(item.modifiers?.length ?? 0) > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {item.modifiers!.length} add-on group(s) from menu — refine under “Current menu” after save.
                                </p>
                              )}
                            </div>

                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeItem(index)}
                              className="text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-border">
                <Button
                  variant="cart"
                  size="lg"
                  className="w-full"
                  onClick={saveSelectedItems}
                  disabled={isSaving || extractedItems.filter((i) => i.selected).length === 0}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5 mr-2" />
                      Save {extractedItems.filter((i) => i.selected).length} Items to Menu
                    </>
                  )}
                </Button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Existing Menu Items - Image Management */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl border border-border p-4"
        >
          <h2 className="font-semibold text-foreground mb-4">
            Existing Menu Items ({existingItems.length})
          </h2>

          <input
            ref={itemImageInputRef}
            type="file"
            accept="image/*"
            onChange={handleItemImageUpload}
            className="hidden"
          />

          {loadingExisting ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : existingItems.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">
              No menu items yet. Use the image capture above or add items manually.
            </p>
          ) : (
            <div className="space-y-2">
              {existingItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border"
                >
                  {item.image_url ? (
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border border-border">
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                      <ImageIconLucide className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.category} • ${item.price.toFixed(2)}
                      {Array.isArray(item.modifiers) && (item.modifiers as any[]).length > 0 && (
                        <span className="text-primary ml-1">• {(item.modifiers as any[]).length} modifier{(item.modifiers as any[]).length > 1 ? 's' : ''}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingItem(item)}
                    >
                      <Edit2 className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingModifiersItem(item)}
                    >
                      <Settings2 className="w-3 h-3 mr-1" />
                      Modifiers
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setUploadingItemId(item.id);
                        const inp = itemImageInputRef.current;
                        if (!inp) return;
                        const onWinFocus = () => {
                          window.removeEventListener('focus', onWinFocus);
                          window.setTimeout(() => {
                            if (!inp.files?.length) setUploadingItemId(null);
                          }, 800);
                        };
                        window.addEventListener('focus', onWinFocus, { once: true });
                        inp.click();
                      }}
                    >
                      <Upload className="w-3 h-3 mr-1" />
                      {item.image_url ? 'Change' : 'Add'} Photo
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={async () => {
                        if (!confirm(`Delete "${item.name}"?`)) return;
                        setDeletingItemId(item.id);
                        try {
                          const { error } = await supabase.from('menu_items').delete().eq('id', item.id);
                          if (error) toast.error('Failed to delete');
                          else {
                            setExistingItems((prev) => prev.filter((i) => i.id !== item.id));
                            toast.success('Item deleted');
                          }
                        } finally {
                          setDeletingItemId(null);
                        }
                      }}
                      disabled={deletingItemId === item.id}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                    <Button
                      variant={item.is_available ? 'outline' : 'secondary'}
                      size="sm"
                      onClick={async () => {
                        const { error } = await supabase
                          .from('menu_items')
                          .update({ is_available: !item.is_available })
                          .eq('id', item.id);
                        if (error) toast.error('Failed to update');
                        else setExistingItems((prev) =>
                          prev.map((i) => i.id === item.id ? { ...i, is_available: !i.is_available } : i)
                        );
                      }}
                    >
                      {item.is_available ? 'Available' : 'Unavailable'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.section>

        {/* QR Code Generator */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card rounded-2xl border border-border p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <QrCode className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">QR Code for Menu</h2>
          </div>

          <p className="text-sm text-muted-foreground mb-6">
            Print this QR code and place it at your truck. Customers scan it to open your menu instantly.
          </p>

          <div className="flex flex-col items-center gap-6">
            <div id="qr-code-container" className="bg-background p-6 rounded-2xl border border-border shadow-sm">
              <QRCodeSVG
                value={`${window.location.origin}/menu/${truckId}`}
                size={200}
                level="H"
                includeMargin
                className="mx-auto"
              />
              <p className="text-center text-xs text-muted-foreground mt-3 font-medium">
                {truckId}
              </p>
            </div>

            <div className="text-center space-y-2">
              <p className="text-xs text-muted-foreground break-all">
                {window.location.origin}/menu/{truckId}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  const svg = document.querySelector('#qr-code-container svg');
                  if (!svg) return;
                  const svgData = new XMLSerializer().serializeToString(svg);
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  const img = new Image();
                  img.onload = () => {
                    canvas.width = img.width * 2;
                    canvas.height = img.height * 2;
                    ctx!.fillStyle = '#ffffff';
                    ctx!.fillRect(0, 0, canvas.width, canvas.height);
                    ctx!.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const a = document.createElement('a');
                    a.download = `qr-${truckId}.png`;
                    a.href = canvas.toDataURL('image/png');
                    a.click();
                  };
                  img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Download QR Code
              </Button>
            </div>
          </div>
        </motion.section>
      </div>

      {/* Edit Item Modal */}
      {editingItem && (
        <EditItemDialog
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={async (updates) => {
            const { error } = await supabase
              .from('menu_items')
              .update(updates)
              .eq('id', editingItem.id);
            if (error) toast.error('Failed to update');
            else {
              setExistingItems((prev) =>
                prev.map((i) => i.id === editingItem.id ? { ...i, ...updates } : i)
              );
              toast.success('Item updated');
              setEditingItem(null);
            }
          }}
        />
      )}

      {/* Modifier Editor Modal */}
      <AnimatePresence>
        {editingModifiersItem && (
          <ModifierEditor
            itemName={editingModifiersItem.name}
            initialModifiers={
              Array.isArray(editingModifiersItem.modifiers)
                ? (editingModifiersItem.modifiers as ModifierGroup[])
                : []
            }
            onClose={() => setEditingModifiersItem(null)}
            onSave={async (modifiers) => {
              try {
                const { error } = await supabase
                  .from('menu_items')
                  .update({ modifiers: modifiers as any })
                  .eq('id', editingModifiersItem.id);
                if (error) throw error;
                setExistingItems((items) =>
                  items.map((item) =>
                    item.id === editingModifiersItem.id
                      ? { ...item, modifiers }
                      : item
                  )
                );
                toast.success('Modifiers saved!');
                setEditingModifiersItem(null);
              } catch (err) {
                console.error(err);
                toast.error('Failed to save modifiers');
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminPage;
