CREATE OR REPLACE FUNCTION public.reset_product_code_when_empty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.products) THEN
    PERFORM setval('public.product_code_seq', 1, false);
    NEW.code := nextval('public.product_code_seq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_product_code_when_empty ON public.products;
CREATE TRIGGER trg_reset_product_code_when_empty
BEFORE INSERT ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.reset_product_code_when_empty();

-- Also realign the sequence now so the next insert continues from MAX(code)+1 cleanly
SELECT setval('public.product_code_seq', COALESCE((SELECT MAX(code) FROM public.products), 0) + 1, false);