import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Clock, FileText, ArrowRight, ShieldCheck, Building } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface ModuleCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  status: "available" | "coming-soon";
}

export default function ChooseModule() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  useEffect(() => {
    document.title = "Choose Module · Apex Software";
  }, []);

  const modules: ModuleCard[] = [
    {
      id: "inventory",
      title: "Inventory",
      description: "Manage products, stock levels, and track inventory using QR codes.",
      icon: <Package className="h-8 w-8" />,
      path: "/inventory/dashboard",
      status: "available",
    },
    {
      id: "attendance",
      title: "Attendance",
      description: "Track employee attendance and manage work hours.",
      icon: <Clock className="h-8 w-8" />,
      path: "/attendance/dashboard",
      status: "available",
    },
    {
      id: "dc",
      title: "DC Entry",
      description: "Create and manage Delivery Challans.",
      icon: <FileText className="h-8 w-8" />,
      path: "/dc",
      status: "available" as const,
    },
    ...(isAdmin ? [
      {
        id: "admin",
        title: "User Management",
        description: "Manage users, approvals, and roles.",
        icon: <ShieldCheck className="h-8 w-8" />,
        path: "/admin/users",
        status: "available" as const,
      },
    ] : []),
    {
      id: "customers",
      title: "Customers",
      description: "Manage customer records and account profiles.",
      icon: <Building className="h-8 w-8" />,
      path: "/customers",
      status: "available" as const,
    },
    {
      id: "quotation",
      title: "Quotation",
      description: "Create and manage quotations for customers.",
      icon: <FileText className="h-8 w-8" />,
      path: "/quotation",
      status: "coming-soon",
    },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-2">Choose Module</h1>
          <p className="text-muted-foreground text-lg">Select a module to get started with Apex Software</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {modules.map((module) => (
            <Card
              key={module.id}
              className={`p-6 flex flex-col gap-4 transition-all ${
                module.status === "available"
                  ? "hover:border-primary/50 hover:shadow-glow cursor-pointer group"
                  : "opacity-60 cursor-not-allowed"
              }`}
              onClick={() => module.status === "available" && navigate(module.path)}
            >
              <div className="flex items-start justify-between">
                <div className="h-12 w-12 rounded-lg gradient-primary text-primary-foreground grid place-items-center shadow-sm">
                  {module.icon}
                </div>
                {module.status === "coming-soon" && <Badge variant="secondary">Coming Soon</Badge>}
              </div>

              <div className="flex-1">
                <h2 className="text-xl font-bold tracking-tight mb-1">{module.title}</h2>
                <p className="text-sm text-muted-foreground">{module.description}</p>
              </div>

              {module.status === "available" && (
                <div className="flex items-center gap-2 text-primary group-hover:translate-x-1 transition-transform">
                  <span className="text-sm font-medium">Open</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
