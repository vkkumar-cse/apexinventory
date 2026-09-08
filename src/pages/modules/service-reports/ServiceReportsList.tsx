import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { fetchServiceReports, deleteServiceReport, ServiceReport } from "@/lib/serviceReports";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Search, 
  Trash, 
  Edit, 
  Eye, 
  Printer, 
  Wrench, 
  ChevronRight, 
  Users, 
  Calendar,
  AlertCircle,
  Filter,
  CheckCircle,
  History
} from "lucide-react";

export default function ServiceReportsList() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState<ServiceReport[]>([]);
  const [filteredReports, setFilteredReports] = useState<ServiceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNotConfigured, setIsNotConfigured] = useState(false);

  // Search & Filter variables
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [engineerFilter, setEngineerFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");

  const [engineers, setEngineers] = useState<{ id: string; name: string }[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [equipments, setEquipments] = useState<string[]>([]);

  useEffect(() => {
    document.title = "Service Reports Â· Apex Software";
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const data = await fetchServiceReports();
      setReports(data);
      setFilteredReports(data);

      // Collect lookups for filters
      const uniqueEngineersMap = new Map<string, string>();
      const uniqueCustomersSet = new Set<string>();
      const uniqueEquipmentsSet = new Set<string>();

      data.forEach((r: any) => {
        if (r.profile_id) {
          const name = r.profiles?.display_name || r.profiles?.email || "Unknown";
          uniqueEngineersMap.set(r.profile_id, name);
        }
        if (r.customer_name) uniqueCustomersSet.add(r.customer_name);
        if (r.equipment_name) uniqueEquipmentsSet.add(r.equipment_name);
      });

      setEngineers(Array.from(uniqueEngineersMap.entries()).map(([id, name]) => ({ id, name })));
      setCustomers(Array.from(uniqueCustomersSet));
      setEquipments(Array.from(uniqueEquipmentsSet));
    } catch (err: any) {
      console.error("Failed to load reports list:", err);
      if (err.isConfigError) {
        setIsNotConfigured(true);
      } else {
        toast.error("Failed to load reports. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    let result = [...reports];

    // Search query matches customer, equipment, or report number
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.report_number.toLowerCase().includes(q) ||
          r.customer_name?.toLowerCase().includes(q) ||
          r.equipment_name?.toLowerCase().includes(q) ||
          r.serial_number?.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((r) => r.status === statusFilter);
    }

    // Engineer filter
    if (engineerFilter !== "all") {
      result = result.filter((r) => r.profile_id === engineerFilter);
    }

    // Customer filter
    if (customerFilter !== "all") {
      result = result.filter((r) => r.customer_name === customerFilter);
    }

    setFilteredReports(result);
  };

  useEffect(() => {
    handleApplyFilters();
  }, [search, statusFilter, engineerFilter, customerFilter, reports]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this service report?")) return;
    try {
      await deleteServiceReport(id);
      toast.success("Service report deleted successfully.");
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      toast.error("Failed to delete service report.");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary" className="bg-slate-800 text-slate-350 border-slate-700">Draft</Badge>;
      case "submitted":
        return <Badge className="bg-blue-600/20 text-blue-400 border-blue-650/30">Submitted</Badge>;
      case "reviewed":
        return <Badge className="bg-purple-600/20 text-purple-400 border-purple-650/30">Reviewed</Badge>;
      case "approved":
        return <Badge className="bg-amber-600/20 text-amber-400 border-amber-650/30">Approved</Badge>;
      case "completed":
        return <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-650/30">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
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
        <Button onClick={loadReports} className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 px-5">
          Retry Connection
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full pb-16 select-none">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-slate-900 border border-slate-850 p-4 rounded-2xl gap-3">
        <div>
          <h1 className="text-xl font-black text-white leading-tight flex items-center gap-2">
            <Wrench className="w-5 h-5 text-blue-450" />
            Service Reports Registry
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage, verify, edit, and print service sheets.
          </p>
        </div>
        <Button
          onClick={() => navigate("/service-reports/new")}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 px-4"
        >
          Create Report
        </Button>
      </div>

      {/* Filter panel */}
      <Card className="bg-slate-900 border-slate-850 text-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Customer, ID..."
              className="bg-slate-950 border-slate-800 text-white text-xs pl-9 min-h-10"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-slate-950 border-slate-800 text-xs min-h-10 text-slate-300">
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-850 text-white text-xs">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>

          {/* Engineer filter (Admins only see other engineers, workers see filter disabled or hidden) */}
          <Select 
            value={engineerFilter} 
            onValueChange={setEngineerFilter}
            disabled={!isAdmin}
          >
            <SelectTrigger className="bg-slate-950 border-slate-800 text-xs min-h-10 text-slate-300">
              <SelectValue placeholder="Filter Engineer" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-850 text-white text-xs">
              <SelectItem value="all">All Engineers</SelectItem>
              {engineers.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="bg-slate-950 border-slate-800 text-xs min-h-10 text-slate-300">
              <SelectValue placeholder="Filter Customer" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-850 text-white text-xs">
              <SelectItem value="all">All Customers</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Reports Table list */}
      <Card className="bg-slate-900 border-slate-850 text-white overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-500">
            <LoaderCircle className="w-8 h-8 animate-spin text-blue-500 mb-2" />
            Loading service reports...
          </div>
        ) : filteredReports.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950/80 text-slate-400 font-bold border-b border-slate-850">
                <tr>
                  <th className="px-4 py-3 font-bold">Report Number</th>
                  <th className="px-4 py-3 font-bold">Customer Name</th>
                  <th className="px-4 py-3 font-bold">Equipment</th>
                  <th className="px-4 py-3 font-bold">Date of Service</th>
                  <th className="px-4 py-3 font-bold">Engineer</th>
                  <th className="px-4 py-3 font-bold text-center">Status</th>
                  <th className="px-4 py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {filteredReports.map((r: any) => {
                  const engineerName = r.profiles?.display_name || r.profiles?.email || "Unknown";
                  return (
                    <tr key={r.id} className="hover:bg-slate-950/40 transition">
                      <td className="px-4 py-3.5 font-mono text-slate-400 font-bold">{r.report_number}</td>
                      <td className="px-4 py-3.5 font-semibold text-slate-200">{r.customer_name || "N/A"}</td>
                      <td className="px-4 py-3.5 text-slate-300">{r.equipment_name || "N/A"}</td>
                      <td className="px-4 py-3.5 text-slate-300">
                        {r.date_of_service ? new Date(r.date_of_service).toLocaleDateString() : "N/A"}
                      </td>
                      <td className="px-4 py-3.5 text-slate-300">{engineerName}</td>
                      <td className="px-4 py-3.5 text-center">{getStatusBadge(r.status)}</td>
                      <td className="px-4 py-3.5 text-right space-x-1 shrink-0">
                        {/* Edit for drafts */}
                        {(r.status === "draft" || isAdmin) && (
                          <Button
                            onClick={() => navigate(`/service-reports/edit/${r.id}`)}
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-slate-800 text-slate-300"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                        )}

                        {/* View / Print for all */}
                        <Button
                          onClick={() => navigate(`/service-reports/view/${r.id}`)}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-slate-800 text-blue-400 hover:text-blue-300"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>

                        {/* Delete for drafts / admin */}
                        {(r.status === "draft" || isAdmin) && (
                          <Button
                            onClick={() => handleDelete(r.id)}
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-slate-800 text-red-500 hover:text-red-400"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 font-medium flex flex-col items-center justify-center gap-2">
            <AlertCircle className="w-10 h-10 opacity-30" />
            No service reports match the current filters.
          </div>
        )}
      </Card>
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
