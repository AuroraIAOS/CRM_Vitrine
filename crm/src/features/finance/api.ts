import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

function db() {
  return supabase.schema("aba_finance");
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================
// Seleção leve — clientes e planos do catálogo, mesmo padrão já usado
// em features/sales/api.ts e features/scheduling/api.ts (query própria
// por feature, sem import cruzado entre módulos).
// ============================================================
export type ClienteSelecao = { id: string; nomeExibicao: string };

export function useClientesParaSelecao() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["clientes-selecao-finance", accountId],
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

export type PlanoDisponivel = { id: string; nome: string; precoTotal: number };

export function usePlanosDisponiveis() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["planos-disponiveis-finance", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<PlanoDisponivel[]> => {
      const { data, error } = await supabase
        .schema("aba_catalog")
        .from("pacotes")
        .select("id, nome, preco_total")
        .eq("account_id", accountId!)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((p) => ({ id: p.id, nome: p.nome, precoTotal: Number(p.preco_total) }));
    },
  });
}

// ============================================================
// Faturas (Lançamentos)
// ============================================================
export type StatusFatura = "rascunho" | "aberta" | "enviada" | "paga" | "vencida" | "cancelada";

export type Fatura = {
  id: string;
  clienteId: string;
  clienteNome: string;
  numero: string | null;
  valor: number;
  dataEmissao: string;
  dataVencimento: string | null;
  status: StatusFatura;
  vencidaDeFato: boolean;
  pago: number;
  saldo: number;
  ultimaFormaPagamento: string | null;
  referencia: string | null;
  pacoteClienteId: string | null;
};

export function useFaturas() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["faturas", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Fatura[]> => {
      const [{ data: faturas, error: e1 }, { data: pagamentos, error: e2 }, { data: itens, error: e3 }, { data: planosCliente, error: e4 }] =
        await Promise.all([
          db()
            .from("faturas")
            .select("id, cliente_id, numero, valor, data_emissao, data_vencimento, status")
            .eq("account_id", accountId!)
            .order("data_emissao", { ascending: false }),
          db().from("pagamentos").select("fatura_id, valor, pago_em, forma_pagamento").eq("account_id", accountId!),
          db().from("itens_fatura").select("fatura_id, descricao").eq("account_id", accountId!),
          db().from("pacotes_cliente").select("id, fatura_id").eq("account_id", accountId!),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      if (e4) throw e4;

      const clienteIds = Array.from(new Set((faturas ?? []).map((f) => f.cliente_id)));
      let nomesPessoa: Record<string, string> = {};
      if (clienteIds.length) {
        const { data: pessoas, error: e5 } = await supabase.schema("aba_people").from("pessoas").select("id, nome_exibicao").in("id", clienteIds);
        if (e5) throw e5;
        nomesPessoa = Object.fromEntries((pessoas ?? []).map((p) => [p.id, p.nome_exibicao]));
      }

      const hoje = hojeISO();

      return (faturas ?? []).map((f) => {
        const pagsFatura = (pagamentos ?? []).filter((p) => p.fatura_id === f.id).sort((a, b) => b.pago_em.localeCompare(a.pago_em));
        const pago = pagsFatura.reduce((acc, p) => acc + Number(p.valor), 0);
        const item = (itens ?? []).find((i) => i.fatura_id === f.id);
        const pacoteCliente = (planosCliente ?? []).find((pc) => pc.fatura_id === f.id);
        const vencidaDeFato =
          (f.status === "aberta" || f.status === "enviada" || f.status === "vencida") &&
          !!f.data_vencimento &&
          f.data_vencimento < hoje &&
          pago < Number(f.valor);

        return {
          id: f.id,
          clienteId: f.cliente_id,
          clienteNome: nomesPessoa[f.cliente_id] ?? "—",
          numero: f.numero,
          valor: Number(f.valor),
          dataEmissao: f.data_emissao,
          dataVencimento: f.data_vencimento,
          status: (vencidaDeFato ? "vencida" : f.status) as StatusFatura,
          vencidaDeFato,
          pago,
          saldo: Number(f.valor) - pago,
          ultimaFormaPagamento: pagsFatura[0]?.forma_pagamento ?? null,
          referencia: item?.descricao ?? null,
          pacoteClienteId: pacoteCliente?.id ?? null,
        };
      });
    },
  });
}

/** Fatura avulsa — sem plano vinculado. `valor` da fatura vem do trigger `recalcular_valor_fatura` a partir do item. */
export function useCriarFaturaAvulsa() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { clienteId: string; descricao: string; valor: number; dataVencimento?: string }) => {
      const { data: fatura, error } = await db()
        .from("faturas")
        .insert({ account_id: profile!.accountId, cliente_id: input.clienteId, status: "aberta", data_vencimento: input.dataVencimento || null })
        .select("id")
        .single();
      if (error) throw error;

      const { error: e2 } = await db()
        .from("itens_fatura")
        .insert({ account_id: profile!.accountId, fatura_id: fatura.id, descricao: input.descricao, quantidade: 1, valor_unitario: input.valor });
      if (e2) throw e2;

      return fatura.id as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["faturas"] });
      void qc.invalidateQueries({ queryKey: ["resumo-financeiro"] });
    },
  });
}

/**
 * Venda de plano — `contratos`/faturas/item nascem por INSERT direto
 * (não fazem parte das seis operações protegidas); `saldos_plano`/
 * `planos_cliente` nascem só através de `aba_finance.vender_pacote()`
 * (Qualidade da Subetapa 02.8: nunca escrita direta nessas duas
 * tabelas). O contrato é o documento comercial "guarda-chuva" da venda
 * (cadeia `contratos → clientes → pessoas`); a fatura é a cobrança
 * dentro dele, e `vender_pacote()` é quem de fato gera o saldo de
 * sessões a consumir.
 */
export function useVenderPacote() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { clienteId: string; pacoteId: string; pacoteNome: string; precoTotal: number; dataVencimento?: string }) => {
      const { data: contrato, error: e0 } = await db()
        .from("contratos")
        .insert({
          account_id: profile!.accountId,
          cliente_id: input.clienteId,
          pacote_id: input.pacoteId,
          descricao: `Plano: ${input.pacoteNome}`,
          valor: input.precoTotal,
          status: "ativo",
          data_inicio: hojeISO(),
        })
        .select("id")
        .single();
      if (e0) throw e0;

      const { data: fatura, error } = await db()
        .from("faturas")
        .insert({
          account_id: profile!.accountId,
          cliente_id: input.clienteId,
          contrato_id: contrato.id,
          status: "aberta",
          data_vencimento: input.dataVencimento || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: e2 } = await db().from("itens_fatura").insert({
        account_id: profile!.accountId,
        fatura_id: fatura.id,
        descricao: `Plano: ${input.pacoteNome}`,
        quantidade: 1,
        valor_unitario: input.precoTotal,
      });
      if (e2) throw e2;

      const { error: e3 } = await db().rpc("vender_pacote", {
        p_cliente_id: input.clienteId,
        p_pacote_id: input.pacoteId,
        p_preco_total: input.precoTotal,
        p_fatura_id: fatura.id,
      });
      if (e3) throw e3;

      return fatura.id as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["faturas"] });
      void qc.invalidateQueries({ queryKey: ["planos-vendidos"] });
      void qc.invalidateQueries({ queryKey: ["resumo-financeiro"] });
    },
  });
}

export function useRegistrarPagamento() {
  const { profile, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { faturaId: string; valor: number; formaPagamento?: string; referencia?: string }) => {
      const { error } = await db().from("pagamentos").insert({
        account_id: profile!.accountId,
        fatura_id: input.faturaId,
        valor: input.valor,
        forma_pagamento: input.formaPagamento || null,
        referencia: input.referencia || null,
        confirmado_por: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["faturas"] });
      void qc.invalidateQueries({ queryKey: ["resumo-financeiro"] });
      void qc.invalidateQueries({ queryKey: ["pagamentos-conciliacao"] });
    },
  });
}

// ============================================================
// Plano vendido — saldo por serviço + estorno
// ============================================================
export type SaldoPlano = { id: string; procedimentoId: string; servicoNome: string; sessoesTotais: number; sessoesUsadas: number };
export type PlanoVendido = { id: string; pacoteNome: string; status: string; expiraEm: string | null; saldos: SaldoPlano[] };

export function usePlanoVendidoPorFatura(faturaId: string | null) {
  return useQuery({
    queryKey: ["planos-vendidos", faturaId],
    enabled: !!faturaId,
    queryFn: async (): Promise<PlanoVendido | null> => {
      const { data: pacoteCliente, error } = await db()
        .from("pacotes_cliente")
        .select("id, pacote_id, status, expira_em")
        .eq("fatura_id", faturaId!)
        .maybeSingle();
      if (error) throw error;
      if (!pacoteCliente) return null;

      const [{ data: plano, error: e2 }, { data: saldos, error: e3 }] = await Promise.all([
        supabase.schema("aba_catalog").from("pacotes").select("nome").eq("id", pacoteCliente.pacote_id).single(),
        db().from("saldos_pacote").select("id, procedimento_id, sessoes_totais, sessoes_usadas").eq("pacote_cliente_id", pacoteCliente.id),
      ]);
      if (e2) throw e2;
      if (e3) throw e3;

      const procedimentoIds = (saldos ?? []).map((s) => s.procedimento_id);
      const { data: servicos, error: e4 } = procedimentoIds.length
        ? await supabase.schema("aba_catalog").from("procedimentos").select("id, nome").in("id", procedimentoIds)
        : { data: [] as { id: string; nome: string }[], error: null };
      if (e4) throw e4;
      const nomesServico = Object.fromEntries((servicos ?? []).map((s) => [s.id, s.nome]));

      return {
        id: pacoteCliente.id,
        pacoteNome: plano?.nome ?? "—",
        status: pacoteCliente.status,
        expiraEm: pacoteCliente.expira_em,
        saldos: (saldos ?? []).map((s) => ({
          id: s.id,
          procedimentoId: s.procedimento_id,
          servicoNome: nomesServico[s.procedimento_id] ?? "Serviço",
          sessoesTotais: s.sessoes_totais,
          sessoesUsadas: s.sessoes_usadas,
        })),
      };
    },
  });
}

export function useEstornarSessao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { pacoteClienteId: string; procedimentoId: string; motivo?: string }) => {
      const { error } = await db().rpc("estornar_sessao", {
        p_pacote_cliente_id: input.pacoteClienteId,
        p_procedimento_id: input.procedimentoId,
        p_motivo: input.motivo || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["planos-vendidos"] });
      void qc.invalidateQueries({ queryKey: ["faturas"] });
    },
  });
}

/** Mapeia o texto de erro de `estornar_sessao`/`vender_pacote` para algo legível — os dois já vêm com `RAISE EXCEPTION` descritivo do banco, isto só remove o ruído de SQLSTATE cru quando presente. */
export function mensagemErroFinanceiro(error: unknown): string {
  const mensagem = (error as { message?: string } | null)?.message;
  return mensagem || "Não foi possível concluir a operação.";
}

// ============================================================
// Comissões
// ============================================================
export type StatusComissao = "pendente" | "aprovado" | "pago" | "cancelado";

export type LancamentoComissao = {
  id: string;
  profissionalNome: string;
  servicoNome: string;
  valorBase: number;
  percentual: number;
  valorComissao: number;
  status: StatusComissao;
  criadoEm: string;
};

export function useLancamentosComissao() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["lancamentos-comissao", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<LancamentoComissao[]> => {
      const { data: lancamentos, error } = await db()
        .from("lancamentos_comissao")
        .select("id, profissional_id, procedimento_id, valor_base, percentual, valor_comissao, status, criado_em")
        .eq("account_id", accountId!)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      const lista = lancamentos ?? [];
      if (lista.length === 0) return [];

      const profissionalIds = Array.from(new Set(lista.map((l) => l.profissional_id)));
      const procedimentoIds = Array.from(new Set(lista.map((l) => l.procedimento_id).filter((v): v is string => !!v)));

      const [{ data: profissionais, error: e2 }, { data: servicos, error: e3 }] = await Promise.all([
        supabase.schema("aba_scheduling").from("profissionais").select("id, nome_exibicao").in("id", profissionalIds),
        procedimentoIds.length
          ? supabase.schema("aba_catalog").from("procedimentos").select("id, nome").in("id", procedimentoIds)
          : Promise.resolve({ data: [] as { id: string; nome: string }[], error: null }),
      ]);
      if (e2) throw e2;
      if (e3) throw e3;

      const nomesProfissional = Object.fromEntries((profissionais ?? []).map((p) => [p.id, p.nome_exibicao]));
      const nomesServico = Object.fromEntries((servicos ?? []).map((s) => [s.id, s.nome]));

      return lista.map((l) => ({
        id: l.id,
        profissionalNome: nomesProfissional[l.profissional_id] ?? "—",
        servicoNome: l.procedimento_id ? (nomesServico[l.procedimento_id] ?? "—") : "—",
        valorBase: Number(l.valor_base),
        percentual: Number(l.percentual),
        valorComissao: Number(l.valor_comissao),
        status: l.status as StatusComissao,
        criadoEm: l.criado_em,
      }));
    },
  });
}

export function useAtualizarStatusComissao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: StatusComissao }) => {
      const { error } = await db()
        .from("lancamentos_comissao")
        .update({ status: input.status, pago_em: input.status === "pago" ? new Date().toISOString() : null })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["lancamentos-comissao"] });
      void qc.invalidateQueries({ queryKey: ["resumo-financeiro"] });
    },
  });
}

// ============================================================
// Resumo (KPIs + gráfico "Faturado × Recebido" + formas de pagamento)
// ============================================================
export type PontoMes = { mes: string; faturado: number; recebido: number };
export type FormaPagamentoResumo = { forma: string; valor: number };

export type ResumoFinanceiro = {
  recebidoNoMes: number;
  aReceber: number;
  vencido: number;
  comissoesAPagar: number;
  serieMensal: PontoMes[];
  formasPagamento: FormaPagamentoResumo[];
};

const LABEL_FORMA: Record<string, string> = {
  pix: "Pix",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
  plano: "Plano",
  outro: "Outro",
};

export function useResumoFinanceiro() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["resumo-financeiro", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<ResumoFinanceiro> => {
      const [{ data: faturas, error: e1 }, { data: pagamentos, error: e2 }, { data: comissoes, error: e3 }] = await Promise.all([
        db().from("faturas").select("id, valor, status, data_emissao, data_vencimento").eq("account_id", accountId!),
        db().from("pagamentos").select("fatura_id, valor, forma_pagamento, pago_em").eq("account_id", accountId!),
        db().from("lancamentos_comissao").select("valor_comissao, status").eq("account_id", accountId!),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;

      const hoje = new Date();
      const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;

      const recebidoNoMes = (pagamentos ?? []).filter((p) => p.pago_em >= inicioMes).reduce((acc, p) => acc + Number(p.valor), 0);

      const pagoPorFatura = new Map<string, number>();
      for (const p of pagamentos ?? []) pagoPorFatura.set(p.fatura_id, (pagoPorFatura.get(p.fatura_id) ?? 0) + Number(p.valor));

      let aReceber = 0;
      let vencido = 0;
      const hojeStr = hojeISO();
      for (const f of faturas ?? []) {
        // 'vencida' entra aqui desde a Subetapa 02.12, e a ausência dela
        // era um defeito MEDIDO, não teórico: o job diário
        // `marcar-faturas-vencidas` (Subetapa 02.10) reescreve o status de
        // 'aberta'/'enviada' para 'vencida', e com o filtro antigo a fatura
        // saía de "A receber" E de "Vencido" no mesmo instante em que
        // passava a estar vencida. Medição: R$ 960,00 em atraso viravam
        // R$ 0,00 no KPI assim que a rotina rodava.
        if (f.status !== "aberta" && f.status !== "enviada" && f.status !== "vencida") continue;
        const pago = pagoPorFatura.get(f.id) ?? 0;
        const saldo = Number(f.valor) - pago;
        if (saldo <= 0) continue;
        aReceber += saldo;
        if (f.data_vencimento && f.data_vencimento < hojeStr) vencido += saldo;
      }

      const comissoesAPagar = (comissoes ?? [])
        .filter((c) => c.status === "pendente" || c.status === "aprovado")
        .reduce((acc, c) => acc + Number(c.valor_comissao), 0);

      // Série de 6 meses (mês corrente + 5 anteriores).
      const meses: { chave: string; label: string }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        meses.push({ chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("pt-BR", { month: "short" }) });
      }
      const serieMensal: PontoMes[] = meses.map(({ chave, label }) => ({
        mes: label,
        faturado: (faturas ?? []).filter((f) => f.data_emissao.slice(0, 7) === chave).reduce((acc, f) => acc + Number(f.valor), 0),
        recebido: (pagamentos ?? []).filter((p) => p.pago_em.slice(0, 7) === chave).reduce((acc, p) => acc + Number(p.valor), 0),
      }));

      const formasPagamentoMap = new Map<string, number>();
      for (const p of (pagamentos ?? []).filter((p) => p.pago_em >= inicioMes)) {
        const chave = p.forma_pagamento ?? "outro";
        formasPagamentoMap.set(chave, (formasPagamentoMap.get(chave) ?? 0) + Number(p.valor));
      }
      const formasPagamento = Array.from(formasPagamentoMap.entries())
        .map(([forma, valor]) => ({ forma: LABEL_FORMA[forma] ?? forma, valor }))
        .sort((a, b) => b.valor - a.valor);

      return { recebidoNoMes, aReceber, vencido, comissoesAPagar, serieMensal, formasPagamento };
    },
  });
}

// ============================================================
// Conciliação — livro de pagamentos recebidos.
// ============================================================
export type PagamentoConciliacao = {
  id: string;
  faturaId: string;
  clienteNome: string;
  referencia: string | null;
  valor: number;
  formaPagamento: string | null;
  pagoEm: string;
};

export function usePagamentosConciliacao() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["pagamentos-conciliacao", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<PagamentoConciliacao[]> => {
      const { data: pagamentos, error } = await db()
        .from("pagamentos")
        .select("id, fatura_id, valor, forma_pagamento, pago_em")
        .eq("account_id", accountId!)
        .order("pago_em", { ascending: false });
      if (error) throw error;
      const lista = pagamentos ?? [];
      if (lista.length === 0) return [];

      const faturaIds = Array.from(new Set(lista.map((p) => p.fatura_id)));
      const [{ data: faturas, error: e2 }, { data: itens, error: e3 }] = await Promise.all([
        db().from("faturas").select("id, cliente_id").in("id", faturaIds),
        db().from("itens_fatura").select("fatura_id, descricao").in("fatura_id", faturaIds),
      ]);
      if (e2) throw e2;
      if (e3) throw e3;

      const clienteIds = Array.from(new Set((faturas ?? []).map((f) => f.cliente_id)));
      const { data: pessoas, error: e4 } = clienteIds.length
        ? await supabase.schema("aba_people").from("pessoas").select("id, nome_exibicao").in("id", clienteIds)
        : { data: [] as { id: string; nome_exibicao: string }[], error: null };
      if (e4) throw e4;

      const clientePorFatura = Object.fromEntries((faturas ?? []).map((f) => [f.id, f.cliente_id]));
      const nomesPessoa = Object.fromEntries((pessoas ?? []).map((p) => [p.id, p.nome_exibicao]));
      const referenciaPorFatura = Object.fromEntries((itens ?? []).map((i) => [i.fatura_id, i.descricao]));

      return lista.map((p) => ({
        id: p.id,
        faturaId: p.fatura_id,
        clienteNome: nomesPessoa[clientePorFatura[p.fatura_id]] ?? "—",
        referencia: referenciaPorFatura[p.fatura_id] ?? null,
        valor: Number(p.valor),
        formaPagamento: p.forma_pagamento,
        pagoEm: p.pago_em,
      }));
    },
  });
}
