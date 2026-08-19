import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

function db() {
  return supabase.schema("aba_catalog");
}

// ============================================================
// Categorias
// ============================================================
export type Categoria = { id: string; nome: string; cor: string; posicao: number; ativo: boolean };

export function useCategorias() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["categorias", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Categoria[]> => {
      const { data, error } = await db()
        .from("categorias")
        .select("id, nome, cor, posicao, ativo")
        .eq("account_id", accountId!)
        .order("posicao");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCriarCategoria() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nome: string; cor?: string }) => {
      const { error } = await db().from("categorias").insert({
        account_id: profile!.accountId,
        nome: input.nome,
        cor: input.cor || "#3b82f6",
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["categorias"] }),
  });
}

export function useAlternarAtivoCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ativo: boolean }) => {
      const { error } = await db().from("categorias").update({ ativo: input.ativo }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["categorias"] }),
  });
}

// ============================================================
// Serviços
// ============================================================
export type Servico = {
  id: string;
  categoriaId: string;
  categoriaNome: string;
  nome: string;
  descricao: string | null;
  duracaoPadraoMinutos: number;
  precoBase: number;
  requerProfissional: boolean;
  requerRecurso: boolean;
  ativo: boolean;
  variantes: Variante[];
};

export type Variante = { id: string; servicoId: string; nome: string; preco: number; duracaoMinutos: number; padrao: boolean; ativo: boolean };

export function useServicos() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["servicos-catalogo", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Servico[]> => {
      const [{ data: servicos, error: e1 }, { data: categorias, error: e2 }, { data: variantes, error: e3 }] = await Promise.all([
        db()
          .from("servicos")
          .select("id, categoria_id, nome, descricao, duracao_padrao_minutos, preco_base, requer_profissional, requer_recurso, ativo")
          .eq("account_id", accountId!)
          .order("nome"),
        db().from("categorias").select("id, nome").eq("account_id", accountId!),
        db()
          .from("variantes_servico")
          .select("id, servico_id, nome, preco, duracao_minutos, padrao, ativo")
          .eq("account_id", accountId!)
          .order("nome"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;

      const nomesCategoria = Object.fromEntries((categorias ?? []).map((c) => [c.id, c.nome]));

      return (servicos ?? []).map((s) => ({
        id: s.id,
        categoriaId: s.categoria_id,
        categoriaNome: nomesCategoria[s.categoria_id] ?? "—",
        nome: s.nome,
        descricao: s.descricao,
        duracaoPadraoMinutos: s.duracao_padrao_minutos,
        precoBase: Number(s.preco_base),
        requerProfissional: s.requer_profissional,
        requerRecurso: s.requer_recurso,
        ativo: s.ativo,
        variantes: (variantes ?? [])
          .filter((v) => v.servico_id === s.id)
          .map((v) => ({
            id: v.id,
            servicoId: v.servico_id,
            nome: v.nome,
            preco: Number(v.preco),
            duracaoMinutos: v.duracao_minutos,
            padrao: v.padrao,
            ativo: v.ativo,
          })),
      }));
    },
  });
}

export function useCriarServico() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      categoriaId: string;
      nome: string;
      descricao?: string;
      duracaoPadraoMinutos: number;
      precoBase: number;
      requerProfissional: boolean;
      requerRecurso: boolean;
    }) => {
      const { error } = await db().from("servicos").insert({
        account_id: profile!.accountId,
        categoria_id: input.categoriaId,
        nome: input.nome,
        descricao: input.descricao || null,
        duracao_padrao_minutos: input.duracaoPadraoMinutos,
        preco_base: input.precoBase,
        requer_profissional: input.requerProfissional,
        requer_recurso: input.requerRecurso,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["servicos-catalogo"] }),
  });
}

export function useAlternarAtivoServico() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ativo: boolean }) => {
      const { error } = await db().from("servicos").update({ ativo: input.ativo }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["servicos-catalogo"] }),
  });
}

// ============================================================
// Variantes de serviço
// ============================================================
export function useCriarVariante() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { servicoId: string; nome: string; preco: number; duracaoMinutos: number }) => {
      const { error } = await db().from("variantes_servico").insert({
        account_id: profile!.accountId,
        servico_id: input.servicoId,
        nome: input.nome,
        preco: input.preco,
        duracao_minutos: input.duracaoMinutos,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["servicos-catalogo"] }),
  });
}

/** Único caminho para trocar a variante padrão — nunca `UPDATE` direto (Qualidade da Subetapa 02.7). */
export function useDefinirVariantePadrao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (varianteId: string) => {
      const { error } = await db().rpc("definir_variante_padrao", { p_variante_id: varianteId });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["servicos-catalogo"] }),
  });
}

// ============================================================
// Planos
// ============================================================
export type ItemPlano = { id: string; servicoId: string; servicoNome: string; varianteId: string | null; varianteNome: string | null; sessoesIncluidas: number };
export type Plano = { id: string; nome: string; descricao: string | null; precoTotal: number; diasValidade: number | null; ativo: boolean; itens: ItemPlano[] };

export function usePlanos() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["planos-catalogo", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Plano[]> => {
      const [{ data: planos, error: e1 }, { data: itens, error: e2 }] = await Promise.all([
        db().from("planos").select("id, nome, descricao, preco_total, dias_validade, ativo").eq("account_id", accountId!).order("nome"),
        db().from("itens_plano").select("id, plano_id, servico_id, variante_servico_id, sessoes_incluidas").eq("account_id", accountId!),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const servicoIds = Array.from(new Set((itens ?? []).map((i) => i.servico_id)));
      const varianteIds = Array.from(new Set((itens ?? []).map((i) => i.variante_servico_id).filter((v): v is string => !!v)));

      const [{ data: servicos, error: e3 }, { data: variantes, error: e4 }] = await Promise.all([
        servicoIds.length ? db().from("servicos").select("id, nome").in("id", servicoIds) : Promise.resolve({ data: [], error: null }),
        varianteIds.length ? db().from("variantes_servico").select("id, nome").in("id", varianteIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (e3) throw e3;
      if (e4) throw e4;

      const nomesServico = Object.fromEntries((servicos ?? []).map((s) => [s.id, s.nome]));
      const nomesVariante = Object.fromEntries((variantes ?? []).map((v) => [v.id, v.nome]));

      return (planos ?? []).map((p) => ({
        id: p.id,
        nome: p.nome,
        descricao: p.descricao,
        precoTotal: Number(p.preco_total),
        diasValidade: p.dias_validade,
        ativo: p.ativo,
        itens: (itens ?? [])
          .filter((i) => i.plano_id === p.id)
          .map((i) => ({
            id: i.id,
            servicoId: i.servico_id,
            servicoNome: nomesServico[i.servico_id] ?? "—",
            varianteId: i.variante_servico_id,
            varianteNome: i.variante_servico_id ? (nomesVariante[i.variante_servico_id] ?? null) : null,
            sessoesIncluidas: i.sessoes_incluidas,
          })),
      }));
    },
  });
}

export function useCriarPlano() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nome: string; descricao?: string; precoTotal: number; diasValidade?: number }) => {
      const { data, error } = await db()
        .from("planos")
        .insert({
          account_id: profile!.accountId,
          nome: input.nome,
          descricao: input.descricao || null,
          preco_total: input.precoTotal,
          dias_validade: input.diasValidade || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["planos-catalogo"] }),
  });
}

export function useAlternarAtivoPlano() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ativo: boolean }) => {
      const { error } = await db().from("planos").update({ ativo: input.ativo }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["planos-catalogo"] }),
  });
}

export function useCriarItemPlano() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { planoId: string; servicoId: string; varianteId?: string; sessoesIncluidas: number }) => {
      const { error } = await db().from("itens_plano").insert({
        account_id: profile!.accountId,
        plano_id: input.planoId,
        servico_id: input.servicoId,
        variante_servico_id: input.varianteId || null,
        sessoes_incluidas: input.sessoesIncluidas,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["planos-catalogo"] }),
  });
}

export function useRemoverItemPlano() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from("itens_plano").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["planos-catalogo"] }),
  });
}
