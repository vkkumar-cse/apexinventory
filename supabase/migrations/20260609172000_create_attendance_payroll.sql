CREATE TABLE IF NOT EXISTS public.employee_salary_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  per_day_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  overtime_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  bank_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id),
  UNIQUE(employee_id)
);

CREATE TABLE IF NOT EXISTS public.monthly_payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payroll_month DATE NOT NULL,
  present_days NUMERIC(6,2) NOT NULL DEFAULT 0,
  absent_days NUMERIC(6,2) NOT NULL DEFAULT 0,
  half_days NUMERIC(6,2) NOT NULL DEFAULT 0,
  leave_days NUMERIC(6,2) NOT NULL DEFAULT 0,
  late_marks INTEGER NOT NULL DEFAULT 0,
  total_working_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  base_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  absent_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  half_day_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  late_penalties NUMERIC(12,2) NOT NULL DEFAULT 0,
  overtime_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  adjustments_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly_payable NUMERIC(12,2) NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  UNIQUE(employee_id, payroll_month)
);

CREATE TABLE IF NOT EXISTS public.payroll_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payroll_month DATE NOT NULL,
  adjustment_type TEXT NOT NULL DEFAULT 'addition' CHECK (adjustment_type IN ('addition', 'deduction')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS employee_salary_settings_employee_idx ON public.employee_salary_settings(employee_id);
CREATE INDEX IF NOT EXISTS monthly_payroll_employee_month_idx ON public.monthly_payroll(employee_id, payroll_month);
CREATE INDEX IF NOT EXISTS payroll_adjustments_employee_month_idx ON public.payroll_adjustments(employee_id, payroll_month);

ALTER TABLE public.employee_salary_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;

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
