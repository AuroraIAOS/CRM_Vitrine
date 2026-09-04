/**
 * Acesso a dados do módulo `aba_health` (Subetapa 02.9).
 *
 * QUATRO REGRAS QUE NÃO SE NEGOCIAM NESTE ARQUIVO
 *
 * 1. **Nenhuma leitura de conteúdo clínico por tabela.** Todo `SELECT`
 *    de ficha, anamnese, evolução e consentimento passa por
 *    `aba_health.ler_prontuario()`, `ler_respostas_anamnese()`,
 *    `ler_evolucoes()` e `ler_consentimentos()` (migration 013), que
 *    gravam `aba_health.log_acesso` na MESMA transação. Ler pela tabela
 *    nem sequer funciona: a 013 revogou `SELECT` das colunas de
 *    conteúdo para `authenticated` e a tentativa devolve `42501`. A
 *    revogação é a garantia; este comentário é só o aviso a quem editar.
 *
 * 2. **Escrita não devolve conteúdo.** Os `INSERT`/`UPDATE` daqui nunca
 *    pedem coluna de conteúdo de volta (`.select("id")` no máximo).
 *    Pedir a linha inteira falharia com `42501` pelo mesmo motivo — e,
 *    se um dia passasse, seria leitura sem log.
 *
 * 3. **Anexo só por URL assinada de bucket privado.** `anexos-clinicos`
 *    é `public = false` (migration 014): não existe `getPublicUrl` aqui.
 *    A URL é assinada na hora, com TTL curto, e a assinatura só sai se a
 *    RLS de `storage.objects` autorizar naquele instante — o que chama
 *    `aba_health.pode_acessar_anexo()`, que por sua vez cobra o
 *    consentimento de uso de imagem. Por isso o banco guarda o CAMINHO,
 *    nunca a URL: URL guardada é link morto (e, pior, link que já foi
 *    válido).
 *
 * 4. **Nenhuma chave de service role.** Tudo aqui é o cliente do
 *    navegador com a anon key, sob a RLS de `aba_health`, que roteia
 *    tudo por `aba_health.pode_acessar()`.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { Marcacao, TipoMapa } from "./mapas";

function db() {
  return supabase.schema("aba_health");
}

export type AcaoClinica = "leitura" | "criacao" | "atualizacao" | "exportacao";

// ============================================================
// Autorização — a mesma função que a RLS usa
// ============================================================

/**
 * Pergunta ao banco se o usuário pode agir sobre o prontuário deste
 * cliente. Serve para a tela **explicar** a recusa, nunca para decidi-la:
 * a decisão já aconteceu na RLS antes de qualquer linha voltar.
 *
 * Sem isto, "lista vazia" seria ambíguo entre "ainda não existe ficha" e
 * "você não pode ver a ficha" — e as duas pedem telas diferentes: uma
 * convida a preencher, a outra a pedir liberação ao proprietário.
 */
export function usePodeAcessarClinico(clienteId: string | null, acao: AcaoClinica = "leitura") {
  return useQuery({
    queryKey: ["health-pode-acessar", clienteId, acao],
    enabled: !!clienteId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await db().rpc("pode_acessar", { p_cliente_id: clienteId, p_acao: acao });
      // Falha fechada: erro de consulta vira "não pode". Rede instável
      // não é motivo para a tela presumir permissão.
      if (error) return false;
      return data === true;
    },
  });
}

// ============================================================
// Clientes com acesso clínico — a lista da esquerda da tela `1h`
// ============================================================

export type ClienteClinico = {
  id: string;
  nome: string;
  /**
   * Data de nascimento, de `aba_people.pessoas` (Subetapa 03.7.a).
   *
   * Entra aqui pelo mesmo caminho e pelo mesmo motivo que o nome: é dado
   * CADASTRAL, e `aba_health` não tem — nem deve ter — cópia de dado cadastral
   * de paciente. O odontograma a usa só para DERIVAR o estado de dentição de
   * cada posição (achado A3); derivar não é decidir, e nada disso é gravado.
   */
  dataNascimento: string | null;
};

/**
 * Lista de clientes da conta. Vem de `aba_people` (nome é dado cadastral,
 * não clínico) — `aba_health` não tem, nem deve ter, cópia de nome de
 * paciente. Quem pode ver o PRONTUÁRIO de cada um é decidido depois, por
 * `pode_acessar()`, cliente a cliente.
 */
export function useClientesDaConta() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["health-clientes", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<ClienteClinico[]> => {
      const { data: clientes, error } = await supabase
        .schema("aba_people")
        .from("clientes")
        .select("id, status")
        .eq("account_id", accountId!);
      if (error) throw error;
      if (!clientes?.length) return [];

      const { data: pessoas, error: pessoasErr } = await supabase
        .schema("aba_people")
        .from("pessoas")
        .select("id, nome_exibicao, data_nascimento")
        .in(
          "id",
          clientes.map((c) => c.id),
        );
      if (pessoasErr) throw pessoasErr;

      const porId = new Map((pessoas ?? []).map((p) => [p.id as string, p]));
      return clientes
        .map((c) => {
          const p = porId.get(c.id as string);
          return {
            id: c.id as string,
            nome: (p?.nome_exibicao as string) ?? "(sem nome)",
            dataNascimento: (p?.data_nascimento as string) ?? null,
          };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  });
}

// ============================================================
// Ficha clínica (`aba_health.prontuarios`)
// ============================================================

export type Prontuario = {
  id: string;
  clienteId: string;
  tipoPele: string | null;
  medicamentos: string | null;
  alergias: string | null;
  restricoes: string | null;
  gestante: boolean | null;
  amamentando: boolean | null;
  condicoesCronicas: string | null;
  observacoesGerais: string | null;
};

type LinhaProntuario = {
  id: string;
  cliente_id: string;
  tipo_pele: string | null;
  medicamentos: string | null;
  alergias: string | null;
  restricoes: string | null;
  gestante: boolean | null;
  amamentando: boolean | null;
  condicoes_cronicas: string | null;
  observacoes_gerais: string | null;
};

function mapProntuario(linha: LinhaProntuario): Prontuario {
  return {
    id: linha.id,
    clienteId: linha.cliente_id,
    tipoPele: linha.tipo_pele,
    medicamentos: linha.medicamentos,
    alergias: linha.alergias,
    restricoes: linha.restricoes,
    gestante: linha.gestante,
    amamentando: linha.amamentando,
    condicoesCronicas: linha.condicoes_cronicas,
    observacoesGerais: linha.observacoes_gerais,
  };
}

export function useProntuario(clienteId: string | null) {
  return useQuery({
    queryKey: ["health-prontuario", clienteId],
    enabled: !!clienteId,
    // Cada leitura grava log — refetch silencioso encheria a auditoria de
    // acesso que ninguém pediu. O log tem que refletir o que o usuário
    // olhou, não o que a biblioteca de cache resolveu revalidar.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Prontuario | null> => {
      const { data, error } = await db().rpc("ler_prontuario", { p_cliente_id: clienteId });
      if (error) throw error;
      const linhas = (data ?? []) as LinhaProntuario[];
      return linhas[0] ? mapProntuario(linhas[0]) : null;
    },
  });
}

export type ProntuarioEditavel = Omit<Prontuario, "id" | "clienteId">;

export function useSalvarProntuario(clienteId: string | null) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; valores: ProntuarioEditavel }) => {
      const valores = {
        tipo_pele: input.valores.tipoPele,
        medicamentos: input.valores.medicamentos,
        alergias: input.valores.alergias,
        restricoes: input.valores.restricoes,
        gestante: input.valores.gestante,
        amamentando: input.valores.amamentando,
        condicoes_cronicas: input.valores.condicoesCronicas,
        observacoes_gerais: input.valores.observacoesGerais,
      };
      // Sem `.select()`: a linha de volta traria coluna clínica e o
      // PostgREST devolveria 42501 (regra 2 do cabeçalho).
      const { error } = input.id
        ? await db().from("prontuarios").update(valores).eq("id", input.id)
        : await db()
            .from("prontuarios")
            .insert({ ...valores, account_id: profile!.accountId, cliente_id: clienteId });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["health-prontuario", clienteId] });
      void qc.invalidateQueries({ queryKey: ["health-log", clienteId] });
    },
  });
}

// ============================================================
// Anamnese — formulário (catálogo da conta) e respostas (do cliente)
// ============================================================

/**
 * O formulário é catálogo de perguntas da CONTA, não dado de paciente:
 * não tem `cliente_id`, não entra em `log_acesso` (que o exige NOT NULL)
 * e por isso é lido pela tabela mesmo — a migration 013 registra essa
 * fronteira e o motivo. Forçar log de catálogo exigiria afrouxar o
 * `CHECK` de `tipo_registro`, ou seja, piorar a auditoria para parecer
 * mais rigoroso.
 */
export type PerguntaAnamnese = {
  chave: string;
  rotulo: string;
  tipo: "texto" | "sim_nao" | "lista";
  opcoes?: string[];
};

export type FormularioAnamnese = {
  id: string;
  nome: string;
  versao: number;
  perguntas: PerguntaAnamnese[];
  ativo: boolean;
};

export function useFormulariosAnamnese() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["health-formularios", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<FormularioAnamnese[]> => {
      const { data, error } = await db()
        .from("formularios_anamnese")
        .select("id, nome, versao, perguntas, ativo")
        .eq("account_id", accountId!)
        .eq("ativo", true)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((f) => ({
        id: f.id as string,
        nome: f.nome as string,
        versao: f.versao as number,
        perguntas: Array.isArray(f.perguntas) ? (f.perguntas as PerguntaAnamnese[]) : [],
        ativo: f.ativo as boolean,
      }));
    },
  });
}

export function useCriarFormularioAnamnese() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nome: string; perguntas: PerguntaAnamnese[] }) => {
      const { error } = await db().from("formularios_anamnese").insert({
        account_id: profile!.accountId,
        nome: input.nome,
        perguntas: input.perguntas,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["health-formularios"] }),
  });
}

export type RespostaAnamnese = {
  id: string;
  formularioId: string;
  respostas: Record<string, string>;
  respondidoEm: string;
};

export function useRespostasAnamnese(clienteId: string | null) {
  return useQuery({
    queryKey: ["health-anamnese", clienteId],
    enabled: !!clienteId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<RespostaAnamnese[]> => {
      const { data, error } = await db().rpc("ler_respostas_anamnese", { p_cliente_id: clienteId });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[])
        .map((r) => ({
          id: r.id as string,
          formularioId: r.formulario_id as string,
          respostas: (r.respostas ?? {}) as Record<string, string>,
          respondidoEm: r.respondido_em as string,
        }))
        .sort((a, b) => b.respondidoEm.localeCompare(a.respondidoEm));
    },
  });
}

export function useResponderAnamnese(clienteId: string | null) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { formularioId: string; respostas: Record<string, string> }) => {
      const { error } = await db().from("respostas_anamnese").insert({
        account_id: profile!.accountId,
        cliente_id: clienteId,
        formulario_id: input.formularioId,
        respostas: input.respostas,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["health-anamnese", clienteId] });
      void qc.invalidateQueries({ queryKey: ["health-log", clienteId] });
    },
  });
}

// ============================================================
// Evoluções (`aba_health.evolucoes`) — inclui o mapa clínico da sessão
// ============================================================

export type AnexoEvolucao = {
  caminho: string;
  nome: string;
  mime: string;
  tamanho: number;
};

export type Evolucao = {
  id: string;
  clienteId: string;
  profissionalId: string;
  agendamentoId: string | null;
  adendoDeId: string | null;
  avaliacao: string | null;
  notasProcedimento: string | null;
  resultado: string | null;
  proximosPassos: string | null;
  anexos: AnexoEvolucao[];
  mapaTipo: TipoMapa | null;
  marcacoes: unknown;
  registradoEm: string;
  travada: boolean;
};

export function useEvolucoes(clienteId: string | null) {
  return useQuery({
    queryKey: ["health-evolucoes", clienteId],
    enabled: !!clienteId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Evolucao[]> => {
      const { data, error } = await db().rpc("ler_evolucoes", { p_cliente_id: clienteId });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[])
        .map((e) => ({
          id: e.id as string,
          clienteId: e.cliente_id as string,
          profissionalId: e.profissional_id as string,
          agendamentoId: (e.agendamento_id as string) ?? null,
          adendoDeId: (e.adendo_de_id as string) ?? null,
          avaliacao: (e.avaliacao as string) ?? null,
          notasProcedimento: (e.notas_procedimento as string) ?? null,
          resultado: (e.resultado as string) ?? null,
          proximosPassos: (e.proximos_passos as string) ?? null,
          anexos: Array.isArray(e.anexos) ? (e.anexos as AnexoEvolucao[]) : [],
          mapaTipo: (e.mapa_tipo as TipoMapa) ?? null,
          marcacoes: e.marcacoes,
          registradoEm: e.registrado_em as string,
          travada: e.travada === true,
        }))
        .sort((a, b) => b.registradoEm.localeCompare(a.registradoEm));
    },
  });
}

export type EvolucaoEditavel = {
  profissionalId: string;
  avaliacao: string | null;
  notasProcedimento: string | null;
  resultado: string | null;
  proximosPassos: string | null;
  mapaTipo: TipoMapa | null;
  marcacoes: Marcacao[];
  anexos?: AnexoEvolucao[];
};

export function useCriarEvolucao(clienteId: string | null) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EvolucaoEditavel & { adendoDeId?: string }) => {
      const { data, error } = await db()
        .from("evolucoes")
        .insert({
          account_id: profile!.accountId,
          cliente_id: clienteId,
          profissional_id: input.profissionalId,
          adendo_de_id: input.adendoDeId ?? null,
          avaliacao: input.avaliacao,
          notas_procedimento: input.notasProcedimento,
          resultado: input.resultado,
          proximos_passos: input.proximosPassos,
          mapa_tipo: input.mapaTipo,
          marcacoes: input.marcacoes,
          anexos: input.anexos ?? [],
        })
        // `id` é coluna de identificação, legível por desenho (013) —
        // não é conteúdo clínico.
        .select("id")
        .single();
      if (error) throw error;
      return data!.id as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["health-evolucoes", clienteId] });
      void qc.invalidateQueries({ queryKey: ["health-log", clienteId] });
    },
  });
}

export function useAtualizarEvolucao(clienteId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string } & Partial<EvolucaoEditavel>) => {
      const valores: Record<string, unknown> = {};
      if (input.avaliacao !== undefined) valores.avaliacao = input.avaliacao;
      if (input.notasProcedimento !== undefined) valores.notas_procedimento = input.notasProcedimento;
      if (input.resultado !== undefined) valores.resultado = input.resultado;
      if (input.proximosPassos !== undefined) valores.proximos_passos = input.proximosPassos;
      if (input.mapaTipo !== undefined) valores.mapa_tipo = input.mapaTipo;
      if (input.marcacoes !== undefined) valores.marcacoes = input.marcacoes;
      if (input.anexos !== undefined) valores.anexos = input.anexos;
      const { error } = await db().from("evolucoes").update(valores).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["health-evolucoes", clienteId] });
      void qc.invalidateQueries({ queryKey: ["health-log", clienteId] });
    },
  });
}

/**
 * "Assinar e encerrar sessão" do wireframe `1h`. Depois disto o banco
 * recusa qualquer `UPDATE` na linha (trigger
 * `impedir_alteracao_evolucao_travada`, erro `23514`) — a única forma de
 * complementar é adendo em nova linha, e é por isso que a tela oferece
 * exatamente essa saída.
 */
export function useAssinarEvolucao(clienteId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from("evolucoes").update({ travada: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["health-evolucoes", clienteId] });
      void qc.invalidateQueries({ queryKey: ["health-log", clienteId] });
    },
  });
}

/** Profissionais da conta — alvo obrigatório de `evolucoes.profissional_id`. */
export function useProfissionais() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["health-profissionais", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<{ id: string; nome: string; ativo: boolean }[]> => {
      const { data, error } = await supabase
        .schema("aba_scheduling")
        .from("profissionais")
        .select("id, nome_exibicao, ativo")
        .eq("account_id", accountId!)
        .order("nome_exibicao");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id as string,
        nome: p.nome_exibicao as string,
        ativo: p.ativo as boolean,
      }));
    },
  });
}

// ============================================================
// Consentimentos (`aba_health.consentimentos`)
// ============================================================

/**
 * QUATRO TIPOS desde a Subetapa 03.8 — `procedimento_informado` entrou com
 * a migration `045`.
 *
 * O catálogo de procedimentos declara DOIS requisitos de termo desde a
 * 03.6.a (`exige_consentimento_tratamento` e `exige_consentimento_informado`,
 * este último para procedimento de risco significativo), e a trava do plano
 * de tratamento cobra um termo VIGENTE do tipo certo para deixar o
 * procedimento sair de `proposto`. Sem este quarto valor a recepção não teria
 * como coletar o termo que a trava exige — a regra existiria no banco e seria
 * inalcançável pela tela, que é a pior das duas metades.
 *
 * `estado novo num CHECK exige revisar quem filtrava pelo estado antigo`
 * (`handoffs/instrucoes.md` §5): os consumidores são estes dois — a lista e o
 * seletor de `ConsentimentosTab`, ambos dirigidos por esta constante.
 */
export const TIPOS_CONSENTIMENTO = [
  "tratamento_dados",
  "procedimento",
  "procedimento_informado",
  "uso_imagem",
] as const;
export type TipoConsentimento = (typeof TIPOS_CONSENTIMENTO)[number];

export const ROTULO_CONSENTIMENTO: Record<TipoConsentimento, string> = {
  tratamento_dados: "Tratamento de dados",
  procedimento: "Procedimento",
  procedimento_informado: "Consentimento informado",
  uso_imagem: "Uso de imagem",
};

export type Consentimento = {
  id: string;
  tipo: TipoConsentimento;
  versaoTexto: string;
  concedido: boolean;
  concedidoEm: string | null;
  revogadoEm: string | null;
  criadoEm: string;
};

export function useConsentimentos(clienteId: string | null) {
  return useQuery({
    queryKey: ["health-consentimentos", clienteId],
    enabled: !!clienteId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Consentimento[]> => {
      const { data, error } = await db().rpc("ler_consentimentos", { p_cliente_id: clienteId });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[])
        .map((c) => ({
          id: c.id as string,
          tipo: c.tipo as TipoConsentimento,
          versaoTexto: c.versao_texto as string,
          concedido: c.concedido === true,
          concedidoEm: (c.concedido_em as string) ?? null,
          revogadoEm: (c.revogado_em as string) ?? null,
          criadoEm: c.criado_em as string,
        }))
        .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    },
  });
}

/**
 * Espelha `aba_health.consentimento_vigente()` (migration 014), que a
 * política do bucket usa para decidir se a foto pode ser exibida. Aqui é
 * só para a tela EXPLICAR o bloqueio — a decisão continua sendo do
 * banco, na hora de assinar a URL. Vigente = a linha mais recente
 * daquele tipo está concedida e não foi revogada; um `uso_imagem`
 * revogado depois de concedido fecha a foto de novo.
 */
export function consentimentoVigente(consentimentos: Consentimento[], tipo: TipoConsentimento): boolean {
  const doTipo = consentimentos
    .filter((c) => c.tipo === tipo)
    .sort((a, b) => (b.concedidoEm ?? b.criadoEm).localeCompare(a.concedidoEm ?? a.criadoEm));
  const maisRecente = doTipo[0];
  return !!maisRecente && maisRecente.concedido && !maisRecente.revogadoEm;
}

export function useRegistrarConsentimento(clienteId: string | null) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tipo: TipoConsentimento; versaoTexto: string; concedido: boolean }) => {
      const { error } = await db().from("consentimentos").insert({
        account_id: profile!.accountId,
        cliente_id: clienteId,
        tipo: input.tipo,
        versao_texto: input.versaoTexto,
        concedido: input.concedido,
        concedido_em: input.concedido ? new Date().toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["health-consentimentos", clienteId] });
      void qc.invalidateQueries({ queryKey: ["health-anexo-url"] });
      void qc.invalidateQueries({ queryKey: ["health-log", clienteId] });
    },
  });
}

export function useRevogarConsentimento(clienteId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db()
        .from("consentimentos")
        .update({ revogado_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["health-consentimentos", clienteId] });
      void qc.invalidateQueries({ queryKey: ["health-anexo-url"] });
      void qc.invalidateQueries({ queryKey: ["health-log", clienteId] });
    },
  });
}

// ============================================================
// Anexos — bucket PRIVADO `anexos-clinicos` (migration 014)
// ============================================================

export const BUCKET_ANEXOS = "anexos-clinicos";

/** 10 MB — o mesmo `file_size_limit` gravado no bucket pela migration 014. */
export const ANEXO_MAX_BYTES = 10 * 1024 * 1024;

/** Espelha `allowed_mime_types` do bucket. Divergir daqui vira erro opaco no upload. */
export const ANEXO_MIMES = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;

export function mimePermitido(mime: string): boolean {
  return (ANEXO_MIMES as readonly string[]).includes(mime);
}

/**
 * A EXTENSÃO é o que `aba_health.pode_acessar_anexo()` usa para decidir
 * se o arquivo é imagem e, portanto, se depende de consentimento de uso
 * de imagem. Preservar a extensão original não é cosmético.
 */
export function ehImagem(caminhoOuNome: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(caminhoOuNome);
}

/**
 * Monta o caminho do objeto. Exportada e pura para poder ser conferida
 * sem cliente de Supabase: a política do bucket depende do formato
 * EXATO — `conta-<uuid>/cliente-<uuid>/<arquivo>`, três segmentos. Fora
 * disso `aba_health.cliente_do_anexo()` devolve NULL e a autorização
 * falha fechada (migration 014). Montar caminho à mão em outro ponto do
 * código é a forma de descobrir isso em produção.
 */
export function montarCaminhoAnexo(accountId: string, clienteId: string, nomeArquivo: string, agora = Date.now()): string {
  const temExt = /\.[^.]+$/.test(nomeArquivo);
  const ext = temExt ? nomeArquivo.split(".").pop()!.toLowerCase() : "bin";
  const base =
    nomeArquivo
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .slice(0, 40) || "anexo";
  return `conta-${accountId}/cliente-${clienteId}/${agora}-${base}.${ext}`;
}

export class AnexoRecusado extends Error {
  constructor(readonly motivo: "tamanho" | "tipo") {
    super(motivo === "tamanho" ? "Arquivo acima de 10 MB" : "Tipo de arquivo não aceito (PNG, JPEG, WebP ou PDF)");
    this.name = "AnexoRecusado";
  }
}

/**
 * Envia o arquivo e devolve a referência a gravar em
 * `aba_health.evolucoes.anexos`. Tamanho e tipo são conferidos antes do
 * envio só para a recusa ter mensagem própria em vez do erro genérico do
 * Storage — a garantia continua sendo do bucket.
 */
export function useEnviarAnexo(clienteId: string | null) {
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (arquivo: File): Promise<AnexoEvolucao> => {
      if (arquivo.size > ANEXO_MAX_BYTES) throw new AnexoRecusado("tamanho");
      if (!mimePermitido(arquivo.type)) throw new AnexoRecusado("tipo");

      const caminho = montarCaminhoAnexo(profile!.accountId, clienteId!, arquivo.name);
      const { error } = await supabase.storage
        .from(BUCKET_ANEXOS)
        .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
      if (error) throw error;

      return { caminho, nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size };
    },
  });
}

/** Janela curta de propósito: a URL assinada escapa da RLS enquanto vale. */
export const TTL_URL_ASSINADA_SEGUNDOS = 60;

/**
 * Assina a URL de leitura. Devolve `null` quando a assinatura é negada —
 * o caso normal é foto de cliente sem consentimento de imagem vigente,
 * recusada pela política do bucket. Aqui não se distingue "negado" de
 * "sumiu": o motivo verdadeiro é decidido no banco, e a tela já sabe
 * consultar o consentimento para explicar.
 */
export function useUrlAssinadaAnexo(caminho: string | null, habilitado = true) {
  return useQuery({
    queryKey: ["health-anexo-url", caminho],
    enabled: !!caminho && habilitado,
    // Renova antes de a assinatura vencer.
    staleTime: (TTL_URL_ASSINADA_SEGUNDOS - 10) * 1000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.storage
        .from(BUCKET_ANEXOS)
        .createSignedUrl(caminho!, TTL_URL_ASSINADA_SEGUNDOS);
      if (error || !data) return null;
      return data.signedUrl;
    },
  });
}

// ============================================================
// Log de acesso — a auditoria, visível a admin+ (`log_acesso_select`)
// ============================================================

export type LinhaLog = {
  id: string;
  tipoRegistro: string;
  acao: string;
  ocorridoEm: string;
  usuarioAtorId: string;
};

/**
 * `aba_health.log_acesso` é infraestrutura de auditoria, não dado
 * clínico: a política é gate direto por papel (`admin+`), sem passar por
 * `pode_acessar()` — e por isso é lida por `select` mesmo. Quem não for
 * `admin+` recebe conjunto vazio pela própria RLS; a tela não repete a
 * checagem de papel no client.
 */
export function useLogAcesso(clienteId: string | null) {
  return useQuery({
    queryKey: ["health-log", clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<LinhaLog[]> => {
      const { data, error } = await db()
        .from("log_acesso")
        .select("id, tipo_registro, acao, ocorrido_em, usuario_ator_id")
        .eq("cliente_id", clienteId!)
        .order("ocorrido_em", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((l) => ({
        id: l.id as string,
        tipoRegistro: l.tipo_registro as string,
        acao: l.acao as string,
        ocorridoEm: l.ocorrido_em as string,
        usuarioAtorId: l.usuario_ator_id as string,
      }));
    },
  });
}

// ============================================================
// Concessões de prontuário (`aba_health.concessoes_prontuario`)
// ============================================================

/**
 * A camada IBAC. É INFRAESTRUTURA DE AUTORIZAÇÃO, não dado clínico — a
 * migration 013 explica por que a RLS dela é gate direto por papel
 * (`select` para `admin+`, escrita para `owner`) em vez de passar por
 * `pode_acessar()`: rotear por `pode_acessar()` criaria autorreferência
 * (a função consultaria a tabela que decide o acesso à própria função) e
 * vazaria capacidade indevida — uma concessão "todos os registros" não
 * deve também abrir a tabela que gerencia concessões.
 *
 * Por ser infraestrutura, é lida por `select` mesmo, e não entra em
 * `log_acesso`: conceder acesso não é ler prontuário.
 *
 * Esta é a peça que faltava para a UI conseguir produzir o próprio
 * cenário permitido: sem ela, `aba_health.pode_acessar()` só abriria
 * pelo atributo profissional, e não haveria caminho de aplicação para o
 * proprietário autorizar alguém nominalmente — só SQL. Portada de
 * `src/modules/health/grants-panel.tsx` do CRM Maximus.
 */
export type Concessao = {
  id: string;
  usuarioConcedidoId: string;
  escopo: "todos_registros" | "cliente_unico";
  clienteId: string | null;
  efeito: "permitir" | "negar";
  motivo: string | null;
  expiraEm: string | null;
  criadoEm: string;
};

export function useConcessoes() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["health-concessoes", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Concessao[]> => {
      const { data, error } = await db()
        .from("concessoes_prontuario")
        .select("id, usuario_concedido_id, escopo, cliente_id, efeito, motivo, expira_em, criado_em")
        .eq("account_id", accountId!)
        .order("criado_em", { ascending: false });
      // Quem não é `admin+` recebe conjunto vazio pela própria RLS — a
      // tela não repete a checagem de papel no client.
      if (error) throw error;
      return (data ?? []).map((c) => ({
        id: c.id as string,
        usuarioConcedidoId: c.usuario_concedido_id as string,
        escopo: c.escopo as Concessao["escopo"],
        clienteId: (c.cliente_id as string) ?? null,
        efeito: c.efeito as Concessao["efeito"],
        motivo: (c.motivo as string) ?? null,
        expiraEm: (c.expira_em as string) ?? null,
        criadoEm: c.criado_em as string,
      }));
    },
  });
}

export function useConcederAcesso() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      usuarioConcedidoId: string;
      escopo: Concessao["escopo"];
      clienteId: string | null;
      efeito: Concessao["efeito"];
      motivo: string;
    }) => {
      const { error } = await db().from("concessoes_prontuario").insert({
        account_id: profile!.accountId,
        usuario_concedido_id: input.usuarioConcedidoId,
        escopo: input.escopo,
        // O CHECK da tabela amarra escopo e cliente: `cliente_unico` sem
        // cliente, ou `todos_registros` com cliente, são estados que
        // `pode_acessar()` nunca deveria precisar interpretar.
        cliente_id: input.escopo === "cliente_unico" ? input.clienteId : null,
        efeito: input.efeito,
        motivo: input.motivo || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["health-concessoes"] });
      void qc.invalidateQueries({ queryKey: ["health-pode-acessar"] });
    },
  });
}

export function useRevogarConcessao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from("concessoes_prontuario").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["health-concessoes"] });
      void qc.invalidateQueries({ queryKey: ["health-pode-acessar"] });
    },
  });
}
