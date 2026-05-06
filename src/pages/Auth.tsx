import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Factory, Loader2 } from "lucide-react";

const schema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "At least 6 characters").max(72),
});

export default function Auth() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    document.title = "Sign in · Forge Inventory";
    if (!loading && session) navigate("/", { replace: true });
  }, [session, loading, navigate]);

  async function handle(mode: "signin" | "signup") {
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Account created. You're signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) throw error;
        toast.success("Welcome back.");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
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
        <Card className="p-6 shadow-elevated">
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            {(["signin", "signup"] as const).map((mode) => (
              <TabsContent key={mode} value={mode} className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Label htmlFor={`${mode}-email`}>Email</Label>
                  <Input
                    id={`${mode}-email`}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@factory.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${mode}-password`}>Password</Label>
                  <Input
                    id={`${mode}-password`}
                    type="password"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <Button className="w-full" disabled={busy} onClick={() => handle(mode)}>
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {mode === "signin" ? "Sign in" : "Create account"}
                </Button>
                {mode === "signup" && (
                  <p className="text-xs text-muted-foreground text-center">
                    The first user becomes Admin. All others are Workers.
                  </p>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
