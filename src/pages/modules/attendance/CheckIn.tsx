import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
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
  Image
} from "lucide-react";
import Webcam from "react-webcam";

type ProfileLite = {
  id: string;
  employee_code: string | null;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  status: string | null;
  is_active: boolean | null;
};

type AttendanceRecord = {
  id: string;
  employee_id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  check_in_selfie: string | null;
  check_out_selfie: string | null;
  working_hours: number | null;
  status: string | null;
  latitude: number | null;
  longitude: number | null;
};

const DEMO_MODE = true;

// Office Location Constants
const OFFICE_LAT = 13.185070036510725;
const OFFICE_LNG = 80.122378720956;
const ALLOWED_RADIUS = 100; // in meters

export default function CheckIn() {
  const { user, isAdmin, displayName } = useAuth();
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  
  // Geolocation & Dev Mocking State
  const [simulateLocation, setSimulateLocation] = useState(true); // Default to true for ease of verification
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "fetching" | "success" | "error">("idle");
  const [distanceFromOffice, setDistanceFromOffice] = useState<number | null>(null);

  // Webcam & Selfie State
  const webcamRef = useRef<Webcam>(null);
  const [showWebcam, setShowWebcam] = useState(false);
  const [capturedSelfie, setCapturedSelfie] = useState<string | null>(null);
  const [isUploadingSelfie, setIsUploadingSelfie] = useState(false);
  const [selfieMode, setSelfieMode] = useState<"check-in" | "check-out" | null>(null);
  const [cameraPermissionError, setCameraPermissionError] = useState<string | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);

  const getTodayDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .from("profiles" as any)
      .select("id, full_name, display_name, email, employee_code, status, is_active")
      .eq("status", "approved")
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (!error && data) setProfiles(data as ProfileLite[]);
  };

  const fetchTodayAttendance = async () => {
    const today = getTodayDateString();
    
    const { data, error } = await supabase
      .from("attendance" as any)
      .select("*")
      .eq("attendance_date", today)
      .order("check_in", { ascending: false });

    if (!error && data) {
      setTodayAttendance(data as AttendanceRecord[]);
    } else if (error) {
      console.error("Error fetching attendance:", error);
    }
  };

  useEffect(() => {
    fetchProfiles();
    fetchTodayAttendance();
  }, []);

  useEffect(() => {
    if (!isAdmin && user?.id) {
      setSelectedProfileId(user.id);
    }
  }, [isAdmin, user?.id]);

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

  // Get current position (real or simulated)
  const getCoordinates = (): Promise<{ latitude: number; longitude: number }> => {
    return new Promise((resolve, reject) => {
      if (simulateLocation) {
        // Return simulated office coordinates
        resolve({ latitude: OFFICE_LAT, longitude: OFFICE_LNG });
        return;
      }

      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const handleMarkAttendance = async () => {
    if (!selectedProfileId) {
      toast.error("No active profile selected");
      return;
    }

    setIsSubmitting(true);
    setIsLocating(true);
    setLocationStatus("fetching");

    try {
      const today = getTodayDateString();
      const now = new Date();
      const nowISO = now.toISOString();

      // 1. Fetch Geolocation
      const coords = await getCoordinates();
      setCurrentCoords(coords);
      setLocationStatus("success");
      
      // Calculate distance
      const distance = calculateDistance(coords.latitude, coords.longitude, OFFICE_LAT, OFFICE_LNG);
      setDistanceFromOffice(distance);

      // 2. GPS Verification: Check if within range
      if (distance > ALLOWED_RADIUS) {
        toast.error(`You are outside office premises (Distance: ${Math.round(distance)}m)`);
        setLocationStatus("error");
        setIsSubmitting(false);
        setIsLocating(false);
        return;
      }

      // Check existing record for selected employee today
      const { data, error: fetchError } = await supabase
        .from("attendance" as any)
        .select("*")
        .eq("employee_id", selectedProfileId)
        .eq("attendance_date", today);
        
      if (fetchError) throw fetchError;
      
      const existingRecords = data as any[] | null;
      const existingRecord = existingRecords && existingRecords.length > 0 ? existingRecords[0] : null;

      // CASE 1: No attendance record exists today -> Create check-in record
      if (!existingRecord) {
        // Late Mark Rule: Office start time = 9:00 AM, Grace period = 15 mins (limit is 9:15 AM)
        const limitTime = new Date();
        limitTime.setHours(9, 15, 0, 0);

        let calculatedStatus = "present";
        if (now.getTime() > limitTime.getTime()) {
          calculatedStatus = "late";
        }

        const { error } = await supabase.from("attendance" as any).insert({
          employee_id: selectedProfileId,
          attendance_date: today,
          check_in: nowISO,
          status: calculatedStatus,
          latitude: coords.latitude,
          longitude: coords.longitude
        } as any);

        if (error) throw error;
        toast.success(`Check-in successful! Marked as ${calculatedStatus}`);
      } 
      // CASE 2: Attendance record exists today, check_out is null -> Verify GPS again -> Update check_out
      else if (!existingRecord.check_out) {
        const checkOutTimestamp = nowISO;
        const checkInTime = new Date(existingRecord.check_in).getTime();
        const checkOutTime = new Date(checkOutTimestamp).getTime();
        const diffMs = checkOutTime - checkInTime;
        const workingHours = Number(((diffMs / (1000 * 60 * 60)).toFixed(2)));

        // Debug logs
        console.log("RAW CHECK IN:", existingRecord.check_in);
        console.log("RAW CHECK OUT:", checkOutTimestamp);
        console.log("CHECK IN MS:", checkInTime);
        console.log("CHECK OUT MS:", checkOutTime);
        console.log("WORKING HOURS:", workingHours);

        // Half Day Rule: If total working hours < 4: status = "half-day"
        // Otherwise, keep the original status (present or late)
        let calculatedStatus = existingRecord.status || "present";
        if (workingHours < 4) {
          calculatedStatus = "half-day";
        }

        const { error } = await supabase
          .from("attendance" as any)
          .update({
            check_out: nowISO,
            working_hours: workingHours,
            status: calculatedStatus,
            latitude: coords.latitude, // Store/update GPS of check-out
            longitude: coords.longitude
          } as any)
          .eq("id", existingRecord.id);

        if (error) throw error;
        toast.success(`Check-out successful! Calculated working hours: ${workingHours} hrs (${calculatedStatus})`);
      } 
      // CASE 3: Attendance record already has check_out -> Block and warn
      else {
        toast.error("Attendance already completed for today");
      }
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
    } finally {
      setIsSubmitting(false);
      setIsLocating(false);
      fetchTodayAttendance();
    }
  };

  const deleteAttendance = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this attendance record?")) return;

    const { error } = await supabase.from("attendance" as any).delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Attendance deleted successfully");
    fetchTodayAttendance();
  };

  const captureSelfie = () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setCapturedSelfie(imageSrc);
      }
    }
  };

  const uploadSelfieToStorage = async (): Promise<string | null> => {
    if (!capturedSelfie || !selectedProfileId) {
      toast.error("No selfie captured or profile selected");
      return null;
    }

    setIsUploadingSelfie(true);
    try {
      // Convert base64 to blob
      const response = await fetch(capturedSelfie);
      const blob = await response.blob();

      // Create unique filename
      const now = new Date();
      const timestamp = now.getTime();
      const fileName = `${selectedProfileId}-${selfieMode}-${timestamp}.jpg`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from("attendance-selfies")
        .upload(fileName, blob, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (error) throw error;

      toast.success("Selfie uploaded successfully");
      return data.path;
    } catch (error: any) {
      console.error("Selfie upload error:", error);
      toast.error(error.message || "Failed to upload selfie");
      return null;
    } finally {
      setIsUploadingSelfie(false);
    }
  };

  const getSignedSelfieUrl = async (filePath: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage
        .from("attendance-selfies")
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (error) throw error;
      return data.signedUrl;
    } catch (error: any) {
      console.error("Error creating signed URL:", error);
      return null;
    }
  };

  const resetWebcam = () => {
    setShowWebcam(false);
    setCapturedSelfie(null);
    setSelfieMode(null);
    setCameraPermissionError(null);
  };

  const viewSelfie = async (filePath: string | null) => {
    if (!filePath) {
      toast.error("No selfie available");
      return;
    }

    const url = await getSignedSelfieUrl(filePath);
    if (url) {
      setSelectedImageUrl(url);
      setShowImageModal(true);
    }
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

  const getStatusBadge = (status: string | null) => {
    const statusVal = (status || "present").toLowerCase();
    switch (statusVal) {
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

        {/* Developer Mocking Panel */}
        <div className="bg-[#13223D]/90 border border-slate-700/50 rounded-xl p-3.5 flex flex-col gap-2 max-w-sm shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs text-amber-400 font-bold tracking-wide uppercase">
              <Shield className="w-3.5 h-3.5" />
              Dev Settings
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={simulateLocation}
                onChange={(e) => setSimulateLocation(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          <p className="text-[11px] text-slate-300 leading-tight">
            {simulateLocation 
              ? "Simulating office coordinates (13.0827, 80.2707). Distance: 0m (In Premises)."
              : "Using real browser GPS location. Proximity will be verified."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10 mb-8">
        {/* Left Widget: Check In Card */}
        <div className="lg:col-span-1 bg-[#13223D]/60 border border-slate-800/80 p-6 rounded-2xl shadow-xl backdrop-blur-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                <Clock className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-slate-100">Check In / Out Portal</h2>
            </div>

            <div className="space-y-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="profile" className="text-slate-300 font-medium text-sm">
                  {isAdmin ? "Select Profile" : "Profile"}
                </Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  {isAdmin ? (
                    <select
                      id="profile"
                      className="flex h-12 w-full items-center justify-between rounded-xl border border-slate-700/80 bg-[#162A4E] pl-10 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-pointer"
                      value={selectedProfileId}
                      onChange={(e) => setSelectedProfileId(e.target.value)}
                    >
                      <option value="">-- Select Profile --</option>
                      {profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.full_name || profile.display_name || profile.email || "Unnamed Profile"}{profile.employee_code ? ` (${profile.employee_code})` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex h-12 w-full items-center rounded-xl border border-slate-700/80 bg-[#162A4E] pl-10 pr-3 py-2 text-sm text-white">
                      {displayName || user?.email || "Your profile"}
                    </div>
                  )}
                </div>
              </div>

              {/* GPS Live Status Section */}
              <div className="bg-[#0B1528]/80 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-400" />
                    GPS Verification
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
                      Verified Location
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

                {currentCoords && (
                  <div className="text-xs text-slate-300 space-y-1 pt-1 border-t border-slate-800/80">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Coordinates:</span>
                      <span className="font-mono">{currentCoords.latitude.toFixed(4)}, {currentCoords.longitude.toFixed(4)}</span>
                    </div>
                    {distanceFromOffice !== null && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Distance:</span>
                        <span className={`font-semibold ${distanceFromOffice <= ALLOWED_RADIUS ? 'text-emerald-400' : 'text-red-400'}`}>
                          {Math.round(distanceFromOffice)}m / {ALLOWED_RADIUS}m limit
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <Button
            onClick={handleMarkAttendance}
            disabled={isSubmitting || isLocating || !selectedProfileId}
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
                Mark Attendance
              </>
            )}
          </Button>
        </div>

        {/* Right Widgets: Detailed Info Panels */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Rules Card */}
          <div className="bg-[#13223D]/60 border border-slate-800/80 p-6 rounded-2xl shadow-xl backdrop-blur-sm space-y-4">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-400" />
              Attendance Rules System
            </h3>
            
            <div className="space-y-3.5 text-sm text-slate-300">
              <div className="p-3 bg-[#0B1528]/80 border border-slate-800 rounded-xl">
                <span className="text-xs font-extrabold text-blue-400 uppercase tracking-wide">Rule 1: Office Radius Limit</span>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Employees must be within <strong className="text-slate-200">100 meters</strong> of the office location coordinates to check-in or check-out successfully.
                </p>
              </div>

              <div className="p-3 bg-[#0B1528]/80 border border-slate-800 rounded-xl">
                <span className="text-xs font-extrabold text-amber-400 uppercase tracking-wide">Rule 2: Late Mark Calculation</span>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Office starts at <strong className="text-slate-200">9:00 AM</strong>. A <strong className="text-slate-200">15-minute</strong> grace period is allowed. Check-ins after <strong className="text-slate-200">9:15 AM</strong> are automatically marked <strong className="text-amber-400">Late</strong>.
                </p>
              </div>

              <div className="p-3 bg-[#0B1528]/80 border border-slate-800 rounded-xl">
                <span className="text-xs font-extrabold text-indigo-400 uppercase tracking-wide">Rule 3: Half-Day Validation</span>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  During check-out, working hours are computed automatically. If the total working hours are <strong className="text-slate-200">less than 4 hours</strong>, status is marked <strong className="text-indigo-400">Half Day</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics Card */}
          <div className="bg-[#13223D]/60 border border-slate-800/80 p-6 rounded-2xl shadow-xl backdrop-blur-sm flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-4">
                <Info className="w-4 h-4 text-indigo-400" />
                Office Premises Details
              </h3>
              
              <div className="space-y-3.5 text-sm text-slate-300">
                <div className="flex justify-between items-center py-2 border-b border-slate-800/80">
                  <span className="text-slate-400">Office Latitude</span>
                  <span className="font-mono text-slate-200 font-medium">13.0827° N</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-800/80">
                  <span className="text-slate-400">Office Longitude</span>
                  <span className="font-mono text-slate-200 font-medium">80.2707° E</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-800/80">
                  <span className="text-slate-400">Allowed Perimeter</span>
                  <span className="text-slate-200 font-medium">100 meters (Allowed Radius)</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-400">Demo Deletions</span>
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {DEMO_MODE ? "ENABLED" : "DISABLED"}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3.5 mt-4 text-xs text-slate-400 leading-relaxed">
              <strong className="text-blue-400">Security Notice:</strong> All check-in and check-out requests are strictly verified against device GPS sensors. Falsifying GPS positions is restricted.
            </div>
          </div>
        </div>
      </div>

      {/* Today's Attendance History Section */}
      <div className="bg-[#13223D]/40 border border-slate-800/80 rounded-2xl p-6 shadow-2xl backdrop-blur-sm relative z-10">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg">
              <Calendar className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-100">Today's Attendance History</h2>
          </div>
          <span className="text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3.5 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>
            Today: {getTodayDateString()}
          </span>
        </div>

        {todayAttendance.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl bg-[#0B1528]/40">
            <MapPin className="w-12 h-12 text-slate-600 mx-auto mb-3 animate-bounce" />
            <p className="text-slate-400 font-medium">No attendance records have been registered today.</p>
            <p className="text-xs text-slate-600 mt-1">Select an active employee above to mark check-in.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800/80">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800 bg-[#0B1528]/80 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-4 px-4 font-medium">Employee Name</th>
                  <th className="py-4 px-4 font-medium">Check In</th>
                  <th className="py-4 px-4 font-medium">Check Out</th>
                  <th className="py-4 px-4 font-medium">Working Hours</th>
                  <th className="py-4 px-4 font-medium">Status</th>
                  <th className="py-4 px-4 font-medium text-center">GPS Coordinates</th>
                  {DEMO_MODE && <th className="py-4 px-4 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {todayAttendance.map((record) => {
                  const profile = profiles.find((item) => item.id === record.employee_id);
                  const employeeName = profile?.full_name || profile?.display_name || profile?.email || "Unknown Profile";
                  const employeeCode = profile?.employee_code || "";
                  
                  return (
                    <tr key={record.id} className="hover:bg-[#13223D]/40 transition-all duration-150 group text-sm">
                      <td className="py-4 px-4 font-medium text-white">
                        <div className="flex flex-col">
                          <span className="font-semibold">{employeeName}</span>
                          {employeeCode && <span className="text-[11px] text-slate-500 font-mono mt-0.5">{employeeCode}</span>}
                        </div>
                      </td>
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
                        {record.working_hours !== null && record.working_hours !== undefined ? (
                          <span className="text-slate-200 font-bold bg-[#13223D] px-2.5 py-1 rounded border border-slate-700/50">
                            {record.working_hours.toFixed(2)} hrs
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {getStatusBadge(record.status)}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {record.latitude && record.longitude ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/60 border border-slate-700/50 text-[11px] font-mono text-slate-400 group-hover:text-blue-400 transition-colors">
                            <MapPin className="w-3.5 h-3.5 text-blue-500" />
                            {record.latitude.toFixed(4)}, {record.longitude.toFixed(4)}
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
        )}
      </div>

      {/* Webcam Modal */}
      {showWebcam && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0B1528] border border-slate-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-400" />
                Capture {selfieMode === "check-in" ? "Check-In" : "Check-Out"} Selfie
              </h3>
              {!capturedSelfie && (
                <button onClick={resetWebcam} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {cameraPermissionError ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 mb-4">
                <p className="font-semibold mb-2">Camera Permission Error</p>
                <p className="text-sm">{cameraPermissionError}</p>
                <Button
                  onClick={resetWebcam}
                  variant="outline"
                  className="mt-4 border-red-500/20 text-red-400 hover:bg-red-500/10"
                >
                  Close
                </Button>
              </div>
            ) : !capturedSelfie ? (
              <div className="space-y-4">
                <div className="relative bg-black rounded-lg overflow-hidden border border-slate-700">
                  <Webcam
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    className="w-full"
                    onUserMediaError={() => {
                      setCameraPermissionError("Camera not found or permission denied. Please check your device.");
                    }}
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={captureSelfie}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Capture Selfie
                  </Button>
                  <Button
                    onClick={resetWebcam}
                    variant="outline"
                    className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative bg-black rounded-lg overflow-hidden border border-slate-700">
                  <img src={capturedSelfie} alt="Captured selfie" className="w-full" />
                </div>
                <p className="text-sm text-slate-400">
                  {isUploadingSelfie ? "Uploading selfie..." : "Selfie captured. Click 'Save' to proceed."}
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={captureSelfie}
                    variant="outline"
                    className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                    disabled={isUploadingSelfie}
                  >
                    Retake
                  </Button>
                  <Button
                    onClick={async () => {
                      const filePath = await uploadSelfieToStorage();
                      if (filePath) {
                        // Selfie uploaded successfully, caller will handle saving to DB
                        resetWebcam();
                      }
                    }}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    disabled={isUploadingSelfie}
                  >
                    {isUploadingSelfie ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Save Selfie
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image Viewer Modal */}
      {showImageModal && selectedImageUrl && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0B1528] border border-slate-700 rounded-2xl p-6 max-w-2xl w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Image className="w-5 h-5 text-blue-400" />
                Selfie Preview
              </h3>
              <button
                onClick={() => setShowImageModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative bg-black rounded-lg overflow-hidden border border-slate-700">
              <img src={selectedImageUrl} alt="Selfie preview" className="w-full" />
            </div>
            <Button
              onClick={() => setShowImageModal(false)}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold"
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

