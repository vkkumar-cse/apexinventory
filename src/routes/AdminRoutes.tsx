import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Users from "@/pages/admin/Users";
import NotFound from "@/pages/NotFound";

export default function AdminRoutes() {
  return (
    <Routes>
      <Route path="users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
