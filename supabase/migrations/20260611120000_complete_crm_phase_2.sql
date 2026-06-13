-- ============== CRM PHASE 2 COMPLETION ==============

CREATE TABLE IF NOT EXISTS public.crm_lead_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS public.crm_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  followup_date DATE NOT NULL,
  followup_time TIME,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.crm_lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES public.crm_lead_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estimated_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS won_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS won_date DATE,
  ADD COLUMN IF NOT EXISTS lost_reason TEXT,
  ADD COLUMN IF NOT EXISTS lost_date DATE,
  ADD COLUMN IF NOT EXISTS is_converted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quotation_placeholder JSONB;

CREATE INDEX IF NOT EXISTS idx_crm_followups_lead_status
  ON public.crm_followups(lead_id, status);

CREATE INDEX IF NOT EXISTS idx_crm_followups_due
  ON public.crm_followups(status, followup_date, followup_time);

CREATE INDEX IF NOT EXISTS idx_crm_lead_activities_lead_created
  ON public.crm_lead_activities(lead_id, created_at);

CREATE INDEX IF NOT EXISTS idx_leads_source_id
  ON public.leads(source_id);

CREATE INDEX IF NOT EXISTS idx_leads_assigned_to
  ON public.leads(assigned_to);

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

CREATE OR REPLACE FUNCTION public.crm_lead_activity_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_stage TEXT;
  new_stage TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.crm_log_lead_activity(NEW.id, 'lead_created', 'Lead Created');
    RETURN NEW;
  END IF;

  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    SELECT name INTO old_stage FROM public.crm_stages WHERE id = OLD.stage_id;
    SELECT name INTO new_stage FROM public.crm_stages WHERE id = NEW.stage_id;
    PERFORM public.crm_log_lead_activity(
      NEW.id,
      'stage_changed',
      'Lead moved from ' || COALESCE(old_stage, 'Unassigned') || ' to ' || COALESCE(new_stage, 'Unassigned'),
      jsonb_build_object('old_stage_id', OLD.stage_id, 'new_stage_id', NEW.stage_id)
    );
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.crm_log_lead_activity(
      NEW.id,
      'status_changed',
      'Status changed from ' || replace(OLD.status, '_', ' ') || ' to ' || replace(NEW.status, '_', ' '),
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;

  IF OLD.is_converted IS DISTINCT FROM NEW.is_converted AND NEW.is_converted THEN
    PERFORM public.crm_log_lead_activity(NEW.id, 'lead_converted', 'Lead converted to customer');
  END IF;

  IF row_to_json(OLD)::jsonb - 'updated_at' IS DISTINCT FROM row_to_json(NEW)::jsonb - 'updated_at' THEN
    PERFORM public.crm_log_lead_activity(NEW.id, 'lead_updated', 'Lead Updated');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_lead_activity_trigger ON public.leads;
CREATE TRIGGER crm_lead_activity_trigger
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_lead_activity_trigger();

CREATE OR REPLACE FUNCTION public.crm_followup_activity_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.crm_log_lead_activity(NEW.lead_id, 'followup_added', 'Follow-up Added');
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    PERFORM public.crm_log_lead_activity(NEW.lead_id, 'followup_completed', 'Follow-up Completed');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_followup_activity_trigger ON public.crm_followups;
CREATE TRIGGER crm_followup_activity_trigger
  BEFORE INSERT OR UPDATE ON public.crm_followups
  FOR EACH ROW EXECUTE FUNCTION public.crm_followup_activity_trigger();

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
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND COALESCE(p.status, 'pending') = 'approved'
        AND COALESCE(p.module_access, '[]'::jsonb) ? 'crm'
    )
  ) THEN
    RAISE EXCEPTION 'Not allowed to convert CRM leads';
  END IF;

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

DROP POLICY IF EXISTS "CRM lead sources viewable by CRM users" ON public.crm_lead_sources;
CREATE POLICY "CRM lead sources viewable by CRM users"
  ON public.crm_lead_sources FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage CRM lead sources" ON public.crm_lead_sources;
CREATE POLICY "Admins manage CRM lead sources"
  ON public.crm_lead_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "CRM users view followups" ON public.crm_followups;
CREATE POLICY "CRM users view followups"
  ON public.crm_followups FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND COALESCE(p.status, 'pending') = 'approved'
        AND COALESCE(p.module_access, '[]'::jsonb) ? 'crm'
    )
  );

DROP POLICY IF EXISTS "CRM users manage followups" ON public.crm_followups;
CREATE POLICY "CRM users manage followups"
  ON public.crm_followups FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND COALESCE(p.status, 'pending') = 'approved'
        AND COALESCE(p.module_access, '[]'::jsonb) ? 'crm'
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND COALESCE(p.status, 'pending') = 'approved'
        AND COALESCE(p.module_access, '[]'::jsonb) ? 'crm'
    )
  );

DROP POLICY IF EXISTS "CRM users view activities" ON public.crm_lead_activities;
CREATE POLICY "CRM users view activities"
  ON public.crm_lead_activities FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND COALESCE(p.status, 'pending') = 'approved'
        AND COALESCE(p.module_access, '[]'::jsonb) ? 'crm'
    )
  );
