-- Attendance-integrated payroll upgrade.
-- This migration extends existing payroll tables in place and preserves data.

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL DEFAULT 'paid_leave',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leave_requests_date_check CHECK (end_date >= start_date),
  CONSTRAINT leave_requests_type_check CHECK (leave_type IN ('paid_leave', 'sick_leave', 'casual_leave', 'unpaid_leave')),
  CONSTRAINT leave_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
);

ALTER TABLE public.monthly_payroll
  ADD COLUMN IF NOT EXISTS gross_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_leave_days NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unpaid_leave_days NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS payslip_number TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.monthly_payroll
  DROP CONSTRAINT IF EXISTS monthly_payroll_status_check;

ALTER TABLE public.monthly_payroll
  ADD CONSTRAINT monthly_payroll_status_check
  CHECK (status IN ('draft', 'generated', 'approved', 'paid'));

UPDATE public.monthly_payroll
SET gross_salary = COALESCE(NULLIF(gross_salary, 0), base_salary),
    status = COALESCE(status, 'generated'),
    payslip_number = COALESCE(payslip_number, 'PAY-' || to_char(payroll_month, 'YYYYMM') || '-' || left(employee_id::text, 8))
WHERE gross_salary = 0 OR status IS NULL OR payslip_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS monthly_payroll_payslip_number_idx
  ON public.monthly_payroll(payslip_number)
  WHERE payslip_number IS NOT NULL;

ALTER TABLE public.payroll_adjustments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.payroll_adjustments
  DROP CONSTRAINT IF EXISTS payroll_adjustments_adjustment_type_check;

ALTER TABLE public.payroll_adjustments
  ADD CONSTRAINT payroll_adjustments_adjustment_type_check
  CHECK (adjustment_type IN ('addition', 'deduction', 'bonus', 'incentive', 'reimbursement', 'advance_deduction', 'loan_deduction', 'penalty', 'other'));

CREATE INDEX IF NOT EXISTS leave_requests_employee_dates_idx
  ON public.leave_requests(employee_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS monthly_payroll_status_idx
  ON public.monthly_payroll(status);

INSERT INTO public.attendance_settings (key, value)
VALUES
  ('payroll_full_day_hours', '8'::jsonb),
  ('payroll_half_day_hours', '4'::jsonb),
  ('payroll_late_policy', '{"mode":"marks_to_half_day","late_marks_for_half_day":3,"fixed_penalty_amount":0}'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Workers manage own leave requests" ON public.leave_requests;
CREATE POLICY "Admins manage leave requests"
  ON public.leave_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Workers manage own leave requests"
  ON public.leave_requests FOR ALL TO authenticated
  USING (employee_id = auth.uid())
  WITH CHECK (employee_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "Admins manage employee salary settings" ON public.employee_salary_settings;
DROP POLICY IF EXISTS "Workers view own salary settings" ON public.employee_salary_settings;
CREATE POLICY "Admins manage employee salary settings"
  ON public.employee_salary_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Workers view own salary settings"
  ON public.employee_salary_settings FOR SELECT TO authenticated
  USING (employee_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage monthly payroll" ON public.monthly_payroll;
DROP POLICY IF EXISTS "Workers view own monthly payroll" ON public.monthly_payroll;
CREATE POLICY "Admins manage monthly payroll"
  ON public.monthly_payroll FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Workers view own monthly payroll"
  ON public.monthly_payroll FOR SELECT TO authenticated
  USING (employee_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage payroll adjustments" ON public.payroll_adjustments;
DROP POLICY IF EXISTS "Workers view own payroll adjustments" ON public.payroll_adjustments;
CREATE POLICY "Admins manage payroll adjustments"
  ON public.payroll_adjustments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Workers view own payroll adjustments"
  ON public.payroll_adjustments FOR SELECT TO authenticated
  USING (employee_id = auth.uid());
