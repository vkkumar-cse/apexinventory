import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, KanbanSquare } from "lucide-react";
import type { CRMPipeline, CRMStage, LeadStatus } from "./LeadForm";

type PipelineLead = {
  id: string;
  lead_no: string;
  company_name: string;
  contact_person: string | null;
  phone: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  status: LeadStatus;
};

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

export default function Pipeline() {
  const navigate = useNavigate();
  const [pipelines, setPipelines] = useState<CRMPipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [stages, setStages] = useState<CRMStage[]>([]);
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [boardLoading, setBoardLoading] = useState(false);
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "CRM Pipeline - Apex Software";
    loadPipelines();
  }, []);

  useEffect(() => {
    if (!selectedPipelineId) {
      setStages([]);
      setLeads([]);
      return;
    }
    loadBoard(selectedPipelineId);
  }, [selectedPipelineId]);

  async function loadPipelines() {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("crm_pipelines")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      const rows = (data as CRMPipeline[]) ?? [];
      setPipelines(rows);
      setSelectedPipelineId(rows[0]?.id ?? "");
    } catch (err: any) {
      toast.error(err.message || "Failed to load sales processes");
    } finally {
      setLoading(false);
    }
  }

  async function loadBoard(pipelineId: string) {
    try {
      setBoardLoading(true);
      const [stageResult, leadResult] = await Promise.all([
        (supabase as any)
          .from("crm_stages")
          .select("*")
          .eq("pipeline_id", pipelineId)
          .order("position", { ascending: true }),
        (supabase as any)
          .from("leads")
          .select("id,lead_no,company_name,contact_person,phone,pipeline_id,stage_id,status")
          .eq("pipeline_id", pipelineId)
          .order("created_at", { ascending: false }),
      ]);

      if (stageResult.error) throw stageResult.error;
      if (leadResult.error) throw leadResult.error;

      setStages((stageResult.data as CRMStage[]) ?? []);
      setLeads((leadResult.data as PipelineLead[]) ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load pipeline");
    } finally {
      setBoardLoading(false);
    }
  }

  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === selectedPipelineId) ?? null;

  const leadsByStage = useMemo(() => {
    return leads.reduce<Record<string, PipelineLead[]>>((acc, lead) => {
      if (!lead.stage_id) return acc;
      acc[lead.stage_id] = [...(acc[lead.stage_id] ?? []), lead];
      return acc;
    }, {});
  }, [leads]);

  async function moveLead(lead: PipelineLead, nextStage: CRMStage) {
    if (lead.stage_id === nextStage.id) return;
    const previousLeads = leads;
    setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, stage_id: nextStage.id } : item));

    try {
      const { error } = await (supabase as any)
        .from("leads")
        .update({ stage_id: nextStage.id, updated_at: new Date().toISOString() })
        .eq("id", lead.id);

      if (error) throw error;
      await loadBoard(selectedPipelineId);
      toast.success(`Moved ${lead.lead_no} to ${nextStage.name}`);
    } catch (err: any) {
      setLeads(previousLeads);
      toast.error(err.message || "Failed to move lead");
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>, stage: CRMStage) {
    event.preventDefault();
    const leadId = event.dataTransfer.getData("text/plain");
    setDraggingLeadId(null);
    const lead = leads.find((item) => item.id === leadId);
    if (lead) moveLead(lead, stage);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-muted-foreground mt-1">Select a Sales Process to view its private stages and leads.</p>
        </div>
        <div className="w-full sm:w-80 space-y-2">
          <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId} disabled={loading || pipelines.length === 0}>
            <SelectTrigger>
              <SelectValue placeholder={loading ? "Loading..." : "Select Sales Process"} />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map((pipeline) => (
                <SelectItem key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <Card className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" />
          Loading sales processes...
        </Card>
      ) : pipelines.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <KanbanSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
          No sales processes found. Create one in CRM Settings.
        </Card>
      ) : boardLoading ? (
        <Card className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" />
          Loading pipeline...
        </Card>
      ) : stages.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <KanbanSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
          No stages found for {selectedPipeline?.name ?? "this Sales Process"}. Create stages in CRM Settings.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stages.map((stage) => {
            const stageLeads = leadsByStage[stage.id] ?? [];
            return (
              <Card
                key={stage.id}
                className="min-h-72 overflow-hidden border border-border/50"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(event, stage)}
              >
                <div className="p-4 border-b border-border/50 bg-secondary/20">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold leading-tight">{stage.name}</h2>
                      <p className="text-xs text-muted-foreground mt-1">Position {stage.position}</p>
                    </div>
                    <Badge variant="secondary">{stageLeads.length}</Badge>
                  </div>
                </div>

                <div className="p-3 space-y-3 min-h-52">
                  {stageLeads.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">No leads</div>
                  ) : (
                    stageLeads.map((lead) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(event) => {
                          setDraggingLeadId(lead.id);
                          event.dataTransfer.setData("text/plain", lead.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDraggingLeadId(null)}
                        onClick={() => navigate(`/crm/leads/${lead.id}`)}
                        className={`rounded-md border border-border/50 bg-card p-3 cursor-grab active:cursor-grabbing transition ${draggingLeadId === lead.id ? "opacity-50" : "hover:border-primary/40"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium leading-tight">{lead.company_name}</p>
                          <Badge variant={statusVariant(lead.status)} className="shrink-0">
                            {statusLabel(lead.status)}
                          </Badge>
                        </div>
                        {lead.contact_person && (
                          <p className="text-xs text-muted-foreground mt-2 truncate">{lead.contact_person}</p>
                        )}
                        {lead.phone && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">{lead.phone}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
