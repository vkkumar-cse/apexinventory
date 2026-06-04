import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Customers from "@/pages/customers/Customers";
import NotFound from "@/pages/NotFound";

export default function CustomerRoutes() {
  return (
    <Routes>
      <Route path="" element={<ProtectedRoute requiredModule="customers"><Customers /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
