import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";

type FollowupRow = {
  id: string;
  followup_date: string;
  followup_time: string | null;
  notes: string | null;
  status: "pending" | "completed" | "cancelled";
  completed_at: string | null;
  leads?: {
    id: string;
    lead_no: string;
    company_name: string;
  } | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
}

export default function MyFollowups() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FollowupRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "My Follow-ups - Apex Software";
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("crm_followups")
        .select("id,followup_date,followup_time,notes,status,completed_at,leads!inner(id,lead_no,company_name)")
        .order("followup_date", { ascending: true })
        .order("followup_time", { ascending: true });

      if (error) throw error;
      setRows((data as FollowupRow[]) ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load follow-ups");
    } finally {
      setLoading(false);
    }
  }

  async function complete(row: FollowupRow) {
    const { error } = await (supabase as any)
      .from("crm_followups")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", row.id);

    if (error) {
      toast.error(error.message || "Failed to complete follow-up");
      return;
    }

    toast.success("Follow-up completed");
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Follow-ups</h1>
        <p className="text-muted-foreground mt-1">{rows.length} follow-up{rows.length === 1 ? "" : "s"} assigned to your leads</p>
      </div>

      <Card className="overflow-hidden border border-border/50">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" />
            Loading follow-ups...
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <CalendarClock className="h-10 w-10 mx-auto mb-3 opacity-40" />
            No follow-ups found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDate(row.followup_date)} {row.followup_time ?? ""}</TableCell>
                  <TableCell className="font-mono">{row.leads?.lead_no ?? "-"}</TableCell>
                  <TableCell className="font-medium">{row.leads?.company_name ?? "-"}</TableCell>
                  <TableCell className="max-w-md truncate">{row.notes || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "cancelled" ? "destructive" : row.status === "completed" ? "default" : "secondary"}>
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {row.status === "pending" && (
                        <Button size="sm" onClick={() => complete(row)}>Complete</Button>
                      )}
                      {row.leads?.id && (
                        <Button size="sm" variant="outline" onClick={() => navigate(`/crm/leads/${row.leads?.id}`)}>Open Lead</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
