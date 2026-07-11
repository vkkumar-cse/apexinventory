ALTER TABLE public.employee_face_profiles
  ADD COLUMN IF NOT EXISTS face_descriptors JSONB;

UPDATE public.employee_face_profiles
SET face_descriptors = CASE
  WHEN face_descriptors IS NULL
    AND jsonb_typeof(face_descriptor) = 'array'
    AND jsonb_array_length(face_descriptor) = 128
    THEN jsonb_build_array(face_descriptor)
  WHEN face_descriptors IS NULL
    AND jsonb_typeof(face_descriptor) = 'array'
    AND jsonb_array_length(face_descriptor) > 0
    AND jsonb_typeof(face_descriptor -> 0) = 'array'
    THEN face_descriptor
  ELSE face_descriptors
END
WHERE face_descriptors IS NULL;

ALTER TABLE public.employee_face_profiles
  ALTER COLUMN face_descriptors SET NOT NULL;

ALTER TABLE public.employee_face_profiles
  ALTER COLUMN face_descriptors SET DEFAULT '[]'::jsonb;

ALTER TABLE public.employee_face_profiles
  ALTER COLUMN face_descriptor DROP NOT NULL;

ALTER TABLE public.employee_face_profiles
  DROP CONSTRAINT IF EXISTS employee_face_profiles_face_descriptors_array;

ALTER TABLE public.employee_face_profiles
  ADD CONSTRAINT employee_face_profiles_face_descriptors_array
  CHECK (jsonb_typeof(face_descriptors) = 'array' AND jsonb_array_length(face_descriptors) > 0);
