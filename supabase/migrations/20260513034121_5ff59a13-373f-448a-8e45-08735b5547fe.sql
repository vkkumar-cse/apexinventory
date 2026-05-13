
-- 1. profiles.status (pending / approved / rejected)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_status_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_status_check CHECK (status IN ('pending','approved','rejected'));
  END IF;
END $$;

-- Existing users keep access
UPDATE public.profiles SET status = 'approved' WHERE status IS NULL OR status = 'pending';

-- 2. New-user trigger: first user => approved admin, rest => pending worker
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_first BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;

  INSERT INTO public.profiles (id, email, display_name, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    CASE WHEN is_first THEN 'approved' ELSE 'pending' END
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN is_first THEN 'admin'::app_role ELSE 'worker'::app_role END);

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Custom product types: convert enum columns to text
ALTER TABLE public.products ALTER COLUMN type TYPE text USING type::text;
ALTER TABLE public.products ALTER COLUMN type SET DEFAULT 'spare';

DO $$
BEGIN
  IF to_regclass('public.product_requests') IS NOT NULL THEN
    ALTER TABLE public.product_requests ALTER COLUMN type TYPE text USING type::text;
    ALTER TABLE public.product_requests ALTER COLUMN type SET DEFAULT 'spare';
  END IF;
END $$;

-- 4. Multiple suppliers per product
CREATE TABLE IF NOT EXISTS public.product_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, supplier_id)
);

ALTER TABLE public.product_suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Product suppliers viewable by authenticated" ON public.product_suppliers;
CREATE POLICY "Product suppliers viewable by authenticated"
  ON public.product_suppliers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage product suppliers" ON public.product_suppliers;
CREATE POLICY "Admins manage product suppliers"
  ON public.product_suppliers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed from existing primary supplier_id
INSERT INTO public.product_suppliers (product_id, supplier_id)
SELECT id, supplier_id FROM public.products WHERE supplier_id IS NOT NULL
ON CONFLICT DO NOTHING;
