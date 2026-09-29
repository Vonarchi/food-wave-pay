-- Phase 3: one conversation session model for phone and drive-thru.
-- Does not rename food_trucks or rewrite existing order policies.

CREATE SCHEMA IF NOT EXISTS private;

ALTER TABLE public.food_trucks
  ADD COLUMN IF NOT EXISTS phone_ordering_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_greeting TEXT,
  ADD COLUMN IF NOT EXISTS phone_fallback_number TEXT,
  ADD COLUMN IF NOT EXISTS phone_hours TEXT,
  ADD COLUMN IF NOT EXISTS phone_accept_orders BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS phone_speak_prices BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS phone_language TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS phone_pay_at_pickup BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS phone_payment_link_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ordering_phone_number TEXT,
  ADD COLUMN IF NOT EXISTS phone_prep_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS drive_thru_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.food_trucks
  DROP CONSTRAINT IF EXISTS food_trucks_phone_greeting_length,
  DROP CONSTRAINT IF EXISTS food_trucks_phone_prep_minutes;

ALTER TABLE public.food_trucks
  ADD CONSTRAINT food_trucks_phone_greeting_length
    CHECK (phone_greeting IS NULL OR char_length(phone_greeting) <= 240),
  ADD CONSTRAINT food_trucks_phone_prep_minutes
    CHECK (phone_prep_minutes IS NULL OR (phone_prep_minutes >= 1 AND phone_prep_minutes <= 180));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS guest_access_token UUID,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pay_at_pickup';

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_source_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_source_check
  CHECK (source IN ('manual', 'mobile_web', 'mobile_voice', 'phone', 'kiosk', 'drive_thru'));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('unpaid', 'pay_at_pickup', 'paid', 'link_pending', 'link_sent'));

CREATE INDEX IF NOT EXISTS orders_guest_access_token_idx
  ON public.orders (guest_access_token);

CREATE TABLE IF NOT EXISTS public.conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_slug TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('mobile_voice', 'phone', 'kiosk', 'drive_thru')),
  external_call_id TEXT,
  customer_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_cart JSONB NOT NULL DEFAULT '[]'::jsonb,
  order_id TEXT,
  handoff_reason TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  duration_seconds INTEGER,
  provider TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  awaiting_confirmation BOOLEAN NOT NULL DEFAULT false,
  submitted BOOLEAN NOT NULL DEFAULT false,
  applied_turn_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  pickup_name TEXT,
  misunderstanding_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS conversation_sessions_restaurant_idx
  ON public.conversation_sessions (restaurant_slug, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS conversation_sessions_call_idx
  ON public.conversation_sessions (restaurant_slug, external_call_id)
  WHERE external_call_id IS NOT NULL;

ALTER TABLE public.conversation_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read their conversation sessions" ON public.conversation_sessions;
CREATE POLICY "Owners read their conversation sessions"
  ON public.conversation_sessions
  FOR SELECT
  TO authenticated
  USING (
    restaurant_slug IN (
      SELECT slug FROM public.food_trucks WHERE owner_id = auth.uid()
    )
  );

REVOKE ALL ON public.conversation_sessions FROM PUBLIC, anon;
GRANT SELECT ON public.conversation_sessions TO authenticated;

GRANT SELECT (
  phone_ordering_enabled,
  phone_greeting,
  phone_fallback_number,
  phone_hours,
  phone_accept_orders,
  phone_speak_prices,
  phone_language,
  phone_pay_at_pickup,
  phone_payment_link_enabled,
  ordering_phone_number,
  phone_prep_minutes,
  drive_thru_enabled
) ON public.food_trucks TO authenticated;

GRANT UPDATE (
  phone_ordering_enabled,
  phone_greeting,
  phone_fallback_number,
  phone_hours,
  phone_accept_orders,
  phone_speak_prices,
  phone_language,
  phone_pay_at_pickup,
  phone_payment_link_enabled,
  ordering_phone_number,
  phone_prep_minutes,
  drive_thru_enabled
) ON public.food_trucks TO authenticated;

-- Product events may not exist on databases that never applied Phase 1.
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
    'upgrade_clicked',
    'voice_session_started',
    'voice_order_item_added',
    'voice_clarification_requested',
    'voice_order_abandoned',
    'voice_order_confirmed',
    'voice_order_completed',
    'voice_upsell_offered',
    'voice_upsell_accepted',
    'phone_call_started',
    'phone_call_completed',
    'phone_order_started',
    'phone_order_completed',
    'phone_order_abandoned',
    'phone_handoff',
    'phone_clarification',
    'phone_upsell_offered',
    'phone_upsell_accepted',
    'drive_thru_session_started',
    'drive_thru_order_completed',
    'drive_thru_order_abandoned',
    'drive_thru_takeover',
    'drive_thru_clarification'
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

DROP POLICY IF EXISTS "Anyone can insert product events" ON public.product_events;
CREATE POLICY "Anyone can insert product events"
  ON public.product_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (char_length(event_name) BETWEEN 3 AND 64);

REVOKE ALL ON public.product_events FROM anon, authenticated;
GRANT INSERT ON public.product_events TO anon, authenticated;
