import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MenuItem, ModifierGroup } from '@/types';
import { sampleFoodTruck } from '@/data/sampleData';

interface UseMenuItemsResult {
  items: MenuItem[];
  categories: string[];
  truckName: string;
  truckDescription: string;
  isLoading: boolean;
  error: string | null;
}

/**
 * Maps a database menu_items row to a front-end MenuItem.
 * The `modifiers` column in the DB is stored as JSONB.
 */
const mapDbItemToMenuItem = (row: {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  image_url: string | null;
  is_available: boolean;
  modifiers: unknown;
}): MenuItem => ({
  id: row.id,
  name: row.name,
  description: row.description ?? '',
  price: row.price,
  category: row.category,
  image: row.image_url ?? undefined,
  available: row.is_available,
  modifiers: parseModifiers(row.modifiers),
});

const parseModifiers = (raw: unknown): ModifierGroup[] | undefined => {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return undefined;
  try {
    return raw as ModifierGroup[];
  } catch {
    return undefined;
  }
};

export const useMenuItems = (truckId: string): UseMenuItemsResult => {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    const fetchMenuItems = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: dbError } = await supabase
          .from('menu_items')
          .select('*')
          .eq('truck_id', truckId)
          .order('category')
          .order('name');

        if (dbError) throw dbError;

        if (data && data.length > 0) {
          setItems(data.map(mapDbItemToMenuItem));
          setUsingFallback(false);
        } else {
          // No items in DB for this truck – fall back to sample data
          setItems(sampleFoodTruck.menu);
          setUsingFallback(true);
        }
      } catch (err) {
        console.error('Failed to fetch menu items:', err);
        setError('Failed to load menu');
        // Fall back to sample data on error
        setItems(sampleFoodTruck.menu);
        setUsingFallback(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMenuItems();
  }, [truckId]);

  // Derive unique categories preserving DB order
  const categories = usingFallback
    ? sampleFoodTruck.categories
    : [...new Set(items.map((i) => i.category))];

  const truckName = usingFallback ? sampleFoodTruck.name : 'Smackin Jacks';
  const truckDescription = usingFallback
    ? sampleFoodTruck.description
    : 'Order fresh food, made to order';

  return { items, categories, truckName, truckDescription, isLoading, error };
};
