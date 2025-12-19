import { useCartStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CartButtonProps {
  onClick: () => void;
}

export const CartButton = ({ onClick }: CartButtonProps) => {
  const itemCount = useCartStore((state) => state.getItemCount());
  const total = useCartStore((state) => state.getTotal());

  if (itemCount === 0) return null;

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className="fixed bottom-0 left-0 right-0 p-4 safe-bottom z-40"
    >
      <Button
        variant="cart"
        size="xl"
        className="w-full flex items-center justify-between"
        onClick={onClick}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <ShoppingBag className="w-6 h-6" />
            <AnimatePresence mode="wait">
              <motion.span
                key={itemCount}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                className="absolute -top-2 -right-2 w-5 h-5 bg-background text-primary text-xs font-bold rounded-full flex items-center justify-center"
              >
                {itemCount}
              </motion.span>
            </AnimatePresence>
          </div>
          <span>View Cart</span>
        </div>
        <span className="font-bold">${total.toFixed(2)}</span>
      </Button>
    </motion.div>
  );
};
