import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

/**
 * Três/quatro queries independentes combinadas no client, mesmo padrão já
 * adotado em features/settings/useEquipe.ts — mais simples e robusto que
 * embedding cross-tabela do PostgREST (comentário lá: "mais simples e
 * robusto que forçar embed"). Todas já são RLS-scoped à conta do usuário
 * logado (is_account_member()); o .eq(account_id) é só clareza.
 */
function db() {
  return supabase.schema("aba_people");
}

export type Papel = "lead" | "cliente" | "funcionario" | "fornecedor";

export const PAPEL_LABEL: Record<Papel, string> = {
  lead: "Lead",
  cliente: "Cliente",
  funcionario: "Equipe",
  fornecedor: "Fornecedor",
};

export const PAPEL_TONE: Record<Papel, "neutral" | "success" | "warning"> = {
  lead: "neutral",
  cliente: "success",
  funcionario: "warning",
  fornecedor: "neutral",
};

export const LEAD_STATUS_LABEL: Record<string, string> = {
  novo: "Novo",
  qualificado: "Qualificado",
  desqualificado: "Desqualificado",
  convertido: "Convertido",
};

export const CLIENTE_STATUS_LABEL: Record<string, string> = {
  ativo: "Ativa",
  inativo: "Inativa",
};

export type PessoaTag = { id: string; nome: string; cor: string | null };

export type PessoaListItem = {
  id: string;
  nomeExibicao: string;
  email: string | null;
  telefone: string | null;
  criadoEm: string;
  /** Papel primário para exibição/aba — prioridade cliente > funcionario > fornecedor > lead; null = pessoa sem nenhum papel. */
  papel: Papel | null;
  leadStatus: string | null;
  clienteStatus: string | null;
  tags: PessoaTag[];
};

/**
 * Lista unificada (tela 1c). Busca todas as pessoas da conta + as 4
 * tabelas de papel + tags, combina no client. Sem paginação no banco —
 * volume esperado do v01 não justifica; TanStack Table pagina no client.
 */
export function usePessoas() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;

  return useQuery({
    queryKey: ["pessoas", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<PessoaListItem[]> => {
      const [
        { data: pessoas, error: e1 },
        { data: leads, error: e2 },
        { data: clientes, error: e3 },
        { data: funcionarios, error: e4 },
        { data: fornecedores, error: e5 },
        { data: pessoaTags, error: e6 },
        { data: tags, error: e7 },
      ] = await Promise.all([
        db().from("pessoas").select("id, nome_exibicao, email, telefone, criado_em").eq("account_id", accountId!),
        db().from("leads").select("id, status").eq("account_id", accountId!),
        db().from("clientes").select("id, status").eq("account_id", accountId!),
        db().from("funcionarios").select("id").eq("account_id", accountId!),
        db().from("fornecedores").select("id").eq("account_id", accountId!),
        db().from("pessoa_tags").select("pessoa_id, tag_id"),
        db().from("tags").select("id, nome, cor").eq("account_id", accountId!),
      ]);
      for (const e of [e1, e2, e3, e4, e5, e6, e7]) if (e) throw e;

      return (pessoas ?? []).map((p) => {
        const lead = leads?.find((l) => l.id === p.id) ?? null;
        const cliente = clientes?.find((c) => c.id === p.id) ?? null;
        const funcionario = funcionarios?.find((f) => f.id === p.id) ?? null;
        const fornecedor = fornecedores?.find((f) => f.id === p.id) ?? null;

        // "lead" nunca é default de fallback — uma pessoa sem NENHUM papel
        // (órfã, ex.: fixture de teste) fica com papel null, não vira lead
        // por engano (bug real medido em produção: fixture órfã "Funcionário
        // Fictício 01.4" aparecia como Lead na lista sem ter linha em `leads`).
        const papel: Papel | null = cliente ? "cliente" : funcionario ? "funcionario" : fornecedor ? "fornecedor" : lead ? "lead" : null;

        const tagIds = (pessoaTags ?? []).filter((pt) => pt.pessoa_id === p.id).map((pt) => pt.tag_id);
        const pessoaTagsResolvidas = tagIds.map((id) => tags?.find((t) => t.id === id)).filter((t): t is PessoaTag => !!t);

        return {
          id: p.id,
          nomeExibicao: p.nome_exibicao,
          email: p.email,
          telefone: p.telefone,
          criadoEm: p.criado_em,
          papel,
          leadStatus: lead?.status ?? null,
          clienteStatus: cliente?.status ?? null,
          tags: pessoaTagsResolvidas,
        };
      });
    },
  });
}

export function useCriarPessoa() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      papel: "lead" | "cliente" | "fornecedor";
      nomeExibicao: string;
      email?: string;
      telefone?: string;
      origem?: string;
      categoria?: string;
    }) => {
      const accountId = profile!.accountId;
      const { data: pessoa, error: erroPessoa } = await db()
        .from("pessoas")
        .insert({
          account_id: accountId,
          nome_exibicao: input.nomeExibicao,
          email: input.email || null,
          telefone: input.telefone || null,
        })
        .select("id")
        .single();
      if (erroPessoa) throw erroPessoa;

      if (input.papel === "lead") {
        const { error } = await db()
          .from("leads")
          .insert({ id: pessoa.id, account_id: accountId, origem: input.origem || "manual" });
        if (error) throw error;
      } else if (input.papel === "cliente") {
        const { error } = await db()
          .from("clientes")
          .insert({ id: pessoa.id, account_id: accountId, razao_social: input.nomeExibicao });
        if (error) throw error;
      } else {
        const { error } = await db()
          .from("fornecedores")
          .insert({ id: pessoa.id, account_id: accountId, razao_social: input.nomeExibicao, categoria: input.categoria || null });
        if (error) throw error;
      }

      return pessoa.id as string;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pessoas"] }),
  });
}

export function useExcluirPessoas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await db().from("pessoas").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pessoas"] }),
  });
}

export type PessoaDetalhe = {
  id: string;
  nomeExibicao: string;
  email: string | null;
  telefone: string | null;
  criadoEm: string;
  lead: { status: string; origem: string; comoEncontrou: string | null } | null;
  cliente: { status: string; razaoSocial: string; documento: string | null; dataNascimento: string | null } | null;
  funcionario: { ativo: boolean; cargo: string | null } | null;
  fornecedor: { ativo: boolean; categoria: string | null } | null;
  tags: PessoaTag[];
};

export function usePessoa(id: string | undefined) {
  return useQuery({
    queryKey: ["pessoa", id],
    enabled: !!id,
    queryFn: async (): Promise<PessoaDetalhe> => {
      const [
        { data: pessoa, error: e1 },
        { data: lead, error: e2 },
        { data: cliente, error: e3 },
        { data: funcionario, error: e4 },
        { data: fornecedor, error: e5 },
        { data: pessoaTags, error: e6 },
        { data: tags, error: e7 },
      ] = await Promise.all([
        db().from("pessoas").select("id, nome_exibicao, email, telefone, criado_em").eq("id", id!).single(),
        db().from("leads").select("status, origem, como_encontrou").eq("id", id!).maybeSingle(),
        db().from("clientes").select("status, razao_social, documento, data_nascimento").eq("id", id!).maybeSingle(),
        db().from("funcionarios").select("ativo, cargo").eq("id", id!).maybeSingle(),
        db().from("fornecedores").select("ativo, categoria").eq("id", id!).maybeSingle(),
        db().from("pessoa_tags").select("tag_id").eq("pessoa_id", id!),
        db().from("tags").select("id, nome, cor"),
      ]);
      for (const e of [e1, e2, e3, e4, e5, e6, e7]) if (e) throw e;

      const tagIds = (pessoaTags ?? []).map((pt) => pt.tag_id);
      const pessoaTagsResolvidas = tagIds.map((tid) => tags?.find((t) => t.id === tid)).filter((t): t is PessoaTag => !!t);

      return {
        id: pessoa!.id,
        nomeExibicao: pessoa!.nome_exibicao,
        email: pessoa!.email,
        telefone: pessoa!.telefone,
        criadoEm: pessoa!.criado_em,
        lead: lead ? { status: lead.status, origem: lead.origem, comoEncontrou: lead.como_encontrou } : null,
        cliente: cliente
          ? { status: cliente.status, razaoSocial: cliente.razao_social, documento: cliente.documento, dataNascimento: cliente.data_nascimento }
          : null,
        funcionario: funcionario ? { ativo: funcionario.ativo, cargo: funcionario.cargo } : null,
        fornecedor: fornecedor ? { ativo: fornecedor.ativo, categoria: fornecedor.categoria } : null,
        tags: pessoaTagsResolvidas,
      };
    },
  });
}

function invalidarPessoa(qc: ReturnType<typeof useQueryClient>, pessoaId: string) {
  void qc.invalidateQueries({ queryKey: ["pessoa", pessoaId] });
  void qc.invalidateQueries({ queryKey: ["pessoas"] });
}

export function useAtualizarPessoa(pessoaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nomeExibicao: string; email: string | null; telefone: string | null }) => {
      const { error } = await db()
        .from("pessoas")
        .update({ nome_exibicao: input.nomeExibicao, email: input.email, telefone: input.telefone })
        .eq("id", pessoaId);
      if (error) throw error;
    },
    onSuccess: () => invalidarPessoa(qc, pessoaId),
  });
}

export function useAtualizarStatusLead(pessoaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status: "novo" | "qualificado" | "desqualificado") => {
      const { error } = await db().from("leads").update({ status }).eq("id", pessoaId);
      if (error) throw error;
    },
    onSuccess: () => invalidarPessoa(qc, pessoaId),
  });
}

export function useAtualizarStatusCliente(pessoaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status: "ativo" | "inativo") => {
      const { error } = await db().from("clientes").update({ status }).eq("id", pessoaId);
      if (error) throw error;
    },
    onSuccess: () => invalidarPessoa(qc, pessoaId),
  });
}

/**
 * Conversão passa sempre pela RPC (docs/00 §Qualidade da 02.3) — nunca
 * INSERT direto em `clientes`. SECURITY INVOKER (docs/02 §3.4): a RLS do
 * próprio chamador se aplica normalmente.
 */
export function useConverterLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pessoaId: string) => {
      const { error } = await db().rpc("converter_lead", { p_lead_id: pessoaId });
      if (error) throw error;
      return pessoaId;
    },
    onSuccess: (pessoaId) => invalidarPessoa(qc, pessoaId),
  });
}

export function useTagsDaConta() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["tags", profile?.accountId],
    enabled: !!profile?.accountId,
    queryFn: async () => {
      const { data, error } = await db().from("tags").select("id, nome, cor").order("nome");
      if (error) throw error;
      return (data ?? []) as PessoaTag[];
    },
  });
}

/** `pt_tags_insert` exige admin+ — só quem tem papel de conta admin/owner consegue criar tag nova. */
export function useCriarTag() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nome: string; cor?: string }) => {
      const { data, error } = await db()
        .from("tags")
        .insert({ account_id: profile!.accountId, nome: input.nome, cor: input.cor || null })
        .select("id, nome, cor")
        .single();
      if (error) throw error;
      return data as PessoaTag;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tags"] }),
  });
}

export function useAdicionarTag(pessoaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tagId: string) => {
      const { error } = await db().from("pessoa_tags").insert({ pessoa_id: pessoaId, tag_id: tagId });
      if (error) throw error;
    },
    onSuccess: () => invalidarPessoa(qc, pessoaId),
  });
}

export function useRemoverTag(pessoaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tagId: string) => {
      const { error } = await db().from("pessoa_tags").delete().eq("pessoa_id", pessoaId).eq("tag_id", tagId);
      if (error) throw error;
    },
    onSuccess: () => invalidarPessoa(qc, pessoaId),
  });
}

export type PessoaNota = { id: string; conteudo: string; criadoEm: string; autor: string };

export function useNotas(pessoaId: string | undefined) {
  return useQuery({
    queryKey: ["pessoa-notas", pessoaId],
    enabled: !!pessoaId,
    queryFn: async (): Promise<PessoaNota[]> => {
      const { data, error } = await db()
        .from("pessoa_notas")
        .select("id, conteudo, criado_em, autor_id")
        .eq("pessoa_id", pessoaId!)
        .order("criado_em", { ascending: false });
      if (error) throw error;

      const autorIds = Array.from(new Set((data ?? []).map((n) => n.autor_id).filter((v): v is string => !!v)));
      let autores: Record<string, string> = {};
      if (autorIds.length) {
        const { data: perfis } = await supabase.from("profiles").select("id, full_name, email").in("id", autorIds);
        autores = Object.fromEntries((perfis ?? []).map((p) => [p.id, p.full_name || p.email || "—"]));
      }

      return (data ?? []).map((n) => ({
        id: n.id,
        conteudo: n.conteudo,
        criadoEm: n.criado_em,
        autor: n.autor_id ? (autores[n.autor_id] ?? "—") : "—",
      }));
    },
  });
}

export function useAdicionarNota(pessoaId: string) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conteudo: string) => {
      const { error } = await db()
        .from("pessoa_notas")
        .insert({ pessoa_id: pessoaId, account_id: profile!.accountId, autor_id: profile!.id, conteudo });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pessoa-notas", pessoaId] }),
  });
}

export type CampoCustomizado = { id: string; nome: string; tipoCampo: string; opcoes: string[] | null };

export function useCamposCustomizados() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["campos-customizados", profile?.accountId],
    enabled: !!profile?.accountId,
    queryFn: async (): Promise<CampoCustomizado[]> => {
      const { data, error } = await db().from("campos_customizados").select("id, nome, tipo_campo, opcoes").order("nome");
      if (error) throw error;
      return (data ?? []).map((c) => ({ id: c.id, nome: c.nome, tipoCampo: c.tipo_campo, opcoes: c.opcoes }));
    },
  });
}

/** `pt_campos_insert` exige admin+ — mesma régua de tags. */
export function useCriarCampoCustomizado() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nome: string; tipoCampo: string }) => {
      const { error } = await db()
        .from("campos_customizados")
        .insert({ account_id: profile!.accountId, nome: input.nome, tipo_campo: input.tipoCampo });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["campos-customizados"] }),
  });
}

export function useValoresCampos(pessoaId: string | undefined) {
  return useQuery({
    queryKey: ["pessoa-campos", pessoaId],
    enabled: !!pessoaId,
    queryFn: async () => {
      const { data, error } = await db().from("pessoa_campos_customizados").select("campo_id, valor").eq("pessoa_id", pessoaId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDefinirValorCampo(pessoaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { campoId: string; valor: string }) => {
      const { error } = await db()
        .from("pessoa_campos_customizados")
        .upsert({ pessoa_id: pessoaId, campo_id: input.campoId, valor: input.valor }, { onConflict: "pessoa_id,campo_id" });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pessoa-campos", pessoaId] }),
  });
}
