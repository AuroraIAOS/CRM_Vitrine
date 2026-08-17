import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, clientAs, ehErroRls, loadContext, type TestContext } from "./helpers";

describe("aba_automations — automações, RLS e fila server-only (Subetapa 01.5)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let automacaoId: string;
  let logId: string;

  beforeAll(async () => {
    ctx = await loadContext();
    const { data: automacao, error } = await admin
      .schema("aba_automations")
      .from("automacoes")
      .insert({ account_id: ctx.accountId, nome: "Automação Fictícia 01.5", tipo_gatilho: "lead_criado" })
      .select("id")
      .single();
    if (error) throw error;
    automacaoId = automacao.id;

    const { data: log, error: logErr } = await admin
      .schema("aba_automations")
      .from("automacao_logs")
      .insert({
        automacao_id: automacaoId,
        account_id: ctx.accountId,
        evento_gatilho: "lead_criado",
        status: "sucesso",
      })
      .select("id")
      .single();
    if (logErr) throw logErr;
    logId = log.id;
  });

  afterAll(async () => {
    await admin.schema("aba_automations").from("automacao_logs").delete().eq("id", logId);
    await admin.schema("aba_automations").from("automacoes").delete().eq("id", automacaoId);
  });

  it("viewer não cria automação (42501)", async () => {
    const client = await clientAs("viewer");
    const { error } = await client
      .schema("aba_automations")
      .from("automacoes")
      .insert({ account_id: ctx.accountId, nome: "Não deveria existir", tipo_gatilho: "manual" });
    expect(ehErroRls(error)).toBe(true);
  });

  it("agent cria automação e uma etapa com ramo condicional", async () => {
    const client = await clientAs("agent");
    const { data: nova, error } = await client
      .schema("aba_automations")
      .from("automacoes")
      .insert({ account_id: ctx.accountId, nome: "Automação Criada Por Agent", tipo_gatilho: "manual" })
      .select("id")
      .single();
    expect(error).toBeNull();

    const { data: condicao, error: condErr } = await client
      .schema("aba_automations")
      .from("automacao_etapas")
      .insert({ automacao_id: nova!.id, tipo_etapa: "condicao", posicao: 0 })
      .select("id")
      .single();
    expect(condErr).toBeNull();

    const { error: ramoErr } = await client.schema("aba_automations").from("automacao_etapas").insert({
      automacao_id: nova!.id,
      etapa_pai_id: condicao!.id,
      ramo: "sim",
      tipo_etapa: "enviar_mensagem",
      posicao: 0,
    });
    expect(ramoErr).toBeNull();

    await admin.schema("aba_automations").from("automacao_etapas").delete().eq("automacao_id", nova!.id);
    await admin.schema("aba_automations").from("automacoes").delete().eq("id", nova!.id);
  });

  it("automacao_logs: agent lê, mas não cria/edita/apaga (log é do motor, service_role)", async () => {
    const client = await clientAs("agent");

    const leitura = await client.schema("aba_automations").from("automacao_logs").select("id").eq("id", logId);
    expect(leitura.error).toBeNull();
    expect(leitura.data).toHaveLength(1);

    const { error: insertErr } = await client.schema("aba_automations").from("automacao_logs").insert({
      automacao_id: automacaoId,
      account_id: ctx.accountId,
      evento_gatilho: "manual",
      status: "sucesso",
    });
    expect(ehErroRls(insertErr)).toBe(true);

    const { data: apagados, error: deleteErr } = await client
      .schema("aba_automations")
      .from("automacao_logs")
      .delete()
      .eq("id", logId)
      .select("id");
    expect(deleteErr).toBeNull();
    expect(apagados).toEqual([]); // RLS filtra a linha, delete afeta zero — log continua íntegro

    const { data: aindaExiste } = await admin
      .schema("aba_automations")
      .from("automacao_logs")
      .select("id")
      .eq("id", logId);
    expect(aindaExiste).toHaveLength(1);
  });

  it("automacao_execucoes_pendentes: sem nenhuma policy — authenticated não enxerga nem linha própria (server-only)", async () => {
    const { data: pendente, error: pendErr } = await admin
      .schema("aba_automations")
      .from("automacao_execucoes_pendentes")
      .insert({
        automacao_id: automacaoId,
        account_id: ctx.accountId,
        proxima_posicao_etapa: 0,
        executar_em: new Date().toISOString(),
      })
      .select("id")
      .single();
    expect(pendErr).toBeNull();

    const client = await clientAs("owner"); // até owner é bloqueado — não é gate por papel, é ausência total de policy
    const { data } = await client
      .schema("aba_automations")
      .from("automacao_execucoes_pendentes")
      .select("id")
      .eq("id", pendente!.id);
    expect(data).toEqual([]);

    await admin.schema("aba_automations").from("automacao_execucoes_pendentes").delete().eq("id", pendente!.id);
  });
});

describe("aba_automations — fluxos conversacionais (Subetapa 01.5)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let fluxoId: string;

  beforeAll(async () => {
    ctx = await loadContext();
    const { data: fluxo, error } = await admin
      .schema("aba_automations")
      .from("fluxos")
      .insert({ account_id: ctx.accountId, nome: "Fluxo Fictício 01.5", tipo_gatilho: "manual" })
      .select("id")
      .single();
    if (error) throw error;
    fluxoId = fluxo.id;
  });

  afterAll(async () => {
    await admin.schema("aba_automations").from("fluxo_nos").delete().eq("fluxo_id", fluxoId);
    await admin.schema("aba_automations").from("fluxos").delete().eq("id", fluxoId);
  });

  it("agent cria nó de fluxo; chave duplicada no mesmo fluxo é recusada (23505)", async () => {
    const client = await clientAs("agent");
    const { error: primeiroErr } = await client.schema("aba_automations").from("fluxo_nos").insert({
      fluxo_id: fluxoId,
      chave_no: "inicio",
      tipo_no: "inicio",
    });
    expect(primeiroErr).toBeNull();

    const { error: duplicadoErr } = await client.schema("aba_automations").from("fluxo_nos").insert({
      fluxo_id: fluxoId,
      chave_no: "inicio",
      tipo_no: "enviar_mensagem",
    });
    expect(duplicadoErr).not.toBeNull();
    expect(duplicadoErr?.code).toBe("23505");
  });

  it("no máximo uma fluxo_execucoes ATIVA por pessoa (23505) — agent só lê, nunca escreve", async () => {
    const { data: pessoa, error: pessoaErr } = await admin
      .schema("aba_people")
      .from("pessoas")
      .insert({ account_id: ctx.accountId, nome_exibicao: "Pessoa Fictícia Fluxo 01.5" })
      .select("id")
      .single();
    expect(pessoaErr).toBeNull();

    const { data: primeira, error: primeiraErr } = await admin
      .schema("aba_automations")
      .from("fluxo_execucoes")
      .insert({ fluxo_id: fluxoId, account_id: ctx.accountId, pessoa_id: pessoa!.id, status: "ativa" })
      .select("id")
      .single();
    expect(primeiraErr).toBeNull();

    const { error: segundaErr } = await admin
      .schema("aba_automations")
      .from("fluxo_execucoes")
      .insert({ fluxo_id: fluxoId, account_id: ctx.accountId, pessoa_id: pessoa!.id, status: "ativa" });
    expect(segundaErr).not.toBeNull();
    expect(segundaErr?.code).toBe("23505");

    const client = await clientAs("agent");
    const leitura = await client.schema("aba_automations").from("fluxo_execucoes").select("id").eq("id", primeira!.id);
    expect(leitura.error).toBeNull();
    expect(leitura.data).toHaveLength(1);

    const { error: escritaErr } = await client
      .schema("aba_automations")
      .from("fluxo_execucoes")
      .update({ status: "concluida" })
      .eq("id", primeira!.id)
      .select("id");
    expect(escritaErr).toBeNull(); // RLS filtra silenciosamente (sem policy de UPDATE), não gera erro
    const { data: statusInalterado } = await admin
      .schema("aba_automations")
      .from("fluxo_execucoes")
      .select("status")
      .eq("id", primeira!.id)
      .single();
    expect(statusInalterado?.status).toBe("ativa");

    await admin.schema("aba_automations").from("fluxo_execucoes").delete().eq("id", primeira!.id);
    await admin.schema("aba_people").from("pessoas").delete().eq("id", pessoa!.id);
  });
});
