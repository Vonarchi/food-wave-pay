-- Fix: Phase 1 column UPDATE grants omitted updated_at.
-- The update_profiles_updated_at trigger writes updated_at on every profile UPDATE,
-- which caused "permission denied for table profiles" during onboarding save.

GRANT UPDATE (full_name, phone, restaurant_name, email, updated_at)
  ON public.profiles TO authenticated;

REVOKE UPDATE (subscription_status, stripe_customer_id, stripe_subscription_id, is_platform_admin, plan_code)
  ON public.profiles FROM authenticated;
