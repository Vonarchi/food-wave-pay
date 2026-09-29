-- Phase 5 stored insight snapshots. Scores are computed from restaurant rows, not by the model.

CREATE TABLE IF NOT EXISTS public.restaurant_insight_snapshots (
  restaurant_slug TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurant_insight_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners read insight snapshots" ON public.restaurant_insight_snapshots;
CREATE POLICY "Owners read insight snapshots"
  ON public.restaurant_insight_snapshots FOR SELECT TO authenticated
  USING (restaurant_slug IN (SELECT slug FROM public.food_trucks WHERE owner_id = auth.uid()));
GRANT SELECT ON public.restaurant_insight_snapshots TO authenticated;

CREATE TABLE IF NOT EXISTS public.restaurant_metric_days (
  restaurant_slug TEXT NOT NULL,
  day DATE NOT NULL,
  orders INTEGER NOT NULL,
  revenue NUMERIC NOT NULL,
  cancelled INTEGER NOT NULL,
  PRIMARY KEY (restaurant_slug, day)
);

ALTER TABLE public.restaurant_metric_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners read daily metrics" ON public.restaurant_metric_days;
CREATE POLICY "Owners read daily metrics"
  ON public.restaurant_metric_days FOR SELECT TO authenticated
  USING (restaurant_slug IN (SELECT slug FROM public.food_trucks WHERE owner_id = auth.uid()));
GRANT SELECT ON public.restaurant_metric_days TO authenticated;

CREATE TABLE IF NOT EXISTS public.insight_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_slug TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'approved', 'rejected', 'scheduled', 'active', 'completed')),
  title TEXT NOT NULL,
  evidence TEXT NOT NULL,
  action TEXT NOT NULL,
  effort TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  owner_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  UNIQUE (restaurant_slug, dedupe_key)
);

ALTER TABLE public.insight_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners read recommendations" ON public.insight_recommendations;
CREATE POLICY "Owners read recommendations"
  ON public.insight_recommendations FOR SELECT TO authenticated
  USING (restaurant_slug IN (SELECT slug FROM public.food_trucks WHERE owner_id = auth.uid()));
GRANT SELECT ON public.insight_recommendations TO authenticated;
