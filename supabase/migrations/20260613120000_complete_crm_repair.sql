-- Safe incremental CRM phase-2 repair.
-- Existing tables are not recreated: customers, leads, crm_pipelines, crm_stages.

CREATE TABLE IF NOT EXISTS public.crm_lead_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL,
  followup_date DATE NOT NULL,
  followup_time TIME,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.crm_lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL,
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source_id UUID,
  ADD COLUMN IF NOT EXISTS estimated_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS customer_id UUID,
  ADD COLUMN IF NOT EXISTS won_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS won_date DATE,
  ADD COLUMN IF NOT EXISTS lost_reason TEXT,
  ADD COLUMN IF NOT EXISTS lost_date DATE,
  ADD COLUMN IF NOT EXISTS is_converted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_by UUID,
  ADD COLUMN IF NOT EXISTS quotation_placeholder JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crm_stages'
      AND column_name = 'is_won'
  ) THEN
    UPDATE public.leads l
    SET status = 'won'
    FROM public.crm_stages s
    WHERE l.stage_id = s.id
      AND COALESCE(s.is_won, false) = true
      AND COALESCE(l.status, 'in_progress') <> 'won';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crm_stages'
      AND column_name = 'is_lost'
  ) THEN
    UPDATE public.leads l
    SET status = 'lost'
    FROM public.crm_stages s
    WHERE l.stage_id = s.id
      AND COALESCE(s.is_lost, false) = true
      AND COALESCE(l.status, 'in_progress') <> 'lost';
  END IF;
END;
$$;

UPDATE public.leads
SET status = 'in_progress'
WHERE status IS NULL
   OR status NOT IN ('in_progress', 'won', 'lost');

ALTER TABLE public.leads ALTER COLUMN status SET DEFAULT 'in_progress';

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_status_check
  CHECK (status IN ('in_progress', 'won', 'lost'));

ALTER TABLE public.leads ALTER COLUMN status SET NOT NULL;

DROP INDEX IF EXISTS public.crm_stages_one_won;
DROP INDEX IF EXISTS public.crm_stages_one_lost;
ALTER TABLE public.crm_stages DROP CONSTRAINT IF EXISTS crm_stages_not_both_won_lost;
ALTER TABLE public.crm_stages DROP COLUMN IF EXISTS is_won;
ALTER TABLE public.crm_stages DROP COLUMN IF EXISTS is_lost;

INSERT INTO public.crm_lead_sources (name, active)
VALUES
  ('Website', true),
  ('WhatsApp', true),
  ('Phone Call', true),
  ('Email', true),
  ('Walk-In', true),
  ('Reference', true),
  ('Facebook', true),
  ('Instagram', true),
  ('LinkedIn', true),
  ('Other', true)
ON CONFLICT (name) DO NOTHING;

UPDATE public.leads
SET source_id = (SELECT id FROM public.crm_lead_sources WHERE name = 'Other' LIMIT 1)
WHERE source_id IS NULL;

UPDATE public.leads
SET source_id = NULL
WHERE source_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.crm_lead_sources s
    WHERE s.id = public.leads.source_id
  );

UPDATE public.leads
SET assigned_to = NULL
WHERE assigned_to IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = public.leads.assigned_to
  );

UPDATE public.leads
SET customer_id = NULL
WHERE customer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = public.leads.customer_id
  );

UPDATE public.leads
SET converted_by = NULL
WHERE converted_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = public.leads.converted_by
  );

UPDATE public.crm_followups
SET created_by = NULL
WHERE created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = public.crm_followups.created_by
  );

UPDATE public.crm_lead_activities
SET created_by = NULL
WHERE created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = public.crm_lead_activities.created_by
  );

ALTER TABLE public.crm_followups DROP CONSTRAINT IF EXISTS crm_followups_status_check;
ALTER TABLE public.crm_followups
  ADD CONSTRAINT crm_followups_status_check
  CHECK (status IN ('pending', 'completed', 'cancelled'));

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_source_id_fkey;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_source_id_fkey
  FOREIGN KEY (source_id)
  REFERENCES public.crm_lead_sources(id)
  ON DELETE SET NULL;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_assigned_to_fkey;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_assigned_to_profiles_fkey;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_assigned_to_profiles_fkey
  FOREIGN KEY (assigned_to)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_customer_id_fkey;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_customer_id_fkey
  FOREIGN KEY (customer_id)
  REFERENCES public.customers(id)
  ON DELETE SET NULL;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_converted_by_fkey;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_converted_by_fkey
  FOREIGN KEY (converted_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.crm_followups DROP CONSTRAINT IF EXISTS crm_followups_lead_id_fkey;
ALTER TABLE public.crm_followups
  ADD CONSTRAINT crm_followups_lead_id_fkey
  FOREIGN KEY (lead_id)
  REFERENCES public.leads(id)
  ON DELETE CASCADE;

ALTER TABLE public.crm_followups DROP CONSTRAINT IF EXISTS crm_followups_created_by_fkey;
ALTER TABLE public.crm_followups
  ADD CONSTRAINT crm_followups_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.crm_lead_activities DROP CONSTRAINT IF EXISTS crm_lead_activities_lead_id_fkey;
ALTER TABLE public.crm_lead_activities
  ADD CONSTRAINT crm_lead_activities_lead_id_fkey
  FOREIGN KEY (lead_id)
  REFERENCES public.leads(id)
  ON DELETE CASCADE;

ALTER TABLE public.crm_lead_activities DROP CONSTRAINT IF EXISTS crm_lead_activities_created_by_fkey;
ALTER TABLE public.crm_lead_activities
  ADD CONSTRAINT crm_lead_activities_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_lead_sources_active_name
  ON public.crm_lead_sources(active, name);

CREATE INDEX IF NOT EXISTS idx_leads_source_id
  ON public.leads(source_id);

CREATE INDEX IF NOT EXISTS idx_leads_assigned_to
  ON public.leads(assigned_to);

CREATE INDEX IF NOT EXISTS idx_leads_customer_id
  ON public.leads(customer_id);

CREATE INDEX IF NOT EXISTS idx_crm_followups_lead_status
  ON public.crm_followups(lead_id, status);

CREATE INDEX IF NOT EXISTS idx_crm_followups_due
  ON public.crm_followups(status, followup_date, followup_time);

CREATE INDEX IF NOT EXISTS idx_crm_lead_activities_lead_created
  ON public.crm_lead_activities(lead_id, created_at);

CREATE OR REPLACE FUNCTION public.crm_log_lead_activity(
  p_lead_id UUID,
  p_activity_type TEXT,
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.crm_lead_activities (lead_id, activity_type, description, metadata, created_by)
  VALUES (p_lead_id, p_activity_type, p_description, COALESCE(p_metadata, '{}'::jsonb), auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_convert_lead_to_customer(p_lead_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_customer_id UUID;
BEGIN
  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  SELECT id INTO v_customer_id
  FROM public.customers
  WHERE (v_lead.phone IS NOT NULL AND phone = v_lead.phone)
     OR (v_lead.email IS NOT NULL AND email = v_lead.email)
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (name, contact_person, phone, email, address, created_by)
    VALUES (v_lead.company_name, v_lead.contact_person, v_lead.phone, v_lead.email, v_lead.address, auth.uid())
    RETURNING id INTO v_customer_id;
  END IF;

  UPDATE public.leads
  SET customer_id = v_customer_id,
      is_converted = true,
      converted_at = now(),
      converted_by = auth.uid()
  WHERE id = p_lead_id;

  RETURN v_customer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_convert_lead_to_customer(UUID) TO authenticated;

ALTER TABLE public.crm_lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM lead sources viewable by authenticated" ON public.crm_lead_sources;
CREATE POLICY "CRM lead sources viewable by authenticated"
  ON public.crm_lead_sources FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert lead sources" ON public.crm_lead_sources;
CREATE POLICY "Authenticated users can insert lead sources"
  ON public.crm_lead_sources FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update lead sources" ON public.crm_lead_sources;
CREATE POLICY "Authenticated users can update lead sources"
  ON public.crm_lead_sources FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "CRM followups viewable by authenticated" ON public.crm_followups;
CREATE POLICY "CRM followups viewable by authenticated"
  ON public.crm_followups FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert followups" ON public.crm_followups;
CREATE POLICY "Authenticated users can insert followups"
  ON public.crm_followups FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update followups" ON public.crm_followups;
CREATE POLICY "Authenticated users can update followups"
  ON public.crm_followups FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete followups" ON public.crm_followups;
CREATE POLICY "Authenticated users can delete followups"
  ON public.crm_followups FOR DELETE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "CRM lead activities viewable by authenticated" ON public.crm_lead_activities;
CREATE POLICY "CRM lead activities viewable by authenticated"
  ON public.crm_lead_activities FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert lead activities" ON public.crm_lead_activities;
CREATE POLICY "Authenticated users can insert lead activities"
  ON public.crm_lead_activities FOR INSERT TO authenticated
  WITH CHECK (true);
