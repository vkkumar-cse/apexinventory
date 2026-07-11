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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import {
  AlertTriangle,
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
import {
  getFaceErrorMessage,
  getFaceFrameDescriptorWithRetry,
  hasValidFaceDescriptors,
  REGISTRATION_STEPS,
  type FaceDescriptor,
} from "@/lib/faceRecognition";

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

const FACE_CAMERA_CONSTRAINTS = {
  width: { ideal: 640 },
  height: { ideal: 480 },
  frameRate: { ideal: 24 },
  facingMode: "user",
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
  const [faceResetProfile, setFaceResetProfile] = useState<EmployeeProfile | null>(null);

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
    if (profile.face_registered_at) {
      toast.info("Face is already registered. Use Reset Face to require re-registration.");
      return;
    }
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
      toast.error("Camera Initializing...");
      return;
    }

    setIsRegisteringFace(true);
    try {
      const frame = await getFaceFrameDescriptorWithRetry(video);
      const newDescriptors = [...capturedDescriptors, frame.descriptor];
      const currentStep = registrationStep + 1;
      setCapturedDescriptors(newDescriptors);

      if (import.meta.env.DEV) {
        console.log("CAPTURED DESCRIPTOR", {
          step: currentStep,
          descriptorCount: newDescriptors.length,
        });
      }

      if (registrationStep < REGISTRATION_STEPS.length - 1) {
        setRegistrationStep(registrationStep + 1);
        toast.success("Captured");
      } else {
        setRegistrationStep(REGISTRATION_STEPS.length);
        toast.success("Captured. Saving...");
        await registerFaceDescriptor(newDescriptors, currentStep);
      }
    } catch (err: any) {
      const message = getFaceErrorMessage(err);
      toast.error(message, {
        description: message === "Only One Face Allowed"
          ? "Only one person should be visible during registration."
          : message === "Move Closer"
            ? "Move closer and keep your face visible in the camera."
            : message === "No Face Detected"
              ? "Please position your face inside the camera frame."
              : undefined,
      });
    } finally {
      setIsRegisteringFace(false);
    }
  };

  const registerFaceDescriptor = async (descriptorsToSave: FaceDescriptor[], saveStep = registrationStep) => {
    const registrationComplete = descriptorsToSave.length === REGISTRATION_STEPS.length;
    if (import.meta.env.DEV) {
      console.log("SAVE FACE PROFILE", {
        descriptorCount: descriptorsToSave?.length,
        descriptors: descriptorsToSave,
        registrationComplete,
        currentStep: saveStep,
        capturedSteps: descriptorsToSave.length,
      });
    }

    if (!selectedProfileId || descriptorsToSave.length !== REGISTRATION_STEPS.length) {
      toast.error("Please capture all 5 face samples first.");
      return;
    }

    if (!hasValidFaceDescriptors(descriptorsToSave)) {
      toast.error("Face capture failed. Reset and capture all 5 samples again.");
      return;
    }

    setIsRegisteringFace(true);
    try {
      const { error } = await (supabase as any)
        .from("employee_face_profiles")
        .upsert({
          profile_id: selectedProfileId,
          face_descriptor: null,
          face_descriptors: descriptorsToSave,
          face_image_path: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "profile_id" });

      if (error) throw error;

      if (import.meta.env.DEV) {
        console.log("FACE REGISTRATION", {
          samplesCaptured: descriptorsToSave.length,
          descriptorLength: descriptorsToSave[0]?.length ?? 0,
          descriptorsStored: descriptorsToSave.length,
        });
      }

      toast.success("Registration Complete");
      setShowFaceRegistration(false);
      setSelectedProfileId(null);
      await fetchProfiles();
    } catch (err: any) {
      toast.error("Face registration failed");
    } finally {
      setIsRegisteringFace(false);
    }
  };

  const resetFaceCapture = () => {
    setRegistrationStep(0);
    setCapturedDescriptors([]);
    toast.success("Face registration reset.");
  };

  const openResetFaceDialog = (profile: EmployeeProfile) => {
    if (!profile.face_registered_at) {
      toast.info("Face Registration Required");
      return;
    }

    setFaceResetProfile(profile);
  };

  const confirmResetFaceProfile = async () => {
    if (!faceResetProfile) return;

    setIsSubmitting(true);
    try {
      const { error } = await (supabase as any)
        .from("employee_face_profiles")
        .delete()
        .eq("profile_id", faceResetProfile.id);

      if (error) throw error;

      toast.success("Face profile reset. Re-registration is now required.");
      setFaceResetProfile(null);
      await fetchProfiles();
    } catch (err: any) {
      toast.error(err.message || "Failed to reset face profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  const faceStatus = (profile: EmployeeProfile) => profile.face_registered_at ? "Face Registered · Verified" : "Face Registration Required";

  return (
    <div className="min-h-[calc(100vh-100px)] max-w-full space-y-6 overflow-x-hidden rounded-2xl border border-slate-800 bg-[#0B1528] p-4 text-white shadow-2xl md:p-8">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 break-words text-2xl font-extrabold tracking-tight sm:text-3xl">
          <UsersIcon className="h-7 w-7 shrink-0 text-blue-500 sm:h-8 sm:w-8" />
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
            <>
              <div className="space-y-4 xl:hidden">
                {profiles.map((profile) => (
                  <div key={profile.id} className="rounded-xl border border-slate-800 bg-[#0B1528]/80 p-4 shadow-sm">
                    <div className="min-w-0 space-y-4">
                      <div className="min-w-0">
                        <p className="break-words text-lg font-bold uppercase leading-snug text-slate-100">
                          {profile.full_name || profile.display_name || "New User"}
                        </p>
                        <p className="mt-1 break-all text-sm text-slate-400">
                          {profile.email || "No email"}
                        </p>
                        <p className="mt-1 break-words text-xs text-slate-500">
                          {profile.employee_code || "No employee code"}
                        </p>
                      </div>

                      <div className="grid gap-3 rounded-lg border border-slate-800/80 bg-slate-950/30 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-slate-400">Role</span>
                          <span className="flex items-center gap-1.5 font-semibold capitalize text-slate-100">
                            {profile.role === "admin" ? <ShieldCheck className="h-4 w-4 text-blue-400" /> : <UserSoloIcon className="h-4 w-4 text-slate-400" />}
                            {profile.role}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-slate-400">Status</span>
                          <Badge className={`text-[11px] font-bold ${profile.is_active ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "bg-slate-800 text-slate-400 border border-slate-700"}`}>
                            {profile.is_active ? "ACTIVE" : "INACTIVE"}
                          </Badge>
                        </div>
                        <div className="min-w-0">
                          <span className="block text-slate-400">Department</span>
                          <span className="mt-1 block break-words font-medium text-slate-200">
                            {[profile.department, profile.designation].filter(Boolean).join(" / ") || "No department"}
                          </span>
                        </div>
                        {(profile.phone || profile.email) && (
                          <div className="space-y-1 text-xs text-slate-400">
                            {profile.phone && (
                              <div className="flex min-w-0 items-center gap-2">
                                <Phone className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                                <span className="break-words">{profile.phone}</span>
                              </div>
                            )}
                            {profile.email && (
                              <div className="flex min-w-0 items-center gap-2">
                                <Mail className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                                <span className="break-all">{profile.email}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Face</p>
                        <Badge className={`w-fit whitespace-normal text-[11px] font-bold ${profile.face_registered_at ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-800 text-slate-400 border border-slate-700"}`}>
                          {faceStatus(profile)}
                        </Badge>
                      </div>

                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned Sites</p>
                        <div className="flex flex-wrap gap-2">
                          {profile.assigned_sites.length > 0 ? (
                            profile.assigned_sites.map((site) => (
                              <Badge key={site.id} className="max-w-full break-words bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                {site.site_name}
                              </Badge>
                            ))
                          ) : (
                            <Badge className="max-w-full break-words bg-slate-800 text-slate-400 border border-slate-700">
                              Main Office default
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-2 pt-1">
                        <Button variant="outline" className="min-h-11 w-full justify-center border-slate-800 text-slate-300 hover:bg-slate-800" onClick={() => handleEditProfile(profile)}>
                          <Edit3 className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                        {profile.face_registered_at ? (
                          <Button variant="outline" className="min-h-11 w-full justify-center border-amber-500/30 text-amber-300 hover:bg-amber-500/10" onClick={() => openResetFaceDialog(profile)} disabled={isSubmitting}>
                            <Camera className="mr-2 h-4 w-4" />
                            Reset Face
                          </Button>
                        ) : (
                          <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-center text-xs font-semibold text-slate-400">
                            Face Registration Required
                          </div>
                        )}
                        <Button variant="outline" className="min-h-11 w-full justify-center border-slate-800 text-slate-300 hover:bg-slate-800" onClick={() => openAssignSites(profile)}>
                          <MapPin className="mr-2 h-4 w-4" />
                          Assign Sites
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden xl:block">
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
                            {profile.face_registered_at ? (
                              <Button size="sm" variant="outline" className="h-8 w-full max-w-28 border-amber-500/30 hover:bg-amber-500/10 text-amber-300" onClick={() => openResetFaceDialog(profile)} disabled={isSubmitting}>
                                <Camera className="h-3.5 w-3.5 mr-1" />
                                Reset Face
                              </Button>
                            ) : (
                              <span className="w-full max-w-28 rounded-md border border-slate-800 px-2 py-1 text-center text-[10px] font-semibold text-slate-500">
                                Required
                              </span>
                            )}
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
              </div>
            </>
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
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="min-h-11 w-full border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 sm:w-auto" onClick={closeEdit} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={updateProfile} disabled={isSubmitting} className="min-h-11 w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold sm:w-auto">
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
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" className="min-h-11 w-full border-slate-800 text-slate-300 hover:bg-slate-800 sm:w-auto" onClick={() => setAssignOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={saveSiteAssignments} disabled={isSubmitting} className="min-h-11 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold sm:w-auto">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Assignments"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(faceResetProfile)} onOpenChange={(open) => {
        if (!open) setFaceResetProfile(null);
      }}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-slate-800 bg-[#0B1528] p-5 text-white shadow-2xl sm:p-6">
          <AlertDialogHeader className="items-center text-center sm:items-start sm:text-left">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-red-500/25 bg-red-500/10 text-red-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <AlertDialogTitle className="text-xl font-extrabold text-white">
              Reset Face Registration
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-6 text-slate-400">
              This will remove the saved face registration for {faceResetProfile?.full_name || faceResetProfile?.display_name || faceResetProfile?.email || "this employee"}. The employee must register their face again before they can use face verification for attendance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:space-x-0">
            <AlertDialogCancel className="min-h-11 w-full border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white sm:w-auto" disabled={isSubmitting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 w-full bg-red-600 font-bold text-white hover:bg-red-700 sm:w-auto"
              disabled={isSubmitting}
              onClick={confirmResetFaceProfile}
            >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reset Face
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showFaceRegistration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-[#0B1528] p-4 shadow-2xl sm:p-6">
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
                <p className="font-semibold mb-2">Camera Permission Denied</p>
                <p className="text-sm">{cameraPermissionError}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-5 gap-1.5 pb-2 sm:gap-2">
                  {REGISTRATION_STEPS.map((step, idx) => {
                    const isCaptured = idx < capturedDescriptors.length;
                    const isCurrent = idx === registrationStep;
                    return (
                      <div
                        key={step.label}
                        className={`flex flex-col items-center rounded-lg border p-1.5 text-center transition-all sm:p-2 ${
                          isCaptured
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : isCurrent
                              ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                              : "bg-slate-950/40 border-slate-800 text-slate-500"
                        }`}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider">{idx + 1}</span>
                        <span className="mt-0.5 hidden text-[9px] font-medium leading-tight min-[390px]:block">{step.label}</span>
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
                    <p className="mt-1 text-slate-200 font-semibold">Registration Complete</p>
                  </div>
                )}

                <div className="relative bg-black rounded-lg overflow-hidden border border-slate-700">
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    mirrored
                    videoConstraints={FACE_CAMERA_CONSTRAINTS}
                    screenshotFormat="image/jpeg"
                    className="w-full"
                    onUserMediaError={() => {
                      setCameraPermissionError("Camera Permission Denied");
                    }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 text-center">
                  Only numeric facial features are stored. Face images are not stored.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {registrationStep < REGISTRATION_STEPS.length ? (
                    <Button onClick={captureFaceSample} className="min-h-11 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold" disabled={isRegisteringFace}>
                      {isRegisteringFace ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Camera className="w-4 h-4 mr-2" />}
                      Capture
                    </Button>
                  ) : (
                    <div className="flex min-h-11 w-full items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-4 text-sm font-bold text-emerald-300">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving Face Profile
                    </div>
                  )}
                  {capturedDescriptors.length > 0 && (
                    <Button onClick={resetFaceCapture} variant="outline" className="min-h-11 w-full border-slate-700 text-slate-300 hover:bg-slate-800" disabled={isRegisteringFace}>
                      Reset
                    </Button>
                  )}
                  <Button onClick={() => setShowFaceRegistration(false)} variant="outline" className="min-h-11 w-full border-slate-700 text-slate-300 hover:bg-slate-800" disabled={isRegisteringFace}>
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
