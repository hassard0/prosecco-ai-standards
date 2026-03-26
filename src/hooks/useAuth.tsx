import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "admin" | "contributor" | null;

interface AuthContext {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isContributor: boolean;
  /** True if user is admin OR contributor */
  hasTeamAccess: boolean;
  role: AppRole;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthContext>({
  user: null,
  session: null,
  isAdmin: false,
  isContributor: false,
  hasTeamAccess: false,
  role: null,
  loading: true,
  signOut: async () => {},
});

async function fetchRole(userId: string): Promise<AppRole> {
  // Check admin first, then contributor
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) {
    console.error("Failed to fetch role", error);
    return null;
  }

  if (!data || data.length === 0) return null;

  const roles = data.map((r) => r.role);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("contributor")) return "contributor";
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole>(null);

  useEffect(() => {
    let active = true;

    const syncRole = async (nextSession: Session | null) => {
      setSession(nextSession);

      if (!nextSession?.user) {
        if (!active) return;
        setRole(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const userRole = await fetchRole(nextSession.user.id);

      if (!active) return;
      setRole(userRole);
      setLoading(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncRole(nextSession);
    });

    void supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      void syncRole(initialSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null);
  };

  const isAdmin = role === "admin";
  const isContributor = role === "contributor";
  const hasTeamAccess = isAdmin || isContributor;

  return (
    <AuthCtx.Provider value={{ user: session?.user ?? null, session, isAdmin, isContributor, hasTeamAccess, role, loading, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
