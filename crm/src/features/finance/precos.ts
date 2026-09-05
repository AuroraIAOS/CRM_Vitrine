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

export type EscopoTabela = "paciente" | "tipo_profissional" | "clinica" | "grupo" | "pratica";

/** A escada, do degrau mais específico para o mais geral. */
export const DEGRAUS: { escopo: EscopoTabela | "catalogo"; rotulo: string; nota: string }[] = [
  { escopo: "paciente", rotulo: "Paciente", nota: "Preço pessoal — cortesia ou acordo pontual." },
  { escopo: "tipo_profissional", rotulo: "Tipo de profissional", nota: "Clínico geral × especialista." },
  { escopo: "clinica", rotulo: "Clínica", nota: "A unidade. Ganha discriminador na Subetapa 03.9." },
  { escopo: "grupo", rotulo: "Grupo de clínicas", nota: "A rede. Ganha discriminador na Subetapa 03.9." },
  { escopo: "pratica", rotulo: "Prática", nota: "O padrão herdado — o último recurso configurável." },
  { escopo: "catalogo", rotulo: "Catálogo", nota: "`preco_base` do procedimento, quando nenhuma tabela alcança." },
];

export function rotuloDoDegrau(escopo: string): string {
  return DEGRAUS.find((d) => d.escopo === escopo)?.rotulo ?? escopo;
}

export type TabelaPreco = {
  id: string;
  nome: string;
  escopo: EscopoTabela;
  cliente_id: string | null;
  tipo_profissional_id: string | null;
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
        .select("id, nome, escopo, cliente_id, tipo_profissional_id, estado, vigente_de, vigente_ate, substitui_id")
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
    mutationFn: async (campos: { nome: string; escopo: EscopoTabela; tipo_profissional_id?: string | null }) => {
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
