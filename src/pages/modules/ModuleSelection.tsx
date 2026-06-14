import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Clock, FileText, ArrowRight } from "lucide-react";

interface ModuleCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  status: "available" | "coming-soon";
}

export default function ModuleSelection() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Choose Module · Apex Software";
  }, []);

  const modules: ModuleCard[] = [
    {
      id: "inventory",
      title: "Inventory",
      description: "Manage products, stock levels, and track inventory using QR codes.",
      icon: <Package className="h-8 w-8" />,
      path: "/inventory",
      status: "available",
    },
    {
      id: "attendance",
      title: "Attendance",
      description: "Track employee attendance and manage work hours.",
      icon: <Clock className="h-8 w-8" />,
      path: "/attendance",
      status: "coming-soon",
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
    <div className="flex min-h-screen items-center justify-center overflow-x-hidden px-4 py-6 sm:py-8">
      <div className="w-full max-w-4xl min-w-0">
        <div className="mb-8 text-center sm:mb-12">
          <h1 className="mb-2 break-words text-3xl font-bold tracking-tight sm:text-4xl">Choose Module</h1>
          <p className="text-base text-muted-foreground sm:text-lg">Select a module to get started with Apex Software</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 sm:gap-6">
          {modules.map((module) => (
            <Card
              key={module.id}
              className={`flex min-w-0 flex-col gap-4 p-4 transition-all sm:p-6 ${
                module.status === "available"
                  ? "hover:border-primary/50 hover:shadow-glow cursor-pointer group"
                  : "opacity-60 cursor-not-allowed"
              }`}
              onClick={() => module.status === "available" && navigate(module.path)}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="h-12 w-12 rounded-lg gradient-primary text-primary-foreground grid place-items-center shadow-sm">
                  {module.icon}
                </div>
                {module.status === "coming-soon" && <Badge variant="secondary">Coming Soon</Badge>}
              </div>

              <div className="flex-1">
                <h2 className="mb-1 break-words text-xl font-bold tracking-tight">{module.title}</h2>
                <p className="break-words text-sm text-muted-foreground">{module.description}</p>
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
