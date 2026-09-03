import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { BadgeTone } from "@/components/ui/badge";

function db() {
  return supabase.schema("aba_scheduling");
}

// ============================================================
// Profissionais
// ============================================================
export type Profissional = {
  id: string;
  nomeExibicao: string;
  cor: string;
  profileId: string | null;
  acessoClinico: boolean;
};

export function useProfissionais() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["profissionais", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Profissional[]> => {
      const { data, error } = await db()
        .from("profissionais")
        .select("id, nome_exibicao, cor, profile_id, acesso_clinico")
        .eq("account_id", accountId!)
        .eq("ativo", true)
        .order("nome_exibicao");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id,
        nomeExibicao: p.nome_exibicao,
        cor: p.cor,
        profileId: p.profile_id,
        acessoClinico: p.acesso_clinico,
      }));
    },
  });
}

/** Perfil profissional do usuário logado, se houver — chave da tela `1n` (docs/01_ARQUITETURA.md §7.3). */
export function useMeuProfissional() {
  const { profile } = useAuth();
  const { data: profissionais, isLoading } = useProfissionais();
  const meu = profissionais?.find((p) => p.profileId === profile?.id) ?? null;
  return { data: meu, isLoading };
}

// ============================================================
// Jornada (horarios_profissionais) — a verificação de expediente do
// banco (verificar_expediente_agendamento) falha fechada sem nenhuma
// linha cadastrada: todo agendamento seria recusado com 23514. Este
// hook cria a jornada padrão seg–sáb 09:00–18:00 quando o profissional
// ainda não tem nenhuma, mesmo espírito do "estado vazio explícito" já
// usado em useCriarFunilPadrao (Subetapa 02.4).
// ============================================================
export type HorarioProfissional = { id: string; diaSemana: number; inicio: string; fim: string };

export function useHorariosProfissional(profissionalId: string | undefined) {
  return useQuery({
    queryKey: ["horarios-profissional", profissionalId],
    enabled: !!profissionalId,
    queryFn: async (): Promise<HorarioProfissional[]> => {
      const { data, error } = await db()
        .from("horarios_profissionais")
        .select("id, dia_semana, inicio, fim")
        .eq("profissional_id", profissionalId!)
        .eq("ativo", true)
        .order("dia_semana");
      if (error) throw error;
      return (data ?? []).map((h) => ({ id: h.id, diaSemana: h.dia_semana, inicio: h.inicio, fim: h.fim }));
    },
  });
}

/** Profissionais ativos sem NENHUMA linha de jornada — todo agendamento deles seria recusado (23514) até alguém configurar. */
export function useProfissionaisSemJornada() {
  const { profile } = useAuth();
  const { data: profissionais } = useProfissionais();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["profissionais-sem-jornada", accountId, profissionais?.map((p) => p.id).join(",")],
    enabled: !!accountId && !!profissionais,
    queryFn: async (): Promise<Profissional[]> => {
      if (!profissionais || profissionais.length === 0) return [];
      const { data, error } = await db()
        .from("horarios_profissionais")
        .select("profissional_id")
        .in("profissional_id", profissionais.map((p) => p.id))
        .eq("ativo", true);
      if (error) throw error;
      const comJornada = new Set((data ?? []).map((h) => h.profissional_id));
      return profissionais.filter((p) => !comJornada.has(p.id));
    },
  });
}

export function useDefinirExpedientePadrao() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profissionalId: string) => {
      const linhas = [1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        account_id: profile!.accountId,
        profissional_id: profissionalId,
        dia_semana: diaSemana,
        inicio: "09:00",
        fim: "18:00",
      }));
      const { error } = await db().from("horarios_profissionais").insert(linhas);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["horarios-profissional"] });
      void qc.invalidateQueries({ queryKey: ["profissionais-sem-jornada"] });
    },
  });
}

// ============================================================
// Recursos (salas/cadeiras/equipamentos) — item 11 da Subetapa 03.4.
// `recursos` + `horarios_recursos` já existiam desde a migration 009
// sem nenhuma tela; o CRUD abaixo é só de front, nada novo no banco.
// ============================================================
export type Recurso = { id: string; nome: string; tipo: "sala" | "equipamento"; cor: string; ativo: boolean };

export function useRecursos(somenteAtivos = true) {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["recursos-agenda", accountId, somenteAtivos],
    enabled: !!accountId,
    queryFn: async (): Promise<Recurso[]> => {
      let query = db().from("recursos").select("id, nome, tipo, cor, ativo").eq("account_id", accountId!).order("nome");
      if (somenteAtivos) query = query.eq("ativo", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((r) => ({ id: r.id, nome: r.nome, tipo: r.tipo, cor: r.cor, ativo: r.ativo }));
    },
  });
}

export function useCriarRecurso() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nome: string; tipo: "sala" | "equipamento"; cor: string }) => {
      const { error } = await db().from("recursos").insert({
        account_id: profile!.accountId,
        nome: input.nome,
        tipo: input.tipo,
        cor: input.cor,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["recursos-agenda"] }),
  });
}

export function useAtualizarRecurso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ativo: boolean }) => {
      const { error } = await db().from("recursos").update({ ativo: input.ativo }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["recursos-agenda"] }),
  });
}

/**
 * Horário de funcionamento do recurso — mesmo padrão de
 * `useHorariosProfissional`. Sem jornada cadastrada o recurso é tratado
 * como sempre disponível (`verificar_expediente_agendamento`, 009), então
 * a ocupação abaixo só entra no cálculo quem tem jornada — denominador
 * zero não vira "0% ocupado" (mentira), vira "sem grade".
 */
export type HorarioRecurso = { id: string; diaSemana: number; inicio: string; fim: string };

export function useHorariosRecurso(recursoId: string | undefined) {
  return useQuery({
    queryKey: ["horarios-recurso", recursoId],
    enabled: !!recursoId,
    queryFn: async (): Promise<HorarioRecurso[]> => {
      const { data, error } = await db()
        .from("horarios_recursos")
        .select("id, dia_semana, inicio, fim")
        .eq("recurso_id", recursoId!)
        .eq("ativo", true)
        .order("dia_semana");
      if (error) throw error;
      return (data ?? []).map((h) => ({ id: h.id, diaSemana: h.dia_semana, inicio: h.inicio, fim: h.fim }));
    },
  });
}

/** Jornada de TODOS os recursos ativos de uma vez — base do cálculo de ocupação abaixo, mesmo espírito de `useProfissionaisSemJornada`. */
export function useHorariosTodosRecursos() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["horarios-todos-recursos", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<{ recursoId: string; diaSemana: number; inicio: string; fim: string }[]> => {
      const { data, error } = await db()
        .from("horarios_recursos")
        .select("recurso_id, dia_semana, inicio, fim")
        .eq("account_id", accountId!)
        .eq("ativo", true);
      if (error) throw error;
      return (data ?? []).map((h) => ({ recursoId: h.recurso_id, diaSemana: h.dia_semana, inicio: h.inicio, fim: h.fim }));
    },
  });
}

function minutosDoHorario(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export type OcupacaoRecurso = { recursoId: string; nome: string; cor: string; percentual: number | null };

/**
 * Ocupação por recurso num intervalo (semana da tela `1e`). Recurso sem
 * jornada cadastrada devolve `percentual: null` — "sem grade", nunca
 * 0%, porque 0% de um denominador zero é número inventado (mesmo
 * cuidado do cálculo de profissional em `features/dashboard/api.ts`).
 * Função pura, sem rede: opera sobre dado que a página já carregou.
 */
export function calcularOcupacaoRecursos(
  recursos: Recurso[],
  horarios: { recursoId: string; diaSemana: number; inicio: string; fim: string }[],
  agendamentos: Agendamento[],
  inicioIntervalo: Date,
  fimIntervalo: Date,
): OcupacaoRecurso[] {
  return recursos.map((r) => {
    const grade = horarios.filter((h) => h.recursoId === r.id);
    if (grade.length === 0) return { recursoId: r.id, nome: r.nome, cor: r.cor, percentual: null };

    let disponivel = 0;
    for (let d = new Date(inicioIntervalo); d < fimIntervalo; d.setDate(d.getDate() + 1)) {
      const diaSemana = d.getDay();
      for (const h of grade.filter((g) => g.diaSemana === diaSemana)) {
        disponivel += minutosDoHorario(h.fim) - minutosDoHorario(h.inicio);
      }
    }
    if (disponivel === 0) return { recursoId: r.id, nome: r.nome, cor: r.cor, percentual: null };

    const ocupado = agendamentos
      .filter((a) => a.recursoId === r.id && a.status !== "cancelado" && a.status !== "nao_compareceu")
      .reduce((acc, a) => acc + (new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 60000, 0);

    return { recursoId: r.id, nome: r.nome, cor: r.cor, percentual: Math.min(100, (ocupado / disponivel) * 100) };
  });
}

export function useDefinirExpedientePadraoRecurso() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recursoId: string) => {
      const linhas = [1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        account_id: profile!.accountId,
        recurso_id: recursoId,
        dia_semana: diaSemana,
        inicio: "09:00",
        fim: "18:00",
      }));
      const { error } = await db().from("horarios_recursos").insert(linhas);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["horarios-recurso"] });
    },
  });
}

// ============================================================
// Marcadores (rótulo colorido no agendamento) — item 9 da Subetapa 03.4.
// Tabela nova (`aba_scheduling.marcadores`), distinta da cor de
// profissional/recurso: é rótulo livre definido pela clínica ("Convênio
// X", "Primeira consulta"), não um enum fixo — migration
// `040_agenda_sala_de_espera_marcadores.sql`.
// ============================================================
export type Marcador = { id: string; nome: string; cor: string; ativo: boolean };

export function useMarcadores(somenteAtivos = true) {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["marcadores", accountId, somenteAtivos],
    enabled: !!accountId,
    queryFn: async (): Promise<Marcador[]> => {
      let query = db().from("marcadores").select("id, nome, cor, ativo").eq("account_id", accountId!).order("nome");
      if (somenteAtivos) query = query.eq("ativo", true);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCriarMarcador() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nome: string; cor: string }) => {
      const { error } = await db().from("marcadores").insert({ account_id: profile!.accountId, nome: input.nome, cor: input.cor });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["marcadores"] }),
  });
}

export function useAtualizarMarcador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ativo: boolean }) => {
      const { error } = await db().from("marcadores").update({ ativo: input.ativo }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["marcadores"] }),
  });
}

// ============================================================
// Serviços (aba_catalog) — para preencher duração/preço padrão do
// atendimento. Leitura só; CRUD de catálogo é a Subetapa 02.7.
// ============================================================
export type Servico = { id: string; nome: string; duracaoPadraoMinutos: number; precoBase: number };

export function useServicos() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["servicos-agenda", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Servico[]> => {
      const { data, error } = await supabase
        .schema("aba_catalog")
        .from("servicos")
        .select("id, nome, duracao_padrao_minutos, preco_base")
        .eq("account_id", accountId!)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((s) => ({
        id: s.id,
        nome: s.nome,
        duracaoPadraoMinutos: s.duracao_padrao_minutos,
        precoBase: Number(s.preco_base),
      }));
    },
  });
}

// ============================================================
// Clientes para seleção — agendamentos.cliente_id referencia
// aba_people.clientes (nunca "pessoa" em geral, ao contrário de
// aba_sales.oportunidades.pessoa_id). Duas queries independentes,
// mesmo padrão de features/sales/api.ts e features/settings/useEquipe.ts.
// ============================================================
export type ClienteSelecao = { id: string; nomeExibicao: string };

export function useClientesParaSelecao() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["clientes-selecao", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<ClienteSelecao[]> => {
      const { data: clientes, error } = await supabase
        .schema("aba_people")
        .from("clientes")
        .select("id")
        .eq("account_id", accountId!)
        .eq("status", "ativo");
      if (error) throw error;

      const ids = (clientes ?? []).map((c) => c.id);
      if (ids.length === 0) return [];

      const { data: pessoas, error: e2 } = await supabase.schema("aba_people").from("pessoas").select("id, nome_exibicao").in("id", ids);
      if (e2) throw e2;

      return (pessoas ?? [])
        .map((p) => ({ id: p.id, nomeExibicao: p.nome_exibicao }))
        .sort((a, b) => a.nomeExibicao.localeCompare(b.nomeExibicao));
    },
  });
}

// ============================================================
// Planos vendidos ativos do cliente — para consumir sessão de um plano
// (aba_finance) ao criar o agendamento. Leitura só; a venda em si é
// escopo da Subetapa 02.8.
// ============================================================
export type PlanoClienteAtivo = { id: string; planoNome: string };

export function usePlanosClienteAtivos(clienteId: string | undefined) {
  return useQuery({
    queryKey: ["planos-cliente-ativos", clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<PlanoClienteAtivo[]> => {
      const { data: planosCliente, error } = await supabase
        .schema("aba_finance")
        .from("planos_cliente")
        .select("id, plano_id")
        .eq("cliente_id", clienteId!)
        .eq("status", "ativo");
      if (error) throw error;
      const lista = planosCliente ?? [];
      if (lista.length === 0) return [];

      const planoIds = Array.from(new Set(lista.map((p) => p.plano_id)));
      const { data: planos, error: e2 } = await supabase.schema("aba_catalog").from("planos").select("id, nome").in("id", planoIds);
      if (e2) throw e2;
      const nomes = Object.fromEntries((planos ?? []).map((p) => [p.id, p.nome]));

      return lista.map((p) => ({ id: p.id, planoNome: nomes[p.plano_id] ?? "Plano" }));
    },
  });
}

// ============================================================
// Agendamentos
// ============================================================
// `sala_de_espera` — Subetapa 03.4, item 4. Fica ENTRE `confirmado` e
// `em_andamento`: marca chegada física do cliente, registrada pelo
// Check-in do Balcão. Migration `040_agenda_sala_de_espera_marcadores.sql`.
export type StatusAgendamento =
  | "agendado"
  | "confirmado"
  | "sala_de_espera"
  | "em_andamento"
  | "concluido"
  | "nao_compareceu"
  | "cancelado";

export const STATUS_LABEL: Record<StatusAgendamento, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  sala_de_espera: "Sala de espera",
  em_andamento: "Em atendimento",
  concluido: "Concluído",
  nao_compareceu: "Não compareceu",
  cancelado: "Cancelado",
};

export const STATUS_TONE: Record<StatusAgendamento, BadgeTone> = {
  agendado: "neutral",
  confirmado: "success",
  sala_de_espera: "warning",
  em_andamento: "warning",
  concluido: "success",
  nao_compareceu: "danger",
  cancelado: "danger",
};

export type Agendamento = {
  id: string;
  clienteId: string;
  clienteNome: string;
  profissionalId: string;
  profissionalNome: string;
  profissionalCor: string;
  recursoId: string | null;
  recursoNome: string | null;
  marcadorId: string | null;
  marcadorNome: string | null;
  marcadorCor: string | null;
  inicio: string;
  fim: string;
  status: StatusAgendamento;
  observacoes: string | null;
  motivoCancelamento: string | null;
  servicos: { id: string; nome: string; precoTotal: number }[];
};

/** Agendamentos com `inicio` em `[inicioISO, fimISO)`, opcionalmente restritos a um profissional (tela `1n`). */
export function useAgendamentosIntervalo(inicioISO: string, fimISO: string, profissionalId?: string) {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["agendamentos", accountId, inicioISO, fimISO, profissionalId ?? "todos"],
    enabled: !!accountId,
    queryFn: async (): Promise<Agendamento[]> => {
      let query = db()
        .from("agendamentos")
        .select("id, cliente_id, profissional_id, recurso_id, marcador_id, inicio, fim, status, observacoes, motivo_cancelamento")
        .eq("account_id", accountId!)
        .gte("inicio", inicioISO)
        .lt("inicio", fimISO)
        .order("inicio", { ascending: true });
      if (profissionalId) query = query.eq("profissional_id", profissionalId);

      const { data: brutos, error } = await query;
      if (error) throw error;
      const lista = brutos ?? [];
      if (lista.length === 0) return [];

      const clienteIds = Array.from(new Set(lista.map((a) => a.cliente_id)));
      const profissionalIds = Array.from(new Set(lista.map((a) => a.profissional_id)));
      const recursoIds = Array.from(new Set(lista.map((a) => a.recurso_id).filter((v): v is string => !!v)));
      const marcadorIds = Array.from(new Set(lista.map((a) => a.marcador_id).filter((v): v is string => !!v)));
      const agendamentoIds = lista.map((a) => a.id);

      const [pessoasRes, profissionaisRes, recursosRes, marcadoresRes, servicosLinhasRes] = await Promise.all([
        supabase.schema("aba_people").from("pessoas").select("id, nome_exibicao").in("id", clienteIds),
        db().from("profissionais").select("id, nome_exibicao, cor").in("id", profissionalIds),
        recursoIds.length ? db().from("recursos").select("id, nome").in("id", recursoIds) : Promise.resolve({ data: [], error: null }),
        marcadorIds.length ? db().from("marcadores").select("id, nome, cor").in("id", marcadorIds) : Promise.resolve({ data: [], error: null }),
        db().from("agendamento_servicos").select("agendamento_id, servico_id, preco").in("agendamento_id", agendamentoIds),
      ]);
      if (pessoasRes.error) throw pessoasRes.error;
      if (profissionaisRes.error) throw profissionaisRes.error;
      if (recursosRes.error) throw recursosRes.error;
      if (marcadoresRes.error) throw marcadoresRes.error;
      if (servicosLinhasRes.error) throw servicosLinhasRes.error;

      const nomesPessoa = Object.fromEntries((pessoasRes.data ?? []).map((p) => [p.id, p.nome_exibicao]));
      const infoProfissional = Object.fromEntries((profissionaisRes.data ?? []).map((p) => [p.id, p]));
      const nomesRecurso = Object.fromEntries((recursosRes.data ?? []).map((r) => [r.id, r.nome]));
      const infoMarcador = Object.fromEntries((marcadoresRes.data ?? []).map((m) => [m.id, m]));

      const servicosLinhas = servicosLinhasRes.data ?? [];
      const servicoIds = Array.from(new Set(servicosLinhas.map((s) => s.servico_id)));
      const { data: servicos, error: e6 } = servicoIds.length
        ? await supabase.schema("aba_catalog").from("servicos").select("id, nome").in("id", servicoIds)
        : { data: [] as { id: string; nome: string }[], error: null };
      if (e6) throw e6;
      const nomesServico = Object.fromEntries((servicos ?? []).map((s) => [s.id, s.nome]));

      const servicosPorAgendamento = new Map<string, { id: string; nome: string; precoTotal: number }[]>();
      for (const linha of servicosLinhas) {
        const atual = servicosPorAgendamento.get(linha.agendamento_id) ?? [];
        atual.push({ id: linha.servico_id, nome: nomesServico[linha.servico_id] ?? "Serviço", precoTotal: Number(linha.preco) });
        servicosPorAgendamento.set(linha.agendamento_id, atual);
      }

      return lista.map((a) => ({
        id: a.id,
        clienteId: a.cliente_id,
        clienteNome: nomesPessoa[a.cliente_id] ?? "—",
        profissionalId: a.profissional_id,
        profissionalNome: infoProfissional[a.profissional_id]?.nome_exibicao ?? "—",
        profissionalCor: infoProfissional[a.profissional_id]?.cor ?? "#64748b",
        recursoId: a.recurso_id,
        recursoNome: a.recurso_id ? (nomesRecurso[a.recurso_id] ?? null) : null,
        marcadorId: a.marcador_id,
        marcadorNome: a.marcador_id ? (infoMarcador[a.marcador_id]?.nome ?? null) : null,
        marcadorCor: a.marcador_id ? (infoMarcador[a.marcador_id]?.cor ?? null) : null,
        inicio: a.inicio,
        fim: a.fim,
        status: a.status as StatusAgendamento,
        observacoes: a.observacoes,
        motivoCancelamento: a.motivo_cancelamento,
        servicos: servicosPorAgendamento.get(a.id) ?? [],
      }));
    },
  });
}

export function useCriarAgendamento() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      clienteId: string;
      profissionalId: string;
      recursoId?: string;
      marcadorId?: string;
      inicio: string;
      fim: string;
      observacoes?: string;
      servico?: { servicoId: string; preco: number; duracaoMinutos: number };
      planoClienteId?: string;
    }) => {
      const { data: agendamento, error } = await db()
        .from("agendamentos")
        .insert({
          account_id: profile!.accountId,
          cliente_id: input.clienteId,
          profissional_id: input.profissionalId,
          recurso_id: input.recursoId || null,
          marcador_id: input.marcadorId || null,
          inicio: input.inicio,
          fim: input.fim,
          observacoes: input.observacoes || null,
          plano_cliente_id: input.planoClienteId || null,
          valor_cobrado: input.servico?.preco ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (input.servico) {
        const { error: e2 } = await db()
          .from("agendamento_servicos")
          .insert({
            account_id: profile!.accountId,
            agendamento_id: agendamento.id,
            servico_id: input.servico.servicoId,
            preco: input.servico.preco,
            duracao_minutos: input.servico.duracaoMinutos,
          });
        if (e2) throw e2;
      }

      return agendamento.id as string;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["agendamentos"] }),
  });
}

export function useAtualizarStatusAgendamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: StatusAgendamento }) => {
      const { error } = await db().from("agendamentos").update({ status: input.status }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["agendamentos"] }),
  });
}

export function useAtualizarMarcadorAgendamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; marcadorId: string | null }) => {
      const { error } = await db().from("agendamentos").update({ marcador_id: input.marcadorId }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["agendamentos"] }),
  });
}

export type ContagemMarcador = { marcadorId: string; nome: string; cor: string; total: number };

/** "Relatório por marcador" (item 9) — contagem sobre o que a tela já carregou, sem rede nova. Marcador sem uso no intervalo não aparece. */
export function contarPorMarcador(agendamentos: Agendamento[], marcadores: Marcador[]): ContagemMarcador[] {
  const contagem = new Map<string, number>();
  for (const a of agendamentos) {
    if (!a.marcadorId) continue;
    contagem.set(a.marcadorId, (contagem.get(a.marcadorId) ?? 0) + 1);
  }
  return marcadores
    .map((m) => ({ marcadorId: m.id, nome: m.nome, cor: m.cor, total: contagem.get(m.id) ?? 0 }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function useCancelarAgendamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; motivo?: string }) => {
      const { error } = await db()
        .from("agendamentos")
        .update({ status: "cancelado", motivo_cancelamento: input.motivo || null })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["agendamentos"] }),
  });
}

/** "Bloquear horário" (tela `1e`) — grava folga em `ausencias`; é o que faz a Regra 2 do trigger (23514) ter um caminho real de teste. */
export function useCriarAusencia() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { profissionalId: string; inicio: string; fim: string; motivo?: string }) => {
      const { error } = await db().from("ausencias").insert({
        account_id: profile!.accountId,
        profissional_id: input.profissionalId,
        inicio: input.inicio,
        fim: input.fim,
        motivo: input.motivo || null,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["agendamentos"] }),
  });
}

/**
 * `23P01` (sobreposição de profissional/recurso, EXCLUDE USING gist) e
 * `23514` (fora de expediente/folga/atravessa meia-noite, trigger
 * `verificar_expediente_agendamento`) precisam de mensagem distinta e
 * legível — Qualidade da Subetapa 02.6 (docs/00_PLANO_E_CRITERIOS.md).
 * As substrings casadas vêm literalmente do texto de `RAISE EXCEPTION`
 * em `db/migrations/009_aba_scheduling.sql`.
 */
export function mensagemErroAgendamento(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  const mensagemOriginal = (error as { message?: string } | null)?.message ?? "";

  if (code === "23P01") {
    return "Conflito de horário: o profissional (ou a sala) já tem outro atendimento nesse intervalo.";
  }
  if (code === "23514") {
    if (mensagemOriginal.includes("folga")) return "O profissional está de folga nesse período.";
    if (mensagemOriginal.includes("meia-noite")) return "O horário não pode atravessar a meia-noite.";
    if (mensagemOriginal.includes("recurso")) return "Fora do horário de funcionamento da sala/recurso selecionado.";
    return "Fora do expediente cadastrado para o profissional nesse horário — cadastre a jornada dele antes de agendar.";
  }
  if (code === "42501") {
    return "Seu papel não tem permissão para esta ação.";
  }
  return mensagemOriginal || "Não foi possível salvar o agendamento.";
}
