-- Create menu_items table for storing extracted items
CREATE TABLE public.menu_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  truck_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  category TEXT NOT NULL DEFAULT 'Main',
  image_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  modifiers JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

-- Public read access for customers viewing menus
CREATE POLICY "Anyone can view menu items" 
ON public.menu_items 
FOR SELECT 
USING (true);

-- Public insert for admin (in production, restrict to authenticated admins)
CREATE POLICY "Anyone can create menu items" 
ON public.menu_items 
FOR INSERT 
WITH CHECK (true);

-- Public update for admin
CREATE POLICY "Anyone can update menu items" 
ON public.menu_items 
FOR UPDATE 
USING (true);

-- Public delete for admin
CREATE POLICY "Anyone can delete menu items" 
ON public.menu_items 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_menu_items_updated_at
BEFORE UPDATE ON public.menu_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for menu images
INSERT INTO storage.buckets (id, name, public) VALUES ('menu-images', 'menu-images', true);

-- Allow public uploads to menu-images bucket
CREATE POLICY "Anyone can upload menu images"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'menu-images');

-- Allow public read access to menu images
CREATE POLICY "Anyone can view menu images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'menu-images');