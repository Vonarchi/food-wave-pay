CREATE TABLE public.food_trucks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  cover_image_url TEXT,
  location TEXT,
  hours TEXT DEFAULT '11am - 8pm',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.food_trucks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view food trucks"
  ON public.food_trucks FOR SELECT USING (true);

CREATE POLICY "Anyone can create food trucks"
  ON public.food_trucks FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update food trucks"
  ON public.food_trucks FOR UPDATE USING (true);

CREATE TRIGGER update_food_trucks_updated_at
  BEFORE UPDATE ON public.food_trucks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.food_trucks (slug, name, description, location, hours)
VALUES ('demo', 'Smackin Jacks', 'Order fresh food, made to order', 'Food Truck Row', '11am - 8pm');