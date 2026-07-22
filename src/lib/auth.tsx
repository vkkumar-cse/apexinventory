import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { normalizeModuleAccess } from "@/lib/modules";

type Role = "admin" | "worker" | null;
type Status = "pending" | "approved" | "rejected" | null;

interface AuthCtx {
  session: Session | null;
  user: User | null;
  role: Role;
  status: Status;
  displayName: string | null;
  loading: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  isActive: boolean;
  moduleAccess: string[];
  mustChangePassword: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [status, setStatus] = useState<Status>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [moduleAccess, setModuleAccess] = useState<string[]>([]);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  async function loadProfile(uid: string) {
    try {
      const [{ data: roleRow }, { data: prof }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid).order("role", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      ]);

      const finalRole = (prof as any)?.role || (roleRow?.role as Role) || "worker";
      setRole(finalRole);
      
      const finalStatus = (prof as any)?.status || (prof as any)?.status || "pending";
      setStatus((finalStatus as Status) ?? "pending");
      
      setDisplayName((prof as any)?.full_name ?? (prof as any)?.display_name ?? null);
      setIsActive((prof as any)?.is_active ?? true);
      setModuleAccess(normalizeModuleAccess((prof as any)?.module_access));
      setMustChangePassword(!!(prof as any)?.must_change_password);
    } catch (e) {
      console.error("Error loading auth profile:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) setTimeout(() => loadProfile(s.user.id), 0);
      else { setRole(null); setStatus(null); setDisplayName(null); setModuleAccess([]); setMustChangePassword(false); setLoading(false); }
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) loadProfile(s.user.id);
      else setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider value={{
      session, user: session?.user ?? null, role, status, displayName,
      loading, isAdmin: role === "admin" && status === "approved",
      isApproved: status === "approved",
      isActive,
      moduleAccess,
      mustChangePassword,
      refresh: async () => { if (session?.user) await loadProfile(session.user.id); },
      signOut: async () => { await supabase.auth.signOut(); },
    }}>{children}</Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
