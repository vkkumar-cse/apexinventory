import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Building2, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import LeadForm, { CRMPipeline, CRMStage, LeadFormValue, LeadStatus } from "./LeadForm";

type Lead = LeadFormValue & {
  id: string;
  lead_no: string;
  created_at: string;
  updated_at: string;
  crm_pipelines?: Pick<CRMPipeline, "name"> | null;
  crm_stages?: Pick<CRMStage, "name"> | null;
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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  useEffect(() => {
    document.title = "CRM Leads - Apex Software";
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("leads")
        .select("*, crm_pipelines(name), crm_stages(name)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLeads((data as Lead[]) ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load CRM leads");
    } finally {
      setLoading(false);
    }
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
      lead.lead_no.toLowerCase().includes(query) ||
      lead.company_name.toLowerCase().includes(query) ||
      (lead.contact_person ?? "").toLowerCase().includes(query) ||
      (lead.phone ?? "").toLowerCase().includes(query) ||
      (lead.email ?? "").toLowerCase().includes(query) ||
      (lead.crm_pipelines?.name ?? "").toLowerCase().includes(query) ||
      (lead.crm_stages?.name ?? "").toLowerCase().includes(query) ||
      statusLabel(lead.status).toLowerCase().includes(query)
    ));
  }, [leads, search]);

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

      <div className="flex items-center max-w-md relative">
        <Search className="h-4 w-4 text-muted-foreground absolute left-3" />
        <Input
          placeholder="Search leads..."
          className="pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
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
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-mono font-medium">{lead.lead_no}</TableCell>
                  <TableCell className="font-medium">{lead.company_name}</TableCell>
                  <TableCell>{lead.contact_person || "-"}</TableCell>
                  <TableCell>{lead.phone || "-"}</TableCell>
                  <TableCell>{lead.crm_pipelines?.name ?? "-"}</TableCell>
                  <TableCell>{lead.crm_stages?.name ?? "-"}</TableCell>
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
                        onClick={() => { setEditingLead(lead); setFormOpen(true); }}
                      >
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
                            <AlertDialogTitle>Delete {lead.lead_no}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently deletes the lead for {lead.company_name}.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(lead)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
