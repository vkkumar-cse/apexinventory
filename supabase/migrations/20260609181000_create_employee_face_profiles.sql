CREATE TABLE IF NOT EXISTS public.employee_face_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  face_descriptor JSONB NOT NULL,
  face_image_path TEXT NULL,
  registered_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS distance_meters DOUBLE PRECISION;

ALTER TABLE public.employee_face_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage employee face profiles" ON public.employee_face_profiles;
DROP POLICY IF EXISTS "Workers view own employee face profile" ON public.employee_face_profiles;

CREATE POLICY "Admins manage employee face profiles"
  ON public.employee_face_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Workers view own employee face profile"
  ON public.employee_face_profiles FOR SELECT TO authenticated
  USING (profile_id = auth.uid());
