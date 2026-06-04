import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export type LeadStatus = "in_progress" | "won" | "lost";

export type CRMPipeline = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

export type CRMStage = {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
};

export type LeadFormValue = {
  id?: string;
  company_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  requirement: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  status: LeadStatus;
  notes: string | null;
};

const schema = z.object({
  company_name: z.string().trim().min(1, "Company Name is required").max(180),
  contact_person: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  requirement: z.string().trim().max(1000).optional(),
  pipeline_id: z.string().uuid("Pipeline is required"),
  stage_id: z.string().uuid("Stage is required"),
  status: z.enum(["in_progress", "won", "lost"]),
  notes: z.string().trim().max(1000).optional(),
});

interface LeadFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: LeadFormValue | null;
  onSave: (payload: Omit<LeadFormValue, "id">) => Promise<void>;
}

const emptyForm = {
  company_name: "",
  contact_person: "",
  phone: "",
  email: "",
  requirement: "",
  pipeline_id: "",
  stage_id: "",
  status: "in_progress" as LeadStatus,
  notes: "",
};

export default function LeadForm({ open, onOpenChange, lead, onSave }: LeadFormProps) {
  const [form, setForm] = useState(emptyForm);
  const [pipelines, setPipelines] = useState<CRMPipeline[]>([]);
  const [stages, setStages] = useState<CRMStage[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (lead) {
      setForm({
        company_name: lead.company_name ?? "",
        contact_person: lead.contact_person ?? "",
        phone: lead.phone ?? "",
        email: lead.email ?? "",
        requirement: lead.requirement ?? "",
        pipeline_id: lead.pipeline_id ?? "",
        stage_id: lead.stage_id ?? "",
        status: lead.status ?? "in_progress",
        notes: lead.notes ?? "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [lead, open]);

  useEffect(() => {
    if (!open) return;
    loadPipelines();
  }, [open]);

  useEffect(() => {
    if (!open || !form.pipeline_id) {
      setStages([]);
      return;
    }
    loadStages(form.pipeline_id);
  }, [open, form.pipeline_id]);

  async function loadPipelines() {
    try {
      setLoadingMeta(true);
      const { data, error } = await (supabase as any)
        .from("crm_pipelines")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      const rows = (data as CRMPipeline[]) ?? [];
      setPipelines(rows);

      if (!lead && rows.length > 0) {
        setForm((current) => current.pipeline_id ? current : { ...current, pipeline_id: rows[0].id });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load CRM pipelines");
      setPipelines([]);
    } finally {
      setLoadingMeta(false);
    }
  }

  async function loadStages(pipelineId: string) {
    try {
      setLoadingMeta(true);
      const { data, error } = await (supabase as any)
        .from("crm_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("position", { ascending: true });

      if (error) throw error;
      const rows = (data as CRMStage[]) ?? [];
      setStages(rows);

      setForm((current) => {
        const existingStageStillValid = rows.some((stage) => stage.id === current.stage_id);
        if (existingStageStillValid) return current;
        return { ...current, stage_id: rows[0]?.id ?? "" };
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to load CRM stages");
      setStages([]);
    } finally {
      setLoadingMeta(false);
    }
  }

  async function handleSave() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }

    try {
      setSaving(true);
      await onSave({
        company_name: parsed.data.company_name,
        contact_person: parsed.data.contact_person || null,
        phone: parsed.data.phone || null,
        email: parsed.data.email || null,
        requirement: parsed.data.requirement || null,
        pipeline_id: parsed.data.pipeline_id,
        stage_id: parsed.data.stage_id,
        status: parsed.data.status,
        notes: parsed.data.notes || null,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save lead");
    } finally {
      setSaving(false);
    }
  }

  const canSave = !saving && !loadingMeta && Boolean(form.pipeline_id) && Boolean(form.stage_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lead ? `Edit Lead: ${lead.company_name}` : "Add Lead"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input
                id="company_name"
                placeholder="Company name"
                value={form.company_name}
                onChange={(event) => setForm({ ...form, company_name: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_person">Contact Person</Label>
              <Input
                id="contact_person"
                placeholder="Contact person"
                value={form.contact_person}
                onChange={(event) => setForm({ ...form, contact_person: event.target.value })}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                placeholder="+91 ..."
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pipeline_id">Pipeline</Label>
              <Select
                value={form.pipeline_id}
                onValueChange={(value) => setForm({ ...form, pipeline_id: value, stage_id: "" })}
                disabled={loadingMeta || pipelines.length === 0}
              >
                <SelectTrigger id="pipeline_id">
                  <SelectValue placeholder={loadingMeta ? "Loading..." : "Select pipeline"} />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((pipeline) => (
                    <SelectItem key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!loadingMeta && pipelines.length === 0 && (
                <p className="text-sm text-muted-foreground">No sales processes found. Please create one in CRM Settings first.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="stage_id">Stage</Label>
              <Select
                value={form.stage_id}
                onValueChange={(value) => setForm({ ...form, stage_id: value })}
                disabled={loadingMeta || !form.pipeline_id || stages.length === 0}
              >
                <SelectTrigger id="stage_id">
                  <SelectValue placeholder={loadingMeta ? "Loading..." : "Select stage"} />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!loadingMeta && form.pipeline_id && stages.length === 0 && (
                <p className="text-sm text-muted-foreground">No stages found for this pipeline. Please create stages in CRM Settings first.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={form.status} onValueChange={(value: LeadStatus) => setForm({ ...form, status: value })}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="won">Won</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="requirement">Requirement</Label>
            <Textarea
              id="requirement"
              placeholder="What does the lead need?"
              rows={3}
              value={form.requirement}
              onChange={(event) => setForm({ ...form, requirement: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Internal notes"
              rows={3}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave}>
              {saving ? "Saving..." : "Save Lead"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
