import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { formatDurationHours } from "@/lib/formatDuration";

type AttendanceSite = {
  id: string;
  site_name: string;
};

type AttendanceSession = {
  id: string;
  profile_id: string;
  attendance_date: string;
  site_id: string | null;
  site_name_snapshot: string;
  check_in: string;
  check_out: string | null;
  status: string | null;
};

const todayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const monthStartString = () => `${todayString().slice(0, 7)}-01`;

const getSessionHours = (session: AttendanceSession) => {
  if (!session.check_out) return 0;
  const diffMs = new Date(session.check_out).getTime() - new Date(session.check_in).getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60));
};

const formatHours = formatDurationHours;

export default function AttendanceReports() {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [sites, setSites] = useState<AttendanceSite[]>([]);
  const [siteFilter, setSiteFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState(monthStartString());
  const [dateTo, setDateTo] = useState(todayString());

  const loadReport = async () => {
    setLoading(true);
    try {
      const query = (supabase as any)
        .from("attendance_sessions")
        .select("id, profile_id, attendance_date, site_id, site_name_snapshot, check_in, check_out, status")
        .gte("attendance_date", dateFrom)
        .lte("attendance_date", dateTo)
        .order("attendance_date", { ascending: false });

      if (siteFilter !== "all") query.eq("site_id", siteFilter);

      const [{ data: sessionRows, error: sessionError }, { data: siteRows, error: siteError }] = await Promise.all([
        query,
        (supabase as any).from("attendance_sites").select("id, site_name").order("site_name", { ascending: true }),
      ]);

      if (sessionError) throw sessionError;
      if (siteError) throw siteError;

      setSessions((sessionRows ?? []) as AttendanceSession[]);
      setSites((siteRows ?? []) as AttendanceSite[]);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load attendance report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = "Attendance Reports - Apex Attendance";
    loadReport();
  }, [siteFilter, dateFrom, dateTo]);

  const siteRows = useMemo(() => {
    const map = new Map<string, { siteName: string; employees: Set<string>; totalHours: number; completedSessions: number; activeSessions: number }>();

    sessions.forEach((session) => {
      const key = session.site_id ?? session.site_name_snapshot;
      const current = map.get(key) ?? {
        siteName: session.site_name_snapshot || "Unknown Site",
        employees: new Set<string>(),
        totalHours: 0,
        completedSessions: 0,
        activeSessions: 0,
      };

      if (session.check_out) {
        current.employees.add(session.profile_id);
        current.completedSessions += 1;
        current.totalHours += getSessionHours(session);
      } else if (session.status === "open") {
        current.activeSessions += 1;
      }

      map.set(key, current);
    });

    return Array.from(map.values()).map((row) => ({
      siteName: row.siteName,
      employeesPresent: row.employees.size,
      totalHours: Number(row.totalHours.toFixed(2)),
      completedSessions: row.completedSessions,
      activeSessions: row.activeSessions,
    }));
  }, [sessions]);

  const totalHours = siteRows.reduce((total, row) => total + row.totalHours, 0);
  const totalActive = siteRows.reduce((total, row) => total + row.activeSessions, 0);

  return (
    <div className="p-4 md:p-8 space-y-6 text-white min-h-[calc(100vh-100px)] bg-[#0B1528] rounded-2xl border border-slate-800 shadow-2xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-8 w-8 text-blue-500" />
            Attendance Reports
          </h1>
          <p className="text-slate-400 mt-1">Site-wise attendance totals from completed sessions.</p>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-slate-800/80 bg-[#13223D]/40 p-4 md:grid-cols-4">
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
            setSiteFilter("all");
            setDateFrom(monthStartString());
            setDateTo(todayString());
          }}
          className="border-slate-700 text-slate-300 hover:bg-slate-800"
        >
          Reset
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-slate-900/60 border-slate-800 text-white">
          <CardHeader className="p-4 pb-2"><CardTitle className="text-sm text-slate-400">Completed Sessions</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0 text-3xl font-extrabold text-emerald-400">{sessions.filter((session) => Boolean(session.check_out)).length}</CardContent>
        </Card>
        <Card className="bg-slate-900/60 border-slate-800 text-white">
          <CardHeader className="p-4 pb-2"><CardTitle className="text-sm text-slate-400">Total Hours</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0 text-3xl font-extrabold text-blue-400">{formatHours(totalHours)}</CardContent>
        </Card>
        <Card className="bg-slate-900/60 border-slate-800 text-white">
          <CardHeader className="p-4 pb-2"><CardTitle className="text-sm text-slate-400">Active Sessions</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0 text-3xl font-extrabold text-amber-400">{totalActive}</CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/50 border-slate-800 text-white">
        <CardHeader className="border-b border-slate-800/80">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPin className="h-5 w-5 text-blue-400" />
            Site-wise Report
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
          ) : siteRows.length === 0 ? (
            <div className="py-16 text-center text-slate-500">No attendance sessions found for this filter.</div>
          ) : (
            <>
            <div className="space-y-3 md:hidden">
              {siteRows.map((row) => (
                <div key={row.siteName} className="rounded-xl border border-slate-800 bg-[#0B1528]/70 p-4 text-sm">
                  <p className="break-words font-semibold text-slate-100">{row.siteName}</p>
                  <div className="mt-3 grid gap-2 text-slate-300">
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Employees Present</span><span>{row.employeesPresent}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Completed Sessions</span><span>{row.completedSessions}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Total Hours</span><span className="font-mono">{formatHours(row.totalHours)}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Active Sessions</span><span className="text-blue-400">{row.activeSessions}</span></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden rounded-xl border border-slate-800/80 md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#0B1528]/80 text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Site</th>
                    <th className="px-4 py-3">Employees Present</th>
                    <th className="px-4 py-3">Completed Sessions</th>
                    <th className="px-4 py-3">Total Hours</th>
                    <th className="px-4 py-3">Active Sessions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {siteRows.map((row) => (
                    <tr key={row.siteName} className="hover:bg-[#13223D]/40">
                      <td className="px-4 py-3 font-semibold text-slate-100">{row.siteName}</td>
                      <td className="px-4 py-3 text-slate-300">{row.employeesPresent}</td>
                      <td className="px-4 py-3 text-slate-300">{row.completedSessions}</td>
                      <td className="px-4 py-3 font-mono text-slate-200">{formatHours(row.totalHours)}</td>
                      <td className="px-4 py-3 text-blue-400">{row.activeSessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
