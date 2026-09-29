import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MenuItem } from '@/types';
import { useMenuItems } from '@/hooks/useMenuItems';
import { useCartStore } from '@/store/useStore';
import { CategoryTabs } from '@/components/menu/CategoryTabs';
import { MenuItemCard } from '@/components/menu/MenuItemCard';
import { ItemCustomizer } from '@/components/menu/ItemCustomizer';
import { CartButton } from '@/components/cart/CartButton';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Clock, Loader2, ArrowLeft, AlertTriangle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { track } from '@/lib/analytics';
import { useVoiceSettings } from '@/hooks/useVoiceSettings';
import { VoiceCashier } from '@/components/voice/VoiceCashier';
import { supabase } from '@/integrations/supabase/client';
const LOADING_STUCK_AFTER_MS = 18_000;

const MenuPage = () => {
  const { truckId = 'demo' } = useParams<{ truckId: string }>();
  const navigate = useNavigate();
  const {
    items,
    categories,
    truckName,
    truckDescription,
    truckLocation,
    truckHours,
    truckLogo,
    truckAccentColor,
    isLoading,
    error,
    usingFallback,
    menuNotLive,
    isPublished,
  } = useMenuItems(truckId);
  const voice = useVoiceSettings(truckId);

  const clearCart = useCartStore((s) => s.clearCart);
  const prevTruckIdRef = useRef<string | undefined>(undefined);

  const [activeCategory, setActiveCategory] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [loadingStuck, setLoadingStuck] = useState(false);
  const [orderMode, setOrderMode] = useState<'choose' | 'browse' | 'voice'>(truckId === 'demo' ? 'choose' : 'browse');
  const [locale, setLocale] = useState<'en' | 'es'>(() => (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('kk-locale') === 'es' ? 'es' : 'en'));
  const [labels, setLabels] = useState<Record<string, { name?: string; description?: string }>>({});

  // Switching trucks (e.g. Try Demo after browsing another menu) must not keep the old cart or UI state.
  useEffect(() => {
    if (prevTruckIdRef.current !== undefined && prevTruckIdRef.current !== truckId) {
      clearCart();
      setActiveCategory('');
      setSelectedItem(null);
      setOrderMode(truckId === 'demo' ? 'choose' : 'browse');
      setIsCartOpen(false);
    }
    prevTruckIdRef.current = truckId;
  }, [truckId, clearCart]);

  useEffect(() => {
    sessionStorage.setItem('kk-locale', locale);
    if (locale === 'en') {
      setLabels({});
      return;
    }
    let cancelled = false;
    void supabase
      .from('menu_translations')
      .select('entity_id, field, text')
      .eq('restaurant_slug', truckId)
      .eq('locale', 'es')
      .then(({ data, error: translationError }) => {
        if (cancelled || translationError || !data) return;
        const next: Record<string, { name?: string; description?: string }> = {};
        for (const row of data) {
          if (row.field !== 'name' && row.field !== 'description') continue;
          const bucket = next[row.entity_id] ?? {};
          bucket[row.field] = row.text;
          next[row.entity_id] = bucket;
        }
        setLabels(next);
      });
    return () => {
      cancelled = true;
    };
  }, [locale, truckId]);

  // Set initial category when categories load
  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0]);
    }
  }, [categories, activeCategory]);

  // Belt-and-suspenders: if hook ever fails to clear loading, never spin forever.
  useEffect(() => {
    if (!isLoading) {
      setLoadingStuck(false);
      return;
    }
    const t = window.setTimeout(() => setLoadingStuck(true), LOADING_STUCK_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [isLoading]);

  useEffect(() => {
    if (!isLoading) {
      console.info('[MenuPage] ready', { truckId, usingFallback, hasError: Boolean(error) });
    }
  }, [isLoading, truckId, usingFallback, error]);

  useEffect(() => {
    if (!isLoading && isPublished && !menuNotLive && !error) {
      track('public_menu_viewed', { restaurant_slug: truckId });
    }
  }, [isLoading, isPublished, menuNotLive, error, truckId]);

  if (isLoading && loadingStuck) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-foreground">Menu is taking too long</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Loading exceeded {LOADING_STUCK_AFTER_MS / 1000}s. This is unexpected — try refreshing or check the browser Network tab for Supabase requests.
          </p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Reload page
          </Button>
          <Button variant="outline" className="mt-4 ms-2" onClick={() => navigate('/')}>
            Go home
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (menuNotLive) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b border-border px-4 py-3 safe-top">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <span className="font-semibold text-foreground truncate">{truckName}</span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-foreground">This menu isn&apos;t public yet</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              This menu is still a draft or the restaurant has paused it. Check back soon, or browse other restaurants
              from the home page.
            </p>
            <Button className="mt-6" onClick={() => navigate('/')}>
              Back to home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (error && truckId !== 'demo') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-foreground">Menu unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <div className="mt-4 flex justify-center gap-3">
            <Button onClick={() => window.location.reload()}>Try again</Button>
            <Button variant="outline" onClick={() => navigate('/')}>Home</Button>
          </div>
        </div>
      </div>
    );
  }

  const previewOnly = truckId !== 'demo' && !isPublished;
  const voiceOn = voice.ready && voice.enabled && !previewOnly;
  const mode = voiceOn ? orderMode : 'browse';
  const menuItems = items.filter((item) => item.category === activeCategory);

  const handleCheckout = () => {
    setIsCartOpen(false);
    navigate(`/checkout/${truckId}`);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {previewOnly && (
        <div className="px-4 pt-4">
          <Alert>
            <AlertTitle>Preview</AlertTitle>
            <AlertDescription>
              Customers can’t see this yet. Publish the menu when you’re ready, then share the QR code.
            </AlertDescription>
          </Alert>
        </div>
      )}
      {(error || usingFallback) && (
        <div className="px-4 pt-4 safe-top">
          <Alert variant={error ? 'destructive' : 'default'} className="text-left">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{error ? 'Menu could not load from the server' : 'Sample menu'}</AlertTitle>
            <AlertDescription className="mt-1 space-y-2">
              <p>{error ?? 'Showing the sample menu.'}</p>
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}
      {/* Header */}
      <header
        className={`p-6 pt-12 safe-top relative ${!truckAccentColor ? 'bg-gradient-to-br from-primary to-accent' : ''}`}
        style={truckAccentColor ? { background: truckAccentColor } : undefined}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          className="absolute top-12 left-4 text-white hover:bg-white/10"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          {truckLogo && (
            <img src={truckLogo} alt={truckName} className="w-16 h-16 rounded-2xl object-contain mx-auto mb-3 bg-white/20 p-1" />
          )}
          <h1 className="text-2xl font-bold text-white mb-1">
            {truckName}
          </h1>
          <p className="text-white/80 text-sm">{truckDescription}</p>
          <div className="flex items-center justify-center gap-4 mt-3 text-white/70 text-xs">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {truckLocation}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {truckHours}
            </span>
          </div>
        </motion.div>
      </header>

      {voiceOn && mode === 'choose' && (
        <div className="p-4 grid gap-3">
          <button
            type="button"
            className="kk-card p-5 text-left"
            onClick={() => setOrderMode('browse')}
          >
            <div className="text-lg font-semibold">Browse menu</div>
            <p className="text-sm text-muted-foreground mt-1">See every item, price, and option.</p>
          </button>
          <button
            type="button"
            className="rounded-2xl border border-foreground/15 bg-secondary p-5 text-left"
            onClick={() => setOrderMode('voice')}
          >
            <div className="text-lg font-semibold">Order by voice</div>
            <p className="text-sm text-muted-foreground mt-1">Tell me what you'd like. You can still browse.</p>
          </button>
        </div>
      )}

      {voiceOn && mode === 'voice' && (
        <VoiceCashier slug={truckId} locale={locale} onBrowse={() => setOrderMode('browse')} />
      )}

      {mode === 'browse' && (
      <>
      <div className="px-4 pt-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          <button type="button" className={`px-3 py-1.5 ${locale === 'en' ? 'bg-primary text-primary-foreground' : ''}`} onClick={() => setLocale('en')}>English</button>
          <button type="button" className={`px-3 py-1.5 ${locale === 'es' ? 'bg-primary text-primary-foreground' : ''}`} onClick={() => setLocale('es')}>Español</button>
        </div>
        {voiceOn && <Button variant="outline" onClick={() => setOrderMode('voice')}>Order by voice</Button>}
      </div>
      {/* Category Tabs */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border z-30 px-4">
        <CategoryTabs
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
        />
      </div>

      {/* Menu Items */}
      <div className="p-4 space-y-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            {menuItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <MenuItemCard
                  item={item}
                  displayName={labels[item.id]?.name}
                  displayDescription={labels[item.id]?.description}
                  onSelect={setSelectedItem}
                />
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      </>
      )}

      {/* Cart stays off unpublished previews so a draft cannot be ordered. */}
      {mode === 'browse' && !previewOnly && <CartButton onClick={() => setIsCartOpen(true)} />}

      {/* Item Customizer Modal */}
      <AnimatePresence>
        {selectedItem && (
          <ItemCustomizer
            item={selectedItem}
            displayName={labels[selectedItem.id]?.name}
            displayDescription={labels[selectedItem.id]?.description}
            labels={Object.fromEntries(Object.entries(labels).flatMap(([id, value]) => value.name ? [[id, value.name]] : []))}
            onClose={() => setSelectedItem(null)}
          />
        )}
      </AnimatePresence>

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onCheckout={handleCheckout}
      />
    </div>
  );
};

export default MenuPage;
