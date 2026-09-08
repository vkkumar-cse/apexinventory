import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { 
  fetchCompleteServiceReport, 
  saveServiceReport, 
  createDraftFromAttendance,
  generateReportNumber,
  CompleteServiceReport,
  ServiceReport,
  ServiceReportActivity,
  ServiceReportPart,
  ServiceReportPhoto
} from "@/lib/serviceReports";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  ChevronLeft, 
  ChevronRight, 
  Save, 
  CheckSquare, 
  Clock, 
  AlertCircle,
  FileCheck2
} from "lucide-react";

// Reusable Component Cards
import { CustomerCard } from "./components/CustomerCard";
import { EquipmentCard } from "./components/EquipmentCard";
import { VisitDetailsCard } from "./components/VisitDetailsCard";
import { ChecklistCard } from "./components/ChecklistCard";
import { ChargesCard } from "./components/ChargesCard";
import { AISummaryCard } from "./components/AISummaryCard";
import { PhotosCard } from "./components/PhotosCard";
import { ReviewCard } from "./components/ReviewCard";

export default function ServiceReportWizard() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams(); // Report ID if editing
  const [searchParams] = useSearchParams();
  const attendanceSessionId = searchParams.get("attendance_session_id");

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isNotConfigured, setIsNotConfigured] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "unsaved">("idle");

  // Core Service Report state
  const [report, setReport] = useState<ServiceReport>({
    report_number: "",
    profile_id: "",
    date_of_service: new Date().toISOString().split("T")[0],
    status: "draft",
    nature_of_visit: ["General Service"],
    labour_charges: 0,
    spare_charges: 0,
    travel_charges: 0,
    other_charges: 0,
    total_charges: 0,
  });

  const [activities, setActivities] = useState<ServiceReportActivity[]>([]);
  const [parts, setParts] = useState<ServiceReportPart[]>([]);
  const [photos, setPhotos] = useState<ServiceReportPhoto[]>([]);

  // Selection lists lookups
  const [customers, setCustomers] = useState<any[]>([]);
  const [inventoryProducts, setInventoryProducts] = useState<any[]>([]);

  // Auto-save timer reference
  const autoSaveTimerRef = useRef<any>(null);
  const isModifiedRef = useRef(false);

  useEffect(() => {
    document.title = id ? "Edit Service Report Â· Apex Software" : "New Service Report Â· Apex Software";
    loadFormLookups().then(() => {
      if (id) {
        loadExistingReport(id);
      } else if (attendanceSessionId) {
        loadAttendanceDraft(attendanceSessionId);
      } else {
        // Fresh blank draft
        const initialReportNo = "TEMP-" + generateReportNumber();
        setReport(prev => ({
          ...prev,
          report_number: initialReportNo,
          profile_id: user?.id || ""
        }));
        
        // Fetch profile to pre-fill engineer signature name
        (supabase as any)
          .from("profiles")
          .select("full_name, display_name")
          .eq("id", user?.id || "")
          .single()
          .then(({ data }: any) => {
            const engineerName = data?.full_name || data?.display_name || user?.email || "Unknown Engineer";
            setReport(prev => ({
              ...prev,
              engineer_signature_name: engineerName,
              engineer_signature_date: new Date().toISOString().split("T")[0],
              customer_signature_name: "",
              customer_signature_date: new Date().toISOString().split("T")[0],
            }));
          });

        setLoading(false);
      }
    });

    // Launch Auto-save interval (every 30 seconds)
    autoSaveTimerRef.current = setInterval(() => {
      if (isModifiedRef.current) {
        handleAutosave();
      }
    }, 30000);

    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    };
  }, [id, attendanceSessionId]);

  const loadFormLookups = async () => {
    try {
      const [custRes, prodRes] = await Promise.all([
        (supabase as any).from("customers").select("*").order("name"),
        (supabase as any).from("products").select("*").order("name")
      ]);
      
      if (custRes.data) setCustomers(custRes.data);
      if (prodRes.data) setInventoryProducts(prodRes.data);
    } catch (err) {
      console.warn("Failed to load select list helpers.", err);
    }
  };

  const loadExistingReport = async (reportId: string) => {
    try {
      const data = await fetchCompleteServiceReport(reportId);
      setReport(data.report);
      setActivities(data.activities);
      setParts(data.parts);
      setPhotos(data.photos);
    } catch (err: any) {
      if (err.isConfigError) {
        setIsNotConfigured(true);
      } else {
        toast.error("Failed to load existing draft.");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadAttendanceDraft = async (sessionId: string) => {
    try {
      const { data: session, error } = await (supabase as any)
        .from("attendance_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();
      
      if (error) throw error;
      const draft = await createDraftFromAttendance(session);
      setReport(draft.report);
      setActivities(draft.activities);
      setParts(draft.parts);
      setPhotos(draft.photos);
    } catch (err) {
      console.error("Error creating report from attendance:", err);
      toast.error("Failed to pre-fill attendance details.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateReport = (fields: Partial<ServiceReport>) => {
    setReport(prev => ({ ...prev, ...fields }));
    isModifiedRef.current = true;
    setSaveStatus("unsaved");
  };

  const handleUpdateActivities = (updated: ServiceReportActivity[]) => {
    setActivities(updated);
    isModifiedRef.current = true;
    setSaveStatus("unsaved");
  };

  const handleUpdateParts = (updated: ServiceReportPart[]) => {
    setParts(updated);
    isModifiedRef.current = true;
    setSaveStatus("unsaved");
  };

  const handleUpdatePhotos = (updated: ServiceReportPhoto[]) => {
    setPhotos(updated);
    isModifiedRef.current = true;
    setSaveStatus("unsaved");
  };

  const handleAutosave = async () => {
    setSaveStatus("saving");
    try {
      const reportId = await saveServiceReport({
        report,
        activities,
        parts,
        photos
      });
      if (reportId && !report.id) {
        setReport(prev => ({ ...prev, id: reportId }));
      }
      isModifiedRef.current = false;
      setSaveStatus("saved");
    } catch (err) {
      console.warn("Autosave draft failed:", err);
      setSaveStatus("unsaved");
    }
  };

  const handleSaveDraftManual = async () => {
    setSaving(true);
    try {
      const reportId = await saveServiceReport({
        report,
        activities,
        parts,
        photos
      });
      toast.success("Draft saved successfully.");
      isModifiedRef.current = false;
      setSaveStatus("saved");
      navigate("/service-reports/list");
    } catch (err: any) {
      toast.error(err.message || "Failed to save draft.");
    } finally {
      setSaving(false);
    }
  };

  const validateSubmission = (): boolean => {
    const errors: string[] = [];
    if (!report.customer_name?.trim()) errors.push("Customer Name is required.");
    if (!report.equipment_name?.trim()) errors.push("Equipment Name is required.");
    if (!report.serial_number?.trim()) errors.push("Equipment Serial Number is required.");
    if (!report.identification_number?.trim()) errors.push("Equipment Identification No is required.");
    if (!report.nature_of_problem?.trim()) errors.push("Nature of Problem statement is required.");
    if (!report.visit_type) errors.push("Visit Type is required.");
    if (!report.actual_visit_date) errors.push("Our Visit Date is required.");
    if (!report.nature_of_visit || report.nature_of_visit.length === 0) {
      errors.push("Please select at least one item under Nature of Visit.");
    }
    if (!report.engineer_signature_name?.trim()) errors.push("Engineer Sign-off Name is required.");
    if (!report.customer_signature_name?.trim()) errors.push("Customer Sign-off Name is required.");

    if (errors.length > 0) {
      // Display each validation warning clearly
      errors.forEach((err) => toast.error(err));
      return false;
    }
    return true;
  };

  const handleFinalSubmit = async () => {
    if (!validateSubmission()) return;
    
    setSaving(true);
    try {
      const updatedReport: ServiceReport = {
        ...report,
        status: isAdmin ? "approved" : "submitted"
      };

      await saveServiceReport({
        report: updatedReport,
        activities,
        parts,
        photos
      });

      toast.success(isAdmin ? "Service Report approved and finalized." : "Service Report submitted successfully.");
      isModifiedRef.current = false;
      navigate("/service-reports/list");
    } catch (err: any) {
      toast.error(err.message || "Submission failed.");
    } finally {
      setSaving(false);
    }
  };

  // Safe checks for configuration missing
  if (isNotConfigured) {
    return (
      <div className="max-w-2xl mx-auto my-12 text-center p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
        <AlertCircle className="w-16 h-16 mx-auto mb-4 text-amber-500 animate-pulse" />
        <h2 className="text-xl font-bold text-white mb-2">Service Reports Module Pending Configuration</h2>
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          The database tables and RLS security triggers for this module have not been configured yet. 
          Please apply the database migrations in your Supabase admin console.
        </p>
        <div className="bg-slate-950 p-4 rounded-lg text-left font-mono text-xs text-slate-300 border border-slate-900 max-w-md mx-auto mb-6">
          File: supabase/migrations/20260801090000_create_service_reports.sql
        </div>
        <Button onClick={() => loadExistingReport(id || "")} className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 px-5">
          Retry Connection
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-500">
        <LoaderCircle className="w-8 h-8 animate-spin text-blue-500 mb-2" />
        Loading service report form wizard...
      </div>
    );
  }

  // Get status text label
  const getSaveStatusLabel = () => {
    switch (saveStatus) {
      case "saving":
        return <span className="text-[10px] text-blue-400 font-bold bg-blue-500/10 px-2 py-0.5 rounded">Saving...</span>;
      case "saved":
        return <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">Saved just now</span>;
      case "unsaved":
        return <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded">Unsaved changes</span>;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-28 select-none">
      
      {/* Wizard Header bar */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-850 p-4 rounded-xl">
        <Button
          onClick={() => navigate("/service-reports/list")}
          variant="ghost"
          className="text-slate-400 hover:text-white"
        >
          <ChevronLeft className="w-4.5 h-4.5 mr-1" /> Back
        </Button>
        
        <div className="flex items-center gap-2">
          {getSaveStatusLabel()}
          <span className="text-xs text-slate-500 font-bold">Step {currentStep} of 8</span>
        </div>
      </div>

      {/* Progress Bar indicator */}
      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-900">
        <div 
          className="bg-blue-500 h-full rounded-full transition-all duration-300"
          style={{ width: `${(currentStep / 8) * 100}%` }}
        />
      </div>

      {/* Render Steps */}
      <div className="min-h-[300px]">
        {currentStep === 1 && (
          <CustomerCard 
            report={report} 
            customers={customers} 
            onChange={handleUpdateReport} 
          />
        )}
        {currentStep === 2 && (
          <EquipmentCard 
            report={report} 
            onChange={handleUpdateReport} 
          />
        )}
        {currentStep === 3 && (
          <VisitDetailsCard 
            report={report} 
            onChange={handleUpdateReport} 
          />
        )}
        {currentStep === 4 && (
          <ChecklistCard 
            activities={activities} 
            onChange={handleUpdateActivities} 
          />
        )}
        {currentStep === 5 && (
          <ChargesCard 
            report={report} 
            parts={parts} 
            inventoryProducts={inventoryProducts} 
            onChangeReport={handleUpdateReport} 
            onChangeParts={handleUpdateParts} 
          />
        )}
        {currentStep === 6 && (
          <AISummaryCard 
            report={report} 
            activities={activities} 
            parts={parts} 
            onChangeReport={handleUpdateReport} 
          />
        )}
        {currentStep === 7 && (
          <PhotosCard 
            photos={photos} 
            onChange={handleUpdatePhotos} 
          />
        )}
        {currentStep === 8 && (
          <ReviewCard 
            report={report} 
            activities={activities} 
            parts={parts} 
            photos={photos} 
            onChangeReport={handleUpdateReport} 
          />
        )}
      </div>

      {/* Sticky Bottom Wizard Navigation */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-850 bg-slate-950/80 backdrop-blur-md p-4 z-40">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          
          {/* Previous / Save Draft controls */}
          <div className="flex items-center gap-2">
            {currentStep > 1 && (
              <Button
                type="button"
                onClick={() => setCurrentStep(prev => prev - 1)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold h-11 px-4 text-xs sm:text-sm"
              >
                Previous
              </Button>
            )}
            <Button
              type="button"
              onClick={handleSaveDraftManual}
              disabled={saving}
              className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold h-11 px-3 text-xs flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" /> Save Draft
            </Button>
          </div>

          {/* Next / Submit controls */}
          {currentStep < 8 ? (
            <Button
              type="button"
              onClick={() => setCurrentStep(prev => prev + 1)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-11 px-6 text-xs sm:text-sm flex items-center gap-1"
            >
              Continue <ChevronRight className="w-4.5 h-4.5" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleFinalSubmit}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold h-11 px-6 text-xs sm:text-sm flex items-center gap-1.5"
            >
              <FileCheck2 className="w-5 h-5" /> Submit Service Report
            </Button>
          )}

        </div>
      </div>

    </div>
  );
}

// Simple loader icon placeholder
function LoaderCircle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
