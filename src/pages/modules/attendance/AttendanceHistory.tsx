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
} from "lucide-react";
import { formatDurationHours } from "@/lib/formatDuration";

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

const csvEscape = (value: string | number | null | undefined) => `"${String(value ?? "").replace(/"/g, '""')}"`;

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
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

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

  const exportCsv = () => {
    const headers = ["Employee", "Employee Code", "Date", "Site", "Working Hours", "Check-in", "Check-out", "GPS Distance", "Device Used", "Attendance Status", "Verification Status", "Face Match %"];
    const rows = filteredAttendance.map((record) => {
      const profile = profilesById.get(record.profile_id);
      return [
        getEmployeeName(record),
        profile?.employee_code ?? "",
        formatDate(record.attendance_date),
        record.site_name_snapshot || "-",
        formatDurationHours(getSessionHours(record)),
        formatISTTime(record.check_in),
        formatISTTime(record.check_out),
        getGpsDistance(record),
        "Browser",
        record.status || "present",
        record.face_verified ? "Verified" : "Pending",
        record.face_match_score !== null && record.face_match_score !== undefined ? Math.round(record.face_match_score * 100) : "",
      ];
    });

    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance-history-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    document.title = "Attendance History - Apex Software";
    loadAttendance();
  }, [isAdmin, user?.id, employeeFilter, siteFilter, dateFrom, dateTo]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, employeeFilter, siteFilter, dateFrom, dateTo]);

  const renderVerification = (record: AttendanceRecord) => (
    <div className="flex flex-col gap-1">
      <Badge className={`w-fit border text-xs ${record.face_verified ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-slate-800 text-slate-400 border-slate-700"}`}>
        <ShieldCheck className="mr-1 h-3 w-3" />
        {record.face_verified ? "Verified" : "Pending"}
      </Badge>
      <span className="text-xs text-slate-500">
        Face Match: {record.face_match_score !== null && record.face_match_score !== undefined ? `${Math.round(record.face_match_score * 100)}%` : "-"}
      </span>
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-100px)] space-y-5 rounded-2xl border border-slate-800 bg-[#0B1528] p-4 text-white shadow-2xl md:p-6">
      <div className="flex flex-col gap-4 border-b border-slate-800/80 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight md:text-3xl">
            <CalendarDays className="h-7 w-7 text-blue-500" />
            Attendance History
          </h1>
          <p className="mt-1 text-sm text-slate-400">{filteredAttendance.length} records shown</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={exportCsv} className="border-slate-700 text-slate-300 hover:bg-slate-800">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button type="button" variant="outline" onClick={() => window.print()} className="border-slate-700 text-slate-300 hover:bg-slate-800">
            <FileText className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-800 bg-[#13223D]/50 p-3 md:grid-cols-2 lg:grid-cols-6">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search employee, site, status" className="border-slate-700 bg-[#0B1528] pl-9 text-slate-100" />
        </div>
        {isAdmin && (
          <select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)} className="h-10 rounded-md border border-slate-700 bg-[#0B1528] px-3 text-sm text-slate-200">
            <option value="all">All employees</option>
            {allProfiles.map((profile) => <option key={profile.id} value={profile.id}>{getProfileLabel(profile)}</option>)}
          </select>
        )}
        <select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)} className="h-10 rounded-md border border-slate-700 bg-[#0B1528] px-3 text-sm text-slate-200">
          <option value="all">All sites</option>
          {sites.map((site) => <option key={site.id} value={site.id}>{site.site_name}</option>)}
        </select>
        <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="border-slate-700 bg-[#0B1528] text-slate-200" />
        <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="border-slate-700 bg-[#0B1528] text-slate-200" />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
      ) : filteredAttendance.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 bg-[#13223D]/40 py-16 text-center text-slate-400">
          <Clock className="mx-auto mb-3 h-10 w-10 text-slate-600" />
          No attendance records found.
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {paginatedAttendance.map((record) => {
              const profile = profilesById.get(record.profile_id);
              const employeeName = getEmployeeName(record);
              return (
                <div key={record.id} className="rounded-xl border border-slate-800 bg-[#13223D]/60 p-4">
                  <div className="flex items-start gap-3">
                    <Avatar><AvatarFallback className="bg-blue-500/10 text-blue-300">{initialsFor(employeeName)}</AvatarFallback></Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-100">{employeeName}</div>
                      <div className="text-xs text-slate-500">{profile?.employee_code || "No code"}</div>
                    </div>
                    {getStatusBadge(record.status)}
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-slate-300">
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Site</span><span className="text-right">{record.site_name_snapshot || "-"}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Working Hours</span><span className="font-mono">{formatDurationHours(getSessionHours(record))}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Check-in</span><span className="font-mono">{formatISTTime(record.check_in)}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Check-out</span><span className="font-mono">{formatISTTime(record.check_out)}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">GPS Distance</span><span>{getGpsDistance(record)}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Device Used</span><span>Browser</span></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Verification</span><span>{record.face_verified ? "Verified" : "Pending"}</span></div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-slate-800 md:block">
            <div className="max-h-[68vh] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-[#13223D] shadow-sm">
                  <TableRow className="border-slate-800 hover:bg-[#13223D]">
                    <TableHead className="min-w-[240px] text-slate-300">Employee</TableHead>
                    <TableHead className="min-w-[130px] text-slate-300">Site</TableHead>
                    <TableHead className="text-slate-300">Working Hours</TableHead>
                    <TableHead className="text-slate-300">Check-in</TableHead>
                    <TableHead className="text-slate-300">Check-out</TableHead>
                    <TableHead className="text-slate-300">GPS Distance</TableHead>
                    <TableHead className="text-slate-300">Device Used</TableHead>
                    <TableHead className="text-slate-300">Attendance Status</TableHead>
                    <TableHead className="min-w-[150px] text-slate-300">Verification Status</TableHead>
                    {isAdmin && <TableHead className="text-right text-slate-300">Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedAttendance.map((record) => {
                    const profile = profilesById.get(record.profile_id);
                    const employeeName = getEmployeeName(record);
                    return (
                      <TableRow key={record.id} className="border-slate-800/70 hover:bg-[#13223D]/60">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar><AvatarFallback className="bg-blue-500/10 text-blue-300">{initialsFor(employeeName)}</AvatarFallback></Avatar>
                            <div>
                              <div className="font-semibold text-slate-100">{employeeName}</div>
                              <div className="text-xs text-slate-500">{profile?.employee_code || "No code"} · {formatDate(record.attendance_date)}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-300"><MapPin className="mr-1 inline h-3.5 w-3.5 text-blue-400" />{record.site_name_snapshot || "-"}</TableCell>
                        <TableCell className="font-mono text-slate-100">{formatDurationHours(getSessionHours(record))}</TableCell>
                        <TableCell className="font-mono text-slate-300">{formatISTTime(record.check_in)}</TableCell>
                        <TableCell className="font-mono text-slate-300">{formatISTTime(record.check_out)}</TableCell>
                        <TableCell className="font-mono text-slate-300">{getGpsDistance(record)}</TableCell>
                        <TableCell className="text-slate-300">Browser</TableCell>
                        <TableCell>{getStatusBadge(record.status)}</TableCell>
                        <TableCell>{renderVerification(record)}</TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <Button type="button" variant="ghost" size="icon" onClick={() => deleteAttendance(record.id)} disabled={deletingId === record.id} className="text-red-400 hover:bg-red-500/20 hover:text-white">
                              {deletingId === record.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#13223D]/40 p-3 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
            <span>Page {currentPage} of {pageCount} · {filteredAttendance.length} records</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <Button type="button" variant="outline" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount} className="border-slate-700 text-slate-300 hover:bg-slate-800">
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
