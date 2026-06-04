import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Clock, FileText, ArrowRight, ShieldCheck, Building, Handshake } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { MODULES, type ModuleKey, isModuleEnabled } from "@/lib/modules";
import { toast } from "sonner";

interface ModuleCard {
  id: ModuleKey;
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
}

// All 6 main modules
const ALL_MODULES: ModuleCard[] = [
  {
    id: "inventory",
    title: "Inventory",
    description: "Manage products, stock levels, and track inventory using QR codes.",
    icon: <Package className="h-8 w-8" />,
    path: "/inventory/dashboard",
  },
  {
    id: "attendance",
    title: "Attendance",
    description: "Track employee attendance and manage work hours.",
    icon: <Clock className="h-8 w-8" />,
    path: "/attendance/dashboard",
  },
  {
    id: "customers",
    title: "Customers",
    description: "Manage customer records and account profiles.",
    icon: <Building className="h-8 w-8" />,
    path: "/customers",
  },
  {
    id: "crm",
    title: "CRM",
    description: "Track enquiries, leads, and sales pipeline activity.",
    icon: <Handshake className="h-8 w-8" />,
    path: "/crm",
  },
  {
    id: "delivery_challan",
    title: "DC Entry",
    description: "Create and manage Delivery Challans.",
    icon: <FileText className="h-8 w-8" />,
    path: "/dc",
  },
  {
    id: "user_management",
    title: "User Management",
    description: "Manage users, approvals, and roles.",
    icon: <ShieldCheck className="h-8 w-8" />,
    path: "/admin/users",
  },
  {
    id: "quotation",
    title: "Quotation",
    description: "Create and manage quotations for customers.",
    icon: <FileText className="h-8 w-8" />,
    path: "/quotation",
  },
];

export default function ChooseModule() {
  const navigate = useNavigate();
  const { isAdmin, moduleAccess } = useAuth();

  useEffect(() => {
    document.title = "Choose Module · Apex Software";
  }, []);

  // Admins see all modules. Workers see only modules they have access to.
  const modules = ALL_MODULES.filter((m) => {
    if (isAdmin) return true;
    // user_management is admin-only (never shown to workers even if somehow granted)
    if (m.id === "user_management") return false;
    if (!MODULES.some((module) => module.key === m.id)) return false;
    if (!isModuleEnabled(m.id)) return true;
    return moduleAccess.includes(m.id);
  });

  function openModule(module: ModuleCard) {
    if (!isModuleEnabled(module.id)) {
      toast.info("This module is coming soon");
      return;
    }

    navigate(module.path);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-2">Choose Module</h1>
          <p className="text-muted-foreground text-lg">Select a module to get started with Apex Software</p>
        </div>

        {modules.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ShieldCheck className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No modules assigned</p>
            <p className="text-sm mt-1">Please contact an admin to grant you access to modules.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.map((module) => (
              <Card
                key={module.id}
                className={`p-6 flex flex-col gap-4 transition-all ${
                  isModuleEnabled(module.id)
                    ? "hover:border-primary/50 hover:shadow-glow cursor-pointer group"
                    : "opacity-60 cursor-not-allowed"
                }`}
                onClick={() => openModule(module)}
              >
                <div className="flex items-start justify-between">
                  <div className="h-12 w-12 rounded-lg gradient-primary text-primary-foreground grid place-items-center shadow-sm">
                    {module.icon}
                  </div>
                  {!isModuleEnabled(module.id) && <Badge variant="secondary">Coming Soon</Badge>}
                </div>

                <div className="flex-1">
                  <h2 className="text-xl font-bold tracking-tight mb-1">{module.title}</h2>
                  <p className="text-sm text-muted-foreground">{module.description}</p>
                </div>

                {isModuleEnabled(module.id) && (
                  <div className="flex items-center gap-2 text-primary group-hover:translate-x-1 transition-transform">
                    <span className="text-sm font-medium">Open</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
