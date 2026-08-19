import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, clientAs, ehErroRls, loadContext, type TestContext } from "./helpers";

/**
 * Agente de IA (Subetapa 02.11, migration 028).
 *
 * O que estes testes protegem, em ordem de gravidade:
 *   1. a chave de IA da conta continua ilegível pela API;
 *   2. o agente não pode ser autorizado a ler prontuário — nem por
 *      engano, nem por UPDATE direto no banco;
 *   3. o log de consumo não é editável por quem ele mede;
 *   4. a base de conhecimento de uma conta não vaza para outra.
 */
describe("aba_ai — chave e permissões do agente (Subetapa 02.11)", () => {
  const admin = adminClient();
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await loadContext();
    // Configuração fictícia com uma "chave" que nunca sai daqui — é um
    // texto qualquer no formato cifrado, não uma credencial real.
    const { error } = await admin
      .schema("aba_ai")
      .from("ia_configuracoes")
      .upsert(
        {
          account_id: ctx.accountId,
          provedor: "anthropic",
          modelo: "claude-opus-5",
          chave_api: "aaaa:bbbb:cccc",
          ativo: false,
        },
        { onConflict: "account_id" },
      );
    if (error) throw error;
  });

  afterAll(async () => {
    await admin.schema("aba_ai").from("ia_log_uso").delete().eq("account_id", ctx.accountId);
    await admin.schema("aba_ai").from("ia_configuracoes").delete().eq("account_id", ctx.accountId);
  });

  it("chave_api NÃO é legível por authenticated — nem para o owner (migration 022)", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner.schema("aba_ai").from("ia_configuracoes").select("chave_api");
    // 42501: privilégio de COLUNA revogado. Vale para qualquer papel —
    // a chave é da conta, mas não é para ser lida de volta por ninguém
    // pela API.
    expect(ehErroRls(error)).toBe(true);
  });

  it("select('*') na tabela quebra por causa do narrowing — listar colunas é obrigatório", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner.schema("aba_ai").from("ia_configuracoes").select("*");
    expect(ehErroRls(error)).toBe(true);
  });

  it("as colunas de comportamento SÃO legíveis — a fronteira é só a chave", async () => {
    const owner = await clientAs("owner");
    const { data, error } = await owner
      .schema("aba_ai")
      .from("ia_configuracoes")
      .select("provedor, modelo, ativo, pode_consultar_horarios, pode_ler_prontuario, horario_atuacao")
      .eq("account_id", ctx.accountId)
      .single();
    expect(error).toBeNull();
    expect(data!.provedor).toBe("anthropic");
    expect(data!.pode_ler_prontuario).toBe(false);
  });

  it("O AGENTE NÃO PODE SER AUTORIZADO A LER PRONTUÁRIO — o CHECK recusa (migration 028)", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner
      .schema("aba_ai")
      .from("ia_configuracoes")
      .update({ pode_ler_prontuario: true })
      .eq("account_id", ctx.accountId);
    // 23514: ia_configuracoes_prontuario_sempre_negado. Um agente
    // automático lê com service_role, que ignora RLS — leria aba_health
    // sem passar por pode_acessar() e sem gravar log_acesso, quebrando
    // as duas garantias da Subetapa 02.9 (CLAUDE.md §5).
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514");
  });

  it("nem service_role escapa do CHECK — a trava é de integridade, não de permissão", async () => {
    const { error } = await admin
      .schema("aba_ai")
      .from("ia_configuracoes")
      .update({ pode_ler_prontuario: true })
      .eq("account_id", ctx.accountId);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514");
  });

  it("as outras três permissões são ligáveis normalmente", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner
      .schema("aba_ai")
      .from("ia_configuracoes")
      .update({ pode_consultar_horarios: true, pode_criar_agendamento: true, pode_conceder_desconto: true })
      .eq("account_id", ctx.accountId);
    expect(error).toBeNull();

    const { data } = await admin
      .schema("aba_ai")
      .from("ia_configuracoes")
      .select("pode_consultar_horarios, pode_criar_agendamento, pode_conceder_desconto")
      .eq("account_id", ctx.accountId)
      .single();
    expect(data).toMatchObject({
      pode_consultar_horarios: true,
      pode_criar_agendamento: true,
      pode_conceder_desconto: true,
    });
  });

  it("agent não configura a IA da conta — escrita exige admin+", async () => {
    const agent = await clientAs("agent");
    const { error } = await agent
      .schema("aba_ai")
      .from("ia_configuracoes")
      .update({ ativo: true })
      .eq("account_id", ctx.accountId);
    // A policy filtra a linha: sem erro, mas sem efeito.
    expect(error).toBeNull();
    const { data } = await admin
      .schema("aba_ai")
      .from("ia_configuracoes")
      .select("ativo")
      .eq("account_id", ctx.accountId)
      .single();
    expect(data!.ativo).toBe(false);
  });

  it("ia_log_uso é só leitura para o usuário final — o motor grava, não a aplicação", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner.schema("aba_ai").from("ia_log_uso").insert({
      account_id: ctx.accountId,
      modo: "rascunho",
      provedor: "anthropic",
      modelo: "claude-opus-5",
      tokens_prompt: 1,
      tokens_resposta: 1,
      tokens_total: 2,
    });
    expect(ehErroRls(error)).toBe(true);
  });

  it("resumo_uso_ia agrega o consumo real e respeita a RLS de ia_log_uso", async () => {
    // Semeado pelo motor (service_role), como acontece de verdade.
    const { error: semearErr } = await admin.schema("aba_ai").from("ia_log_uso").insert([
      {
        account_id: ctx.accountId,
        modo: "rascunho",
        provedor: "anthropic",
        modelo: "claude-opus-5",
        tokens_prompt: 100,
        tokens_resposta: 50,
        tokens_total: 150,
      },
      {
        account_id: ctx.accountId,
        modo: "resposta_automatica",
        provedor: "anthropic",
        modelo: "claude-opus-5",
        tokens_prompt: 200,
        tokens_resposta: 80,
        tokens_total: 280,
      },
    ]);
    expect(semearErr).toBeNull();

    const owner = await clientAs("owner");
    const { data, error } = await owner.schema("aba_ai").rpc("resumo_uso_ia", { p_dias: 30 });
    expect(error).toBeNull();
    const resumo = (Array.isArray(data) ? data[0] : data) as Record<string, number>;
    expect(Number(resumo.chamadas)).toBe(2);
    expect(Number(resumo.tokens_total)).toBe(430);
    expect(Number(resumo.rascunhos)).toBe(1);
    expect(Number(resumo.respostas_automaticas)).toBe(1);

    // `agent` não tem SELECT em ia_log_uso (policy exige admin+). Como a
    // função é SECURITY INVOKER, ela enxerga o que o chamador enxerga —
    // zero linhas, não o consumo da conta.
    const agent = await clientAs("agent");
    const { data: dataAgent, error: erroAgent } = await agent.schema("aba_ai").rpc("resumo_uso_ia", { p_dias: 30 });
    expect(erroAgent).toBeNull();
    const resumoAgent = (Array.isArray(dataAgent) ? dataAgent[0] : dataAgent) as Record<string, number>;
    expect(Number(resumoAgent.chamadas)).toBe(0);
  });
});

describe("aba_ai — base de conhecimento e isolamento na recuperação (Subetapa 02.11)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let documentoId: string;

  beforeAll(async () => {
    ctx = await loadContext();
    const { data: doc, error } = await admin
      .schema("aba_ai")
      .from("ia_documentos_conhecimento")
      .insert({
        account_id: ctx.accountId,
        titulo: "Documento Fictício Preços 02.11",
        conteudo: "conteúdo completo",
      })
      .select("id")
      .single();
    if (error) throw error;
    documentoId = doc.id;

    const { error: trechosErr } = await admin
      .schema("aba_ai")
      .from("ia_trechos_conhecimento")
      .insert([
        {
          documento_id: documentoId,
          account_id: ctx.accountId,
          indice_trecho: 0,
          conteudo: "A limpeza de pele profunda custa 180 reais e dura 60 minutos.",
        },
        {
          documento_id: documentoId,
          account_id: ctx.accountId,
          indice_trecho: 1,
          conteudo: "O cancelamento sem cobrança precisa ser avisado com 24 horas de antecedência.",
        },
      ]);
    if (trechosErr) throw trechosErr;
  });

  afterAll(async () => {
    await admin.schema("aba_ai").from("ia_documentos_conhecimento").delete().eq("id", documentoId);
  });

  it("buscar_conhecimento_textual devolve o trecho relevante, ordenado por relevância", async () => {
    const owner = await clientAs("owner");
    const { data, error } = await owner.schema("aba_ai").rpc("buscar_conhecimento_textual", {
      p_account_id: ctx.accountId,
      p_consulta: "quanto custa a limpeza de pele",
      p_limite: 5,
    });
    expect(error).toBeNull();
    const trechos = (data ?? []) as { conteudo: string; relevancia: number }[];
    expect(trechos.length).toBeGreaterThan(0);
    expect(trechos[0].conteudo).toContain("180 reais");
    expect(trechos[0].relevancia).toBeGreaterThan(0);
  });

  it("pergunta sem correspondência devolve vazio — é o que faz o agente dizer que vai confirmar", async () => {
    const owner = await clientAs("owner");
    const { data, error } = await owner.schema("aba_ai").rpc("buscar_conhecimento_textual", {
      p_account_id: ctx.accountId,
      p_consulta: "vocês vendem bicicleta elétrica",
      p_limite: 5,
    });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("informar account_id ALHEIO não devolve a base da outra conta (SECURITY INVOKER + RLS)", async () => {
    const { data: outraConta } = await admin
      .from("accounts")
      .select("id")
      .neq("id", ctx.accountId)
      .limit(1)
      .single();
    if (!outraConta) return;

    const { data: docIntruso } = await admin
      .schema("aba_ai")
      .from("ia_documentos_conhecimento")
      .insert({ account_id: outraConta.id, titulo: "Documento Fictício Intruso 02.11", conteudo: "x" })
      .select("id")
      .single();

    await admin.schema("aba_ai").from("ia_trechos_conhecimento").insert({
      documento_id: docIntruso!.id,
      account_id: outraConta.id,
      indice_trecho: 0,
      conteudo: "Segredo comercial da outra conta: limpeza de pele por 1 real.",
    });

    const owner = await clientAs("owner");
    const { data, error } = await owner.schema("aba_ai").rpc("buscar_conhecimento_textual", {
      p_account_id: outraConta.id,
      p_consulta: "limpeza de pele",
      p_limite: 5,
    });
    // A função é SECURITY INVOKER de propósito (hardening da 01.5): a RLS
    // de ia_trechos_conhecimento filtra o chamador de verdade, então um
    // p_account_id alheio devolve conjunto vazio em vez da base do outro.
    expect(error).toBeNull();
    expect(data).toEqual([]);

    await admin.schema("aba_ai").from("ia_documentos_conhecimento").delete().eq("id", docIntruso!.id);
  });

  it("viewer lê a base de conhecimento, mas não escreve nela", async () => {
    const viewer = await clientAs("viewer");
    const { data, error } = await viewer
      .schema("aba_ai")
      .from("ia_documentos_conhecimento")
      .select("id, titulo")
      .eq("id", documentoId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    const { error: escritaErr } = await viewer
      .schema("aba_ai")
      .from("ia_documentos_conhecimento")
      .insert({ account_id: ctx.accountId, titulo: "Forjado", conteudo: "x" });
    expect(ehErroRls(escritaErr)).toBe(true);
  });
});

describe("aba_ai — aceite do termo e provedor openrouter (complemento da 02.11, migration 030)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  const VERSAO = "teste-02.11-aceite";

  beforeAll(async () => {
    ctx = await loadContext();
  });

  afterAll(async () => {
    await admin.schema("aba_ai").from("aceites_termo_ia").delete().eq("versao_termo", VERSAO);
    await admin.schema("aba_ai").from("ia_configuracoes").delete().eq("account_id", ctx.accountId);
  });

  it("'openrouter' é aceito como provedor nas duas tabelas", async () => {
    const { error } = await admin.schema("aba_ai").from("ia_configuracoes").upsert(
      {
        account_id: ctx.accountId,
        provedor: "openrouter",
        modelo: "algum/modelo",
        chave_api: "aaaa:bbbb:cccc",
        ativo: false,
      },
      { onConflict: "account_id" },
    );
    expect(error).toBeNull();

    const { error: logErr } = await admin.schema("aba_ai").from("ia_log_uso").insert({
      account_id: ctx.accountId,
      modo: "rascunho",
      provedor: "openrouter",
      modelo: "algum/modelo",
      tokens_prompt: 1,
      tokens_resposta: 1,
      tokens_total: 2,
    });
    expect(logErr).toBeNull();
    await admin.schema("aba_ai").from("ia_log_uso").delete().eq("account_id", ctx.accountId);
  });

  it("provedor fora da lista continua recusado — a ampliação não afrouxou o CHECK", async () => {
    const { error } = await admin.schema("aba_ai").from("ia_configuracoes").update({ provedor: "provedor_inventado" })
      .eq("account_id", ctx.accountId);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514");
  });

  it("owner registra o próprio aceite do termo", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner.schema("aba_ai").from("aceites_termo_ia").insert({
      account_id: ctx.accountId,
      usuario_id: ctx.userIds.owner,
      versao_termo: VERSAO,
    });
    expect(error).toBeNull();

    const { data } = await owner
      .schema("aba_ai")
      .from("aceites_termo_ia")
      .select("versao_termo, usuario_id")
      .eq("versao_termo", VERSAO)
      .single();
    expect(data!.usuario_id).toBe(ctx.userIds.owner);
  });

  it("NINGUÉM aceita em nome de outro — a policy exige usuario_id = auth.uid()", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner.schema("aba_ai").from("aceites_termo_ia").insert({
      account_id: ctx.accountId,
      // Tentando registrar o aceite do agent usando a sessão do owner:
      // um aceite que um terceiro pudesse inserir não provaria ciência
      // de ninguém.
      usuario_id: ctx.userIds.agent,
      versao_termo: VERSAO,
    });
    expect(ehErroRls(error)).toBe(true);
  });

  it("aceite NÃO se edita nem se apaga — sem policy de UPDATE/DELETE para ninguém", async () => {
    const owner = await clientAs("owner");

    const { error: updateErr } = await owner
      .schema("aba_ai")
      .from("aceites_termo_ia")
      .update({ versao_termo: "versao-forjada" })
      .eq("versao_termo", VERSAO);
    // Sem policy de UPDATE: a linha é filtrada, nada muda.
    expect(updateErr).toBeNull();
    const { data: depoisUpdate } = await admin
      .schema("aba_ai")
      .from("aceites_termo_ia")
      .select("versao_termo")
      .eq("versao_termo", VERSAO);
    expect(depoisUpdate).toHaveLength(1);

    await owner.schema("aba_ai").from("aceites_termo_ia").delete().eq("versao_termo", VERSAO);
    const { data: depoisDelete } = await admin
      .schema("aba_ai")
      .from("aceites_termo_ia")
      .select("versao_termo")
      .eq("versao_termo", VERSAO);
    // Continua lá: aceite que se apaga não é prova.
    expect(depoisDelete).toHaveLength(1);
  });

  it("agent não registra aceite — configurar IA exige admin+, e quem não configura não aceita", async () => {
    const agent = await clientAs("agent");
    const { error } = await agent.schema("aba_ai").from("aceites_termo_ia").insert({
      account_id: ctx.accountId,
      usuario_id: ctx.userIds.agent,
      versao_termo: VERSAO,
    });
    expect(ehErroRls(error)).toBe(true);
  });
});
