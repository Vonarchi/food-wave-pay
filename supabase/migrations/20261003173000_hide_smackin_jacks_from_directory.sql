-- Demo sample stays at slug=demo for /menu/demo only.
-- Rename so it is not presented as a general restaurant listing.
UPDATE public.food_trucks
SET
  name = 'KioKitchen Sample',
  description = 'Sample menu for trying KioKitchen — not a live restaurant.',
  is_published = false
WHERE slug = 'demo';

-- Stray seed row with a spaced slug should not appear anywhere public.
UPDATE public.food_trucks
SET is_active = false, is_published = false
WHERE trim(slug) ILIKE 'smackin%jacks%'
   OR trim(name) ILIKE 'smackin%jacks%';
