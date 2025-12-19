import { useState } from 'react';
import { MenuItem, ModifierGroup, SelectedModifier, ModifierOption } from '@/types';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, Check } from 'lucide-react';
import { useCartStore } from '@/store/useStore';
import { toast } from 'sonner';

interface ItemCustomizerProps {
  item: MenuItem;
  onClose: () => void;
}

export const ItemCustomizer = ({ item, onClose }: ItemCustomizerProps) => {
  const [quantity, setQuantity] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, ModifierOption[]>>({});
  const [instructions, setInstructions] = useState('');
  const addItem = useCartStore((state) => state.addItem);

  const handleModifierToggle = (group: ModifierGroup, option: ModifierOption) => {
    setSelectedModifiers((prev) => {
      const currentSelections = prev[group.id] || [];
      const isSelected = currentSelections.some((o) => o.id === option.id);

      if (isSelected) {
        return {
          ...prev,
          [group.id]: currentSelections.filter((o) => o.id !== option.id),
        };
      }

      if (group.maxSelections === 1) {
        return {
          ...prev,
          [group.id]: [option],
        };
      }

      if (currentSelections.length >= group.maxSelections) {
        return prev;
      }

      return {
        ...prev,
        [group.id]: [...currentSelections, option],
      };
    });
  };

  const isModifierSelected = (groupId: string, optionId: string) => {
    return (selectedModifiers[groupId] || []).some((o) => o.id === optionId);
  };

  const calculateItemTotal = () => {
    let total = item.price;
    Object.values(selectedModifiers).forEach((options) => {
      options.forEach((opt) => {
        total += opt.price;
      });
    });
    return total * quantity;
  };

  const canAddToCart = () => {
    if (!item.modifiers) return true;
    return item.modifiers
      .filter((mod) => mod.required)
      .every((mod) => (selectedModifiers[mod.id] || []).length > 0);
  };

  const handleAddToCart = () => {
    if (!canAddToCart()) {
      toast.error('Please make required selections');
      return;
    }

    const modifiers: SelectedModifier[] = Object.entries(selectedModifiers)
      .filter(([_, options]) => options.length > 0)
      .map(([groupId, options]) => {
        const group = item.modifiers?.find((m) => m.id === groupId);
        return {
          groupId,
          groupName: group?.name || '',
          options,
        };
      });

    addItem(item, quantity, modifiers, instructions || undefined);
    toast.success(`${item.name} added to cart`);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-foreground/50 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-background w-full max-w-lg rounded-t-3xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">{item.name}</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Description & Base Price */}
          <div>
            <p className="text-muted-foreground">{item.description}</p>
            <p className="text-lg font-bold text-primary mt-2">${item.price.toFixed(2)}</p>
          </div>

          {/* Modifiers */}
          {item.modifiers?.map((group) => (
            <div key={group.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">{group.name}</h3>
                <span className="text-xs text-muted-foreground">
                  {group.required ? 'Required' : 'Optional'}
                  {group.maxSelections > 1 && ` • Select up to ${group.maxSelections}`}
                </span>
              </div>
              <div className="space-y-2">
                {group.options.map((option) => {
                  const isSelected = isModifierSelected(group.id, option.id);
                  return (
                    <button
                      key={option.id}
                      onClick={() => handleModifierToggle(group, option)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/30'
                      }`}
                    >
                      <span className="font-medium text-foreground">{option.name}</span>
                      <div className="flex items-center gap-2">
                        {option.price > 0 && (
                          <span className="text-sm text-muted-foreground">
                            +${option.price.toFixed(2)}
                          </span>
                        )}
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSelected
                              ? 'border-primary bg-primary'
                              : 'border-muted-foreground'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Special Instructions */}
          <div className="space-y-2">
            <h3 className="font-semibold text-foreground">Special Instructions</h3>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Any allergies or special requests?"
              className="w-full p-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground resize-none h-20 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border space-y-4 safe-bottom">
          {/* Quantity Selector */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
            >
              <Minus className="w-4 h-4" />
            </Button>
            <span className="text-xl font-bold w-8 text-center text-foreground">{quantity}</span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setQuantity((q) => q + 1)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Add to Cart Button */}
          <Button
            variant="cart"
            size="xl"
            className="w-full"
            onClick={handleAddToCart}
            disabled={!canAddToCart()}
          >
            Add to Cart • ${calculateItemTotal().toFixed(2)}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
};
