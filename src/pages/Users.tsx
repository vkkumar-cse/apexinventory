import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, ShieldCheck, User as UserIcon, Loader2 } from "lucide-react";

type Row = { id: string; email: string | null; display_name: string | null; role: "admin" | "worker" };

export default function Users() {
  const { user: me, isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", display_name: "", role: "worker" as "worker" | "admin" });

  useEffect(() => { document.title = "Users · Apex Inventory"; load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id,email,display_name").order("created_at"),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    const roleMap = new Map<string, "admin" | "worker">();
    (roles ?? []).forEach((r: any) => {
      const existing = roleMap.get(r.user_id);
      if (!existing || r.role === "admin") roleMap.set(r.user_id, r.role);
    });
    setRows((profiles ?? []).map((p: any) => ({ ...p, role: roleMap.get(p.id) ?? "worker" })));
    setLoading(false);
  }

  const adminCount = rows.filter(r => r.role === "admin").length;

  async function changeRole(userId: string, current: "admin" | "worker", next: "admin" | "worker") {
    if (current === next) return;
    if (current === "admin" && next === "worker" && adminCount <= 1) {
      toast.error("Cannot demote the last admin.");
      return;
    }
    // Replace the user's role row(s)
    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (delErr) { toast.error(delErr.message); return; }
    const { error: insErr } = await supabase.from("user_roles").insert({ user_id: userId, role: next });
    if (insErr) { toast.error(insErr.message); return; }
    toast.success(`Role updated to ${next}`);
    load();
  }

  async function createWorker() {
    if (!form.email || !form.password) { toast.error("Email and password required"); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("create-worker", { body: form });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Failed to create user");
      return;
    }
    toast.success(`${form.role === "admin" ? "Admin" : "Worker"} account created`);
    setOpen(false);
    setForm({ email: "", password: "", display_name: "", role: "worker" });
    setTimeout(load, 600);
  }

  if (!isAdmin) return <p className="text-center text-muted-foreground py-12">Admins only.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-1">{rows.length} accounts · {adminCount} admin{adminCount === 1 ? "" : "s"}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Invite user</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Create account</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Display name</Label><Input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="Worker's full name" /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-2"><Label>Temporary password</Label><Input type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Share this with them" /></div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v: any) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="worker">Worker</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" disabled={busy} onClick={createWorker}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create account
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <p className="text-center text-muted-foreground py-12">Loading…</p> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map(r => (
            <Card key={r.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`h-10 w-10 rounded-lg grid place-items-center ${r.role === "admin" ? "bg-primary/10 text-primary" : "bg-secondary text-foreground"}`}>
                    {r.role === "admin" ? <ShieldCheck className="h-5 w-5" /> : <UserIcon className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{r.display_name ?? r.email}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                  </div>
                </div>
                <Badge variant={r.role === "admin" ? "default" : "secondary"} className="text-[10px]">{r.role.toUpperCase()}</Badge>
              </div>
              <Select value={r.role} onValueChange={(v: any) => changeRole(r.id, r.role, v)} disabled={r.id === me?.id && r.role === "admin" && adminCount <= 1}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="worker">Worker</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              {r.id === me?.id && <p className="text-[10px] text-muted-foreground mt-2">This is you.</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
