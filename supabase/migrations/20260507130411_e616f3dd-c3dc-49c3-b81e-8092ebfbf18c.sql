
-- Categories table
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories viewable by authenticated"
  ON public.categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage categories"
  ON public.categories FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add fields to products
ALTER TABLE public.products
  ADD COLUMN category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN selling_price NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE INDEX idx_products_category_id ON public.products(category_id);
