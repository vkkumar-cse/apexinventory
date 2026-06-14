import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";

type Lead = {
  id: string;
  created_at?: string;
  estimated_value?: number | null;
  won_amount?: number | null;
  status: "in_progress" | "won" | "lost";
  crm_stages?: { name: string } | null;
  crm_lead_sources?: { name: string } | null;
};

type Followup = {
  id: string;
  followup_date: string;
  status: string;
};

const colors = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#64748b"];

function groupCount(rows: string[]) {
  return Object.entries(rows.reduce<Record<string, number>>((acc, key) => {
    acc[key || "Unassigned"] = (acc[key || "Unassigned"] ?? 0) + 1;
    return acc;
  }, {})).map(([name, value]) => ({ name, value }));
}

export default function CRMDashboard() {
  const { user, isAdmin } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);

  useEffect(() => {
    document.title = "CRM Dashboard - Apex Software";
    load();
  }, [isAdmin, user?.id]);

  async function load() {
    if (!isAdmin && !user?.id) return;

    try {
      const leadQuery = isAdmin
        ? (supabase as any)
          .from("leads")
          .select("id,created_at,estimated_value,won_amount,status,crm_stages(name),crm_lead_sources(name)")
        : (supabase as any)
          .from("leads")
          .select("id,status,crm_stages(name)")
          .eq("assigned_to", user?.id);

      const followupQuery = isAdmin
        ? (supabase as any)
          .from("crm_followups")
          .select("id,followup_date,status")
        : (supabase as any)
          .from("crm_followups")
          .select("id,followup_date,status,leads!inner(assigned_to)")
          .eq("leads.assigned_to", user?.id);

      const [leadResult, followupResult] = await Promise.all([leadQuery, followupQuery]);

      if (leadResult.error) throw leadResult.error;
      if (followupResult.error) throw followupResult.error;
      setLeads((leadResult.data as Lead[]) ?? []);
      setFollowups((followupResult.data as Followup[]) ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load CRM dashboard");
    }
  }

  const metrics = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const won = leads.filter((lead) => lead.status === "won");
    const lost = leads.filter((lead) => lead.status === "lost");
    return {
      total: leads.length,
      active: leads.filter((lead) => lead.status === "in_progress").length,
      won: won.length,
      lost: lost.length,
      conversionRate: leads.length ? Math.round((won.length / leads.length) * 100) : 0,
      wonValue: won.reduce((sum, lead) => sum + Number(lead.won_amount ?? lead.estimated_value ?? 0), 0),
      todaysFollowups: followups.filter((item) => item.status === "pending" && item.followup_date === today).length,
      overdueFollowups: followups.filter((item) => item.status === "pending" && item.followup_date < today).length,
    };
  }, [leads, followups]);

  const byStage = groupCount(leads.map((lead) => lead.crm_stages?.name ?? "Unassigned"));
  const bySource = groupCount(leads.map((lead) => lead.crm_lead_sources?.name ?? "Unassigned"));
  const wonLost = [
    { name: "Won", value: metrics.won },
    { name: "Lost", value: metrics.lost },
  ];
  const monthly = Object.entries(leads.reduce<Record<string, number>>((acc, lead) => {
    if (!lead.created_at) return acc;
    const month = lead.created_at.slice(0, 7);
    acc[month] = (acc[month] ?? 0) + 1;
    return acc;
  }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value }));

  const metricCards = isAdmin
    ? [
      ["Total Leads", metrics.total],
      ["Active Leads", metrics.active],
      ["Won Leads", metrics.won],
      ["Lost Leads", metrics.lost],
      ["Conversion Rate", `${metrics.conversionRate}%`],
      ["Total Won Value", `Rs. ${metrics.wonValue.toLocaleString("en-IN")}`],
      ["Today's Follow-ups", metrics.todaysFollowups],
      ["Overdue Follow-ups", metrics.overdueFollowups],
    ]
    : [
      ["My Total Leads", metrics.total],
      ["My Active Leads", metrics.active],
      ["My Won Leads", metrics.won],
      ["My Lost Leads", metrics.lost],
      ["My Today's Follow-ups", metrics.todaysFollowups],
      ["My Overdue Follow-ups", metrics.overdueFollowups],
    ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{isAdmin ? "CRM Dashboard" : "My Dashboard"}</h1>
        <p className="text-muted-foreground mt-1">{isAdmin ? "Lead performance and follow-up workload." : "Your assigned lead performance and follow-up workload."}</p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {metricCards.map(([label, value]) => (
          <Card key={label} className="p-4 border border-border/50">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <ChartCard title={isAdmin ? "Leads by Stage" : "My Leads by Stage"}>
          <BarChart data={byStage}><CartesianGrid vertical={false} /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="value" fill="#2563eb" /></BarChart>
        </ChartCard>
        {isAdmin && (
          <>
            <ChartCard title="Leads by Source">
              <PieChart><ChartTooltip content={<ChartTooltipContent />} /><Pie data={bySource} dataKey="value" nameKey="name">{bySource.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}</Pie></PieChart>
            </ChartCard>
            <ChartCard title="Monthly Lead Creation">
              <LineChart data={monthly}><CartesianGrid vertical={false} /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><ChartTooltip content={<ChartTooltipContent />} /><Line dataKey="value" stroke="#16a34a" strokeWidth={2} /></LineChart>
            </ChartCard>
            <ChartCard title="Won vs Lost">
              <BarChart data={wonLost}><CartesianGrid vertical={false} /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="value" fill="#f59e0b" /></BarChart>
            </ChartCard>
          </>
        )}
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 border border-border/50">
      <h2 className="font-semibold mb-4">{title}</h2>
      <ChartContainer config={{ value: { label: title } }} className="h-72 w-full">
        {children}
      </ChartContainer>
    </Card>
  );
}
