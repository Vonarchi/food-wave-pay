import { MenuItem } from '@/types';
import { motion } from 'framer-motion';

interface MenuItemCardProps {
  item: MenuItem;
  onSelect: (item: MenuItem) => void;
  displayName?: string;
  displayDescription?: string;
}

export const MenuItemCard = ({ item, onSelect, displayName, displayDescription }: MenuItemCardProps) => {
  const isAvailable = item.available;

  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => isAvailable && onSelect(item)}
      disabled={!isAvailable}
      className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
        isAvailable
          ? 'bg-card border-border hover:border-primary/30 hover:shadow-md active:bg-secondary/50'
          : 'bg-muted/50 border-border opacity-60 cursor-not-allowed'
      }`}
    >
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground truncate">{displayName || item.name}</h3>
            {!isAvailable && (
              <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded-full">
                Sold out
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {displayDescription || item.description}
          </p>
          <p className="text-base font-bold text-primary mt-2">
            ${item.price.toFixed(2)}
          </p>
        </div>
        {item.image && (
          <div className="w-20 h-20 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
            <img
              src={item.image}
              alt={item.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>
    </motion.button>
  );
};
