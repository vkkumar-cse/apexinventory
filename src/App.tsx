
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { MainLayout } from "@/layouts/MainLayout";
import { InventoryLayout } from "@/layouts/InventoryLayout";
import { AttendanceLayout } from "@/layouts/AttendanceLayout";
import { DCLayout } from "@/layouts/DCLayout";
import DCRoutes from "@/routes/DCRoutes";
import { CustomersLayout } from "@/layouts/CustomersLayout";
import { CRMLayout } from "@/layouts/CRMLayout";
import { AdminLayout } from "@/layouts/AdminLayout";
import Auth from "./pages/auth/Auth";
import ChooseModule from "./pages/modules/ChooseModule";
import InventoryRoutes from "./routes/InventoryRoutes";
import AttendanceRoutes from "./routes/AttendanceRoutes";
import AdminRoutes from "./routes/AdminRoutes";
import CustomerRoutes from "./routes/CustomerRoutes";
import CRMRoutes from "./routes/CRMRoutes";
import ComingSoon from "./pages/ComingSoon";
import NotFound from "./pages/NotFound";
import { Navigate } from "react-router-dom";
import { isModuleEnabled } from "@/lib/modules";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Auth Routes - No Layout */}
            <Route path="/auth" element={<Auth />} />

            {/* Root Redirect */}
            <Route path="/" element={<Navigate to="/modules" replace />} />

            {/* Module Selection - With MainLayout */}
            <Route
              path="/modules"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <ChooseModule />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* Inventory Module Routes - With InventoryLayout */}
            <Route
              path="/inventory/*"
              element={
                <ProtectedRoute requiredModule="inventory">
                  {isModuleEnabled("inventory") ? (
                    <InventoryLayout>
                      <InventoryRoutes />
                    </InventoryLayout>
                  ) : (
                    <MainLayout>
                      <ComingSoon />
                    </MainLayout>
                  )}
                </ProtectedRoute>
              }
            />

            {/* Attendance Module Routes - With AttendanceLayout */}
            <Route
              path="/attendance/*"
              element={
                <ProtectedRoute requiredModule={isModuleEnabled("attendance") ? "attendance" : null}>
                  {isModuleEnabled("attendance") ? (
                    <AttendanceLayout>
                      <AttendanceRoutes />
                    </AttendanceLayout>
                  ) : (
                    <MainLayout>
                      <ComingSoon />
                    </MainLayout>
                  )}
                </ProtectedRoute>
              }
            />

            {/* Customers Module Routes - With CustomersLayout */}
            <Route
              path="/customers/*"
              element={
                <ProtectedRoute requiredModule="customers">
                  {isModuleEnabled("customers") ? (
                    <CustomersLayout>
                      <CustomerRoutes />
                    </CustomersLayout>
                  ) : (
                    <MainLayout>
                      <ComingSoon />
                    </MainLayout>
                  )}
                </ProtectedRoute>
              }
            />

            {/* CRM Module Routes - With CRMLayout */}
            <Route
              path="/crm/*"
              element={
                <ProtectedRoute requiredModule={isModuleEnabled("crm") ? "crm" : null}>
                  {isModuleEnabled("crm") ? (
                    <CRMLayout>
                      <CRMRoutes />
                    </CRMLayout>
                  ) : (
                    <MainLayout>
                      <ComingSoon />
                    </MainLayout>
                  )}
                </ProtectedRoute>
              }
            />

            {/* Admin Module Routes - With AdminLayout */}
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute adminOnly>
                  {isModuleEnabled("user_management") ? (
                    <AdminLayout>
                      <AdminRoutes />
                    </AdminLayout>
                  ) : (
                    <MainLayout>
                      <ComingSoon />
                    </MainLayout>
                  )}
                </ProtectedRoute>
              }
            />
            {/* DC Module Routes - With DCLayout */}
            <Route
              path="/dc/*"
              element={
                <ProtectedRoute requiredModule="delivery_challan">
                  {isModuleEnabled("delivery_challan") ? (
                    <DCLayout>
                      <DCRoutes />
                    </DCLayout>
                  ) : (
                    <MainLayout>
                      <ComingSoon />
                    </MainLayout>
                  )}
                </ProtectedRoute>
              }
            />

            {/* Unfinished/disabled module routes */}
            <Route
              path="/quotation/*"
              element={
                <ProtectedRoute requiredModule={isModuleEnabled("quotation") ? "quotation" : null}>
                  <MainLayout>
                    <ComingSoon />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* Catch All */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
