-- Add approved_by, approved_at, is_active to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Ensure default is_active for existing rows
UPDATE public.profiles SET is_active = TRUE WHERE is_active IS NULL;

-- Trigger: when employees status changes, update linked profile's is_active
CREATE OR REPLACE FUNCTION public.sync_employee_status_to_profile()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- When an employee becomes inactive, mark linked profile as inactive and vice-versa
  UPDATE public.profiles
  SET is_active = (NEW.status = 'active')
  WHERE linked_employee_id IS NOT NULL AND linked_employee_id = NEW.employee_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_employee_status_to_profile_trigger ON public.employees;
CREATE TRIGGER sync_employee_status_to_profile_trigger
AFTER INSERT OR UPDATE OF status ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.sync_employee_status_to_profile();

-- When an admin approves a profile via update to status -> set approved_by and approved_at
CREATE OR REPLACE FUNCTION public.set_profile_approved_metadata()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
      NEW.approved_at := now();
      -- approved_by should be set by the authenticated user via update (client supplies approved_by)
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profile_approved_metadata_trigger ON public.profiles;
CREATE TRIGGER set_profile_approved_metadata_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_profile_approved_metadata();
