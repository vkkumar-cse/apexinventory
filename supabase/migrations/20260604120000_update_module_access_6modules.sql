-- ============================================================
-- MIGRATION: Ensure module_access column and update to 6-module system
-- Modules: inventory, attendance, customers, delivery_challan,
--          user_management, quotation
-- ============================================================

-- 1. Ensure module_access column exists as JSONB (idempotent)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS module_access JSONB DEFAULT '[]'::jsonb;

-- 2. Ensure role column exists (idempotent)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'worker';

-- 3. Ensure linked_employee_id column exists (idempotent)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS linked_employee_id INTEGER;

-- 4. Set NULL module_access to empty array
UPDATE public.profiles
SET module_access = '[]'::jsonb
WHERE module_access IS NULL;

-- 5. Migrate any existing granular/old module keys → new 6 top-level keys.
--    Old granular keys are mapped as follows:
--      attendance_checkin, my_attendance_history, attendance_dashboard,
--      attendance_history, leave_management, payroll_management,
--      site_management, check_in, my_leave_requests, my_payroll → attendance
--      inventory_view, inventory                                 → inventory
--      customers_view, customers                                 → customers
--      user_management, employee_management                      → user_management
--      delivery_challan                                          → delivery_challan
--      quotation, quotation_view                                 → quotation
--      (drop: reports, reports_view, my_payroll — not in 6-module set)

UPDATE public.profiles
SET module_access = (
  SELECT COALESCE(jsonb_agg(DISTINCT new_mod), '[]'::jsonb)
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
        WHEN old_mod IN ('delivery_challan') THEN 'delivery_challan'
        WHEN old_mod IN ('quotation','quotation_view') THEN 'quotation'
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
  AND jsonb_typeof(module_access) = 'array';

-- 6. Admin users: clear module_access (access is role-based, not module_access-based)
UPDATE public.profiles
SET module_access = '[]'::jsonb
WHERE role = 'admin';
