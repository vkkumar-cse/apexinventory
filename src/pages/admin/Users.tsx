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
type Row = {
  id: string;
  email: string | null;
  display_name: string | null;
  status: Status;
  role: "admin" | "worker";
  linked_employee_id?: string | null;
  linked_employee_name?: string | null;
  module_access?: string[];
};

export default function Users() {
  const { user: me, isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | Status>("pending");

  useEffect(() => { document.title = "Users · Apex Software"; load(); }, []);

  async function load() {
    setLoading(true);
    // Fetch profiles and roles
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id,email,display_name,status").order("created_at"),
      supabase.from("user_roles").select("user_id,role"),
    ]);

    const roleMap = new Map<string, "admin" | "worker">();
    (roles ?? []).forEach((r: any) => {
      const existing = roleMap.get(r.user_id);
      if (!existing || r.role === "admin") roleMap.set(r.user_id, r.role);
    });

    // Attempt to fetch employee links and employee names (optional tables)
    const linkMap: Record<string, { id: string; name: string }> = {};
    try {
      const { data: links } = await supabase.from("user_employee_links" as any).select("user_id,employee_id");
      if (links && links.length) {
        const empIds = Array.from(new Set(links.map((l: any) => l.employee_id))).filter(Boolean);
        const { data: emps } = await supabase.from("employees" as any).select("id,full_name").in("id", empIds);
        const empMap: Record<string, string> = {};
        (emps ?? []).forEach((e: any) => { empMap[e.id] = e.full_name; });
        (links ?? []).forEach((l: any) => {
          linkMap[l.user_id] = { id: l.employee_id, name: empMap[l.employee_id] ?? "Unknown" };
        });
      }
    } catch (e) {
      // optional table may not exist; ignore
    }

    // Module access (optional)
    const modulesMap: Record<string, string[]> = {};
    try {
      const { data: modRows } = await supabase.from("user_module_access" as any).select("user_id,module");
      (modRows ?? []).forEach((m: any) => {
        modulesMap[m.user_id] = modulesMap[m.user_id] ?? [];
        modulesMap[m.user_id].push(m.module);
      });
    } catch (e) {
      // ignore if table missing
    }

    setRows((profiles ?? []).map((p: any) => ({
      ...p,
      status: (p.status ?? "pending") as Status,
      role: roleMap.get(p.id) ?? "worker",
      linked_employee_id: linkMap[p.id]?.id ?? null,
      linked_employee_name: linkMap[p.id]?.name ?? null,
      module_access: modulesMap[p.id] ?? [],
    })));

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

  async function deleteRejectedUser(r: Row) {
    if (r.status !== "rejected") return;

    const ok = confirm(`Delete rejected user ${r.email}?`);
    if (!ok) return;

    const { error: roleError } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", r.id);

    if (roleError) {
      toast.error(roleError.message);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", r.id);

    if (profileError) {
      toast.error(profileError.message);
      return;
    }

    toast.success("Rejected user deleted");

    await load();
  }

  // Link a user to an employee record. Uses optional `user_employee_links` table if present.
  async function linkEmployeeToUser(userId: string) {
    try {
      // try auto-link by email
      const { data: profile } = await supabase.from("profiles").select("email").eq("id", userId).maybeSingle();
      const email = profile?.email;
      if (email) {
        const { data: emp } = await supabase.from("employees" as any).select("id").eq("email", email).maybeSingle();
        if (emp && emp.id) {
          await supabase.from("user_employee_links" as any).upsert({ user_id: userId, employee_id: emp.id }, { onConflict: "user_id" });
          toast.success("User linked to employee by email");
          await load();
          return;
        }
      }

      // fallback: ask admin for employee id to link
      const { data: emps } = await supabase.from("employees" as any).select("id,employee_code,full_name,email").order("full_name");
      const choice = window.prompt("Enter employee ID to link (or Cancel):\n" + (emps ?? []).map((e: any) => `${e.id} - ${e.full_name} (${e.employee_code || ""} ${e.email ? '<' + e.email + '>' : ''})`).join("\n"));
      if (!choice) return;
      const { error } = await supabase.from("user_employee_links" as any).upsert({ user_id: userId, employee_id: choice }, { onConflict: "user_id" });
      if (error) {
        toast.error("Failed to link user. Ensure the `user_employee_links` table exists.");
        return;
      }
      toast.success("User linked to employee");
      await load();
    } catch (e) {
      toast.error("Linking failed. Ensure optional link table exists.");
    }
  }

  async function unlinkEmployeeFromUser(userId: string) {
    try {
      const { error } = await supabase.from("user_employee_links" as any).delete().eq("user_id", userId);
      if (error) {
        toast.error("Failed to unlink user (table may be missing)");
        return;
      }
      toast.success("User unlinked from employee");
      await load();
    } catch (e) {
      toast.error("Unlink failed");
    }
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
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setStatus(r, "pending")}
                    >
                      Move to pending
                    </Button>

                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteRejectedUser(r)}
                    >
                      Delete
                    </Button>
                  </>
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

                <p className="text-xs text-muted-foreground">Employee link</p>
                {r.linked_employee_name ? (
                  <div className="flex items-center justify-between">
                    <p className="truncate">{r.linked_employee_name}</p>
                    <Button size="sm" variant="outline" onClick={() => unlinkEmployeeFromUser(r.id)}>Unlink</Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] text-muted-foreground">Not linked to an employee</p>
                    <Button size="sm" onClick={() => linkEmployeeToUser(r.id)}>Link Employee</Button>
                  </div>
                )}

                {r.module_access && r.module_access.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Module access</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {r.module_access.map(m => <Badge key={m}>{m}</Badge>)}
                    </div>
                  </div>
                )}

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
