-- Phase 2: voice ordering settings, owner upsells, session limits, analytics names.
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO postgres, anon, authenticated, service_role;
-- Does not rename food_trucks. Does not edit earlier migrations.
-- voice_sessions has no anon/authenticated policies. The voice-order function uses the service role.

ALTER TABLE public.food_trucks
  ADD COLUMN IF NOT EXISTS voice_ordering_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS upsells_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS spoken_responses_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_greeting TEXT;

ALTER TABLE public.food_trucks
  DROP CONSTRAINT IF EXISTS food_trucks_voice_greeting_len;

ALTER TABLE public.food_trucks
  ADD CONSTRAINT food_trucks_voice_greeting_len
  CHECK (voice_greeting IS NULL OR char_length(voice_greeting) <= 240);

-- The public demo can show voice ordering. Other restaurants stay off until the owner enables it.
UPDATE public.food_trucks
SET voice_ordering_enabled = true
WHERE slug = 'demo';

GRANT SELECT (voice_ordering_enabled, spoken_responses_enabled, voice_greeting)
  ON public.food_trucks TO anon;

-- ---------------------------------------------------------------------------
-- Upsell rules. Suggestions must be real menu items for that restaurant.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.menu_upsells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_slug TEXT NOT NULL,
  source_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  suggested_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT menu_upsells_distinct CHECK (source_item_id <> suggested_item_id),
  CONSTRAINT menu_upsells_unique UNIQUE (restaurant_slug, source_item_id, suggested_item_id)
);

CREATE INDEX IF NOT EXISTS menu_upsells_restaurant_idx
  ON public.menu_upsells (restaurant_slug);

ALTER TABLE public.menu_upsells ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.menu_upsells FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.menu_upsells TO authenticated;

DROP POLICY IF EXISTS "Owners manage upsells" ON public.menu_upsells;
CREATE POLICY "Owners manage upsells"
  ON public.menu_upsells
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.food_trucks t
      WHERE t.slug = menu_upsells.restaurant_slug
        AND t.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.food_trucks t
      WHERE t.slug = menu_upsells.restaurant_slug
        AND t.owner_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.menu_items s
      WHERE s.id = source_item_id
        AND s.truck_id = restaurant_slug
    )
    AND EXISTS (
      SELECT 1 FROM public.menu_items g
      WHERE g.id = suggested_item_id
        AND g.truck_id = restaurant_slug
    )
  );

-- ---------------------------------------------------------------------------
-- Voice sessions are written only by the edge function (service role).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_slug TEXT NOT NULL,
  channel TEXT NOT NULL,
  client_ip TEXT,
  turn_count INTEGER NOT NULL DEFAULT 0,
  applied_turn_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_turn_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_sessions_ip_created_idx
  ON public.voice_sessions (client_ip, created_at DESC);

ALTER TABLE public.voice_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.voice_sessions FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Extend the product-event allow list. Replace the function; do not edit Phase 1.
-- ---------------------------------------------------------------------------

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
    'voice_upsell_accepted'
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
