import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users as UsersIcon,
  Edit3,
  UserX,
  UserCheck,
  Loader2,
  Phone,
  Mail,
  ShieldCheck,
  User as UserSoloIcon,
  CheckSquare,
  Square,
} from "lucide-react";
import { WORKER_MODULES, normalizeModuleAccess } from "@/lib/modules";

type ProfileStatus = "pending" | "approved" | "rejected";
type ProfileRole = "admin" | "worker";

type EmployeeProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  full_name: string | null;
  employee_code: string | null;
  phone: string | null;
  department: string | null;
  designation: string | null;
  role: ProfileRole;
  status: ProfileStatus;
  module_access: string[];
  is_active: boolean;
  created_at: string | null;
};

type ProfileForm = {
  employee_code: string;
  full_name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  role: ProfileRole;
  status: ProfileStatus;
  module_access: string[];
  is_active: boolean;
};

const emptyForm: ProfileForm = {
  employee_code: "",
  full_name: "",
  email: "",
  phone: "",
  department: "",
  designation: "",
  role: "worker",
  status: "pending",
  module_access: [],
  is_active: true,
};

export default function EmployeeManagement() {
  const { user: me } = useAuth();
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setProfiles((data ?? []).map((profile: any) => ({
        id: profile.id,
        email: profile.email ?? null,
        display_name: profile.display_name ?? null,
        full_name: profile.full_name ?? profile.display_name ?? null,
        employee_code: profile.employee_code ?? null,
        phone: profile.phone ?? null,
        department: profile.department ?? null,
        designation: profile.designation ?? null,
        role: (profile.role ?? "worker") as ProfileRole,
        status: (profile.status ?? "pending") as ProfileStatus,
        module_access: normalizeModuleAccess(profile.module_access),
        is_active: profile.is_active ?? true,
        created_at: profile.created_at ?? null,
      })));
    } catch (err: any) {
      toast.error(`Error loading profiles: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const clearForm = () => {
    setForm(emptyForm);
    setSelectedProfileId(null);
  };

  const handleEditProfile = (profile: EmployeeProfile) => {
    setForm({
      employee_code: profile.employee_code || "",
      full_name: profile.full_name || profile.display_name || "",
      email: profile.email || "",
      phone: profile.phone || "",
      department: profile.department || "",
      designation: profile.designation || "",
      role: profile.role,
      status: profile.status,
      module_access: profile.role === "admin" ? [] : profile.module_access,
      is_active: profile.is_active,
    });
    setSelectedProfileId(profile.id);
  };

  const toggleModule = (moduleId: string) => {
    setForm((current) => ({
      ...current,
      module_access: current.module_access.includes(moduleId)
        ? current.module_access.filter((id) => id !== moduleId)
        : [...current.module_access, moduleId],
    }));
  };

  const updateProfile = async () => {
    if (!selectedProfileId) {
      toast.error("Select a profile to edit");
      return;
    }

    if (!form.full_name.trim()) {
      toast.error("Full name is required");
      return;
    }

    if (selectedProfileId === me?.id && (form.role !== "admin" || form.status !== "approved" || !form.is_active)) {
      toast.error("You cannot remove your own active admin access here.");
      return;
    }

    const workerModuleKeys = new Set<string>(WORKER_MODULES.map((module) => module.key));
    const moduleAccess = form.role === "admin"
      ? []
      : form.module_access.filter((module) => workerModuleKeys.has(module));

    setIsSubmitting(true);
    try {
      const payload = {
        employee_code: form.employee_code.trim() || null,
        full_name: form.full_name.trim(),
        display_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        department: form.department.trim() || null,
        designation: form.designation.trim() || null,
        role: form.role,
        status: form.status,
        module_access: moduleAccess,
        is_active: form.is_active,
      };

      const { error } = await (supabase as any)
        .from("profiles")
        .update(payload)
        .eq("id", selectedProfileId);

      if (error) throw error;

      await supabase
        .from("user_roles")
        .upsert(
          { user_id: selectedProfileId, role: form.role },
          { onConflict: "user_id" }
        );

      toast.success("Employee profile updated");
      clearForm();
      await fetchProfiles();
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleActive = async (profile: EmployeeProfile) => {
    if (profile.id === me?.id) {
      toast.error("You cannot disable your own account.");
      return;
    }

    try {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ is_active: !profile.is_active })
        .eq("id", profile.id);

      if (error) throw error;
      toast.success(profile.is_active ? "Profile disabled" : "Profile activated");
      await fetchProfiles();
    } catch (err: any) {
      toast.error(`Operation failed: ${err.message}`);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="p-4 md:p-8 space-y-6 text-white min-h-[calc(100vh-100px)] bg-[#0B1528] rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10">
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <UsersIcon className="h-8 w-8 text-blue-500" />
          Employee Management
        </h1>
        <p className="text-slate-400 mt-1">Manage employee details directly on user profiles.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
        <div className="lg:col-span-1">
          <Card className="bg-slate-900/60 border border-slate-800 backdrop-blur-md text-white shadow-xl">
            <CardHeader className="border-b border-slate-800/80 pb-4">
              <CardTitle className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-400" />
                Edit Profile Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              {!selectedProfileId && (
                <div className="p-3 border border-slate-800 rounded-xl bg-slate-950/40 text-xs text-slate-400">
                  Select a profile from the roster to edit employee details.
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="emp_code" className="text-slate-300 text-sm font-medium">Employee Code</Label>
                <Input
                  id="emp_code"
                  className="bg-[#162A4E] border-slate-700/80 text-white placeholder:text-slate-500 focus-visible:ring-blue-500 focus-visible:border-blue-500 h-10"
                  placeholder="e.g. EMP001"
                  value={form.employee_code}
                  onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
                  disabled={!selectedProfileId}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="full_name" className="text-slate-300 text-sm font-medium">Full Name *</Label>
                <Input
                  id="full_name"
                  className="bg-[#162A4E] border-slate-700/80 text-white placeholder:text-slate-500 focus-visible:ring-blue-500 focus-visible:border-blue-500 h-10"
                  placeholder="John Doe"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  disabled={!selectedProfileId}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email" className="text-slate-300 text-sm font-medium">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  className="bg-[#162A4E] border-slate-700/80 text-white placeholder:text-slate-500 focus-visible:ring-blue-500 focus-visible:border-blue-500 h-10"
                  placeholder="john@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={!selectedProfileId}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone" className="text-slate-300 text-sm font-medium">Phone Number</Label>
                <Input
                  id="phone"
                  className="bg-[#162A4E] border-slate-700/80 text-white placeholder:text-slate-500 focus-visible:ring-blue-500 focus-visible:border-blue-500 h-10"
                  placeholder="+91 98765 43210"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  disabled={!selectedProfileId}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="department" className="text-slate-300 text-sm font-medium">Department</Label>
                  <Input
                    id="department"
                    className="bg-[#162A4E] border-slate-700/80 text-white placeholder:text-slate-500 focus-visible:ring-blue-500 focus-visible:border-blue-500 h-10"
                    placeholder="Engineering"
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    disabled={!selectedProfileId}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="designation" className="text-slate-300 text-sm font-medium">Designation</Label>
                  <Input
                    id="designation"
                    className="bg-[#162A4E] border-slate-700/80 text-white placeholder:text-slate-500 focus-visible:ring-blue-500 focus-visible:border-blue-500 h-10"
                    placeholder="Engineer"
                    value={form.designation}
                    onChange={(e) => setForm({ ...form, designation: e.target.value })}
                    disabled={!selectedProfileId}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="role" className="text-slate-300 text-sm font-medium">App Role</Label>
                  <select
                    id="role"
                    className="flex h-10 w-full items-center justify-between rounded-md border border-slate-700/80 bg-[#162A4E] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-60"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as ProfileRole, module_access: [] })}
                    disabled={!selectedProfileId}
                  >
                    <option value="worker">Worker</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="status" className="text-slate-300 text-sm font-medium">Approval Status</Label>
                  <select
                    id="status"
                    className="flex h-10 w-full items-center justify-between rounded-md border border-slate-700/80 bg-[#162A4E] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-60"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as ProfileStatus })}
                    disabled={!selectedProfileId}
                  >
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  disabled={!selectedProfileId}
                  className="h-4 w-4 accent-blue-600"
                />
                Account active
              </label>

              {form.role === "worker" && (
                <div className="space-y-2">
                  <Label className="text-slate-300 text-sm font-medium">Module Access</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border border-slate-800 rounded-xl p-3 bg-slate-950/40">
                    {WORKER_MODULES.map((module) => {
                      const checked = form.module_access.includes(module.key);
                      return (
                        <button
                          key={module.key}
                          type="button"
                          onClick={() => toggleModule(module.key)}
                          disabled={!selectedProfileId}
                          className="flex items-center gap-2 p-2 hover:bg-slate-900 rounded-lg text-left transition-colors disabled:opacity-60"
                        >
                          {checked ? <CheckSquare className="h-4.5 w-4.5 text-indigo-400" /> : <Square className="h-4.5 w-4.5 text-slate-500" />}
                          <span className="text-xs text-slate-300">{module.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <Button
                  onClick={updateProfile}
                  disabled={isSubmitting || !selectedProfileId}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold h-11 border border-blue-500/20 active:scale-[0.98]"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update Profile"}
                </Button>
                {selectedProfileId && (
                  <Button
                    onClick={clearForm}
                    variant="outline"
                    className="flex-1 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 font-bold h-11"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-slate-900/60 border border-slate-800 backdrop-blur-md text-white shadow-xl">
            <CardHeader className="border-b border-slate-800/80 pb-4">
              <CardTitle className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <UsersIcon className="w-5 h-5 text-indigo-400" />
                Profile Roster
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
              ) : profiles.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-slate-800 rounded-xl">
                  <p className="text-slate-500 font-medium">No user profiles found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-[#0B1528]/85 text-slate-400 font-semibold uppercase tracking-wider text-xs border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-3">Code / User</th>
                        <th className="py-3 px-3">Contact</th>
                        <th className="py-3 px-3">Role / Dept</th>
                        <th className="py-3 px-3 text-center">Status</th>
                        <th className="py-3 px-3">Created</th>
                        <th className="py-3 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {profiles.map((profile) => (
                        <tr key={profile.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-4 px-3">
                            <span className="font-bold text-slate-200">{profile.employee_code || "-"}</span>
                            <div className="text-xs text-slate-300 mt-0.5">{profile.full_name || profile.display_name || "New User"}</div>
                          </td>
                          <td className="py-4 px-3 space-y-0.5 text-xs text-slate-350">
                            {profile.email && (
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3 text-slate-500" />
                                <span className="font-mono">{profile.email}</span>
                              </div>
                            )}
                            {profile.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3 text-slate-500" />
                                <span>{profile.phone}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-3">
                            <div className="flex items-center gap-1">
                              {profile.role === "admin" ? <ShieldCheck className="h-3.5 w-3.5 text-blue-400" /> : <UserSoloIcon className="h-3.5 w-3.5 text-slate-400" />}
                              <span className="capitalize font-medium">{profile.role}</span>
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">{profile.department || "No Dept"} / {profile.designation || "No Title"}</div>
                          </td>
                          <td className="py-4 px-3 text-center space-y-1">
                            <Badge className={`text-[10px] font-bold ${
                              profile.status === "approved"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : profile.status === "rejected"
                                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                  : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            }`}>
                              {profile.status.toUpperCase()}
                            </Badge>
                            <div>
                              <Badge className={`text-[10px] font-bold ${
                                profile.is_active
                                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                  : "bg-slate-800 text-slate-400 border border-slate-700"
                              }`}>
                                {profile.is_active ? "ACTIVE" : "DISABLED"}
                              </Badge>
                            </div>
                          </td>
                          <td className="py-4 px-3 text-xs text-slate-400 font-mono">
                            {formatDate(profile.created_at)}
                          </td>
                          <td className="py-4 px-3 text-right">
                            <div className="flex gap-2 justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-slate-800 hover:bg-slate-800 text-slate-300 h-7"
                                onClick={() => handleEditProfile(profile)}
                              >
                                <Edit3 className="h-3 w-3" />
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                className={`border-slate-800 h-7 ${profile.is_active ? "text-amber-500 hover:bg-amber-500/10" : "text-emerald-500 hover:bg-emerald-500/10"}`}
                                onClick={() => toggleActive(profile)}
                                title={profile.is_active ? "Disable profile" : "Activate profile"}
                              >
                                {profile.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
