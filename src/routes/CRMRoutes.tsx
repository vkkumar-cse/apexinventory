import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Leads from "@/pages/crm/Leads";
import LeadDetails from "@/pages/crm/LeadDetails";
import Pipeline from "@/pages/crm/Pipeline";
import CRMSettings from "@/pages/crm/CRMSettings";
import CRMDashboard from "@/pages/crm/CRMDashboard";
import CRMReports from "@/pages/crm/CRMReports";
import MyFollowups from "@/pages/crm/MyFollowups";
import NotFound from "@/pages/NotFound";

export default function CRMRoutes() {
  return (
    <Routes>
      <Route path="" element={<ProtectedRoute requiredModule="crm"><Leads /></ProtectedRoute>} />
      <Route path="dashboard" element={<ProtectedRoute requiredModule="crm"><CRMDashboard /></ProtectedRoute>} />
      <Route path="leads" element={<ProtectedRoute requiredModule="crm"><Leads /></ProtectedRoute>} />
      <Route path="leads/:id" element={<ProtectedRoute requiredModule="crm"><LeadDetails /></ProtectedRoute>} />
      <Route path="pipeline" element={<ProtectedRoute requiredModule="crm"><Pipeline /></ProtectedRoute>} />
      <Route path="my-followups" element={<ProtectedRoute requiredModule="crm"><MyFollowups /></ProtectedRoute>} />
      <Route path="reports" element={<ProtectedRoute requiredModule="crm" adminOnly><CRMReports /></ProtectedRoute>} />
      <Route path="settings" element={<ProtectedRoute requiredModule="crm" adminOnly><CRMSettings /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
