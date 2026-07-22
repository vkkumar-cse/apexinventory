import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Trash2,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  GitCommit,
} from "lucide-react";
import { formatDurationHours } from "@/lib/formatDuration";
import * as XLSX from "xlsx";

type ProfileLite = {
  id: string;
  employee_code: string | null;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
};

type AttendanceRecord = {
  id: string;
  profile_id: string;
  attendance_date: string;
  site_id: string | null;
  site_name_snapshot: string;
  check_in: string | null;
  check_out: string | null;
  status: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  check_out_latitude: number | null;
  check_out_longitude: number | null;
  check_in_distance_meters: number | null;
  check_out_distance_meters: number | null;
  face_verified: boolean | null;
  face_match_score: number | null;
};

type AttendanceSite = {
  id: string;
  site_name: string;
};

const PAGE_SIZE = 12;

const formatISTTime = (time: string | null) => {
  if (!time) return "-";
  return new Date(time).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
};

const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const initialsFor = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "AP";

const getStatusBadge = (status: string | null) => {
  const statusValue = (status || "present").toLowerCase();
  const styles: Record<string, string> = {
    present: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    open: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    late: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    "half-day": "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    absent: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  };

  const label = statusValue === "half-day"
    ? "Half Day"
    : statusValue.charAt(0).toUpperCase() + statusValue.slice(1);

  return <Badge className={`${styles[statusValue] ?? "bg-slate-800 text-slate-300 border-slate-700"} border text-xs`}>{label}</Badge>;
};

export default function AttendanceHistory() {
  const { user, isAdmin } = useAuth();
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [allProfiles, setAllProfiles] = useState<ProfileLite[]>([]);
  const [sites, setSites] = useState<AttendanceSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // Filters
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  // Layout preferences
  const [viewMode, setViewMode] = useState<"table" | "timeline">("table");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const profilesById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);

  const getProfileLabel = (profile: ProfileLite) =>
    [profile.full_name || profile.display_name || profile.email || "Unknown Employee", profile.employee_code].filter(Boolean).join(" - ");

  const getSessionHours = (record: AttendanceRecord) => {
    if (!record.check_in || !record.check_out) return null;
    const diffMs = new Date(record.check_out).getTime() - new Date(record.check_in).getTime();
    return Number(Math.max(0, diffMs / (1000 * 60 * 60)).toFixed(2));
  };

  const getEmployeeName = (record: AttendanceRecord) => {
    const profile = profilesById.get(record.profile_id);
    return profile?.full_name || profile?.display_name || profile?.email || "Unknown Employee";
  };

  const getGpsDistance = (record: AttendanceRecord) => {
    const distance = record.check_out_distance_meters ?? record.check_in_distance_meters;
    return distance === null || distance === undefined ? "-" : `${Math.round(distance)}m`;
  };

  // Convert match score to qualitative confidence
  const getFaceMatchConfidence = (score: number | null) => {
    if (score === null || score === undefined) return "None";
    if (score >= 0.85) return "Excellent";
    if (score >= 0.70) return "Good";
    if (score >= 0.55) return "Fair";
    return "Low";
  };

  const filteredAttendance = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return attendance;

    return attendance.filter((record) => {
      const profile = profilesById.get(record.profile_id);
      const haystack = [
        getEmployeeName(record),
        profile?.employee_code,
        profile?.email,
        record.site_name_snapshot,
        record.status,
        record.attendance_date,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [attendance, profilesById, searchTerm]);

  const pageCount = Math.max(1, Math.ceil(filteredAttendance.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paginatedAttendance = filteredAttendance.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const loadAttendance = async () => {
    setLoading(true);
    try {
      const attendanceQuery = supabase
        .from("attendance_sessions" as any)
        .select("id, profile_id, attendance_date, site_id, site_name_snapshot, check_in, check_out, status, check_in_latitude, check_in_longitude, check_out_latitude, check_out_longitude, check_in_distance_meters, check_out_distance_meters, face_verified, face_match_score")
        .order("attendance_date", { ascending: false })
        .order("check_in", { ascending: false });

      if (dateFrom) attendanceQuery.gte("attendance_date", dateFrom);
      if (dateTo) attendanceQuery.lte("attendance_date", dateTo);
      if (siteFilter !== "all") attendanceQuery.eq("site_id", siteFilter);
      if (statusFilter !== "all") attendanceQuery.eq("status", statusFilter);

      const { data: attendanceRows, error: attendanceError } = isAdmin
        ? await (employeeFilter !== "all" ? attendanceQuery.eq("profile_id", employeeFilter) : attendanceQuery)
        : await attendanceQuery.eq("profile_id", user?.id ?? "");

      if (attendanceError) throw attendanceError;

      const nextAttendance = (attendanceRows ?? []) as unknown as AttendanceRecord[];
      setAttendance(nextAttendance);

      const profileIds = Array.from(new Set(nextAttendance.map((record) => record.profile_id)));
      const [{ data: profileRows, error: profileError }, { data: allProfileRows, error: allProfilesError }, { data: siteRows, error: sitesError }] = await Promise.all([
        profileIds.length > 0
          ? supabase.from("profiles" as any).select("id, employee_code, full_name, display_name, email").in("id", profileIds)
          : Promise.resolve({ data: [], error: null }),
        isAdmin
          ? supabase.from("profiles" as any).select("id, employee_code, full_name, display_name, email").eq("status", "approved").order("full_name", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        (supabase as any).from("attendance_sites").select("id, site_name").order("site_name", { ascending: true }),
      ]);

      if (profileError) throw profileError;
      if (allProfilesError) throw allProfilesError;
      if (sitesError) throw sitesError;
      setProfiles((profileRows ?? []) as unknown as ProfileLite[]);
      setAllProfiles((allProfileRows ?? []) as unknown as ProfileLite[]);
      setSites((siteRows ?? []) as AttendanceSite[]);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load attendance history");
    } finally {
      setLoading(false);
    }
  };

  const deleteAttendance = async (recordId: string) => {
    if (!isAdmin) return;
    if (!window.confirm("Are you sure you want to delete this attendance session?")) return;

    setDeletingId(recordId);
    try {
      const { error } = await supabase.from("attendance_sessions" as any).delete().eq("id", recordId);
      if (error) throw error;
      toast.success("Attendance record deleted.");
      await loadAttendance();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete attendance record");
    } finally {
      setDeletingId(null);
    }
  };

  // Spreadsheet Excel download using xlsx library
  const exportExcel = () => {
    const data = filteredAttendance.map((record) => {
      const profile = profilesById.get(record.profile_id);
      return {
        "Employee Name": getEmployeeName(record),
        "Employee Code": profile?.employee_code ?? "",
        "Date": formatDate(record.attendance_date),
        "Attendance Site": record.site_name_snapshot || "-",
        "Working Hours": formatDurationHours(getSessionHours(record)),
        "Check-in": formatISTTime(record.check_in),
        "Check-out": formatISTTime(record.check_out),
        "GPS Distance": getGpsDistance(record),
        "Device Used": "Browser",
        "Attendance Status": record.status || "present",
        "Face Verified": record.face_verified ? "Verified" : "Pending",
        "Face Match %": record.face_match_score !== null && record.face_match_score !== undefined ? `${Math.round(record.face_match_score * 100)}%` : "",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance History");
    XLSX.writeFile(workbook, `attendance-history-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  useEffect(() => {
    document.title = "Attendance History - Apex Software";
    loadAttendance();
  }, [isAdmin, user?.id, employeeFilter, siteFilter, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, employeeFilter, siteFilter, statusFilter, dateFrom, dateTo]);

  const toggleRow = (id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  const getSiteSub = (name: string) => {
    const lower = (name || "").toLowerCase();
    if (lower.includes("main office") || lower.includes("default")) return "Default Office";
    if (lower.includes("india") || lower.includes("wheels") || lower.includes("manufacturing")) return "Branch Office";
    if (lower.includes("demo")) return "Demo Site";
    return "Client Site";
  };

  const formatWorkingTime = (hours: number | null) => {
    if (hours === null || hours === undefined) return "-";
    const numericHours = Number(hours);
    if (!Number.isFinite(numericHours) || numericHours <= 0) return "0 min";

    const totalMinutes = Math.max(0, Math.round(numericHours * 60));
    if (totalMinutes === 0) return "0 min";
    if (totalMinutes < 60) return `${totalMinutes} ${totalMinutes === 1 ? "min" : "mins"}`;

    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    
    if (m === 0) return `${h}h`;
    return `${h}h ${m.toString().padStart(2, "0")}m`;
  };

  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Group timeline by date (and employee if admin)
  const groupedTimeline = useMemo(() => {
    const groups: { [key: string]: AttendanceRecord[] } = {};
    for (const record of paginatedAttendance) {
      const key = isAdmin ? `${record.attendance_date}_${record.profile_id}` : record.attendance_date;
      if (!groups[key]) groups[key] = [];
      groups[key].push(record);
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [paginatedAttendance, isAdmin]);

  const resetFilters = () => {
    setSearchTerm("");
    setEmployeeFilter("all");
    setSiteFilter("all");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const renderDetailsBlock = (record: AttendanceRecord) => {
    const employeeName = getEmployeeName(record);
    const hours = getSessionHours(record);
    const browser = getBrowserInfo();
    const device = getDeviceInfo();
    
    return (
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-5 mt-3 space-y-4 text-xs text-slate-300">
        <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
          <h4 className="font-bold text-sm text-slate-100 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" />
            Attendance Details
          </h4>
          <span className="font-mono text-slate-500 text-[10px]">Session ID: {record.id}</span>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <span className="text-slate-500 block uppercase font-bold text-[9px] tracking-wider">Attendance Site</span>
            <span className="text-slate-200 mt-1 block font-medium">📍 {record.site_name_snapshot || "Main Office"}</span>
          </div>

          <div>
            <span className="text-slate-500 block uppercase font-bold text-[9px] tracking-wider">Working Hours</span>
            <span className="font-mono text-slate-200 mt-1 block font-bold">{formatWorkingTime(hours)}</span>
          </div>

          <div>
            <span className="text-slate-500 block uppercase font-bold text-[9px] tracking-wider">Session Duration</span>
            <span className="font-mono text-slate-200 mt-1 block">
              {record.check_in ? formatISTTime(record.check_in) : "-"} to {record.check_out ? formatISTTime(record.check_out) : "Active Session"}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block uppercase font-bold text-[9px] tracking-wider">Face Verification</span>
            <span className="text-slate-200 mt-1 block font-medium flex items-center gap-1">
              {record.face_verified ? (
                <>
                  <span className="text-emerald-400 font-bold">✓ Verified</span>
                  {record.face_match_score !== null && (
                    <span className="text-slate-400">({Math.round(record.face_match_score * 100)}% match)</span>
                  )}
                </>
              ) : (
                <span className="text-slate-400">Pending</span>
              )}
            </span>
          </div>

          {isAdmin && (
            <>
              <div>
                <span className="text-slate-500 block uppercase font-bold text-[9px] tracking-wider">Face Match Level</span>
                <span className={`font-semibold mt-1 block ${record.face_verified ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {getFaceMatchConfidence(record.face_match_score)}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block uppercase font-bold text-[9px] tracking-wider">GPS Verification</span>
                <span className="text-slate-200 mt-1 block font-medium">
                  {record.check_in_distance_meters !== null ? (
                    <span className="text-emerald-400">✓ In-Range</span>
                  ) : (
                    <span className="text-slate-400">Not Verified</span>
                  )}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block uppercase font-bold text-[9px] tracking-wider">Distance from Site</span>
                <span className="font-mono text-slate-200 mt-1 block">
                  In: {record.check_in_distance_meters !== null ? `${Math.round(record.check_in_distance_meters)}m` : "-"}
                  {record.check_out_distance_meters !== null ? ` | Out: ${Math.round(record.check_out_distance_meters)}m` : ""}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block uppercase font-bold text-[9px] tracking-wider">Check-In Coordinates</span>
                <span className="font-mono text-slate-200 mt-1 block">
                  {record.check_in_latitude ? `${record.check_in_latitude.toFixed(6)}, ${record.check_in_longitude?.toFixed(6)}` : "-"}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block uppercase font-bold text-[9px] tracking-wider">Check-Out Coordinates</span>
                <span className="font-mono text-slate-200 mt-1 block">
                  {record.check_out_latitude ? `${record.check_out_latitude.toFixed(6)}, ${record.check_out_longitude?.toFixed(6)}` : "-"}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block uppercase font-bold text-[9px] tracking-wider">Browser Client</span>
                <span className="text-slate-200 mt-1 block">{browser}</span>
              </div>

              <div>
                <span className="text-slate-500 block uppercase font-bold text-[9px] tracking-wider">Device OS / Type</span>
                <span className="text-slate-200 mt-1 block">{device}</span>
              </div>
            </>
          )}
        </div>

        {isAdmin && (
          <div className="pt-3 border-t border-slate-800/60 flex justify-end">
            <Button 
              type="button" 
              variant="destructive" 
              size="sm" 
              onClick={() => deleteAttendance(record.id)} 
              disabled={deletingId === record.id} 
              className="bg-red-950/10 text-red-400 hover:bg-red-650 hover:text-white border border-red-500/25 text-xs h-8 px-3.5"
            >
              {deletingId === record.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
              Delete Attendance Record
            </Button>
          </div>
        )}
      </div>
    );
  };

  const getBrowserInfo = () => {
    const ua = navigator.userAgent;
    if (ua.includes("Firefox")) return "Mozilla Firefox";
    if (ua.includes("Chrome")) return "Google Chrome";
    if (ua.includes("Safari")) return "Apple Safari";
    if (ua.includes("Edge")) return "Microsoft Edge";
    return "Web Browser Client";
  };

  const getDeviceInfo = () => {
    const ua = navigator.userAgent;
    if (/Mobi|Android|iPhone/i.test(ua)) return "Mobile Device";
    if (/Tablet|iPad/i.test(ua)) return "Tablet Device";
    return "Desktop Computer";
  };

  return (
    <div className="min-h-[calc(100vh-100px)] space-y-5 rounded-2xl border border-slate-800 bg-[#0B1528] p-4 text-white shadow-2xl md:p-6 print:bg-white print:text-black print:border-none print:shadow-none print-container">
      {/* Printable CSS overrides */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          header, nav, aside, button, .no-print, select, .no-print-tabs, input {
            display: none !important;
          }
          .print-container {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
          }
          table {
            border-collapse: collapse !important;
            width: 100% !important;
          }
          th, td {
            border: 1px solid #ddd !important;
            padding: 8px !important;
            color: black !important;
          }
          tr {
            page-break-inside: avoid !important;
          }
        }
      `}} />

      <div className="flex flex-col gap-4 border-b border-slate-800/80 pb-5 lg:flex-row lg:items-center lg:justify-between no-print">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight md:text-3xl">
            <CalendarDays className="h-7 w-7 text-blue-500" />
            Attendance History
          </h1>
          <p className="mt-1 text-sm text-slate-400">{filteredAttendance.length} records shown</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {/* Tab buttons to switch visual chronological Timeline view */}
          <div className="inline-flex rounded-xl bg-slate-900 border border-slate-800 p-1 mr-2 no-print-tabs">
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="rounded-lg h-9 text-xs"
            >
              <LayoutGrid className="w-3.5 h-3.5 mr-1" />
              Table
            </Button>
            <Button
              variant={viewMode === "timeline" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("timeline")}
              className="rounded-lg h-9 text-xs"
            >
              <GitCommit className="w-3.5 h-3.5 mr-1" />
              Timeline
            </Button>
          </div>

          <Button type="button" variant="outline" onClick={exportExcel} className="border-slate-700 text-slate-300 hover:bg-slate-800 h-9 text-xs font-semibold">
            <Download className="mr-2 h-4 w-4" />
            Export Excel
          </Button>
          <Button type="button" variant="outline" onClick={() => window.print()} className="border-slate-700 text-slate-300 hover:bg-slate-800 h-9 text-xs font-semibold">
            <FileText className="mr-2 h-4 w-4" />
            Print PDF
          </Button>
        </div>
      </div>

      {/* Filters row/panel */}
      <div className="no-print">
        {/* Toggle Button for Mobile */}
        <div className="flex md:hidden justify-between items-center bg-[#13223D]/50 border border-slate-800 p-3 rounded-xl">
          <span className="text-sm font-semibold text-slate-300">Filter Attendance</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="border-slate-700 bg-[#0B1528] text-slate-300 h-8 text-xs font-medium"
          >
            <GitCommit className="w-3.5 h-3.5 mr-1.5 rotate-90" />
            {showMobileFilters ? "Hide Filters" : "Show Filters"}
            <ChevronDown className={`w-3.5 h-3.5 ml-1.5 transition-transform duration-200 ${showMobileFilters ? "rotate-180" : ""}`} />
          </Button>
        </div>

        {/* Filters Grid */}
        <div className={`${showMobileFilters ? "flex" : "hidden"} md:grid flex-col md:grid-cols-2 lg:grid-cols-6 gap-3 rounded-xl border border-slate-800 bg-[#13223D]/50 p-4 mt-3 md:mt-0 transition-all`}>
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500">Search Query</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <Input 
                value={searchTerm} 
                onChange={(event) => setSearchTerm(event.target.value)} 
                placeholder="Search name, code, site, status..." 
                className="border-slate-700 bg-[#0B1528] pl-9 text-slate-100 h-10 text-xs" 
              />
            </div>
          </div>

          {isAdmin && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500">Employee</span>
              <select 
                value={employeeFilter} 
                onChange={(event) => setEmployeeFilter(event.target.value)} 
                className="h-10 rounded-md border border-slate-700 bg-[#0B1528] px-3 text-xs text-slate-250 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">All Employees</option>
                {allProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{getProfileLabel(profile)}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500">Attendance Site</span>
            <select 
              value={siteFilter} 
              onChange={(event) => setSiteFilter(event.target.value)} 
              className="h-10 rounded-md border border-slate-700 bg-[#0B1528] px-3 text-xs text-slate-250 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Sites</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>{site.site_name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500">Attendance Status</span>
            <select 
              value={statusFilter} 
              onChange={(event) => setStatusFilter(event.target.value)} 
              className="h-10 rounded-md border border-slate-700 bg-[#0B1528] px-3 text-xs text-slate-250 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open Session</option>
              <option value="completed">Completed</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="half-day">Half Day</option>
              <option value="absent">Absent</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500">Date From</span>
            <Input 
              type="date" 
              value={dateFrom} 
              onChange={(event) => setDateFrom(event.target.value)} 
              className="border-slate-700 bg-[#0B1528] text-slate-200 h-10 text-xs" 
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500">Date To</span>
            <Input 
              type="date" 
              value={dateTo} 
              onChange={(event) => setDateTo(event.target.value)} 
              className="border-slate-700 bg-[#0B1528] text-slate-200 h-10 text-xs" 
            />
          </div>

          <div className="lg:col-span-1 pt-1 md:pt-0">
            <Button 
              type="button" 
              onClick={resetFilters} 
              className="w-full h-10 border-slate-700 bg-[#0B1528] text-slate-300 hover:bg-slate-800 text-xs font-semibold" 
              variant="outline"
            >
              Reset Filters
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
      ) : filteredAttendance.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 bg-[#13223D]/40 py-16 text-center text-slate-400">
          <Clock className="mx-auto mb-3 h-10 w-10 text-slate-650" />
          No attendance records found.
        </div>
      ) : viewMode === "timeline" ? (
        /* Visual Grouped Chronological Timeline View */
        <div className="space-y-6 max-w-2xl mx-auto py-4">
          {groupedTimeline.map(([dateKey, sessions]) => {
            const firstRecord = sessions[0];
            const employeeName = getEmployeeName(firstRecord);
            const profile = profilesById.get(firstRecord.profile_id);
            
            let totalHours = 0;
            sessions.forEach(s => {
              const h = getSessionHours(s);
              if (h) totalHours += h;
            });
            const totalDayWorkingTime = formatWorkingTime(totalHours);
            
            return (
              <div key={dateKey} className="bg-[#13223D]/30 border border-slate-800/80 rounded-2xl p-5 space-y-4 hover:border-slate-700/80 transition-all shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <h3 className="font-extrabold text-slate-100 flex items-center gap-2 text-sm">
                    {isAdmin ? (
                      <>
                        <Avatar className="w-6 h-6 border border-slate-700 bg-slate-900"><AvatarFallback className="bg-blue-500/10 text-blue-300 text-[10px] font-bold">{initialsFor(employeeName)}</AvatarFallback></Avatar>
                        <span>{employeeName}</span>
                        <span className="text-slate-500 text-xs font-normal">· {formatDate(firstRecord.attendance_date)}</span>
                      </>
                    ) : (
                      <>
                        <CalendarDays className="w-4 h-4 text-blue-400" />
                        {formatDate(firstRecord.attendance_date)}
                      </>
                    )}
                  </h3>
                  <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">
                    {sessions.length} {sessions.length === 1 ? "Session" : "Sessions"}
                  </Badge>
                </div>

                <div className="relative pl-6 border-l-2 border-dashed border-slate-800 space-y-5">
                  {sessions.map((session, idx) => {
                    const checkInTime = formatISTTime(session.check_in);
                    const checkOutTime = session.check_out ? formatISTTime(session.check_out) : "Active Session";
                    const sessionHours = getSessionHours(session);
                    const sessionDuration = formatWorkingTime(sessionHours);
                    
                    return (
                      <div key={session.id} className="space-y-3">
                        {/* Check In Node */}
                        <div className="relative">
                          <div className="absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#0B1528] shadow-md shadow-emerald-500/40" />
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <span className="text-emerald-400 font-bold text-xs uppercase tracking-wide flex items-center gap-1.5">
                              ● Checked In
                            </span>
                            <span className="font-mono text-slate-350 text-xs">{checkInTime}</span>
                          </div>
                          <div className="text-sm font-semibold text-slate-200 mt-1">
                            📍 {session.site_name_snapshot || "Main Office"}
                          </div>
                        </div>

                        {/* Connection Arrow */}
                        <div className="text-slate-500 pl-1 font-mono text-sm leading-none flex items-center gap-2">
                          <span>↓</span>
                          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Verification: {session.face_verified ? "Face ID" : "GPS"}</span>
                        </div>

                        {/* Check Out Node */}
                        <div className="relative">
                          <div className="absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-[#0B1528] shadow-md shadow-blue-500/40" />
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <span className="text-blue-405 font-bold text-xs uppercase tracking-wide flex items-center gap-1.5">
                              ● {session.check_out ? "Checked Out" : "Active Session"}
                            </span>
                            <span className="font-mono text-slate-350 text-xs">{checkOutTime}</span>
                          </div>
                          <div className="text-sm font-semibold text-slate-200 mt-1">
                            📍 {session.site_name_snapshot || "Main Office"}
                          </div>
                        </div>

                        {/* Connection Arrow to working duration */}
                        <div className="text-slate-500 pl-1 font-mono text-sm leading-none">↓</div>

                        {/* Session Working Time */}
                        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/80 flex items-center justify-between">
                          <span className="text-slate-400 font-medium text-xs">Session Working Time</span>
                          <span className="font-mono text-emerald-400 font-extrabold text-sm">{sessionDuration}</span>
                        </div>

                        {idx < sessions.length - 1 && (
                          <div className="text-slate-500 pl-1 font-mono text-sm leading-none py-1">↓</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {sessions.length > 1 && (
                  <div className="bg-blue-500/5 rounded-xl p-3 border border-blue-500/10 flex items-center justify-between mt-3">
                    <span className="text-slate-300 font-bold text-xs">Total Working Time (Day)</span>
                    <span className="font-mono text-blue-400 font-black text-sm">{totalDayWorkingTime}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {/* Mobile view cards (< 768px) */}
          <div className="space-y-4 md:hidden no-print">
            {paginatedAttendance.map((record) => {
              const profile = profilesById.get(record.profile_id);
              const employeeName = getEmployeeName(record);
              const isExpanded = expandedRowId === record.id;
              const hours = getSessionHours(record);
              
              return (
                <div key={record.id} className="rounded-2xl border bg-[#13223D]/65 border-slate-800/80 p-4 transition-all">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-850 pb-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border border-slate-700 bg-slate-900"><AvatarFallback className="bg-blue-500/10 text-blue-300 font-bold">{initialsFor(employeeName)}</AvatarFallback></Avatar>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-100 text-sm truncate">{employeeName}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{profile?.employee_code || "No code"} · {formatDate(record.attendance_date)}</div>
                      </div>
                    </div>
                    {getStatusBadge(record.status)}
                  </div>
                  
                  <div className="mt-4 space-y-2.5 text-xs">
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-slate-500 font-medium">📍 Attendance Site</span>
                      <span className="text-right font-semibold text-slate-200">{record.site_name_snapshot || "Main Office"}</span>
                    </div>
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-slate-500 font-medium">Check In</span>
                      <div className="text-right">
                        <span className="font-mono font-bold text-slate-200">{formatISTTime(record.check_in)}</span>
                        <span className="block text-[9px] text-slate-500">{record.face_verified ? "Verified Face" : "GPS Verified"}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-slate-500 font-medium">Check Out</span>
                      <div className="text-right">
                        {record.check_out ? (
                          <>
                            <span className="font-mono font-bold text-slate-200">{formatISTTime(record.check_out)}</span>
                            <span className="block text-[9px] text-slate-500">GPS Verified</span>
                          </>
                        ) : (
                          <span className="text-emerald-450 font-bold text-[10px] uppercase tracking-wide">Active Session</span>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center gap-3 border-t border-slate-800/40 pt-2.5">
                      <span className="text-slate-450 font-bold">Working Time</span>
                      <span className="font-mono text-emerald-400 font-black text-sm">{formatWorkingTime(hours)}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-1 flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => toggleRow(record.id)}
                      className="w-full border-slate-700 text-blue-400 hover:bg-slate-800 text-xs font-bold h-9"
                    >
                      {isExpanded ? "Hide Details" : "View Details"}
                    </Button>
                  </div>

                  {isExpanded && renderDetailsBlock(record)}
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (>= 768px) */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-850 md:block">
            <div className="max-h-[68vh] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-[#13223D] shadow-sm">
                  <TableRow className="border-slate-800 hover:bg-[#13223D]">
                    {isAdmin ? (
                      <TableHead className="min-w-[240px] text-slate-300">Employee</TableHead>
                    ) : (
                      <TableHead className="min-w-[130px] text-slate-300">Date</TableHead>
                    )}
                    <TableHead className="min-w-[160px] text-slate-300">Attendance Site</TableHead>
                    <TableHead className="text-slate-300">Check In</TableHead>
                    <TableHead className="text-slate-300">Check Out</TableHead>
                    <TableHead className="text-slate-300">Working Time</TableHead>
                    <TableHead className="text-slate-300">Status</TableHead>
                    <TableHead className="text-right text-slate-300 no-print">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedAttendance.map((record) => {
                    const profile = profilesById.get(record.profile_id);
                    const employeeName = getEmployeeName(record);
                    const isExpanded = expandedRowId === record.id;
                    const hours = getSessionHours(record);
                    
                    return (
                      <optgroup key={record.id} label="" className="contents">
                        <TableRow className={`border-slate-800/70 hover:bg-[#13223D]/60 transition-colors cursor-pointer`} onClick={() => toggleRow(record.id)}>
                          {isAdmin ? (
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9 border border-slate-700 bg-slate-900"><AvatarFallback className="bg-blue-500/10 text-blue-300 text-xs font-bold">{initialsFor(employeeName)}</AvatarFallback></Avatar>
                                <div>
                                  <div className="font-semibold text-slate-100">{employeeName}</div>
                                  <div className="text-xs text-slate-500 font-mono">{profile?.employee_code || "No code"} · {formatDate(record.attendance_date)}</div>
                                </div>
                              </div>
                            </TableCell>
                          ) : (
                            <TableCell className="font-semibold text-slate-200">
                              <div className="flex items-center gap-2">
                                <CalendarDays className="w-4 h-4 text-blue-400" />
                                {formatDate(record.attendance_date)}
                              </div>
                            </TableCell>
                          )}
                          <TableCell className="text-slate-200">
                            <span className="block font-semibold text-sm">📍 {record.site_name_snapshot || "Main Office"}</span>
                            <span className="text-[10px] text-slate-500 font-medium block mt-0.5">{getSiteSub(record.site_name_snapshot)}</span>
                          </TableCell>
                          <TableCell>
                            <div className="font-mono text-slate-200 font-bold">{formatISTTime(record.check_in)}</div>
                            <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                              {record.face_verified ? "Verified Face" : "GPS Verified"}
                            </div>
                          </TableCell>
                          <TableCell>
                            {record.check_out ? (
                              <>
                                <div className="font-mono text-slate-200 font-bold">{formatISTTime(record.check_out)}</div>
                                <div className="text-[10px] text-slate-500 font-medium mt-0.5">GPS Verified</div>
                              </>
                            ) : (
                              <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] animate-pulse">
                                Active Session
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-slate-100 font-bold">{formatWorkingTime(hours)}</TableCell>
                          <TableCell>{getStatusBadge(record.status)}</TableCell>
                          <TableCell className="text-right no-print" onClick={(e) => e.stopPropagation()}>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => toggleRow(record.id)}
                              className="h-8 border-slate-700 hover:bg-slate-800 text-xs px-2.5 text-blue-400 font-semibold"
                            >
                              {isExpanded ? "Hide Details" : "View Details"}
                            </Button>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Disclosure Details Row */}
                        {isExpanded && (
                          <TableRow className="bg-slate-950/40 border-slate-800 hover:bg-slate-950/50">
                            <TableCell colSpan={isAdmin ? 7 : 7} className="p-4">
                              {renderDetailsBlock(record)}
                            </TableCell>
                          </TableRow>
                        )}
                      </optgroup>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#13223D]/40 p-3 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between no-print">
            <span>Page {currentPage} of {pageCount} · {filteredAttendance.length} records</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} className="border-slate-700 text-slate-300 hover:bg-slate-800 h-9 text-xs font-semibold">
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <Button type="button" variant="outline" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount} className="border-slate-700 text-slate-300 hover:bg-slate-800 h-9 text-xs font-semibold">
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
