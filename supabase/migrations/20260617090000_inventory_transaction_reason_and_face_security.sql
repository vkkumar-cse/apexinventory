ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS description TEXT;

UPDATE public.transactions
SET description = COALESCE(NULLIF(BTRIM(description), ''), NULLIF(BTRIM(note), ''), 'No reason recorded')
WHERE description IS NULL OR BTRIM(description) = '';

ALTER TABLE public.transactions
  ALTER COLUMN description SET NOT NULL;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_reason_required;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_reason_required CHECK (BTRIM(description) <> '');

ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'adjustment';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'damage';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'return';

CREATE OR REPLACE FUNCTION public.apply_transaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  delta INTEGER;
  current_stock INTEGER;
BEGIN
  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  delta := CASE NEW.type::text
    WHEN 'purchase' THEN NEW.quantity
    WHEN 'return' THEN NEW.quantity
    WHEN 'adjustment' THEN NEW.quantity
    ELSE -NEW.quantity
  END;

  SELECT stock INTO current_stock FROM public.products WHERE id = NEW.product_id FOR UPDATE;
  IF current_stock IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  IF current_stock + delta < 0 THEN
    RAISE EXCEPTION 'Insufficient stock (have %, need %)', current_stock, NEW.quantity;
  END IF;

  UPDATE public.products SET stock = current_stock + delta WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Admins manage employee face profiles" ON public.employee_face_profiles;
DROP POLICY IF EXISTS "Admins view employee face profiles" ON public.employee_face_profiles;
DROP POLICY IF EXISTS "Admins reset employee face profiles" ON public.employee_face_profiles;
DROP POLICY IF EXISTS "Workers insert own first employee face profile" ON public.employee_face_profiles;

CREATE POLICY "Admins view employee face profiles"
  ON public.employee_face_profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins reset employee face profiles"
  ON public.employee_face_profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Workers insert own employee face profile after reset"
  ON public.employee_face_profiles FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());
