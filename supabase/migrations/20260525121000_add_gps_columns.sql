-- Add GPS coordinates columns to the attendance table
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS longitude double precision;
