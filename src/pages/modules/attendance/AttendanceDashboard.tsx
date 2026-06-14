
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { formatDurationHours } from "@/lib/formatDuration";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useNavigate } from "react-router-dom";
import { 
  Users, 
  UserCheck, 
  UserX, 
  Clock, 
  Hourglass, 
  CalendarDays, 
  MapPin, 
  DollarSign, 
  ArrowRight,
  TrendingUp,
  History,
  Coins,
  Loader2
} from "lucide-react";

type SummaryStats = {
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  leave: number;
  total: number;
  activeSessions: number;
};

type RecentCheckIn = {
  id: string;
  profile_id: string;
  name: string;
  code: string;
  time: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  face_verified: boolean | null;
  face_match_score: number | null;
  site_name_snapshot: string | null;
};

type ProfileLite = {
  id: string;
  employee_code: string | null;
  full_name: string | null;
  status: string | null;
  is_active: boolean | null;
};

type AttendanceRecord = {
  id: string;
  employee_id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  status: string | null;
  latitude: number | null;
  longitude: number | null;
  face_verified: boolean | null;
  face_match_score: number | null;
  site_id: string | null;
  site_name_snapshot: string | null;
};

type AttendanceSession = {
  id: string;
  profile_id: string;
  attendance_date: string;
  site_id: string | null;
  site_name_snapshot: string;
  check_in: string;
  check_out: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  check_out_latitude: number | null;
  check_out_longitude: number | null;
  face_verified: boolean | null;
  face_match_score: number | null;
  status: string | null;
};

type WorkerAttendanceSite = {
  id: string;
  site_name: string;
  radius_meters: number;
  is_active: boolean;
  is_default: boolean;
};

type DashboardRow = AttendanceSession & {
  profile?: ProfileLite | null;
};

type WorkerTodayAttendance = Pick<AttendanceRecord, "check_in" | "check_out" | "status" | "face_verified" | "face_match_score" | "site_name_snapshot">;

type WorkerMonthlyAttendance = {
  status: string | null;
  working_hours: number | string | null;
};

export default function AttendanceDashboard() {
  const { role, user } = useAuth();
  const isAdmin = role === "admin";
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [stats, setStats] = useState<SummaryStats>({ present: 0, absent: 0, late: 0, halfDay: 0, leave: 0, total: 0, activeSessions: 0 });
  const [recentCheckIns, setRecentCheckIns] = useState<RecentCheckIn[]>([]);
  const [siteSummary, setSiteSummary] = useState<{ siteName: string; employeesPresent: number; totalHours: number; activeSessions: number }[]>([]);
  const [workerTodaySessions, setWorkerTodaySessions] = useState<AttendanceSession[]>([]);
  const [workerAssignedSites, setWorkerAssignedSites] = useState<WorkerAttendanceSite[]>([]);
  
  // Worker-specific dashboard states
  const [workerTodayStatus, setWorkerTodayStatus] = useState<{
    checkedIn: boolean;
    checkInTime: string | null;
    checkedOut: boolean;
    checkOutTime: string | null;
    status: string | null;
    faceVerified: boolean;
    faceMatchScore: number | null;
    siteName: string | null;
  }>({
    checkedIn: false,
    checkInTime: null,
    checkedOut: false,
    checkOutTime: null,
    status: null,
    faceVerified: false,
    faceMatchScore: null,
    siteName: null,
  });
  const [workerSummary, setWorkerSummary] = useState({
    presentDays: 0,
    lateDays: 0,
    halfDays: 0,
    totalWorkingHours: 0,
  });
  const [payrollSummary, setPayrollSummary] = useState({
    generatedRows: 0,
    totalPayable: 0,
    myPayable: 0,
  });

  const getTodayDateString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  };

  useEffect(() => {
    document.title = "Attendance Dashboard · Apex Software";
    loadDashboardData();
  }, [role, user?.id]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  const getSessionHours = (session: AttendanceSession) => {
    if (!session.check_out) return 0;
    const diffMs = new Date(session.check_out).getTime() - new Date(session.check_in).getTime();
    return Math.max(0, diffMs / (1000 * 60 * 60));
  };

  const formatHours = formatDurationHours;

  const formatTime = (time: string | null) =>
    time ? new Date(time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "-";

  const workerCompletedSessions = workerTodaySessions.filter((session) => Boolean(session.check_out));
  const workerActiveSession = workerTodaySessions.find((session) => !session.check_out && session.status === "open") ?? null;
  const workerLastCompletedSession = workerCompletedSessions[workerCompletedSessions.length - 1] ?? null;
  const workerTodayTotalHours = workerCompletedSessions.reduce((total, session) => total + getSessionHours(session), 0);
  const workerActiveDuration = workerActiveSession
    ? Math.max(0, (now.getTime() - new Date(workerActiveSession.check_in).getTime()) / (1000 * 60 * 60))
    : 0;

  async function loadDashboardData() {
    setLoading(true);
    try {
      const today = getTodayDateString();
      const payrollMonth = `${today.slice(0, 7)}-01`;

      if (isAdmin) {
        // --- ADMIN DASHBOARD DATA ---
        // Fetch active profiles and merge attendance in TypeScript.
        const { data: profilesRaw, error: profileErr } = await supabase
          .from("profiles" as any)
          .select("id, full_name, display_name, status, is_active, employee_code");
        
        if (profileErr) throw profileErr;
        const profiles = (profilesRaw ?? []).map((profile: any): ProfileLite => ({
          id: profile.id,
          employee_code: profile.employee_code ?? null,
          full_name: profile.full_name ?? profile.display_name ?? null,
          status: profile.status ?? null,
          is_active: profile.is_active ?? true,
        }));

        const activeProfiles = profiles.filter((profile) => profile.status === "approved" && profile.is_active !== false);
        const totalActiveCount = activeProfiles.length;

        // Fetch today's check-ins — cast to any[] to bypass broken schema types
        const [{ data: dailyRaw, error: attErr }, { data: sessionsRaw, error: sessionsError }] = await Promise.all([
          supabase
            .from("attendance" as any)
            .select("id, employee_id, attendance_date, check_in, check_out, status, latitude, longitude, face_verified, face_match_score, site_id, site_name_snapshot")
            .eq("attendance_date", today),
          (supabase as any)
            .from("attendance_sessions")
            .select("id, profile_id, attendance_date, site_id, site_name_snapshot, check_in, check_out, check_in_latitude, check_in_longitude, check_out_latitude, check_out_longitude, face_verified, face_match_score, status")
            .eq("attendance_date", today)
            .order("check_in", { ascending: false }),
        ]);
        
        if (attErr) throw attErr;
        if (sessionsError) throw sessionsError;
        const dailyRows = (dailyRaw ?? []) as unknown as AttendanceRecord[];
        const sessions = (sessionsRaw ?? []) as unknown as AttendanceSession[];
        const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
        const dashboardRows: DashboardRow[] = sessions.map((session) => ({
          ...session,
          profile: profilesById.get(session.profile_id) ?? null,
        }));

        // Compute stats
        const completedEmployeeIds = new Set(sessions.filter((session) => Boolean(session.check_out)).map((session) => session.profile_id));
        const activeSessionCount = sessions.filter((session) => !session.check_out && session.status === "open").length;
        let late = 0;
        let halfDay = 0;
        let leave = 0; // Placeholder for leave

        dailyRows.forEach((c) => {
          const status = (c.status || "present").toLowerCase();
          if (status === "late") late++;
          else if (status === "half-day") halfDay++;
        });

        const present = completedEmployeeIds.size;
        const absent = Math.max(0, totalActiveCount - present - leave);

        setStats({
          present,
          absent,
          late,
          halfDay,
          leave,
          total: totalActiveCount,
          activeSessions: activeSessionCount,
        });

        // Format recent activity from profile-backed attendance rows.
        const recent: RecentCheckIn[] = dashboardRows.slice(0, 5).map((c) => {
          return {
            id: c.id,
            profile_id: c.profile_id,
            name: c.profile?.full_name || "Unknown Employee",
            code: c.profile?.employee_code || "",
            time: formatTime(c.check_in),
            status: c.status || "present",
            latitude: c.check_in_latitude,
            longitude: c.check_in_longitude,
            face_verified: c.face_verified,
            face_match_score: c.face_match_score,
            site_name_snapshot: c.site_name_snapshot ?? null,
          };
        });

        setRecentCheckIns(recent);
        const siteMap = dashboardRows.reduce<Record<string, { employeeIds: Set<string>; totalHours: number; activeSessions: number }>>((acc, row) => {
          const siteName = row.site_name_snapshot || "Main Office";
          acc[siteName] ??= { employeeIds: new Set<string>(), totalHours: 0, activeSessions: 0 };
          if (row.check_out) {
            acc[siteName].employeeIds.add(row.profile_id);
            acc[siteName].totalHours += getSessionHours(row);
          } else if (row.status === "open") {
            acc[siteName].activeSessions += 1;
          }
          return acc;
        }, {});
        setSiteSummary(Object.entries(siteMap).map(([siteName, value]) => ({
          siteName,
          employeesPresent: value.employeeIds.size,
          totalHours: Number(value.totalHours.toFixed(2)),
          activeSessions: value.activeSessions,
        })));

        const { data: payrollRaw } = await supabase
          .from("monthly_payroll" as any)
          .select("monthly_payable")
          .eq("payroll_month", payrollMonth);

        const payrollRows = (payrollRaw ?? []) as any[];
        setPayrollSummary({
          generatedRows: payrollRows.length,
          totalPayable: payrollRows.reduce((total, row) => total + Number(row.monthly_payable ?? 0), 0),
          myPayable: 0,
        });

      } else {
        // --- WORKER DASHBOARD DATA ---
        setWorkerTodayStatus({ checkedIn: false, checkInTime: null, checkedOut: false, checkOutTime: null, status: null, faceVerified: false, faceMatchScore: null, siteName: null });
        setWorkerSummary({ presentDays: 0, lateDays: 0, halfDays: 0, totalWorkingHours: 0 });
        setPayrollSummary({ generatedRows: 0, totalPayable: 0, myPayable: 0 });
        setWorkerTodaySessions([]);
        setWorkerAssignedSites([]);

        if (user?.id) {
          const profileId = user.id;
          const { data: assignmentsRaw, error: assignmentsError } = await (supabase as any)
            .from("employee_site_assignments")
            .select("attendance_sites(id,site_name,radius_meters,is_active,is_default)")
            .eq("profile_id", profileId);

          if (assignmentsError) throw assignmentsError;

          const assignedSites = ((assignmentsRaw ?? []) as any[])
            .map((row) => row.attendance_sites)
            .filter((site): site is WorkerAttendanceSite => Boolean(site?.id));

          if (assignedSites.length > 0) {
            setWorkerAssignedSites(assignedSites);
          } else {
            const { data: defaultSite, error: defaultSiteError } = await (supabase as any)
              .from("attendance_sites")
              .select("id,site_name,radius_meters,is_active,is_default")
              .eq("is_default", true)
              .maybeSingle();

            if (defaultSiteError) throw defaultSiteError;
            setWorkerAssignedSites(defaultSite ? [defaultSite as WorkerAttendanceSite] : []);
          }

          const { data: todaySessionsRaw, error: todaySessionsError } = await (supabase as any)
            .from("attendance_sessions")
            .select("id, profile_id, attendance_date, site_id, site_name_snapshot, check_in, check_out, check_in_latitude, check_in_longitude, check_out_latitude, check_out_longitude, face_verified, face_match_score, status")
            .eq("profile_id", profileId)
            .eq("attendance_date", today)
            .order("check_in", { ascending: true });

          if (todaySessionsError) throw todaySessionsError;
          setWorkerTodaySessions((todaySessionsRaw ?? []) as AttendanceSession[]);
          // Resolve worker employee record (UUID) — cast to any
            // Fetch today's attendance — cast to any
            const { data: todayRaw } = await supabase
              .from("attendance" as any)
              .select("check_in, check_out, status, face_verified, face_match_score, site_name_snapshot")
              .eq("employee_id", profileId)
              .eq("attendance_date", today)
              .maybeSingle();

            const todayRecords = todayRaw as unknown as WorkerTodayAttendance | null;

            if (todayRecords) {
              setWorkerTodayStatus({
                checkedIn: !!todayRecords.check_in,
                checkInTime: todayRecords.check_in ? new Date(todayRecords.check_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : null,
                checkedOut: !!todayRecords.check_out,
                checkOutTime: todayRecords.check_out ? new Date(todayRecords.check_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : null,
                status: todayRecords.status || "present",
                faceVerified: !!todayRecords.face_verified,
                faceMatchScore: todayRecords.face_match_score ?? null,
                siteName: todayRecords.site_name_snapshot ?? null,
              });
            }

            // Fetch attendance history for summary stats — cast to any[]
            const { data: monthlyRaw } = await supabase
              .from("attendance" as any)
              .select("status, working_hours")
              .eq("employee_id", profileId);

            const monthlyRecords = (monthlyRaw ?? []) as unknown as WorkerMonthlyAttendance[];

            if (monthlyRecords.length > 0) {
              let presentDays = 0;
              let lateDays = 0;
              let halfDays = 0;
              let hours = 0;

              monthlyRecords.forEach((r) => {
                const s = (r.status || "present").toLowerCase();
                if (s === "present") presentDays++;
                else if (s === "late") lateDays++;
                else if (s === "half-day") halfDays++;
                else if (s === "absent") return;

                if (r.working_hours) hours += Number(r.working_hours);
              });

              setWorkerSummary({
                presentDays,
                lateDays,
                halfDays,
                totalWorkingHours: Number(hours.toFixed(1))
              });
            }

            const { data: payrollRaw } = await supabase
              .from("monthly_payroll" as any)
              .select("monthly_payable")
              .eq("employee_id", profileId)
              .eq("payroll_month", payrollMonth)
              .maybeSingle();

            setPayrollSummary({
              generatedRows: payrollRaw ? 1 : 0,
              totalPayable: 0,
              myPayable: Number((payrollRaw as any)?.monthly_payable ?? 0),
            });
          }
      }
    } catch (e) {
      console.error("Error loading dashboard metrics:", e);
    } finally {
      setLoading(false);
    }
  }

  const getStatusBadge = (status: string | null) => {
    if (!status) return null;
    const s = status.toLowerCase();
    if (s === "present") return <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">Present</Badge>;
    if (s === "late") return <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs">Late Mark</Badge>;
    if (s === "half-day") return <Badge className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs">Half Day</Badge>;
    if (s === "absent") return <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs">Absent</Badge>;
    if (s === "open") return <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs">Open</Badge>;
    if (s === "completed") return <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">Completed</Badge>;
    return <Badge>{status}</Badge>;
  };

  const getFaceBadge = (verified: boolean | null, score?: number | null) => {
    if (!verified) return <Badge className="bg-slate-800 text-slate-400 border border-slate-700 text-xs">Face Pending</Badge>;
    return (
      <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">
        Face Verified{score !== null && score !== undefined ? ` ${Math.round(score * 100)}%` : ""}
      </Badge>
    );
  };

  const formatMoney = (value: number) =>
    `₹${Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 text-white min-h-[calc(100vh-100px)] bg-[#0B1528] rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <div className="flex justify-between items-center relative z-10 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Attendance Center</h1>
          <p className="text-slate-400 mt-1">
            {isAdmin ? "Centralized operations and worker tracking." : "Personal check-in and attendance hub."}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-xs flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-blue-400" />
          <span>Today: {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>
        </div>
      </div>

      {isAdmin ? (
        // ==========================================
        //         ADMIN DASHBOARD VIEW
        // ==========================================
        <div className="space-y-6 relative z-10">
          {/* Metrics summary */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <Card className="bg-slate-900/60 border-slate-800 text-white">
              <CardHeader className="p-4 pb-2">
                <CardDescription className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Today Present</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 flex justify-between items-end">
                <span className="text-3xl font-extrabold text-emerald-400">{stats.present}</span>
                <UserCheck className="h-5 w-5 text-emerald-500" />
              </CardContent>
            </Card>

            <Card className="bg-slate-900/60 border-slate-800 text-white">
              <CardHeader className="p-4 pb-2">
                <CardDescription className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Today Absent</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 flex justify-between items-end">
                <span className="text-3xl font-extrabold text-rose-450">{stats.absent}</span>
                <UserX className="h-5 w-5 text-rose-500" />
              </CardContent>
            </Card>

            <Card className="bg-slate-900/60 border-slate-800 text-white">
              <CardHeader className="p-4 pb-2">
                <CardDescription className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Late Count</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 flex justify-between items-end">
                <span className="text-3xl font-extrabold text-amber-400">{stats.late}</span>
                <Clock className="h-5 w-5 text-amber-500" />
              </CardContent>
            </Card>

            <Card className="bg-slate-900/60 border-slate-800 text-white">
              <CardHeader className="p-4 pb-2">
                <CardDescription className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Half-Days</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 flex justify-between items-end">
                <span className="text-3xl font-extrabold text-indigo-400">{stats.halfDay}</span>
                <Hourglass className="h-5 w-5 text-indigo-500" />
              </CardContent>
            </Card>

            <Card className="bg-slate-900/60 border-slate-800 text-white">
              <CardHeader className="p-4 pb-2">
                <CardDescription className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Active Sessions</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 flex justify-between items-end">
                <span className="text-3xl font-extrabold text-blue-400">{stats.activeSessions}</span>
                <Clock className="h-5 w-5 text-blue-500" />
              </CardContent>
            </Card>

            <Card className="bg-slate-900/60 border-slate-800 text-white">
              <CardHeader className="p-4 pb-2">
                <CardDescription className="text-xs text-slate-400 font-semibold uppercase tracking-wider">On Leave</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 flex justify-between items-end">
                <span className="text-3xl font-extrabold text-blue-400">{stats.leave}</span>
                <CalendarDays className="h-5 w-5 text-blue-500" />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Checkins */}
            <Card className="lg:col-span-2 bg-slate-900/50 border-slate-800 text-white shadow-xl">
              <CardHeader className="border-b border-slate-800/80 pb-4">
                <CardTitle className="text-md font-bold flex justify-between items-center">
                  <span>Recent Employee Check-ins</span>
                  <Link to="/attendance/history" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold">
                    View All <ArrowRight className="h-3 w-3" />
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {recentCheckIns.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">No activity today yet.</div>
                ) : (
                  <div className="divide-y divide-slate-800/60">
                    {recentCheckIns.map(c => (
                      <div key={c.id} className="py-3 flex justify-between items-center">
                        <div>
                          <div className="font-semibold text-slate-200">{c.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{c.code} | Checked in at {c.time}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Site: {c.site_name_snapshot || "Main Office"}</div>
                        <div className="mt-1">{getFaceBadge(c.face_verified, c.face_match_score)}</div>
                          {c.latitude && (
                            <div className="text-[10px] text-slate-550 flex items-center gap-0.5 mt-0.5">
                              <MapPin className="h-2.5 w-2.5 text-blue-400" />
                              {c.latitude.toFixed(4)}, {c.longitude?.toFixed(4)}
                            </div>
                          )}
                        </div>
                        <div>{getStatusBadge(c.status)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Placeholders side widgets */}
            <div className="space-y-6">
              {/* Site-wise Attendance */}
              <Card className="bg-slate-900/50 border-slate-800 text-white shadow-xl">
                <CardHeader className="pb-3 border-b border-slate-800/80">
                  <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-blue-400" />
                    Site-wise Attendance
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 text-xs text-slate-500 space-y-2">
                  {siteSummary.length === 0 ? (
                    <p className="text-center py-4">No site check-ins today.</p>
                  ) : siteSummary.map((site) => (
                    <div key={site.siteName} className="p-3 bg-[#0B1528] border border-slate-800 rounded-xl">
                      <span className="font-semibold text-slate-300 block">{site.siteName}</span>
                      <span className="text-[10px] text-slate-500 block">{site.employeesPresent} employees present</span>
                      <span className="text-[10px] text-slate-500 block">{formatHours(site.totalHours)} total</span>
                      <span className="text-[10px] text-blue-400 block">{site.activeSessions} active sessions</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Pending Leaves */}
              <Card className="bg-slate-900/50 border-slate-800 text-white shadow-xl">
                <CardHeader className="pb-3 border-b border-slate-800/80">
                  <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-indigo-400" />
                    Pending Leaves
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 text-center py-6 text-xs text-slate-500">
                  <p className="font-medium">No leave requests requiring approval</p>
                  <p className="text-[10px] text-slate-550 mt-1.5 italic">Future Feature: Leave requests lifecycle management</p>
                </CardContent>
              </Card>

              {/* Payroll Summary */}
              <Card className="bg-slate-900/50 border-slate-800 text-white shadow-xl">
                <CardHeader className="pb-3 border-b border-slate-800/80">
                  <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                    Payroll Overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 py-6 text-xs text-slate-400">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <span>Generated Rows</span>
                    <span className="font-bold text-slate-100">{payrollSummary.generatedRows}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span>Total Payable</span>
                    <span className="font-extrabold text-emerald-400">{formatMoney(payrollSummary.totalPayable)}</span>
                  </div>
                  <Button
                    onClick={() => navigate("/attendance/payroll")}
                    variant="outline"
                    className="w-full mt-4 border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    Open Payroll
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      ) : (
        // ==========================================
        //        WORKER DASHBOARD VIEW
        // ==========================================
        <div className="space-y-6 relative z-10">
          <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Check In Action Card */}
                <Card className="bg-slate-900/50 border-slate-800 text-white shadow-xl flex flex-col justify-between p-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-4">
                      <Clock className="w-5 h-5 text-blue-400" />
                      Daily Clock Portal
                    </h3>

                    <div className="space-y-3 my-4">
                      <div className="flex justify-between py-2 border-b border-slate-800">
                        <span className="text-slate-400 text-sm">Status:</span>
                        <span className="font-medium">
                          {workerActiveSession
                            ? <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs">Checked In</Badge>
                            : workerTodayStatus.checkedIn
                              ? getStatusBadge(workerTodayStatus.status)
                              : <Badge variant="secondary" className="text-xs bg-slate-850">Not checked in today</Badge>}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-800">
                        <span className="text-slate-400 text-sm">Today's Total:</span>
                        <span className="font-mono text-slate-100 text-sm font-bold">{formatHours(workerTodayTotalHours)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-800">
                        <span className="text-slate-400 text-sm">Face Verified:</span>
                        <span className="font-medium">{getFaceBadge(workerTodayStatus.faceVerified, workerTodayStatus.faceMatchScore)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-800">
                        <span className="text-slate-400 text-sm">Current Active Site:</span>
                        <span className="text-slate-200 text-sm">{workerActiveSession?.site_name_snapshot || "-"}</span>
                      </div>
                      <div className="flex justify-between py-2">
                        <span className="text-slate-400 text-sm">Running Duration:</span>
                        <span className="font-mono text-slate-200 text-sm">{workerActiveSession ? formatHours(workerActiveDuration) : "-"}</span>
                      </div>
                    </div>
                  </div>

                  <Button 
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold h-11 border border-blue-500/20 active:scale-[0.98] mt-4"
                    onClick={() => navigate("/attendance/checkin")}
                  >
                    Go to Check-in Portal
                  </Button>
                </Card>

                {/* My summary metrics */}
                <Card className="bg-slate-900/50 border-slate-800 text-white shadow-xl p-6">
                  <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-indigo-400" />
                    Month Summary
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-[#0B1528] border border-slate-850 rounded-xl text-center">
                      <span className="text-xs text-slate-450 block uppercase tracking-wider font-semibold">Present Days</span>
                      <span className="text-2xl font-extrabold text-emerald-400 mt-1 block">{workerSummary.presentDays}</span>
                    </div>

                    <div className="p-3 bg-[#0B1528] border border-slate-850 rounded-xl text-center">
                      <span className="text-xs text-slate-450 block uppercase tracking-wider font-semibold">Late Marks</span>
                      <span className="text-2xl font-extrabold text-amber-400 mt-1 block">{workerSummary.lateDays}</span>
                    </div>

                    <div className="p-3 bg-[#0B1528] border border-slate-850 rounded-xl text-center">
                      <span className="text-xs text-slate-450 block uppercase tracking-wider font-semibold">Half-Days</span>
                      <span className="text-2xl font-extrabold text-indigo-400 mt-1 block">{workerSummary.halfDays}</span>
                    </div>

                    <div className="p-3 bg-[#0B1528] border border-slate-850 rounded-xl text-center">
                      <span className="text-xs text-slate-450 block uppercase tracking-wider font-semibold">Work Hours</span>
                      <span className="text-xl font-mono font-extrabold text-slate-100 mt-1 block">{workerSummary.totalWorkingHours}h</span>
                    </div>
                  </div>
                </Card>

                {/* Assigned sites and session context */}
                <Card className="bg-slate-900/50 border-slate-800 text-white shadow-xl p-6 flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-4">
                      <MapPin className="w-5 h-5 text-emerald-450" />
                      Assigned Sites
                    </h3>

                    <div className="space-y-2 my-4">
                      {workerAssignedSites.length === 0 ? (
                        <div className="p-3 bg-[#0B1528] border border-slate-850 rounded-xl text-sm text-slate-500">
                          No attendance sites available.
                        </div>
                      ) : workerAssignedSites.map((site) => (
                        <div key={site.id} className="p-3 bg-[#0B1528] border border-slate-850 rounded-xl">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-100">{site.site_name}{site.is_default ? " (Default)" : ""}</span>
                            <Badge className={site.is_active ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]" : "bg-slate-800 text-slate-400 border border-slate-700 text-[10px]"}>
                              {site.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">Radius: {site.radius_meters}m</div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2 rounded-xl border border-slate-850 bg-[#0B1528]/60 p-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">Status</span>
                        <span className="text-slate-200">{workerActiveSession ? "Checked in" : workerTodayStatus.checkedIn ? workerTodayStatus.status || "Completed" : "Not checked in today"}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">Current Active Site</span>
                        <span className="text-slate-200">{workerActiveSession?.site_name_snapshot || "-"}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">Check-In Time</span>
                        <span className="font-mono text-slate-200">{workerActiveSession ? formatTime(workerActiveSession.check_in) : "-"}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">Running Duration</span>
                        <span className="font-mono text-slate-200">{workerActiveSession ? formatHours(workerActiveDuration) : "-"}</span>
                      </div>
                      <div className="flex justify-between gap-3 border-t border-slate-800 pt-2">
                        <span className="text-slate-400">Last Completed Session</span>
                        <span className="text-slate-200">{workerLastCompletedSession?.site_name_snapshot || "-"}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">Hours Worked</span>
                        <span className="font-mono text-slate-200">
                          {workerLastCompletedSession ? formatHours(getSessionHours(workerLastCompletedSession)) : "-"}
                        </span>
                      </div>
                      {workerLastCompletedSession && (
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-400">Validated Site</span>
                          <span className="text-slate-200">{workerLastCompletedSession.site_name_snapshot}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </div>

              <Card className="bg-slate-900/50 border-slate-800 text-white shadow-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                    <History className="w-5 h-5 text-blue-400" />
                    Completed Sessions Today
                  </h3>
                  <span className="text-sm font-mono text-slate-300">Total: {formatHours(workerTodayTotalHours)}</span>
                </div>
                {workerCompletedSessions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-800 bg-[#0B1528]/60 p-6 text-center text-sm text-slate-500">
                    No completed sessions today.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/70 rounded-xl border border-slate-800 bg-[#0B1528]/60">
                    {workerCompletedSessions.map((session) => (
                      <div key={session.id} className="grid gap-2 p-4 text-sm md:grid-cols-[1.4fr_1fr_auto] md:items-center">
                        <div className="font-semibold text-slate-100">{session.site_name_snapshot}</div>
                        <div className="font-mono text-slate-300">
                          {formatTime(session.check_in)}{" -> "}{formatTime(session.check_out)}
                        </div>
                        <div className="font-mono font-bold text-emerald-400">{formatHours(getSessionHours(session))}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="bg-slate-900/50 border-slate-800 text-white shadow-xl p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                      <Coins className="w-5 h-5 text-emerald-400" />
                      Payroll Summary
                    </h3>
                    <p className="text-sm text-slate-400 mt-1">
                      {payrollSummary.generatedRows > 0 ? "Current month payroll generated." : "Current month payroll has not been generated yet."}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Monthly Payable</div>
                      <div className="text-2xl font-extrabold text-emerald-400">{formatMoney(payrollSummary.myPayable)}</div>
                    </div>
                    <Button
                      onClick={() => navigate("/attendance/payroll")}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    >
                      View Payroll
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Shortcut buttons section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                <Card className="bg-slate-900/40 border-slate-800 hover:border-slate-700 transition-all p-4 cursor-pointer flex justify-between items-center group" onClick={() => navigate("/attendance/history")}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-800 rounded-lg text-indigo-400 group-hover:bg-indigo-500/10 transition-colors">
                      <History className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-200">My Attendance History</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">Logs and timesheets details</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-500 group-hover:translate-x-1 transition-transform" />
                </Card>

                <Card className="bg-slate-900/40 border-slate-800 hover:border-slate-700 transition-all p-4 cursor-pointer flex justify-between items-center group" onClick={() => navigate("/attendance/leaves")}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-800 rounded-lg text-blue-400 group-hover:bg-blue-500/10 transition-colors">
                      <CalendarDays className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-200">My Leave Requests</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">File leave, view status shortcuts</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-500 group-hover:translate-x-1 transition-transform" />
                </Card>

                <Card className="bg-slate-900/40 border-slate-800 hover:border-slate-700 transition-all p-4 cursor-pointer flex justify-between items-center group" onClick={() => navigate("/attendance/payroll")}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-800 rounded-lg text-emerald-400 group-hover:bg-emerald-500/10 transition-colors">
                      <Coins className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-200">My Payroll Details</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">Salary summary & payslip projections</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-500 group-hover:translate-x-1 transition-transform" />
                </Card>
              </div>
          </>
        </div>
      )}
    </div>
  );
}
