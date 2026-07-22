import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Loader2, Clock, ShieldAlert, LogOut } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ProtectedRoute({ 
  children, 
  adminOnly = false,
  requiredModule = null,
  allowMustChangePassword = false
}: { 
  children: React.ReactNode; 
  adminOnly?: boolean; 
  requiredModule?: string | null;
  allowMustChangePassword?: boolean;
}) {
  const { session, loading, isAdmin, status, signOut, role, moduleAccess, isActive, mustChangePassword } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  }

  if (mustChangePassword && !allowMustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  if (status !== "approved") {
    const pending = status === "pending" || status === null;
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <div className={`mx-auto h-14 w-14 rounded-2xl grid place-items-center ${pending ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"}`}>
            {pending ? <Clock className="h-7 w-7" /> : <ShieldAlert className="h-7 w-7" />}
          </div>
          <h1 className="text-2xl font-bold">
            {pending ? "Awaiting approval" : "Access rejected"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {pending
              ? "Your account is waiting for admin approval. You'll get access once an admin approves you."
              : "Your account access was rejected. Please contact an admin."}
          </p>
          <Button variant="outline" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />Sign out
          </Button>
        </Card>
      </div>
    );
  }

  if (!isActive) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-destructive/10 text-destructive">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Account disabled</h1>
          <p className="text-muted-foreground text-sm">Your account has been disabled. Contact Administrator.</p>
          <Button variant="outline" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />Sign out
          </Button>
        </Card>
      </div>
    );
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // If requiredModule is specified and the user is a worker, verify they have permission
  if (requiredModule && role !== "admin" && !moduleAccess.includes(requiredModule)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
