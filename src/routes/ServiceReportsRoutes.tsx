import { Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Loader2 } from "lucide-react";

const ServiceReportsDashboard = lazy(() => import("@/pages/modules/service-reports/ServiceReportsDashboard"));
const ServiceReportsList = lazy(() => import("@/pages/modules/service-reports/ServiceReportsList"));
const ServiceReportWizard = lazy(() => import("@/pages/modules/service-reports/ServiceReportWizard"));
const ServiceReportView = lazy(() => import("@/pages/modules/service-reports/ServiceReportView"));
const NotFound = lazy(() => import("@/pages/NotFound"));

export default function ServiceReportsRoutes() {
  return (
    <Suspense fallback={
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    }>
      <Routes>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<ProtectedRoute requiredModule="service_reports"><ServiceReportsDashboard /></ProtectedRoute>} />
        <Route path="list" element={<ProtectedRoute requiredModule="service_reports"><ServiceReportsList /></ProtectedRoute>} />
        <Route path="new" element={<ProtectedRoute requiredModule="service_reports"><ServiceReportWizard /></ProtectedRoute>} />
        <Route path="edit/:id" element={<ProtectedRoute requiredModule="service_reports"><ServiceReportWizard /></ProtectedRoute>} />
        <Route path="view/:id" element={<ProtectedRoute requiredModule="service_reports"><ServiceReportView /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
