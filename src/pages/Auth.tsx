import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import apexLogo from "@/assets/apex-logo.jpeg";

const signInSchema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "At least 6 characters").max(72),
});
const signUpSchema = signInSchema.extend({
  display_name: z.string().trim().min(1, "Name required").max(60),
});

export default function Auth() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [firstUser, setFirstUser] = useState<boolean>(false);

  useEffect(() => {
    document.title = "Sign in · Apex Inventory";
    if (!loading && session) navigate("/", { replace: true });
    (async () => {
      const { count } = await supabase.from("user_roles").select("id", { count: "exact", head: true });
      const first = (count ?? 0) === 0;
      setFirstUser(first);
      if (first) setTab("signup");
    })();
  }, [session, loading, navigate]);

  async function signIn() {
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Welcome back.");
  }

  async function signUp() {
    const parsed = signUpSchema.safeParse({ email, password, display_name: displayName });
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
    toast.success(firstUser ? "Admin account created — signing you in." : "Account created. An admin must approve your account before you can sign in.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={apexLogo} alt="Apex Industrial Metrology LLP" className="h-20 w-20 mx-auto rounded-2xl object-cover bg-white shadow-elevated mb-4" />
          <h1 className="text-3xl font-bold tracking-tight">Apex<span className="text-primary"> Inventory</span></h1>
          <p className="text-muted-foreground text-sm mt-2">Industrial Metrology LLP — smart QR-based inventory</p>
        </div>
        <Card className="p-6 shadow-elevated">
          <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
            <TabsList className="grid grid-cols-2 w-full mb-4">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="space-y-4">
              <p className="text-xs text-muted-foreground">Use your existing account credentials.</p>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@factory.com" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
              <Button className="w-full" disabled={busy} onClick={signIn}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Sign in
              </Button>
            </TabsContent>

            <TabsContent value="signup" className="space-y-4">
              <p className="text-xs text-muted-foreground">
                {firstUser
                  ? "Sign up to request access."
                  : "New accounts are created as Workers and require admin approval before access is granted."}
              </p>
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your full name" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@factory.com" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
              <Button className="w-full" disabled={busy} onClick={signUp}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {firstUser ? "Create admin & sign in" : "Create account"}
              </Button>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
