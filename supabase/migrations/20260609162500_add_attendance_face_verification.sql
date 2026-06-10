ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS face_descriptor JSONB,
  ADD COLUMN IF NOT EXISTS face_registered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS face_registered_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS face_self_registration_allowed BOOLEAN DEFAULT true;

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS face_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS face_match_score DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_verified BOOLEAN DEFAULT false;
