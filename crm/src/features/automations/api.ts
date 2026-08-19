/**
 * Acesso a dados do módulo `aba_automations` (Subetapa 02.10).
 *
 * DUAS FRONTEIRAS QUE ESTE ARQUIVO RESPEITA
 *
 * 1. **O motor não mora aqui.** Executar automação, drenar a fila de
 *    espera, iniciar e avançar fluxo são funções do banco
 *    (`aba_automations.executar_automacao()`, `drenar_execucoes_pendentes()`,
 *    `iniciar_fluxo()`, `avancar_fluxo()`, migration 026). O client só as
 *    chama. Motor no navegador significa motor que só roda com alguém
 *    olhando a tela — e o `pg_cron` existe justamente para não depender
 *    disso (`docs/01_ARQUITETURA.md` §2).
 *
 * 2. **`automacao_logs`, `automacao_execucoes_pendentes`, `fluxo_execucoes`
 *    e `fluxo_execucao_eventos` são só de leitura para o usuário final.**
 *    Nenhuma policy de escrita existe para `authenticated` nessas tabelas
 *    (hardening da Subetapa 01.5): o log de auditoria do motor não é
 *    editável por quem ele audita. Por isso não há mutação nenhuma contra
 *    elas neste arquivo — e se alguém acrescentar, o banco recusa.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

function db() {
  return supabase.schema("aba_automations");
}

// ============================================================
// Vocabulário de etapa — o que o motor da 026 sabe executar
// ============================================================

/**
 * `automacao_etapas.tipo_etapa` é TEXT livre no banco (a migration 017 não
 * fixou CHECK, para não travar o vocabulário antes de existir motor). O
 * catálogo fechado vive aqui, espelhando exatamente o `CASE` de
 * `aba_automations.executar_etapas()` — tipo fora desta lista é gravado,
 * mas o motor o registra como `desconhecido` no log em vez de fingir que
 * executou.
 *
 * `familia` decide a cor da borda esquerda do card no editor, conforme
 * `docs/04_DESIGN_E_MARCA.md` §5.5: Gatilho azul / Condição sage / Ação tan.
 */
export type FamiliaEtapa = "gatilho" | "condicao" | "acao";

export type TipoEtapaDef = {
  chave: string;
  rotulo: string;
  familia: FamiliaEtapa;
  descricao: string;
  /** Falso quando o motor registra a etapa mas não a executa (dependência externa). */
  executaDeVerdade: boolean;
};

export const TIPOS_ETAPA: TipoEtapaDef[] = [
  {
    chave: "condicao",
    rotulo: "Condição",
    familia: "condicao",
    descricao: "Compara um campo do contexto e segue pelo ramo sim ou não",
    executaDeVerdade: true,
  },
  {
    chave: "definir_tag",
    rotulo: "Aplicar tag",
    familia: "acao",
    descricao: "Cria a tag na conta, se preciso, e anexa à pessoa da execução",
    executaDeVerdade: true,
  },
  {
    chave: "notificar_equipe",
    rotulo: "Notificar equipe",
    familia: "acao",
    descricao: "Gera notificação para todos os membros da conta",
    executaDeVerdade: true,
  },
  {
    chave: "esperar",
    rotulo: "Esperar",
    familia: "acao",
    descricao: "Pausa a execução e deixa a retomada na fila do agendador",
    executaDeVerdade: true,
  },
  {
    chave: "enviar_whatsapp",
    rotulo: "Enviar WhatsApp",
    familia: "acao",
    descricao: "Registrado no log, ainda não enviado — depende do canal da conta (Subetapa 02.5)",
    executaDeVerdade: false,
  },
];

export const CORES_FAMILIA: Record<FamiliaEtapa, string> = {
  gatilho: "#5b87a8",
  condicao: "#8fb4a6",
  acao: "#c8b79a",
};

export function definicaoEtapa(tipo: string): TipoEtapaDef | undefined {
  return TIPOS_ETAPA.find((t) => t.chave === tipo);
}

/** Gatilhos que a UI oferece ao criar automação. */
export const TIPOS_GATILHO: { chave: string; rotulo: string; detalhe: string }[] = [
  { chave: "manual", rotulo: "Manual", detalhe: "Disparada por quem opera, pelo botão Testar" },
  { chave: "pessoa_criada", rotulo: "Pessoa criada", detalhe: "aba_people.pessoas · nova pessoa na conta" },
  { chave: "atendimento_concluido", rotulo: "Atendimento concluído", detalhe: "aba_scheduling.agendamentos · status concluído" },
  { chave: "fatura_vencida", rotulo: "Fatura vencida", detalhe: "aba_finance.faturas · vencimento ultrapassado" },
];

// ============================================================
// Automações
// ============================================================

export type Automacao = {
  id: string;
  nome: string;
  descricao: string | null;
  tipoGatilho: string;
  configGatilho: Record<string, unknown>;
  ativo: boolean;
  contadorExecucoes: number;
  executadoEm: string | null;
};

export function useAutomacoes() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["automacoes", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Automacao[]> => {
      const { data, error } = await db()
        .from("automacoes")
        .select("id, nome, descricao, tipo_gatilho, config_gatilho, ativo, contador_execucoes, executado_pela_ultima_vez_em")
        .eq("account_id", accountId!)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((a) => ({
        id: a.id as string,
        nome: a.nome as string,
        descricao: (a.descricao as string) ?? null,
        tipoGatilho: a.tipo_gatilho as string,
        configGatilho: (a.config_gatilho ?? {}) as Record<string, unknown>,
        ativo: a.ativo === true,
        contadorExecucoes: (a.contador_execucoes as number) ?? 0,
        executadoEm: (a.executado_pela_ultima_vez_em as string) ?? null,
      }));
    },
  });
}

export function useCriarAutomacao() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nome: string; tipoGatilho: string; descricao?: string }) => {
      const { data, error } = await db()
        .from("automacoes")
        .insert({
          account_id: profile!.accountId,
          nome: input.nome,
          descricao: input.descricao ?? null,
          tipo_gatilho: input.tipoGatilho,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data!.id as string;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["automacoes"] }),
  });
}

export function useAlternarAutomacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ativo: boolean }) => {
      const { error } = await db().from("automacoes").update({ ativo: input.ativo }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["automacoes"] }),
  });
}

export function useApagarAutomacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from("automacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["automacoes"] });
      void qc.invalidateQueries({ queryKey: ["automacao-etapas"] });
    },
  });
}

// ============================================================
// Etapas
// ============================================================

export type Etapa = {
  id: string;
  automacaoId: string;
  etapaPaiId: string | null;
  ramo: "sim" | "nao" | null;
  tipoEtapa: string;
  configEtapa: Record<string, string>;
  posicao: number;
};

export function useEtapas(automacaoId: string | null) {
  return useQuery({
    queryKey: ["automacao-etapas", automacaoId],
    enabled: !!automacaoId,
    queryFn: async (): Promise<Etapa[]> => {
      const { data, error } = await db()
        .from("automacao_etapas")
        .select("id, automacao_id, etapa_pai_id, ramo, tipo_etapa, config_etapa, posicao")
        .eq("automacao_id", automacaoId!)
        .order("posicao");
      if (error) throw error;
      return (data ?? []).map((e) => ({
        id: e.id as string,
        automacaoId: e.automacao_id as string,
        etapaPaiId: (e.etapa_pai_id as string) ?? null,
        ramo: (e.ramo as "sim" | "nao") ?? null,
        tipoEtapa: e.tipo_etapa as string,
        configEtapa: (e.config_etapa ?? {}) as Record<string, string>,
        posicao: e.posicao as number,
      }));
    },
  });
}

export function useAdicionarEtapa(automacaoId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tipoEtapa: string;
      configEtapa: Record<string, string>;
      etapaPaiId?: string | null;
      ramo?: "sim" | "nao" | null;
      posicao: number;
    }) => {
      const { error } = await db().from("automacao_etapas").insert({
        automacao_id: automacaoId,
        tipo_etapa: input.tipoEtapa,
        config_etapa: input.configEtapa,
        etapa_pai_id: input.etapaPaiId ?? null,
        ramo: input.ramo ?? null,
        posicao: input.posicao,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["automacao-etapas", automacaoId] }),
  });
}

export function useRemoverEtapa(automacaoId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from("automacao_etapas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["automacao-etapas", automacaoId] }),
  });
}

/**
 * "Testar" do wireframe `1k`. Chama o motor no banco — a execução inteira
 * acontece do lado de lá, inclusive o que ela grava no log.
 */
export function useExecutarAutomacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { automacaoId: string; pessoaId?: string | null; contexto?: Record<string, string> }) => {
      const { data, error } = await db().rpc("executar_automacao", {
        p_automacao_id: input.automacaoId,
        p_pessoa_id: input.pessoaId ?? null,
        p_evento_gatilho: "manual",
        p_contexto: input.contexto ?? {},
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["automacoes"] });
      void qc.invalidateQueries({ queryKey: ["automacao-logs"] });
      void qc.invalidateQueries({ queryKey: ["execucoes-pendentes"] });
    },
  });
}

// ============================================================
// Log de execução (somente leitura — ver cabeçalho)
// ============================================================

export type LogAutomacao = {
  id: string;
  automacaoId: string;
  eventoGatilho: string;
  status: "sucesso" | "parcial" | "falhou";
  mensagemErro: string | null;
  etapasExecutadas: { tipo_etapa: string; resultado: string; detalhe: Record<string, unknown> }[];
  criadoEm: string;
};

export function useLogsAutomacao(automacaoId: string | null) {
  return useQuery({
    queryKey: ["automacao-logs", automacaoId],
    enabled: !!automacaoId,
    queryFn: async (): Promise<LogAutomacao[]> => {
      const { data, error } = await db()
        .from("automacao_logs")
        .select("id, automacao_id, evento_gatilho, status, mensagem_erro, etapas_executadas, criado_em")
        .eq("automacao_id", automacaoId!)
        .order("criado_em", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((l) => ({
        id: l.id as string,
        automacaoId: l.automacao_id as string,
        eventoGatilho: l.evento_gatilho as string,
        status: l.status as LogAutomacao["status"],
        mensagemErro: (l.mensagem_erro as string) ?? null,
        etapasExecutadas: Array.isArray(l.etapas_executadas)
          ? (l.etapas_executadas as LogAutomacao["etapasExecutadas"])
          : [],
        criadoEm: l.criado_em as string,
      }));
    },
  });
}

// ============================================================
// Fluxos conversacionais
// ============================================================

export type Fluxo = {
  id: string;
  nome: string;
  status: "rascunho" | "ativo" | "arquivado";
  tipoGatilho: string;
  noEntradaId: string | null;
  contadorExecucoes: number;
};

export type NoFluxo = {
  id: string;
  chaveNo: string;
  tipoNo: string;
  config: Record<string, unknown>;
};

export function useFluxos() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["fluxos", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Fluxo[]> => {
      const { data, error } = await db()
        .from("fluxos")
        .select("id, nome, status, tipo_gatilho, no_entrada_id, contador_execucoes")
        .eq("account_id", accountId!)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((f) => ({
        id: f.id as string,
        nome: f.nome as string,
        status: f.status as Fluxo["status"],
        tipoGatilho: f.tipo_gatilho as string,
        noEntradaId: (f.no_entrada_id as string) ?? null,
        contadorExecucoes: (f.contador_execucoes as number) ?? 0,
      }));
    },
  });
}

export function useNosFluxo(fluxoId: string | null) {
  return useQuery({
    queryKey: ["fluxo-nos", fluxoId],
    enabled: !!fluxoId,
    queryFn: async (): Promise<NoFluxo[]> => {
      const { data, error } = await db()
        .from("fluxo_nos")
        .select("id, chave_no, tipo_no, config")
        .eq("fluxo_id", fluxoId!)
        .order("criado_em");
      if (error) throw error;
      return (data ?? []).map((n) => ({
        id: n.id as string,
        chaveNo: n.chave_no as string,
        tipoNo: n.tipo_no as string,
        config: (n.config ?? {}) as Record<string, unknown>,
      }));
    },
  });
}

/**
 * Cria um fluxo de exemplo completo e coerente: início → mensagem → fim,
 * já com `no_entrada_id` apontado e status `ativo`. Existe porque um fluxo
 * conversacional só dispara com nó de entrada definido e arestas ligadas —
 * montar isso a mão, campo a campo, é editor de canvas, que é escopo
 * declarado como reservado na própria migration 017 (`posicao_x`/`posicao_y`
 * "reservado para o editor visual").
 */
export function useCriarFluxoExemplo() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nome: string) => {
      const { data: fluxo, error } = await db()
        .from("fluxos")
        .insert({
          account_id: profile!.accountId,
          nome,
          tipo_gatilho: "manual",
          status: "rascunho",
        })
        .select("id")
        .single();
      if (error) throw error;
      const fluxoId = fluxo!.id as string;

      const { error: nosErr } = await db()
        .from("fluxo_nos")
        .insert([
          { fluxo_id: fluxoId, chave_no: "inicio", tipo_no: "inicio", config: { proximo: "saudacao" } },
          {
            fluxo_id: fluxoId,
            chave_no: "saudacao",
            tipo_no: "enviar_mensagem",
            config: { texto: "Olá! Como podemos ajudar?", proximo: "encerrar" },
          },
          { fluxo_id: fluxoId, chave_no: "encerrar", tipo_no: "fim", config: {} },
        ]);
      if (nosErr) throw nosErr;

      // Nó de entrada e ativação só depois dos nós existirem — ativar um
      // fluxo que aponta para nó inexistente é o jeito de descobrir isso
      // com uma execução travada em produção.
      const { error: ativarErr } = await db()
        .from("fluxos")
        .update({ no_entrada_id: "inicio", status: "ativo" })
        .eq("id", fluxoId);
      if (ativarErr) throw ativarErr;

      return fluxoId;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["fluxos"] });
      void qc.invalidateQueries({ queryKey: ["fluxo-nos"] });
    },
  });
}

export function useAlternarStatusFluxo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: Fluxo["status"] }) => {
      const { error } = await db().from("fluxos").update({ status: input.status }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["fluxos"] }),
  });
}

export function useApagarFluxo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from("fluxos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["fluxos"] });
      void qc.invalidateQueries({ queryKey: ["fluxo-execucoes"] });
    },
  });
}

// ============================================================
// Execuções de fluxo (leitura) + disparo (RPC do motor)
// ============================================================

export type ExecucaoFluxo = {
  id: string;
  fluxoId: string;
  status: string;
  noAtualChave: string | null;
  iniciadoEm: string;
  finalizadoEm: string | null;
  motivoFim: string | null;
};

export type EventoExecucao = {
  id: string;
  tipoEvento: string;
  noChave: string | null;
  payload: Record<string, unknown>;
  criadoEm: string;
};

export function useExecucoesFluxo(fluxoId: string | null) {
  return useQuery({
    queryKey: ["fluxo-execucoes", fluxoId],
    enabled: !!fluxoId,
    queryFn: async (): Promise<ExecucaoFluxo[]> => {
      const { data, error } = await db()
        .from("fluxo_execucoes")
        .select("id, fluxo_id, status, no_atual_chave, iniciado_em, finalizado_em, motivo_fim")
        .eq("fluxo_id", fluxoId!)
        .order("iniciado_em", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((e) => ({
        id: e.id as string,
        fluxoId: e.fluxo_id as string,
        status: e.status as string,
        noAtualChave: (e.no_atual_chave as string) ?? null,
        iniciadoEm: e.iniciado_em as string,
        finalizadoEm: (e.finalizado_em as string) ?? null,
        motivoFim: (e.motivo_fim as string) ?? null,
      }));
    },
  });
}

export function useEventosExecucao(execucaoId: string | null) {
  return useQuery({
    queryKey: ["fluxo-eventos", execucaoId],
    enabled: !!execucaoId,
    queryFn: async (): Promise<EventoExecucao[]> => {
      const { data, error } = await db()
        .from("fluxo_execucao_eventos")
        .select("id, tipo_evento, no_chave, payload, criado_em")
        .eq("fluxo_execucao_id", execucaoId!)
        .order("criado_em");
      if (error) throw error;
      return (data ?? []).map((e) => ({
        id: e.id as string,
        tipoEvento: e.tipo_evento as string,
        noChave: (e.no_chave as string) ?? null,
        payload: (e.payload ?? {}) as Record<string, unknown>,
        criadoEm: e.criado_em as string,
      }));
    },
  });
}

export function useIniciarFluxo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { fluxoId: string; pessoaId?: string | null }) => {
      const { data, error } = await db().rpc("iniciar_fluxo", {
        p_fluxo_id: input.fluxoId,
        p_pessoa_id: input.pessoaId ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["fluxo-execucoes"] });
      void qc.invalidateQueries({ queryKey: ["fluxos"] });
    },
  });
}

export function useAvancarFluxo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { execucaoId: string; resposta?: string | null }) => {
      const { data, error } = await db().rpc("avancar_fluxo", {
        p_execucao_id: input.execucaoId,
        p_resposta: input.resposta ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["fluxo-execucoes"] });
      void qc.invalidateQueries({ queryKey: ["fluxo-eventos"] });
    },
  });
}

// ============================================================
// Observabilidade do agendador — `cron.job` e `cron.job_run_details`
// ============================================================

export type JobCron = {
  jobid: number;
  jobname: string;
  schedule: string;
  command: string;
  active: boolean;
  ultimaExecucao: string | null;
  ultimoStatus: string | null;
};

/**
 * O schema `cron` não é exposto ao PostgREST (e não deve ser — expô-lo
 * daria ao navegador uma superfície de agendamento). A leitura passa por
 * uma função no schema do módulo, criada pela migration 027, que devolve
 * só o que a tela precisa mostrar e exige `admin+`.
 */
export function useJobsCron() {
  return useQuery({
    queryKey: ["cron-jobs"],
    queryFn: async (): Promise<JobCron[]> => {
      const { data, error } = await db().rpc("listar_jobs_agendados");
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((j) => ({
        jobid: j.jobid as number,
        jobname: j.jobname as string,
        schedule: j.schedule as string,
        command: j.command as string,
        active: j.active === true,
        ultimaExecucao: (j.ultima_execucao as string) ?? null,
        ultimoStatus: (j.ultimo_status as string) ?? null,
      }));
    },
  });
}

/** Fila do passo de espera — leitura, para a tela mostrar o que está represado. */
export function useExecucoesPendentes() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["execucoes-pendentes", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<{ id: string; status: string; executarEm: string }[]> => {
      const { data, error } = await db().rpc("listar_execucoes_pendentes");
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((p) => ({
        id: p.id as string,
        status: p.status as string,
        executarEm: p.executar_em as string,
      }));
    },
  });
}
