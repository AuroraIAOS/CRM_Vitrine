/**
 * Plano e orçamento — o acesso a dado do navegador (Subetapa 03.8.a).
 *
 * ============================================================
 * DUAS PORTAS REGISTRADAS, E NENHUM `select` DIRETO NO CLÍNICO
 * ============================================================
 * `aba_treatment` tem `SELECT` REVOGADO por coluna em `dente`, `faces`,
 * `titulo`, `observacao` e `descricao` (migration `047`). Um `select`
 * direto nelas volta `42501` e **parece** falha de RLS — não é: é
 * privilégio de coluna, e é deliberado. O conteúdo clínico do plano só
 * sai por:
 *
 *   · `aba_treatment.ler_planos(cliente_id)` — a matriz clínica;
 *   · `aba_finance.ler_orcamentos(plano_id)` — a vista financeira, que
 *     devolve dente e face **somente a quem tem alcance clínico**, e nesse
 *     caso registra a leitura.
 *
 * As duas gravam em `aba_health.log_acesso` antes de devolver. É por isso
 * que toda query desta camada usa `staleTime: Infinity` e
 * `refetchOnWindowFocus: false`: sem isso a auditoria registraria o que a
 * biblioteca de cache decidiu revalidar, e não o que a pessoa olhou
 * (`instrucoes.md` §5).
 *
 * ============================================================
 * O PREÇO NÃO SE ESCOLHE — E É POR ISSO QUE NÃO HÁ HOOK PARA ISSO
 * ============================================================
 * Não existe, em nenhum lugar deste arquivo, uma função que receba uma
 * tabela de preço e devolva um valor. `resolver_preco` não aceita esse
 * parâmetro (verificação (g) da migration `048`), então a tela não teria
 * como oferecer a escolha nem se quisesse. O que a tela mostra é a
 * PROVENIÊNCIA: de qual degrau e de qual tabela veio o número.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

const treatment = () => supabase.schema("aba_treatment");
const finance = () => supabase.schema("aba_finance");

// ============================================================
// A matriz clínica
// ============================================================

export type CelulaPlano = {
  id: string;
  opcao_id: string;
  fase_id: string;
  procedimento_id: string;
  diagnostico_id: string | null;
  dente: string | null;
  faces: string[] | null;
  estado: string;
  recusado_em: string | null;
  executado_em: string | null;
  observacao: string | null;
};

export type OpcaoPlano = {
  id: string;
  rotulo: string;
  ordem: number;
  consentida_em: string | null;
};

export type DiagnosticoPlano = {
  id: string;
  dente: string | null;
  faces: string[] | null;
  descricao: string;
  /** Derivado no banco: diagnóstico sem procedimento nenhum ainda não foi fasado. */
  fasado: boolean;
};

export type Plano = {
  id: string;
  cliente_id: string;
  profissional_id: string | null;
  titulo: string;
  observacao: string | null;
  criado_em: string;
  opcoes: OpcaoPlano[];
  diagnosticos: DiagnosticoPlano[];
  procedimentos: CelulaPlano[];
};

export function usePlanos(clienteId: string | null) {
  return useQuery({
    queryKey: ["treatment-planos", clienteId],
    enabled: !!clienteId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Plano[]> => {
      const { data, error } = await treatment().rpc("ler_planos", { p_cliente_id: clienteId });
      if (error) throw error;
      return (data ?? []) as Plano[];
    },
  });
}

export type Fase = { id: string; chave: string; rotulo: string; ordem: number; ativa: boolean };

export function useFases() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["treatment-fases", profile?.accountId],
    enabled: !!profile?.accountId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Fase[]> => {
      const { data, error } = await treatment()
        .from("fases")
        .select("id, chave, rotulo, ordem, ativa")
        .eq("account_id", profile!.accountId)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Fase[];
    },
  });
}

// ============================================================
// A vista financeira
// ============================================================

export type ItemOrcamento = {
  id: string;
  procedimento_plano_id: string;
  procedimento_id: string;
  procedimento: string;
  valor_resolvido: number;
  tabela_preco_id: string | null;
  tabela_preco: string | null;
  degrau: string;
  resolvido_em: string;
  /** `null` quando quem lê não tem alcance clínico — nunca ausente, para a tela ter um formato só. */
  dente: string | null;
  faces: string[] | null;
  estado_procedimento: string;
};

export type Orcamento = {
  id: string;
  plano_id: string;
  opcao_id: string;
  opcao_rotulo: string;
  profissional_id: string | null;
  estado: "rascunho" | "aprovado" | "recusado";
  desconto_valor: number;
  desconto_motivo: string | null;
  promocao: string | null;
  parcelas: number;
  taxa_juros: number;
  taxa_multa_atraso: number;
  valor_bruto: number;
  valor_liquido: number;
  aprovado_em: string | null;
  com_detalhe_clinico: boolean;
  itens: ItemOrcamento[];
};

export function useOrcamentos(planoId: string | null) {
  return useQuery({
    queryKey: ["treatment-orcamentos", planoId],
    enabled: !!planoId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Orcamento[]> => {
      const { data, error } = await finance().rpc("ler_orcamentos", { p_plano_id: planoId });
      if (error) throw error;
      return (data ?? []) as Orcamento[];
    },
  });
}

/** Invalida as duas leituras registradas de um plano de uma vez só. */
function useRecarregarPlano(planoId: string | null, clienteId: string | null) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["treatment-orcamentos", planoId] });
    void qc.invalidateQueries({ queryKey: ["treatment-planos", clienteId] });
    void qc.invalidateQueries({ queryKey: ["health-log", clienteId] });
  };
}

export function useMontarOrcamento(planoId: string | null, clienteId: string | null) {
  const recarregar = useRecarregarPlano(planoId, clienteId);
  return useMutation({
    mutationFn: async ({ opcaoId, profissionalId }: { opcaoId: string; profissionalId: string | null }) => {
      const { data, error } = await finance().rpc("montar_orcamento", {
        p_opcao_id: opcaoId,
        p_profissional_id: profissionalId,
      });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: recarregar,
  });
}

export type LinhaSimulacao = {
  item_id: string;
  procedimento: string;
  valor_atual: number;
  valor_novo: number;
  diferenca: number;
  degrau_atual: string;
  degrau_novo: string;
  tabela_nova: string | null;
};

/**
 * O AVISO ANTES DE CONFIRMAR. Não é cortesia de interface: sem ele,
 * trocar o dentista de um procedimento já orçado corrige o preço em
 * silêncio, e o financeiro passa a ter um número que ninguém decidiu
 * (`RELATORIO_DE_IMPACTO_ICE.md` §3.1-B2).
 *
 * `simular_troca_de_profissional` é `STABLE` — não grava —, e resolve pela
 * MESMA `resolver_preco()` que a confirmação usa. Duas contas separadas
 * divergiriam no primeiro dia em que alguém mexesse numa delas.
 */
export function useSimularTroca() {
  return useMutation({
    mutationFn: async ({ orcamentoId, profissionalId }: { orcamentoId: string; profissionalId: string | null }) => {
      const { data, error } = await finance().rpc("simular_troca_de_profissional", {
        p_orcamento_id: orcamentoId,
        p_profissional_id: profissionalId,
      });
      if (error) throw error;
      return (data ?? []) as LinhaSimulacao[];
    },
  });
}

export function useTrocarProfissional(planoId: string | null, clienteId: string | null) {
  const recarregar = useRecarregarPlano(planoId, clienteId);
  return useMutation({
    mutationFn: async ({ orcamentoId, profissionalId }: { orcamentoId: string; profissionalId: string | null }) => {
      const { data, error } = await finance().rpc("trocar_profissional_do_orcamento", {
        p_orcamento_id: orcamentoId,
        p_profissional_id: profissionalId,
      });
      if (error) throw error;
      return Number(data);
    },
    onSuccess: recarregar,
  });
}

export type CondicoesComerciais = {
  desconto_valor: number;
  desconto_motivo: string | null;
  promocao: string | null;
  parcelas: number;
  taxa_juros: number;
  taxa_multa_atraso: number;
};

/**
 * As cinco condições que **só `admin`** altera. A tela desabilita os
 * campos para quem não é — e o banco recusa de todo jeito, por gatilho de
 * coluna (`aba_finance.exigir_alcada_financeira`). A trava da tela é
 * cortesia; a que vale é a do banco.
 */
export function useDefinirCondicoes(planoId: string | null, clienteId: string | null) {
  const recarregar = useRecarregarPlano(planoId, clienteId);
  return useMutation({
    mutationFn: async ({ orcamentoId, condicoes }: { orcamentoId: string; condicoes: Partial<CondicoesComerciais> }) => {
      const { error } = await finance().from("orcamentos").update(condicoes).eq("id", orcamentoId);
      if (error) throw error;
    },
    onSuccess: recarregar,
  });
}

export function useAprovarOrcamento(planoId: string | null, clienteId: string | null) {
  const recarregar = useRecarregarPlano(planoId, clienteId);
  return useMutation({
    mutationFn: async (orcamentoId: string) => {
      const { error } = await finance().rpc("aprovar_orcamento", { p_orcamento_id: orcamentoId });
      if (error) throw error;
    },
    onSuccess: recarregar,
  });
}

// ============================================================
// Catálogo de apoio: procedimentos, profissionais e tipos
// ============================================================

export function useNomesDeProcedimento() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["treatment-procedimentos", profile?.accountId],
    enabled: !!profile?.accountId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .schema("aba_catalog")
        .from("procedimentos")
        .select("id, nome")
        .eq("account_id", profile!.accountId);
      if (error) throw error;
      return new Map((data ?? []).map((p) => [p.id as string, p.nome as string]));
    },
  });
}

export type ProfissionalComTipo = {
  id: string;
  nome: string;
  tipoId: string | null;
  tipo: string | null;
};

/**
 * Profissionais ATIVOS, com o tipo — que é o que move o degrau 2 da
 * escada. O tipo vem junto para a tela poder explicar por que o preço
 * mudou, em vez de mostrar um número novo sem motivo.
 */
export function useProfissionaisComTipo() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["treatment-profissionais", profile?.accountId],
    enabled: !!profile?.accountId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ProfissionalComTipo[]> => {
      const { data, error } = await supabase
        .schema("aba_scheduling")
        .from("profissionais")
        .select("id, nome_exibicao, tipo_profissional_id")
        .eq("account_id", profile!.accountId)
        .eq("ativo", true)
        .order("nome_exibicao");
      if (error) throw error;

      const { data: tipos } = await supabase
        .schema("aba_scheduling")
        .from("tipos_profissional")
        .select("id, rotulo")
        .eq("account_id", profile!.accountId);
      const porId = new Map((tipos ?? []).map((t) => [t.id as string, t.rotulo as string]));

      return (data ?? []).map((p) => ({
        id: p.id as string,
        nome: p.nome_exibicao as string,
        tipoId: (p.tipo_profissional_id as string) ?? null,
        tipo: p.tipo_profissional_id ? (porId.get(p.tipo_profissional_id as string) ?? null) : null,
      }));
    },
  });
}
