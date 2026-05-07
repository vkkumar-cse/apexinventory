ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique_ci ON public.products (LOWER(sku)) WHERE sku IS NOT NULL;