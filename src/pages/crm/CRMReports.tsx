import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Download } from "lucide-react";

type Lead = {
  id: string;
  lead_no: string;
  company_name: string;
  status: "in_progress" | "won" | "lost";
  estimated_value: number | null;
  won_amount: number | null;
  won_date: string | null;
  lost_reason: string | null;
  lost_date: string | null;
  created_at: string;
  crm_lead_sources?: { name: string } | null;
  profiles?: { full_name: string | null; display_name: string | null; email: string | null } | null;
};

function download(rows: Record<string, unknown>[], filename: string) {
  const headers = Object.keys(rows[0] ?? { Empty: "" });
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function summarize(rows: Lead[], keyFn: (lead: Lead) => string) {
  return Object.values(rows.reduce<Record<string, any>>((acc, lead) => {
    const key = keyFn(lead) || "Unassigned";
    if (!acc[key]) acc[key] = { name: key, total: 0, won: 0, lost: 0, won_value: 0 };
    acc[key].total += 1;
    if (lead.status === "won") {
      acc[key].won += 1;
      acc[key].won_value += Number(lead.won_amount ?? lead.estimated_value ?? 0);
    }
    if (lead.status === "lost") acc[key].lost += 1;
    return acc;
  }, {}));
}

export default function CRMReports() {
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    document.title = "CRM Reports - Apex Software";
    load();
  }, []);

  async function load() {
    try {
      const { data, error } = await (supabase as any)
        .from("leads")
        .select("id,lead_no,company_name,status,estimated_value,won_amount,won_date,lost_reason,lost_date,created_at,crm_lead_sources(name),profiles:assigned_to(full_name,display_name,email)");
      if (error) throw error;
      setLeads((data as Lead[]) ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load reports");
    }
  }

  const reports = useMemo(() => {
    const total = leads.length || 1;
    const won = leads.filter((lead) => lead.status === "won");
    const lost = leads.filter((lead) => lead.status === "lost");
    return {
      conversion: [{ total_leads: leads.length, won_leads: won.length, lost_leads: lost.length, conversion_rate: `${Math.round((won.length / total) * 100)}%` }],
      wonValue: won.map((lead) => ({ lead_no: lead.lead_no, company: lead.company_name, won_amount: lead.won_amount ?? lead.estimated_value ?? 0, won_date: lead.won_date ?? "" })),
      lostLeads: lost.map((lead) => ({ lead_no: lead.lead_no, company: lead.company_name, lost_reason: lead.lost_reason ?? "", lost_date: lead.lost_date ?? "" })),
      sourcePerformance: summarize(leads, (lead) => lead.crm_lead_sources?.name ?? "Unassigned"),
      userPerformance: summarize(leads, (lead) => lead.profiles?.full_name || lead.profiles?.display_name || lead.profiles?.email || "Unassigned"),
    };
  }, [leads]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">CRM Reports</h1>
        <p className="text-muted-foreground mt-1">Conversion, value, loss, source, and user performance.</p>
      </div>

      <ReportCard title="Lead Conversion Report" rows={reports.conversion} file="lead-conversion-report" />
      <ReportCard title="Won Value Report" rows={reports.wonValue} file="won-value-report" />
      <ReportCard title="Lost Leads Report" rows={reports.lostLeads} file="lost-leads-report" />
      <ReportCard title="Source Performance Report" rows={reports.sourcePerformance} file="source-performance-report" />
      <ReportCard title="User Performance Report" rows={reports.userPerformance} file="user-performance-report" />
    </div>
  );
}

function ReportCard({ title, rows, file }: { title: string; rows: Record<string, unknown>[]; file: string }) {
  const headers = Object.keys(rows[0] ?? {});
  return (
    <Card className="p-5 border border-border/50">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => download(rows, `${file}.csv`)}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
          <Button variant="outline" onClick={() => download(rows, `${file}.xls`)}><Download className="h-4 w-4 mr-2" />Export Excel</Button>
        </div>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No data.</p> : (
        <Table>
          <TableHeader><TableRow>{headers.map((header) => <TableHead key={header}>{header.replace(/_/g, " ")}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>{headers.map((header) => <TableCell key={header}>{String(row[header] ?? "")}</TableCell>)}</TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
