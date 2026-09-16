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

/**
 * A célula da matriz. Desde a migration `051` (Subetapa 03.8.c) ela carrega
 * procedimento OU pacote — arco exclusivo, exatamente um dos dois vem
 * preenchido (D-F1, D-F6).
 */
export type CelulaPlano = {
  id: string;
  opcao_id: string;
  fase_id: string;
  procedimento_id: string | null;
  pacote_id: string | null;
  diagnostico_id: string | null;
  dente: string | null;
  faces: string[] | null;
  estado: string;
  recusado_em: string | null;
  executado_em: string | null;
  observacao: string | null;
  /**
   * As faces EXECUTADAS, com data e autor gravados pelo banco (Subetapa
   * 03.8.b, passo 36). `face` nula é a unidade de procedimento sem face.
   * Vem só por `ler_planos` — a coluna é revogada para `select` direto.
   */
  execucoes: { face: string | null; executado_em: string; executado_por: string; executado_por_nome: string | null }[];
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
  tipo: "procedimento" | "pacote";
  procedimento_id: string | null;
  pacote_id: string | null;
  /** O nome do item — do procedimento ou do pacote. */
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
  aprovado_por: string | null;
  /**
   * O BANCO responde se quem está olhando é o profissional que vai executar
   * — o único que aprova (D-F7). A tela não recalcula isso: ela usa a
   * resposta para mostrar o botão ou explicar por que ele não está lá.
   */
  sou_quem_aprova: boolean;
  /**
   * Preenchido quando o orçamento está em rascunho porque a recepção mexeu
   * em dinheiro depois de aprovado (D-F3). É o aviso de nova aprovação.
   */
  ultima_devolucao: { em: string; por: string | null; por_nome: string | null; colunas: string[] } | null;
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

export type PlanoOrcado = { plano_id: string; criado_em: string; orcamentos: number; aprovados: number };

/**
 * A PORTA DA RECEPÇÃO (Subetapa 03.8.c). Quem não tem alcance clínico
 * recebe `ler_planos` vazio — correto —, e sem isto não teria como abrir o
 * orçamento em que precisa dar desconto. Devolve só identificador, data e
 * contagens: nada clínico, e por isso nada registrado em `log_acesso`.
 */
export function usePlanosOrcados(clienteId: string | null) {
  return useQuery({
    queryKey: ["treatment-planos-orcados", clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<PlanoOrcado[]> => {
      const { data, error } = await finance().rpc("planos_orcados_do_cliente", { p_cliente_id: clienteId });
      if (error) throw error;
      return (data ?? []) as PlanoOrcado[];
    },
  });
}

/** Invalida as duas leituras registradas de um plano de uma vez só. */
function useRecarregarPlano(planoId: string | null, clienteId: string | null) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["treatment-orcamentos", planoId] });
    void qc.invalidateQueries({ queryKey: ["treatment-planos", clienteId] });
    void qc.invalidateQueries({ queryKey: ["treatment-planos-orcados", clienteId] });
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

// ============================================================
// Montar o plano pela tela (Subetapa 03.8.c)
// ============================================================
//
// A 03.8 foi só banco e a 03.8.a entregou a leitura: o plano da
// demonstração de 2026-09-05 precisou nascer por SQL. Estas mutações fecham
// a corrente `odontograma → plano → orçamento` pela interface.
//
// NENHUMA DELAS DECIDE PERMISSÃO. Quem pode montar é
// `aba_treatment.pode_planejar` — na RLS de cada `insert` e na pergunta de
// `usePodePlanejar`, que a tela usa só para EXPLICAR a recusa (Qualidade fixa
// da Etapa 03: a tela não recalcula permissão no client).
//
// E NENHUMA DELAS PEDE COLUNA CLÍNICA DE VOLTA. `dente`, `faces`, `titulo` e
// `descricao` têm `SELECT` revogado (047): um `insert(...).select("*")`
// voltaria `42501` e pareceria falha de RLS. Quando o `id` é preciso, pede-se
// só o `id` — que é metadado legível.

export type AcaoPlano = "leitura" | "criacao" | "atualizacao" | "exclusao";

export function usePodePlanejar(clienteId: string | null, acao: AcaoPlano) {
  return useQuery({
    queryKey: ["treatment-pode-planejar", clienteId, acao],
    enabled: !!clienteId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await treatment().rpc("pode_planejar", { p_cliente_id: clienteId, p_acao: acao });
      // Falha fechada: erro vira "não pode". A recusa de verdade vem da RLS.
      if (error) return false;
      return data === true;
    },
  });
}

export function useCriarPlano(clienteId: string | null) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ titulo, profissionalId }: { titulo: string; profissionalId: string | null }) => {
      const { data, error } = await treatment()
        .from("planos")
        .insert({
          account_id: profile!.accountId,
          cliente_id: clienteId,
          titulo: titulo.trim() || "Plano de tratamento",
          profissional_id: profissionalId,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["treatment-planos", clienteId] });
    },
  });
}

export function useCriarOpcao(clienteId: string | null) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ planoId, rotulo, ordem }: { planoId: string; rotulo: string; ordem: number }) => {
      const { data, error } = await treatment()
        .from("opcoes")
        .insert({ account_id: profile!.accountId, plano_id: planoId, rotulo, ordem })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["treatment-planos", clienteId] });
    },
  });
}

export function useCriarDiagnostico(clienteId: string | null) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { planoId: string; dente: string | null; faces: string[]; descricao: string }) => {
      // Sem `.select()`: `descricao`, `dente` e `faces` não são legíveis
      // por coluna, e o `id` não é preciso aqui — a leitura registrada
      // recarrega a matriz inteira.
      const { error } = await treatment().from("diagnosticos").insert({
        account_id: profile!.accountId,
        plano_id: d.planoId,
        dente: d.dente,
        faces: d.faces,
        descricao: d.descricao,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["treatment-planos", clienteId] });
    },
  });
}

export type NovoItemDaOpcao = {
  planoId: string;
  opcaoId: string;
  faseId: string;
  /** O braço do arco (D-F6): procedimento OU pacote. */
  item: { tipo: "procedimento" | "pacote"; id: string };
  dente: string | null;
  faces: string[];
  diagnosticoId: string | null;
};

/**
 * "Selecionar N faces cria N linhas, uma por DENTE" (03.8): a célula tem UM
 * dente. Quem quiser a mesma restauração em três dentes acrescenta três
 * vezes — e a forma da tabela recusa a linha com três dentes antes de
 * qualquer regra de tela.
 */
export function useAcrescentarItem(planoId: string | null, clienteId: string | null) {
  const { profile } = useAuth();
  const recarregar = useRecarregarPlano(planoId, clienteId);
  return useMutation({
    mutationFn: async (n: NovoItemDaOpcao) => {
      const pacote = n.item.tipo === "pacote";
      const { error } = await treatment()
        .from("procedimentos_plano")
        .insert({
          account_id: profile!.accountId,
          plano_id: n.planoId,
          opcao_id: n.opcaoId,
          fase_id: n.faseId,
          procedimento_id: pacote ? null : n.item.id,
          pacote_id: pacote ? n.item.id : null,
          // Pacote não se lança por dente nem por face — o banco recusa
          // (`procedimentos_plano_pacote_sem_dente`); a tela nem manda.
          dente: pacote ? null : n.dente,
          faces: pacote ? [] : n.faces,
          diagnostico_id: n.diagnosticoId,
        });
      if (error) throw error;
    },
    onSuccess: recarregar,
  });
}

/**
 * Só `proposto` não recusado se apaga (policy da 045). O `DELETE` que a
 * policy nega não dá erro — volta ZERO linhas —, e "não deu erro" não é
 * "apagou" (`instrucoes.md` §5). Por isso a contagem é conferida e a
 * ausência de efeito vira mensagem.
 */
export function useRemoverItem(planoId: string | null, clienteId: string | null) {
  const recarregar = useRecarregarPlano(planoId, clienteId);
  return useMutation({
    mutationFn: async (celulaId: string) => {
      const { data, error } = await treatment()
        .from("procedimentos_plano")
        .delete()
        .eq("id", celulaId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          "Nada foi removido. Só sai do plano o item ainda proposto e não recusado, e remover exige a permissão de exclusão do módulo Plano.",
        );
      }
    },
    onSuccess: recarregar,
  });
}

/** Gera os orçamentos de TODAS as opções de uma vez — é o gesto do caminho feliz (E3). */
export function useMontarTodosOsOrcamentos(planoId: string | null, clienteId: string | null) {
  const recarregar = useRecarregarPlano(planoId, clienteId);
  return useMutation({
    mutationFn: async ({ opcoes, profissionalId }: { opcoes: string[]; profissionalId: string | null }) => {
      for (const opcaoId of opcoes) {
        const { error } = await finance().rpc("montar_orcamento", {
          p_opcao_id: opcaoId,
          p_profissional_id: profissionalId,
        });
        // Orçamento já aprovado não se remonta — e isso não é falha do
        // gesto "gerar todos": as outras opções seguem.
        if (error && !/não se remonta/.test(error.message)) throw error;
      }
    },
    onSuccess: recarregar,
  });
}

export type ProcedimentoDoCatalogo = {
  id: string;
  nome: string;
  unidade: string | null;
  facesMinimo: number | null;
  facesMaximo: number | null;
};

/** O que a tela precisa para ajudar a montar a célula: se o item pede dente e quantas faces aceita. */
export function useProcedimentosDoCatalogo() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["treatment-catalogo-procedimentos", profile?.accountId],
    enabled: !!profile?.accountId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ProcedimentoDoCatalogo[]> => {
      const { data, error } = await supabase
        .schema("aba_catalog")
        .from("procedimentos")
        .select("id, nome, unidade_lancamento, faces_minimo, faces_maximo")
        .eq("account_id", profile!.accountId)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id as string,
        nome: p.nome as string,
        unidade: (p.unidade_lancamento as string) ?? null,
        facesMinimo: (p.faces_minimo as number) ?? null,
        facesMaximo: (p.faces_maximo as number) ?? null,
      }));
    },
  });
}

export type PacoteDoCatalogo = { id: string; nome: string; precoTotal: number; ativo: boolean };

/** Todos os pacotes, ativos e inativos — o inativo ainda precisa de NOME onde já estava num plano. */
export function usePacotesDoCatalogo() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["treatment-catalogo-pacotes", profile?.accountId],
    enabled: !!profile?.accountId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PacoteDoCatalogo[]> => {
      const { data, error } = await supabase
        .schema("aba_catalog")
        .from("pacotes")
        .select("id, nome, preco_total, ativo")
        .eq("account_id", profile!.accountId)
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id as string,
        nome: p.nome as string,
        precoTotal: Number(p.preco_total),
        ativo: p.ativo === true,
      }));
    },
  });
}

// ============================================================
// O contrato (Subetapa 03.8.b)
// ============================================================
//
// NENHUMA MUTAÇÃO DESTE BLOCO ESCREVE EM TABELA. Linha de contrato,
// documento, assinatura e execução avulsa só nascem pelas funções da
// migration `052`, que conferem quem chama — `itens_contrato` e
// `assinaturas_contrato` nem têm escrita para `authenticated`. A tela
// pergunta, o banco decide, e a recusa aparece como veio.
//
// O CONTRATO É LIDO POR `ler_contratos_do_cliente`, que não devolve nada
// clínico: a recepção, que não tem alcance clínico, é quem mais usa esta
// parte da tela.

export type SituacaoContrato = {
  valor_total: number;
  valor_pago: number;
  saldo_devedor: number;
  unidades_previstas: number;
  unidades_executadas: number;
  falta_pagamento: boolean;
  falta_execucao: boolean;
  pode_encerrar: boolean;
};

export type ItemContrato = {
  id: string;
  tipo: "plano" | "pacote" | "procedimento";
  nome: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  degrau: string | null;
  pacote_cliente_id: string | null;
  executadas: number | null;
};

export type AssinaturaContrato = {
  parte: "profissional" | "paciente";
  via: "aprovacao_orcamento" | "presencial" | "link";
  assinada_em: string;
  hash_assinado: string;
  registrada_por_nome: string | null;
};

export type Contrato = {
  id: string;
  status: "rascunho" | "assinado" | "ativo" | "encerrado" | "cancelado";
  orcamento_id: string | null;
  plano_id: string | null;
  opcao_rotulo: string | null;
  profissional_id: string | null;
  profissional_nome: string | null;
  /** O banco responde se quem olha é o profissional do contrato — a tela não recalcula. */
  sou_o_profissional: boolean;
  valor_bruto: number;
  desconto_valor: number;
  valor: number;
  parcelas: number;
  taxa_juros: number;
  taxa_multa_atraso: number;
  documento_hash: string | null;
  documento_emitido_em: string | null;
  assinado_em: string | null;
  encerrado_em: string | null;
  criado_em: string;
  itens: ItemContrato[];
  assinaturas: AssinaturaContrato[];
  situacao: SituacaoContrato | null;
};

export function useContratosDoCliente(clienteId: string | null) {
  return useQuery({
    queryKey: ["contratos", clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<Contrato[]> => {
      const { data, error } = await finance().rpc("ler_contratos_do_cliente", { p_cliente_id: clienteId });
      if (error) throw error;
      return (data ?? []) as Contrato[];
    },
  });
}

/** O documento canônico guardado — o texto que foi assinado, não um novo desenho dele. */
export function useDocumentoDoContrato(contratoId: string | null) {
  return useQuery({
    queryKey: ["contrato-documento", contratoId],
    enabled: !!contratoId,
    queryFn: async (): Promise<{ html: string | null; hash: string | null }> => {
      const { data, error } = await finance()
        .from("contratos")
        .select("documento_html, documento_hash")
        .eq("id", contratoId)
        .single();
      if (error) throw error;
      return { html: (data.documento_html as string) ?? null, hash: (data.documento_hash as string) ?? null };
    },
  });
}

/** Recarrega tudo o que o contrato move: ele mesmo, o documento, o orçamento e a matriz. */
function useRecarregarContrato(clienteId: string | null) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["contratos", clienteId] });
    void qc.invalidateQueries({ queryKey: ["contrato-documento"] });
    void qc.invalidateQueries({ queryKey: ["treatment-orcamentos"] });
    void qc.invalidateQueries({ queryKey: ["treatment-planos", clienteId] });
    void qc.invalidateQueries({ queryKey: ["treatment-execucao-liberada"] });
    void qc.invalidateQueries({ queryKey: ["health-log", clienteId] });
  };
}

function useOperacaoDoContrato<T>(clienteId: string | null, executar: (arg: T) => Promise<unknown>) {
  const recarregar = useRecarregarContrato(clienteId);
  return useMutation({ mutationFn: executar, onSuccess: recarregar });
}

export function useContratarOpcao(clienteId: string | null) {
  return useOperacaoDoContrato(clienteId, async (orcamentoId: string) => {
    const { data, error } = await finance().rpc("contratar_opcao", { p_orcamento_id: orcamentoId });
    if (error) throw error;
    return data as unknown as string;
  });
}

export function useEmitirDocumento(clienteId: string | null) {
  return useOperacaoDoContrato(clienteId, async (contratoId: string) => {
    const { data, error } = await finance().rpc("emitir_documento_contrato", { p_contrato_id: contratoId });
    if (error) throw error;
    return data as unknown as string;
  });
}

export function useAssinarComoProfissional(clienteId: string | null) {
  return useOperacaoDoContrato(clienteId, async ({ contratoId, hash }: { contratoId: string; hash: string }) => {
    const { error } = await finance().rpc("assinar_contrato_como_profissional", { p_contrato_id: contratoId, p_hash: hash });
    if (error) throw error;
  });
}

export function useRegistrarAssinaturaPaciente(clienteId: string | null) {
  return useOperacaoDoContrato(clienteId, async ({ contratoId, hash }: { contratoId: string; hash: string }) => {
    const { error } = await finance().rpc("registrar_assinatura_paciente", { p_contrato_id: contratoId, p_hash: hash });
    if (error) throw error;
  });
}

export function useEncerrarContrato(clienteId: string | null) {
  return useOperacaoDoContrato(clienteId, async (contratoId: string) => {
    const { error } = await finance().rpc("encerrar_contrato", { p_contrato_id: contratoId });
    if (error) throw error;
  });
}

export function useRegistrarExecucaoItem(clienteId: string | null) {
  return useOperacaoDoContrato(clienteId, async (itemId: string) => {
    const { error } = await finance().rpc("registrar_execucao_item", { p_item_id: itemId });
    if (error) throw error;
  });
}

/** Quais células do plano podem ser executadas, e por quê (`contrato` ou `dispensa`). */
export function useExecucaoLiberada(planoId: string | null) {
  return useQuery({
    queryKey: ["treatment-execucao-liberada", planoId],
    enabled: !!planoId,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await finance().rpc("execucao_liberada_no_plano", { p_plano_id: planoId });
      if (error) throw error;
      return new Map((data ?? []).map((r: { celula_id: string; liberada_por: string }) => [r.celula_id, r.liberada_por]));
    },
  });
}

/**
 * MARCAR A FACE EXECUTADA (passo 36). A data e o autor são gravados pelo
 * BANCO — o navegador manda só qual face. Sem `.select()`: `face` é coluna
 * revogada, e pedir de volta daria `42501` com cara de RLS.
 */
export function useMarcarFaceExecutada(planoId: string | null, clienteId: string | null) {
  const { profile } = useAuth();
  const recarregar = useRecarregarContrato(clienteId);
  return useMutation({
    mutationFn: async ({ celulaId, face }: { celulaId: string; face: string | null }) => {
      const { error } = await treatment().from("execucoes_face").insert({
        account_id: profile!.accountId,
        plano_id: planoId,
        procedimento_plano_id: celulaId,
        face,
      });
      if (error) throw error;
    },
    onSuccess: recarregar,
  });
}
