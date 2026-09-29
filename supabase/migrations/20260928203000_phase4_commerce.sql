-- Phase 4 commercial operations. Does not rename food_trucks or replace the ordering engine.

CREATE SCHEMA IF NOT EXISTS private;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_code TEXT NOT NULL DEFAULT 'free';

CREATE OR REPLACE FUNCTION private.protect_platform_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'platform admin cannot be changed from this session';
  END IF;
  IF NEW.plan_code IS DISTINCT FROM OLD.plan_code
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'plan cannot be changed from this session';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_platform_admin ON public.profiles;
CREATE TRIGGER protect_platform_admin
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_platform_admin();

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners manage their organization" ON public.organizations;
CREATE POLICY "Owners manage their organization"
  ON public.organizations
  FOR ALL
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;

ALTER TABLE public.food_trucks
  ADD COLUMN IF NOT EXISTS organization_id UUID,
  ADD COLUMN IF NOT EXISTS ordering_paused BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_payment_before_kitchen BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pay_at_pickup_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS menu_source TEXT NOT NULL DEFAULT 'kio',
  ADD COLUMN IF NOT EXISTS order_route TEXT NOT NULL DEFAULT 'kds',
  ADD COLUMN IF NOT EXISTS default_language TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  ADD COLUMN IF NOT EXISTS card_payments_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.food_trucks DROP CONSTRAINT IF EXISTS food_trucks_menu_source_check;
ALTER TABLE public.food_trucks
  ADD CONSTRAINT food_trucks_menu_source_check CHECK (menu_source IN ('kio', 'pos', 'manual'));
ALTER TABLE public.food_trucks DROP CONSTRAINT IF EXISTS food_trucks_order_route_check;
ALTER TABLE public.food_trucks
  ADD CONSTRAINT food_trucks_order_route_check CHECK (order_route IN ('kds', 'pos', 'both'));

GRANT SELECT (
  organization_id, ordering_paused, test_mode, require_payment_before_kitchen,
  pay_at_pickup_enabled, menu_source, order_route, default_language,
  stripe_account_id, card_payments_enabled
) ON public.food_trucks TO authenticated;
GRANT UPDATE (
  organization_id, ordering_paused, test_mode, require_payment_before_kitchen,
  pay_at_pickup_enabled, menu_source, order_route, default_language
) ON public.food_trucks TO authenticated;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS external_item_id TEXT,
  ADD COLUMN IF NOT EXISTS external_pos_id TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_status TEXT,
  ADD COLUMN IF NOT EXISTS sync_error TEXT;

CREATE TABLE IF NOT EXISTS public.restaurant_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  restaurant_slug TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'kitchen', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, restaurant_slug)
);

ALTER TABLE public.restaurant_staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read their staff row" ON public.restaurant_staff;
CREATE POLICY "Members read their staff row"
  ON public.restaurant_staff FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR restaurant_slug IN (SELECT slug FROM public.food_trucks WHERE owner_id = auth.uid())
  );
DROP POLICY IF EXISTS "Owners manage staff" ON public.restaurant_staff;
CREATE POLICY "Owners manage staff"
  ON public.restaurant_staff FOR ALL TO authenticated
  USING (restaurant_slug IN (SELECT slug FROM public.food_trucks WHERE owner_id = auth.uid()))
  WITH CHECK (restaurant_slug IN (SELECT slug FROM public.food_trucks WHERE owner_id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_staff TO authenticated;

CREATE TABLE IF NOT EXISTS public.menu_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_slug TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('item', 'category', 'modifier_group', 'modifier_option')),
  entity_id TEXT NOT NULL,
  field TEXT NOT NULL CHECK (field IN ('name', 'description')),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'es')),
  text TEXT NOT NULL,
  UNIQUE (restaurant_slug, entity_type, entity_id, field, locale)
);

ALTER TABLE public.menu_translations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read menu translations" ON public.menu_translations;
CREATE POLICY "Anyone can read menu translations"
  ON public.menu_translations FOR SELECT TO anon, authenticated
  USING (true);
DROP POLICY IF EXISTS "Owners write menu translations" ON public.menu_translations;
CREATE POLICY "Owners write menu translations"
  ON public.menu_translations FOR ALL TO authenticated
  USING (restaurant_slug IN (SELECT slug FROM public.food_trucks WHERE owner_id = auth.uid()))
  WITH CHECK (restaurant_slug IN (SELECT slug FROM public.food_trucks WHERE owner_id = auth.uid()));
GRANT SELECT ON public.menu_translations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.menu_translations TO authenticated;

CREATE TABLE IF NOT EXISTS public.pos_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_slug TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('square', 'toast', 'clover', 'lightspeed', 'touchbistro', 'ncr')),
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connected', 'error')),
  external_account_id TEXT,
  external_location_id TEXT,
  last_health_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_slug, provider)
);

ALTER TABLE public.pos_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners read POS connections" ON public.pos_connections;
CREATE POLICY "Owners read POS connections"
  ON public.pos_connections FOR SELECT TO authenticated
  USING (restaurant_slug IN (SELECT slug FROM public.food_trucks WHERE owner_id = auth.uid()));
GRANT SELECT ON public.pos_connections TO authenticated;

-- Tokens stay out of the browser. No policies and no grants for anon or signed-in users.
CREATE TABLE IF NOT EXISTS public.pos_secrets (
  connection_id UUID PRIMARY KEY REFERENCES public.pos_connections (id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ
);
ALTER TABLE public.pos_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pos_secrets FROM PUBLIC, anon, authenticated;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS payment_method_type TEXT,
  ADD COLUMN IF NOT EXISTS routing_status TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS pos_external_order_id TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN (
    'unpaid', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded',
    'pay_at_pickup', 'link_pending', 'link_sent'
  ));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_source_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_source_check
  CHECK (source IN (
    'manual', 'manual_web', 'mobile_web', 'mobile_voice', 'qr', 'voice_qr',
    'phone', 'kiosk', 'drive_thru', 'pos'
  ));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_routing_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_routing_status_check
  CHECK (routing_status IN (
    'not_required', 'pending_submission', 'submitted', 'submission_failed', 'requires_staff_attention'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_idx
  ON public.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.plans (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_price_cents INTEGER,
  platform_fee_bps INTEGER NOT NULL DEFAULT 0,
  features JSONB NOT NULL DEFAULT '[]'::jsonb
);

INSERT INTO public.plans (code, name, monthly_price_cents, platform_fee_bps, features)
VALUES
  ('free', 'Free', 0, 0, '["menu_scan","digital_menu","qr_code"]'::jsonb),
  ('core', 'Core', NULL, 0, '["menu_scan","digital_menu","qr_code","online_ordering","kds"]'::jsonb),
  ('ai_cashier', 'AI Cashier', NULL, 0, '["menu_scan","digital_menu","qr_code","online_ordering","kds","voice_ordering","upsells"]'::jsonb),
  ('pro', 'Pro', NULL, 0, '["menu_scan","digital_menu","qr_code","online_ordering","kds","voice_ordering","upsells","phone_ai","analytics_advanced","pos_integration","multilingual","drive_thru"]'::jsonb)
ON CONFLICT (code) DO UPDATE
SET features = EXCLUDED.features,
    name = EXCLUDED.name;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read plans" ON public.plans;
CREATE POLICY "Anyone can read plans" ON public.plans FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.plans TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_slug TEXT NOT NULL,
  kind TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners read usage" ON public.usage_events;
CREATE POLICY "Owners read usage"
  ON public.usage_events FOR SELECT TO authenticated
  USING (restaurant_slug IN (SELECT slug FROM public.food_trucks WHERE owner_id = auth.uid()));
GRANT SELECT ON public.usage_events TO authenticated;

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  restaurant_slug TEXT,
  action TEXT NOT NULL,
  resource TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners read their audit log" ON public.audit_log;
CREATE POLICY "Owners read their audit log"
  ON public.audit_log FOR SELECT TO authenticated
  USING (
    restaurant_slug IN (SELECT slug FROM public.food_trucks WHERE owner_id = auth.uid())
  );
GRANT SELECT ON public.audit_log TO authenticated;

CREATE OR REPLACE FUNCTION private.audit_menu_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price THEN
    INSERT INTO public.audit_log (actor_id, restaurant_slug, action, resource, metadata)
    VALUES (auth.uid(), NEW.truck_id, 'menu_price_changed', NEW.id::text,
      jsonb_build_object('from', OLD.price, 'to', NEW.price, 'name', NEW.name));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_menu_price ON public.menu_items;
CREATE TRIGGER audit_menu_price
  AFTER UPDATE ON public.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION private.audit_menu_price();

CREATE TABLE IF NOT EXISTS public.job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_slug TEXT,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  run_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_queue FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.campaign_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign TEXT NOT NULL,
  user_id UUID,
  event_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users insert their campaign events" ON public.campaign_visits;
CREATE POLICY "Users insert their campaign events"
  ON public.campaign_visits FOR INSERT TO anon, authenticated
  WITH CHECK (char_length(campaign) BETWEEN 2 AND 40);
GRANT INSERT ON public.campaign_visits TO anon, authenticated;

CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_platform_admin = true
  );
$$;

REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated;
