-- Published menus: only live trucks (or demo) are visible to anonymous customers.
-- Owners always see their own menu_items via policy for admin.

ALTER TABLE public.food_trucks
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.food_trucks.is_published IS 'When true, anonymous users can read menu_items for this truck (and it can appear in directory).';

-- Demo stays public for trials / marketing
UPDATE public.food_trucks
SET is_published = true
WHERE slug = 'demo';

-- Replace wide-open menu read with published-or-demo + owner read
DROP POLICY IF EXISTS "Anyone can view menu items" ON public.menu_items;

CREATE POLICY "Public read published menu items" ON public.menu_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.food_trucks ft
      WHERE ft.slug = menu_items.truck_id
        AND (ft.is_published = true OR ft.slug = 'demo')
    )
  );

CREATE POLICY "Owners read own unpublished menu items" ON public.menu_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.food_trucks ft
      WHERE ft.slug = menu_items.truck_id
        AND ft.owner_id IS NOT NULL
        AND ft.owner_id = (SELECT auth.uid())
    )
  );
