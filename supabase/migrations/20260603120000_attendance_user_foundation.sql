-- ============== PROFILES TABLE UPDATES ==============

-- Create sequence for user_id serial in profiles if not exists
CREATE SEQUENCE IF NOT EXISTS public.profiles_user_id_seq;

-- Add columns to profiles safely
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_id INTEGER UNIQUE DEFAULT nextval('public.profiles_user_id_seq');
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'worker' CHECK (role IN ('admin', 'worker'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS linked_employee_id INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS module_access JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Update existing profiles status to approved if null
UPDATE public.profiles SET status = 'approved' WHERE status IS NULL;

-- Trigger to keep profiles.status and profiles.status in sync
CREATE OR REPLACE FUNCTION public.sync_profile_status()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NULL AND NEW.status IS NOT NULL THEN
      NEW.status := NEW.status;
    ELSIF NEW.status IS NULL AND NEW.status IS NOT NULL THEN
      NEW.status := NEW.status;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.status := NEW.status;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.status := NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_profile_status_trigger ON public.profiles;
CREATE TRIGGER sync_profile_status_trigger
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_status();

-- Trigger to update profiles.updated_at
CREATE OR REPLACE FUNCTION public.profiles_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS profiles_touch ON public.profiles;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_touch_updated_at();


-- ============== EMPLOYEES TABLE UPDATES ==============

-- Create sequence for employee_id serial in employees if not exists
CREATE SEQUENCE IF NOT EXISTS public.employees_employee_id_seq;

-- Ensure employees table exists (in case it wasn't created yet locally/remotely)
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add/update columns in employees safely
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employee_id INTEGER UNIQUE DEFAULT nextval('public.employees_employee_id_seq');
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'worker' CHECK (role IN ('admin', 'worker'));
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive'));
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Unique constraint on employees.email (safely handle existing)
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_email_key;
ALTER TABLE public.employees ADD CONSTRAINT employees_email_key UNIQUE (email);

-- Sync name and full_name in employees
CREATE OR REPLACE FUNCTION public.sync_employee_name()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.name IS NULL AND NEW.full_name IS NOT NULL THEN
      NEW.name := NEW.full_name;
    ELSIF NEW.full_name IS NULL AND NEW.name IS NOT NULL THEN
      NEW.full_name := NEW.name;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
      NEW.name := NEW.full_name;
    ELSIF NEW.name IS DISTINCT FROM OLD.name THEN
      NEW.full_name := NEW.name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_employee_name_trigger ON public.employees;
CREATE TRIGGER sync_employee_name_trigger
BEFORE INSERT OR UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.sync_employee_name();

-- Trigger to update employees.updated_at
DROP TRIGGER IF EXISTS employees_touch ON public.employees;
CREATE TRIGGER employees_touch BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ============== SECURITY / RLS POLICIES ==============

-- Enable RLS on profiles and employees
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DROP POLICY IF EXISTS "Profiles are viewable by authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admin full access on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

CREATE POLICY "Admin full access on profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Employees policies
DROP POLICY IF EXISTS "Employees viewable by authenticated" ON public.employees;
DROP POLICY IF EXISTS "Admins manage employees" ON public.employees;
DROP POLICY IF EXISTS "Workers view own employee" ON public.employees;
DROP POLICY IF EXISTS "Admin full access on employees" ON public.employees;

CREATE POLICY "Admin full access on employees"
  ON public.employees FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Workers view own employee"
  ON public.employees FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.linked_employee_id = employees.employee_id
    )
  );
