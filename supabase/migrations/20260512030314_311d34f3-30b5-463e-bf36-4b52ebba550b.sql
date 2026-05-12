
-- Allow duplicate sub-category names across different parents; keep top-level OPTO/NPD unique.
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_parent_unique
  ON public.categories (name, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Suppliers: add dedicated email & phone fields.
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS phone text;
