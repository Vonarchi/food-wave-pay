import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MenuItem } from '@/types';
import { useMenuItems } from '@/hooks/useMenuItems';
import { CategoryTabs } from '@/components/menu/CategoryTabs';
import { MenuItemCard } from '@/components/menu/MenuItemCard';
import { ItemCustomizer } from '@/components/menu/ItemCustomizer';
import { CartButton } from '@/components/cart/CartButton';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Clock, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MenuPage = () => {
  const { truckId = 'demo' } = useParams<{ truckId: string }>();
  const navigate = useNavigate();
  const { items, categories, truckName, truckDescription, truckLocation, truckHours, truckLogo, truckAccentColor, isLoading, error } = useMenuItems(truckId);

  const [activeCategory, setActiveCategory] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Set initial category when categories load
  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0]);
    }
  }, [categories, activeCategory]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Menu not found</h1>
          <p className="text-muted-foreground">{error}</p>
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
      {/* Header */}
      <header className="bg-gradient-to-br from-primary to-accent p-6 pt-12 safe-top relative">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          className="absolute top-12 left-4 text-primary-foreground hover:bg-primary-foreground/10"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="text-2xl font-bold text-primary-foreground mb-1">
            {truckName}
          </h1>
          <p className="text-primary-foreground/80 text-sm">{truckDescription}</p>
          <div className="flex items-center justify-center gap-4 mt-3 text-primary-foreground/70 text-xs">
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
