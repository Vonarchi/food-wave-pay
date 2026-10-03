-- Restore table-level UPDATE on profiles. Column-only grants broke PostgREST
-- updates (and the updated_at trigger). Privileged billing/admin fields stay
-- blocked by private.protect_platform_admin().

GRANT UPDATE ON TABLE public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION private.protect_platform_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
    RAISE EXCEPTION 'platform admin cannot be changed from this session';
  END IF;
  IF NEW.plan_code IS DISTINCT FROM OLD.plan_code THEN
    RAISE EXCEPTION 'plan cannot be changed from this session';
  END IF;
  IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
    RAISE EXCEPTION 'subscription cannot be changed from this session';
  END IF;
  IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id THEN
    RAISE EXCEPTION 'billing fields cannot be changed from this session';
  END IF;

  RETURN NEW;
END;
$$;
