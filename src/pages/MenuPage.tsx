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
  } = useMenuItems(truckId);

  const clearCart = useCartStore((s) => s.clearCart);
  const prevTruckIdRef = useRef<string | undefined>(undefined);

  const [activeCategory, setActiveCategory] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [loadingStuck, setLoadingStuck] = useState(false);

  // Switching trucks (e.g. Try Demo after browsing another menu) must not keep the old cart or UI state.
  useEffect(() => {
    if (prevTruckIdRef.current !== undefined && prevTruckIdRef.current !== truckId) {
      clearCart();
      setActiveCategory('');
      setSelectedItem(null);
      setIsCartOpen(false);
    }
    prevTruckIdRef.current = truckId;
  }, [truckId, clearCart]);

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
              The restaurant finishes onboarding with a subscription, then publishes from Menu Admin. Check back
              soon or browse other restaurants from the home page.
            </p>
            <Button className="mt-6" onClick={() => navigate('/')}>
              Back to home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const menuItems = items.filter((item) => item.category === activeCategory);

  const handleCheckout = () => {
    setIsCartOpen(false);
    navigate(`/checkout/${truckId}`);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {(error || usingFallback) && (
        <div className="px-4 pt-4 safe-top">
          <Alert variant={error ? 'destructive' : 'default'} className="text-left">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{error ? 'Menu could not load from the server' : 'Sample menu'}</AlertTitle>
            <AlertDescription className="mt-1 space-y-2">
              <p>{error ?? 'Showing demo items until live data is available for this truck.'}</p>
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
                <MenuItemCard item={item} onSelect={setSelectedItem} />
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Cart Button */}
      <CartButton onClick={() => setIsCartOpen(true)} />

      {/* Item Customizer Modal */}
      <AnimatePresence>
        {selectedItem && (
          <ItemCustomizer
            item={selectedItem}
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
