-- Alter profiles table to add must_change_password column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

-- Create audit logs table
CREATE TABLE IF NOT EXISTS public.admin_password_reset_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL DEFAULT 'PASSWORD_RESET',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.admin_password_reset_audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow SELECT for admins
CREATE POLICY "Admins can view password reset logs" 
  ON public.admin_password_reset_audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow INSERT for admins
CREATE POLICY "Admins can create password reset logs" 
  ON public.admin_password_reset_audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
