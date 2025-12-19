-- Create orders table for persisting orders
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL,
  truck_id TEXT NOT NULL,
  customer_name TEXT,
  items JSONB NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  tax NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for KDS to see all orders)
CREATE POLICY "Anyone can view orders" 
ON public.orders 
FOR SELECT 
USING (true);

-- Allow public insert (customers placing orders without auth)
CREATE POLICY "Anyone can create orders" 
ON public.orders 
FOR INSERT 
WITH CHECK (true);

-- Allow public update (KDS updating status without auth)
CREATE POLICY "Anyone can update orders" 
ON public.orders 
FOR UPDATE 
USING (true);

-- Enable realtime for orders table
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();