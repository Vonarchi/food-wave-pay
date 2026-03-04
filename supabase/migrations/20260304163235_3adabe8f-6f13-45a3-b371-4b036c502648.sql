
-- Customers table to track customer info per restaurant
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id text NOT NULL,
  name text NOT NULL,
  order_count integer NOT NULL DEFAULT 1,
  total_spent numeric NOT NULL DEFAULT 0,
  last_order_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (truck_id, name)
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view customers" ON public.customers FOR SELECT USING (true);
CREATE POLICY "Anyone can insert customers" ON public.customers FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update customers" ON public.customers FOR UPDATE USING (true);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to automatically upsert customer record when an order is placed
CREATE OR REPLACE FUNCTION public.handle_new_order_customer()
RETURNS trigger
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

-- Trigger on orders table to track customers automatically
CREATE TRIGGER on_order_created_upsert_customer
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_order_customer();
