-- ============== DYNAMIC CRM STAGE RULES ==============

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crm_stages_not_both_won_lost'
  ) THEN
    ALTER TABLE public.crm_stages
      ADD CONSTRAINT crm_stages_not_both_won_lost
      CHECK (NOT (is_won AND is_lost));
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS crm_stages_one_won
  ON public.crm_stages (is_won)
  WHERE is_won;

CREATE UNIQUE INDEX IF NOT EXISTS crm_stages_one_lost
  ON public.crm_stages (is_lost)
  WHERE is_lost;

DROP POLICY IF EXISTS "Admins manage CRM stages" ON public.crm_stages;
DROP POLICY IF EXISTS "CRM users manage stages" ON public.crm_stages;
CREATE POLICY "CRM users manage stages"
  ON public.crm_stages FOR ALL TO authenticated
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
