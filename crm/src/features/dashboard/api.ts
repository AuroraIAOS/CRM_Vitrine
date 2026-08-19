import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useReadableModules } from "@/lib/access";

/**
 * Números da tela `1b` (Subetapa 02.12).
 *
 * Regra declarada na Conclusão de `docs/00_PLANO_E_CRITERIOS.md`: **KPI e
 * gráfico saem de query real, nunca de mock.** Nada aqui tem valor
 * literal — cada número tem uma tabela por trás e uma janela de tempo
 * declarada no próprio card.
 *
 * DUAS FONTES DE NÚMERO ERRADO QUE ESTE ARQUIVO EVITA DE PROPÓSITO
 *
 * 1. **Permissão de módulo lida como zero.** Quem não pode ler `finance`
 *    recebe conjunto vazio de `pagamentos` — não um erro. "Receita do mês:
 *    R$ 0" é indistinguível de "a clínica não faturou nada", e é a
 *    mensagem mais alarmante possível. Cada KPI declara o módulo de que
 *    depende e vira "sem acesso" em vez de zero (`indisponivel`).
 *
 * 2. **Alcance clínico lido como pendência.** `aba_health.respostas_anamnese`
 *    filtra por `pode_acessar(cliente_id,'leitura')` linha a linha. Sem
 *    alcance, NENHUMA resposta aparece — e o contador "anamneses não
 *    preenchidas", que conta clientes SEM resposta, dispararia para o
 *    máximo, mandando a equipe caçar um problema que não existe. Por isso
 *    o alcance é sondado antes de contar (`useAlcanceClinico`).
 *
 * Erro que vira número é pior que erro que aparece como erro: ninguém
 * investiga um número.
 */

function db(schema: string) {
  return supabase.schema(schema);
}

const MINUTO = 60 * 1000;

function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Segunda-feira da semana de `d`. `getDay()` é 0=domingo (mesma convenção de `dia_semana`). */
function inicioDaSemana(d: Date): Date {
  const x = inicioDoDia(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function somaDias(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function diaISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Minutos de sobreposição entre dois intervalos — nunca negativo. */
function minutosSobrepostos(aIni: number, aFim: number, bIni: number, bFim: number): number {
  return Math.max(0, Math.min(aFim, bFim) - Math.max(aIni, bIni)) / MINUTO;
}

function minutosDoHorario(hhmmss: string): number {
  const [h, m] = hhmmss.split(":");
  return Number(h) * 60 + Number(m);
}

/** `null` quando a base de comparação é zero — variação percentual sobre zero não existe. */
function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

export type Kpi = {
  valor: number | null;
  delta: number | null;
  /** Preenchido quando o número não pôde ser calculado — a tela mostra isto no lugar do valor. */
  indisponivel: string | null;
};

export type PontoSemana = { rotulo: string; total: number; corrente: boolean };
export type FatiaServico = { nome: string; total: number; percentual: number };
export type ProximoAtendimento = { id: string; hora: string; pessoa: string; servico: string; sala: string };
export type Pendencia = { rotulo: string; valor: number | null; indisponivel: string | null };
/** `percentual: null` = profissional ativo sem grade de horário cadastrada. */
export type OcupacaoProfissional = { id: string; nome: string; percentual: number | null };

export type ResumoDashboard = {
  atendimentosHoje: Kpi;
  novosLeads: Kpi;
  taxaOcupacao: Kpi;
  receitaMes: Kpi;
  serieSemanal: PontoSemana[];
  servicos: FatiaServico[];
  proximosAtendimentos: ProximoAtendimento[];
  pendencias: Pendencia[];
  ocupacaoPorProfissional: OcupacaoProfissional[];
  /** Semanas cobertas pelo gráfico — vira legenda, para a janela ficar declarada na tela. */
  semanasNoGrafico: number;
};

/**
 * Alcance clínico AMPLO do usuário logado.
 *
 * `aba_health.pode_acessar(NULL, 'leitura')`: com `p_cliente_id` nulo a
 * função pula a checagem de pertencimento do cliente e avalia o resto —
 * negação individual, `owner`, concessão de escopo `todos_registros` e o
 * atributo profissional com `acesso_clinico`. É exatamente a pergunta
 * "esta pessoa enxerga prontuário em geral?", que é a que o dashboard
 * precisa fazer antes de contar o que não vê.
 */
export function useAlcanceClinico() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["alcance-clinico", session?.user?.id],
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await db("aba_health").rpc("pode_acessar", {
        p_cliente_id: null,
        p_acao: "leitura",
      });
      if (error) throw error;
      return data === true;
    },
  });
}

const SEMANAS_NO_GRAFICO = 12;
const DIAS_DO_DONUT = 90;

export function useResumoDashboard() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  const { data: modulos } = useReadableModules();
  const { data: temAlcanceClinico, isPending: alcanceCarregando } = useAlcanceClinico();

  const podeLer = (chave: string) => (modulos ?? []).some((m) => m.module_key === chave);

  return useQuery({
    queryKey: ["resumo-dashboard", accountId, (modulos ?? []).map((m) => m.module_key).join(","), temAlcanceClinico],
    enabled: !!accountId && !!modulos && !alcanceCarregando,
    // O agendador escreve de fundo desde a 02.10 (lembretes, faturas
    // vencidas): meio minuto mantém o painel vivo sem martelar o banco.
    staleTime: 30 * 1000,
    queryFn: async (): Promise<ResumoDashboard> => {
      const agora = new Date();
      const hoje = inicioDoDia(agora);
      const amanha = somaDias(hoje, 1);
      const mesmoDiaSemanaPassada = somaDias(hoje, -7);
      const semanaAtual = inicioDaSemana(agora);
      const semanaAnterior = somaDias(semanaAtual, -7);
      const primeiraSemana = somaDias(semanaAtual, -7 * (SEMANAS_NO_GRAFICO - 1));
      const inicioDonut = somaDias(hoje, -DIAS_DO_DONUT);

      const podeAgenda = podeLer("scheduling");
      const podePessoas = podeLer("people");
      const podeFinanceiro = podeLer("finance");
      const podeMensageria = podeLer("messaging");
      const podeCatalogo = podeLer("catalog");

      // Janela única que cobre gráfico (12 semanas), donut (90 dias) e os
      // próximos atendimentos — uma ida ao banco em vez de cinco.
      const janelaInicio = new Date(Math.min(primeiraSemana.getTime(), inicioDonut.getTime()));
      const janelaFim = somaDias(hoje, 60);

      const [agendamentos, servicosAgendados, profissionais, horarios, ausencias, recursos, leads, pagamentos, faturasAbertas, conversas] =
        await Promise.all([
          podeAgenda
            ? db("aba_scheduling")
                .from("agendamentos")
                .select("id, cliente_id, profissional_id, recurso_id, inicio, fim, status")
                .eq("account_id", accountId!)
                .gte("inicio", janelaInicio.toISOString())
                .lt("inicio", janelaFim.toISOString())
                .order("inicio")
                .then(desembrulhar)
            : Promise.resolve([]),
          podeAgenda
            ? db("aba_scheduling")
                .from("agendamento_servicos")
                .select("agendamento_id, servico_id")
                .eq("account_id", accountId!)
                .then(desembrulhar)
            : Promise.resolve([]),
          podeAgenda
            ? db("aba_scheduling")
                .from("profissionais")
                .select("id, nome_exibicao, ativo")
                .eq("account_id", accountId!)
                .eq("ativo", true)
                .then(desembrulhar)
            : Promise.resolve([]),
          podeAgenda
            ? db("aba_scheduling")
                .from("horarios_profissionais")
                .select("profissional_id, dia_semana, inicio, fim, ativo")
                .eq("account_id", accountId!)
                .eq("ativo", true)
                .then(desembrulhar)
            : Promise.resolve([]),
          podeAgenda
            ? db("aba_scheduling")
                .from("ausencias")
                .select("profissional_id, inicio, fim")
                .eq("account_id", accountId!)
                .gte("fim", semanaAnterior.toISOString())
                .lt("inicio", somaDias(semanaAtual, 7).toISOString())
                .then(desembrulhar)
            : Promise.resolve([]),
          podeAgenda
            ? db("aba_scheduling").from("recursos").select("id, nome").eq("account_id", accountId!).then(desembrulhar)
            : Promise.resolve([]),
          podePessoas
            ? db("aba_people")
                .from("leads")
                .select("id, criado_em")
                .eq("account_id", accountId!)
                .gte("criado_em", somaDias(hoje, -60).toISOString())
                .then(desembrulhar)
            : Promise.resolve([]),
          podeFinanceiro
            ? db("aba_finance")
                .from("pagamentos")
                .select("fatura_id, valor, pago_em")
                .eq("account_id", accountId!)
                .then(desembrulhar)
            : Promise.resolve([]),
          podeFinanceiro
            ? db("aba_finance")
                .from("faturas")
                .select("id, valor, status, data_vencimento")
                .eq("account_id", accountId!)
                .in("status", ["aberta", "enviada"])
                .then(desembrulhar)
            : Promise.resolve([]),
          podeMensageria
            ? db("aba_messaging")
                .from("conversas")
                .select("id, contador_nao_lidas, status")
                .eq("account_id", accountId!)
                .gt("contador_nao_lidas", 0)
                .then(desembrulhar)
            : Promise.resolve([]),
        ]);

      const vivos = agendamentos.filter((a: Ag) => a.status !== "cancelado");

      // ---------- KPI 1 — atendimentos hoje ----------
      const noDia = (dia: Date) =>
        vivos.filter((a: Ag) => {
          const t = new Date(a.inicio).getTime();
          return t >= dia.getTime() && t < somaDias(dia, 1).getTime();
        }).length;

      const atendimentosHoje: Kpi = podeAgenda
        ? { valor: noDia(hoje), delta: variacao(noDia(hoje), noDia(mesmoDiaSemanaPassada)), indisponivel: null }
        : semAcesso("Agenda");

      // ---------- KPI 2 — novos leads ----------
      const leadsEntre = (ini: Date, fim: Date) =>
        leads.filter((l: { criado_em: string }) => {
          const t = new Date(l.criado_em).getTime();
          return t >= ini.getTime() && t < fim.getTime();
        }).length;

      const novosLeads: Kpi = podePessoas
        ? {
            valor: leadsEntre(somaDias(hoje, -30), amanha),
            delta: variacao(leadsEntre(somaDias(hoje, -30), amanha), leadsEntre(somaDias(hoje, -60), somaDias(hoje, -30))),
            indisponivel: null,
          }
        : semAcesso("Pessoas");

      // ---------- KPI 3 e painel 3 — ocupação ----------
      const minutosDisponiveisNaSemana = (profissionalId: string, semana: Date) => {
        const grade = horarios.filter((h: Hor) => h.profissional_id === profissionalId);
        const bruto = grade.reduce((acc: number, h: Hor) => acc + (minutosDoHorario(h.fim) - minutosDoHorario(h.inicio)), 0);
        // Ausência lançada derruba disponibilidade — senão a taxa de
        // ocupação de quem tirou férias despenca sem ninguém ter faltado.
        const fimSemana = somaDias(semana, 7);
        const ausente = ausencias
          .filter((a: Aus) => a.profissional_id === profissionalId)
          .reduce(
            (acc: number, a: Aus) =>
              acc +
              minutosSobrepostos(new Date(a.inicio).getTime(), new Date(a.fim).getTime(), semana.getTime(), fimSemana.getTime()),
            0,
          );
        return Math.max(0, bruto - ausente);
      };

      const minutosAgendadosNaSemana = (profissionalId: string | null, semana: Date) => {
        const fimSemana = somaDias(semana, 7);
        return vivos
          .filter((a: Ag) => (profissionalId ? a.profissional_id === profissionalId : true))
          .reduce(
            (acc: number, a: Ag) =>
              acc +
              minutosSobrepostos(new Date(a.inicio).getTime(), new Date(a.fim).getTime(), semana.getTime(), fimSemana.getTime()),
            0,
          );
      };

      // Só entra no cálculo quem tem grade: profissional sem horário
      // cadastrado tem denominador zero, e se os atendimentos DELE
      // contassem no numerador da clínica a taxa subiria sem nada
      // ter mudado na ocupação real. Numerador e denominador precisam
      // falar do mesmo conjunto de pessoas.
      const comGrade = (semana: Date) => profissionais.filter((p: Prof) => minutosDisponiveisNaSemana(p.id, semana) > 0);

      const ocupacaoDaSemana = (semana: Date) => {
        const elegiveis = comGrade(semana);
        const disponivel = elegiveis.reduce((acc: number, p: Prof) => acc + minutosDisponiveisNaSemana(p.id, semana), 0);
        if (disponivel === 0) return null;
        const agendado = elegiveis.reduce((acc: number, p: Prof) => acc + minutosAgendadosNaSemana(p.id, semana), 0);
        return (agendado / disponivel) * 100;
      };

      const ocupacaoAtual = ocupacaoDaSemana(semanaAtual);
      const ocupacaoPassada = ocupacaoDaSemana(semanaAnterior);

      const taxaOcupacao: Kpi = !podeAgenda
        ? semAcesso("Agenda")
        : ocupacaoAtual === null
          ? { valor: null, delta: null, indisponivel: "sem grade de horário cadastrada" }
          : {
              valor: ocupacaoAtual,
              delta: ocupacaoPassada === null || ocupacaoPassada === 0 ? null : ocupacaoAtual - ocupacaoPassada,
              indisponivel: null,
            };

      // `percentual: null` = sem grade cadastrada. Mostrar 0% seria dizer
      // "não atendeu nada esta semana", que é outra afirmação — e falsa
      // sempre que a pessoa atendeu.
      const ocupacaoPorProfissional: OcupacaoProfissional[] = profissionais
        .map((p: Prof) => {
          const disponivel = minutosDisponiveisNaSemana(p.id, semanaAtual);
          return {
            id: p.id,
            nome: p.nome_exibicao,
            percentual: disponivel === 0 ? null : (minutosAgendadosNaSemana(p.id, semanaAtual) / disponivel) * 100,
          };
        })
        .sort((a, b) => (b.percentual ?? -1) - (a.percentual ?? -1));

      // ---------- KPI 4 — receita do mês ----------
      // Mês corrente comparado ao MESMO TRECHO do mês anterior (dia 1 até o
      // dia de hoje). Comparar mês parcial contra mês inteiro faria todo
      // dia 2 parecer catástrofe.
      const primeiroDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
      const primeiroDoMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
      const mesmoDiaMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, agora.getDate() + 1);

      const somaPagamentos = (ini: Date, fim: Date) =>
        pagamentos
          .filter((p: Pag) => p.pago_em >= diaISO(ini) && p.pago_em < diaISO(fim))
          .reduce((acc: number, p: Pag) => acc + Number(p.valor), 0);

      const receitaAtual = somaPagamentos(primeiroDoMes, amanha);
      const receitaMes: Kpi = podeFinanceiro
        ? {
            valor: receitaAtual,
            delta: variacao(receitaAtual, somaPagamentos(primeiroDoMesAnterior, mesmoDiaMesAnterior)),
            indisponivel: null,
          }
        : semAcesso("Financeiro");

      // ---------- Gráfico de barras — atendimentos por semana ----------
      const serieSemanal: PontoSemana[] = [];
      for (let i = SEMANAS_NO_GRAFICO - 1; i >= 0; i--) {
        const ini = somaDias(semanaAtual, -7 * i);
        const fim = somaDias(ini, 7);
        serieSemanal.push({
          rotulo: `${String(ini.getDate()).padStart(2, "0")}/${String(ini.getMonth() + 1).padStart(2, "0")}`,
          total: vivos.filter((a: Ag) => {
            const t = new Date(a.inicio).getTime();
            return t >= ini.getTime() && t < fim.getTime();
          }).length,
          corrente: i === 0,
        });
      }

      // ---------- Donut — serviços mais realizados ----------
      const idsNoDonut = new Set(
        vivos
          .filter((a: Ag) => {
            const t = new Date(a.inicio).getTime();
            return t >= inicioDonut.getTime() && t < amanha.getTime();
          })
          .map((a: Ag) => a.id),
      );
      const contagemPorServico = new Map<string, number>();
      for (const s of servicosAgendados as ServAg[]) {
        if (!idsNoDonut.has(s.agendamento_id)) continue;
        contagemPorServico.set(s.servico_id, (contagemPorServico.get(s.servico_id) ?? 0) + 1);
      }

      // Catálogo inteiro da conta, não só os serviços do donut: os
      // "próximos atendimentos" são FUTUROS e apontam serviços que a
      // janela de 90 dias para trás não contém. Buscar só os do donut
      // deixaria o painel com "—" no lugar do nome do serviço.
      let nomesServico: Record<string, string> = {};
      if (podeCatalogo) {
        const { data, error } = await db("aba_catalog").from("servicos").select("id, nome").eq("account_id", accountId!);
        if (error) throw error;
        nomesServico = Object.fromEntries((data ?? []).map((s) => [s.id, s.nome]));
      }

      const totalServicos = Array.from(contagemPorServico.values()).reduce((a, b) => a + b, 0);
      const ordenados = Array.from(contagemPorServico.entries())
        .map(([id, total]) => ({ nome: nomesServico[id] ?? "Serviço", total }))
        .sort((a, b) => b.total - a.total);
      const topo = ordenados.slice(0, 3);
      const restoTotal = ordenados.slice(3).reduce((acc, s) => acc + s.total, 0);
      const servicos: FatiaServico[] = [
        ...topo.map((s) => ({ ...s, percentual: totalServicos === 0 ? 0 : (s.total / totalServicos) * 100 })),
        ...(restoTotal > 0
          ? [{ nome: "Outros", total: restoTotal, percentual: (restoTotal / totalServicos) * 100 }]
          : []),
      ];

      // ---------- Painel 1 — próximos atendimentos ----------
      const proximos = vivos
        .filter((a: Ag) => new Date(a.inicio).getTime() >= agora.getTime())
        .slice(0, 6);

      const clienteIds = Array.from(new Set(proximos.map((a: Ag) => a.cliente_id).filter(Boolean)));
      let nomesPessoa: Record<string, string> = {};
      if (podePessoas && clienteIds.length) {
        const { data, error } = await db("aba_people").from("pessoas").select("id, nome_exibicao").in("id", clienteIds);
        if (error) throw error;
        nomesPessoa = Object.fromEntries((data ?? []).map((p) => [p.id, p.nome_exibicao]));
      }
      const nomesRecurso = Object.fromEntries((recursos as Rec[]).map((r) => [r.id, r.nome]));
      const servicoDoAgendamento = new Map<string, string>();
      for (const s of servicosAgendados as ServAg[]) {
        if (!servicoDoAgendamento.has(s.agendamento_id)) {
          servicoDoAgendamento.set(s.agendamento_id, nomesServico[s.servico_id] ?? "");
        }
      }

      const proximosAtendimentos: ProximoAtendimento[] = proximos.map((a: Ag) => {
        const d = new Date(a.inicio);
        const mesmoDia = d.getTime() < amanha.getTime();
        return {
          id: a.id,
          hora: mesmoDia
            ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
            : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
          pessoa: nomesPessoa[a.cliente_id] ?? "—",
          servico: servicoDoAgendamento.get(a.id) || "—",
          sala: a.recurso_id ? (nomesRecurso[a.recurso_id] ?? "—") : "—",
        };
      });

      // ---------- Painel 2 — pendências da equipe ----------
      const pagoPorFatura = new Map<string, number>();
      for (const p of pagamentos as Pag[]) pagoPorFatura.set(p.fatura_id, (pagoPorFatura.get(p.fatura_id) ?? 0) + Number(p.valor));
      const hojeStr = diaISO(hoje);
      const cobrancasVencidas = (faturasAbertas as Fat[]).filter(
        (f) => !!f.data_vencimento && f.data_vencimento < hojeStr && Number(f.valor) - (pagoPorFatura.get(f.id) ?? 0) > 0,
      ).length;

      const retornosAConfirmar = vivos.filter(
        (a: Ag) => a.status === "agendado" && new Date(a.inicio).getTime() >= agora.getTime(),
      ).length;

      const pendencias: Pendencia[] = [
        await contarAnamnesesPendentes(accountId!, temAlcanceClinico === true, podeLer("health")),
        podeAgenda
          ? { rotulo: "Retornos a confirmar", valor: retornosAConfirmar, indisponivel: null }
          : { rotulo: "Retornos a confirmar", valor: null, indisponivel: "sem acesso à Agenda" },
        podeFinanceiro
          ? { rotulo: "Cobranças vencidas", valor: cobrancasVencidas, indisponivel: null }
          : { rotulo: "Cobranças vencidas", valor: null, indisponivel: "sem acesso ao Financeiro" },
        podeMensageria
          ? { rotulo: "Conversas sem resposta", valor: (conversas as unknown[]).length, indisponivel: null }
          : { rotulo: "Conversas sem resposta", valor: null, indisponivel: "sem acesso à Mensageria" },
      ];

      return {
        atendimentosHoje,
        novosLeads,
        taxaOcupacao,
        receitaMes,
        serieSemanal,
        servicos,
        proximosAtendimentos,
        pendencias,
        ocupacaoPorProfissional,
        semanasNoGrafico: SEMANAS_NO_GRAFICO,
      };
    },
  });
}

function semAcesso(modulo: string): Kpi {
  return { valor: null, delta: null, indisponivel: `sem acesso a ${modulo}` };
}

function desembrulhar<T>({ data, error }: { data: T[] | null; error: { message: string } | null }): T[] {
  if (error) throw error;
  return data ?? [];
}

/**
 * Clientes ativos sem anamnese respondida.
 *
 * Só conta com alcance clínico amplo — ver o cabeçalho deste arquivo. Sem
 * ele o número seria o total de clientes, não a pendência real.
 */
async function contarAnamnesesPendentes(
  accountId: string,
  temAlcanceClinico: boolean,
  podeLerHealth: boolean,
): Promise<{ rotulo: string; valor: number | null; indisponivel: string | null }> {
  const rotulo = "Anamneses não preenchidas";
  if (!podeLerHealth) return { rotulo, valor: null, indisponivel: "sem acesso ao Prontuário" };
  if (!temAlcanceClinico) return { rotulo, valor: null, indisponivel: "sem alcance clínico" };

  const [{ data: clientes, error: e1 }, { data: respostas, error: e2 }] = await Promise.all([
    supabase.schema("aba_people").from("clientes").select("id").eq("account_id", accountId).eq("status", "ativo"),
    supabase.schema("aba_health").from("respostas_anamnese").select("cliente_id").eq("account_id", accountId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const comResposta = new Set((respostas ?? []).map((r) => r.cliente_id));
  return { rotulo, valor: (clientes ?? []).filter((c) => !comResposta.has(c.id)).length, indisponivel: null };
}

type Ag = {
  id: string;
  cliente_id: string;
  profissional_id: string;
  recurso_id: string | null;
  inicio: string;
  fim: string;
  status: string;
};
type ServAg = { agendamento_id: string; servico_id: string };
type Prof = { id: string; nome_exibicao: string; ativo: boolean };
type Hor = { profissional_id: string; dia_semana: number; inicio: string; fim: string; ativo: boolean };
type Aus = { profissional_id: string; inicio: string; fim: string };
type Rec = { id: string; nome: string };
type Pag = { fatura_id: string; valor: number; pago_em: string };
type Fat = { id: string; valor: number; status: string; data_vencimento: string | null };
