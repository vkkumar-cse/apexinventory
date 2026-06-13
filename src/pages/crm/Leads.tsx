import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Building2, Eye, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import LeadForm, { CRMLeadSource, CRMPipeline, CRMStage, LeadFormValue, LeadStatus } from "./LeadForm";

type Lead = LeadFormValue & {
  id: string;
  lead_no: string;
  created_at: string;
  updated_at: string;
  crm_pipelines?: Pick<CRMPipeline, "name"> | null;
  crm_stages?: Pick<CRMStage, "name"> | null;
  crm_lead_sources?: Pick<CRMLeadSource, "name"> | null;
  profiles?: { full_name: string | null; display_name: string | null; email: string | null } | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function statusLabel(status: LeadStatus) {
  if (status === "won") return "Won";
  if (status === "lost") return "Lost";
  return "In Progress";
}

function statusVariant(status: LeadStatus) {
  if (status === "lost") return "destructive";
  if (status === "won") return "default";
  return "secondary";
}

export default function Leads() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pipelines, setPipelines] = useState<CRMPipeline[]>([]);
  const [stages, setStages] = useState<CRMStage[]>([]);
  const [sources, setSources] = useState<CRMLeadSource[]>([]);
  const [users, setUsers] = useState<{ id: string; full_name: string | null; display_name: string | null; email: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    pipeline_id: "all",
    stage_id: "all",
    status: "all",
    source_id: "all",
    assigned_to: "all",
    date_from: "",
    date_to: "",
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  useEffect(() => {
    document.title = "CRM Leads - Apex Software";
    load();
    loadFilters();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("leads")
        .select("*, crm_pipelines(name), crm_stages(name), crm_lead_sources(name), profiles:assigned_to(full_name,display_name,email)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLeads((data as Lead[]) ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load CRM leads");
    } finally {
      setLoading(false);
    }
  }

  async function loadFilters() {
    const [pipelineResult, stageResult, sourceResult, userResult] = await Promise.all([
      (supabase as any).from("crm_pipelines").select("*").order("name", { ascending: true }),
      (supabase as any).from("crm_stages").select("*").order("position", { ascending: true }),
      (supabase as any).from("crm_lead_sources").select("*").eq("active", true).order("name", { ascending: true }),
      (supabase as any).from("profiles").select("id,full_name,display_name,email").eq("status", "approved").order("full_name", { ascending: true }),
    ]);

    if (!pipelineResult.error) setPipelines((pipelineResult.data as CRMPipeline[]) ?? []);
    if (!stageResult.error) setStages((stageResult.data as CRMStage[]) ?? []);
    if (!sourceResult.error) setSources((sourceResult.data as CRMLeadSource[]) ?? []);
    if (!userResult.error) setUsers((userResult.data as any[]) ?? []);
  }

  async function handleSave(payload: Omit<LeadFormValue, "id">) {
    if (editingLead) {
      const { error } = await (supabase as any)
        .from("leads")
        .update(payload)
        .eq("id", editingLead.id);

      if (error) throw error;
      toast.success("Lead updated successfully");
      await load();
      return;
    }

    const { data: latestLead, error: latestError } = await (supabase as any)
      .from("leads")
      .select("lead_no")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) throw latestError;

    const latestNumber = typeof latestLead?.lead_no === "string"
      ? Number.parseInt(latestLead.lead_no.replace(/^L/i, ""), 10)
      : 0;
    const nextNumber = Number.isFinite(latestNumber) ? latestNumber + 1 : 1;
    const leadNo = `L${String(nextNumber).padStart(4, "0")}`;

    const { error } = await (supabase as any)
      .from("leads")
      .insert({ ...payload, lead_no: leadNo });

    if (error) throw error;
    toast.success("Lead created successfully");
    await load();
  }

  async function remove(lead: Lead) {
    try {
      const { error } = await (supabase as any)
        .from("leads")
        .delete()
        .eq("id", lead.id);

      if (error) throw error;
      toast.success(`Deleted lead: ${lead.lead_no}`);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete lead");
    }
  }

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return leads;

    return leads.filter((lead) => (
      (!query ||
        lead.lead_no.toLowerCase().includes(query) ||
        lead.company_name.toLowerCase().includes(query) ||
        (lead.contact_person ?? "").toLowerCase().includes(query) ||
        (lead.phone ?? "").toLowerCase().includes(query)) &&
      (filters.pipeline_id === "all" || lead.pipeline_id === filters.pipeline_id) &&
      (filters.stage_id === "all" || lead.stage_id === filters.stage_id) &&
      (filters.status === "all" || lead.status === filters.status) &&
      (filters.source_id === "all" || lead.source_id === filters.source_id) &&
      (filters.assigned_to === "all" || lead.assigned_to === filters.assigned_to) &&
      (!filters.date_from || lead.created_at.slice(0, 10) >= filters.date_from) &&
      (!filters.date_to || lead.created_at.slice(0, 10) <= filters.date_to)
    ));
  }, [leads, search, filters]);

  const filteredStages = filters.pipeline_id === "all"
    ? stages
    : stages.filter((stage) => stage.pipeline_id === filters.pipeline_id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground mt-1">
            {leads.length} lead{leads.length === 1 ? "" : "s"} registered
          </p>
        </div>
        <Button onClick={() => { setEditingLead(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />Add Lead
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.5fr_repeat(5,1fr)]">
        <div className="relative">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Search lead no, company, contact, phone..."
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select value={filters.pipeline_id} onValueChange={(value) => setFilters({ ...filters, pipeline_id: value, stage_id: "all" })}>
          <SelectTrigger><SelectValue placeholder="Pipeline" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Pipelines</SelectItem>
            {pipelines.map((pipeline) => <SelectItem key={pipeline.id} value={pipeline.id}>{pipeline.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.stage_id} onValueChange={(value) => setFilters({ ...filters, stage_id: value })}>
          <SelectTrigger><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {filteredStages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.source_id} onValueChange={(value) => setFilters({ ...filters, source_id: value })}>
          <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {sources.map((source) => <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.assigned_to} onValueChange={(value) => setFilters({ ...filters, assigned_to: value })}>
          <SelectTrigger><SelectValue placeholder="Assigned" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            {users.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {profile.full_name || profile.display_name || profile.email || profile.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={filters.date_from} onChange={(event) => setFilters({ ...filters, date_from: event.target.value })} />
        <Input type="date" value={filters.date_to} onChange={(event) => setFilters({ ...filters, date_to: event.target.value })} />
      </div>

      <Card className="overflow-hidden border border-border/50">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" />
            Loading leads...
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
            No leads found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead No</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Pipeline</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map((lead) => (
                <TableRow key={lead.id} className="cursor-pointer" onClick={() => navigate(`/crm/leads/${lead.id}`)}>
                  <TableCell className="font-mono font-medium">{lead.lead_no}</TableCell>
                  <TableCell className="font-medium">{lead.company_name}</TableCell>
                  <TableCell>{lead.contact_person || "-"}</TableCell>
                  <TableCell>{lead.phone || "-"}</TableCell>
                  <TableCell>{lead.crm_pipelines?.name ?? "-"}</TableCell>
                  <TableCell>{lead.crm_stages?.name ?? "-"}</TableCell>
                  <TableCell>{lead.crm_lead_sources?.name ?? "-"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(lead.status)}>
                      {statusLabel(lead.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(lead.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(event) => { event.stopPropagation(); navigate(`/crm/leads/${lead.id}`); }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(event) => { event.stopPropagation(); setEditingLead(lead); setFormOpen(true); }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={(event) => event.stopPropagation()} className="text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {lead.lead_no}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently deletes the lead for {lead.company_name}.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={(event) => { event.stopPropagation(); remove(lead); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <LeadForm
        open={formOpen}
        onOpenChange={setFormOpen}
        lead={editingLead}
        onSave={handleSave}
      />
    </div>
  );
}
