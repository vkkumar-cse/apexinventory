import { supabase } from "@/integrations/supabase/client";

export class ConfigurationError extends Error {
  isConfigError = true;
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export interface ServiceReport {
  id?: string;
  report_number: string;
  attendance_session_id?: string | null;
  profile_id: string;
  customer_id?: string | null;
  site_id?: string | null;
  
  date_of_service: string;
  next_service_due_date?: string | null;
  status: "draft" | "submitted" | "reviewed" | "approved" | "completed";
  
  customer_name?: string;
  customer_address?: string;
  contact_person?: string;
  phone_number?: string;
  email?: string;
  attendance_site_name?: string;
  
  equipment_name?: string;
  identification_number?: string;
  serial_number?: string;
  make?: string;
  model?: string;
  location?: string;
  
  visit_type?: "Chargeable" | "AMC Visit" | "Warranty Visit";
  problem_reported_date?: string | null;
  committed_service_date?: string | null;
  actual_visit_date?: string | null;
  
  nature_of_visit: string[];
  nature_of_problem?: string;
  ai_summary?: string;
  suggestions?: string;
  customer_feedback?: string;
  
  labour_charges: number;
  spare_charges: number;
  travel_charges: number;
  other_charges: number;
  total_charges: number;

  // Standalone sign-off fields
  engineer_signature_name?: string;
  engineer_signature_date?: string | null;
  customer_signature_name?: string;
  customer_signature_date?: string | null;
  
  created_at?: string;
  updated_at?: string;
}

export interface ServiceReportActivity {
  id?: string;
  service_report_id?: string;
  category: string;
  activity_name: string;
  is_checked: boolean;
  is_custom: boolean;
}

export interface ServiceReportPart {
  id?: string;
  service_report_id?: string;
  product_id?: string | null;
  part_number?: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface ServiceReportPhoto {
  id?: string;
  service_report_id?: string;
  category: string;
  photo_url: string;
  photo_name?: string;
}

export interface CompleteServiceReport {
  report: ServiceReport;
  activities: ServiceReportActivity[];
  parts: ServiceReportPart[];
  photos: ServiceReportPhoto[];
}

// Check if error is PG table missing (relation does not exist)
export function isTableMissingError(error: any): boolean {
  if (!error) return false;
  const message = error.message?.toLowerCase() || "";
  const details = error.details?.toLowerCase() || "";
  const code = error.code || "";
  return (
    code === "42P01" ||
    (message.includes("relation") && message.includes("does not exist")) ||
    (details.includes("relation") && details.includes("does not exist"))
  );
}

function handleDbError(error: any): never {
  if (isTableMissingError(error)) {
    throw new ConfigurationError("Service Reports module has not been configured yet.");
  }
  throw error;
}

export async function fetchServiceReports(): Promise<ServiceReport[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Check role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const isAdmin = roleData?.role === "admin";

    let query = (supabase as any)
      .from("service_reports")
      .select("*, profiles(display_name, email)");

    if (!isAdmin) {
      query = query.eq("profile_id", user.id);
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    
    if (error) handleDbError(error);
    return (data || []) as unknown as ServiceReport[];
  } catch (err) {
    return handleDbError(err);
  }
}

export async function fetchCompleteServiceReport(id: string): Promise<CompleteServiceReport> {
  try {
    const { data: reportData, error: reportErr } = await (supabase as any)
      .from("service_reports")
      .select("*, profiles(display_name, email)")
      .eq("id", id)
      .single();

    if (reportErr) handleDbError(reportErr);

    const [activitiesRes, partsRes, photosRes] = await Promise.all([
      (supabase as any).from("service_report_activities").select("*").eq("service_report_id", id),
      (supabase as any).from("service_report_parts").select("*").eq("service_report_id", id),
      (supabase as any).from("service_report_photos").select("*").eq("service_report_id", id),
    ]);

    if (activitiesRes.error) handleDbError(activitiesRes.error);
    if (partsRes.error) handleDbError(partsRes.error);
    if (photosRes.error) handleDbError(photosRes.error);

    return {
      report: reportData as unknown as ServiceReport,
      activities: (activitiesRes.data || []) as unknown as ServiceReportActivity[],
      parts: (partsRes.data || []) as unknown as ServiceReportPart[],
      photos: (photosRes.data || []) as unknown as ServiceReportPhoto[],
    };
  } catch (err) {
    return handleDbError(err);
  }
}

export async function saveServiceReport(completeReport: CompleteServiceReport): Promise<string> {
  try {
    const { report, activities, parts, photos } = completeReport;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No authenticated user session.");

    const payload = {
      ...report,
      profile_id: report.profile_id || user.id,
      updated_at: new Date().toISOString(),
    };

    let reportId = report.id;

    if (reportId) {
      // Update
      const { error } = await (supabase as any)
        .from("service_reports")
        .update(payload)
        .eq("id", reportId);
      if (error) handleDbError(error);
    } else {
      // Insert
      const { data, error } = await (supabase as any)
        .from("service_reports")
        .insert({
          ...payload,
          report_number: report.report_number || "", // Trigger handles if empty
        })
        .select("id, report_number")
        .single();
      
      if (error) handleDbError(error);
      reportId = (data as any).id;
      report.report_number = (data as any).report_number;
    }

    if (!reportId) throw new Error("Failed to secure service report ID");

    // Sync sub-tables: Clear existing and insert updated
    await Promise.all([
      (supabase as any).from("service_report_activities").delete().eq("service_report_id", reportId),
      (supabase as any).from("service_report_parts").delete().eq("service_report_id", reportId),
      (supabase as any).from("service_report_photos").delete().eq("service_report_id", reportId),
    ]);

    // Insert new elements (if present)
    const promises: any[] = [];

    if (activities && activities.length > 0) {
      const actPayloads = activities.map((act) => ({
        service_report_id: reportId,
        category: act.category,
        activity_name: act.activity_name,
        is_checked: act.is_checked,
        is_custom: act.is_custom,
      }));
      promises.push((supabase as any).from("service_report_activities").insert(actPayloads));
    }

    if (parts && parts.length > 0) {
      const partsPayloads = parts.map((part) => ({
        service_report_id: reportId,
        product_id: part.product_id || null,
        part_number: part.part_number || null,
        item_name: part.item_name,
        quantity: part.quantity,
        unit_price: part.unit_price,
        total_price: part.total_price,
      }));
      promises.push((supabase as any).from("service_report_parts").insert(partsPayloads));
    }

    if (photos && photos.length > 0) {
      const photosPayloads = photos.map((photo) => ({
        service_report_id: reportId,
        category: photo.category,
        photo_url: photo.photo_url,
        photo_name: photo.photo_name || null,
      }));
      promises.push((supabase as any).from("service_report_photos").insert(photosPayloads));
    }

    if (promises.length > 0) {
      const results = await Promise.all(promises);
      for (const res of results) {
        if (res.error) handleDbError(res.error);
      }
    }

    return reportId;
  } catch (err) {
    return handleDbError(err);
  }
}

export async function deleteServiceReport(id: string): Promise<void> {
  try {
    const { error } = await (supabase as any).from("service_reports").delete().eq("id", id);
    if (error) handleDbError(error);
  } catch (err) {
    handleDbError(err);
  }
}

export function generateReportNumber(): string {
  const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const seq = Math.floor(1000 + Math.random() * 9000);
  return `SR-${dateStr}-${seq}`;
}

// Queries next report sequence via DB RPC or local fallback
export async function getNextSequenceReportNumber(date: string): Promise<string> {
  try {
    const { data, error } = await (supabase as any).rpc("get_next_report_number", { service_date: date });
    if (!error && data) return data as string;
  } catch (err) {
    console.warn("Sequential RPC failed, using generator fallback.", err);
  }
  const dateStr = date.replace(/-/g, "");
  const seq = Math.floor(1000 + Math.random() * 9000);
  return `SR-${dateStr}-${seq}`;
}

export async function createDraftFromAttendance(session: any): Promise<CompleteServiceReport> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("User session required.");

  // Fetch full employee profile details
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("id, full_name, display_name")
    .eq("id", user.id)
    .single();

  const engineerName = profile?.full_name || profile?.display_name || user.email || "Unknown Engineer";

  // Calculate session working hours
  let workingHours = 0;
  if (session.check_in && session.check_out) {
    const diffMs = new Date(session.check_out).getTime() - new Date(session.check_in).getTime();
    workingHours = Number((diffMs / (1000 * 60 * 60)).toFixed(2));
  }

  // Attempt to load customer related to the site or site name
  let customerId = null;
  let customerName = "";
  let customerAddress = "";
  let customerPhone = "";
  let customerEmail = "";
  let contactPerson = "";

  if (session.site_name_snapshot) {
    const { data: customers } = await (supabase as any)
      .from("customers")
      .select("*")
      .order("name");

    if (customers && customers.length > 0) {
      // Find customer whose name is matching site name snapshot or standard similarity
      const match = customers.find(
        (c: any) =>
          session.site_name_snapshot.toLowerCase().includes(c.name.toLowerCase()) ||
          c.name.toLowerCase().includes(session.site_name_snapshot.toLowerCase())
      );
      if (match) {
        customerId = match.id;
        customerName = match.name;
        customerAddress = match.address || "";
        customerPhone = match.phone || "";
        customerEmail = match.email || "";
        contactPerson = match.contact_person || "";
      } else {
        const first = customers[0];
        customerId = first.id;
        customerName = first.name;
        customerAddress = first.address || "";
        customerPhone = first.phone || "";
        customerEmail = first.email || "";
        contactPerson = first.contact_person || "";
      }
    }
  }

  const currentDate = new Date().toISOString().split("T")[0];

  const report: ServiceReport = {
    report_number: "", // Auto-generated by trigger on save
    attendance_session_id: session.id,
    profile_id: user.id,
    customer_id: customerId,
    site_id: session.site_id || null,
    date_of_service: session.attendance_date || currentDate,
    next_service_due_date: "",
    status: "draft",
    
    customer_name: customerName,
    customer_address: customerAddress,
    contact_person: contactPerson,
    phone_number: customerPhone,
    email: customerEmail,
    attendance_site_name: session.site_name_snapshot || "",
    
    visit_type: "Chargeable",
    problem_reported_date: session.attendance_date || currentDate,
    committed_service_date: session.attendance_date || currentDate,
    actual_visit_date: session.attendance_date || currentDate,
    
    nature_of_visit: ["General Service"],
    nature_of_problem: "",
    
    labour_charges: 0.0,
    spare_charges: 0.0,
    travel_charges: 0.0,
    other_charges: 0.0,
    total_charges: 0.0,

    engineer_signature_name: engineerName,
    engineer_signature_date: currentDate,
    customer_signature_name: "",
    customer_signature_date: currentDate,
  };

  return {
    report,
    activities: [],
    parts: [],
    photos: [],
  };
}
