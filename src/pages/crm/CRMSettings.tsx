import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { GitBranch, Loader2, Pencil, Plus, Settings, Trash2 } from "lucide-react";
import type { CRMPipeline, CRMStage } from "./LeadForm";

const pipelineSchema = z.object({
  name: z.string().trim().min(1, "Sales Process name is required").max(160),
  description: z.string().trim().max(500).optional(),
  is_active: z.boolean(),
});

const stageSchema = z.object({
  name: z.string().trim().min(1, "Stage name is required").max(120),
  position: z.coerce.number().int("Position must be a whole number").min(1, "Position must be at least 1"),
});

const emptyPipelineForm = {
  name: "",
  description: "",
  is_active: true,
};

const emptyStageForm = {
  name: "",
  position: 1,
};

export default function CRMSettings() {
  const { isAdmin } = useAuth();
  const [pipelines, setPipelines] = useState<CRMPipeline[]>([]);
  const [stages, setStages] = useState<CRMStage[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [stageLoading, setStageLoading] = useState(false);

  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<CRMPipeline | null>(null);
  const [pipelineForm, setPipelineForm] = useState(emptyPipelineForm);

  const [stageOpen, setStageOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<CRMStage | null>(null);
  const [stageForm, setStageForm] = useState(emptyStageForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = "CRM Settings - Apex Software";
    loadPipelines();
  }, []);

  useEffect(() => {
    if (!selectedPipelineId) {
      setStages([]);
      return;
    }
    loadStages(selectedPipelineId);
  }, [selectedPipelineId]);

  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === selectedPipelineId) ?? null;

  const nextPosition = useMemo(
    () => (stages.length === 0 ? 1 : Math.max(...stages.map((stage) => stage.position)) + 1),
    [stages]
  );

  async function loadPipelines() {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("crm_pipelines")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      const rows = (data as CRMPipeline[]) ?? [];
      setPipelines(rows);
      setSelectedPipelineId((current) => {
        if (current && rows.some((pipeline) => pipeline.id === current)) return current;
        return rows[0]?.id ?? "";
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to load sales processes");
    } finally {
      setLoading(false);
    }
  }

  async function loadStages(pipelineId: string) {
    try {
      setStageLoading(true);
      const { data, error } = await (supabase as any)
        .from("crm_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("position", { ascending: true });

      if (error) throw error;
      setStages((data as CRMStage[]) ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load stages");
    } finally {
      setStageLoading(false);
    }
  }

  function openNewPipeline() {
    setEditingPipeline(null);
    setPipelineForm(emptyPipelineForm);
    setPipelineOpen(true);
  }

  function openEditPipeline(pipeline: CRMPipeline) {
    setEditingPipeline(pipeline);
    setPipelineForm({
      name: pipeline.name,
      description: pipeline.description ?? "",
      is_active: pipeline.is_active,
    });
    setPipelineOpen(true);
  }

  async function savePipeline() {
    const parsed = pipelineSchema.safeParse(pipelineForm);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: parsed.data.name,
        description: parsed.data.description || null,
        is_active: parsed.data.is_active,
      };

      const { error } = editingPipeline
        ? await (supabase as any).from("crm_pipelines").update(payload).eq("id", editingPipeline.id)
        : await (supabase as any).from("crm_pipelines").insert(payload);

      if (error) throw error;
      toast.success(editingPipeline ? "Sales Process updated successfully" : "Sales Process created successfully");
      setPipelineOpen(false);
      await loadPipelines();
    } catch (err: any) {
      toast.error(err.message || "Failed to save sales process");
    } finally {
      setSaving(false);
    }
  }

  async function deletePipeline(pipeline: CRMPipeline) {
    try {
      const { error } = await (supabase as any)
        .from("crm_pipelines")
        .delete()
        .eq("id", pipeline.id);

      if (error) throw error;
      toast.success(`Deleted sales process: ${pipeline.name}`);
      await loadPipelines();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete sales process");
    }
  }

  function openNewStage() {
    if (!selectedPipeline) {
      toast.error("Select a sales process first");
      return;
    }
    setEditingStage(null);
    setStageForm({ ...emptyStageForm, position: nextPosition });
    setStageOpen(true);
  }

  function openEditStage(stage: CRMStage) {
    setEditingStage(stage);
    setStageForm({
      name: stage.name,
      position: stage.position,
    });
    setStageOpen(true);
  }

  async function saveStage() {
    if (!selectedPipeline) {
      toast.error("Select a sales process first");
      return;
    }

    const parsed = stageSchema.safeParse(stageForm);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }

    try {
      setSaving(true);
      const payload = {
        pipeline_id: selectedPipeline.id,
        name: parsed.data.name,
        position: parsed.data.position,
      };

      const { error } = editingStage
        ? await (supabase as any).from("crm_stages").update(payload).eq("id", editingStage.id)
        : await (supabase as any).from("crm_stages").insert(payload);

      if (error) throw error;
      toast.success(editingStage ? "Stage updated successfully" : "Stage created successfully");
      setStageOpen(false);
      await loadStages(selectedPipeline.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to save stage");
    } finally {
      setSaving(false);
    }
  }

  async function deleteStage(stage: CRMStage) {
    try {
      const { error } = await (supabase as any)
        .from("crm_stages")
        .delete()
        .eq("id", stage.id);

      if (error) throw error;
      toast.success(`Deleted stage: ${stage.name}`);
      if (selectedPipeline) await loadStages(selectedPipeline.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete stage");
    }
  }

  if (!isAdmin) {
    return <p className="text-center text-muted-foreground py-12">Admins only.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CRM Settings</h1>
          <p className="text-muted-foreground mt-1">Configure Sales Processes and their private workflow stages.</p>
        </div>
        <Button onClick={openNewPipeline}>
          <Plus className="h-4 w-4 mr-2" />Add Sales Process
        </Button>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        <Card className="overflow-hidden border border-border/50">
          <div className="p-5 border-b border-border/50">
            <h2 className="text-lg font-semibold">Sales Processes</h2>
            <p className="text-sm text-muted-foreground mt-1">Pipelines are independent selling workflows.</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" />
              Loading...
            </div>
          ) : pipelines.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <GitBranch className="h-9 w-9 mx-auto mb-3 opacity-40" />
              No sales processes found.
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {pipelines.map((pipeline) => (
                <button
                  key={pipeline.id}
                  type="button"
                  onClick={() => setSelectedPipelineId(pipeline.id)}
                  className={`w-full text-left p-4 transition-colors ${pipeline.id === selectedPipelineId ? "bg-secondary" : "hover:bg-secondary/50"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{pipeline.name}</p>
                      {pipeline.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{pipeline.description}</p>
                      )}
                    </div>
                    <Badge variant={pipeline.is_active ? "default" : "secondary"} className="shrink-0">
                      {pipeline.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden border border-border/50">
          <div className="p-5 border-b border-border/50 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{selectedPipeline?.name ?? "Stages"}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedPipeline ? "Stages belong only to this Sales Process." : "Select or create a Sales Process."}
              </p>
            </div>
            {selectedPipeline && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => openEditPipeline(selectedPipeline)}>
                  <Pencil className="h-4 w-4 mr-2" />Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {selectedPipeline.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This deletes the sales process and its stages. Leads attached to it will keep their records but lose pipeline and stage assignment.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deletePipeline(selectedPipeline)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button onClick={openNewStage}>
                  <Plus className="h-4 w-4 mr-2" />Add Stage
                </Button>
              </div>
            )}
          </div>

          {!selectedPipeline ? (
            <div className="p-12 text-center text-muted-foreground">
              <Settings className="h-10 w-10 mx-auto mb-3 opacity-40" />
              Create a Sales Process to define stages.
            </div>
          ) : stageLoading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" />
              Loading stages...
            </div>
          ) : stages.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Settings className="h-10 w-10 mx-auto mb-3 opacity-40" />
              No stages found for this Sales Process.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Position</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stages.map((stage) => (
                  <TableRow key={stage.id}>
                    <TableCell className="font-mono">{stage.position}</TableCell>
                    <TableCell className="font-medium">{stage.name}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditStage(stage)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {stage.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Leads assigned to this stage will keep their lead records but no longer show a stage.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteStage(stage)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
      </div>

      <Dialog open={pipelineOpen} onOpenChange={setPipelineOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPipeline ? `Edit Sales Process: ${editingPipeline.name}` : "Add Sales Process"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="pipeline_name">Name</Label>
              <Input
                id="pipeline_name"
                placeholder="Attendance Software Sales"
                value={pipelineForm.name}
                onChange={(event) => setPipelineForm({ ...pipelineForm, name: event.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pipeline_description">Description</Label>
              <Textarea
                id="pipeline_description"
                placeholder="Optional notes about this sales process"
                rows={3}
                value={pipelineForm.description}
                onChange={(event) => setPipelineForm({ ...pipelineForm, description: event.target.value })}
              />
            </div>

            <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-secondary/20">
              <div className="space-y-0.5">
                <Label htmlFor="pipeline_active" className="text-sm font-semibold">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive pipelines are hidden when creating leads.</p>
              </div>
              <Switch
                id="pipeline_active"
                checked={pipelineForm.is_active}
                onCheckedChange={(checked) => setPipelineForm({ ...pipelineForm, is_active: checked })}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setPipelineOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={savePipeline} disabled={saving}>
                {saving ? "Saving..." : "Save Sales Process"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={stageOpen} onOpenChange={setStageOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingStage ? `Edit Stage: ${editingStage.name}` : "Add Stage"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="stage_name">Name</Label>
              <Input
                id="stage_name"
                placeholder="Stage name"
                value={stageForm.name}
                onChange={(event) => setStageForm({ ...stageForm, name: event.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="stage_position">Position</Label>
              <Input
                id="stage_position"
                type="number"
                min={1}
                value={stageForm.position}
                onChange={(event) => setStageForm({ ...stageForm, position: Number(event.target.value) })}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setStageOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={saveStage} disabled={saving}>
                {saving ? "Saving..." : "Save Stage"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
