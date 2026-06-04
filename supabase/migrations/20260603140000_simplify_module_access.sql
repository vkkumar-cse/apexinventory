-- ============================================================
-- SAFE MIGRATION: Simplify module_access to top-level modules
-- Top-level modules: inventory, attendance, customers, user_management
-- ============================================================

-- 1. Ensure module_access column exists as JSONB (idempotent)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS module_access JSONB DEFAULT '[]'::jsonb;

-- 2. Ensure role column exists (idempotent)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'worker';

-- 3. Ensure linked_employee_id column exists (idempotent)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS linked_employee_id INTEGER;

-- 4. Ensure updated_at column exists (idempotent)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 5. Migrate any existing detailed module_access values to top-level keys only.
--    Map old granular keys → new top-level keys:
--      attendance_checkin, my_attendance_history, attendance_dashboard,
--      attendance_history, leave_management, payroll_management, site_management,
--      check_in → attendance
--      inventory_view → inventory
--      customers_view → customers
--      user_management, employee_management → user_management
--      reports, reports_view, quotation, quotation_view,
--      delivery_challan, my_payroll, my_leave_requests → (drop – not top-level yet)

UPDATE public.profiles
SET module_access = (
  SELECT jsonb_agg(DISTINCT new_mod)
  FROM (
    SELECT
      CASE
        WHEN old_mod IN (
          'attendance_checkin','my_attendance_history','attendance_dashboard',
          'attendance_history','leave_management','payroll_management',
          'site_management','check_in','my_leave_requests','my_payroll'
        ) THEN 'attendance'
        WHEN old_mod IN ('inventory_view','inventory') THEN 'inventory'
        WHEN old_mod IN ('customers_view','customers') THEN 'customers'
        WHEN old_mod IN ('user_management','employee_management') THEN 'user_management'
        ELSE NULL
      END AS new_mod
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(module_access) = 'array' THEN module_access
        ELSE '[]'::jsonb
      END
    ) AS old_mod
  ) sub
  WHERE new_mod IS NOT NULL
)
WHERE module_access IS NOT NULL
  AND jsonb_typeof(module_access) = 'array'
  AND jsonb_array_length(module_access) > 0;

-- 6. Set NULL module_access to empty array
UPDATE public.profiles
SET module_access = '[]'::jsonb
WHERE module_access IS NULL;

-- 7. Admins get full access to all top-level modules
UPDATE public.profiles
SET module_access = '["inventory","attendance","customers","user_management"]'::jsonb
WHERE (role = 'admin')
  AND (
    (module_access IS NULL)
    OR (jsonb_typeof(module_access) = 'array' AND jsonb_array_length(module_access) = 0)
    OR (module_access = '[]'::jsonb)
  );
