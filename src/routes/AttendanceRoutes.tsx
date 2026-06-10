import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import EmployeeManagement from "@/pages/modules/attendance/EmployeeManagement";
import AttendanceDashboard from "@/pages/modules/attendance/AttendanceDashboard";
import CheckIn from "@/pages/modules/attendance/CheckIn";
import Payroll from "@/pages/modules/attendance/Payroll";
import NotFound from "@/pages/NotFound";

export default function AttendanceRoutes() {
  return (
    <Routes>
      <Route path="employees" element={<ProtectedRoute adminOnly><EmployeeManagement /></ProtectedRoute>} />
      
      {/* Placeholders for other routes */}
      <Route path="dashboard" element={<ProtectedRoute><AttendanceDashboard /></ProtectedRoute>} />
      <Route path="checkin" element={<ProtectedRoute requiredModule="attendance"><CheckIn /></ProtectedRoute>} />
      <Route path="history" element={<ProtectedRoute requiredModule="attendance"><div>History (Coming Soon)</div></ProtectedRoute>} />
      <Route path="reports" element={<ProtectedRoute adminOnly><div>Reports (Coming Soon)</div></ProtectedRoute>} />
      <Route path="leaves" element={<ProtectedRoute requiredModule="attendance"><div>Leaves (Coming Soon)</div></ProtectedRoute>} />
      <Route path="payroll" element={<ProtectedRoute requiredModule="attendance"><Payroll /></ProtectedRoute>} />
      <Route path="holidays" element={<ProtectedRoute requiredModule="attendance"><div>Holidays (Coming Soon)</div></ProtectedRoute>} />
      
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
