import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  ShieldCheck, 
  Check, 
  X, 
  Loader2, 
  Edit3, 
  CheckSquare,
  Square,
  Key,
  Eye,
  EyeOff,
  Copy,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MODULES, WORKER_MODULES, normalizeModuleAccess } from "@/lib/modules";

type Status = "pending" | "approved" | "rejected";

type Row = {
  id: string;
  user_id: number | null;
  email: string | null;
  display_name: string | null;
  full_name: string | null;
  employee_code: string | null;
  status: Status;
  role: "admin" | "worker";
  is_active: boolean;
  module_access: string[];
};

export default function Users() {
  const { user: me, isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | Status>("pending");

  // Edit Access Dialog State
  const [editAccessOpen, setEditAccessOpen] = useState(false);
  const [activeEditRow, setActiveEditRow] = useState<Row | null>(null);
  const [editRole, setEditRole] = useState<"admin" | "worker">("worker");
  const [selectedModules, setSelectedModules] = useState<string[]>([]);

  // Reset Password Dialog State
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [activeResetRow, setActiveResetRow] = useState<Row | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  useEffect(() => {
    document.title = "Users · Apex Software";
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      // Fetch profiles
      const { data: profiles } = await (supabase as any)
        .from("profiles")
        .select("*")
        .order("created_at");

      // Fetch user roles
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id,role");

      const roleMap = new Map<string, "admin" | "worker">();
      (roles ?? []).forEach((r: any) => {
        const existing = roleMap.get(r.user_id);
        if (!existing || r.role === "admin") roleMap.set(r.user_id, r.role);
      });

      setRows((profiles ?? []).map((p: any) => {
        const rowRole = (p.role || roleMap.get(p.id) || "worker") as "admin" | "worker";
        return {
          id: p.id,
          user_id: p.user_id ?? null,
          email: p.email ?? null,
          display_name: p.display_name ?? null,
          full_name: p.full_name ?? null,
          employee_code: p.employee_code ?? null,
          status: (p.status ?? p.status ?? "pending") as Status,
          role: rowRole,
          is_active: p.is_active ?? true,
          module_access: rowRole === "admin" ? [] : normalizeModuleAccess(p.module_access),
        };
      }));
    } catch (err) {
      console.error("Error loading users data:", err);
      toast.error("Failed to load user records");
    } finally {
      setLoading(false);
    }
  }

  const adminCount = rows.filter(r => r.role === "admin" && r.status === "approved").length;

  async function setApprovalStatus(r: Row, next: Status) {
    if (r.status === "approved" && r.role === "admin" && next !== "approved" && adminCount <= 1) {
      toast.error("Cannot remove the last approved admin.");
      return;
    }
    if (r.id === me?.id && next !== "approved") {
      toast.error("You cannot modify your own admin access.");
      return;
    }

    try {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ status: next, approved_by: me?.id } as any)
        .eq("id", r.id);

      if (error) throw error;
      toast.success(`User access ${next}`);
      await load();
    } catch (err: any) {
      toast.error(`Update failed: ${err.message}`);
    }
  }

  // Open Edit Access dialog
  function openEditAccess(row: Row) {
    setActiveEditRow(row);
    setEditRole(row.role);
    setSelectedModules(row.module_access.filter((module) => WORKER_MODULES.some((item) => item.key === module)));
    setEditAccessOpen(true);
  }

  // Toggle Module Checkbox
  function toggleModule(moduleId: string) {
    setSelectedModules(prev => 
      prev.includes(moduleId)
        ? prev.filter(m => m !== moduleId)
        : [...prev, moduleId]
    );
  }

  // Select all or reset default modules
  function setDefaultModules(roleType: "admin" | "worker") {
    if (roleType === "admin") {
      setSelectedModules([]);
    } else {
      setSelectedModules([]);
    }
  }

  // Save Role and Module Access details
  async function saveAccessDetails() {
    if (!activeEditRow) return;

    // Admin access is role-based — no need to store module_access
    // Worker access is stored in module_access
    const workerModuleKeys = new Set<string>(WORKER_MODULES.map((module) => module.key));
    const modulesToSave = editRole === "admin"
      ? []
      : selectedModules.filter((module) => workerModuleKeys.has(module));

    try {
      // 1. Update profiles table
      const { error: pError } = await (supabase as any)
        .from("profiles")
        .update({ 
          role: editRole, 
          module_access: modulesToSave 
        } as any)
        .eq("id", activeEditRow.id);

      if (pError) throw pError;

      // 2. Sync to user_roles (so existing RLS policy checking user_roles keeps working)
      await supabase
        .from("user_roles")
        .upsert(
          { user_id: activeEditRow.id, role: editRole },
          { onConflict: "user_id" }
        );

      toast.success("User role and module access updated");
      setEditAccessOpen(false);
      await load();
    } catch (err: any) {
      const message = err?.message ?? "Unknown error";
      if (message.includes("module_access") && message.includes("schema cache")) {
        toast.error("Failed to save: database migration missing for profiles.module_access. Apply the latest Supabase migrations, then retry.");
      } else {
        toast.error(`Failed to save: ${message}`);
      }
    }
  }

  async function deleteRejectedUser(r: Row) {
    if (r.status !== "rejected") return;

    const ok = confirm(`Delete rejected user ${r.email}?`);
    if (!ok) return;

    try {
      await supabase.from("user_roles").delete().eq("user_id", r.id);
      const { error } = await supabase.from("profiles").delete().eq("id", r.id);
      if (error) throw error;
      toast.success("Rejected user deleted");
      await load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function generateUnambiguousPassword() {
    const uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lowers = "abcdefghijkmnopqrstuvwxyz";
    const digits = "23456789";
    const specials = "@#$%&*!?+-=";
    const all = uppers + lowers + digits + specials;

    let result = [
      uppers[Math.floor(Math.random() * uppers.length)],
      lowers[Math.floor(Math.random() * lowers.length)],
      digits[Math.floor(Math.random() * digits.length)],
      specials[Math.floor(Math.random() * specials.length)],
    ];

    const targetLen = Math.floor(Math.random() * 5) + 12;
    while (result.length < targetLen) {
      result.push(all[Math.floor(Math.random() * all.length)]);
    }

    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }

    return result.join("");
  }

  function openResetPassword(row: Row) {
    setActiveResetRow(row);
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setResetPasswordOpen(true);
  }

  async function executePasswordReset() {
    if (!activeResetRow || !newPassword) return;
    setIsResettingPassword(true);
    try {
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-password`;
      console.log("Invoking Edge Function URL:", functionUrl);

      const { data, error } = await supabase.functions.invoke("reset-password", {
        body: { employeeId: activeResetRow.id, newPassword },
      });

      if (error) {
        console.error("Full error object returned by supabase.functions.invoke():", error);
        
        let detailedMsg = error.message;
        
        // Extract the error response body from context if it is a FunctionsHttpError
        if ('context' in error && error.context instanceof Response) {
          try {
            const clone = error.context.clone();
            const body = await clone.json();
            if (body && body.error) {
              detailedMsg = body.error;
            }
          } catch (e) {
            try {
              const text = await error.context.text();
              if (text) detailedMsg = text;
            } catch (e2) {
              console.error("Could not parse error response body:", e2);
            }
          }
        }
        throw new Error(detailedMsg || "Failed to invoke reset-password edge function");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success("Password reset successfully.", {
        description: "The employee must change their password the next time they sign in.",
      });

      setNewPassword("");
      setConfirmPassword("");
      setResetPasswordOpen(false);
    } catch (err: any) {
      console.error("Caught password reset execution error:", err);
      toast.error(err?.message || "Unable to reset password. Please try again.");
    } finally {
      setIsResettingPassword(false);
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
    <div className="p-4 md:p-8 space-y-6 text-white min-h-[calc(100vh-100px)] bg-[#0B1528] rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="flex justify-between items-center relative z-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">User Management</h1>
          <p className="text-slate-400 mt-1">{rows.length} accounts · {adminCount} active admin{adminCount === 1 ? "" : "s"}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v: any) => setTab(v)} className="relative z-10">
        <TabsList className="bg-slate-900 border border-slate-850">
          <TabsTrigger value="pending">Pending {counts.pending > 0 && <Badge className="ml-2 h-5 px-1.5 bg-amber-500 text-slate-900">{counts.pending}</Badge>}</TabsTrigger>
          <TabsTrigger value="approved">Approved <span className="ml-2 text-slate-500">{counts.approved}</span></TabsTrigger>
          <TabsTrigger value="rejected">Rejected <span className="ml-2 text-slate-500">{counts.rejected}</span></TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
      ) : (
        <div className="relative z-10 overflow-hidden border border-slate-800 rounded-xl bg-slate-900/60 backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#0B1528]/80 text-slate-400 font-semibold uppercase tracking-wider text-xs border-b border-slate-800">
                <tr>
                  <th className="py-4 px-4">User Details</th>
                  <th className="py-4 px-4 text-center">Status</th>
                  <th className="py-4 px-4 text-center">Role</th>
                  <th className="py-4 px-4 text-center">Active</th>
                  <th className="py-4 px-4">Module Access</th>
                  <th className="py-4 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {visible.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-4 px-4">
                        <div className="font-semibold text-slate-200">{r.full_name || r.display_name || "New User"}</div>
                        <div className="text-xs text-slate-400 font-mono">{r.email}</div>
                        {r.employee_code && <div className="text-[10px] text-blue-400 mt-0.5 font-mono">Employee Code: {r.employee_code}</div>}
                        {r.user_id && <div className="text-[10px] text-blue-400 mt-0.5">Numeric User ID: {r.user_id}</div>}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"} className="text-[10px] uppercase font-bold">
                          {r.status}
                        </Badge>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <Badge className={`text-[10px] font-bold ${r.role === 'admin' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                          {r.role.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <Badge className={`text-[10px] font-bold ${
                          r.is_active
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        }`}>
                          {r.is_active ? "ACTIVE" : "DISABLED"}
                        </Badge>
                      </td>
                      <td className="py-4 px-4 max-w-[200px]">
                        {r.role === "admin" ? (
                          <span className="text-xs text-blue-300 font-semibold">All modules</span>
                        ) : r.module_access.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {r.module_access.map(m => (
                              <Badge key={m} className="bg-indigo-950 text-indigo-300 border border-indigo-900/50 text-[9px] px-1 py-0 rounded">
                                {MODULES.find((module) => module.key === m)?.label ?? m.replace(/_/g, " ")}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">No Access</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex gap-2 justify-end">
                          {/* Approve/Reject */}
                          {r.status !== "approved" && (
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white h-7 py-0 px-2 text-xs" onClick={() => setApprovalStatus(r, "approved")}>
                              <Check className="h-3 w-3 mr-1" /> Approve
                            </Button>
                          )}
                          {r.status !== "rejected" && (
                            <Button size="sm" variant="outline" className="border-slate-800 hover:bg-slate-800 text-slate-300 h-7 py-0 px-2 text-xs" onClick={() => setApprovalStatus(r, "rejected")} disabled={r.id === me?.id}>
                              <X className="h-3 w-3 mr-1" /> Reject
                            </Button>
                          )}
                          {/* Edit permissions */}
                          <Button size="sm" variant="outline" className="border-slate-800 text-slate-300 hover:bg-slate-800 h-7 py-0 px-2 text-xs" onClick={() => openEditAccess(r)}>
                            <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit Access
                          </Button>
                          
                          {/* Reset password */}
                          {r.status === "approved" && r.id !== me?.id && (
                            <Button size="sm" variant="outline" className="border-slate-800 text-slate-300 hover:bg-slate-800 h-7 py-0 px-2 text-xs" onClick={() => openResetPassword(r)}>
                              <Key className="h-3.5 w-3.5 mr-1 text-slate-400" /> Reset Password
                            </Button>
                          )}
                          
                          {r.status === "rejected" && (
                            <Button size="sm" variant="destructive" className="h-7 py-0 px-2 text-xs" onClick={() => deleteRejectedUser(r)}>
                              Delete
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-slate-500 py-12">No users in this view.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Access Dialog */}
      <Dialog open={editAccessOpen} onOpenChange={setEditAccessOpen}>
        <DialogContent className="bg-slate-900 border border-slate-800 text-white max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <ShieldCheck className="text-indigo-400 w-5 h-5" />
              Edit User Access Settings
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              Assign administrative rights and specific active modules access.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="text-sm">
              <span className="text-slate-400 font-medium">User Profile:</span>
              <span className="text-indigo-400 font-bold ml-2 font-mono">{activeEditRow?.email}</span>
            </div>

            {/* Select User Role */}
            <div className="space-y-2">
              <Label className="text-slate-350">App Access Role</Label>
              <Select value={editRole} onValueChange={(v: any) => {
                setEditRole(v);
                setDefaultModules(v);
              }}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white focus:ring-indigo-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  <SelectItem value="worker">Worker (Restricted Views)</SelectItem>
                  <SelectItem value="admin">Admin (All Views Access)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Select Modules */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-slate-350">Allowed Modules Access</Label>
                {editRole === "worker" && (
                  <Button size="sm" variant="ghost" className="text-[10px] text-indigo-400 hover:text-indigo-300 p-0" onClick={() => setSelectedModules([])}>
                    Clear All
                  </Button>
                )}
              </div>

              {editRole === "admin" ? (
                <div className="p-3 border border-slate-800 rounded-xl bg-slate-950/40 text-xs text-slate-400">
                  <span className="text-indigo-400 font-semibold">Admin</span> — automatically has access to all modules. No module selection required.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto border border-slate-800 rounded-xl p-3 bg-slate-950/40">
                  {WORKER_MODULES.map(m => {
                    const checked = selectedModules.includes(m.key);
                    return (
                      <button key={m.key} onClick={() => toggleModule(m.key)} className="flex items-center gap-2 p-2 hover:bg-slate-900 rounded-lg text-left transition-colors">
                        {checked ? <CheckSquare className="h-4.5 w-4.5 text-indigo-400" /> : <Square className="h-4.5 w-4.5 text-slate-500" />}
                        <span className="text-xs text-slate-300">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="border-slate-800 hover:bg-slate-850 hover:text-white" onClick={() => setEditAccessOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold" onClick={saveAccessDetails}>
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordOpen} onOpenChange={(open) => {
        if (!isResettingPassword) setResetPasswordOpen(open);
      }}>
        <DialogContent className="bg-slate-900 border border-slate-800 text-white max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Key className="text-indigo-400 w-5 h-5" />
              Reset Password
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              Enter or generate a new secure password for this user account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="p-3 border border-slate-800 rounded-xl bg-slate-950/40 text-xs">
              <div className="text-slate-400 font-medium">Employee Details</div>
              <div className="font-bold text-indigo-400 mt-1">
                {activeResetRow?.full_name || activeResetRow?.display_name || "Employee"}
              </div>
              <div className="text-slate-500 font-mono text-[11px] mt-0.5">
                {activeResetRow?.email}
              </div>
            </div>

            {/* Password input fields */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-slate-350 text-xs font-semibold">New Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="bg-slate-800 border-slate-700 text-white placeholder-slate-650 focus:ring-indigo-500 text-sm pr-10 h-10"
                    disabled={isResettingPassword}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                    disabled={isResettingPassword}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-350 text-xs font-semibold">Confirm Password</Label>
                <Input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-800 border-slate-700 text-white placeholder-slate-650 focus:ring-indigo-500 text-sm h-10"
                  disabled={isResettingPassword}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const pass = generateUnambiguousPassword();
                    setNewPassword(pass);
                    setConfirmPassword(pass);
                  }}
                  className="border-slate-800 bg-[#0B1528] text-slate-300 hover:bg-slate-800 text-xs font-semibold"
                  disabled={isResettingPassword}
                >
                  Generate Strong Password
                </Button>
                {newPassword && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(newPassword);
                      toast.success("Password copied to clipboard.");
                    }}
                    className="text-indigo-400 hover:text-indigo-300 text-xs font-semibold flex items-center gap-1.5"
                    disabled={isResettingPassword}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy Password
                  </Button>
                )}
              </div>
            </div>

            {/* Validation checklist status */}
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs text-slate-400">
              <span className="font-bold text-[10px] uppercase text-slate-500 block mb-1">Complexity Requirements</span>
              <div className="flex items-center gap-2">
                <span className={newPassword.length >= 8 && newPassword.length <= 128 ? "text-emerald-400 font-bold" : "text-slate-650"}>
                  {newPassword.length >= 8 && newPassword.length <= 128 ? "✓" : "○"}
                </span>
                <span className={newPassword.length >= 8 && newPassword.length <= 128 ? "text-slate-200" : ""}>8 to 128 characters</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={/[A-Z]/.test(newPassword) ? "text-emerald-400 font-bold" : "text-slate-650"}>
                  {/[A-Z]/.test(newPassword) ? "✓" : "○"}
                </span>
                <span className={/[A-Z]/.test(newPassword) ? "text-slate-200" : ""}>At least one uppercase letter (A-Z)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={/[a-z]/.test(newPassword) ? "text-emerald-400 font-bold" : "text-slate-650"}>
                  {/[a-z]/.test(newPassword) ? "✓" : "○"}
                </span>
                <span className={/[a-z]/.test(newPassword) ? "text-slate-200" : ""}>At least one lowercase letter (a-z)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={/[0-9]/.test(newPassword) ? "text-emerald-400 font-bold" : "text-slate-650"}>
                  {/[0-9]/.test(newPassword) ? "✓" : "○"}
                </span>
                <span className={/[0-9]/.test(newPassword) ? "text-slate-200" : ""}>At least one numeric digit (0-9)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={/[^A-Za-z0-9]/.test(newPassword) ? "text-emerald-400 font-bold" : "text-slate-650"}>
                  {/[^A-Za-z0-9]/.test(newPassword) ? "✓" : "○"}
                </span>
                <span className={/[^A-Za-z0-9]/.test(newPassword) ? "text-slate-200" : ""}>At least one special symbol (@, #, $, etc.)</span>
              </div>
              <div className="flex items-center gap-2 border-t border-slate-850 pt-2 mt-1">
                <span className={newPassword === confirmPassword && confirmPassword.length > 0 ? "text-emerald-400 font-bold" : "text-slate-650"}>
                  {newPassword === confirmPassword && confirmPassword.length > 0 ? "✓" : "○"}
                </span>
                <span className={newPassword === confirmPassword && confirmPassword.length > 0 ? "text-slate-200" : ""}>Passwords match</span>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-800/60 pt-4 flex gap-2">
            <Button
              variant="outline"
              className="border-slate-800 hover:bg-slate-850 hover:text-white"
              onClick={() => setResetPasswordOpen(false)}
              disabled={isResettingPassword}
            >
              Cancel
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
              onClick={executePasswordReset}
              disabled={
                isResettingPassword ||
                !/[A-Z]/.test(newPassword) ||
                !/[a-z]/.test(newPassword) ||
                !/[0-9]/.test(newPassword) ||
                !/[^A-Za-z0-9]/.test(newPassword) ||
                newPassword.length < 8 ||
                newPassword.length > 128 ||
                newPassword !== confirmPassword
              }
            >
              {isResettingPassword ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Resetting Password...
                </>
              ) : (
                "Reset Password"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
