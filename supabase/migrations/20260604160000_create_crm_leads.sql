-- ============== CRM MODULE ==============
-- Top-level module key: crm

CREATE TABLE IF NOT EXISTS public.crm_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL,
  is_won BOOLEAN NOT NULL DEFAULT false,
  is_lost BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS public.crm_lead_no_seq START 1;

CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_no TEXT UNIQUE,
  company_name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  requirement TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES public.crm_stages(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

SELECT setval(
  'public.crm_lead_no_seq',
  GREATEST(
    1,
    COALESCE((
      SELECT MAX(substring(lead_no FROM 2)::integer)
      FROM public.leads
      WHERE lead_no ~ '^L[0-9]+$'
    ), 0)
  ),
  EXISTS (SELECT 1 FROM public.leads WHERE lead_no ~ '^L[0-9]+$')
);

CREATE OR REPLACE FUNCTION public.assign_crm_lead_no()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lead_no IS NULL OR btrim(NEW.lead_no) = '' THEN
    NEW.lead_no := 'L' || lpad(nextval('public.crm_lead_no_seq')::text, 4, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_crm_lead_no_trigger ON public.leads;
CREATE TRIGGER assign_crm_lead_no_trigger
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.assign_crm_lead_no();

CREATE OR REPLACE FUNCTION public.crm_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_touch_updated_at_trigger ON public.leads;
CREATE TRIGGER leads_touch_updated_at_trigger
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_crm_stages_position ON public.crm_stages(position);
CREATE INDEX IF NOT EXISTS idx_leads_stage_id ON public.leads(stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_company_name ON public.leads(company_name);

ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM stages viewable by authenticated" ON public.crm_stages;
CREATE POLICY "CRM stages viewable by authenticated"
  ON public.crm_stages FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage CRM stages" ON public.crm_stages;
CREATE POLICY "Admins manage CRM stages"
  ON public.crm_stages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "CRM leads viewable by CRM users" ON public.leads;
CREATE POLICY "CRM leads viewable by CRM users"
  ON public.leads FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND COALESCE(p.status, 'pending') = 'approved'
        AND COALESCE(p.module_access, '[]'::jsonb) ? 'crm'
    )
  );

DROP POLICY IF EXISTS "CRM users manage leads" ON public.leads;
CREATE POLICY "CRM users manage leads"
  ON public.leads FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND COALESCE(p.status, 'pending') = 'approved'
        AND COALESCE(p.module_access, '[]'::jsonb) ? 'crm'
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND COALESCE(p.status, 'pending') = 'approved'
        AND COALESCE(p.module_access, '[]'::jsonb) ? 'crm'
    )
  );
