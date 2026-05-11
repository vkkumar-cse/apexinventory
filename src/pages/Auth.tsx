import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Factory, Loader2 } from "lucide-react";

const schema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "At least 6 characters").max(72),
  display_name: z.string().trim().min(1, "Name required").max(60).optional(),
});

export default function Auth() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [bootstrap, setBootstrap] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    document.title = "Sign in · Forge Inventory";
    if (!loading && session) navigate("/", { replace: true });
    // Detect first-ever user: if no roles exist, allow public signup → first user becomes admin.
    (async () => {
      const { count } = await supabase.from("user_roles").select("id", { count: "exact", head: true });
      setBootstrap((count ?? 0) === 0);
    })();
  }, [session, loading, navigate]);

  async function signIn() {
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Welcome back.");
  }

  async function signUpFirstAdmin() {
    const parsed = schema.safeParse({ email, password, display_name: displayName });
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { display_name: parsed.data.display_name },
      },
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Admin account created. You're signed in.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 rounded-xl gradient-primary items-center justify-center shadow-glow mb-4">
            <Factory className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">FORGE<span className="text-primary">/INV</span></h1>
          <p className="text-muted-foreground text-sm mt-2">Smart QR-based inventory for the factory floor</p>
        </div>
        <Card className="p-6 shadow-elevated space-y-4">
          <div>
            <h2 className="font-semibold text-lg">{bootstrap ? "Create the first admin" : "Sign in"}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {bootstrap
                ? "No accounts exist yet. The first sign-up becomes the Admin."
                : "Worker accounts are created by an admin. Contact your admin if you don't have credentials."}
            </p>
          </div>
          {bootstrap && (
            <div className="space-y-2">
              <Label>Display name</Label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your full name" />
            </div>
          )}
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@factory.com" />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input type="password" autoComplete={bootstrap ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <Button className="w-full" disabled={busy || bootstrap === null} onClick={bootstrap ? signUpFirstAdmin : signIn}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {bootstrap ? "Create admin & sign in" : "Sign in"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
