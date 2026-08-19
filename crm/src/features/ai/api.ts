/**
 * Acesso a dados do módulo `aba_ai` (Subetapa 02.11).
 *
 * TRÊS FRONTEIRAS QUE ESTE ARQUIVO RESPEITA
 *
 * 1. **A chave nunca passa por aqui de volta.** `ia_configuracoes.chave_api`
 *    teve `SELECT` revogado para `authenticated` na migration 022 (achado
 *    A05 do portão adversarial). Todo `.select()` deste arquivo lista as
 *    colunas explicitamente e **omite `chave_api`** — um `select('*')`
 *    devolveria `42501 permission denied for table`, erro que parece falha
 *    de RLS e manda a investigação para o lado errado (armadilha registrada
 *    em `handoffs/instrucoes.md` §6).
 *
 * 2. **Gravar a chave é trabalho de Edge Function, não do navegador.** A
 *    cifra usa `ENCRYPTION_KEY`, que só existe no ambiente das funções.
 *    O client chama `ia-configurar` e recebe de volta apenas os quatro
 *    últimos caracteres, para a tela poder dizer qual chave está guardada.
 *
 * 3. **`ia_log_uso` é só leitura, e só para `admin+`.** Nenhuma policy de
 *    escrita existe para o usuário final: quem grava é a Edge Function com
 *    `service_role`. Consumo que o próprio usuário pudesse editar não
 *    serviria para conferir fatura.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

function db() {
  return supabase.schema("aba_ai");
}

/**
 * Extrai a mensagem real de um erro de `functions.invoke`.
 *
 * ARMADILHA MEDIDA (Subetapa 02.11): quando a Edge Function responde
 * com status fora de 2xx, `functions.invoke` devolve `data: null` e um
 * `FunctionsHttpError` cuja `message` é sempre a genérica
 * `"Edge Function returned a non-2xx status code"`. O corpo da resposta
 * — onde está o motivo real, por exemplo a recusa do provedor — fica em
 * `error.context`, que é um `Response` ainda não lido.
 *
 * Sem isto, o operador que cola uma chave errada lê "non-2xx status
 * code" e não tem como saber se errou a chave, se ela não tem crédito ou
 * se o serviço caiu — os três casos que a tela existe para distinguir.
 */
async function mensagemDeErroDaFuncao(erro: unknown, fallback: string): Promise<string> {
  const contexto = (erro as { context?: unknown })?.context;
  if (contexto instanceof Response) {
    const corpo = await contexto.clone().json().catch(() => null);
    const detalhe = (corpo as { error?: string } | null)?.error;
    if (detalhe) return detalhe;
  }
  return erro instanceof Error && erro.message ? erro.message : fallback;
}

// ============================================================
// Catálogo de modelos oferecidos
// ============================================================

export type Provedor = "anthropic" | "openai" | "openrouter";

/**
 * O banco aceita qualquer texto em `modelo` (o CHECK cobre só o
 * `provedor`), mas oferecer campo livre é convidar erro de digitação que
 * só aparece na primeira conversa real.
 *
 * **Anthropic: lista fechada, confirmada na referência oficial vigente**
 * nesta sessão (`CLAUDE.md` §11), não escrita de memória.
 *
 * **OpenAI: campo livre, de propósito.** Não confirmei o catálogo vigente
 * da OpenAI nesta sessão, e listar modelos de memória é exatamente o que
 * o §11 proíbe — um id errado só falharia na primeira conversa real com
 * um cliente. Enquanto a lista não for confirmada contra a documentação
 * deles, a tela pede o identificador e diz de onde copiá-lo. A Edge
 * Function valida a chave antes de gravar, mas **não** valida o nome do
 * modelo: o erro de modelo inexistente aparece no teste do agente, com a
 * mensagem do próprio provedor.
 */
export const MODELOS: Record<Provedor, { id: string; rotulo: string; nota?: string }[]> = {
  anthropic: [
    { id: "claude-opus-5", rotulo: "Claude Opus 5", nota: "mais capaz" },
    { id: "claude-sonnet-5", rotulo: "Claude Sonnet 5", nota: "equilíbrio custo/qualidade" },
    { id: "claude-haiku-4-5", rotulo: "Claude Haiku 4.5", nota: "mais barato e rápido" },
  ],
  openai: [],
  // OpenRouter roteia para dezenas de modelos de vários provedores, e o
  // catálogo muda com frequência — lista fechada aqui envelheceria em
  // semanas. Campo livre, com a tela dizendo onde copiar o identificador.
  openrouter: [],
};

export const ROTULO_PROVEDOR: Record<Provedor, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
  openrouter: "OpenRouter",
};

/**
 * Observação de privacidade específica por provedor, mostrada junto do
 * seletor. O caso do OpenRouter é materialmente diferente dos outros
 * dois e o usuário precisa saber **antes** de escolher: lá a política de
 * dados é de cada provedor roteado, não da plataforma, e existe ajuste
 * separado para modelos gratuitos sobre permitir roteamento a provedores
 * que treinam com os dados enviados (verificado na documentação deles em
 * 2026-08-19).
 */
export const NOTA_PRIVACIDADE_PROVEDOR: Record<Provedor, string> = {
  anthropic:
    "A política comercial da Anthropic declara não usar entradas e saídas da API para treinar modelos, por padrão. Confira os termos vigentes na conta que você usar.",
  openai:
    "Confira nos termos da sua conta OpenAI a política de retenção e de uso dos dados para treinamento aplicável ao seu plano.",
  openrouter:
    "Atenção: no OpenRouter a política de dados é de CADA provedor roteado, não da plataforma — e há configuração separada, na conta deles, sobre permitir roteamento a provedores que podem treinar com os seus dados. Revise essa configuração antes de usar modelos gratuitos com dado de cliente.",
};

// ============================================================
// Configuração do agente
// ============================================================

export type ConfiguracaoIA = {
  id: string;
  provedor: Provedor;
  modelo: string;
  promptSistema: string | null;
  ativo: boolean;
  respostaAutomaticaAtiva: boolean;
  respostaAutomaticaMax: number;
  horarioAtuacao: string | null;
  podeConsultarHorarios: boolean;
  podeCriarAgendamento: boolean;
  podeLerProntuario: boolean;
  podeConcederDesconto: boolean;
};

/** Colunas legíveis — `chave_api` deliberadamente fora (ver cabeçalho, regra 1). */
const COLUNAS_CONFIG =
  "id, provedor, modelo, prompt_sistema, ativo, resposta_automatica_ativa, resposta_automatica_max_por_conversa, horario_atuacao, pode_consultar_horarios, pode_criar_agendamento, pode_ler_prontuario, pode_conceder_desconto";

export function useConfiguracaoIA() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["ia-configuracao", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<ConfiguracaoIA | null> => {
      const { data, error } = await db()
        .from("ia_configuracoes")
        .select(COLUNAS_CONFIG)
        .eq("account_id", accountId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id as string,
        provedor: data.provedor as Provedor,
        modelo: data.modelo as string,
        promptSistema: (data.prompt_sistema as string) ?? null,
        ativo: data.ativo === true,
        respostaAutomaticaAtiva: data.resposta_automatica_ativa === true,
        respostaAutomaticaMax: (data.resposta_automatica_max_por_conversa as number) ?? 3,
        horarioAtuacao: (data.horario_atuacao as string) ?? null,
        podeConsultarHorarios: data.pode_consultar_horarios === true,
        podeCriarAgendamento: data.pode_criar_agendamento === true,
        podeLerProntuario: data.pode_ler_prontuario === true,
        podeConcederDesconto: data.pode_conceder_desconto === true,
      };
    },
  });
}

/**
 * Grava a chave pela Edge Function — nunca por `insert` direto. O client
 * não tem a `ENCRYPTION_KEY` e não deveria ter: gravar daqui significaria
 * ou chave em texto puro no banco, ou chave de cifra no navegador.
 */
export function useConfigurarChave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { provedor: Provedor; modelo: string; chaveApi: string; promptSistema?: string }) => {
      const { data, error } = await supabase.functions.invoke("ia-configurar", {
        body: {
          provedor: input.provedor,
          modelo: input.modelo,
          chave_api: input.chaveApi,
          ...(input.promptSistema !== undefined ? { prompt_sistema: input.promptSistema } : {}),
        },
      });
      if (error) {
        throw new Error(await mensagemDeErroDaFuncao(error, "Não foi possível salvar a chave."));
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as { chave_final: string; provedor: Provedor; modelo: string };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ia-configuracao"] }),
  });
}

/** Ajustes de comportamento — estes campos são legíveis e graváveis direto. */
export function useAtualizarConfiguracaoIA() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (valores: Partial<Omit<ConfiguracaoIA, "id">>) => {
      const linha: Record<string, unknown> = {};
      if (valores.modelo !== undefined) linha.modelo = valores.modelo;
      if (valores.promptSistema !== undefined) linha.prompt_sistema = valores.promptSistema;
      if (valores.ativo !== undefined) linha.ativo = valores.ativo;
      if (valores.respostaAutomaticaAtiva !== undefined) linha.resposta_automatica_ativa = valores.respostaAutomaticaAtiva;
      if (valores.respostaAutomaticaMax !== undefined) linha.resposta_automatica_max_por_conversa = valores.respostaAutomaticaMax;
      if (valores.horarioAtuacao !== undefined) linha.horario_atuacao = valores.horarioAtuacao;
      if (valores.podeConsultarHorarios !== undefined) linha.pode_consultar_horarios = valores.podeConsultarHorarios;
      if (valores.podeCriarAgendamento !== undefined) linha.pode_criar_agendamento = valores.podeCriarAgendamento;
      if (valores.podeConcederDesconto !== undefined) linha.pode_conceder_desconto = valores.podeConcederDesconto;
      // `pode_ler_prontuario` NÃO é gravável por esta função de propósito:
      // o CHECK da migration 028 recusaria, e oferecer o caminho seria
      // prometer algo que o banco nega. Ver a explicação na própria tela.

      const { error } = await db().from("ia_configuracoes").update(linha).eq("account_id", profile!.accountId);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ia-configuracao"] }),
  });
}

// ============================================================
// Base de conhecimento
// ============================================================

export type DocumentoConhecimento = {
  id: string;
  titulo: string;
  conteudo: string;
  atualizadoEm: string;
  trechos: number;
};

export function useDocumentosConhecimento() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["ia-documentos", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<DocumentoConhecimento[]> => {
      const [{ data: docs, error }, { data: trechos, error: trechosErr }] = await Promise.all([
        db()
          .from("ia_documentos_conhecimento")
          .select("id, titulo, conteudo, atualizado_em")
          .eq("account_id", accountId!)
          .order("atualizado_em", { ascending: false }),
        db().from("ia_trechos_conhecimento").select("documento_id").eq("account_id", accountId!),
      ]);
      if (error) throw error;
      if (trechosErr) throw trechosErr;

      const porDocumento = new Map<string, number>();
      for (const t of trechos ?? []) {
        const id = t.documento_id as string;
        porDocumento.set(id, (porDocumento.get(id) ?? 0) + 1);
      }

      return (docs ?? []).map((d) => ({
        id: d.id as string,
        titulo: d.titulo as string,
        conteudo: d.conteudo as string,
        atualizadoEm: d.atualizado_em as string,
        trechos: porDocumento.get(d.id as string) ?? 0,
      }));
    },
  });
}

/**
 * Quebra o documento em trechos e grava os dois. O corte é por parágrafo,
 * não por número fixo de caracteres: `buscar_conhecimento_textual()`
 * devolve o trecho inteiro para o contexto do agente, e um trecho cortado
 * no meio de uma frase entrega ao modelo uma informação truncada — que ele
 * completa por conta própria, que é exatamente o que não se quer numa
 * resposta sobre preço ou preparo de procedimento.
 */
function partirEmTrechos(conteudo: string): string[] {
  return conteudo
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function useSalvarDocumento() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; titulo: string; conteudo: string }) => {
      const accountId = profile!.accountId;
      let documentoId = input.id;

      if (documentoId) {
        const { error } = await db()
          .from("ia_documentos_conhecimento")
          .update({ titulo: input.titulo, conteudo: input.conteudo })
          .eq("id", documentoId);
        if (error) throw error;
        // Trechos são derivados do conteúdo — reescrever o documento
        // invalida todos. Apagar e recriar mantém a base coerente; um
        // upsert por índice deixaria trecho órfão do texto antigo.
        const { error: limparErr } = await db()
          .from("ia_trechos_conhecimento")
          .delete()
          .eq("documento_id", documentoId);
        if (limparErr) throw limparErr;
      } else {
        const { data, error } = await db()
          .from("ia_documentos_conhecimento")
          .insert({ account_id: accountId, titulo: input.titulo, conteudo: input.conteudo })
          .select("id")
          .single();
        if (error) throw error;
        documentoId = data!.id as string;
      }

      const trechos = partirEmTrechos(input.conteudo).map((conteudo, indice) => ({
        documento_id: documentoId,
        account_id: accountId,
        indice_trecho: indice,
        conteudo,
      }));
      if (trechos.length) {
        const { error } = await db().from("ia_trechos_conhecimento").insert(trechos);
        if (error) throw error;
      }
      return documentoId;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ia-documentos"] }),
  });
}

export function useApagarDocumento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // `ia_trechos_conhecimento` tem ON DELETE CASCADE no documento —
      // apagar o documento leva os trechos junto, sem passo extra.
      const { error } = await db().from("ia_documentos_conhecimento").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ia-documentos"] }),
  });
}

/** Busca lexical na base — o mesmo caminho que o agente usa para se fundamentar. */
export function useBuscarConhecimento() {
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (consulta: string): Promise<{ id: string; conteudo: string; relevancia: number }[]> => {
      const { data, error } = await db().rpc("buscar_conhecimento_textual", {
        p_account_id: profile!.accountId,
        p_consulta: consulta,
        p_limite: 5,
      });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((t) => ({
        id: t.id as string,
        conteudo: t.conteudo as string,
        relevancia: t.relevancia as number,
      }));
    },
  });
}

// ============================================================
// Uso e métricas
// ============================================================

export type ResumoUso = {
  chamadas: number;
  tokensPrompt: number;
  tokensResposta: number;
  tokensTotal: number;
  conversasUnicas: number;
  respostasAutomaticas: number;
  rascunhos: number;
};

export function useResumoUso(dias = 30) {
  return useQuery({
    queryKey: ["ia-resumo-uso", dias],
    queryFn: async (): Promise<ResumoUso> => {
      const { data, error } = await db().rpc("resumo_uso_ia", { p_dias: dias });
      if (error) throw error;
      const linha = (Array.isArray(data) ? data[0] : data) as Record<string, number> | null;
      return {
        chamadas: Number(linha?.chamadas ?? 0),
        tokensPrompt: Number(linha?.tokens_prompt ?? 0),
        tokensResposta: Number(linha?.tokens_resposta ?? 0),
        tokensTotal: Number(linha?.tokens_total ?? 0),
        conversasUnicas: Number(linha?.conversas_unicas ?? 0),
        respostasAutomaticas: Number(linha?.respostas_automaticas ?? 0),
        rascunhos: Number(linha?.rascunhos ?? 0),
      };
    },
  });
}

export type LinhaUso = {
  id: string;
  modo: string;
  provedor: string;
  modelo: string;
  tokensTotal: number;
  criadoEm: string;
};

export function useLogUso() {
  const { profile } = useAuth();
  const accountId = profile?.accountId;
  return useQuery({
    queryKey: ["ia-log-uso", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<LinhaUso[]> => {
      const { data, error } = await db()
        .from("ia_log_uso")
        .select("id, modo, provedor, modelo, tokens_total, criado_em")
        .eq("account_id", accountId!)
        .order("criado_em", { ascending: false })
        .limit(20);
      // Quem não é `admin+` recebe conjunto vazio pela própria RLS — a
      // tela não repete a checagem de papel.
      if (error) throw error;
      return (data ?? []).map((l) => ({
        id: l.id as string,
        modo: l.modo as string,
        provedor: l.provedor as string,
        modelo: l.modelo as string,
        tokensTotal: (l.tokens_total as number) ?? 0,
        criadoEm: l.criado_em as string,
      }));
    },
  });
}

/** Pergunta de teste ao agente — o "Testar" da tela `1l`. */
export function useTestarAgente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mensagem: string) => {
      const { data, error } = await supabase.functions.invoke("ia-responder", {
        body: { mensagem, modo: "rascunho" },
      });
      if (error) {
        throw new Error(await mensagemDeErroDaFuncao(error, "Não foi possível falar com o provedor."));
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as {
        texto: string;
        provedor: string;
        modelo: string;
        tokens_prompt: number;
        tokens_resposta: number;
        trechos_usados: number;
        log_gravado: boolean;
      };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ia-resumo-uso"] });
      void qc.invalidateQueries({ queryKey: ["ia-log-uso"] });
    },
  });
}

// ============================================================
// Aceite do termo de tratamento de dados (migration 030)
// ============================================================

/**
 * O aceite é a porta que dá acesso ao formulário de credenciais. Ele
 * precisa existir **antes** de haver configuração — por isso mora em
 * tabela própria, e não numa coluna de `ia_configuracoes`, que só
 * poderia ser preenchida depois de a chave já ter sido colada.
 *
 * A consulta é por versão: aceitar a versão anterior não vale para a
 * atual. `aceites_termo_ia` não tem policy de UPDATE nem DELETE —
 * aceite que se reescreve não é prova.
 */
export function useAceiteTermoIA(versao: string) {
  const { profile } = useAuth();
  const userId = profile ? profile.id : null;
  return useQuery({
    queryKey: ["ia-aceite", userId, versao],
    enabled: !!profile,
    queryFn: async (): Promise<{ aceitoEm: string } | null> => {
      const { data, error } = await db()
        .from("aceites_termo_ia")
        .select("aceito_em")
        .eq("versao_termo", versao)
        .order("aceito_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? { aceitoEm: data.aceito_em as string } : null;
    },
  });
}

export function useRegistrarAceite() {
  const { profile, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (versao: string) => {
      const { error } = await db().from("aceites_termo_ia").insert({
        account_id: profile!.accountId,
        // A policy exige `usuario_id = auth.uid()`: ninguém aceita em
        // nome de outro, porque um aceite que um terceiro pudesse
        // inserir não provaria ciência de ninguém.
        usuario_id: user!.id,
        versao_termo: versao,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ia-aceite"] }),
  });
}
