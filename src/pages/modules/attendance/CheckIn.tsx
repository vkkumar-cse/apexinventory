import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { formatDurationHours } from "@/lib/formatDuration";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { 
  MapPin, 
  Navigation, 
  User, 
  Calendar, 
  Clock, 
  Trash2, 
  Shield, 
  Info, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2,
  Hourglass,
  Camera,
  X,
} from "lucide-react";
import Webcam from "react-webcam";
import {
  FACE_MATCH_THRESHOLD,
  getFaceErrorMessage,
  getFaceFrameDescriptorWithRetry,
  hasValidFaceDescriptors,
  loadFaceModels,
  normalizeFaceDescriptors,
  REGISTRATION_STEPS,
  verifyFaceAcrossFrames,
  type FaceDescriptor,
} from "@/lib/faceRecognition";

type ProfileLite = {
  id: string;
  employee_code: string | null;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  status: string | null;
  is_active: boolean | null;
};

type EmployeeFaceProfile = {
  id: string;
  profile_id: string;
  face_descriptor: FaceDescriptor | null;
  face_descriptors: FaceDescriptor[] | null;
  face_image_path: string | null;
  registered_at: string | null;
  updated_at: string | null;
};

type AttendanceSession = {
  id: string;
  profile_id: string;
  attendance_date: string;
  site_id: string | null;
  site_name_snapshot: string;
  check_in: string;
  check_out: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  check_out_latitude: number | null;
  check_out_longitude: number | null;
  check_in_distance_meters: number | null;
  check_out_distance_meters: number | null;
  face_verified: boolean;
  face_match_score: number | null;
  status: string;
};

const DEMO_MODE = false;

const DEFAULT_MINIMUM_FULL_DAY_HOURS = 8;
const FACE_CAMERA_CONSTRAINTS = {
  width: { ideal: 640 },
  height: { ideal: 480 },
  frameRate: { ideal: 24 },
  facingMode: "user",
};

type AttendanceSite = {
  id: string;
  site_name: string;
  latitude: number | string;
  longitude: number | string;
  radius_meters: number;
  is_default: boolean;
  is_active: boolean;
};

type SiteValidation = {
  site: AttendanceSite;
  distance: number;
  inside: boolean;
};

type VerifiedGpsCoords = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export default function CheckIn() {
  const { user, displayName } = useAuth();
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceSession[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [faceProfile, setFaceProfile] = useState<EmployeeFaceProfile | null>(null);
  
  // Geolocation State
  const [currentCoords, setCurrentCoords] = useState<VerifiedGpsCoords | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "fetching" | "success" | "error">("idle");
  const [allowedSites, setAllowedSites] = useState<AttendanceSite[]>([]);
  const [selectedAttendanceSiteId, setSelectedAttendanceSiteId] = useState("");
  const [siteValidation, setSiteValidation] = useState<SiteValidation | null>(null);

  // Webcam & Face Verification State
  const webcamRef = useRef<Webcam>(null);
  const [showFaceCamera, setShowFaceCamera] = useState(false);
  const [showFaceRegistration, setShowFaceRegistration] = useState(false);
  const [isVerifyingFace, setIsVerifyingFace] = useState(false);
  const [isRegisteringFace, setIsRegisteringFace] = useState(false);
  const [cameraPermissionError, setCameraPermissionError] = useState<string | null>(null);
  const [registrationStep, setRegistrationStep] = useState(0);
  const [capturedDescriptors, setCapturedDescriptors] = useState<FaceDescriptor[]>([]);
  const [pendingCoords, setPendingCoords] = useState<VerifiedGpsCoords | null>(null);
  const [pendingSiteValidation, setPendingSiteValidation] = useState<SiteValidation | null>(null);
  const [pendingOpenSession, setPendingOpenSession] = useState<AttendanceSession | null>(null);
  const [pendingAction, setPendingAction] = useState<"check_in" | "check_out" | null>(null);
  const currentProfileId = user?.id ?? "";
  const currentProfile = profiles.find((profile) => profile.id === currentProfileId);
  const currentProfileName =
    currentProfile?.full_name ||
    currentProfile?.display_name ||
    displayName ||
    currentProfile?.email ||
    user?.email ||
    "Your profile";
  const storedFaceDescriptors = normalizeFaceDescriptors(faceProfile);
  const hasValidFaceProfile = hasValidFaceDescriptors(storedFaceDescriptors);
  const isOpenAttendanceSession = (record: AttendanceSession | null | undefined) => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return Boolean(record && !record.check_out && record.status === "open" && record.attendance_date === today);
  };
  const activeSession = todayAttendance.find((record) => isOpenAttendanceSession(record)) ?? null;
  const selectedSite = allowedSites.find((site) => site.id === selectedAttendanceSiteId) ?? null;
  const canUseVerifiedGps = Boolean(
    siteValidation?.inside &&
    selectedSite &&
    siteValidation.site.id === selectedSite.id &&
    locationStatus === "success"
  );
  const totalCompletedHours = todayAttendance.reduce((total, record) => {
    if (!record.check_out) return total;
    const diffMs = new Date(record.check_out).getTime() - new Date(record.check_in).getTime();
    return total + Math.max(0, diffMs / (1000 * 60 * 60));
  }, 0);

  const getTodayDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const logAttendanceState = (label: string, openSession: AttendanceSession | null, activeSite?: AttendanceSite | null) => {
    if (!import.meta.env.DEV) return;

    console.log(label, {
      openSession,
      assignedSites: allowedSites,
      activeSite: activeSite ?? null,
      currentAttendanceState: {
        currentProfileId,
        todayAttendance,
        activeSession,
        hasOpenSession: Boolean(openSession),
      },
    });
  };

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .from("profiles" as any)
      .select("id, full_name, display_name, email, employee_code, status, is_active")
      .eq("status", "approved")
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (!error && data) setProfiles(data as unknown as ProfileLite[]);
  };

  const fetchFaceProfile = async () => {
    if (!currentProfileId) {
      setFaceProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from("employee_face_profiles" as any)
      .select("id, profile_id, face_descriptor, face_descriptors, face_image_path, registered_at, updated_at")
      .eq("profile_id", currentProfileId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching face profile:", error);
      setFaceProfile(null);
      return;
    }

    setFaceProfile(data as unknown as EmployeeFaceProfile | null);
  };

  const fetchLatestFaceProfile = async (): Promise<EmployeeFaceProfile | null> => {
    if (!currentProfileId) return null;

    const { data, error } = await supabase
      .from("employee_face_profiles" as any)
      .select("id, profile_id, face_descriptor, face_descriptors, face_image_path, registered_at, updated_at")
      .eq("profile_id", currentProfileId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching face profile:", error);
      setFaceProfile(null);
      return null;
    }

    const nextFaceProfile = data as unknown as EmployeeFaceProfile | null;
    setFaceProfile(nextFaceProfile);
    return nextFaceProfile;
  };

  const fetchTodayAttendance = async () => {
    const today = getTodayDateString();
    
    const { data, error } = await supabase
      .from("attendance_sessions" as any)
      .select("*")
      .eq("profile_id", currentProfileId)
      .eq("attendance_date", today)
      .order("check_in", { ascending: false });

    if (!error && data) {
      setTodayAttendance(data as unknown as AttendanceSession[]);
    } else if (error) {
      console.error("Error fetching attendance:", error);
    }
  };

  const fetchAllowedSites = async () => {
    if (!currentProfileId) {
      setAllowedSites([]);
      return;
    }

    try {
      const { data: assignments, error: assignmentError } = await (supabase as any)
        .from("employee_site_assignments")
        .select("attendance_sites(id,site_name,latitude,longitude,radius_meters,is_default,is_active)")
        .eq("profile_id", currentProfileId);

      if (assignmentError) throw assignmentError;

      const assignedSites = ((assignments ?? []) as any[])
        .map((row) => row.attendance_sites)
        .filter((site): site is AttendanceSite => Boolean(site?.id && site.is_active));

      if (assignedSites.length > 0) {
        if (import.meta.env.DEV) console.log("assignedSites", assignedSites);
        setAllowedSites(assignedSites);
        return;
      }

      if (import.meta.env.DEV) console.log("assignedSites", []);
      const { data: defaultSite, error: defaultError } = await (supabase as any)
        .from("attendance_sites")
        .select("id,site_name,latitude,longitude,radius_meters,is_default,is_active")
        .eq("is_default", true)
        .eq("is_active", true)
        .maybeSingle();

      if (defaultError) throw defaultError;
      if (!defaultSite) {
        setAllowedSites([]);
        toast.error("No active default Main Office site is configured.");
        return;
      }

      setAllowedSites([defaultSite as AttendanceSite]);
    } catch (err: any) {
      setAllowedSites([]);
      toast.error(err.message || "Failed to load attendance sites");
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  useEffect(() => {
    fetchFaceProfile();
    fetchAllowedSites();
    fetchTodayAttendance();
  }, [currentProfileId]);

  useEffect(() => {
    if (!showFaceCamera && !showFaceRegistration) return;
    loadFaceModels().catch(() => {
      setCameraPermissionError("Camera Initializing...");
    });
  }, [showFaceCamera, showFaceRegistration]);

  useEffect(() => {
    const lockedSiteId = activeSession?.site_id ?? "";
    if (lockedSiteId && selectedAttendanceSiteId !== lockedSiteId) {
      setSelectedAttendanceSiteId(lockedSiteId);
      return;
    }

    if (!lockedSiteId && !selectedAttendanceSiteId && allowedSites.length > 0) {
      setSelectedAttendanceSiteId(allowedSites[0].id);
      return;
    }

    if (!lockedSiteId && selectedAttendanceSiteId && !allowedSites.some((site) => site.id === selectedAttendanceSiteId)) {
      setSelectedAttendanceSiteId(allowedSites[0]?.id ?? "");
    }
  }, [activeSession?.site_id, allowedSites, selectedAttendanceSiteId]);

  useEffect(() => {
    setCurrentCoords(null);
    setSiteValidation(null);
    setLocationStatus("idle");
  }, [selectedAttendanceSiteId]);

  // Haversine formula to calculate distance in meters
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // distance in meters
  };

  // Get current real browser position.
  const getCoordinates = (): Promise<VerifiedGpsCoords> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          const accuracy = position.coords.accuracy;

          if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy)) {
            reject(new Error("Browser GPS did not return valid device location data."));
            return;
          }

          resolve({
            latitude,
            longitude,
            accuracy,
          });
        },
        (error) => {
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const getMinimumFullDayHours = async () => {
    const { data, error } = await (supabase as any)
      .from("attendance_settings")
      .select("value")
      .eq("key", "minimum_full_day_hours")
      .maybeSingle();

    if (error) {
      console.warn("Failed to load attendance settings:", error);
      return DEFAULT_MINIMUM_FULL_DAY_HOURS;
    }

    const value = Number(data?.value ?? DEFAULT_MINIMUM_FULL_DAY_HOURS);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_MINIMUM_FULL_DAY_HOURS;
  };

  const fetchOpenSession = async () => {
    if (!currentProfileId) return null;

    const { data, error } = await (supabase as any)
      .from("attendance_sessions")
      .select("*")
      .eq("profile_id", currentProfileId)
      .eq("attendance_date", getTodayDateString())
      .is("check_out", null)
      .eq("status", "open")
      .order("check_in", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const openSession = data as AttendanceSession | null;
    if (import.meta.env.DEV) console.log("openSession", openSession);
    return openSession;
  };

  const verifyGpsLocation = async (requiredSiteId?: string | null, openSession?: AttendanceSession | null) => {
    setIsLocating(true);
    setLocationStatus("fetching");
    try {
      if (allowedSites.length === 0) {
        throw new Error("No attendance site is available for your profile. Contact an admin.");
      }

      const siteIdToValidate = requiredSiteId ?? selectedAttendanceSiteId;
      if (!siteIdToValidate) {
        throw new Error("Select Attendance Site before GPS verification.");
      }

      const selectedCandidate = allowedSites.find((site) => site.id === siteIdToValidate) ?? null;

      if (isOpenAttendanceSession(openSession) && requiredSiteId && !selectedCandidate) {
        logAttendanceState("currentAttendanceState", openSession ?? null, null);
        throw new Error("Your check-out site is no longer active or assigned. Contact an admin.");
      }

      if (!selectedCandidate) {
        throw new Error("Selected attendance site is not active or assigned.");
      }

      const coords = await getCoordinates();
      const distance = calculateDistance(coords.latitude, coords.longitude, Number(selectedCandidate.latitude), Number(selectedCandidate.longitude));
      const validation: SiteValidation = {
        site: selectedCandidate,
        distance,
        inside: distance <= selectedCandidate.radius_meters,
      };

      setCurrentCoords(coords);
      setSiteValidation(validation);
      if (import.meta.env.DEV) console.log("activeSite", validation.site);
      logAttendanceState("currentAttendanceState", openSession ?? null, validation.site);

      if (!validation.inside) {
        setLocationStatus("error");
        toast.error("Out of Premises", {
          description: `${validation.site.site_name}: ${Math.round(validation.distance)}m away. Radius ${validation.site.radius_meters}m.`,
        });
        return null;
      }

      setLocationStatus("success");
      toast.success("GPS Verified");
      return { coords, validation };
    } catch (error: any) {
      let errMsg = "GPS verification failed";
      if (error?.message) errMsg = error.message;
      if (error?.code === 1) errMsg = "GPS permission denied. Please grant location access.";
      else if (error?.code === 2) errMsg = "Location unavailable. Please make sure GPS is enabled.";
      else if (error?.code === 3) errMsg = "Location request timed out. Please try again.";
      toast.error(errMsg);
      setLocationStatus("error");
      return null;
    } finally {
      setIsLocating(false);
    }
  };

  const saveAttendance = async (
    coords: VerifiedGpsCoords,
    validation: SiteValidation,
    faceMatchScore: number
  ) => {
    const today = getTodayDateString();
    const now = new Date();
    const nowISO = now.toISOString();

    const summarizeSessions = async () => {
      const { data: sessionsRaw, error: sessionsError } = await (supabase as any)
        .from("attendance_sessions")
        .select("*")
        .eq("profile_id", currentProfileId)
        .eq("attendance_date", today)
        .order("check_in", { ascending: true });

      if (sessionsError) throw sessionsError;

      const sessions = (sessionsRaw ?? []) as AttendanceSession[];
      const firstSession = sessions[0];
      if (!firstSession) return;

      const completedSessions = sessions.filter((session) => Boolean(session.check_out));
      const hasOpenSession = sessions.some((session) => !session.check_out && session.status === "open");
      const minimumFullDayHours = await getMinimumFullDayHours();
      const workingHours = completedSessions.reduce((total, session) => {
        const diffMs = new Date(session.check_out as string).getTime() - new Date(session.check_in).getTime();
        return total + Math.max(0, diffMs / (1000 * 60 * 60));
      }, 0);
      const latestCompleted = completedSessions[completedSessions.length - 1] ?? null;
      const latestSession = sessions[sessions.length - 1] ?? firstSession;
      const firstCheckIn = new Date(firstSession.check_in);
      const limitTime = new Date(firstCheckIn);
      limitTime.setHours(9, 15, 0, 0);
      const isLate = firstCheckIn.getTime() > limitTime.getTime();
      const calculatedStatus = completedSessions.length === 0
        ? "absent"
        : workingHours < minimumFullDayHours
          ? "half-day"
          : isLate
            ? "late"
            : "present";
      const summaryPayload = {
        employee_id: currentProfileId,
        attendance_date: today,
        check_in: firstSession.check_in,
        check_out: latestCompleted?.check_out ?? null,
        working_hours: Number(workingHours.toFixed(2)),
        status: calculatedStatus,
        latitude: latestSession.check_out_latitude ?? latestSession.check_in_latitude,
        longitude: latestSession.check_out_longitude ?? latestSession.check_in_longitude,
        gps_verified: true,
        face_verified: sessions.every((session) => session.face_verified),
        face_match_score: latestSession.face_match_score,
        distance_meters: latestSession.check_out_distance_meters ?? latestSession.check_in_distance_meters,
        site_id: latestSession.site_id,
        site_name_snapshot: latestSession.site_name_snapshot,
      };

      const { data: existingDaily, error: dailyFetchError } = await (supabase as any)
        .from("attendance")
        .select("id")
        .eq("employee_id", currentProfileId)
        .eq("attendance_date", today)
        .order("check_in", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (dailyFetchError) throw dailyFetchError;

      const result = existingDaily?.id
        ? await (supabase as any).from("attendance").update(summaryPayload).eq("id", existingDaily.id)
        : await (supabase as any).from("attendance").insert(summaryPayload);

      if (result.error) throw result.error;
    };

    const { data, error: fetchError } = await (supabase as any)
      .from("attendance_sessions")
      .select("*")
      .eq("profile_id", currentProfileId)
      .eq("attendance_date", today)
      .is("check_out", null)
      .eq("status", "open")
      .order("check_in", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const openSession = data as AttendanceSession | null;

    if (!openSession) {
      const { error } = await (supabase as any).from("attendance_sessions").insert({
        profile_id: currentProfileId,
        attendance_date: today,
        site_id: validation.site.id,
        site_name_snapshot: validation.site.site_name,
        check_in: nowISO,
        check_in_latitude: coords.latitude,
        check_in_longitude: coords.longitude,
        check_in_distance_meters: validation.distance,
        face_verified: true,
        face_match_score: faceMatchScore,
        status: "open",
      } as any);

      if (error) throw error;
      await summarizeSessions();
      toast.success(`Check-in successful at ${validation.site.site_name}`);
      return;
    }

    if (openSession.site_id !== validation.site.id) {
      toast.error("Check-Out Must Be From Same Site", {
        description: `Current active session is at ${openSession.site_name_snapshot}.`,
      });
      return;
    }

    const checkOutTimestamp = nowISO;
    const checkInTime = new Date(openSession.check_in).getTime();
    const checkOutTime = new Date(checkOutTimestamp).getTime();
    const sessionHours = Number(((checkOutTime - checkInTime) / (1000 * 60 * 60)).toFixed(2));

    const { error } = await (supabase as any)
      .from("attendance_sessions")
      .update({
        check_out: nowISO,
        check_out_latitude: coords.latitude,
        check_out_longitude: coords.longitude,
        check_out_distance_meters: validation.distance,
        face_verified: true,
        face_match_score: faceMatchScore,
        status: "completed",
      } as any)
      .eq("id", openSession.id);

    if (error) throw error;
    await summarizeSessions();
    toast.success(`Check-out successful from ${openSession.site_name_snapshot}. Session: ${formatDurationHours(sessionHours)}`);
  };

  const handleMarkAttendance = async () => {
    if (!currentProfileId) {
      toast.error("No active profile found");
      return;
    }

    if (!selectedSite) {
      toast.error("Select Attendance Site");
      return;
    }

    if (!canUseVerifiedGps || !currentCoords || !siteValidation) {
      toast.error("Verify GPS before continuing");
      return;
    }

    const latestFaceProfile = await fetchLatestFaceProfile();
    if (!hasValidFaceDescriptors(normalizeFaceDescriptors(latestFaceProfile))) {
      toast.error("Please register face before attendance");
      return;
    }

    setIsSubmitting(true);

    try {
      const openSessionForAction = await fetchOpenSession();
      logAttendanceState("currentAttendanceState", openSessionForAction, openSessionForAction?.site_id ? allowedSites.find((site) => site.id === openSessionForAction.site_id) ?? null : null);

      if (openSessionForAction?.site_id && openSessionForAction.site_id !== siteValidation.site.id) {
        toast.error("Check-Out Must Be From Same Site", {
          description: `Current active session is at ${openSessionForAction.site_name_snapshot}.`,
        });
        setIsSubmitting(false);
        return;
      }

      if (!openSessionForAction && activeSession) {
        toast.error("Attendance session changed", {
          description: "Please refresh and try again.",
        });
        setIsSubmitting(false);
        return;
      }

      setPendingCoords(currentCoords);
      setPendingSiteValidation(siteValidation);
      setPendingOpenSession(openSessionForAction);
      setPendingAction(openSessionForAction ? "check_out" : "check_in");
      setCameraPermissionError(null);
      setShowFaceCamera(true);
    } catch (error: any) {
      let errMsg = "An error occurred";
      if (error && error.message) {
        errMsg = error.message;
      }
      if (error && error.code === 1) {
        errMsg = "GPS permission denied. Please grant location access.";
      } else if (error && error.code === 2) {
        errMsg = "Location unavailable. Please make sure GPS is enabled.";
      } else if (error && error.code === 3) {
        errMsg = "Location request timed out. Please try again.";
      }
      toast.error(errMsg);
      setLocationStatus("error");
      setIsSubmitting(false);
    } finally {
    }
  };

  const handleVerifyGps = async () => {
    try {
      const openSession = await fetchOpenSession();
      if (openSession?.site_id) {
        setSelectedAttendanceSiteId(openSession.site_id);
        await verifyGpsLocation(openSession.site_id, openSession);
        return;
      }

      if (!selectedAttendanceSiteId) {
        toast.error("Select Attendance Site");
        return;
      }

      await verifyGpsLocation(selectedAttendanceSiteId, null);
    } catch (error: any) {
      toast.error(error?.message || "GPS verification failed");
      setLocationStatus("error");
    }
  };

  const deleteAttendance = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this attendance record?")) return;

    const { error } = await (supabase as any).from("attendance_sessions").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Attendance deleted successfully");
    fetchTodayAttendance();
  };

  const verifyFaceAndSaveAttendance = async () => {
    const video = webcamRef.current?.video;
    
    if (!video) {
      toast.error("Camera Not Ready");
      return;
    }

    if (cameraPermissionError) {
      toast.error("Camera Permission Denied", {
        description: "Camera access is required for face verification."
      });
      return;
    }

    const storedDescriptors = normalizeFaceDescriptors(faceProfile);
    if (!hasValidFaceDescriptors(storedDescriptors)) {
      toast.error("Registration Required", {
        description: "Please register your face before marking attendance."
      });
      return;
    }

    if (!pendingCoords || !pendingSiteValidation?.inside) {
      toast.error("Outside allowed site radius", {
        description: "Attendance is allowed only within your validated attendance site."
      });
      return;
    }

    setIsVerifyingFace(true);
    try {
      const match = await verifyFaceAcrossFrames(video, storedDescriptors);
      const threshold = FACE_MATCH_THRESHOLD;
      const faceDistance = match.distance;
      const faceScore = match.score;
      const faceMatchPercentage = Math.round(faceScore * 100);
      const faceVerified = faceDistance <= threshold;
      
      const gpsVerified = pendingCoords !== null && pendingSiteValidation?.inside === true;
      const distanceMeters = pendingSiteValidation?.distance ?? null;

      if (import.meta.env.DEV) {
        console.log("FACE VERIFICATION", {
          faceDistance,
          threshold,
          matched: faceVerified,
          detectionScore: match.detectionScore,
          faceMatchPercentage,
          processingTime: match.processingTime,
          descriptorMatched: match.bestDescriptorIndex,
          frameMatched: match.bestFrame,
        });

        console.log("FINAL ATTENDANCE CHECK", {
          gpsVerified,
          distanceMeters,
          distance: faceDistance,
          score: faceScore,
          descriptorMatched: match.bestDescriptorIndex,
          frameMatched: match.bestFrame,
          faceMatchPercentage,
          faceVerified,
          framesChecked: match.framesChecked,
          validFrames: match.validFrames,
        });
      }

      if (!faceVerified) {
        toast.error("Face Not Matched");
        return;
      }

      if (!gpsVerified || !pendingCoords || !pendingSiteValidation || distanceMeters === null || distanceMeters > pendingSiteValidation.site.radius_meters) {
        toast.error("Outside allowed site radius", {
          description: "Attendance is allowed only within your validated attendance site."
        });
        return;
      }

      const openSessionForCheckout = await fetchOpenSession();
      if (pendingAction === "check_in" && openSessionForCheckout) {
        toast.error("Attendance session changed", {
          description: "Please restart attendance verification."
        });
        return;
      }
      if (pendingAction === "check_out" && (!pendingOpenSession?.id || openSessionForCheckout?.id !== pendingOpenSession.id)) {
        toast.error("Attendance session changed", {
          description: "Please restart attendance verification."
        });
        return;
      }
      if (openSessionForCheckout?.site_id && openSessionForCheckout.site_id !== pendingSiteValidation.site.id) {
        toast.error("Check-Out Must Be From Same Site", {
          description: `Current active session is at ${openSessionForCheckout.site_name_snapshot}.`,
        });
        return;
      }

      await saveAttendance(pendingCoords, pendingSiteValidation, faceScore);
      setShowFaceCamera(false);
      setPendingCoords(null);
      setPendingSiteValidation(null);
      setPendingOpenSession(null);
      setPendingAction(null);
      await fetchTodayAttendance();
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.log("FACE VERIFICATION", {
          faceDistance: null,
          threshold: FACE_MATCH_THRESHOLD,
          matched: false,
          detectionScore: null,
          faceMatchPercentage: 0,
          processingTime: null
        });
      }

      const message = getFaceErrorMessage(error);
      toast.error(message, {
        description: message === "Only One Face Allowed"
          ? "Only one person should be visible."
          : message === "Move Closer"
            ? "Move closer and keep your face visible in the camera."
            : message === "No Face Detected"
              ? "Please position your face inside the camera frame."
              : undefined,
      });
    } finally {
      setIsVerifyingFace(false);
      setIsSubmitting(false);
    }
  };

  const resetFaceCamera = () => {
    setShowFaceCamera(false);
    setPendingCoords(null);
    setPendingSiteValidation(null);
    setPendingOpenSession(null);
    setPendingAction(null);
    setCameraPermissionError(null);
    setIsSubmitting(false);
  };

  const openFaceRegistration = async () => {
    const latestFaceProfile = await fetchLatestFaceProfile();
    if (hasValidFaceDescriptors(normalizeFaceDescriptors(latestFaceProfile))) {
      toast.success("Face Registered", {
        description: "Verified. Admin reset is required before re-registration.",
      });
      return;
    }

    setCameraPermissionError(null);
    setRegistrationStep(0);
    setCapturedDescriptors([]);
    setShowFaceRegistration(true);
  };

  const resetFaceRegistrationCamera = () => {
    setShowFaceRegistration(false);
    setCameraPermissionError(null);
    setIsRegisteringFace(false);
    setRegistrationStep(0);
    setCapturedDescriptors([]);
  };

  const captureFaceSample = async () => {
    const video = webcamRef.current?.video;
    if (!currentProfileId || !video) {
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
        await registerFaceProfile(newDescriptors, currentStep);
      }
    } catch (error: any) {
      const message = getFaceErrorMessage(error);
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

  const registerFaceProfile = async (descriptorsToSave: FaceDescriptor[], saveStep = registrationStep) => {
    if (!currentProfileId) {
      toast.error("Camera Initializing...");
      return;
    }

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

    if (!hasValidFaceDescriptors(descriptorsToSave) || descriptorsToSave.length !== REGISTRATION_STEPS.length) {
      toast.error("Please capture all 5 face samples first.");
      return;
    }

    setIsRegisteringFace(true);
    try {
      const latestFaceProfile = await fetchLatestFaceProfile();
      if (hasValidFaceDescriptors(normalizeFaceDescriptors(latestFaceProfile))) {
        toast.error("Face already registered", {
          description: "Admin reset is required before re-registration.",
        });
        resetFaceRegistrationCamera();
        return;
      }

      const { error } = await (supabase as any)
        .from("employee_face_profiles")
        .insert({
          profile_id: currentProfileId,
          face_descriptor: null,
          face_descriptors: descriptorsToSave,
          face_image_path: null,
        });

      if (error) throw error;

      if (import.meta.env.DEV) {
        console.log("FACE REGISTRATION", {
          samplesCaptured: descriptorsToSave.length,
          descriptorLength: descriptorsToSave[0]?.length ?? 0,
          descriptorsStored: descriptorsToSave.length,
        });
      }

      toast.success("Registration Complete");
      resetFaceRegistrationCamera();
      await fetchFaceProfile();
    } catch (error: any) {
      const message = error?.message || "";
      if (message.includes("duplicate") || message.includes("employee_face_profiles_profile_id_key")) {
        toast.error("Face already registered", {
          description: "Admin reset is required before re-registration.",
        });
      } else {
        toast.error("Face registration failed");
      }
    } finally {
      setIsRegisteringFace(false);
    }
  };

  const resetFaceCapture = () => {
    setRegistrationStep(0);
    setCapturedDescriptors([]);
    toast.success("Face registration reset.");
  };

const formatISTTime = (time: string | null) => {
  if (!time) return "-";

  return new Date(time).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
};

  const getSessionHours = (record: AttendanceSession) => {
    if (!record.check_out) return null;
    const diffMs = new Date(record.check_out).getTime() - new Date(record.check_in).getTime();
    return Number(Math.max(0, diffMs / (1000 * 60 * 60)).toFixed(2));
  };

  const getStatusBadge = (status: string | null) => {
    const statusVal = (status || "present").toLowerCase();
    switch (statusVal) {
      case "open":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Clock className="w-3.5 h-3.5" />
            Open
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed
          </span>
        );
      case "present":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Present
          </span>
        );
      case "late":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5" />
            Late
          </span>
        );
      case "half-day":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Hourglass className="w-3.5 h-3.5" />
            Half Day
          </span>
        );
      case "absent":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="w-3.5 h-3.5" />
            Absent
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            {status || "Present"}
          </span>
        );
    }
  };

  return (
    <div className="p-4 md:p-8 text-white min-h-[calc(100vh-100px)] bg-[#0B1528] rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 relative z-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Navigation className="h-8 w-8 text-blue-500 rotate-45 animate-pulse" />
            Apex Attendance Workflow
          </h1>
          <p className="text-slate-400 mt-1">Sleek GPS-verified check-in & check-out system.</p>
        </div>

        <div className="bg-[#13223D]/90 border border-slate-700/50 rounded-xl p-3.5 text-xs text-slate-300 max-w-sm shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-1.5 text-blue-400 font-bold tracking-wide uppercase">
            <Shield className="w-3.5 h-3.5" />
            GPS + Face Required
          </div>
          <p className="mt-1 leading-tight">
            Attendance is saved only after real browser GPS and live face verification succeed.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] gap-6 relative z-10 mb-8">
        <div className="bg-[#13223D]/60 border border-slate-800/80 p-5 md:p-6 rounded-2xl shadow-xl backdrop-blur-sm">
          <div>
            <div className="flex items-center gap-2 mb-5">
              <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-100">Attendance Check-In</h2>
                <p className="text-xs text-slate-400">Select your site, verify GPS, then complete face verification.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="profile" className="text-slate-300 font-medium text-sm">
                  Profile
                </Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <div
                    id="profile"
                    className="flex h-12 w-full items-center rounded-xl border border-slate-700/80 bg-[#162A4E] pl-10 pr-3 py-2 text-sm text-white"
                  >
                    {currentProfileName}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="attendance-site" className="text-slate-300 font-medium text-sm">
                  Select Attendance Site
                </Label>
                <select
                  id="attendance-site"
                  value={selectedAttendanceSiteId}
                  disabled={Boolean(activeSession) || allowedSites.length === 0 || isSubmitting || isLocating}
                  onChange={(event) => setSelectedAttendanceSiteId(event.target.value)}
                  className="flex h-12 w-full rounded-xl border border-slate-700/80 bg-[#162A4E] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {allowedSites.length === 0 ? (
                    <option value="">No active site available</option>
                  ) : (
                    allowedSites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.site_name}
                      </option>
                    ))
                  )}
                </select>
                {activeSession && (
                  <p className="text-xs text-blue-300">Active session locked to {activeSession.site_name_snapshot}.</p>
                )}
              </div>

              <div className="bg-[#0B1528]/80 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-400" />
                    GPS Status
                  </span>
                  {locationStatus === "fetching" && (
                    <span className="text-amber-400 flex items-center gap-1 font-medium">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Acquiring GPS...
                    </span>
                  )}
                  {locationStatus === "success" && (
                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3 h-3" />
                      GPS Verified
                    </span>
                  )}
                  {locationStatus === "error" && (
                    <span className="text-red-400 flex items-center gap-1 font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      Out of Premises
                    </span>
                  )}
                  {locationStatus === "idle" && (
                    <span className="text-slate-500 font-medium">Ready</span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-[#13223D]/70 border border-slate-800 p-3">
                    <div className="text-slate-500">Selected Site</div>
                    <div className="font-semibold text-slate-100 truncate">{selectedSite?.site_name ?? "-"}</div>
                  </div>
                  <div className="rounded-lg bg-[#13223D]/70 border border-slate-800 p-3">
                    <div className="text-slate-500">Radius</div>
                    <div className="font-semibold text-slate-100">{selectedSite ? `${selectedSite.radius_meters}m` : "-"}</div>
                  </div>
                  <div className="rounded-lg bg-[#13223D]/70 border border-slate-800 p-3">
                    <div className="text-slate-500">Current Distance</div>
                    <div className={`font-semibold ${siteValidation?.inside ? "text-emerald-400" : siteValidation ? "text-red-400" : "text-slate-100"}`}>
                      {siteValidation ? `${Math.round(siteValidation.distance)}m` : "-"}
                    </div>
                  </div>
                </div>

                {currentCoords && (
                  <div className="text-xs text-slate-300 space-y-1 pt-1 border-t border-slate-800/80">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Coordinates:</span>
                      <span className="font-mono">{currentCoords.latitude.toFixed(4)}, {currentCoords.longitude.toFixed(4)}</span>
                    </div>
                    {siteValidation && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Distance:</span>
                        <span className={`font-semibold ${siteValidation.inside ? 'text-emerald-400' : 'text-red-400'}`}>
                          {Math.round(siteValidation.distance)}m / {siteValidation.site.radius_meters}m
                        </span>
                      </div>
                    )}
                    {siteValidation && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Attendance Site:</span>
                        <span className="font-semibold text-slate-200">{siteValidation.site.site_name}</span>
                      </div>
                    )}
                  </div>
                )}
                <Button
                  type="button"
                  onClick={handleVerifyGps}
                  disabled={isLocating || isSubmitting || !selectedAttendanceSiteId}
                  variant="outline"
                  className="w-full h-11 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  {isLocating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <MapPin className="w-4 h-4 mr-2" />}
                  Verify GPS
                </Button>
              </div>

              <div className="bg-[#0B1528]/80 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-indigo-400" />
                    Face Verification Status
                  </span>
                  {hasValidFaceProfile ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3 h-3" />
                      Face Registered · Verified
                    </span>
                  ) : (
                    <span className="text-amber-400 flex items-center gap-1 font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      Registration Required
                    </span>
                  )}
                </div>
                {!hasValidFaceProfile && (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-400">
                      Register your face once before attendance. Re-registration requires an admin reset.
                    </p>
                    <Button
                      type="button"
                      onClick={openFaceRegistration}
                      className="min-h-11 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    >
                      <Camera className="mr-2 h-4 w-4" />
                      Register Face
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <Button
            onClick={handleMarkAttendance}
            disabled={isSubmitting || isLocating || !currentProfileId || !hasValidFaceProfile || !canUseVerifiedGps}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-bold h-12 rounded-xl mt-6 transition-all duration-300 shadow-md shadow-blue-500/10 flex items-center justify-center gap-2 border border-blue-500/20 active:scale-[0.98]"
          >
            {isLocating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Acquiring GPS...
              </>
            ) : isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <MapPin className="w-5 h-5 rotate-45" />
                {activeSession ? "Check Out" : "Check In"}
              </>
            )}
          </Button>
        </div>

        <div className="bg-[#13223D]/60 border border-slate-800/80 p-5 md:p-6 rounded-2xl shadow-xl backdrop-blur-sm">
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-4">
            <Info className="w-4 h-4 text-indigo-400" />
            Current Status
          </h3>

          <div className="space-y-3 text-sm text-slate-300">
            <div className="rounded-xl border border-slate-800 bg-[#0B1528]/70 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Active Session</div>
              <div className="mt-1 font-semibold text-slate-100">{activeSession?.site_name_snapshot ?? "None"}</div>
              {activeSession && <div className="mt-1 text-xs text-slate-500">Checked in at {formatISTTime(activeSession.check_in)}</div>}
            </div>
            <div className="rounded-xl border border-slate-800 bg-[#0B1528]/70 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Completed Hours Today</div>
              <div className="mt-1 font-mono text-lg font-bold text-emerald-400">{formatDurationHours(totalCompletedHours)}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-[#0B1528]/70 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Selected Site</div>
              <div className="mt-1 font-semibold text-slate-100">{selectedSite?.site_name ?? "-"}</div>
              <div className="mt-1 text-xs text-slate-500">Radius: {selectedSite ? `${selectedSite.radius_meters}m` : "-"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Attendance History Section */}
      <div className="bg-[#13223D]/40 border border-slate-800/80 rounded-2xl p-4 sm:p-6 shadow-2xl backdrop-blur-sm relative z-10">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg">
              <Calendar className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-100">Today's Attendance Sessions</h2>
          </div>
          <span className="text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3.5 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>
            Today: {getTodayDateString()}
          </span>
        </div>

        {todayAttendance.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl bg-[#0B1528]/40">
            <MapPin className="w-12 h-12 text-slate-600 mx-auto mb-3 animate-bounce" />
            <p className="text-slate-400 font-medium">No attendance sessions have been registered today.</p>
            <p className="text-xs text-slate-600 mt-1">Use Mark Attendance above to record your check-in.</p>
          </div>
        ) : (
          <>
          <div className="space-y-3 md:hidden">
            {todayAttendance.map((record) => {
              const profile = profiles.find((item) => item.id === record.profile_id);
              const employeeName = profile?.full_name || profile?.display_name || profile?.email || "Unknown Profile";
              const employeeCode = profile?.employee_code || "";
              const sessionHours = getSessionHours(record);

              return (
                <div key={record.id} className="rounded-xl border border-slate-800 bg-[#0B1528]/70 p-4 text-sm">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-white">{employeeName}</p>
                      {employeeCode && <p className="mt-0.5 break-all font-mono text-[11px] text-slate-500">{employeeCode}</p>}
                    </div>
                    <div className="shrink-0">{getStatusBadge(record.status)}</div>
                  </div>
                  <div className="mt-3 grid gap-2 text-slate-300">
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Site</span>
                      <span className="break-words text-right font-medium">{record.site_name_snapshot}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Check In</span>
                      <span className="text-right">{formatISTTime(record.check_in)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Check Out</span>
                      <span className="text-right">{record.check_out ? formatISTTime(record.check_out) : "Pending check-out"}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Session Hours</span>
                      <span className="font-mono font-semibold text-slate-100">{sessionHours !== null ? formatDurationHours(sessionHours) : "-"}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Face</span>
                      <span className={record.face_verified ? "text-emerald-400" : "text-slate-500"}>
                        {record.face_verified ? `Verified${record.face_match_score !== null && record.face_match_score !== undefined ? ` (${Math.round(record.face_match_score * 100)}%)` : ""}` : "Not Verified"}
                      </span>
                    </div>
                    {record.check_in_latitude && record.check_in_longitude && (
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">GPS</span>
                        <span className="break-all text-right font-mono text-xs text-slate-400">
                          {record.check_in_latitude.toFixed(4)}, {record.check_in_longitude.toFixed(4)}
                        </span>
                      </div>
                    )}
                  </div>
                  {DEMO_MODE && (
                    <button
                      onClick={() => deleteAttendance(record.id)}
                      className="mt-3 min-h-11 w-full rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-red-400 transition-all duration-200 hover:bg-red-500 hover:text-white"
                      title="Delete attendance record"
                    >
                      Delete
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden rounded-xl border border-slate-800/80 md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800 bg-[#0B1528]/80 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-4 px-4 font-medium">Employee Name</th>
                  <th className="py-4 px-4 font-medium">Site</th>
                  <th className="py-4 px-4 font-medium">Check In</th>
                  <th className="py-4 px-4 font-medium">Check Out</th>
                  <th className="py-4 px-4 font-medium">Session Hours</th>
                  <th className="py-4 px-4 font-medium">Session Status</th>
                  <th className="py-4 px-4 font-medium text-center">Face</th>
                  <th className="py-4 px-4 font-medium text-center">GPS Coordinates</th>
                  {DEMO_MODE && <th className="py-4 px-4 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {todayAttendance.map((record) => {
                  const profile = profiles.find((item) => item.id === record.profile_id);
                  const employeeName = profile?.full_name || profile?.display_name || profile?.email || "Unknown Profile";
                  const employeeCode = profile?.employee_code || "";
                  const sessionHours = getSessionHours(record);
                  
                  return (
                    <tr key={record.id} className="hover:bg-[#13223D]/40 transition-all duration-150 group text-sm">
                      <td className="py-4 px-4 font-medium text-white">
                        <div className="flex flex-col">
                          <span className="font-semibold">{employeeName}</span>
                          {employeeCode && <span className="text-[11px] text-slate-500 font-mono mt-0.5">{employeeCode}</span>}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-slate-300 font-medium">{record.site_name_snapshot}</td>
                      <td className="py-4 px-4 text-slate-300">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50"></span>
                          {formatISTTime(record.check_in)}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-slate-300">
                        {record.check_out ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-lg shadow-indigo-500/50"></span>
                            {formatISTTime(record.check_out)}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic text-xs bg-slate-800/40 border border-slate-800/80 px-2 py-0.5 rounded">Pending check-out</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-slate-300 font-medium font-mono">
                        {sessionHours !== null ? (
                          <span className="text-slate-200 font-bold bg-[#13223D] px-2.5 py-1 rounded border border-slate-700/50">
                            {formatDurationHours(sessionHours)}
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {getStatusBadge(record.status)}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {record.face_verified ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-semibold text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Verified {record.face_match_score !== null && record.face_match_score !== undefined ? `(${Math.round(record.face_match_score * 100)}%)` : ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800/60 border border-slate-700/50 text-[11px] font-semibold text-slate-500">
                            Not Verified
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {record.check_in_latitude && record.check_in_longitude ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/60 border border-slate-700/50 text-[11px] font-mono text-slate-400 group-hover:text-blue-400 transition-colors">
                            <MapPin className="w-3.5 h-3.5 text-blue-500" />
                            {record.check_in_latitude.toFixed(4)}, {record.check_in_longitude.toFixed(4)}
                          </span>
                        ) : (
                          <span className="text-slate-600 font-mono text-xs">-</span>
                        )}
                      </td>
                      {DEMO_MODE && (
                        <td className="py-4 px-4 text-right">
                          <button
                            onClick={() => deleteAttendance(record.id)}
                            className="text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500 border border-red-500/20 p-2 rounded-lg transition-all duration-200 cursor-pointer shadow-sm hover:shadow-red-500/10"
                            title="Delete attendance record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Face Registration Modal */}
      {showFaceRegistration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-[#0B1528] p-4 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Camera className="w-5 h-5 text-emerald-400" />
                Register Face
              </h3>
              <button onClick={resetFaceRegistrationCamera} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {cameraPermissionError ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 mb-4">
                <p className="font-semibold mb-2">Camera Permission Denied</p>
                <p className="text-sm">{cameraPermissionError}</p>
                <Button
                  onClick={resetFaceRegistrationCamera}
                  variant="outline"
                  className="mt-4 border-red-500/20 text-red-400 hover:bg-red-500/10"
                >
                  Close
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  Capture 5 guided face samples. After this, only an admin reset can allow re-registration.
                </div>
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
                    <span className="text-xs uppercase tracking-wider font-extrabold text-blue-400">
                      Step {registrationStep + 1}/{REGISTRATION_STEPS.length}
                    </span>
                    <p className="mt-1 text-slate-200 font-semibold">{REGISTRATION_STEPS[registrationStep].label}</p>
                    <p className="mt-1 text-xs text-slate-400">{REGISTRATION_STEPS[registrationStep].instruction}</p>
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
                <p className="text-sm text-slate-400">
                  Keep one face centered and well lit. Face images are not stored.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {registrationStep < REGISTRATION_STEPS.length ? (
                    <Button
                      onClick={captureFaceSample}
                      className="min-h-11 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
                      disabled={isRegisteringFace}
                    >
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
                    <Button
                      onClick={resetFaceCapture}
                      variant="outline"
                      className="min-h-11 w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                      disabled={isRegisteringFace}
                    >
                      Reset
                    </Button>
                  )}
                  <Button
                    onClick={resetFaceRegistrationCamera}
                    variant="outline"
                    className="min-h-11 w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                    disabled={isRegisteringFace}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Face Verification Modal */}
      {showFaceCamera && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-[#0B1528] p-4 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-400" />
                Live Face Verification
              </h3>
              <button onClick={resetFaceCamera} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {cameraPermissionError ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 mb-4">
                <p className="font-semibold mb-2">Camera Permission Denied</p>
                <p className="text-sm">{cameraPermissionError}</p>
                <Button
                  onClick={resetFaceCamera}
                  variant="outline"
                  className="mt-4 border-red-500/20 text-red-400 hover:bg-red-500/10"
                >
                  Close
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
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
                <p className="text-sm text-slate-400">
                  Keep one face centered. Attendance is saved only after a live match succeeds.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    onClick={verifyFaceAndSaveAttendance}
                    className="min-h-11 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
                    disabled={isVerifyingFace}
                  >
                    {isVerifyingFace ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Camera className="w-4 h-4 mr-2" />}
                    Verify Face & Mark
                  </Button>
                  <Button
                    onClick={resetFaceCamera}
                    variant="outline"
                    className="min-h-11 w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                    disabled={isVerifyingFace}
                  >
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

