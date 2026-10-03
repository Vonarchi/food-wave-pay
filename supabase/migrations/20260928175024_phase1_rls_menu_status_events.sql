-- Phase 1: tenant isolation, menu status, and product events.
--
-- Policy changes (Postgres ORs permissive policies, so owner policies added
-- earlier did not replace the original "anyone can ..." policies):
--
-- DROPPED
--   orders: "Anyone can view/create/update orders"
--   orders: previous owner select/update policies (recreated below with WITH CHECK)
--   menu_items: "Anyone can create/update/delete menu items"
--   menu_items: previous public-read and owner policies (recreated below)
--   food_trucks: "Anyone can view/create/update food trucks"
--   food_trucks: previous owner insert/update policies (recreated below)
--   customers: "Anyone can view/insert/update customers"
--   storage.objects: "Anyone can upload menu images"
--
-- KEPT
--   storage.objects: "Anyone can view menu images" (public logos and item photos)
--
-- ADDED
--   food_trucks.menu_status: draft | published | paused
--     published  -> is_published true  (public menu + guest orders)
--     draft/paused -> is_published false (hidden, menu rows kept)
--   food_trucks.website, phone, business_type, published_at
--   orders.guest_access_token: guest SELECT only when request header
--     x-order-token matches that row. No public order listing.
--   product_events: insert-only whitelist. No client reads.
--
-- Publishing a digital menu is not tied to Stripe. The webhook must not
-- unpublish menus when a subscription lapses.

-- ---------------------------------------------------------------------------
-- Restaurant profile columns. Table name food_trucks is unchanged.
-- ---------------------------------------------------------------------------

ALTER TABLE public.food_trucks
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS business_type TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS menu_status TEXT;

UPDATE public.food_trucks
SET menu_status = CASE WHEN is_published THEN 'published' ELSE 'draft' END
WHERE menu_status IS NULL;

UPDATE public.food_trucks
SET published_at = COALESCE(published_at, updated_at, now())
WHERE is_published = true AND published_at IS NULL;

ALTER TABLE public.food_trucks
  ALTER COLUMN menu_status SET DEFAULT 'draft';

UPDATE public.food_trucks SET menu_status = 'draft' WHERE menu_status IS NULL;

ALTER TABLE public.food_trucks
  ALTER COLUMN menu_status SET NOT NULL;

ALTER TABLE public.food_trucks
  DROP CONSTRAINT IF EXISTS food_trucks_menu_status_check;

ALTER TABLE public.food_trucks
  ADD CONSTRAINT food_trucks_menu_status_check
  CHECK (menu_status IN ('draft', 'published', 'paused'));

COMMENT ON COLUMN public.food_trucks.menu_status IS
  'draft: not public. published: public QR menu. paused: hidden without deleting items.';

-- private is not added to exposed API schemas. Helpers live here so they are
-- not callable through PostgREST.
CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO postgres, service_role, anon, authenticated;

-- Keep is_published aligned for existing RLS and client filters.
CREATE OR REPLACE FUNCTION private.sync_restaurant_menu_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.menu_status IS NULL OR NEW.menu_status NOT IN ('draft', 'published', 'paused') THEN
    NEW.menu_status := CASE WHEN COALESCE(NEW.is_published, false) THEN 'published' ELSE 'draft' END;
  END IF;

  NEW.is_published := (NEW.menu_status = 'published');

  IF NEW.menu_status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_restaurant_menu_status ON public.food_trucks;
CREATE TRIGGER sync_restaurant_menu_status
  BEFORE INSERT OR UPDATE ON public.food_trucks
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_restaurant_menu_status();

-- Block slug takeover and relabeling the public link.
CREATE OR REPLACE FUNCTION private.prevent_restaurant_identity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'Restaurant link cannot be changed';
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Restaurant owner cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_restaurant_identity_change ON public.food_trucks;
CREATE TRIGGER prevent_restaurant_identity_change
  BEFORE UPDATE ON public.food_trucks
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_restaurant_identity_change();

GRANT EXECUTE ON FUNCTION private.sync_restaurant_menu_status() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.prevent_restaurant_identity_change() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Orders: guest token, no public listing, no guest status updates
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS guest_access_token UUID;

CREATE INDEX IF NOT EXISTS orders_guest_access_token_idx
  ON public.orders (guest_access_token);

CREATE INDEX IF NOT EXISTS food_trucks_owner_id_idx
  ON public.food_trucks (owner_id);

-- ---------------------------------------------------------------------------
-- Product events (insert only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  restaurant_slug TEXT,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_events_name_created_idx
  ON public.product_events (event_name, created_at DESC);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.enforce_product_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.event_name NOT IN (
    'signup_started',
    'signup_completed',
    'restaurant_created',
    'menu_upload_started',
    'menu_extraction_completed',
    'menu_review_completed',
    'menu_published',
    'qr_downloaded',
    'public_menu_viewed',
    'checkout_started',
    'order_completed',
    'upgrade_clicked'
  ) THEN
    RAISE EXCEPTION 'Unknown product event';
  END IF;

  IF NEW.restaurant_slug IS NOT NULL AND char_length(NEW.restaurant_slug) > 80 THEN
    RAISE EXCEPTION 'Restaurant slug is too long';
  END IF;

  IF octet_length(COALESCE(NEW.properties, '{}'::jsonb)::text) > 2000 THEN
    RAISE EXCEPTION 'Event payload is too large';
  END IF;

  NEW.properties := COALESCE(NEW.properties, '{}'::jsonb);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_product_event ON public.product_events;
CREATE TRIGGER enforce_product_event
  BEFORE INSERT ON public.product_events
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_product_event();

GRANT EXECUTE ON FUNCTION private.enforce_product_event() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Drop legacy open policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can view orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can update orders" ON public.orders;
DROP POLICY IF EXISTS "Owners can view own truck orders" ON public.orders;
DROP POLICY IF EXISTS "Owners can update own truck orders" ON public.orders;
DROP POLICY IF EXISTS "Guest reads order by token" ON public.orders;
DROP POLICY IF EXISTS "Owners select own orders" ON public.orders;
DROP POLICY IF EXISTS "Owners update own orders" ON public.orders;
DROP POLICY IF EXISTS "Public places order for live menu" ON public.orders;

DROP POLICY IF EXISTS "Anyone can view menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Anyone can create menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Anyone can update menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Anyone can delete menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Public read published menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Owners read own unpublished menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Owners can insert menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Owners can update menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Owners can delete menu items" ON public.menu_items;

DROP POLICY IF EXISTS "Anyone can view food trucks" ON public.food_trucks;
DROP POLICY IF EXISTS "Anyone can create food trucks" ON public.food_trucks;
DROP POLICY IF EXISTS "Anyone can update food trucks" ON public.food_trucks;
DROP POLICY IF EXISTS "Owners can update own trucks" ON public.food_trucks;
DROP POLICY IF EXISTS "Owners can insert trucks" ON public.food_trucks;
DROP POLICY IF EXISTS "Public reads live restaurants" ON public.food_trucks;
DROP POLICY IF EXISTS "Owners read own restaurants" ON public.food_trucks;
DROP POLICY IF EXISTS "Owners insert own restaurants" ON public.food_trucks;
DROP POLICY IF EXISTS "Owners update own restaurants" ON public.food_trucks;

DROP POLICY IF EXISTS "Anyone can view customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can update customers" ON public.customers;
DROP POLICY IF EXISTS "Owners read own customers" ON public.customers;

DROP POLICY IF EXISTS "Anyone can insert product events" ON public.product_events;

DROP POLICY IF EXISTS "Anyone can upload menu images" ON storage.objects;
DROP POLICY IF EXISTS "Owners upload own menu files" ON storage.objects;
DROP POLICY IF EXISTS "Owners update own menu files" ON storage.objects;
DROP POLICY IF EXISTS "Owners delete own menu files" ON storage.objects;

-- ---------------------------------------------------------------------------
-- food_trucks
-- ---------------------------------------------------------------------------

CREATE POLICY "Public reads live restaurants"
  ON public.food_trucks
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true OR slug = 'demo');

CREATE POLICY "Owners read own restaurants"
  ON public.food_trucks
  FOR SELECT
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

CREATE POLICY "Owners insert own restaurants"
  ON public.food_trucks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND slug <> 'demo'
    AND char_length(slug) BETWEEN 2 AND 48
  );

CREATE POLICY "Owners update own restaurants"
  ON public.food_trucks
  FOR UPDATE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()) AND slug <> 'demo')
  WITH CHECK (owner_id = (SELECT auth.uid()) AND slug <> 'demo');

-- ---------------------------------------------------------------------------
-- menu_items
-- ---------------------------------------------------------------------------

CREATE POLICY "Public read published menu items"
  ON public.menu_items
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.food_trucks ft
      WHERE ft.slug = menu_items.truck_id
        AND (ft.is_published = true OR ft.slug = 'demo')
    )
  );

CREATE POLICY "Owners read own unpublished menu items"
  ON public.menu_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.food_trucks ft
      WHERE ft.slug = menu_items.truck_id
        AND ft.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Owners can insert menu items"
  ON public.menu_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.food_trucks ft
      WHERE ft.slug = menu_items.truck_id
        AND ft.owner_id = (SELECT auth.uid())
        AND ft.slug <> 'demo'
    )
  );

CREATE POLICY "Owners can update menu items"
  ON public.menu_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.food_trucks ft
      WHERE ft.slug = menu_items.truck_id
        AND ft.owner_id = (SELECT auth.uid())
        AND ft.slug <> 'demo'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.food_trucks ft
      WHERE ft.slug = menu_items.truck_id
        AND ft.owner_id = (SELECT auth.uid())
        AND ft.slug <> 'demo'
    )
  );

CREATE POLICY "Owners can delete menu items"
  ON public.menu_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.food_trucks ft
      WHERE ft.slug = menu_items.truck_id
        AND ft.owner_id = (SELECT auth.uid())
        AND ft.slug <> 'demo'
    )
  );

-- ---------------------------------------------------------------------------
-- orders
-- Guest SELECT requires header x-order-token. Listing without it returns nothing.
-- INSERT only for a published menu (or the built-in demo) and status received.
-- UPDATE is owner-only, so kitchen status cannot be changed anonymously.
-- ---------------------------------------------------------------------------

CREATE POLICY "Guest reads order by token"
  ON public.orders
  FOR SELECT
  TO anon, authenticated
  USING (
    guest_access_token IS NOT NULL
    AND guest_access_token::text = coalesce(
      current_setting('request.headers', true)::json->>'x-order-token',
      ''
    )
    AND coalesce(current_setting('request.headers', true)::json->>'x-order-token', '') <> ''
  );

CREATE POLICY "Owners select own orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.food_trucks ft
      WHERE ft.slug = orders.truck_id
        AND ft.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Public places order for live menu"
  ON public.orders
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'received'
    AND guest_access_token IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.food_trucks ft
      WHERE ft.slug = orders.truck_id
        AND (ft.is_published = true OR ft.slug = 'demo')
    )
  );

CREATE POLICY "Owners update own orders"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.food_trucks ft
      WHERE ft.slug = orders.truck_id
        AND ft.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.food_trucks ft
      WHERE ft.slug = orders.truck_id
        AND ft.owner_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- customers: owner read only. Inserts happen in the security-definer trigger.
-- ---------------------------------------------------------------------------

CREATE POLICY "Owners read own customers"
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.food_trucks ft
      WHERE ft.slug = customers.truck_id
        AND ft.owner_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- product_events
-- ---------------------------------------------------------------------------

CREATE POLICY "Anyone can insert product events"
  ON public.product_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (char_length(event_name) BETWEEN 3 AND 64);

-- ---------------------------------------------------------------------------
-- profiles: users cannot self-activate a subscription
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
-- Privileged billing/admin columns are blocked by private.protect_platform_admin().

-- ---------------------------------------------------------------------------
-- Table grants. service_role is intentionally left untouched.
-- Anon food_trucks SELECT excludes owner_id.
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.orders FROM anon, authenticated;
GRANT SELECT, INSERT ON public.orders TO anon, authenticated;
GRANT UPDATE ON public.orders TO authenticated;

REVOKE ALL ON public.menu_items FROM anon, authenticated;
GRANT SELECT ON public.menu_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;

REVOKE ALL ON public.food_trucks FROM anon, authenticated;
GRANT SELECT (
  id,
  slug,
  name,
  description,
  logo_url,
  cover_image_url,
  accent_color,
  location,
  hours,
  is_active,
  is_published,
  menu_status,
  business_type,
  website,
  phone,
  published_at,
  created_at,
  updated_at
) ON public.food_trucks TO anon;
GRANT SELECT, INSERT, UPDATE ON public.food_trucks TO authenticated;

REVOKE ALL ON public.customers FROM anon, authenticated;
GRANT SELECT ON public.customers TO authenticated;

REVOKE ALL ON public.product_events FROM anon, authenticated;
GRANT INSERT ON public.product_events TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: signed-in owners upload only inside their user-id folder.
-- ---------------------------------------------------------------------------

CREATE POLICY "Owners upload own menu files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'menu-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "Owners update own menu files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'menu-images'
    AND owner = (SELECT auth.uid())
  )
  WITH CHECK (
    bucket_id = 'menu-images'
    AND owner = (SELECT auth.uid())
  );

CREATE POLICY "Owners delete own menu files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'menu-images'
    AND owner = (SELECT auth.uid())
  );
