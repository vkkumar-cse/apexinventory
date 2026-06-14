import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Camera,
  Edit3,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User as UserSoloIcon,
  Users as UsersIcon,
  X,
} from "lucide-react";
import Webcam from "react-webcam";
import { getFaceDescriptorFromVideo, isValidFaceDescriptor, type FaceDescriptor } from "@/lib/faceRecognition";

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
  is_active: boolean;
  face_registered_at: string | null;
  assigned_sites: AssignedSite[];
};

type AttendanceSite = {
  id: string;
  site_name: string;
  is_active: boolean;
  is_default: boolean;
};

type AssignedSite = {
  id: string;
  site_name: string;
  is_primary: boolean;
};

type ProfileForm = {
  employee_code: string;
  full_name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  role: ProfileRole;
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
  is_active: true,
};

const REGISTRATION_STEPS = [
  { label: "Straight Face", instruction: "Look directly into the camera." },
  { label: "Slight Left", instruction: "Turn your head slightly to the left." },
  { label: "Slight Right", instruction: "Turn your head slightly to the right." },
  { label: "Slight Up", instruction: "Tilt your head slightly upwards." },
  { label: "Slight Down", instruction: "Tilt your head slightly downwards." },
];

const averageFaceDescriptors = (descriptors: FaceDescriptor[]): FaceDescriptor => {
  const averageDescriptor = new Array(128).fill(0);

  for (let i = 0; i < averageDescriptor.length; i++) {
    averageDescriptor[i] = descriptors.reduce((sum, descriptor) => sum + descriptor[i], 0) / descriptors.length;
  }

  return averageDescriptor;
};

const inputClass = "bg-[#162A4E] border-slate-700/80 text-white placeholder:text-slate-500 focus-visible:ring-blue-500 focus-visible:border-blue-500 h-10";
const selectClass = "flex h-10 w-full items-center justify-between rounded-md border border-slate-700/80 bg-[#162A4E] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function EmployeeManagement() {
  const { user: me } = useAuth();
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [sites, setSites] = useState<AttendanceSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const webcamRef = useRef<Webcam>(null);
  const [showFaceRegistration, setShowFaceRegistration] = useState(false);
  const [isRegisteringFace, setIsRegisteringFace] = useState(false);
  const [cameraPermissionError, setCameraPermissionError] = useState<string | null>(null);
  const [registrationStep, setRegistrationStep] = useState(0);
  const [capturedDescriptors, setCapturedDescriptors] = useState<FaceDescriptor[]>([]);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id,email,display_name,full_name,employee_code,phone,department,designation,role,status,is_active,created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const profilesRaw = data ?? [];
      const profileIds = profilesRaw.map((profile: any) => profile.id);
      const { data: faceProfiles, error: faceError } = profileIds.length > 0
        ? await (supabase as any)
          .from("employee_face_profiles")
          .select("profile_id, registered_at")
          .in("profile_id", profileIds)
        : { data: [], error: null };

      if (faceError) throw faceError;

      const [{ data: sitesRaw, error: sitesError }, { data: assignmentsRaw, error: assignmentsError }] = await Promise.all([
        (supabase as any)
          .from("attendance_sites")
          .select("id,site_name,is_active,is_default")
          .order("is_default", { ascending: false })
          .order("site_name", { ascending: true }),
        profileIds.length > 0
          ? (supabase as any)
            .from("employee_site_assignments")
            .select("profile_id,is_primary,attendance_sites(id,site_name)")
            .in("profile_id", profileIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (sitesError) throw sitesError;
      if (assignmentsError) throw assignmentsError;
      setSites(((sitesRaw ?? []) as AttendanceSite[]).filter((site) => site.is_active));

      const registeredAtByProfile = new Map(
        ((faceProfiles ?? []) as any[]).map((faceProfile) => [faceProfile.profile_id, faceProfile.registered_at ?? null])
      );
      const assignedSitesByProfile = new Map<string, AssignedSite[]>();
      ((assignmentsRaw ?? []) as any[]).forEach((assignment) => {
        const site = assignment.attendance_sites;
        if (!site?.id) return;
        assignedSitesByProfile.set(assignment.profile_id, [
          ...(assignedSitesByProfile.get(assignment.profile_id) ?? []),
          { id: site.id, site_name: site.site_name, is_primary: assignment.is_primary ?? false },
        ]);
      });

      setProfiles(profilesRaw.map((profile: any) => ({
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
        is_active: profile.is_active ?? true,
        face_registered_at: registeredAtByProfile.get(profile.id) ?? null,
        assigned_sites: assignedSitesByProfile.get(profile.id) ?? [],
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

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;

  const handleEditProfile = (profile: EmployeeProfile) => {
    setSelectedProfileId(profile.id);
    setForm({
      employee_code: profile.employee_code || "",
      full_name: profile.full_name || profile.display_name || "",
      email: profile.email || "",
      phone: profile.phone || "",
      department: profile.department || "",
      designation: profile.designation || "",
      role: profile.role,
      is_active: profile.is_active,
    });
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setSelectedProfileId(null);
    setForm(emptyForm);
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

    if (selectedProfileId === me?.id && (form.role !== "admin" || !form.is_active)) {
      toast.error("You cannot remove your own active admin access here.");
      return;
    }

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
        is_active: form.is_active,
      };

      const { error } = await (supabase as any)
        .from("profiles")
        .update(payload)
        .eq("id", selectedProfileId);

      if (error) throw error;

      const { error: roleError } = await supabase
        .from("user_roles")
        .upsert(
          { user_id: selectedProfileId, role: form.role },
          { onConflict: "user_id" }
        );

      if (roleError) throw roleError;

      toast.success("Employee profile updated");
      closeEdit();
      await fetchProfiles();
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openFaceRegistration = (profile: EmployeeProfile) => {
    setSelectedProfileId(profile.id);
    setCameraPermissionError(null);
    setRegistrationStep(0);
    setCapturedDescriptors([]);
    setShowFaceRegistration(true);
  };

  const openAssignSites = (profile: EmployeeProfile) => {
    setSelectedProfileId(profile.id);
    setSelectedSiteIds(profile.assigned_sites.map((site) => site.id));
    setAssignOpen(true);
  };

  const saveSiteAssignments = async () => {
    if (!selectedProfileId) return;

    setIsSubmitting(true);
    try {
      const { error: deleteError } = await (supabase as any)
        .from("employee_site_assignments")
        .delete()
        .eq("profile_id", selectedProfileId);

      if (deleteError) throw deleteError;

      if (selectedSiteIds.length > 0) {
        const { error: insertError } = await (supabase as any)
          .from("employee_site_assignments")
          .insert(selectedSiteIds.map((siteId, index) => ({
            profile_id: selectedProfileId,
            site_id: siteId,
            is_primary: index === 0,
          })));

        if (insertError) throw insertError;
      }

      toast.success("Site assignments updated");
      setAssignOpen(false);
      setSelectedProfileId(null);
      setSelectedSiteIds([]);
      await fetchProfiles();
    } catch (err: any) {
      toast.error(err.message || "Failed to assign sites");
    } finally {
      setIsSubmitting(false);
    }
  };

  const captureFaceSample = async () => {
    const video = webcamRef.current?.video;
    if (!selectedProfileId || !video) {
      toast.error("Camera is not ready");
      return;
    }

    setIsRegisteringFace(true);
    try {
      const descriptor = await getFaceDescriptorFromVideo(video);
      const newDescriptors = [...capturedDescriptors, descriptor];
      setCapturedDescriptors(newDescriptors);

      if (registrationStep < REGISTRATION_STEPS.length - 1) {
        setRegistrationStep(registrationStep + 1);
        toast.success(`Captured ${REGISTRATION_STEPS[registrationStep].label}. Continue to the next pose.`);
      } else {
        setRegistrationStep(REGISTRATION_STEPS.length);
        toast.success("All face samples captured. Save the face profile to finish.");
      }
    } catch (err: any) {
      toast.error(err.message || "Face capture failed. Keep one face clearly visible and try again.");
    } finally {
      setIsRegisteringFace(false);
    }
  };

  const registerFaceDescriptor = async () => {
    if (!selectedProfileId || capturedDescriptors.length !== REGISTRATION_STEPS.length) {
      toast.error("Please capture all 5 face samples first.");
      return;
    }

    if (!capturedDescriptors.every(isValidFaceDescriptor)) {
      toast.error("Face capture failed. Reset and capture all 5 samples again.");
      return;
    }

    setIsRegisteringFace(true);
    try {
      const averageDescriptor = averageFaceDescriptors(capturedDescriptors);

      const { error } = await (supabase as any)
        .from("employee_face_profiles")
        .upsert({
          profile_id: selectedProfileId,
          face_descriptor: averageDescriptor,
          face_image_path: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "profile_id" });

      if (error) throw error;

      toast.success("Face profile registered");
      setShowFaceRegistration(false);
      setSelectedProfileId(null);
      await fetchProfiles();
    } catch (err: any) {
      toast.error(err.message || "Face registration failed");
    } finally {
      setIsRegisteringFace(false);
    }
  };

  const resetFaceCapture = () => {
    setRegistrationStep(0);
    setCapturedDescriptors([]);
    toast.success("Face registration reset.");
  };

  const faceStatus = (profile: EmployeeProfile) => profile.face_registered_at ? "Verified Ready" : "Not Set";

  return (
    <div className="p-4 md:p-8 space-y-6 text-white min-h-[calc(100vh-100px)] bg-[#0B1528] rounded-2xl border border-slate-800 shadow-2xl">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <UsersIcon className="h-8 w-8 text-blue-500" />
          Employee Management
        </h1>
        <p className="text-slate-400 mt-1">Manage attendance employee details and face registration.</p>
      </div>

      <Card className="bg-slate-900/60 border border-slate-800 backdrop-blur-md text-white shadow-xl">
        <CardHeader className="border-b border-slate-800/80 pb-4">
          <CardTitle className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <UsersIcon className="w-5 h-5 text-indigo-400" />
            Employee Roster
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
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-[#0B1528]/85 text-slate-400 font-semibold uppercase tracking-wider text-xs border-b border-slate-800">
                <tr>
                  <th className="w-[22%] py-3 px-3">Employee</th>
                  <th className="w-[18%] py-3 px-3 hidden md:table-cell">Contact</th>
                  <th className="w-[16%] py-3 px-3 hidden lg:table-cell">Department</th>
                  <th className="w-[12%] py-3 px-3">Role</th>
                  <th className="w-[16%] py-3 px-3 hidden xl:table-cell">Assigned Sites</th>
                  <th className="w-[10%] py-3 px-3">Face Status</th>
                  <th className="w-[14%] py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {profiles.map((profile) => (
                  <tr key={profile.id} className="hover:bg-slate-800/40 transition-colors align-top">
                    <td className="py-4 px-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-100 truncate">{profile.full_name || profile.display_name || "New User"}</p>
                        <p className="text-xs text-slate-400 truncate">{profile.employee_code || "No employee code"}</p>
                        <div className="md:hidden mt-2 space-y-1 text-xs text-slate-400">
                          {profile.email && <p className="truncate">{profile.email}</p>}
                          {profile.phone && <p>{profile.phone}</p>}
                        </div>
                        <div className="lg:hidden mt-2 text-xs text-slate-400 truncate">
                          {[profile.department, profile.designation].filter(Boolean).join(" / ") || "No department"}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-3 hidden md:table-cell">
                      <div className="space-y-1 text-xs text-slate-350 min-w-0">
                        {profile.email && (
                          <div className="flex items-center gap-1 min-w-0">
                            <Mail className="h-3 w-3 shrink-0 text-slate-500" />
                            <span className="truncate">{profile.email}</span>
                          </div>
                        )}
                        {profile.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3 shrink-0 text-slate-500" />
                            <span>{profile.phone}</span>
                          </div>
                        )}
                        {!profile.email && !profile.phone && <span className="text-slate-500">No contact</span>}
                      </div>
                    </td>
                    <td className="py-4 px-3 hidden lg:table-cell">
                      <p className="font-medium text-slate-200 truncate">{profile.department || "No department"}</p>
                      <p className="text-xs text-slate-400 truncate">{profile.designation || "No designation"}</p>
                    </td>
                    <td className="py-4 px-3">
                      <div className="flex items-center gap-1">
                        {profile.role === "admin" ? <ShieldCheck className="h-3.5 w-3.5 text-blue-400" /> : <UserSoloIcon className="h-3.5 w-3.5 text-slate-400" />}
                        <span className="capitalize font-medium">{profile.role}</span>
                      </div>
                      <Badge className={`mt-2 text-[10px] font-bold ${profile.is_active ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "bg-slate-800 text-slate-400 border border-slate-700"}`}>
                        {profile.is_active ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </td>
                    <td className="py-4 px-3 hidden xl:table-cell">
                      {profile.assigned_sites.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {profile.assigned_sites.slice(0, 2).map((site) => (
                            <Badge key={site.id} className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                              {site.site_name}
                            </Badge>
                          ))}
                          {profile.assigned_sites.length > 2 && (
                            <Badge className="bg-slate-800 text-slate-400 border border-slate-700">+{profile.assigned_sites.length - 2}</Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">Main Office default</span>
                      )}
                    </td>
                    <td className="py-4 px-3">
                      <Badge className={`text-[10px] font-bold whitespace-normal ${profile.face_registered_at ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-800 text-slate-400 border border-slate-700"}`}>
                        {faceStatus(profile)}
                      </Badge>
                    </td>
                    <td className="py-4 px-3">
                      <div className="flex flex-col items-end gap-2">
                        <Button size="sm" variant="outline" className="h-8 w-full max-w-28 border-slate-800 hover:bg-slate-800 text-slate-300" onClick={() => handleEditProfile(profile)}>
                          <Edit3 className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 w-full max-w-28 border-slate-800 hover:bg-slate-800 text-slate-300" onClick={() => openFaceRegistration(profile)}>
                          <Camera className="h-3.5 w-3.5 mr-1" />
                          {profile.face_registered_at ? "Update Face" : "Register"}
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 w-full max-w-28 border-slate-800 hover:bg-slate-800 text-slate-300" onClick={() => openAssignSites(profile)}>
                          <MapPin className="h-3.5 w-3.5 mr-1" />
                          Assign
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) closeEdit(); }}>
        <DialogContent className="max-w-2xl border-slate-800 bg-[#0B1528] text-white">
          <DialogHeader>
            <DialogTitle>Edit Employee Details</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="emp_code" className="text-slate-300">Employee Code</Label>
              <Input id="emp_code" className={inputClass} value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="full_name" className="text-slate-300">Full Name *</Label>
              <Input id="full_name" className={inputClass} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">Email</Label>
              <Input id="email" type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-slate-300">Phone</Label>
              <Input id="phone" className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department" className="text-slate-300">Department</Label>
              <Input id="department" className={inputClass} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="designation" className="text-slate-300">Designation</Label>
              <Input id="designation" className={inputClass} value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role" className="text-slate-300">Role</Label>
              <select id="role" className={selectClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as ProfileRole })}>
                <option value="worker">Worker</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="active" className="text-slate-300">Active Status</Label>
                  <p className="text-xs text-slate-500 mt-1">Inactive users cannot access attendance flows.</p>
                </div>
                <Switch id="active" checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" className="border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800" onClick={closeEdit} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={updateProfile} disabled={isSubmitting} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={(open) => {
        setAssignOpen(open);
        if (!open) {
          setSelectedProfileId(null);
          setSelectedSiteIds([]);
        }
      }}>
        <DialogContent className="max-w-lg border-slate-800 bg-[#0B1528] text-white">
          <DialogHeader>
            <DialogTitle>Assign Sites</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-400">
              Select one or more active sites for {selectedProfile?.full_name || selectedProfile?.display_name || "this employee"}. If none are selected, Main Office is used by default.
            </p>
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {sites.length === 0 ? (
                <div className="rounded-lg border border-slate-800 p-4 text-sm text-slate-400">No active sites available.</div>
              ) : sites.map((site) => {
                const checked = selectedSiteIds.includes(site.id);
                return (
                  <label key={site.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <span>
                      <span className="block font-medium text-slate-100">{site.site_name}</span>
                      {site.is_default && <span className="text-xs text-blue-400">Default office</span>}
                    </span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-blue-600"
                      checked={checked}
                      onChange={(event) => {
                        setSelectedSiteIds((current) => event.target.checked
                          ? [...current, site.id]
                          : current.filter((id) => id !== site.id));
                      }}
                    />
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" className="border-slate-800 text-slate-300 hover:bg-slate-800" onClick={() => setAssignOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={saveSiteAssignments} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Assignments"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {showFaceRegistration && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0B1528] border border-slate-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-400" />
                Register Face
              </h3>
              <button onClick={() => setShowFaceRegistration(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {cameraPermissionError ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 mb-4">
                <p className="font-semibold mb-2">Camera permission denied</p>
                <p className="text-sm">{cameraPermissionError}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-5 gap-2 pb-2">
                  {REGISTRATION_STEPS.map((step, idx) => {
                    const isCaptured = idx < capturedDescriptors.length;
                    const isCurrent = idx === registrationStep;
                    return (
                      <div
                        key={step.label}
                        className={`flex flex-col items-center p-2 rounded-lg border text-center transition-all ${
                          isCaptured
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : isCurrent
                              ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                              : "bg-slate-950/40 border-slate-800 text-slate-500"
                        }`}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider">{idx + 1}</span>
                        <span className="text-[9px] mt-0.5 leading-tight font-medium">{step.label}</span>
                      </div>
                    );
                  })}
                </div>

                {registrationStep < REGISTRATION_STEPS.length ? (
                  <div className="bg-[#162A4E] border border-blue-500/20 rounded-xl p-3.5 text-center text-sm shadow-md">
                    <span className="text-xs uppercase tracking-wider font-extrabold text-blue-400">Current Pose</span>
                    <p className="mt-1 text-slate-200 font-semibold">{REGISTRATION_STEPS[registrationStep].instruction}</p>
                  </div>
                ) : (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3.5 text-center text-sm shadow-md">
                    <span className="text-xs uppercase tracking-wider font-extrabold text-emerald-400">All Poses Captured</span>
                    <p className="mt-1 text-slate-200 font-semibold">Ready to save the face profile.</p>
                  </div>
                )}

                <div className="relative bg-black rounded-lg overflow-hidden border border-slate-700">
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    mirrored
                    screenshotFormat="image/jpeg"
                    className="w-full"
                    onUserMediaError={() => {
                      setCameraPermissionError("Camera permission denied");
                    }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 text-center">
                  Only numeric facial features are stored. Face images are not stored.
                </p>
                <div className="flex flex-wrap gap-3">
                  {registrationStep < REGISTRATION_STEPS.length ? (
                    <Button onClick={captureFaceSample} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold" disabled={isRegisteringFace}>
                      {isRegisteringFace ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Camera className="w-4 h-4 mr-2" />}
                      Capture
                    </Button>
                  ) : (
                    <Button onClick={registerFaceDescriptor} className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold" disabled={isRegisteringFace}>
                      {isRegisteringFace ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Camera className="w-4 h-4 mr-2" />}
                      Save Face Profile
                    </Button>
                  )}
                  {capturedDescriptors.length > 0 && (
                    <Button onClick={resetFaceCapture} variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800" disabled={isRegisteringFace}>
                      Reset
                    </Button>
                  )}
                  <Button onClick={() => setShowFaceRegistration(false)} variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800" disabled={isRegisteringFace}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
