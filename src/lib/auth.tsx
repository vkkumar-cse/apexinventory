import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [status, setStatus] = useState<Status>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(uid: string) {
    const [{ data: roleRow }, { data: prof }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid).order("role", { ascending: true }).limit(1).maybeSingle(),
      supabase.from("profiles").select("display_name,status").eq("id", uid).maybeSingle(),
    ]);
    setRole((roleRow?.role as Role) ?? "worker");
    setStatus(((prof as any)?.status as Status) ?? "pending");
    setDisplayName((prof as any)?.display_name ?? null);
    setLoading(false);
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) setTimeout(() => loadProfile(s.user.id), 0);
      else { setRole(null); setStatus(null); setDisplayName(null); setLoading(false); }
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
      refresh: async () => { if (session?.user) await loadProfile(session.user.id); },
      signOut: async () => { await supabase.auth.signOut(); },
    }}>{children}</Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
