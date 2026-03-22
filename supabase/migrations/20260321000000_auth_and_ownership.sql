-- Auth and restaurant ownership for launch
-- Run after existing migrations

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  restaurant_name TEXT,
  referral_code TEXT,
  referred_by TEXT,
  partner_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read/update own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Add owner_id to food_trucks (nullable for backwards compat with existing seed data)
ALTER TABLE public.food_trucks
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Restaurant owners can manage their own trucks
CREATE POLICY "Owners can update own trucks" ON public.food_trucks
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Owners can insert trucks" ON public.food_trucks
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Keep existing "Anyone can view" for public menu
-- Owners can manage menu_items for their truck
-- (RLS on menu_items: we'll allow owners to manage by truck ownership)
CREATE POLICY "Owners can insert menu items" ON public.menu_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.food_trucks ft
      WHERE ft.slug = truck_id AND ft.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can update menu items" ON public.menu_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.food_trucks ft
      WHERE ft.slug = truck_id AND ft.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can delete menu items" ON public.menu_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.food_trucks ft
      WHERE ft.slug = truck_id AND ft.owner_id = auth.uid()
    )
  );

-- Owners can view/update orders for their truck
CREATE POLICY "Owners can view own truck orders" ON public.orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.food_trucks ft
      WHERE ft.slug = truck_id AND ft.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can update own truck orders" ON public.orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.food_trucks ft
      WHERE ft.slug = truck_id AND ft.owner_id = auth.uid()
    )
  );

-- Trigger for profiles.updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, referral_code, referred_by, partner_id)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'referral_code',
    NEW.raw_user_meta_data->>'referred_by',
    NEW.raw_user_meta_data->>'partner_id'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
