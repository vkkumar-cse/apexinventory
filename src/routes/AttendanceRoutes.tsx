import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import EmployeeManagement from "@/pages/modules/attendance/EmployeeManagement";
import AttendanceDashboard from "@/pages/modules/attendance/AttendanceDashboard";
import CheckIn from "@/pages/modules/attendance/CheckIn";
import AttendanceHistory from "@/pages/modules/attendance/AttendanceHistory";
import AttendanceReports from "@/pages/modules/attendance/AttendanceReports";
import Payroll from "@/pages/modules/attendance/Payroll";
import AttendanceSites from "@/pages/modules/attendance/AttendanceSites";
import NotFound from "@/pages/NotFound";

export default function AttendanceRoutes() {
  return (
    <Routes>
      <Route path="employees" element={<ProtectedRoute adminOnly><EmployeeManagement /></ProtectedRoute>} />
      <Route path="sites" element={<ProtectedRoute adminOnly><AttendanceSites /></ProtectedRoute>} />
      
      {/* Placeholders for other routes */}
      <Route path="dashboard" element={<ProtectedRoute><AttendanceDashboard /></ProtectedRoute>} />
      <Route path="checkin" element={<ProtectedRoute requiredModule="attendance"><CheckIn /></ProtectedRoute>} />
      <Route path="history" element={<ProtectedRoute requiredModule="attendance"><AttendanceHistory /></ProtectedRoute>} />
      <Route path="reports" element={<ProtectedRoute adminOnly><AttendanceReports /></ProtectedRoute>} />
      <Route path="leaves" element={<ProtectedRoute requiredModule="attendance"><div>Leaves (Coming Soon)</div></ProtectedRoute>} />
      <Route path="payroll" element={<ProtectedRoute requiredModule="attendance"><Payroll /></ProtectedRoute>} />
      <Route path="holidays" element={<ProtectedRoute requiredModule="attendance"><div>Holidays (Coming Soon)</div></ProtectedRoute>} />
      
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
