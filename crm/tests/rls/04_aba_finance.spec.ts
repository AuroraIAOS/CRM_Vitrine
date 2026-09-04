import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, clientAs, ehErroRls, loadContext, type TestContext } from "./helpers";

async function criarClienteFixture(admin: ReturnType<typeof adminClient>, accountId: string, nome: string) {
  const { data: pessoa, error: pessoaErr } = await admin
    .schema("aba_people")
    .from("pessoas")
    .insert({ account_id: accountId, nome_exibicao: nome })
    .select("id")
    .single();
  if (pessoaErr) throw pessoaErr;

  const { error: clienteErr } = await admin
    .schema("aba_people")
    .from("clientes")
    .insert({ id: pessoa.id, account_id: accountId, razao_social: nome, status: "ativo" });
  if (clienteErr) throw clienteErr;

  return pessoa.id as string;
}

async function apagarCliente(admin: ReturnType<typeof adminClient>, clienteId: string) {
  await admin.schema("aba_people").from("clientes").delete().eq("id", clienteId);
  await admin.schema("aba_people").from("pessoas").delete().eq("id", clienteId);
}

/** Plano de catálogo com um item — o mínimo que finance.vender_pacote() exige. */
async function criarPlanoFixture(admin: ReturnType<typeof adminClient>, accountId: string) {
  const { data: categoria, error: catErr } = await admin
    .schema("aba_catalog")
    .from("categorias")
    .insert({ account_id: accountId, nome: "Categoria Fictícia 01.3 Finance" })
    .select("id")
    .single();
  if (catErr) throw catErr;

  const { data: servico, error: servErr } = await admin
    .schema("aba_catalog")
    .from("procedimentos")
    .insert({ account_id: accountId, categoria_id: categoria.id, nome: "Serviço Fictício 01.3 Finance" })
    .select("id")
    .single();
  if (servErr) throw servErr;

  const { data: plano, error: planoErr } = await admin
    .schema("aba_catalog")
    .from("pacotes")
    .insert({ account_id: accountId, nome: "Plano Fictício 01.3", preco_total: 500 })
    .select("id")
    .single();
  if (planoErr) throw planoErr;

  const { error: itemErr } = await admin
    .schema("aba_catalog")
    .from("itens_pacote")
    .insert({ account_id: accountId, pacote_id: plano.id, procedimento_id: servico.id, sessoes_incluidas: 5 });
  if (itemErr) throw itemErr;

  return { categoriaId: categoria.id as string, procedimentoId: servico.id as string, pacoteId: plano.id as string };
}

async function apagarPlanoFixture(admin: ReturnType<typeof adminClient>, categoriaId: string, procedimentoId: string, pacoteId: string) {
  await admin.schema("aba_catalog").from("itens_pacote").delete().eq("pacote_id", pacoteId);
  await admin.schema("aba_catalog").from("pacotes").delete().eq("id", pacoteId);
  await admin.schema("aba_catalog").from("procedimentos").delete().eq("id", procedimentoId);
  await admin.schema("aba_catalog").from("categorias").delete().eq("id", categoriaId);
}

describe("aba_finance — cadeia contrato → cliente → pessoa e RLS (Subetapa 01.3)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let clienteId: string;
  let contratoId: string;

  beforeAll(async () => {
    ctx = await loadContext();
    clienteId = await criarClienteFixture(admin, ctx.accountId, "Cliente Fictício Finance 01.3");

    const { data: contrato, error } = await admin
      .schema("aba_finance")
      .from("contratos")
      .insert({ account_id: ctx.accountId, cliente_id: clienteId, descricao: "Contrato Fictício 01.3", valor: 1000 })
      .select("id")
      .single();
    if (error) throw error;
    contratoId = contrato.id;
  });

  afterAll(async () => {
    await admin.schema("aba_finance").from("contratos").delete().eq("id", contratoId);
    await apagarCliente(admin, clienteId);
  });

  it("evidência da 01.3: contratos → clientes → pessoas retorna a cadeia completa", async () => {
    const { data: contrato, error: contratoErr } = await admin
      .schema("aba_finance")
      .from("contratos")
      .select("id, valor, moeda, cliente_id")
      .eq("id", contratoId)
      .single();
    expect(contratoErr).toBeNull();
    expect(contrato?.cliente_id).toBe(clienteId);
    // moeda nasce BRL por padrão (equivalente Vitrine da migration 078 do Maximus — ver 010_aba_finance.sql).
    expect(contrato?.moeda).toBe("BRL");

    const { data: cliente, error: clienteErr } = await admin
      .schema("aba_people")
      .from("clientes")
      .select("id, razao_social")
      .eq("id", contrato!.cliente_id)
      .single();
    expect(clienteErr).toBeNull();
    expect(cliente?.id).toBe(clienteId);

    const { data: pessoa, error: pessoaErr } = await admin
      .schema("aba_people")
      .from("pessoas")
      .select("id, nome_exibicao")
      .eq("id", cliente!.id)
      .single();
    expect(pessoaErr).toBeNull();
    expect(pessoa?.id).toBe(clienteId);
    expect(pessoa?.nome_exibicao).toBe("Cliente Fictício Finance 01.3");
  });

  it("viewer lê o contrato, mas não cria (RLS)", async () => {
    const viewer = await clientAs("viewer");
    const leitura = await viewer.schema("aba_finance").from("contratos").select("id").eq("id", contratoId);
    expect(leitura.error).toBeNull();
    expect(leitura.data).toHaveLength(1);

    const { error } = await viewer
      .schema("aba_finance")
      .from("contratos")
      .insert({ account_id: ctx.accountId, cliente_id: clienteId, valor: 1 });
    expect(ehErroRls(error)).toBe(true);
  });
});

describe("aba_finance — vender_pacote() (Subetapa 01.3)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let clienteId: string;
  let fx: Awaited<ReturnType<typeof criarPlanoFixture>>;
  let pacoteClienteId: string | undefined;

  beforeAll(async () => {
    ctx = await loadContext();
    clienteId = await criarClienteFixture(admin, ctx.accountId, "Cliente Fictício Vender Plano 01.3");
    fx = await criarPlanoFixture(admin, ctx.accountId);
  });

  afterAll(async () => {
    if (pacoteClienteId) {
      await admin.schema("aba_finance").from("saldos_pacote").delete().eq("pacote_cliente_id", pacoteClienteId);
      await admin.schema("aba_finance").from("pacotes_cliente").delete().eq("id", pacoteClienteId);
    }
    await apagarPlanoFixture(admin, fx.categoriaId, fx.procedimentoId, fx.pacoteId);
    await apagarCliente(admin, clienteId);
  });

  it("agent vende o plano e o saldo nasce com as sessões do item", async () => {
    const client = await clientAs("agent");
    const { data, error } = await client.schema("aba_finance").rpc("vender_pacote", {
      p_cliente_id: clienteId,
      p_pacote_id: fx.pacoteId,
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    pacoteClienteId = data as string;

    const { data: saldos } = await admin
      .schema("aba_finance")
      .from("saldos_pacote")
      .select("procedimento_id, sessoes_totais, sessoes_usadas")
      .eq("pacote_cliente_id", pacoteClienteId);
    expect(saldos).toHaveLength(1);
    expect(saldos?.[0].procedimento_id).toBe(fx.procedimentoId);
    expect(saldos?.[0].sessoes_totais).toBe(5);
    expect(saldos?.[0].sessoes_usadas).toBe(0);
  });
});

describe("aba_finance — comissão restrita a admin+ (Subetapa 01.3)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let profissionalId: string;
  let regraId: string;

  beforeAll(async () => {
    ctx = await loadContext();
    const { data: prof, error } = await admin
      .schema("aba_scheduling")
      .from("profissionais")
      .insert({ account_id: ctx.accountId, nome_exibicao: "Profissional Fictício Comissão 01.3", ativo: false })
      .select("id")
      .single();
    if (error) throw error;
    profissionalId = prof.id;

    const { data: regra, error: regraErr } = await admin
      .schema("aba_finance")
      .from("regras_comissao")
      .insert({ account_id: ctx.accountId, profissional_id: profissionalId, percentual: 10 })
      .select("id")
      .single();
    if (regraErr) throw regraErr;
    regraId = regra.id;
  });

  afterAll(async () => {
    await admin.schema("aba_finance").from("regras_comissao").delete().eq("id", regraId);
    await admin.schema("aba_scheduling").from("profissionais").delete().eq("id", profissionalId);
  });

  it("agent não enxerga regra de comissão (RLS filtra — política exige admin+)", async () => {
    const client = await clientAs("agent");
    const { data, error } = await client.schema("aba_finance").from("regras_comissao").select("id").eq("id", regraId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("admin enxerga a regra de comissão", async () => {
    const client = await clientAs("admin");
    const { data, error } = await client.schema("aba_finance").from("regras_comissao").select("id").eq("id", regraId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});
