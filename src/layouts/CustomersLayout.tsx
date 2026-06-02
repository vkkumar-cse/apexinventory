import { Link, NavLink } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building, LogOut, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import apexLogo from "@/assets/apex-logo.jpeg";

export function CustomersLayout({ children }: { children: React.ReactNode }) {
  const { user, role, signOut, displayName, isAdmin } = useAuth();

  const nav = [
    { to: "/customers", label: "Customers", icon: Building, show: true },
  ].filter((n) => n.show);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 backdrop-blur bg-background/80 sticky top-0 z-40">
        <div className="container flex h-16 items-center gap-4">
          <Link to="/" className="flex items-center gap-2 font-bold group">
            <img src={apexLogo} alt="Apex Industrial Metrology LLP" className="h-9 w-9 rounded-lg object-cover bg-white" />
            <span className="text-lg tracking-tight">Apex<span className="text-primary"> Customers</span></span>
            <ChevronLeft className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition ml-2 opacity-0 group-hover:opacity-100" />
          </Link>
          <nav className="hidden md:flex items-center gap-1 ml-6">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={true}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors",
                    isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end text-xs">
              <span className="text-foreground font-medium">{displayName ?? user?.email ?? 'Unknown'}</span>
              <Badge variant={isAdmin ? "default" : "secondary"} className="text-[10px] h-4 px-1.5">
                {(role ?? 'worker')?.toUpperCase()}
              </Badge>
            </div>
            <Button variant="ghost" size="icon" onClick={() => signOut().then(() => window.location.href = "/auth") }>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <nav className="md:hidden border-t border-border/60 flex overflow-x-auto">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={true}
              className={({ isActive }) =>
                cn(
                  "flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] min-w-20",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 container py-6">
        {children}
      </main>
    </div>
  );
}
