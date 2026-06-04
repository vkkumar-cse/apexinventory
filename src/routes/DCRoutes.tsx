import { Routes, Route } from "react-router-dom";
import DeliveryChallan from "@/pages/inventory/DeliveryChallan";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export default function DCRoutes() {
  return (
    <Routes>
      <Route path="" element={<ProtectedRoute requiredModule="delivery_challan"><DeliveryChallan /></ProtectedRoute>} />
    </Routes>
  );
}
