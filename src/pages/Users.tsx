import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShieldCheck, User as UserIcon, Check, X, Loader2 } from "lucide-react";

type Status = "pending" | "approved" | "rejected";
type Row = { id: string; email: string | null; display_name: string | null; status: Status; role: "admin" | "worker" };

export default function Users() {
  const { user: me, isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | Status>("pending");

  useEffect(() => { document.title = "Users · Apex Inventory"; load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id,email,display_name,status").order("created_at"),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    const roleMap = new Map<string, "admin" | "worker">();
    (roles ?? []).forEach((r: any) => {
      const existing = roleMap.get(r.user_id);
      if (!existing || r.role === "admin") roleMap.set(r.user_id, r.role);
    });
    setRows((profiles ?? []).map((p: any) => ({ ...p, status: (p.status ?? "pending") as Status, role: roleMap.get(p.id) ?? "worker" })));
    setLoading(false);
  }

  const adminCount = rows.filter(r => r.role === "admin" && r.status === "approved").length;

  async function setStatus(r: Row, next: Status) {
    if (r.status === "approved" && r.role === "admin" && next !== "approved" && adminCount <= 1) {
      toast.error("Cannot remove the last approved admin.");
      return;
    }
    if (r.id === me?.id && next !== "approved") {
  toast.error("You cannot modify your own admin access.");
  return;
}
    const { error } = await supabase.from("profiles").update({ status: next } as any).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`User ${next}`);

await load();
  }

async function setRole(r: Row, next: "admin" | "worker") {
  if (r.role === next) return;

  if (r.role === "admin" && next === "worker" && adminCount <= 1) {
    toast.error("Cannot demote the last admin.");
    return;
  }

  const { error } = await supabase
    .from("user_roles")
    .upsert(
      {
        user_id: r.id,
        role: next,
      },
      {
        onConflict: "user_id",
      }
    );

  if (error) {
    toast.error(error.message);
    return;
  }

  toast.success(`Role set to ${next}`);

  await load();
}

  if (!isAdmin) return <p className="text-center text-muted-foreground py-12">Admins only.</p>;

  const visible = rows.filter(r => tab === "all" || r.status === tab);
  const counts = {
    pending: rows.filter(r => r.status === "pending").length,
    approved: rows.filter(r => r.status === "approved").length,
    rejected: rows.filter(r => r.status === "rejected").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User management</h1>
        <p className="text-muted-foreground mt-1">{rows.length} accounts · {adminCount} admin{adminCount === 1 ? "" : "s"}</p>
      </div>

      <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
        <TabsList>
          <TabsTrigger value="pending">Pending {counts.pending > 0 && <Badge className="ml-2 h-5 px-1.5">{counts.pending}</Badge>}</TabsTrigger>
          <TabsTrigger value="approved">Approved <span className="ml-2 text-muted-foreground">{counts.approved}</span></TabsTrigger>
          <TabsTrigger value="rejected">Rejected <span className="ml-2 text-muted-foreground">{counts.rejected}</span></TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? <p className="text-center text-muted-foreground py-12"><Loader2 className="h-5 w-5 animate-spin inline" /></p> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map(r => (
            <Card key={r.id} className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`h-10 w-10 rounded-lg grid place-items-center ${r.role === "admin" ? "bg-primary/10 text-primary" : "bg-secondary text-foreground"}`}>
                    {r.role === "admin" ? <ShieldCheck className="h-5 w-5" /> : <UserIcon className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{r.display_name ?? r.email}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                  </div>
                </div>
                <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"} className="text-[10px]">
                  {r.status.toUpperCase()}
                </Badge>
              </div>

              <div className="flex gap-2 flex-wrap">
                {r.status !== "approved" && (
                  <Button size="sm" onClick={() => setStatus(r, "approved")}><Check className="h-3 w-3 mr-1" />Approve</Button>
                )}
                {r.status !== "rejected" && (
                  <Button size="sm" variant="outline" onClick={() => setStatus(r, "rejected")} disabled={r.id === me?.id}><X className="h-3 w-3 mr-1" />Reject</Button>
                )}
                {r.status === "rejected" && (
                  <Button size="sm" variant="outline" onClick={() => setStatus(r, "pending")}>Move to pending</Button>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Role</p>
                <Select value={r.role} onValueChange={(v: any) => setRole(r, v)} disabled={r.status !== "approved"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="worker">Worker</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                {r.status !== "approved" && <p className="text-[10px] text-muted-foreground">Approve user before assigning role.</p>}
              </div>
              {r.id === me?.id && <p className="text-[10px] text-muted-foreground">This is you.</p>}
            </Card>
          ))}
          {visible.length === 0 && <p className="col-span-full text-center text-muted-foreground py-12">No users in this view.</p>}
        </div>
      )}
    </div>
  );
}
