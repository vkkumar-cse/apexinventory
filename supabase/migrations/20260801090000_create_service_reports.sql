-- Migration to create Service Reports module tables

CREATE TABLE IF NOT EXISTS public.service_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number TEXT UNIQUE NOT NULL,
  attendance_session_id UUID REFERENCES public.attendance_sessions(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  site_id UUID REFERENCES public.attendance_sites(id) ON DELETE SET NULL,
  
  -- Report Header
  date_of_service DATE NOT NULL DEFAULT CURRENT_DATE,
  next_service_due_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'reviewed', 'approved', 'completed')),
  
  -- Customer Snapshot Information
  customer_name TEXT,
  customer_address TEXT,
  contact_person TEXT,
  phone_number TEXT,
  email TEXT,
  attendance_site_name TEXT,
  
  -- Instrument Details
  equipment_name TEXT,
  identification_number TEXT,
  serial_number TEXT,
  make TEXT,
  model TEXT,
  location TEXT,
  
  -- Visit Information
  visit_type TEXT CHECK (visit_type IN ('Chargeable', 'AMC Visit', 'Warranty Visit')),
  problem_reported_date DATE,
  committed_service_date DATE,
  actual_visit_date DATE,
  
  -- Nature of Visit
  nature_of_visit TEXT[] DEFAULT '{}'::text[],
  
  -- Nature of Problem
  nature_of_problem TEXT,
  
  -- AI Summary / Suggestions / Feedback
  ai_summary TEXT,
  suggestions TEXT,
  customer_feedback TEXT,
  
  -- Charges
  labour_charges NUMERIC(12, 2) DEFAULT 0.00,
  spare_charges NUMERIC(12, 2) DEFAULT 0.00,
  travel_charges NUMERIC(12, 2) DEFAULT 0.00,
  other_charges NUMERIC(12, 2) DEFAULT 0.00,
  total_charges NUMERIC(12, 2) DEFAULT 0.00,
  
  -- Text Signatures
  engineer_signature_name TEXT,
  engineer_signature_date DATE,
  customer_signature_name TEXT,
  customer_signature_date DATE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.service_report_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_report_id UUID REFERENCES public.service_reports(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  activity_name TEXT NOT NULL,
  is_checked BOOLEAN DEFAULT TRUE,
  is_custom BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.service_report_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_report_id UUID REFERENCES public.service_reports(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  part_number TEXT,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2) DEFAULT 0.00,
  total_price NUMERIC(12, 2) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.service_report_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_report_id UUID REFERENCES public.service_reports(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL, -- Before Service, After Service, Defect Photos, Calibration Display, Name Plate, Additional Photos
  photo_url TEXT NOT NULL,
  photo_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for query optimization
CREATE INDEX IF NOT EXISTS idx_service_reports_profile ON public.service_reports(profile_id);
CREATE INDEX IF NOT EXISTS idx_service_reports_session ON public.service_reports(attendance_session_id);
CREATE INDEX IF NOT EXISTS idx_service_reports_customer ON public.service_reports(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_reports_status ON public.service_reports(status);
CREATE INDEX IF NOT EXISTS idx_service_report_activities_report ON public.service_report_activities(service_report_id);
CREATE INDEX IF NOT EXISTS idx_service_report_parts_report ON public.service_report_parts(service_report_id);
CREATE INDEX IF NOT EXISTS idx_service_report_photos_report ON public.service_report_photos(service_report_id);

-- Enable RLS
ALTER TABLE public.service_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_report_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_report_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_report_photos ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Admins manage all service reports" ON public.service_reports;
DROP POLICY IF EXISTS "Workers view own service reports" ON public.service_reports;
DROP POLICY IF EXISTS "Workers insert own service reports" ON public.service_reports;
DROP POLICY IF EXISTS "Workers update own service report drafts" ON public.service_reports;

-- RLS Policies for parent table
CREATE POLICY "Admins manage all service reports"
  ON public.service_reports
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Workers view own service reports"
  ON public.service_reports
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Workers insert own service reports"
  ON public.service_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Workers update own service report drafts"
  ON public.service_reports
  FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid() AND status = 'draft')
  WITH CHECK (profile_id = auth.uid() AND status = 'draft');

-- Helper security functions for sub-tables
CREATE OR REPLACE FUNCTION public.check_report_access(report_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin check
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Owner check
  RETURN EXISTS (
    SELECT 1 FROM public.service_reports
    WHERE service_reports.id = report_id AND service_reports.profile_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.check_report_draft_write_access(report_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin check
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
  ) THEN
    RETURN TRUE;
  END IF;

  -- Owner draft check
  RETURN EXISTS (
    SELECT 1 FROM public.service_reports
    WHERE service_reports.id = report_id 
      AND service_reports.profile_id = auth.uid() 
      AND service_reports.status = 'draft'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS policies for sub-tables using helper functions
DROP POLICY IF EXISTS "Sub-table select policy" ON public.service_report_activities;
CREATE POLICY "Sub-table select policy" ON public.service_report_activities
  FOR SELECT TO authenticated USING (public.check_report_access(service_report_id));

DROP POLICY IF EXISTS "Sub-table write policy" ON public.service_report_activities;
CREATE POLICY "Sub-table write policy" ON public.service_report_activities
  FOR ALL TO authenticated USING (public.check_report_draft_write_access(service_report_id));

DROP POLICY IF EXISTS "Sub-table select policy" ON public.service_report_parts;
CREATE POLICY "Sub-table select policy" ON public.service_report_parts
  FOR SELECT TO authenticated USING (public.check_report_access(service_report_id));

DROP POLICY IF EXISTS "Sub-table write policy" ON public.service_report_parts;
CREATE POLICY "Sub-table write policy" ON public.service_report_parts
  FOR ALL TO authenticated USING (public.check_report_draft_write_access(service_report_id));

DROP POLICY IF EXISTS "Sub-table select policy" ON public.service_report_photos;
CREATE POLICY "Sub-table select policy" ON public.service_report_photos
  FOR SELECT TO authenticated USING (public.check_report_access(service_report_id));

DROP POLICY IF EXISTS "Sub-table write policy" ON public.service_report_photos;
CREATE POLICY "Sub-table write policy" ON public.service_report_photos
  FOR ALL TO authenticated USING (public.check_report_draft_write_access(service_report_id));

-- Sequential Report Numbering Logic
CREATE OR REPLACE FUNCTION public.get_next_report_number(service_date DATE)
RETURNS TEXT AS $$
DECLARE
  date_str TEXT;
  seq_num INT;
  next_num TEXT;
BEGIN
  date_str := to_char(service_date, 'YYYYMMDD');
  
  -- Find the max sequence number for that date
  SELECT COALESCE(MAX(SUBSTRING(report_number FROM 13 FOR 4)::INTEGER), 0) INTO seq_num
  FROM public.service_reports
  WHERE report_number LIKE 'SR-' || date_str || '-%';
  
  seq_num := seq_num + 1;
  next_num := 'SR-' || date_str || '-' || lpad(seq_num::TEXT, 4, '0');
  
  RETURN next_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically set sequential report numbers on insert
CREATE OR REPLACE FUNCTION public.set_service_report_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.report_number IS NULL OR NEW.report_number = '' OR NEW.report_number LIKE 'TEMP-%' THEN
    NEW.report_number := public.get_next_report_number(NEW.date_of_service);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_service_report_number ON public.service_reports;
CREATE TRIGGER trg_set_service_report_number
  BEFORE INSERT ON public.service_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_service_report_number();
