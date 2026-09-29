-- Food Wave Pay - Consolidated SQL Schema
-- DO NOT run this file on the production project.
-- It recreates the original open RLS policies and omits later auth, Stripe,
-- publish, and Phase 1 tenant policies. Apply supabase/migrations in order instead.

-- =============================================================================
-- 1. Helper function for auto-updating timestamps
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =============================================================================
-- 2. Tables
-- =============================================================================

-- Orders (created first; customers table references order structure)
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL,
  truck_id TEXT NOT NULL,
  customer_name TEXT,
  items JSONB NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  tax NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Menu items
CREATE TABLE public.menu_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  truck_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  category TEXT NOT NULL DEFAULT 'Main',
  image_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  modifiers JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Food trucks
CREATE TABLE public.food_trucks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  cover_image_url TEXT,
  accent_color TEXT DEFAULT '#F3310A',
  location TEXT,
  hours TEXT DEFAULT '11am - 8pm',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Customers (tracks repeat customers per truck)
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id TEXT NOT NULL,
  name TEXT NOT NULL,
  order_count INTEGER NOT NULL DEFAULT 1,
  total_spent NUMERIC NOT NULL DEFAULT 0,
  last_order_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (truck_id, name)
);

-- =============================================================================
-- 3. Row Level Security
-- =============================================================================

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Orders policies
CREATE POLICY "Anyone can view orders" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Anyone can create orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update orders" ON public.orders FOR UPDATE USING (true);

-- Menu items policies
CREATE POLICY "Anyone can view menu items" ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "Anyone can create menu items" ON public.menu_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update menu items" ON public.menu_items FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete menu items" ON public.menu_items FOR DELETE USING (true);

-- Food trucks policies
CREATE POLICY "Anyone can view food trucks" ON public.food_trucks FOR SELECT USING (true);
CREATE POLICY "Anyone can create food trucks" ON public.food_trucks FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update food trucks" ON public.food_trucks FOR UPDATE USING (true);

-- Customers policies
CREATE POLICY "Anyone can view customers" ON public.customers FOR SELECT USING (true);
CREATE POLICY "Anyone can insert customers" ON public.customers FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update customers" ON public.customers FOR UPDATE USING (true);

-- =============================================================================
-- 4. Triggers
-- =============================================================================

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_menu_items_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_food_trucks_updated_at
  BEFORE UPDATE ON public.food_trucks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-upsert customer when order is placed
CREATE OR REPLACE FUNCTION public.handle_new_order_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_name IS NOT NULL AND NEW.customer_name != '' THEN
    INSERT INTO public.customers (truck_id, name, order_count, total_spent, last_order_at)
    VALUES (NEW.truck_id, NEW.customer_name, 1, NEW.total, now())
    ON CONFLICT (truck_id, name)
    DO UPDATE SET
      order_count = customers.order_count + 1,
      total_spent = customers.total_spent + EXCLUDED.total_spent,
      last_order_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_order_created_upsert_customer
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_order_customer();

-- =============================================================================
-- 5. Realtime (orders for kitchen display)
-- =============================================================================

ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- =============================================================================
-- 6. Storage bucket for menu images
-- =============================================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('menu-images', 'menu-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can upload menu images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'menu-images');

CREATE POLICY "Anyone can view menu images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-images');

-- =============================================================================
-- 7. Seed data (optional)
-- =============================================================================

INSERT INTO public.food_trucks (slug, name, description, location, hours)
VALUES ('demo', 'Smackin Jacks', 'Order fresh food, made to order', 'Food Truck Row', '11am - 8pm')
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- 8. Auth & ownership (run 20260321000000_auth_and_ownership.sql after)
-- =============================================================================
-- See supabase/migrations/20260321000000_auth_and_ownership.sql for:
-- profiles, owner_id on food_trucks, RLS policies, handle_new_user trigger
