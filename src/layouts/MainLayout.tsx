import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut } from "lucide-react";
import apexLogo from "@/assets/apex-logo.jpeg";

export function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, role, signOut, displayName, isAdmin } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/60 backdrop-blur bg-background/80 sticky top-0 z-40">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={apexLogo}
              alt="Apex Industrial Metrology LLP"
              className="h-9 w-9 rounded-lg object-cover bg-white"
            />
            <h1 className="text-xl font-bold tracking-tight">
              Apex<span className="text-primary"> Software</span>
            </h1>
          </Link>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end text-xs">
              <span className="text-foreground font-medium">{displayName ?? user?.email ?? 'Unknown'}</span>
              <Badge variant={isAdmin ? "default" : "secondary"} className="text-[10px] h-4 px-1.5">
                {(role ?? 'worker')?.toUpperCase()}
              </Badge>
            </div>
            <Button variant="ghost" size="icon" onClick={() => signOut().then(() => window.location.href = "/auth")}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
