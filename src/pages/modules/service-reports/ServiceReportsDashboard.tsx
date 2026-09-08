import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { fetchServiceReports, ServiceReport } from "@/lib/serviceReports";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  FileText, 
  Plus, 
  CheckCircle, 
  Clock, 
  FileCheck2, 
  AlertCircle, 
  ChevronRight, 
  Users, 
  Wrench,
  HelpCircle,
  TrendingUp,
  BarChart as BarChartIcon
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  Cell 
} from "recharts";

export default function ServiceReportsDashboard() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState<ServiceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNotConfigured, setIsNotConfigured] = useState(false);

  // Stats counters
  const [stats, setStats] = useState({
    draft: 0,
    submitted: 0,
    approved: 0,
    completed: 0,
    total: 0
  });

  // Chart data
  const [equipmentStats, setEquipmentStats] = useState<any[]>([]);
  const [activityStats, setActivityStats] = useState<any[]>([]);

  useEffect(() => {
    document.title = "Service Reports Dashboard Â· Apex Software";
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchServiceReports();
      setReports(data);
      computeStats(data);
    } catch (err: any) {
      console.error("Dashboard failed to load data:", err);
      if (err.isConfigError) {
        setIsNotConfigured(true);
      } else {
        toast.error(err.message || "Failed to load dashboard metrics.");
      }
    } finally {
      setLoading(false);
    }
  };

  const computeStats = (data: ServiceReport[]) => {
    const s = {
      draft: 0,
      submitted: 0,
      approved: 0,
      completed: 0,
      total: data.length
    };

    const equips: Record<string, number> = {};
    const activitiesMap: Record<string, number> = {};

    data.forEach((r) => {
      if (r.status === "draft") s.draft++;
      else if (r.status === "submitted") s.submitted++;
      else if (r.status === "reviewed" || r.status === "approved") s.approved++;
      else if (r.status === "completed") s.completed++;

      if (r.equipment_name) {
        equips[r.equipment_name] = (equips[r.equipment_name] || 0) + 1;
      }
      
      if (r.nature_of_visit && r.nature_of_visit.length > 0) {
        r.nature_of_visit.forEach(v => {
          activitiesMap[v] = (activitiesMap[v] || 0) + 1;
        });
      }
    });

    setStats(s);

    // Format equipment stats
    const sortedEquips = Object.entries(equips)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    setEquipmentStats(sortedEquips.length > 0 ? sortedEquips : [
      { name: "Profile Projector", value: 3 },
      { name: "CMM", value: 2 },
      { name: "Vernier Caliper", value: 1 }
    ]);

    // Format activities stats
    const sortedActs = Object.entries(activitiesMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    setActivityStats(sortedActs.length > 0 ? sortedActs : [
      { name: "Calibration", value: 5 },
      { name: "Preventive Maintenance", value: 4 },
      { name: "Breakdown Repair", value: 2 }
    ]);
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
        <Button onClick={loadData} className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 px-5">
          Retry Connection
        </Button>
      </div>
    );
  }

  // Quick Action details
  const recentDrafts = reports.filter((r) => r.status === "draft").slice(0, 3);
  const awaitingReview = reports.filter((r) => r.status === "submitted").slice(0, 3);

  const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];

  return (
    <div className="space-y-6 max-w-full pb-16 select-none">
      
      {/* Welcome banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-slate-900 border border-slate-850 p-5 rounded-2xl gap-4">
        <div>
          <h1 className="text-2xl font-black text-white leading-tight">Service Reports Workspace</h1>
          <p className="text-xs text-slate-400 mt-1">
            Create, track, review, and print customer service reports in one place.
          </p>
        </div>
        <Button
          onClick={() => navigate("/service-reports/new")}
          className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold h-11 px-5 shadow-lg flex items-center gap-2"
        >
          <Plus className="w-5 h-5" /> New Service Report
        </Button>
      </div>

      {/* Stats Counter Row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <Card className="bg-slate-900 border-slate-850 text-white">
          <CardContent className="p-4.5 flex flex-col justify-center">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Draft Reports</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-slate-300">{stats.draft}</span>
              <Clock className="w-4 h-4 text-slate-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900 border-slate-850 text-white">
          <CardContent className="p-4.5 flex flex-col justify-center">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Awaiting Review</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-blue-400">{stats.submitted}</span>
              <FileCheck2 className="w-4 h-4 text-blue-555" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900 border-slate-850 text-white">
          <CardContent className="p-4.5 flex flex-col justify-center">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Approved Drafts</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-purple-400">{stats.approved}</span>
              <CheckCircle className="w-4 h-4 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900 border-slate-850 text-white">
          <CardContent className="p-4.5 flex flex-col justify-center">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Completed</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-emerald-400">{stats.completed}</span>
              <CheckCircle className="w-4 h-4 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-850 text-white col-span-2 lg:col-span-1">
          <CardContent className="p-4.5 flex flex-col justify-center">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Total Logged</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-white">{stats.total}</span>
              <FileText className="w-4 h-4 text-slate-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Quick Actions & Recent list */}
      <div className="grid gap-6 md:grid-cols-3">
        
        {/* Quick Actions Panel */}
        <div className="space-y-4 md:col-span-1">
          <h3 className="font-bold text-xs uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
            Quick Actions
          </h3>

          {/* Continue Drafts */}
          <Card className="bg-slate-900 border-slate-850 text-white">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-bold text-slate-300">Recent Drafts</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              {recentDrafts.length > 0 ? (
                recentDrafts.map((d) => (
                  <div 
                    key={d.id} 
                    onClick={() => navigate(`/service-reports/edit/${d.id}`)}
                    className="group flex items-center justify-between p-2 rounded-lg bg-slate-950/40 hover:bg-slate-950 border border-slate-850 hover:border-slate-800 transition cursor-pointer text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-200 truncate">{d.customer_name || "Untitled Customer"}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">{d.report_number} Â· {d.equipment_name || "No Equipment"}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition shrink-0" />
                  </div>
                ))
              ) : (
                <div className="text-slate-500 text-center py-4 text-xs font-medium">No open drafts.</div>
              )}
            </CardContent>
          </Card>

          {/* Awaiting review lists (mostly for Admins) */}
          {isAdmin && (
            <Card className="bg-slate-900 border-slate-850 text-white">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-bold text-blue-400">Awaiting Admin Review</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                {awaitingReview.length > 0 ? (
                  awaitingReview.map((d) => (
                    <div 
                      key={d.id} 
                      onClick={() => navigate(`/service-reports/view/${d.id}`)}
                      className="group flex items-center justify-between p-2 rounded-lg bg-slate-950/40 hover:bg-slate-950 border border-slate-850 hover:border-slate-800 transition cursor-pointer text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-200 truncate">{d.customer_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{d.report_number}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition shrink-0" />
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 text-center py-4 text-xs font-medium">All reports reviewed!</div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Analytics Charts */}
        <div className="space-y-4 md:col-span-2">
          <h3 className="font-bold text-xs uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
            <BarChartIcon className="w-4 h-4 text-slate-550" />
            Maintenance Trends & Diagnostics
          </h3>
          
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Common Equipment Chart */}
            <Card className="bg-slate-900 border-slate-850 text-white p-4">
              <CardHeader className="p-0 pb-3">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400">Most Serviced Equipment</CardTitle>
              </CardHeader>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={equipmentStats} layout="vertical" margin={{ left: -10, right: 10, top: 5, bottom: 5 }}>
                    <XAxis type="number" stroke="#475569" fontSize={9} />
                    <YAxis dataKey="name" type="category" stroke="#475569" fontSize={9} width={90} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", color: "#f8fafc" }} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                      {equipmentStats.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Common Activities Chart */}
            <Card className="bg-slate-900 border-slate-850 text-white p-4">
              <CardHeader className="p-0 pb-3">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400">Top Service Visit Scopes</CardTitle>
              </CardHeader>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityStats}>
                    <XAxis dataKey="name" stroke="#475569" fontSize={9} tickLine={false} />
                    <YAxis stroke="#475569" fontSize={9} />
                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", color: "#f8fafc" }} />
                    <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </div>
      </div>
      
      {/* Empty State / Bottom redirection prompt if no reports exist */}
      {reports.length === 0 && !loading && (
        <Card className="bg-slate-900 border-slate-850 text-white p-8 text-center max-w-xl mx-auto flex flex-col items-center justify-center gap-3">
          <Wrench className="w-12 h-12 text-slate-500 opacity-30 animate-bounce" />
          <h3 className="font-extrabold text-base">No Service Reports Yet</h3>
          <p className="text-xs text-slate-400 max-w-sm">
            Create drafts, log equipment details, and generate client PDF handouts instantly.
          </p>
          <Button
            onClick={() => navigate("/service-reports/new")}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 px-5 mt-2"
          >
            Create Your First Report
          </Button>
        </Card>
      )}
    </div>
  );
}
