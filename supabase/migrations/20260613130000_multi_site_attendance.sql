CREATE TABLE IF NOT EXISTS public.attendance_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name TEXT NOT NULL,
  site_code TEXT UNIQUE,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 100,
  address TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employee_site_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES public.attendance_sites(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, site_id)
);

CREATE TABLE IF NOT EXISTS public.attendance_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  site_id UUID REFERENCES public.attendance_sites(id) ON DELETE SET NULL,
  site_name_snapshot TEXT NOT NULL,
  check_in TIMESTAMPTZ NOT NULL,
  check_out TIMESTAMPTZ,
  check_in_latitude DOUBLE PRECISION NOT NULL,
  check_in_longitude DOUBLE PRECISION NOT NULL,
  check_out_latitude DOUBLE PRECISION,
  check_out_longitude DOUBLE PRECISION,
  check_in_distance_meters NUMERIC NOT NULL,
  check_out_distance_meters NUMERIC,
  face_verified BOOLEAN NOT NULL DEFAULT false,
  face_match_score DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_sessions_status_check CHECK (status IN ('open', 'completed', 'cancelled'))
);

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES public.attendance_sites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS site_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS distance_meters NUMERIC;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_sites_one_default
  ON public.attendance_sites (is_default)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_attendance_sites_active
  ON public.attendance_sites (is_active);

CREATE INDEX IF NOT EXISTS idx_employee_site_assignments_profile
  ON public.employee_site_assignments (profile_id);

CREATE INDEX IF NOT EXISTS idx_attendance_site_date
  ON public.attendance (site_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_profile_date
  ON public.attendance_sessions (profile_id, attendance_date, check_in DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_site_date
  ON public.attendance_sessions (site_id, attendance_date);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_sessions_one_open_per_profile
  ON public.attendance_sessions (profile_id)
  WHERE check_out IS NULL AND status = 'open';

CREATE OR REPLACE FUNCTION public.validate_attendance_session()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  site_radius INTEGER;
  site_active BOOLEAN;
  site_default BOOLEAN;
  has_assignments BOOLEAN;
  site_assigned BOOLEAN;
BEGIN
  SELECT radius_meters, is_active, is_default
    INTO site_radius, site_active, site_default
  FROM public.attendance_sites
  WHERE id = NEW.site_id;

  IF site_radius IS NULL OR site_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Attendance site is inactive or missing';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.employee_site_assignments esa
    WHERE esa.profile_id = NEW.profile_id
  ) INTO has_assignments;

  SELECT EXISTS (
    SELECT 1 FROM public.employee_site_assignments esa
    WHERE esa.profile_id = NEW.profile_id
      AND esa.site_id = NEW.site_id
  ) INTO site_assigned;

  IF has_assignments AND site_assigned IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Attendance site is not assigned to this employee';
  END IF;

  IF NOT has_assignments AND site_default IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Employees without site assignments can only use the default site';
  END IF;

  IF NEW.face_verified IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Face verification is required';
  END IF;

  IF NEW.check_in_distance_meters IS NULL OR NEW.check_in_distance_meters > site_radius THEN
    RAISE EXCEPTION 'Check-in is outside the allowed site radius';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.check_out IS NOT NULL OR NEW.status <> 'open' THEN
      RAISE EXCEPTION 'New attendance sessions must start open';
    END IF;
  ELSE
    IF NEW.profile_id IS DISTINCT FROM OLD.profile_id
      OR NEW.site_id IS DISTINCT FROM OLD.site_id
      OR NEW.check_in IS DISTINCT FROM OLD.check_in THEN
      RAISE EXCEPTION 'Attendance session identity cannot be changed';
    END IF;
  END IF;

  IF NEW.check_out IS NOT NULL THEN
    IF NEW.status <> 'completed' THEN
      RAISE EXCEPTION 'Checked-out attendance sessions must be completed';
    END IF;
    IF NEW.check_out_latitude IS NULL
      OR NEW.check_out_longitude IS NULL
      OR NEW.check_out_distance_meters IS NULL
      OR NEW.check_out_distance_meters > site_radius THEN
      RAISE EXCEPTION 'Check-out is outside the original attendance site radius';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_attendance_session_trigger ON public.attendance_sessions;
CREATE TRIGGER validate_attendance_session_trigger
BEFORE INSERT OR UPDATE ON public.attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.validate_attendance_session();

INSERT INTO public.attendance_sites (site_name, site_code, latitude, longitude, radius_meters, is_default, is_active)
VALUES ('Main Office', 'MAIN_OFFICE', 13.138576, 80.173716, 100, true, true)
ON CONFLICT (site_code) DO UPDATE
SET site_name = EXCLUDED.site_name,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    radius_meters = EXCLUDED.radius_meters,
    is_default = true,
    is_active = true,
    updated_at = now();

INSERT INTO public.attendance_settings (key, value)
VALUES ('minimum_full_day_hours', '8'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.attendance_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_site_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage attendance sites" ON public.attendance_sites;
DROP POLICY IF EXISTS "Workers read active attendance sites" ON public.attendance_sites;
CREATE POLICY "Admins manage attendance sites"
  ON public.attendance_sites FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Workers read active attendance sites"
  ON public.attendance_sites FOR SELECT TO authenticated
  USING (
    (is_default = true AND is_active = true)
    OR EXISTS (
      SELECT 1
      FROM public.employee_site_assignments esa
      WHERE esa.site_id = attendance_sites.id
        AND esa.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage employee site assignments" ON public.employee_site_assignments;
DROP POLICY IF EXISTS "Workers read own site assignments" ON public.employee_site_assignments;
CREATE POLICY "Admins manage employee site assignments"
  ON public.employee_site_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Workers read own site assignments"
  ON public.employee_site_assignments FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage attendance settings" ON public.attendance_settings;
DROP POLICY IF EXISTS "Workers read attendance settings" ON public.attendance_settings;
CREATE POLICY "Admins manage attendance settings"
  ON public.attendance_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Workers read attendance settings"
  ON public.attendance_settings FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage attendance sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Workers manage own attendance sessions" ON public.attendance_sessions;
CREATE POLICY "Admins manage attendance sessions"
  ON public.attendance_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Workers manage own attendance sessions"
  ON public.attendance_sessions FOR ALL TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());
