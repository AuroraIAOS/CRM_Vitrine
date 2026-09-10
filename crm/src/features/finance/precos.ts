/**
 * Tabelas de preço com vigência (Subetapa 03.8.a).
 *
 * ============================================================
 * TRÊS ESTADOS, E CADA UM PERMITE COISAS DIFERENTES
 * ============================================================
 *   · `rascunho`     — editável à vontade. Ninguém acordou nada ainda.
 *   · `comprometida` — tem data de início e **tarifa imutável**. É a única
 *     que a escada enxerga.
 *   · `encerrada`    — foi substituída ou encerrada. Continua existindo,
 *     porque é a proveniência de todo valor congelado no passado.
 *
 * A tela NÃO tem botão de "editar preço" numa tabela comprometida, e isso
 * não é omissão de interface: o banco recusa (`23514`) mesmo que alguém
 * chame direto. Reajuste é TABELA NOVA — `reajustar_tabela_preco()` copia
 * as tarifas com o percentual e nasce em rascunho, para ser conferida
 * antes de valer. Um `UPDATE` no preço de ontem reescreveria o valor de um
 * acordo já assinado, e isso não tem conserto retroativo.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

const finance = () => supabase.schema("aba_finance");

export type EscopoTabela =
  | "paciente"
  | "grupo_paciente"
  | "tipo_profissional"
  | "clinica"
  | "rede"
  | "pratica";

/**
 * A ordem em que o preço é procurado, do caso mais específico para o mais
 * geral — e o vocabulário com que ela aparece na tela.
 *
 * OS RÓTULOS SÃO A DECISÃO D-F4, e a troca tem motivo medido: ao ler esta
 * seção, Max entendeu "tabela" como *quando* e "degrau" como *quem*. Meio
 * certo — a tabela tem mesmo vigência e o degrau tem mesmo a ver com a
 * quem se aplica —, e a metade errada é a que a tela precisa impedir:
 * **os degraus não se criam**. São seis, fixos, e são as perguntas que o
 * sistema faz em ordem; o que a clínica cria são TABELAS, e cada tabela é
 * a resposta a uma dessas perguntas. Por isso a pergunta vem escrita ao
 * lado de cada degrau: é ela que ensina a diferença sem precisar de
 * legenda.
 *
 * `escopo` e `degrau` continuam sendo os termos do banco, onde são
 * precisos e onde ninguém que usa o CRM esbarra neles.
 */
export const DEGRAUS: { escopo: EscopoTabela | "catalogo"; rotulo: string; nota: string }[] = [
  {
    escopo: "paciente",
    rotulo: "Preço só deste paciente",
    nota: "Este paciente tem preço próprio? Cortesia ou acordo pontual.",
  },
  {
    escopo: "grupo_paciente",
    rotulo: "Preço por convênio ou grupo",
    nota: "Ele está num grupo com preço próprio? Convênio, promoção, categoria.",
  },
  {
    escopo: "tipo_profissional",
    rotulo: "Por tipo de profissional",
    nota: "O tipo de quem vai executar tem preço próprio? Clínico geral × especialista.",
  },
  {
    escopo: "clinica",
    rotulo: "Preço desta unidade",
    nota: "Esta unidade tem preço próprio? Ganha distinção na Subetapa 03.9.",
  },
  {
    escopo: "rede",
    rotulo: "Preço da rede",
    nota: "A rede tem preço próprio? Ganha distinção na Subetapa 03.9.",
  },
  {
    escopo: "pratica",
    rotulo: "Preço padrão da casa",
    nota: "Existe o preço padrão? É o último recurso configurável.",
  },
  {
    escopo: "catalogo",
    rotulo: "Preço de tabela do procedimento",
    nota: "Quando nenhuma tabela alcança, vale o preço do próprio procedimento.",
  },
];

export function rotuloDoDegrau(escopo: string): string {
  return DEGRAUS.find((d) => d.escopo === escopo)?.rotulo ?? escopo;
}

// ============================================================
// Grupos de pacientes — o degrau que o convênio vai usar (03.8.d)
// ============================================================

export type GrupoPreco = {
  id: string;
  nome: string;
  descricao: string | null;
  /** Menor vence quando o paciente está em mais de um grupo vigente. */
  prioridade: number;
  ativo: boolean;
  membros: number;
};

export function useGruposPreco() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["precos-grupos", profile?.accountId],
    enabled: !!profile?.accountId,
    queryFn: async (): Promise<GrupoPreco[]> => {
      const { data, error } = await finance()
        .from("grupos_preco")
        .select("id, nome, descricao, prioridade, ativo")
        .eq("account_id", profile!.accountId)
        .order("prioridade");
      if (error) throw error;

      const ids = (data ?? []).map((g) => g.id as string);
      const contagem = new Map<string, number>();
      if (ids.length) {
        const { data: membros } = await finance()
          .from("clientes_grupo_preco")
          .select("grupo_id")
          .in("grupo_id", ids);
        for (const m of membros ?? []) {
          const k = m.grupo_id as string;
          contagem.set(k, (contagem.get(k) ?? 0) + 1);
        }
      }
      return (data ?? []).map((g) => ({
        ...(g as unknown as Omit<GrupoPreco, "membros">),
        membros: contagem.get(g.id as string) ?? 0,
      }));
    },
  });
}

export function useMembrosDoGrupo(grupoId: string | null) {
  return useQuery({
    queryKey: ["precos-grupo-membros", grupoId],
    enabled: !!grupoId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await finance()
        .from("clientes_grupo_preco")
        .select("cliente_id")
        .eq("grupo_id", grupoId!);
      if (error) throw error;
      return (data ?? []).map((m) => m.cliente_id as string);
    },
  });
}

function useRecarregarGrupos() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["precos-grupos"] });
    void qc.invalidateQueries({ queryKey: ["precos-grupo-membros"] });
  };
}

export function useCriarGrupoPreco() {
  const { profile } = useAuth();
  const recarregar = useRecarregarGrupos();
  return useMutation({
    mutationFn: async (campos: { nome: string; prioridade: number; descricao?: string | null }) => {
      const { data, error } = await finance()
        .from("grupos_preco")
        .insert({ account_id: profile!.accountId, ...campos })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: recarregar,
  });
}

export function useAlternarGrupoPreco() {
  const recarregar = useRecarregarGrupos();
  return useMutation({
    mutationFn: async ({ grupoId, ativo }: { grupoId: string; ativo: boolean }) => {
      const { error } = await finance().from("grupos_preco").update({ ativo }).eq("id", grupoId);
      if (error) throw error;
    },
    onSuccess: recarregar,
  });
}

/**
 * Pôr e tirar paciente do grupo muda o preço que ele paga — por isso a
 * inclusão carimba autor no banco (gatilho `carimbar_inclusao_em_grupo`),
 * e por isso só `admin` chega aqui.
 */
export function useMembroDoGrupo() {
  const { profile } = useAuth();
  const recarregar = useRecarregarGrupos();
  return useMutation({
    mutationFn: async ({ grupoId, clienteId, incluir }: { grupoId: string; clienteId: string; incluir: boolean }) => {
      if (incluir) {
        const { error } = await finance()
          .from("clientes_grupo_preco")
          .insert({ account_id: profile!.accountId, grupo_id: grupoId, cliente_id: clienteId });
        if (error) throw error;
      } else {
        const { error } = await finance()
          .from("clientes_grupo_preco")
          .delete()
          .eq("grupo_id", grupoId)
          .eq("cliente_id", clienteId);
        if (error) throw error;
      }
    },
    onSuccess: recarregar,
  });
}

export type TabelaPreco = {
  id: string;
  nome: string;
  escopo: EscopoTabela;
  cliente_id: string | null;
  tipo_profissional_id: string | null;
  grupo_preco_id: string | null;
  estado: "rascunho" | "comprometida" | "encerrada";
  vigente_de: string | null;
  vigente_ate: string | null;
  substitui_id: string | null;
  tarifas: number;
};

export function useTabelasPreco() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["precos-tabelas", profile?.accountId],
    enabled: !!profile?.accountId,
    queryFn: async (): Promise<TabelaPreco[]> => {
      const { data, error } = await finance()
        .from("tabelas_preco")
        .select("id, nome, escopo, cliente_id, tipo_profissional_id, grupo_preco_id, estado, vigente_de, vigente_ate, substitui_id")
        .eq("account_id", profile!.accountId)
        .order("escopo")
        .order("criado_em", { ascending: false });
      if (error) throw error;

      const ids = (data ?? []).map((t) => t.id as string);
      const contagem = new Map<string, number>();
      if (ids.length) {
        const { data: tarifas } = await finance()
          .from("tarifas")
          .select("tabela_preco_id")
          .in("tabela_preco_id", ids);
        for (const t of tarifas ?? []) {
          const k = t.tabela_preco_id as string;
          contagem.set(k, (contagem.get(k) ?? 0) + 1);
        }
      }
      return (data ?? []).map((t) => ({ ...(t as unknown as TabelaPreco), tarifas: contagem.get(t.id as string) ?? 0 }));
    },
  });
}

export type Tarifa = { id: string; procedimento_id: string; valor: number };

export function useTarifas(tabelaId: string | null) {
  return useQuery({
    queryKey: ["precos-tarifas", tabelaId],
    enabled: !!tabelaId,
    queryFn: async (): Promise<Tarifa[]> => {
      const { data, error } = await finance()
        .from("tarifas")
        .select("id, procedimento_id, valor")
        .eq("tabela_preco_id", tabelaId!);
      if (error) throw error;
      return (data ?? []) as Tarifa[];
    },
  });
}

function useRecarregarPrecos() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["precos-tabelas"] });
    void qc.invalidateQueries({ queryKey: ["precos-tarifas"] });
  };
}

export function useCriarTabelaPreco() {
  const { profile } = useAuth();
  const recarregar = useRecarregarPrecos();
  return useMutation({
    mutationFn: async (campos: {
      nome: string;
      escopo: EscopoTabela;
      tipo_profissional_id?: string | null;
      grupo_preco_id?: string | null;
    }) => {
      const { data, error } = await finance()
        .from("tabelas_preco")
        .insert({ account_id: profile!.accountId, ...campos })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: recarregar,
  });
}

export function useDefinirTarifa() {
  const { profile } = useAuth();
  const recarregar = useRecarregarPrecos();
  return useMutation({
    mutationFn: async ({
      tabelaId,
      procedimentoId,
      valor,
    }: {
      tabelaId: string;
      procedimentoId: string;
      valor: number;
    }) => {
      // `upsert` pela chave natural: a mesma tabela não tem duas tarifas
      // para o mesmo procedimento (`UNIQUE (tabela_preco_id,
      // procedimento_id)`). Em tabela comprometida o gatilho recusa —
      // corretamente, e é por isso que a tela só oferece isto em rascunho.
      const { error } = await finance()
        .from("tarifas")
        .upsert(
          { account_id: profile!.accountId, tabela_preco_id: tabelaId, procedimento_id: procedimentoId, valor },
          { onConflict: "tabela_preco_id,procedimento_id" },
        );
      if (error) throw error;
    },
    onSuccess: recarregar,
  });
}

export function useComprometerTabela() {
  const recarregar = useRecarregarPrecos();
  return useMutation({
    mutationFn: async ({ tabelaId, vigenteDe }: { tabelaId: string; vigenteDe?: string | null }) => {
      const { error } = await finance().rpc("comprometer_tabela_preco", {
        p_tabela_id: tabelaId,
        p_vigente_de: vigenteDe ?? null,
      });
      if (error) throw error;
    },
    onSuccess: recarregar,
  });
}

export function useReajustarTabela() {
  const recarregar = useRecarregarPrecos();
  return useMutation({
    mutationFn: async ({ tabelaId, percentual, nome }: { tabelaId: string; percentual: number; nome?: string }) => {
      const { data, error } = await finance().rpc("reajustar_tabela_preco", {
        p_tabela_id: tabelaId,
        p_percentual: percentual,
        p_nome: nome ?? null,
      });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: recarregar,
  });
}

export function useEncerrarTabela() {
  const recarregar = useRecarregarPrecos();
  return useMutation({
    mutationFn: async (tabelaId: string) => {
      const { error } = await finance().rpc("encerrar_tabela_preco", { p_tabela_id: tabelaId, p_vigente_ate: null });
      if (error) throw error;
    },
    onSuccess: recarregar,
  });
}
