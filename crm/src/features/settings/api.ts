import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth, type AccountRole } from "@/lib/auth";

/**
 * Leitura e escrita da tela `1m` — Configurações da conta (Subetapa 02.12).
 *
 * REGRA QUE VALE PARA TODO `.select()` DESTE ARQUIVO: colunas listadas
 * explicitamente, nunca `*`. Seis das tabelas tocadas aqui escondem coluna
 * de `authenticated` por narrowing (`ia_configuracoes.chave_api`,
 * `configuracao_whatsapp.token_acesso_cifrado`, três colunas de
 * `provedores_canal`, `api_keys.key_hash`, `webhook_endpoints.secret`,
 * `account_invitations.token_hash`). `select('*')` nelas devolve
 * `42501 permission denied for table` — que parece falha de RLS e manda a
 * investigação para o lado errado (`handoffs/instrucoes.md` §6).
 */

// ============================================================
// Dados da conta
// ============================================================
export type DadosDaConta = {
  id: string;
  nome: string;
  criadaEm: string;
  titularUserId: string | null;
  titularNome: string | null;
  titularEmail: string | null;
};

export function useDadosDaConta() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;

  return useQuery({
    queryKey: ["dados-da-conta", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<DadosDaConta> => {
      const { data: conta, error } = await supabase
        .from("accounts")
        .select("id, name, created_at, owner_user_id")
        .eq("id", accountId!)
        .single();
      if (error) throw error;

      let titularNome: string | null = null;
      let titularEmail: string | null = null;
      if (conta.owner_user_id) {
        const { data: titular, error: e2 } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("user_id", conta.owner_user_id)
          .maybeSingle();
        if (e2) throw e2;
        titularNome = titular?.full_name ?? null;
        titularEmail = titular?.email ?? null;
      }

      return {
        id: conta.id,
        nome: conta.name,
        criadaEm: conta.created_at,
        titularUserId: conta.owner_user_id,
        titularNome,
        titularEmail,
      };
    },
  });
}

/**
 * Renomeia a conta. **Só `name`** — e isso é o ponto.
 *
 * `accounts.owner_user_id` não é editável por formulário nenhum (Qualidade
 * declarada da 02.12): a transferência de titularidade acontece só pela RPC
 * da Subetapa 02.2. A trava real não é este `update` estreito e sim o
 * trigger `enforce_account_privilege_columns` (correção A02 da Subetapa
 * 01.8), que recusa a mudança da coluna vindo por qualquer caminho. Aqui a
 * UI apenas não tenta.
 */
export function useSalvarNomeDaConta() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await supabase.from("accounts").update({ name: nome }).eq("id", profile!.accountId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dados-da-conta"] });
    },
  });
}

// ============================================================
// Módulos e licença
// ============================================================
export type ModuloDaConta = { chave: string; rotulo: string; posicao: number; nucleo: boolean };
export type Licenca = { assentosUsados: number; assentosMaximos: number | null; observacao: string | null };

export function useModulosDaConta() {
  return useQuery({
    queryKey: ["modulos-da-conta"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<ModuloDaConta[]> => {
      const { data, error } = await supabase
        .schema("access")
        .from("modules")
        .select("key, label, position, is_core")
        .order("position");
      if (error) throw error;
      return (data ?? []).map((m) => ({ chave: m.key, rotulo: m.label, posicao: m.position, nucleo: m.is_core }));
    },
  });
}

export function useLicenca() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["licenca", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Licenca> => {
      const [{ data: limites, error: e1 }, { count, error: e2 }] = await Promise.all([
        supabase
          .schema("licensing")
          .from("account_limits")
          .select("max_users, notes")
          .eq("account_id", accountId!)
          .maybeSingle(),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("account_id", accountId!),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return {
        assentosUsados: count ?? 0,
        assentosMaximos: limites?.max_users ?? null,
        observacao: limites?.notes ?? null,
      };
    },
  });
}

// ============================================================
// Perfis e permissões
// ============================================================
export type CelulaPermissao = {
  papel: AccountRole;
  moduloChave: string;
  moduloRotulo: string;
  acao: "read" | "create" | "update" | "delete";
  permitido: boolean;
  /** `true` quando há linha em `access.module_permissions`; `false` quando vale o padrão do banco. */
  excecao: boolean;
};

/** Resolvida pelo banco em `access.matriz_permissoes()` (migration 033) — nunca recalculada aqui. */
export function useMatrizPermissoes() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["matriz-permissoes", profile?.accountId],
    enabled: !!profile?.accountId,
    queryFn: async (): Promise<CelulaPermissao[]> => {
      const { data, error } = await supabase.schema("access").rpc("matriz_permissoes");
      if (error) throw error;
      return (data ?? []).map(
        (c: {
          papel: AccountRole;
          module_key: string;
          module_label: string;
          acao: CelulaPermissao["acao"];
          permitido: boolean;
          e_excecao: boolean;
        }) => ({
          papel: c.papel,
          moduloChave: c.module_key,
          moduloRotulo: c.module_label,
          acao: c.acao,
          permitido: c.permitido,
          excecao: c.e_excecao,
        }),
      );
    },
  });
}

export function useDefinirPermissao() {
  const { profile, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { papel: AccountRole; moduloChave: string; acao: string; permitido: boolean }) => {
      const { error } = await supabase
        .schema("access")
        .from("module_permissions")
        .upsert(
          {
            account_id: profile!.accountId,
            role: input.papel,
            module_key: input.moduloChave,
            action: input.acao,
            allowed: input.permitido,
            updated_by: user?.id ?? null,
          },
          { onConflict: "account_id,role,module_key,action" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["matriz-permissoes"] });
      // A navegação inteira vem de access.readable_modules() — mudar
      // permissão sem invalidar isto deixaria a sidebar mentindo até o
      // próximo recarregamento.
      void qc.invalidateQueries({ queryKey: ["readable-modules"] });
    },
  });
}

/** Apaga a exceção e devolve a célula ao padrão do banco. */
export function useRemoverExcecao() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { papel: AccountRole; moduloChave: string; acao: string }) => {
      const { error } = await supabase
        .schema("access")
        .from("module_permissions")
        .delete()
        .eq("account_id", profile!.accountId)
        .eq("role", input.papel)
        .eq("module_key", input.moduloChave)
        .eq("action", input.acao);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["matriz-permissoes"] });
      void qc.invalidateQueries({ queryKey: ["readable-modules"] });
    },
  });
}

// ============================================================
// Serviços e agenda — resumo do que está configurado nos módulos
// ============================================================
export type ResumoServicosAgenda = {
  servicosAtivos: number;
  categorias: number;
  planosAtivos: number;
  profissionaisAtivos: number;
  recursosAtivos: number;
  profissionaisComGrade: number;
};

export function useResumoServicosAgenda() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["resumo-servicos-agenda", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<ResumoServicosAgenda> => {
      // `head: true` + `count: 'exact'` — o banco conta e não devolve linha.
      const contar = (schema: string, tabela: string) =>
        supabase.schema(schema).from(tabela).select("id", { count: "exact", head: true }).eq("account_id", accountId!);

      const [servicos, categorias, planos, profissionais, recursos, grades] = await Promise.all([
        contar("aba_catalog", "servicos").eq("ativo", true),
        contar("aba_catalog", "categorias"),
        contar("aba_catalog", "planos").eq("ativo", true),
        contar("aba_scheduling", "profissionais").eq("ativo", true),
        contar("aba_scheduling", "recursos").eq("ativo", true),
        supabase
          .schema("aba_scheduling")
          .from("horarios_profissionais")
          .select("profissional_id")
          .eq("account_id", accountId!)
          .eq("ativo", true),
      ]);

      for (const r of [servicos, categorias, planos, profissionais, recursos, grades]) {
        if (r.error) throw r.error;
      }

      return {
        servicosAtivos: servicos.count ?? 0,
        categorias: categorias.count ?? 0,
        planosAtivos: planos.count ?? 0,
        profissionaisAtivos: profissionais.count ?? 0,
        recursosAtivos: recursos.count ?? 0,
        profissionaisComGrade: new Set((grades.data ?? []).map((g: { profissional_id: string }) => g.profissional_id)).size,
      };
    },
  });
}

// ============================================================
// Formulários clínicos
// ============================================================
export type FormularioClinico = { id: string; nome: string; versao: number; perguntas: number; ativo: boolean };

export function useFormulariosClinicos() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["formularios-clinicos", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<FormularioClinico[]> => {
      const { data, error } = await supabase
        .schema("aba_health")
        .from("formularios_anamnese")
        .select("id, nome, versao, perguntas, ativo")
        .eq("account_id", accountId!)
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((f) => ({
        id: f.id,
        nome: f.nome,
        versao: f.versao,
        perguntas: Array.isArray(f.perguntas) ? f.perguntas.length : 0,
        ativo: f.ativo,
      }));
    },
  });
}

// ============================================================
// Integrações
// ============================================================
export type Integracoes = {
  whatsapp: { status: string; idNumero: string | null; conectadoEm: string | null; ultimoErro: string | null } | null;
  webhooks: { id: string; url: string; ativo: boolean; falhas: number }[];
  chavesApi: { id: string; nome: string; prefixo: string; revogadaEm: string | null; ultimoUso: string | null }[];
};

export function useIntegracoes() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["integracoes", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Integracoes> => {
      const [wa, wh, ak] = await Promise.all([
        // Colunas explícitas: `token_acesso_cifrado` é negada a
        // `authenticated` e `select('*')` derrubaria a query inteira.
        supabase
          .schema("aba_messaging")
          .from("configuracao_whatsapp")
          .select("id_numero_telefone, status, conectado_em, erro_ultimo_registro")
          .eq("account_id", accountId!)
          .maybeSingle(),
        supabase
          .from("webhook_endpoints")
          .select("id, url, is_active, failure_count")
          .eq("account_id", accountId!)
          .order("created_at"),
        supabase
          .from("api_keys")
          .select("id, name, key_prefix, revoked_at, last_used_at")
          .eq("account_id", accountId!)
          .order("created_at"),
      ]);
      if (wa.error) throw wa.error;
      if (wh.error) throw wh.error;
      if (ak.error) throw ak.error;

      return {
        whatsapp: wa.data
          ? {
              status: wa.data.status,
              idNumero: wa.data.id_numero_telefone,
              conectadoEm: wa.data.conectado_em,
              ultimoErro: wa.data.erro_ultimo_registro,
            }
          : null,
        webhooks: (wh.data ?? []).map((w) => ({
          id: w.id,
          url: w.url,
          ativo: w.is_active,
          falhas: w.failure_count,
        })),
        chavesApi: (ak.data ?? []).map((k) => ({
          id: k.id,
          nome: k.name,
          prefixo: k.key_prefix,
          revogadaEm: k.revoked_at,
          ultimoUso: k.last_used_at,
        })),
      };
    },
  });
}

// ============================================================
// Chaves de IA — estado, nunca a chave
// ============================================================
export type EstadoIA = {
  configurada: boolean;
  provedor: string | null;
  modelo: string | null;
  ativo: boolean;
  respostaAutomatica: boolean;
};

export function useEstadoIA() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["estado-ia", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<EstadoIA> => {
      // `chave_api` NÃO está nesta lista — nem pode estar: a coluna tem
      // narrowing desde a migration 022 e devolve 42501 a `authenticated`,
      // inclusive para o proprietário da conta. É o desenho, não um limite.
      const { data, error } = await supabase
        .schema("aba_ai")
        .from("ia_configuracoes")
        .select("provedor, modelo, ativo, resposta_automatica_ativa")
        .eq("account_id", accountId!)
        .maybeSingle();
      if (error) throw error;
      return {
        configurada: !!data,
        provedor: data?.provedor ?? null,
        modelo: data?.modelo ?? null,
        ativo: data?.ativo ?? false,
        respostaAutomatica: data?.resposta_automatica_ativa ?? false,
      };
    },
  });
}

// ============================================================
// Auditoria — "Ações dos usuários" (item 8 do MVP, Subetapa 03.5)
//
// `aba_health.log_acesso` só é legível pelo `owner` desde a migration
// 041 — a política antiga (013) liberava `admin+`, e o Objetivo da
// 03.5 é explícito: só o dono da conta vê a atividade da equipe sobre
// dado clínico, nem `admin` enxerga o que os colegas acessaram. A RLS
// resolve isso sozinha (conjunto vazio para quem não é owner); esta
// função nunca verifica papel — verificaria em duplicidade
// (`CLAUDE.md`/Qualidade fixa da Etapa 03).
//
// Agregação por usuário, não só lista crua: "Ações dos usuários" pede
// resposta a "quem fez o quê", e uma lista de UUID sem nome nem
// contagem não responde isso. Nome resolvido via `public.profiles`
// (mesmo padrão de `useEquipe.ts`) — `log_acesso` guarda só o UUID.
// ============================================================
export type LinhaAuditoria = { id: string; quando: string; o_que: string; detalhe: string };
export type AcaoUsuario = { userId: string; nome: string; leituras: number; escritas: number; ultimaAcao: string };

const JANELA_AUDITORIA_LOG = 500;

export function useAuditoria() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["auditoria", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<{ acoesPorUsuario: AcaoUsuario[]; clinica: LinhaAuditoria[]; licenca: LinhaAuditoria[] }> => {
      const [log, limites] = await Promise.all([
        supabase
          .schema("aba_health")
          .from("log_acesso")
          .select("id, ocorrido_em, acao, tipo_registro, usuario_ator_id")
          .eq("account_id", accountId!)
          .order("ocorrido_em", { ascending: false })
          .limit(JANELA_AUDITORIA_LOG),
        supabase
          .schema("licensing")
          .from("limit_changes")
          .select("id, changed_at, field, old_value, new_value")
          .eq("account_id", accountId!)
          .order("changed_at", { ascending: false })
          .limit(12),
      ]);
      if (log.error) throw log.error;
      if (limites.error) throw limites.error;

      const eventos = log.data ?? [];
      const atorIds = Array.from(new Set(eventos.map((l) => l.usuario_ator_id)));
      const { data: perfis, error: perfisErr } = atorIds.length
        ? await supabase.from("profiles").select("user_id, full_name, email").eq("account_id", accountId!).in("user_id", atorIds)
        : { data: [] as { user_id: string; full_name: string | null; email: string }[], error: null };
      if (perfisErr) throw perfisErr;
      const nomePorAtor = Object.fromEntries((perfis ?? []).map((p) => [p.user_id, p.full_name || p.email]));

      const porUsuario = new Map<string, AcaoUsuario>();
      for (const l of eventos) {
        const nome = nomePorAtor[l.usuario_ator_id] ?? "Usuário removido";
        const atual = porUsuario.get(l.usuario_ator_id) ?? { userId: l.usuario_ator_id, nome, leituras: 0, escritas: 0, ultimaAcao: l.ocorrido_em };
        if (l.acao === "leitura") atual.leituras += 1;
        else atual.escritas += 1; // criacao | atualizacao | exportacao
        if (l.ocorrido_em > atual.ultimaAcao) atual.ultimaAcao = l.ocorrido_em;
        porUsuario.set(l.usuario_ator_id, atual);
      }
      const acoesPorUsuario = Array.from(porUsuario.values()).sort((a, b) => b.leituras + b.escritas - (a.leituras + a.escritas));

      return {
        acoesPorUsuario,
        clinica: eventos.slice(0, 12).map((l) => ({
          id: l.id,
          quando: l.ocorrido_em,
          o_que: `${l.acao} · ${l.tipo_registro}`,
          detalhe: nomePorAtor[l.usuario_ator_id] ?? "Usuário removido",
        })),
        licenca: (limites.data ?? []).map((l) => ({
          id: l.id,
          quando: l.changed_at,
          o_que: l.field,
          detalhe: `${l.old_value ?? "—"} → ${l.new_value ?? "—"}`,
        })),
      };
    },
  });
}
