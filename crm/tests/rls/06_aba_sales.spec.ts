import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, clientAs, ehErroRls, loadContext, type TestContext } from "./helpers";

async function criarLeadFixture(admin: ReturnType<typeof adminClient>, accountId: string, nome: string) {
  const { data: pessoa, error: pessoaErr } = await admin
    .schema("aba_people")
    .from("pessoas")
    .insert({ account_id: accountId, nome_exibicao: nome })
    .select("id")
    .single();
  if (pessoaErr) throw pessoaErr;

  const { error: leadErr } = await admin
    .schema("aba_people")
    .from("leads")
    .insert({ id: pessoa.id, account_id: accountId, origem: "manual", status: "novo" });
  if (leadErr) throw leadErr;

  return pessoa.id as string;
}

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

async function apagarPessoa(admin: ReturnType<typeof adminClient>, pessoaId: string) {
  await admin.schema("aba_people").from("clientes").delete().eq("id", pessoaId);
  await admin.schema("aba_people").from("leads").delete().eq("id", pessoaId);
  await admin.schema("aba_people").from("pessoas").delete().eq("id", pessoaId);
}

describe("aba_sales — funil e oportunidades (Subetapa 01.5)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let leadId: string;
  let clienteId: string;
  let funilId: string;
  let etapaId: string;
  const oportunidadesCriadas: string[] = [];

  beforeAll(async () => {
    ctx = await loadContext();
    leadId = await criarLeadFixture(admin, ctx.accountId, "Lead Fictício Vendas 01.5");
    clienteId = await criarClienteFixture(admin, ctx.accountId, "Cliente Fictício Vendas 01.5");

    const { data: funil, error: funilErr } = await admin
      .schema("aba_sales")
      .from("funis")
      .insert({ account_id: ctx.accountId, nome: "Funil Fictício 01.5" })
      .select("id")
      .single();
    if (funilErr) throw funilErr;
    funilId = funil.id;

    const { data: etapa, error: etapaErr } = await admin
      .schema("aba_sales")
      .from("etapas_funil")
      .insert({ funil_id: funilId, nome: "Novo contato", ordem: 0 })
      .select("id")
      .single();
    if (etapaErr) throw etapaErr;
    etapaId = etapa.id;
  });

  afterAll(async () => {
    for (const id of oportunidadesCriadas) {
      await admin.schema("aba_sales").from("oportunidades").delete().eq("id", id);
    }
    await admin.schema("aba_sales").from("etapas_funil").delete().eq("id", etapaId);
    await admin.schema("aba_sales").from("funis").delete().eq("id", funilId);
    await apagarPessoa(admin, leadId);
    await apagarPessoa(admin, clienteId);
  });

  it("viewer não cria oportunidade (42501)", async () => {
    const client = await clientAs("viewer");
    const { error } = await client.schema("aba_sales").from("oportunidades").insert({
      account_id: ctx.accountId,
      funil_id: funilId,
      etapa_id: etapaId,
      pessoa_id: leadId,
      titulo: "Não deveria existir",
    });
    expect(ehErroRls(error)).toBe(true);
  });

  it("EVIDÊNCIA 01.5: agent cria oportunidade ligada a lead não convertido, e outra ligada a cliente já ativo — ambas funcionando", async () => {
    const client = await clientAs("agent");

    const { data: oportunidadeLead, error: erroLead } = await client
      .schema("aba_sales")
      .from("oportunidades")
      .insert({
        account_id: ctx.accountId,
        funil_id: funilId,
        etapa_id: etapaId,
        pessoa_id: leadId,
        titulo: "Oportunidade sobre lead não convertido",
        valor: 500,
      })
      .select("id, pessoa_id")
      .single();
    expect(erroLead).toBeNull();
    expect(oportunidadeLead?.pessoa_id).toBe(leadId);
    oportunidadesCriadas.push(oportunidadeLead!.id);

    const { data: oportunidadeCliente, error: erroCliente } = await client
      .schema("aba_sales")
      .from("oportunidades")
      .insert({
        account_id: ctx.accountId,
        funil_id: funilId,
        etapa_id: etapaId,
        pessoa_id: clienteId,
        titulo: "Oportunidade sobre cliente já ativo",
        valor: 1200,
      })
      .select("id, pessoa_id")
      .single();
    expect(erroCliente).toBeNull();
    expect(oportunidadeCliente?.pessoa_id).toBe(clienteId);
    oportunidadesCriadas.push(oportunidadeCliente!.id);

    // Confirma que ambas continuam legíveis e ligadas à mesma pessoa —
    // "pessoa_id, nunca contact_id" (Qualidade da Subetapa 01.5).
    const { data: pessoaDoLead } = await admin
      .schema("aba_people")
      .from("leads")
      .select("status")
      .eq("id", leadId)
      .single();
    expect(pessoaDoLead?.status).toBe("novo"); // lead segue não convertido

    const { data: pessoaDoCliente } = await admin
      .schema("aba_people")
      .from("clientes")
      .select("status")
      .eq("id", clienteId)
      .single();
    expect(pessoaDoCliente?.status).toBe("ativo");
  });

  it("viewer lê as oportunidades criadas", async () => {
    const client = await clientAs("viewer");
    const { data, error } = await client
      .schema("aba_sales")
      .from("oportunidades")
      .select("id")
      .in("id", oportunidadesCriadas);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  it("agent move oportunidade de etapa (kanban)", async () => {
    const { data: novaEtapa, error: novaEtapaErr } = await admin
      .schema("aba_sales")
      .from("etapas_funil")
      .insert({ funil_id: funilId, nome: "Proposta enviada", ordem: 1 })
      .select("id")
      .single();
    expect(novaEtapaErr).toBeNull();

    const client = await clientAs("agent");
    const { data, error } = await client
      .schema("aba_sales")
      .from("oportunidades")
      .update({ etapa_id: novaEtapa!.id })
      .eq("id", oportunidadesCriadas[0])
      .select("etapa_id");
    expect(error).toBeNull();
    expect(data?.[0].etapa_id).toBe(novaEtapa!.id);

    await admin.schema("aba_sales").from("etapas_funil").delete().eq("id", novaEtapa!.id);
  });
});
