import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

function db() {
  return supabase.schema("aba_sales");
}

export type OportunidadeStatus = "ativa" | "ganha" | "perdida";

export type Etapa = { id: string; nome: string; ordem: number };
export type Funil = { id: string; nome: string; etapas: Etapa[] };

/**
 * Funil "Comercial padrão" da conta — este v01 trabalha com um único
 * funil por conta (a tela `1f` do wireframe mostra um seletor de funil,
 * mas não há segunda instância de negócio a distinguir ainda; gerenciar
 * múltiplos funis/etapas fica para quando existir demanda real, fora do
 * Objetivo desta subetapa). Pega o funil mais antigo da conta, se houver.
 */
export function useFunilPadrao() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;

  return useQuery({
    queryKey: ["funil-padrao", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Funil | null> => {
      const { data: funis, error: e1 } = await db()
        .from("funis")
        .select("id, nome")
        .eq("account_id", accountId!)
        .order("criado_em", { ascending: true })
        .limit(1);
      if (e1) throw e1;
      if (!funis || funis.length === 0) return null;

      const funil = funis[0];
      const { data: etapas, error: e2 } = await db()
        .from("etapas_funil")
        .select("id, nome, ordem")
        .eq("funil_id", funil.id)
        .order("ordem", { ascending: true });
      if (e2) throw e2;

      return { id: funil.id, nome: funil.nome, etapas: etapas ?? [] };
    },
  });
}

const ETAPAS_PADRAO = ["Novo contato", "Avaliação agendada", "Proposta enviada", "Negociação", "Fechado"];

export function useCriarFunilPadrao() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const accountId = profile!.accountId;
      const { data: funil, error: e1 } = await db().from("funis").insert({ account_id: accountId, nome: "Comercial padrão" }).select("id").single();
      if (e1) throw e1;

      const { error: e2 } = await db()
        .from("etapas_funil")
        .insert(ETAPAS_PADRAO.map((nome, ordem) => ({ funil_id: funil.id, nome, ordem })));
      if (e2) throw e2;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["funil-padrao"] }),
  });
}

export type Oportunidade = {
  id: string;
  funilId: string;
  etapaId: string;
  pessoaId: string;
  pessoaNome: string;
  titulo: string;
  valor: number;
  moeda: string;
  previsaoFechamento: string | null;
  status: OportunidadeStatus;
  criadoEm: string;
};

export function useOportunidades(funilId: string | undefined) {
  return useQuery({
    queryKey: ["oportunidades", funilId],
    enabled: !!funilId,
    queryFn: async (): Promise<Oportunidade[]> => {
      const { data: oportunidades, error } = await db()
        .from("oportunidades")
        .select("id, funil_id, etapa_id, pessoa_id, titulo, valor, moeda, previsao_fechamento, status, criado_em")
        .eq("funil_id", funilId!)
        .order("criado_em", { ascending: false });
      if (error) throw error;

      const pessoaIds = Array.from(new Set((oportunidades ?? []).map((o) => o.pessoa_id)));
      let nomes: Record<string, string> = {};
      if (pessoaIds.length) {
        const { data: pessoas, error: e2 } = await supabase.schema("aba_people").from("pessoas").select("id, nome_exibicao").in("id", pessoaIds);
        if (e2) throw e2;
        nomes = Object.fromEntries((pessoas ?? []).map((p) => [p.id, p.nome_exibicao]));
      }

      return (oportunidades ?? []).map((o) => ({
        id: o.id,
        funilId: o.funil_id,
        etapaId: o.etapa_id,
        pessoaId: o.pessoa_id,
        pessoaNome: nomes[o.pessoa_id] ?? "—",
        titulo: o.titulo,
        valor: Number(o.valor),
        moeda: o.moeda,
        previsaoFechamento: o.previsao_fechamento,
        status: o.status as OportunidadeStatus,
        criadoEm: o.criado_em,
      }));
    },
  });
}

/** Pessoas da conta para o seletor de "Nova oportunidade" — lista leve, sem papel/tags. */
export function usePessoasParaSelecao() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["pessoas-selecao", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema("aba_people")
        .from("pessoas")
        .select("id, nome_exibicao")
        .eq("account_id", accountId!)
        .order("nome_exibicao");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCriarOportunidade() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      funilId: string;
      etapaId: string;
      pessoaId: string;
      titulo: string;
      valor: number;
      previsaoFechamento?: string;
    }) => {
      const { error } = await db().from("oportunidades").insert({
        account_id: profile!.accountId,
        funil_id: input.funilId,
        etapa_id: input.etapaId,
        pessoa_id: input.pessoaId,
        titulo: input.titulo,
        valor: input.valor,
        previsao_fechamento: input.previsaoFechamento || null,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["oportunidades"] }),
  });
}

/** Move oportunidade entre etapas — só chamado pela UI para negócios `ativa` (ciclo do docs/02 §9). */
export function useMoverOportunidade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; etapaId: string }) => {
      const { error } = await db().from("oportunidades").update({ etapa_id: input.etapaId }).eq("id", input.id).eq("status", "ativa");
      if (error) throw error;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["oportunidades"] });
      const previas = qc.getQueriesData<Oportunidade[]>({ queryKey: ["oportunidades"] });
      qc.setQueriesData<Oportunidade[]>({ queryKey: ["oportunidades"] }, (old) =>
        old?.map((o) => (o.id === input.id ? { ...o, etapaId: input.etapaId } : o)),
      );
      return { previas };
    },
    onError: (_err, _input, context) => {
      context?.previas.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["oportunidades"] }),
  });
}

/** Fecha o negócio — status é terminal (ativa → ganha | perdida, nunca reversível, docs/02 §9). */
export function useFecharOportunidade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: "ganha" | "perdida" }) => {
      const { error } = await db().from("oportunidades").update({ status: input.status }).eq("id", input.id).eq("status", "ativa");
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["oportunidades"] }),
  });
}
