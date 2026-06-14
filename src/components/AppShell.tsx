import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, Package, Truck, ScanLine, LogOut, FolderTree, ClipboardList, Users as UsersIcon, History } from "lucide-react";
import { cn } from "@/lib/utils";
import apexLogo from "@/assets/apex-logo.jpeg";

export function AppShell() {
  const { user, role, signOut, displayName, isAdmin } = useAuth();
  const navigate = useNavigate();

  const nav = [
    { to: "/inventory", label: "Dashboard", icon: LayoutDashboard, show: true },
    { to: "/categories", label: "Categories", icon: FolderTree, show: true },
    { to: "/products", label: "Products", icon: Package, show: true },
    { to: "/suppliers", label: "Suppliers", icon: Truck, show: isAdmin },
    {
  to: "/transactions",
  label: "Transactions",
  icon: History,
  show: true,
},
    { to: "/requests", label: "Requests", icon: ClipboardList, show: true },
    { to: "/scan", label: "Scan", icon: ScanLine, show: true },
    { to: "/users", label: "Users", icon: UsersIcon, show: isAdmin },
  ].filter(n => n.show);

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <header className="border-b border-border/60 backdrop-blur bg-background/80 sticky top-0 z-40">
        <div className="container flex h-16 max-w-full items-center gap-3 px-3 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-2 font-bold">
            <img src={apexLogo} alt="Apex Industrial Metrology LLP" className="h-9 w-9 rounded-lg object-cover bg-white" />
            <span className="truncate text-base tracking-tight sm:text-lg">Apex<span className="text-primary"> Software</span></span>
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
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden sm:flex flex-col items-end text-xs">
              <span className="text-foreground font-medium">{displayName ?? user?.email ?? 'Unknown'}</span>
              <Badge variant={isAdmin ? "default" : "secondary"} className="text-[10px] h-4 px-1.5">
                {(role ?? 'worker')?.toUpperCase()}
              </Badge>
            </div>
            <Button variant="ghost" size="icon" onClick={() => signOut().then(() => navigate("/auth"))}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <nav className="scrollbar-hide md:hidden border-t border-border/60 flex max-w-full overflow-x-auto overscroll-x-contain px-2">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={true}
              className={({ isActive }) =>
                cn(
                  "flex min-w-[4.75rem] shrink-0 flex-col items-center gap-0.5 px-2 py-2 text-center text-[11px]",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              <Icon className="h-4 w-4" />
              <span className="max-w-full truncate">{label}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="container max-w-full flex-1 px-3 py-4 sm:px-6 md:py-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
