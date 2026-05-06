
-- Sequential, short, human-friendly product code
CREATE SEQUENCE IF NOT EXISTS public.product_code_seq START 1;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS code INTEGER;

-- Backfill existing rows
UPDATE public.products
SET code = nextval('public.product_code_seq')
WHERE code IS NULL;

ALTER TABLE public.products
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN code SET DEFAULT nextval('public.product_code_seq');

CREATE UNIQUE INDEX IF NOT EXISTS products_code_unique ON public.products(code);

-- Make sure the sequence is ahead of any backfilled values
SELECT setval('public.product_code_seq', GREATEST((SELECT COALESCE(MAX(code), 0) FROM public.products), 1));
