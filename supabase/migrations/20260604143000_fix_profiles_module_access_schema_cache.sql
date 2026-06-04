-- Ensure user module permissions exist on profiles and refresh PostgREST's schema cache.
-- This is intentionally idempotent because some environments already have the column
-- from earlier user-management migrations, while others are missing it remotely.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS module_access JSONB DEFAULT '[]'::jsonb;

UPDATE public.profiles
SET module_access = '[]'::jsonb
WHERE module_access IS NULL;

NOTIFY pgrst, 'reload schema';
