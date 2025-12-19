import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFoodTruckById, getMenuItemsByCategory } from '@/data/sampleData';
import { MenuItem } from '@/types';
import { CategoryTabs } from '@/components/menu/CategoryTabs';
import { MenuItemCard } from '@/components/menu/MenuItemCard';
import { ItemCustomizer } from '@/components/menu/ItemCustomizer';
import { CartButton } from '@/components/cart/CartButton';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Clock } from 'lucide-react';

const MenuPage = () => {
  const { truckId = 'demo' } = useParams<{ truckId: string }>();
  const navigate = useNavigate();
  const truck = getFoodTruckById(truckId);

  const [activeCategory, setActiveCategory] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Set initial category
  useMemo(() => {
    if (truck && truck.categories.length > 0 && !activeCategory) {
      setActiveCategory(truck.categories[0]);
    }
  }, [truck, activeCategory]);

  if (!truck) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Menu not found</h1>
          <p className="text-muted-foreground">This food truck doesn't exist</p>
        </div>
      </div>
    );
  }

  const menuItems = getMenuItemsByCategory(truck.menu, activeCategory);

  const handleCheckout = () => {
    setIsCartOpen(false);
    navigate(`/checkout/${truckId}`);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="bg-gradient-to-br from-primary to-accent p-6 pt-12 safe-top">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="text-2xl font-bold text-primary-foreground mb-1">
            {truck.name}
          </h1>
          <p className="text-primary-foreground/80 text-sm">{truck.description}</p>
          <div className="flex items-center justify-center gap-4 mt-3 text-primary-foreground/70 text-xs">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Food Truck Row
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> 11am - 8pm
            </span>
          </div>
        </motion.div>
      </header>

      {/* Category Tabs */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border z-30 px-4">
        <CategoryTabs
          categories={truck.categories}
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
