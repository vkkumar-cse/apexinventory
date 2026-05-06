
-- ============== ENUMS ==============
CREATE TYPE public.app_role AS ENUM ('admin', 'worker');
CREATE TYPE public.product_type AS ENUM ('raw', 'spare', 'finished');
CREATE TYPE public.transaction_type AS ENUM ('purchase', 'usage', 'sale');

-- ============== PROFILES ==============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by authenticated"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- ============== USER ROLES ==============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS app_role
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid()
  ORDER BY CASE role WHEN 'admin' THEN 1 ELSE 2 END LIMIT 1
$$;

CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============== AUTO PROFILE + ROLE ON SIGNUP ==============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  is_first BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN is_first THEN 'admin'::app_role ELSE 'worker'::app_role END);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============== SUPPLIERS ==============
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Suppliers viewable by authenticated"
  ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage suppliers"
  ON public.suppliers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============== PRODUCTS ==============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type product_type NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  reorder_level INTEGER NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  location TEXT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Products viewable by authenticated"
  ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage products"
  ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER products_touch BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============== TRANSACTIONS ==============
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type transaction_type NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  user_id UUID REFERENCES auth.users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Transactions viewable by authenticated"
  ON public.transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert transactions as themselves"
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'worker')));
CREATE POLICY "Admins delete transactions"
  ON public.transactions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- Trigger to apply stock change atomically; rejects negative stock
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
  delta := CASE NEW.type WHEN 'purchase' THEN NEW.quantity ELSE -NEW.quantity END;

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
CREATE TRIGGER transactions_apply
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_transaction();

-- ============== RELATED ITEMS ==============
CREATE TABLE public.related_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  related_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, related_product_id),
  CHECK (product_id <> related_product_id)
);
ALTER TABLE public.related_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Related items viewable by authenticated"
  ON public.related_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage related items"
  ON public.related_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_transactions_product ON public.transactions(product_id, created_at DESC);
CREATE INDEX idx_products_stock_level ON public.products(stock, reorder_level);
