-- Add parent_id to categories for sub-categories
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.categories(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_categories_parent ON public.categories(parent_id);

-- Seed top-level OPTO and NPD if not present
INSERT INTO public.categories (name, parent_id)
SELECT 'OPTO', NULL WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name='OPTO' AND parent_id IS NULL);
INSERT INTO public.categories (name, parent_id)
SELECT 'NPD', NULL WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE name='NPD' AND parent_id IS NULL);

-- Helper: get role count to prevent removing last admin
CREATE OR REPLACE FUNCTION public.admin_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT count(*)::int FROM public.user_roles WHERE role='admin';
$$;