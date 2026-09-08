-- Migration to update Service Reports to a standalone schema with text signatures and sequential numbering

-- 1. Drop signatures table as we are moving to physical signoffs on paper
DROP TABLE IF EXISTS public.service_report_signatures CASCADE;

-- 2. Add text signature columns directly to the parent service reports table
ALTER TABLE public.service_reports 
  ADD COLUMN IF NOT EXISTS engineer_signature_name TEXT,
  ADD COLUMN IF NOT EXISTS engineer_signature_date DATE,
  ADD COLUMN IF NOT EXISTS customer_signature_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_signature_date DATE;

-- 3. Function to compute the next sequential report number for a given service date (format: SR-YYYYMMDD-XXXX)
CREATE OR REPLACE FUNCTION public.get_next_report_number(service_date DATE)
RETURNS TEXT AS $$
DECLARE
  date_str TEXT;
  seq_num INT;
  next_num TEXT;
BEGIN
  date_str := to_char(service_date, 'YYYYMMDD');
  
  -- Find the max sequence number for that date
  SELECT COALESCE(MAX(NULLIF(regexp_replace(report_number, '^SR-[0-9]{8}-', ''), '')::INTEGER), 0) INTO seq_num
  FROM public.service_reports
  WHERE report_number LIKE 'SR-' || date_str || '-%';
  
  seq_num := seq_num + 1;
  next_num := 'SR-' || date_str || '-' || lpad(seq_num::TEXT, 4, '0');
  
  RETURN next_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger function to auto-assign sequential report number on insert if null or empty
CREATE OR REPLACE FUNCTION public.set_service_report_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.report_number IS NULL OR NEW.report_number = '' THEN
    NEW.report_number := public.get_next_report_number(NEW.date_of_service);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_set_service_report_number ON public.service_reports;

CREATE TRIGGER trg_set_service_report_number
BEFORE INSERT ON public.service_reports
FOR EACH ROW
EXECUTE FUNCTION public.set_service_report_number();
