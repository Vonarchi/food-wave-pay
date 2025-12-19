import { useCartStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { ShoppingBag, Minus, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckout: () => void;
}

export const CartDrawer = ({ isOpen, onClose, onCheckout }: CartDrawerProps) => {
  const { items, removeItem, updateQuantity, getSubtotal, getTax, getTotal } =
    useCartStore();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-foreground/50 z-50"
          onClick={onClose}
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-0 h-full w-full max-w-md bg-background flex flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center gap-3">
              <ShoppingBag className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-bold text-foreground">Your Order</h2>
              <span className="ml-auto text-muted-foreground">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {items.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingBag className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">Your cart is empty</p>
                </div>
              ) : (
                items.map((item) => {
                  let itemPrice = item.menuItem.price;
                  item.selectedModifiers.forEach((mod) => {
                    mod.options.forEach((opt) => {
                      itemPrice += opt.price;
                    });
                  });

                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 50 }}
                      className="bg-card rounded-xl p-4 border border-border"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground">
                            {item.menuItem.name}
                          </h3>
                          {item.selectedModifiers.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {item.selectedModifiers.map((mod) => (
                                <p
                                  key={mod.groupId}
                                  className="text-xs text-muted-foreground"
                                >
                                  {mod.options.map((o) => o.name).join(', ')}
                                </p>
                              ))}
                            </div>
                          )}
                          {item.specialInstructions && (
                            <p className="text-xs text-muted-foreground mt-1 italic">
                              "{item.specialInstructions}"
                            </p>
                          )}
                        </div>
                        <p className="font-bold text-foreground ml-4">
                          ${(itemPrice * item.quantity).toFixed(2)}
                        </p>
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() =>
                              updateQuantity(item.id, item.quantity - 1)
                            }
                          >
                            {item.quantity === 1 ? (
                              <Trash2 className="w-4 h-4 text-destructive" />
                            ) : (
                              <Minus className="w-4 h-4" />
                            )}
                          </Button>
                          <span className="w-6 text-center font-medium text-foreground">
                            {item.quantity}
                          </span>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() =>
                              updateQuantity(item.id, item.quantity + 1)
                            }
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(item.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          Remove
                        </Button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="p-4 border-t border-border space-y-4 safe-bottom">
                <div className="space-y-2">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>${getSubtotal().toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax</span>
                    <span>${getTax().toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-foreground">
                    <span>Total</span>
                    <span>${getTotal().toFixed(2)}</span>
                  </div>
                </div>
                <Button
                  variant="cart"
                  size="xl"
                  className="w-full"
                  onClick={onCheckout}
                >
                  Checkout • ${getTotal().toFixed(2)}
                </Button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
