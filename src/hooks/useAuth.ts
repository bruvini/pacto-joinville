import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "acp" | "aco";

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
  profile: { nome: string; email: string; cargo: string | null } | null;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<AuthState["profile"]>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(async () => {
          const [{ data: r }, { data: p }] = await Promise.all([
            supabase.from("user_roles").select("role").eq("user_id", sess.user.id),
            supabase.from("profiles").select("nome,email,cargo").eq("id", sess.user.id).maybeSingle(),
          ]);
          setRoles((r ?? []).map((x) => x.role as AppRole));
          setProfile(p as any);
        }, 0);
      } else {
        setRoles([]);
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return { user, session, loading, roles, profile };
}

export function hasRole(roles: AppRole[], role: AppRole) {
  return roles.includes(role) || roles.includes("admin");
}
