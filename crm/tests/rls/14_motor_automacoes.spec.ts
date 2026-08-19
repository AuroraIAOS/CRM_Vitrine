import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, clientAs, ehErroRls, loadContext, type TestContext } from "./helpers";

/**
 * Motor de automações e agendador (Subetapa 02.10, migrations 026/027).
 *
 * O que estes testes existem para provar não é a RLS das tabelas — isso já
 * é da suíte `07_aba_automations`. É o **caminho que ignora a RLS**: todas
 * as funções do motor são `SECURITY DEFINER`, executadas como `postgres`,
 * onde nenhuma política participa. A fronteira entre inquilinos ali é
 * escrita à mão, e é exatamente por isso que precisa de teste próprio —
 * foi essa classe de caminho que produziu o achado A06 da Subetapa 01.8
 * (webhook cruzando conta).
 */
describe("aba_automations — motor de execução (Subetapa 02.10)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let automacaoId: string;
  let pessoaId: string;

  beforeAll(async () => {
    ctx = await loadContext();

    const { data: automacao, error } = await admin
      .schema("aba_automations")
      .from("automacoes")
      .insert({
        account_id: ctx.accountId,
        nome: "Automação Fictícia Motor 02.10",
        tipo_gatilho: "manual",
        ativo: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    automacaoId = automacao.id;

    const { data: pessoa, error: pessoaErr } = await admin
      .schema("aba_people")
      .from("pessoas")
      .insert({ account_id: ctx.accountId, nome_exibicao: "Pessoa Fictícia Motor 02.10" })
      .select("id")
      .single();
    if (pessoaErr) throw pessoaErr;
    pessoaId = pessoa.id;

    // Duas etapas de raiz: uma que o motor executa de verdade, outra que
    // ele registra sem executar (dependência de canal, Subetapa 02.5).
    const { error: etapasErr } = await admin
      .schema("aba_automations")
      .from("automacao_etapas")
      .insert([
        { automacao_id: automacaoId, tipo_etapa: "definir_tag", config_etapa: { tag: "Motor 02.10" }, posicao: 0 },
        { automacao_id: automacaoId, tipo_etapa: "enviar_whatsapp", config_etapa: { modelo: "teste" }, posicao: 1 },
      ]);
    if (etapasErr) throw etapasErr;
  });

  afterAll(async () => {
    await admin.schema("aba_automations").from("automacao_execucoes_pendentes").delete().eq("automacao_id", automacaoId);
    await admin.schema("aba_automations").from("automacao_logs").delete().eq("automacao_id", automacaoId);
    await admin.schema("aba_automations").from("automacao_etapas").delete().eq("automacao_id", automacaoId);
    await admin.schema("aba_automations").from("automacoes").delete().eq("id", automacaoId);
    await admin.schema("aba_people").from("pessoa_tags").delete().eq("pessoa_id", pessoaId);
    await admin.schema("aba_people").from("pessoas").delete().eq("id", pessoaId);
    await admin.schema("aba_people").from("tags").delete().eq("nome", "Motor 02.10");
    await admin.from("notifications").delete().eq("type", "automation");
  });

  it("executar_automacao roda as etapas e grava o rastro em automacao_logs", async () => {
    const owner = await clientAs("owner");
    const { data: logId, error } = await owner.schema("aba_automations").rpc("executar_automacao", {
      p_automacao_id: automacaoId,
      p_pessoa_id: pessoaId,
      p_evento_gatilho: "manual",
      p_contexto: {},
    });
    expect(error).toBeNull();
    expect(logId).toBeTruthy();

    const { data: log } = await admin
      .schema("aba_automations")
      .from("automacao_logs")
      .select("status, etapas_executadas")
      .eq("id", logId as string)
      .single();

    expect(log!.status).toBe("sucesso");
    const etapas = log!.etapas_executadas as { tipo_etapa: string; resultado: string }[];
    expect(etapas).toHaveLength(2);
    expect(etapas[0]).toMatchObject({ tipo_etapa: "definir_tag", resultado: "executado" });
    // Honestidade do motor: o envio por canal é REGISTRADO, não executado
    // — declarar 'executado' aqui seria mentir no log de auditoria.
    expect(etapas[1]).toMatchObject({ tipo_etapa: "enviar_whatsapp", resultado: "nao_executado" });
  });

  it("definir_tag executou de verdade — a tag existe e está anexada à pessoa", async () => {
    const { data: tag } = await admin
      .schema("aba_people")
      .from("tags")
      .select("id")
      .eq("account_id", ctx.accountId)
      .eq("nome", "Motor 02.10")
      .single();
    expect(tag).toBeTruthy();

    const { count } = await admin
      .schema("aba_people")
      .from("pessoa_tags")
      .select("tag_id", { count: "exact", head: true })
      .eq("pessoa_id", pessoaId)
      .eq("tag_id", tag!.id);
    expect(count).toBe(1);
  });

  it("passo 'esperar' interrompe o percurso e deixa linha na fila, com log 'parcial'", async () => {
    const { data: automacaoEspera, error: criarErr } = await admin
      .schema("aba_automations")
      .from("automacoes")
      .insert({ account_id: ctx.accountId, nome: "Automação Fictícia Espera 02.10", tipo_gatilho: "manual", ativo: true })
      .select("id")
      .single();
    expect(criarErr).toBeNull();

    await admin
      .schema("aba_automations")
      .from("automacao_etapas")
      .insert([
        { automacao_id: automacaoEspera!.id, tipo_etapa: "esperar", config_etapa: { minutos: "30" }, posicao: 0 },
        { automacao_id: automacaoEspera!.id, tipo_etapa: "notificar_equipe", config_etapa: {}, posicao: 1 },
      ]);

    const owner = await clientAs("owner");
    const { data: logId, error } = await owner.schema("aba_automations").rpc("executar_automacao", {
      p_automacao_id: automacaoEspera!.id,
      p_pessoa_id: null,
      p_evento_gatilho: "manual",
      p_contexto: {},
    });
    expect(error).toBeNull();

    const { data: log } = await admin
      .schema("aba_automations")
      .from("automacao_logs")
      .select("status")
      .eq("id", logId as string)
      .single();
    // 'parcial', não 'sucesso': a execução não terminou, está na fila.
    expect(log!.status).toBe("parcial");

    const { count } = await admin
      .schema("aba_automations")
      .from("automacao_execucoes_pendentes")
      .select("id", { count: "exact", head: true })
      .eq("automacao_id", automacaoEspera!.id)
      .eq("status", "pendente");
    expect(count).toBe(1);

    await admin.schema("aba_automations").from("automacao_execucoes_pendentes").delete().eq("automacao_id", automacaoEspera!.id);
    await admin.schema("aba_automations").from("automacao_logs").delete().eq("automacao_id", automacaoEspera!.id);
    await admin.schema("aba_automations").from("automacao_etapas").delete().eq("automacao_id", automacaoEspera!.id);
    await admin.schema("aba_automations").from("automacoes").delete().eq("id", automacaoEspera!.id);
  });

  it("automacao_logs continua SÓ LEITURA para o usuário final (hardening da 01.5)", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner.schema("aba_automations").from("automacao_logs").insert({
      automacao_id: automacaoId,
      account_id: ctx.accountId,
      evento_gatilho: "forjado",
      status: "sucesso",
    });
    // O log de auditoria do motor não é editável por quem ele audita.
    expect(ehErroRls(error)).toBe(true);
  });

  it("viewer não executa automação — executar_automacao exige agent+ e access.can", async () => {
    const viewer = await clientAs("viewer");
    const { error } = await viewer.schema("aba_automations").rpc("executar_automacao", {
      p_automacao_id: automacaoId,
      p_pessoa_id: null,
      p_evento_gatilho: "manual",
      p_contexto: {},
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("drenar_execucoes_pendentes NÃO é executável pelo usuário final — é job de servidor", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner.schema("aba_automations").rpc("drenar_execucoes_pendentes", { p_lote: 10 });
    expect(error).not.toBeNull();
  });
});

describe("aba_automations — observabilidade do agendador (migration 027)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await loadContext();
  });

  it("listar_jobs_agendados devolve os jobs para admin+", async () => {
    const admin_ = await clientAs("admin");
    const { data, error } = await admin_.schema("aba_automations").rpc("listar_jobs_agendados");
    expect(error).toBeNull();
    const nomes = ((data ?? []) as { jobname: string }[]).map((j) => j.jobname);
    // Os cinco jobs da Subetapa 02.10 — as quatro rotinas que existiam sem
    // agendador desde a Etapa 01, mais a expiração de fluxo ocioso.
    expect(nomes).toEqual(
      expect.arrayContaining([
        "drenar-execucoes-pendentes",
        "disparar-lembretes-vencidos",
        "expirar-fluxos-ociosos",
        "marcar-faturas-vencidas",
        "expirar-planos",
      ]),
    );
  });

  it("agent NÃO enxerga o agendador — conjunto vazio, não erro (falha fechada)", async () => {
    const agent = await clientAs("agent");
    const { data, error } = await agent.schema("aba_automations").rpc("listar_jobs_agendados");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("o schema cron NÃO é exposto à API — o navegador não alcança cron.job nem cron.schedule", async () => {
    const owner = await clientAs("owner");
    // Se `cron` estivesse exposto, um usuário autenticado poderia agendar
    // SQL arbitrário rodando como postgres. Tem que falhar.
    const { error } = await owner.schema("cron").from("job").select("jobid");
    expect(error).not.toBeNull();
  });

  it("listar_execucoes_pendentes só devolve a fila da própria conta (fronteira reafirmada à mão)", async () => {
    const admin = adminClient();

    // Fila semeada numa conta ALHEIA — a de outro owner que existe no
    // projeto. Se a função não filtrasse por account_id, esta linha
    // apareceria para o usuário de teste.
    const { data: outraConta } = await admin
      .from("accounts")
      .select("id")
      .neq("id", ctx.accountId)
      .limit(1)
      .single();

    let idIntruso: string | undefined;
    if (outraConta) {
      const { data: automacaoIntrusa } = await admin
        .schema("aba_automations")
        .from("automacoes")
        .insert({ account_id: outraConta.id, nome: "Automação Fictícia Intrusa 02.10", tipo_gatilho: "manual" })
        .select("id")
        .single();

      if (automacaoIntrusa) {
        const { data: pendente } = await admin
          .schema("aba_automations")
          .from("automacao_execucoes_pendentes")
          .insert({
            automacao_id: automacaoIntrusa.id,
            account_id: outraConta.id,
            proxima_posicao_etapa: 0,
            executar_em: new Date(Date.now() + 3600_000).toISOString(),
          })
          .select("id")
          .single();
        idIntruso = pendente?.id;

        const owner = await clientAs("owner");
        const { data, error } = await owner.schema("aba_automations").rpc("listar_execucoes_pendentes");
        expect(error).toBeNull();
        const ids = ((data ?? []) as { id: string }[]).map((p) => p.id);
        expect(ids).not.toContain(idIntruso);

        await admin.schema("aba_automations").from("automacao_execucoes_pendentes").delete().eq("automacao_id", automacaoIntrusa.id);
        await admin.schema("aba_automations").from("automacoes").delete().eq("id", automacaoIntrusa.id);
      }
    }
  });
});

describe("aba_automations — fluxos conversacionais (Subetapa 02.10)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let fluxoId: string;

  beforeAll(async () => {
    ctx = await loadContext();
    const { data: fluxo, error } = await admin
      .schema("aba_automations")
      .from("fluxos")
      .insert({
        account_id: ctx.accountId,
        nome: "Fluxo Fictício 02.10",
        tipo_gatilho: "manual",
        status: "rascunho",
      })
      .select("id")
      .single();
    if (error) throw error;
    fluxoId = fluxo.id;

    await admin
      .schema("aba_automations")
      .from("fluxo_nos")
      .insert([
        { fluxo_id: fluxoId, chave_no: "inicio", tipo_no: "inicio", config: { proximo: "msg" } },
        { fluxo_id: fluxoId, chave_no: "msg", tipo_no: "enviar_mensagem", config: { texto: "oi", proximo: "fim" } },
        { fluxo_id: fluxoId, chave_no: "fim", tipo_no: "fim", config: {} },
      ]);
  });

  afterAll(async () => {
    const { data: execucoes } = await admin
      .schema("aba_automations")
      .from("fluxo_execucoes")
      .select("id")
      .eq("fluxo_id", fluxoId);
    for (const e of execucoes ?? []) {
      await admin.schema("aba_automations").from("fluxo_execucao_eventos").delete().eq("fluxo_execucao_id", e.id);
    }
    await admin.schema("aba_automations").from("fluxo_execucoes").delete().eq("fluxo_id", fluxoId);
    await admin.schema("aba_automations").from("fluxo_nos").delete().eq("fluxo_id", fluxoId);
    await admin.schema("aba_automations").from("fluxos").delete().eq("id", fluxoId);
  });

  it("fluxo em rascunho NÃO dispara — ativar é decisão explícita", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner.schema("aba_automations").rpc("iniciar_fluxo", {
      p_fluxo_id: fluxoId,
      p_pessoa_id: null,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/rascunho/i);
  });

  it("fluxo ativo dispara, cria execução e deixa rastro em fluxo_execucao_eventos", async () => {
    await admin.schema("aba_automations").from("fluxos")
      .update({ no_entrada_id: "inicio", status: "ativo" }).eq("id", fluxoId);

    const owner = await clientAs("owner");
    const { data: execucaoId, error } = await owner.schema("aba_automations").rpc("iniciar_fluxo", {
      p_fluxo_id: fluxoId,
      p_pessoa_id: null,
    });
    expect(error).toBeNull();
    expect(execucaoId).toBeTruthy();

    const { data: execucao } = await admin
      .schema("aba_automations")
      .from("fluxo_execucoes")
      .select("status, no_atual_chave, account_id")
      .eq("id", execucaoId as string)
      .single();
    expect(execucao!.status).toBe("ativa");
    expect(execucao!.no_atual_chave).toBe("inicio");
    // A conta da execução é a do FLUXO, lida no banco — não um valor que
    // o chamador pudesse ter informado.
    expect(execucao!.account_id).toBe(ctx.accountId);

    const { data: eventos } = await admin
      .schema("aba_automations")
      .from("fluxo_execucao_eventos")
      .select("tipo_evento, no_chave")
      .eq("fluxo_execucao_id", execucaoId as string)
      .order("criado_em");
    expect((eventos ?? []).map((e) => e.tipo_evento)).toEqual(["iniciado", "no_visitado"]);

    // Avança dois passos: msg → fim (que encerra).
    const { data: proximo, error: avancarErr } = await owner
      .schema("aba_automations")
      .rpc("avancar_fluxo", { p_execucao_id: execucaoId as string, p_resposta: null });
    expect(avancarErr).toBeNull();
    expect(proximo).toBe("msg");

    await owner.schema("aba_automations").rpc("avancar_fluxo", { p_execucao_id: execucaoId as string, p_resposta: null });
    const { data: final } = await owner
      .schema("aba_automations")
      .rpc("avancar_fluxo", { p_execucao_id: execucaoId as string, p_resposta: null });
    expect(final).toBe("concluida");

    const { data: execucaoFinal } = await admin
      .schema("aba_automations")
      .from("fluxo_execucoes")
      .select("status, finalizado_em")
      .eq("id", execucaoId as string)
      .single();
    expect(execucaoFinal!.status).toBe("concluida");
    expect(execucaoFinal!.finalizado_em).toBeTruthy();
  });

  it("índice único garante no máximo UMA execução ativa por pessoa", async () => {
    const { data: pessoa } = await admin
      .schema("aba_people")
      .from("pessoas")
      .insert({ account_id: ctx.accountId, nome_exibicao: "Pessoa Fictícia Fluxo 02.10" })
      .select("id")
      .single();

    const owner = await clientAs("owner");
    const { data: primeira, error: e1 } = await owner
      .schema("aba_automations")
      .rpc("iniciar_fluxo", { p_fluxo_id: fluxoId, p_pessoa_id: pessoa!.id });
    expect(e1).toBeNull();

    // Segunda tentativa para a MESMA pessoa colide com
    // idx_uma_execucao_ativa_por_pessoa (23505) — é a proteção contra duas
    // entregas concorrentes do webhook abrindo dois fluxos.
    const { error: e2 } = await owner
      .schema("aba_automations")
      .rpc("iniciar_fluxo", { p_fluxo_id: fluxoId, p_pessoa_id: pessoa!.id });
    expect(e2).not.toBeNull();
    expect(e2?.code).toBe("23505");

    await admin.schema("aba_automations").from("fluxo_execucao_eventos").delete().eq("fluxo_execucao_id", primeira as string);
    await admin.schema("aba_automations").from("fluxo_execucoes").delete().eq("id", primeira as string);
    await admin.schema("aba_people").from("pessoas").delete().eq("id", pessoa!.id);
  });
});
