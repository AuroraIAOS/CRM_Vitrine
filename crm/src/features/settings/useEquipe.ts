import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth, type AccountRole } from "@/lib/auth";

export type MembroEquipe = {
  profileId: string;
  userId: string;
  nome: string;
  email: string;
  accountRole: AccountRole;
  funcionarioId: string | null;
  funcionarioAtivo: boolean;
  profissionalId: string | null;
  profissionalAtivo: boolean;
};

/**
 * Três queries independentes (public.profiles / aba_people.funcionarios /
 * aba_scheduling.profissionais) combinadas no client, em vez de embedding
 * cross-schema do PostgREST — mais simples e robusto que forçar embed
 * entre schemas diferentes. Todas as três já são RLS-scoped à conta do
 * usuário logado (is_account_member()); o .eq(account_id) aqui é só
 * clareza, não é a fronteira de segurança real.
 */
export function useEquipe() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;

  return useQuery({
    queryKey: ["equipe", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<MembroEquipe[]> => {
      const [{ data: perfis, error: erroPerfis }, { data: funcionarios, error: erroFuncionarios }, { data: profissionais, error: erroProfissionais }] =
        await Promise.all([
          supabase.from("profiles").select("id, user_id, full_name, email, account_role").eq("account_id", accountId!),
          supabase.schema("aba_people").from("funcionarios").select("id, profile_id, ativo").eq("account_id", accountId!),
          supabase.schema("aba_scheduling").from("profissionais").select("id, funcionario_id, ativo").eq("account_id", accountId!),
        ]);

      if (erroPerfis) throw erroPerfis;
      if (erroFuncionarios) throw erroFuncionarios;
      if (erroProfissionais) throw erroProfissionais;

      return (perfis ?? []).map((p) => {
        const funcionario = funcionarios?.find((f) => f.profile_id === p.id) ?? null;
        const profissional = funcionario ? (profissionais?.find((pr) => pr.funcionario_id === funcionario.id) ?? null) : null;
        return {
          profileId: p.id,
          userId: p.user_id,
          nome: p.full_name || p.email,
          email: p.email,
          accountRole: p.account_role,
          funcionarioId: funcionario?.id ?? null,
          funcionarioAtivo: funcionario?.ativo ?? false,
          profissionalId: profissional?.id ?? null,
          profissionalAtivo: profissional?.ativo ?? false,
        };
      });
    },
  });
}

export type ConviteCriado = {
  ok: boolean;
  invitation_id: string;
  token: string;
  role: AccountRole;
  expires_at: string;
};

export function useCriarConvite() {
  return useMutation({
    mutationFn: async (input: { role: AccountRole; label?: string }): Promise<ConviteCriado> => {
      const { data, error } = await supabase.rpc("criar_convite", {
        p_role: input.role,
        p_label: input.label ?? null,
      });
      if (error) throw error;
      return data as ConviteCriado;
    },
  });
}

export function useDefinirProfissional() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { funcionarioId: string; profissional: boolean }) => {
      const { error } = await supabase
        .schema("aba_scheduling")
        .rpc("definir_profissional", { p_funcionario_id: input.funcionarioId, p_profissional: input.profissional });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["equipe"] });
    },
  });
}

export function useMudarPapel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; novoPapel: AccountRole }) => {
      const { error } = await supabase.rpc("set_member_role", { p_user_id: input.userId, p_new_role: input.novoPapel });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["equipe"] });
    },
  });
}
