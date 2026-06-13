import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, CalendarClock, CheckCircle2, Loader2, Pencil, RotateCcw, Trash2, XCircle } from "lucide-react";
import LeadForm, { LeadFormValue, LeadStatus } from "./LeadForm";

type Lead = LeadFormValue & {
  id: string;
  lead_no: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  won_amount: number | null;
  won_date: string | null;
  lost_reason: string | null;
  lost_date: string | null;
  is_converted: boolean;
  converted_at: string | null;
  customer_id: string | null;
  quotation_placeholder: Record<string, unknown> | null;
  crm_pipelines?: { name: string } | null;
  crm_stages?: { name: string } | null;
  crm_lead_sources?: { name: string } | null;
  profiles?: { full_name: string | null; display_name: string | null; email: string | null } | null;
};

type Followup = {
  id: string;
  lead_id: string;
  followup_date: string;
  followup_time: string | null;
  notes: string | null;
  status: "pending" | "completed" | "cancelled";
  created_at: string;
  completed_at: string | null;
};

type Activity = {
  id: string;
  activity_type: string;
  description: string;
  created_at: string;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
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

const emptyFollowup = {
  followup_date: new Date().toISOString().slice(0, 10),
  followup_time: "",
  notes: "",
  status: "pending" as Followup["status"],
};

export default function LeadDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [leadFormOpen, setLeadFormOpen] = useState(false);
  const [followupOpen, setFollowupOpen] = useState(false);
  const [editingFollowup, setEditingFollowup] = useState<Followup | null>(null);
  const [followupForm, setFollowupForm] = useState(emptyFollowup);
  const [statusDialog, setStatusDialog] = useState<"won" | "lost" | null>(null);
  const [statusForm, setStatusForm] = useState({ amount: "", date: new Date().toISOString().slice(0, 10), reason: "", notes: "" });

  useEffect(() => {
    document.title = "Lead Details - Apex Software";
    load();
  }, [id]);

  async function load() {
    if (!id) return;
    try {
      setLoading(true);
      const [leadResult, followupResult, activityResult] = await Promise.all([
        (supabase as any)
          .from("leads")
          .select("*, crm_pipelines(name), crm_stages(name), crm_lead_sources(name), profiles:assigned_to(full_name,display_name,email)")
          .eq("id", id)
          .maybeSingle(),
        (supabase as any)
          .from("crm_followups")
          .select("*")
          .eq("lead_id", id)
          .order("followup_date", { ascending: false }),
        (supabase as any)
          .from("crm_lead_activities")
          .select("id,activity_type,description,created_at")
          .eq("lead_id", id)
          .order("created_at", { ascending: true }),
      ]);

      if (leadResult.error) throw leadResult.error;
      if (followupResult.error) throw followupResult.error;
      if (activityResult.error) throw activityResult.error;
      setLead((leadResult.data as Lead) ?? null);
      setFollowups((followupResult.data as Followup[]) ?? []);
      setActivities((activityResult.data as Activity[]) ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load lead");
    } finally {
      setLoading(false);
    }
  }

  async function saveLead(payload: Omit<LeadFormValue, "id">) {
    if (!lead) return;
    const { error } = await (supabase as any).from("leads").update(payload).eq("id", lead.id);
    if (error) throw error;
    toast.success("Lead updated successfully");
    await load();
  }

  function openFollowup(followup?: Followup) {
    setEditingFollowup(followup ?? null);
    setFollowupForm(followup ? {
      followup_date: followup.followup_date,
      followup_time: followup.followup_time ?? "",
      notes: followup.notes ?? "",
      status: followup.status,
    } : emptyFollowup);
    setFollowupOpen(true);
  }

  async function saveFollowup() {
    if (!lead) return;
    const payload = {
      lead_id: lead.id,
      followup_date: followupForm.followup_date,
      followup_time: followupForm.followup_time || null,
      notes: followupForm.notes || null,
      status: followupForm.status,
      created_by: user?.id ?? null,
    };
    const result = editingFollowup
      ? await (supabase as any).from("crm_followups").update(payload).eq("id", editingFollowup.id)
      : await (supabase as any).from("crm_followups").insert(payload);
    if (result.error) {
      toast.error(result.error.message || "Failed to save follow-up");
      return;
    }
    toast.success("Follow-up saved");
    setFollowupOpen(false);
    await load();
  }

  async function updateFollowupStatus(followup: Followup, status: Followup["status"]) {
    const { error } = await (supabase as any)
      .from("crm_followups")
      .update({ status, completed_at: status === "completed" ? new Date().toISOString() : followup.completed_at })
      .eq("id", followup.id);
    if (error) toast.error(error.message || "Failed to update follow-up");
    else {
      toast.success("Follow-up updated");
      await load();
    }
  }

  async function deleteFollowup(followup: Followup) {
    const { error } = await (supabase as any).from("crm_followups").delete().eq("id", followup.id);
    if (error) toast.error(error.message || "Failed to delete follow-up");
    else {
      toast.success("Follow-up deleted");
      await load();
    }
  }

  async function saveStatus() {
    if (!lead || !statusDialog) return;
    const payload = statusDialog === "won"
      ? {
        status: "won",
        won_amount: statusForm.amount ? Number(statusForm.amount) : null,
        won_date: statusForm.date || new Date().toISOString().slice(0, 10),
        lost_reason: null,
        lost_date: null,
        notes: statusForm.notes || lead.notes,
      }
      : {
        status: "lost",
        lost_reason: statusForm.reason || null,
        lost_date: statusForm.date || new Date().toISOString().slice(0, 10),
        won_amount: null,
        won_date: null,
        notes: statusForm.notes || lead.notes,
      };
    const { error } = await (supabase as any).from("leads").update(payload).eq("id", lead.id);
    if (error) toast.error(error.message || "Failed to update lead status");
    else {
      toast.success(statusDialog === "won" ? "Lead marked won" : "Lead marked lost");
      setStatusDialog(null);
      await load();
    }
  }

  async function reopenLead() {
    if (!lead) return;
    const { error } = await (supabase as any)
      .from("leads")
      .update({ status: "in_progress", won_amount: null, won_date: null, lost_reason: null, lost_date: null })
      .eq("id", lead.id);
    if (error) toast.error(error.message || "Failed to reopen lead");
    else {
      toast.success("Lead reopened");
      await load();
    }
  }

  async function convertLead(mode: "customer" | "quotation") {
    if (!lead) return;
    try {
      if (mode === "customer") {
        const { error } = await (supabase as any).rpc("crm_convert_lead_to_customer", { p_lead_id: lead.id });
        if (error) throw error;
        toast.success("Lead converted to customer");
        await load();
        return;
      }

      const { error } = await (supabase as any)
        .from("leads")
        .update({
          is_converted: true,
          converted_at: new Date().toISOString(),
          converted_by: user?.id ?? null,
          quotation_placeholder: { requested: true, requested_at: new Date().toISOString() },
        })
        .eq("id", lead.id);
      if (error) throw error;
      toast.success("Quotation placeholder created");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to convert lead");
    }
  }

  const followupBuckets = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      pending: followups.filter((item) => item.status === "pending"),
      completed: followups.filter((item) => item.status === "completed"),
      overdue: followups.filter((item) => item.status === "pending" && item.followup_date < today),
    };
  }, [followups]);

  if (loading) {
    return <Card className="flex items-center justify-center py-24 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" />Loading lead...</Card>;
  }

  if (!lead) {
    return <Card className="p-12 text-center text-muted-foreground">Lead not found.</Card>;
  }

  const assignedTo = lead.profiles?.full_name || lead.profiles?.display_name || lead.profiles?.email || "-";

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <Button variant="ghost" className="mb-2 px-0" onClick={() => navigate("/crm/leads")}>
            <ArrowLeft className="h-4 w-4 mr-2" />Back to Leads
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{lead.company_name}</h1>
            <Badge variant={statusVariant(lead.status)}>{statusLabel(lead.status)}</Badge>
          </div>
          <p className="text-muted-foreground mt-1 font-mono">{lead.lead_no}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setLeadFormOpen(true)}><Pencil className="h-4 w-4 mr-2" />Edit</Button>
          {lead.status !== "won" && <Button onClick={() => setStatusDialog("won")}><CheckCircle2 className="h-4 w-4 mr-2" />Mark Won</Button>}
          {lead.status !== "lost" && <Button variant="destructive" onClick={() => setStatusDialog("lost")}><XCircle className="h-4 w-4 mr-2" />Mark Lost</Button>}
          {lead.status !== "in_progress" && <Button variant="outline" onClick={reopenLead}><RotateCcw className="h-4 w-4 mr-2" />Reopen Lead</Button>}
          <Button variant="outline" onClick={() => convertLead("customer")}>Convert To Customer</Button>
          <Button variant="outline" onClick={() => convertLead("quotation")}>Convert To Quotation</Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full lg:w-[560px] grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Activity Timeline</TabsTrigger>
          <TabsTrigger value="followups">Follow-ups</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="p-5 border border-border/50">
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5 text-sm">
              {[
                ["Lead Number", lead.lead_no],
                ["Company Name", lead.company_name],
                ["Contact Person", lead.contact_person || "-"],
                ["Phone", lead.phone || "-"],
                ["Email", lead.email || "-"],
                ["Source", lead.crm_lead_sources?.name || "-"],
                ["Requirement", lead.requirement || "-"],
                ["Estimated Value", lead.estimated_value == null ? "-" : `Rs. ${Number(lead.estimated_value).toLocaleString("en-IN")}`],
                ["Assigned To", assignedTo],
                ["Pipeline", lead.crm_pipelines?.name || "-"],
                ["Stage", lead.crm_stages?.name || "-"],
                ["Status", statusLabel(lead.status)],
                ["Created Date", formatDateTime(lead.created_at)],
                ["Last Updated", formatDateTime(lead.updated_at)],
              ].map(([label, value]) => (
                <div key={label} className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground">{label}</p>
                  <p className="font-medium whitespace-pre-wrap">{value}</p>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <Card className="p-5 border border-border/50 space-y-4">
            {activities.length === 0 ? <p className="text-muted-foreground text-sm">No activity recorded.</p> : activities.map((activity) => (
              <div key={activity.id} className="flex gap-3">
                <div className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                <div>
                  <p className="font-medium">{activity.description}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(activity.created_at)}</p>
                </div>
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="followups" className="mt-4 space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <Card className="p-4"><p className="text-sm text-muted-foreground">Pending</p><p className="text-2xl font-bold">{followupBuckets.pending.length}</p></Card>
            <Card className="p-4"><p className="text-sm text-muted-foreground">Completed</p><p className="text-2xl font-bold">{followupBuckets.completed.length}</p></Card>
            <Card className="p-4"><p className="text-sm text-muted-foreground">Overdue</p><p className="text-2xl font-bold text-destructive">{followupBuckets.overdue.length}</p></Card>
          </div>
          <Card className="p-5 border border-border/50">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Follow-ups</h2>
              <Button onClick={() => openFollowup()}><CalendarClock className="h-4 w-4 mr-2" />Add Follow-up</Button>
            </div>
            <div className="space-y-3">
              {followups.length === 0 ? <p className="text-sm text-muted-foreground">No follow-ups.</p> : followups.map((followup) => (
                <div key={followup.id} className="rounded-md border border-border/50 p-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{formatDate(followup.followup_date)} {followup.followup_time ?? ""}</p>
                      <Badge variant={followup.status === "cancelled" ? "destructive" : followup.status === "completed" ? "default" : "secondary"}>{followup.status}</Badge>
                    </div>
                    {followup.notes && <p className="text-sm text-muted-foreground mt-1">{followup.notes}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => openFollowup(followup)}>Edit</Button>
                    {followup.status === "pending" && <Button size="sm" onClick={() => updateFollowupStatus(followup, "completed")}>Complete</Button>}
                    {followup.status === "pending" && <Button size="sm" variant="outline" onClick={() => updateFollowupStatus(followup, "cancelled")}>Cancel</Button>}
                    {isAdmin && <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteFollowup(followup)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Card className="p-5 border border-border/50 whitespace-pre-wrap text-sm">
            {lead.notes || "No notes added."}
          </Card>
        </TabsContent>
      </Tabs>

      <LeadForm open={leadFormOpen} onOpenChange={setLeadFormOpen} lead={lead} onSave={saveLead} />

      <Dialog open={followupOpen} onOpenChange={setFollowupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingFollowup ? "Edit Follow-up" : "Add Follow-up"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Date</Label><Input type="date" value={followupForm.followup_date} onChange={(event) => setFollowupForm({ ...followupForm, followup_date: event.target.value })} /></div>
              <div className="space-y-2"><Label>Time</Label><Input type="time" value={followupForm.followup_time} onChange={(event) => setFollowupForm({ ...followupForm, followup_time: event.target.value })} /></div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={followupForm.status} onValueChange={(value: Followup["status"]) => setFollowupForm({ ...followupForm, status: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Notes</Label><Textarea rows={3} value={followupForm.notes} onChange={(event) => setFollowupForm({ ...followupForm, notes: event.target.value })} /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setFollowupOpen(false)}>Cancel</Button><Button onClick={saveFollowup}>Save</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={statusDialog !== null} onOpenChange={(open) => !open && setStatusDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{statusDialog === "won" ? "Mark Lead Won" : "Mark Lead Lost"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {statusDialog === "won" ? (
              <div className="space-y-2"><Label>Won Amount</Label><Input type="number" min={0} value={statusForm.amount} onChange={(event) => setStatusForm({ ...statusForm, amount: event.target.value })} /></div>
            ) : (
              <div className="space-y-2"><Label>Lost Reason</Label><Input value={statusForm.reason} onChange={(event) => setStatusForm({ ...statusForm, reason: event.target.value })} /></div>
            )}
            <div className="space-y-2"><Label>{statusDialog === "won" ? "Won Date" : "Lost Date"}</Label><Input type="date" value={statusForm.date} onChange={(event) => setStatusForm({ ...statusForm, date: event.target.value })} /></div>
            <div className="space-y-2"><Label>Notes</Label><Textarea rows={3} value={statusForm.notes} onChange={(event) => setStatusForm({ ...statusForm, notes: event.target.value })} /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setStatusDialog(null)}>Cancel</Button><Button onClick={saveStatus}>Save</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
