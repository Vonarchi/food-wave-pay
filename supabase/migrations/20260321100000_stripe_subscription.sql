-- Stripe subscription fields for profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';

COMMENT ON COLUMN public.profiles.subscription_status IS 'inactive | active | canceled | past_due';
