import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type AccountRole = "owner" | "admin" | "agent" | "viewer";

export type Profile = {
  id: string;
  accountId: string;
  accountRole: AccountRole;
  fullName: string | null;
  email: string | null;
};

/**
 * Estado de sessão do Supabase Auth + perfil resolvido de `public.profiles`
 * (Subetapa 02.1 — a Subetapa 01.1 deixou isto declarado como pendência de
 * comentário: "entra quando access/public.profiles existirem", que já
 * existem desde a 01.2). `profile` pode ficar `null` mesmo com sessão válida
 * no caso raro do achado A01 da 01.8 (handle_new_user engoliu exceção) — o
 * app não trava nesse caso, só não monta nenhum item de navegação
 * dependente de módulo (access.can() nega por ausência de profile, fail-closed).
 */
type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function mapProfileRow(row: {
  id: string;
  account_id: string;
  account_role: AccountRole;
  full_name: string | null;
  email: string | null;
}): Profile {
  return {
    id: row.id,
    accountId: row.account_id,
    accountRole: row.account_role,
    fullName: row.full_name,
    email: row.email,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);

    supabase
      .from("profiles")
      .select("id, account_id, account_role, full_name, email")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // eslint-disable-next-line no-console
          console.error("Falha ao carregar public.profiles:", error.message);
          setProfile(null);
        } else {
          setProfile(data ? mapProfileRow(data) : null);
        }
        setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUp(email: string, password: string, fullName: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        profileLoading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
