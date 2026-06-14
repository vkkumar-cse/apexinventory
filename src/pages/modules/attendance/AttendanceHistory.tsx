import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, CheckCircle2, Clock, Loader2, MapPin, Trash2 } from "lucide-react";
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

const getStatusBadge = (status: string | null) => {
  const statusValue = (status || "present").toLowerCase();

  if (statusValue === "present") {
    return <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">Present</Badge>;
  }

  if (statusValue === "open") {
    return <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs">Open</Badge>;
  }

  if (statusValue === "completed") {
    return <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">Completed</Badge>;
  }

  if (statusValue === "late") {
    return <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs">Late</Badge>;
  }

  if (statusValue === "half-day") {
    return <Badge className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs">Half Day</Badge>;
  }

  return <Badge className="bg-slate-800 text-slate-300 border border-slate-700 text-xs">{status || "Present"}</Badge>;
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

  const profilesById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);

  const getProfileLabel = (profile: ProfileLite) =>
    [profile.full_name || profile.display_name || profile.email || "Unknown Employee", profile.employee_code]
      .filter(Boolean)
      .join(" - ");

  const getSessionHours = (record: AttendanceRecord) => {
    if (!record.check_in || !record.check_out) return null;
    const diffMs = new Date(record.check_out).getTime() - new Date(record.check_in).getTime();
    return Number(Math.max(0, diffMs / (1000 * 60 * 60)).toFixed(2));
  };

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
          ? supabase
            .from("profiles" as any)
            .select("id, employee_code, full_name, display_name, email")
            .in("id", profileIds)
          : Promise.resolve({ data: [], error: null }),
        isAdmin
          ? supabase
            .from("profiles" as any)
            .select("id, employee_code, full_name, display_name, email")
            .eq("status", "approved")
            .order("full_name", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        (supabase as any)
          .from("attendance_sites")
          .select("id, site_name")
          .order("site_name", { ascending: true }),
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

  const deleteAttendanceRecord = async (recordId: string) => {
    const { error } = await supabase
      .from("attendance_sessions" as any)
      .delete()
      .eq("id", recordId);

    if (error) throw error;
  };

  // DEVELOPMENT ONLY - Remove delete functionality before production deployment
  const deleteAttendance = async (recordId: string) => {
    if (!isAdmin) return;

    setDeletingId(recordId);
    try {
      await deleteAttendanceRecord(recordId);
      toast.success("Attendance record deleted.");
      await loadAttendance();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete attendance record");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    document.title = "Attendance History · Apex Software";
    loadAttendance();
  }, [isAdmin, user?.id, employeeFilter, siteFilter, dateFrom, dateTo]);

  return (
    <div className="p-4 md:p-8 space-y-6 text-white min-h-[calc(100vh-100px)] bg-[#0B1528] rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-8 w-8 text-blue-500" />
            Attendance History
          </h1>
          <p className="text-slate-400 mt-1">
            {isAdmin ? "Review all attendance sessions across employees and sites." : "Review your attendance sessions and timesheets."}
          </p>
        </div>
        <Badge className={isAdmin ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "bg-slate-800 text-slate-300 border border-slate-700"}>
          {isAdmin ? "Admin View" : "Worker View"}
        </Badge>
      </div>

      <div className="relative z-10 grid gap-3 rounded-2xl border border-slate-800/80 bg-[#13223D]/40 p-4 md:grid-cols-4">
        {isAdmin && (
          <select
            value={employeeFilter}
            onChange={(event) => setEmployeeFilter(event.target.value)}
            className="h-10 rounded-md border border-slate-700 bg-[#0B1528] px-3 text-sm text-slate-200"
          >
            <option value="all">All employees</option>
            {allProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{getProfileLabel(profile)}</option>
            ))}
          </select>
        )}
        <select
          value={siteFilter}
          onChange={(event) => setSiteFilter(event.target.value)}
          className="h-10 rounded-md border border-slate-700 bg-[#0B1528] px-3 text-sm text-slate-200"
        >
          <option value="all">All sites</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>{site.site_name}</option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
          className="h-10 rounded-md border border-slate-700 bg-[#0B1528] px-3 text-sm text-slate-200"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
          className="h-10 rounded-md border border-slate-700 bg-[#0B1528] px-3 text-sm text-slate-200"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setEmployeeFilter("all");
            setSiteFilter("all");
            setDateFrom("");
            setDateTo("");
          }}
          className="border-slate-700 text-slate-300 hover:bg-slate-800 md:col-span-4"
        >
          Clear Filters
        </Button>
      </div>

      <div className="relative z-10 bg-[#13223D]/40 border border-slate-800/80 rounded-2xl p-6 shadow-2xl backdrop-blur-sm">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : attendance.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl bg-[#0B1528]/40">
            <Clock className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">No attendance records found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800/80">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800 bg-[#0B1528]/80 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-4 px-4 font-medium">Employee</th>
                  <th className="py-4 px-4 font-medium">Date</th>
                  <th className="py-4 px-4 font-medium">Site</th>
                  <th className="py-4 px-4 font-medium">Check In</th>
                  <th className="py-4 px-4 font-medium">Check Out</th>
                  <th className="py-4 px-4 font-medium">Hours</th>
                  <th className="py-4 px-4 font-medium">Status</th>
                  <th className="py-4 px-4 font-medium text-center">Verification</th>
                  {isAdmin && <th className="py-4 px-4 font-medium text-right">Delete</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {attendance.map((record) => {
                  const profile = profilesById.get(record.profile_id);
                  const employeeName = profile?.full_name || profile?.display_name || profile?.email || "Unknown Employee";
                  const employeeCode = profile?.employee_code || "";
                  const sessionHours = getSessionHours(record);

                  return (
                    <tr key={record.id} className="hover:bg-[#13223D]/40 transition-all duration-150 text-sm">
                      <td className="py-4 px-4 font-medium text-white">
                        <div className="flex flex-col">
                          <span className="font-semibold">{employeeName}</span>
                          {employeeCode && <span className="text-[11px] text-slate-500 font-mono mt-0.5">{employeeCode}</span>}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-slate-300 font-medium">{formatDate(record.attendance_date)}</td>
                      <td className="py-4 px-4 text-slate-300 font-medium">{record.site_name_snapshot || "-"}</td>
                      <td className="py-4 px-4 text-slate-300 font-mono">{formatISTTime(record.check_in)}</td>
                      <td className="py-4 px-4 text-slate-300 font-mono">{formatISTTime(record.check_out)}</td>
                      <td className="py-4 px-4 text-slate-300 font-mono">
                        {sessionHours !== null ? formatDurationHours(sessionHours) : "-"}
                      </td>
                      <td className="py-4 px-4">{getStatusBadge(record.status)}</td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border ${
                            record.face_verified
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                              : "bg-slate-800/60 border-slate-700/50 text-slate-500"
                          }`}>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {record.face_verified ? `Face ${record.face_match_score !== null && record.face_match_score !== undefined ? Math.round(record.face_match_score * 100) + "%" : "Verified"}` : "Face Pending"}
                          </span>
                          {record.check_in_latitude !== null && record.check_in_longitude !== null && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500">
                              <MapPin className="w-3 h-3 text-blue-500" />
                              {record.check_in_latitude.toFixed(4)}, {record.check_in_longitude.toFixed(4)}
                            </span>
                          )}
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="py-4 px-4 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteAttendance(record.id)}
                            disabled={deletingId === record.id}
                            className="text-red-400 hover:text-white hover:bg-red-500/20"
                            title="Delete attendance record"
                          >
                            {deletingId === record.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
