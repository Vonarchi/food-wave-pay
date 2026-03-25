import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MenuItem, ModifierGroup } from '@/types';
import { sampleFoodTruck } from '@/data/sampleData';

/** Hard cap so a stalled PostgREST fetch cannot leave the menu in an infinite loading state (seen in prod). */
const MENU_FETCH_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

interface UseMenuItemsResult {
  items: MenuItem[];
  categories: string[];
  truckName: string;
  truckDescription: string;
  truckLocation: string;
  truckHours: string;
  truckLogo?: string;
  truckCoverImage?: string;
  truckAccentColor?: string;
  isLoading: boolean;
  error: string | null;
  /** True when showing sample data (empty DB, error, or timeout). */
  usingFallback: boolean;
}

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
  const [truckInfo, setTruckInfo] = useState<{
    name: string;
    description: string;
    location: string;
    hours: string;
    logo_url?: string;
    cover_image_url?: string;
    accent_color?: string;
  } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        console.info("[useMenuItems] fetch start", { truckId });

        // Fetch truck info and menu items in parallel — bounded so prod network stalls cannot spin forever.
        const [truckResult, menuResult] = await withTimeout(
          Promise.all([
            supabase
              .from('food_trucks' as any)
              .select('*')
              .eq('slug', truckId)
              .maybeSingle(),
            supabase
              .from('menu_items')
              .select('*')
              .eq('truck_id', truckId)
              .order('category')
              .order('name'),
          ]),
          MENU_FETCH_TIMEOUT_MS,
          "menu_fetch"
        );

        console.info("[useMenuItems] fetch ok", { truckId });

        // Set truck info
        if (truckResult.data) {
          const t = truckResult.data as any;
          setTruckInfo({
            name: t.name,
            description: t.description || '',
            location: t.location || 'Food Truck Row',
            hours: t.hours || '11am - 8pm',
            logo_url: t.logo_url || undefined,
            cover_image_url: t.cover_image_url || undefined,
            accent_color: t.accent_color || undefined,
          });
        }

        // Set menu items
        if (menuResult.error) throw menuResult.error;

        if (menuResult.data && menuResult.data.length > 0) {
          setItems(menuResult.data.map(mapDbItemToMenuItem));
          setUsingFallback(false);
        } else {
          setItems(sampleFoodTruck.menu);
          setUsingFallback(true);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[useMenuItems] fetch failed", { truckId, msg });
        setError(
          msg.endsWith("_timeout")
            ? "Menu load timed out. Showing sample menu — check network or Supabase."
            : "Failed to load menu. Showing sample menu."
        );
        setItems(sampleFoodTruck.menu);
        setUsingFallback(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [truckId]);

  const categories = usingFallback
    ? sampleFoodTruck.categories
    : [...new Set(items.map((i) => i.category))];

  const truckName = truckInfo?.name || (usingFallback ? sampleFoodTruck.name : 'Smackin Jacks');
  const truckDescription = truckInfo?.description || (usingFallback ? sampleFoodTruck.description : 'Order fresh food, made to order');
  const truckLocation = truckInfo?.location || 'Food Truck Row';
  const truckHours = truckInfo?.hours || '11am - 8pm';

  return {
    items,
    categories,
    truckName,
    truckDescription,
    truckLocation,
    truckHours,
    truckLogo: truckInfo?.logo_url,
    truckCoverImage: truckInfo?.cover_image_url,
    truckAccentColor: truckInfo?.accent_color,
    isLoading,
    error,
    usingFallback,
  };
};
