import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { 
  fetchCompleteServiceReport, 
  saveServiceReport, 
  CompleteServiceReport,
  ServiceReport 
} from "@/lib/serviceReports";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useReactToPrint } from "react-to-print";
import { 
  ChevronLeft, 
  Printer, 
  Clock, 
  AlertCircle,
  Edit
} from "lucide-react";
import apexLogo from "@/assets/apex-logo.jpeg";

export default function ServiceReportView() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const [completeReport, setCompleteReport] = useState<CompleteServiceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);

  // Hook up print function
  const handlePrint = useReactToPrint({
    contentRef: reportRef,
    documentTitle: completeReport ? `Service_Report_${completeReport.report.report_number}` : "Service_Report",
  });

  useEffect(() => {
    if (id) {
      loadReport(id);
    }
  }, [id]);

  const loadReport = async (reportId: string) => {
    setLoading(true);
    try {
      const data = await fetchCompleteServiceReport(reportId);
      setCompleteReport(data);
    } catch (err) {
      console.error("Failed to load service report details:", err);
      toast.error("Failed to load service report details.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (newStatus: "draft" | "submitted" | "reviewed" | "approved" | "completed") => {
    if (!completeReport) return;
    setIsUpdatingStatus(true);
    try {
      const updatedReport: ServiceReport = {
        ...completeReport.report,
        status: newStatus
      };

      await saveServiceReport({
        ...completeReport,
        report: updatedReport
      });

      setCompleteReport(prev => prev ? { ...prev, report: updatedReport } : null);
      toast.success(`Report status updated to: ${newStatus}`);
    } catch (err) {
      console.error("Failed to update status:", err);
      toast.error("Failed to update status.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary" className="bg-slate-700 text-slate-350 border-slate-600">Draft</Badge>;
      case "submitted":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Submitted</Badge>;
      case "reviewed":
        return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Reviewed</Badge>;
      case "approved":
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Approved</Badge>;
      case "completed":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-12 text-slate-500">
        <Clock className="w-8.5 h-8.5 animate-spin text-blue-500 mb-2" />
        Loading report details...
      </div>
    );
  }

  if (!completeReport) {
    return (
      <div className="text-center py-12 text-slate-400">
        <AlertCircle className="w-12 h-12 mx-auto mb-2 text-red-400" />
        Report not found.
      </div>
    );
  }

  const { report, activities, parts, photos } = completeReport;

  const checkedActivities = activities.filter(a => a.is_checked && !a.is_custom);
  const customActions = activities.filter(a => a.is_custom);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 select-none">
      
      {/* Top Action Header bar (Not Printed) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-slate-900 border border-slate-800 p-4 rounded-xl print:hidden">
        <Button
          onClick={() => navigate("/service-reports/list")}
          variant="ghost"
          className="text-slate-400 hover:text-white self-start"
        >
          <ChevronLeft className="w-4 h-4 mr-1.5" /> Back to Registry
        </Button>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Admin status workflow controls */}
          {isAdmin && (
            <div className="flex items-center gap-1.5 border border-slate-800 bg-slate-950 p-1 rounded-lg">
              <span className="text-[10px] text-slate-500 font-bold uppercase px-2">Workflow:</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={isUpdatingStatus}
                onClick={() => handleUpdateStatus("reviewed")}
                className={`h-7 px-2.5 text-xs ${report.status === "reviewed" ? "bg-purple-900/40 text-purple-300" : "text-slate-400"}`}
              >
                Review
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={isUpdatingStatus}
                onClick={() => handleUpdateStatus("approved")}
                className={`h-7 px-2.5 text-xs ${report.status === "approved" ? "bg-amber-900/40 text-amber-350" : "text-slate-400"}`}
              >
                Approve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={isUpdatingStatus}
                onClick={() => handleUpdateStatus("completed")}
                className={`h-7 px-2.5 text-xs ${report.status === "completed" ? "bg-emerald-900/40 text-emerald-300" : "text-slate-400"}`}
              >
                Complete
              </Button>
            </div>
          )}

          {/* Edit Button for drafts */}
          {(report.status === "draft" || isAdmin) && (
            <Button
              onClick={() => navigate(`/service-reports/edit/${report.id}`)}
              className="bg-slate-850 hover:bg-slate-800 border border-slate-700 text-white font-semibold h-10 px-4 flex items-center gap-1.5"
            >
              <Edit className="w-4 h-4" /> Edit
            </Button>
          )}

          {/* Print / Save PDF Button */}
          <Button
            onClick={() => handlePrint()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 px-4 flex items-center gap-2"
          >
            <Printer className="w-4 h-4" /> Export PDF
          </Button>
        </div>
      </div>

      {/* RENDER THE HIGH-FIDELITY EXCEL PRINT WORK SHEET */}
      <div 
        ref={reportRef} 
        className="bg-white border border-slate-300 p-6 sm:p-10 space-y-6 text-black max-w-full shadow-md rounded-none print:shadow-none print:p-0 print:border-none"
      >
        <style>{`
          @media print {
            body {
              background-color: white !important;
              color: black !important;
            }
            .no-print {
              display: none !important;
            }
          }
          .excel-table {
            width: 100%;
            border-collapse: collapse;
            font-family: 'Courier New', Courier, monospace;
            font-size: 11px;
            color: black;
          }
          .excel-table td, .excel-table th {
            border: 1.5px solid black !important;
            padding: 8px !important;
            vertical-align: top;
          }
          .excel-header {
            font-weight: 900;
            background-color: #f2f2f2 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        `}</style>

        {/* Excel layout main table structure */}
        <table className="excel-table">
          <tbody>
            
            {/* 1. Header Row */}
            <tr>
              <td colSpan={2} className="w-2/3">
                <div className="flex items-center gap-4 py-2">
                  <img src={apexLogo} alt="Apex Logo" className="h-14 w-14 object-cover bg-white" />
                  <div>
                    <h1 className="text-xl font-black uppercase tracking-wider underline leading-none">
                      SERVICE REPORT
                    </h1>
                    <div className="text-[9px] font-bold text-slate-700 mt-1 max-w-xs">
                      Apex Industrial Metrology LLP<br/>
                      Calibration, Validation, Cleanroom testing & Instrumentation service providers.
                    </div>
                  </div>
                </div>
              </td>
              <td colSpan={2} className="w-1/3">
                <div className="space-y-1.5 font-bold">
                  <div>REPORT NO : <span className="underline">{report.report_number}</span></div>
                  <div>DATE OF SERVICE : <span className="underline">{report.date_of_service ? new Date(report.date_of_service).toLocaleDateString() : ""}</span></div>
                  <div>NEXT SERVICE DUE : <span className="underline">{report.next_service_due_date ? new Date(report.next_service_due_date).toLocaleDateString() : ""}</span></div>
                </div>
              </td>
            </tr>

            {/* 2. Customer Name & Address */}
            <tr>
              <td colSpan={4} className="excel-header uppercase font-black text-xs">
                CUSTOMER NAME & ADDRESS
              </td>
            </tr>
            <tr>
              <td colSpan={4} className="h-16 font-bold">
                M/S. {report.customer_name}<br/>
                {report.customer_address && <span className="font-medium text-[10px] block mt-1">{report.customer_address}</span>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-slate-700 mt-2 font-medium">
                  {report.contact_person && <span>Contact: {report.contact_person}</span>}
                  {report.phone_number && <span>Phone: {report.phone_number}</span>}
                  {report.email && <span>Email: {report.email}</span>}
                </div>
              </td>
            </tr>

            {/* 3. Instrument Details */}
            <tr>
              <td colSpan={4} className="excel-header uppercase font-black text-xs">
                INSTRUMENT DETAILS
              </td>
            </tr>
            <tr className="font-bold">
              <td className="w-1/4">EQUIPMENT NAME :</td>
              <td className="w-1/4 text-slate-800">{report.equipment_name || "-"}</td>
              <td className="w-1/4">IDENTIFICATION NO :</td>
              <td className="w-1/4 text-slate-800">{report.identification_number || "-"}</td>
            </tr>
            <tr className="font-bold">
              <td>SR.NO :</td>
              <td className="text-slate-800">{report.serial_number || "-"}</td>
              <td>MAKE :</td>
              <td className="text-slate-800">{report.make || "-"}</td>
            </tr>
            <tr className="font-bold">
              <td>MODEL :</td>
              <td className="text-slate-800">{report.model || "-"}</td>
              <td>LOCATION :</td>
              <td className="text-slate-800">{report.location || "-"}</td>
            </tr>

            {/* 4. Nature of Visit */}
            <tr className="font-bold">
              <td>NATURE OF VISIT :</td>
              <td className="text-center">
                CHARGEABLE<br/>
                <span className="underline">{report.visit_type === "Chargeable" ? "YES" : "NO"}</span>
              </td>
              <td className="text-center">
                AMC VISIT<br/>
                <span className="underline">{report.visit_type === "AMC Visit" ? "YES" : "NO"}</span>
              </td>
              <td className="text-center">
                WARRANTY VISIT<br/>
                <span className="underline">{report.visit_type === "Warranty Visit" ? "YES" : "NO"}</span>
              </td>
            </tr>

            {/* 5. Visit Dates */}
            <tr className="font-bold text-center">
              <td>PROBLEM REPORTED DATE</td>
              <td>COMMITTED SERVICE DATE</td>
              <td colSpan={2}>OUR VISIT DATE</td>
            </tr>
            <tr className="font-bold text-center">
              <td>{report.problem_reported_date ? new Date(report.problem_reported_date).toLocaleDateString() : "-"}</td>
              <td>{report.committed_service_date ? new Date(report.committed_service_date).toLocaleDateString() : "-"}</td>
              <td colSpan={2}>{report.actual_visit_date ? new Date(report.actual_visit_date).toLocaleDateString() : "-"}</td>
            </tr>

            {/* 6. Nature of Problem */}
            <tr>
              <td colSpan={4} className="excel-header uppercase font-black text-xs">
                NATURE OF PROBLEM
              </td>
            </tr>
            <tr>
              <td colSpan={4} className="min-h-12 whitespace-pre-line font-medium leading-relaxed">
                {report.nature_of_problem || "No problem reported."}
              </td>
            </tr>

            {/* 7. Action Carried Out */}
            <tr>
              <td colSpan={4} className="excel-header uppercase font-black text-xs">
                ACTION CARRIED OUT
              </td>
            </tr>
            <tr>
              <td colSpan={4} className="p-3">
                {checkedActivities.length > 0 || customActions.length > 0 ? (
                  <ol className="list-decimal pl-5 space-y-1.5 font-bold">
                    {checkedActivities.map((act, index) => (
                      <li key={index} className="leading-tight">
                        {act.activity_name.toUpperCase()}
                      </li>
                    ))}
                    {customActions.map((act, index) => (
                      <li key={`custom-${index}`} className="leading-tight text-blue-900">
                        {act.activity_name.toUpperCase()} (CUSTOM)
                      </li>
                    ))}
                  </ol>
                ) : (
                  <span className="font-medium text-slate-400 italic">No checklist actions selected.</span>
                )}
              </td>
            </tr>

            {/* 8. Spares Changed */}
            <tr>
              <td colSpan={4} className="excel-header uppercase font-black text-xs">
                SPARES CHANGED ( IF ANY )
              </td>
            </tr>
            <tr>
              <td colSpan={4} className="p-3">
                {parts.length > 0 ? (
                  <table className="w-full text-left font-bold text-xs">
                    <thead>
                      <tr className="border-b border-slate-400">
                        <th className="pb-1 font-bold">PART NUMBER</th>
                        <th className="pb-1 font-bold">DESCRIPTION</th>
                        <th className="pb-1 text-center font-bold">QTY</th>
                        <th className="pb-1 text-right font-bold">PRICE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parts.map((p, idx) => (
                        <tr key={idx}>
                          <td className="py-1 font-mono">{p.part_number || "-"}</td>
                          <td className="py-1">{p.item_name.toUpperCase()}</td>
                          <td className="py-1 text-center">{p.quantity}</td>
                          <td className="py-1 text-right">â‚¹{p.total_price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <span className="font-medium">-</span>
                )}
              </td>
            </tr>

            {/* 9. Applicable Charges */}
            <tr>
              <td colSpan={4} className="excel-header uppercase font-black text-xs">
                APPLICABLE CHARGES
              </td>
            </tr>
            <tr>
              <td colSpan={4} className="font-bold">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center text-[10px]">
                  <div>LABOUR: â‚¹{report.labour_charges || "0.00"}</div>
                  <div>SPARE: â‚¹{report.spare_charges || "0.00"}</div>
                  <div>TRAVEL: â‚¹{report.travel_charges || "0.00"}</div>
                  <div>OTHER: â‚¹{report.other_charges || "0.00"}</div>
                  <div className="bg-slate-100 border border-slate-300 p-1 underline">TOTAL: â‚¹{report.total_charges || "0.00"}</div>
                </div>
              </td>
            </tr>

            {/* 10. Suggestions */}
            <tr>
              <td colSpan={4} className="excel-header uppercase font-black text-xs">
                OUR SUGGESTIONS ON
              </td>
            </tr>
            <tr>
              <td colSpan={4} className="font-medium">
                {report.suggestions || "-"}
              </td>
            </tr>

            {/* 11. Customer Feedback */}
            <tr>
              <td colSpan={4} className="excel-header uppercase font-black text-xs">
                CUSTOMER'S FEEDBACK
              </td>
            </tr>
            <tr>
              <td colSpan={4} className="font-medium">
                {report.customer_feedback || "-"}
              </td>
            </tr>

            {/* 12. Signatures Block */}
            <tr className="font-bold text-center">
              <td colSpan={2} className="w-1/2 uppercase excel-header py-1 font-black">
                CUSTOMER'S ACKNOWLEDGEMENT
              </td>
              <td colSpan={2} className="w-1/2 uppercase excel-header py-1 font-black">
                METRIC REPRESENTATIVE (ENGINEER)
              </td>
            </tr>
            <tr className="font-bold">
              <td colSpan={2} className="space-y-6 py-4">
                <div>NAME : MR. {report.customer_signature_name || ""}</div>
                <div className="h-10 border-b border-dashed border-slate-400 w-2/3 mt-2">SIGNATURE : </div>
                <div>DATE : {report.customer_signature_date ? new Date(report.customer_signature_date).toLocaleDateString() : ""}</div>
              </td>
              <td colSpan={2} className="space-y-6 py-4">
                <div>NAME : {report.engineer_signature_name || ""}</div>
                <div className="h-10 border-b border-dashed border-slate-400 w-2/3 mt-2">SIGNATURE : </div>
                <div>DATE : {report.engineer_signature_date ? new Date(report.engineer_signature_date).toLocaleDateString() : ""}</div>
              </td>
            </tr>

          </tbody>
        </table>

        {/* 13. Photos Attachments (only printed if present) */}
        {photos.length > 0 && (
          <div className="pt-8 border-t-2 border-dashed border-slate-400 space-y-4 page-break-before">
            <h2 className="text-sm font-bold uppercase tracking-wider text-center border-b border-black pb-2">
              SERVICE PHOTO ATTACHMENTS
            </h2>
            <div className="grid gap-4 grid-cols-2">
              {photos.map((p, idx) => (
                <div key={idx} className="border-2 border-black p-2 flex flex-col items-center gap-2">
                  <div className="h-[200px] w-full bg-slate-100 border border-slate-350 flex items-center justify-center overflow-hidden">
                    <img src={p.photo_url} alt={p.photo_name} className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wide bg-slate-100 p-1.5 w-full text-center border-t border-black">
                    {p.category}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
