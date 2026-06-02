import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Dashboard from "@/pages/inventory/Dashboard";
import Products from "@/pages/inventory/Products";
import ProductDetail from "@/pages/inventory/ProductDetail";
import Categories from "@/pages/inventory/Categories";
import CategoryDetail from "@/pages/inventory/CategoryDetail";
import Suppliers from "@/pages/inventory/Suppliers";
import Scan from "@/pages/inventory/Scan";
import Transactions from "@/pages/inventory/Transaction";
import Requests from "@/pages/inventory/Requests";

import Users from "@/pages/inventory/Users";
import NotFound from "@/pages/NotFound";

export default function InventoryRoutes() {
  return (
    <Routes>
      <Route path="dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
      <Route path="product/:id" element={<ProtectedRoute><ProductDetail /></ProtectedRoute>} />
      <Route path="categories" element={<ProtectedRoute><Categories /></ProtectedRoute>} />
      <Route path="categories/:id" element={<ProtectedRoute><CategoryDetail /></ProtectedRoute>} />
      <Route path="suppliers" element={<ProtectedRoute adminOnly><Suppliers /></ProtectedRoute>} />
      <Route path="scan" element={<ProtectedRoute><Scan /></ProtectedRoute>} />
      <Route path="requests" element={<ProtectedRoute><Requests /></ProtectedRoute>} />
      <Route path="transactions" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
      <Route path="users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
