import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { queryClient } from "./queryClient";

export type AccountRole = "owner" | "admin" | "agent" | "viewer";

export type Profile = {
  id: string;
  accountId: string;
  accountRole: AccountRole;
  fullName: string | null;
  email: string | null;
};

/** Uma clínica da pessoa, para o seletor (Subetapa 03.9). */
export type MinhaClinica = {
  accountId: string;
  nome: string;
  papel: AccountRole;
  ativa: boolean;
};

/**
 * Estado de sessão do Supabase Auth + perfil da CLÍNICA ATIVA (Subetapa 03.9).
 *
 * Até a 03.9 o perfil vinha de `public.profiles` por `user_id` com
 * `.maybeSingle()` — um usuário, uma conta. Com a multiunidade a mesma pessoa
 * pode ter um perfil em cada clínica, e a clínica em que ela está trabalhando
 * é escolhida POR SESSÃO, no banco (`public.set_active_account`). A tela não
 * decide nada disso: ela pergunta ao banco qual é a clínica ativa
 * (`active_membership`) e quais são as clínicas da pessoa (`my_accounts`).
 *
 * `precisaEscolherClinica` é o segundo estágio do login: duas clínicas ou mais
 * e nenhuma escolhida nesta sessão. Enquanto for verdade, o banco nega TUDO —
 * a tela só mostra o seletor.
 *
 * `profile` pode ficar `null` mesmo com sessão válida no caso raro do achado
 * A01 da 01.8 (handle_new_user engoliu exceção) — o app não trava, só não
 * monta item de navegação dependente de módulo (fail-closed no banco).
 */
type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  clinicas: MinhaClinica[];
  precisaEscolherClinica: boolean;
  loading: boolean;
  profileLoading: boolean;
  escolherClinica: (accountId: string) => Promise<{ error: string | null }>;
  recarregarPerfil: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type LinhaMembresia = {
  profile_id: string;
  account_id: string;
  account_role: AccountRole;
  full_name: string | null;
  email: string | null;
};

type LinhaClinica = { account_id: string; account_name: string; account_role: AccountRole; is_active: boolean };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clinicas, setClinicas] = useState<MinhaClinica[]>([]);
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

  const carregar = useCallback(async () => {
    const [{ data: membresia, error: e1 }, { data: linhas, error: e2 }] = await Promise.all([
      supabase.rpc("active_membership").maybeSingle<LinhaMembresia>(),
      supabase.rpc("my_accounts"),
    ]);
    if (e1 || e2) {
      // eslint-disable-next-line no-console
      console.error("Falha ao carregar a clínica ativa:", (e1 ?? e2)?.message);
    }
    let lista = ((linhas ?? []) as LinhaClinica[]).map((l) => ({
      accountId: l.account_id,
      nome: l.account_name,
      papel: l.account_role,
      ativa: l.is_active,
    }));
    let ativa = membresia ?? null;

    // Perfil único com escolha órfã nesta sessão (a pessoa saiu de uma clínica
    // que tinha escolhido): o banco resolve NULL de propósito, para nunca trocar
    // de clínica em silêncio. Com uma clínica só não há o que perguntar — a
    // escolha é refeita explicitamente.
    if (!ativa && lista.length === 1) {
      const { error } = await supabase.rpc("set_active_account", { p_account_id: lista[0].accountId });
      if (!error) {
        const { data } = await supabase.rpc("active_membership").maybeSingle<LinhaMembresia>();
        ativa = data ?? null;
        lista = lista.map((c) => ({ ...c, ativa: true }));
      }
    }

    setClinicas(lista);
    setProfile(
      ativa
        ? { id: ativa.profile_id, accountId: ativa.account_id, accountRole: ativa.account_role, fullName: ativa.full_name, email: ativa.email }
        : null,
    );
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setProfile(null);
      setClinicas([]);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    carregar().finally(() => {
      if (!cancelled) setProfileLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, carregar]);

  async function escolherClinica(accountId: string) {
    const { error } = await supabase.rpc("set_active_account", { p_account_id: accountId });
    if (error) return { error: error.message };
    // O cache de consultas guarda linhas da clínica ANTERIOR. Trocar de clínica
    // sem esvaziá-lo mostraria, por alguns instantes, dado de uma sob o nome da
    // outra — o banco já isola, mas a tela não pode desmentir o banco.
    queryClient.clear();
    await carregar();
    return { error: null };
  }

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
    queryClient.clear();
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        clinicas,
        precisaEscolherClinica: !!session && !profile && clinicas.length > 1,
        loading,
        profileLoading,
        escolherClinica,
        recarregarPerfil: carregar,
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
