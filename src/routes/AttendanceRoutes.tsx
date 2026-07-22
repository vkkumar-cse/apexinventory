import { Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Loader2 } from "lucide-react";

const EmployeeManagement = lazy(() => import("@/pages/modules/attendance/EmployeeManagement"));
const AttendanceDashboard = lazy(() => import("@/pages/modules/attendance/AttendanceDashboard"));
const CheckIn = lazy(() => import("@/pages/modules/attendance/CheckIn"));
const AttendanceHistory = lazy(() => import("@/pages/modules/attendance/AttendanceHistory"));
const AttendanceReports = lazy(() => import("@/pages/modules/attendance/AttendanceReports"));
const AttendanceSites = lazy(() => import("@/pages/modules/attendance/AttendanceSites"));
const NotFound = lazy(() => import("@/pages/NotFound"));

export default function AttendanceRoutes() {
  return (
    <Suspense fallback={
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    }>
      <Routes>
        <Route path="employees" element={<ProtectedRoute adminOnly><EmployeeManagement /></ProtectedRoute>} />
        <Route path="sites" element={<ProtectedRoute adminOnly><AttendanceSites /></ProtectedRoute>} />
        
        {/* Placeholders for other routes */}
        <Route path="dashboard" element={<ProtectedRoute><AttendanceDashboard /></ProtectedRoute>} />
        <Route path="checkin" element={<ProtectedRoute requiredModule="attendance"><CheckIn /></ProtectedRoute>} />
        <Route path="history" element={<ProtectedRoute requiredModule="attendance"><AttendanceHistory /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute adminOnly><AttendanceReports /></ProtectedRoute>} />
        <Route path="leaves" element={<ProtectedRoute requiredModule="attendance"><div>Leaves (Coming Soon)</div></ProtectedRoute>} />
        <Route path="holidays" element={<ProtectedRoute requiredModule="attendance"><div>Holidays (Coming Soon)</div></ProtectedRoute>} />
        
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
