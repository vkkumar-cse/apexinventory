import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Leads from "@/pages/crm/Leads";
import Pipeline from "@/pages/crm/Pipeline";
import CRMSettings from "@/pages/crm/CRMSettings";
import NotFound from "@/pages/NotFound";

export default function CRMRoutes() {
  return (
    <Routes>
      <Route path="" element={<ProtectedRoute requiredModule="crm"><Leads /></ProtectedRoute>} />
      <Route path="leads" element={<ProtectedRoute requiredModule="crm"><Leads /></ProtectedRoute>} />
      <Route path="pipeline" element={<ProtectedRoute requiredModule="crm"><Pipeline /></ProtectedRoute>} />
      <Route path="settings" element={<ProtectedRoute requiredModule="crm"><CRMSettings /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
