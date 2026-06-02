-- ============== CUSTOMERS ==============
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code TEXT UNIQUE,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  gst_number TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers viewable by authenticated"
  ON public.customers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage customers"
  ON public.customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============== DELIVERY CHALLANS ==============
CREATE TABLE public.delivery_challans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_number TEXT UNIQUE NOT NULL,
  challan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT NOT NULL,
  customer_name_snapshot TEXT NOT NULL,
  customer_address_snapshot TEXT,
  contact_number TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'dispatched', 'cancelled')),
  returnable BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.delivery_challans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delivery challans viewable by authenticated"
  ON public.delivery_challans FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage delivery challans"
  ON public.delivery_challans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============== DELIVERY CHALLAN ITEMS ==============
CREATE TABLE public.delivery_challan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_id UUID REFERENCES public.delivery_challans(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  uom TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_challan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delivery challan items viewable by authenticated"
  ON public.delivery_challan_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage delivery challan items"
  ON public.delivery_challan_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============== INDEXES ==============
CREATE INDEX idx_delivery_challans_customer ON public.delivery_challans(customer_id);
CREATE INDEX idx_delivery_challan_items_challan ON public.delivery_challan_items(challan_id);
