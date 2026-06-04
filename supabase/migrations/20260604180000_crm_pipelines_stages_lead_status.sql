-- ============== CRM PIPELINES, PIPELINE STAGES, LEAD STATUS ==============

CREATE TABLE IF NOT EXISTS public.crm_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.crm_pipeline_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_pipelines_touch_updated_at_trigger ON public.crm_pipelines;
CREATE TRIGGER crm_pipelines_touch_updated_at_trigger
  BEFORE UPDATE ON public.crm_pipelines
  FOR EACH ROW EXECUTE FUNCTION public.crm_pipeline_touch_updated_at();

-- Remove the earlier stage-level won/lost model.
DROP INDEX IF EXISTS public.crm_stages_one_won;
DROP INDEX IF EXISTS public.crm_stages_one_lost;
ALTER TABLE public.crm_stages DROP CONSTRAINT IF EXISTS crm_stages_not_both_won_lost;
ALTER TABLE public.crm_stages DROP CONSTRAINT IF EXISTS crm_stages_name_key;

ALTER TABLE public.crm_stages
  ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES public.crm_pipelines(id) ON DELETE CASCADE;

WITH existing_default AS (
  SELECT id
  FROM public.crm_pipelines
  WHERE name = 'Default Sales Process'
  LIMIT 1
),
inserted_default AS (
  INSERT INTO public.crm_pipelines (name, description)
  SELECT 'Default Sales Process', 'Migrated CRM stages and leads'
  WHERE NOT EXISTS (SELECT 1 FROM existing_default)
    AND (
      EXISTS (SELECT 1 FROM public.crm_stages)
      OR EXISTS (SELECT 1 FROM public.leads)
    )
  RETURNING id
),
default_pipeline AS (
  SELECT id FROM inserted_default
  UNION ALL
  SELECT id FROM existing_default
  LIMIT 1
)
UPDATE public.crm_stages
SET pipeline_id = (SELECT id FROM default_pipeline)
WHERE pipeline_id IS NULL
  AND EXISTS (SELECT 1 FROM default_pipeline);

ALTER TABLE public.crm_stages
  ALTER COLUMN pipeline_id SET NOT NULL;

ALTER TABLE public.crm_stages
  DROP COLUMN IF EXISTS is_won,
  DROP COLUMN IF EXISTS is_lost;

CREATE INDEX IF NOT EXISTS idx_crm_stages_pipeline_position
  ON public.crm_stages(pipeline_id, position);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crm_stages_pipeline_name_key'
  ) THEN
    ALTER TABLE public.crm_stages
      ADD CONSTRAINT crm_stages_pipeline_name_key UNIQUE (pipeline_id, name);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crm_stages_id_pipeline_unique'
  ) THEN
    ALTER TABLE public.crm_stages
      ADD CONSTRAINT crm_stages_id_pipeline_unique UNIQUE (id, pipeline_id);
  END IF;
END;
$$;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'in_progress';

UPDATE public.leads l
SET pipeline_id = s.pipeline_id
FROM public.crm_stages s
WHERE l.stage_id = s.id
  AND l.pipeline_id IS NULL;

WITH existing_default AS (
  SELECT id
  FROM public.crm_pipelines
  WHERE name = 'Default Sales Process'
  LIMIT 1
)
UPDATE public.leads
SET pipeline_id = (SELECT id FROM existing_default)
WHERE pipeline_id IS NULL
  AND EXISTS (SELECT 1 FROM existing_default);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_status_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_status_check CHECK (status IN ('in_progress', 'won', 'lost'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_stage_pipeline_fkey'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_stage_pipeline_fkey
      FOREIGN KEY (stage_id, pipeline_id)
      REFERENCES public.crm_stages(id, pipeline_id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage
  ON public.leads(pipeline_id, stage_id);

CREATE INDEX IF NOT EXISTS idx_leads_status
  ON public.leads(status);

DROP POLICY IF EXISTS "CRM pipelines viewable by CRM users" ON public.crm_pipelines;
CREATE POLICY "CRM pipelines viewable by CRM users"
  ON public.crm_pipelines FOR SELECT TO authenticated
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

DROP POLICY IF EXISTS "Admins manage CRM pipelines" ON public.crm_pipelines;
CREATE POLICY "Admins manage CRM pipelines"
  ON public.crm_pipelines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "CRM users manage stages" ON public.crm_stages;
DROP POLICY IF EXISTS "Admins manage CRM stages" ON public.crm_stages;
CREATE POLICY "Admins manage CRM stages"
  ON public.crm_stages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
