import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { adminClient, clientAs, ehErroRls, loadContext, type TestContext } from "./helpers";

/** Insere pessoa + lead (tabela-mãe + extensão 1:1) via service role. */
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

async function apagarPessoa(admin: ReturnType<typeof adminClient>, pessoaId: string) {
  await admin.schema("aba_people").from("clientes").delete().eq("id", pessoaId);
  await admin.schema("aba_people").from("leads").delete().eq("id", pessoaId);
  await admin.schema("aba_people").from("pessoas").delete().eq("id", pessoaId);
}

describe("aba_people — RLS por papel (Subetapa 01.2)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let leadId: string;

  beforeAll(async () => {
    ctx = await loadContext();
    leadId = await criarLeadFixture(admin, ctx.accountId, "Lead Fictício 01.2");
  });

  afterAll(async () => {
    await apagarPessoa(admin, leadId);
  });

  it("viewer lê aba_people.pessoas e aba_people.leads", async () => {
    const client = await clientAs("viewer");
    const pessoa = await client.schema("aba_people").from("pessoas").select("id").eq("id", leadId);
    expect(pessoa.error).toBeNull();
    expect(pessoa.data).toHaveLength(1);

    const lead = await client.schema("aba_people").from("leads").select("id").eq("id", leadId);
    expect(lead.error).toBeNull();
    expect(lead.data).toHaveLength(1);
  });

  it("viewer não cria pessoa (42501)", async () => {
    const client = await clientAs("viewer");
    const { error } = await client
      .schema("aba_people")
      .from("pessoas")
      .insert({ account_id: ctx.accountId, nome_exibicao: "Não deveria existir" });
    expect(ehErroRls(error)).toBe(true);
  });

  it("agent cria e atualiza lead", async () => {
    const client = await clientAs("agent");
    const { data: pessoa, error: pessoaErr } = await client
      .schema("aba_people")
      .from("pessoas")
      .insert({ account_id: ctx.accountId, nome_exibicao: "Lead Criado Por Agent" })
      .select("id")
      .single();
    expect(pessoaErr).toBeNull();
    expect(pessoa?.id).toBeTruthy();

    const { error: leadErr } = await client
      .schema("aba_people")
      .from("leads")
      .insert({ id: pessoa!.id, account_id: ctx.accountId, origem: "manual", status: "novo" });
    expect(leadErr).toBeNull();

    const { data: atualizado, error: updErr } = await client
      .schema("aba_people")
      .from("leads")
      .update({ como_encontrou: "Atualizado pelo agent" })
      .eq("id", pessoa!.id)
      .select("id");
    expect(updErr).toBeNull();
    expect(atualizado).toHaveLength(1);

    await apagarPessoa(admin, pessoa!.id);
  });

  it("viewer não atualiza lead (RLS filtra a linha, update afeta zero)", async () => {
    const client = await clientAs("viewer");
    const { data, error } = await client
      .schema("aba_people")
      .from("leads")
      .update({ como_encontrou: "Não deveria conseguir" })
      .eq("id", leadId)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  // Prova da SEGUNDA camada (access.can) além de is_account_member: um
  // viewer que é membro válido da conta, mas com o módulo 'people'
  // explicitamente desligado para o papel dele, não pode ler — mesmo
  // sendo is_account_member() verdadeiro. docs/05 §2: "role sem
  // access.can() para o módulo não lê".
  describe("camada access.can() isolada de is_account_member", () => {
    afterEach(async () => {
      await admin.schema("access").from("module_permissions").delete().match({
        account_id: ctx.accountId,
        role: "viewer",
        module_key: "people",
        action: "read",
      });
    });

    it("viewer com módulo 'people' desligado não lê pessoas, mesmo sendo membro da conta", async () => {
      const owner = await clientAs("owner");
      const { error: setErr } = await owner.schema("access").rpc("set_module_permission", {
        p_role: "viewer",
        p_module_key: "people",
        p_action: "read",
        p_allowed: false,
      });
      expect(setErr).toBeNull();

      const viewer = await clientAs("viewer");
      const { data, error } = await viewer.schema("aba_people").from("pessoas").select("id").eq("id", leadId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });
});

describe("aba_people — converter_lead() (Subetapa 01.2)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let leadId: string;
  let tagId: string;

  beforeAll(async () => {
    ctx = await loadContext();
    leadId = await criarLeadFixture(admin, ctx.accountId, "Lead Fictício Conversão");

    const { data: tag, error: tagErr } = await admin
      .schema("aba_people")
      .from("tags")
      .insert({ account_id: ctx.accountId, nome: "Tag Fixture 01.2" })
      .select("id")
      .single();
    if (tagErr) throw tagErr;
    tagId = tag.id;

    const { error: pessoaTagErr } = await admin
      .schema("aba_people")
      .from("pessoa_tags")
      .insert({ pessoa_id: leadId, tag_id: tagId });
    if (pessoaTagErr) throw pessoaTagErr;

    await admin.schema("aba_people").from("pessoa_notas").insert({
      pessoa_id: leadId,
      account_id: ctx.accountId,
      conteudo: "Nota fixture 01.2",
    });
  });

  afterAll(async () => {
    await admin.schema("aba_people").from("pessoa_notas").delete().eq("pessoa_id", leadId);
    await admin.schema("aba_people").from("pessoa_tags").delete().eq("pessoa_id", leadId);
    await apagarPessoa(admin, leadId);
    await admin.schema("aba_people").from("tags").delete().eq("id", tagId);
  });

  it("converter duas vezes produz UM cliente com o mesmo id (idempotente)", async () => {
    const client = await clientAs("agent");

    const primeira = await client.schema("aba_people").rpc("converter_lead", { p_lead_id: leadId });
    expect(primeira.error).toBeNull();
    expect(primeira.data).toBe(leadId);

    const segunda = await client.schema("aba_people").rpc("converter_lead", { p_lead_id: leadId });
    expect(segunda.error).toBeNull();
    expect(segunda.data).toBe(leadId);

    const { count } = await admin
      .schema("aba_people")
      .from("clientes")
      .select("id", { count: "exact", head: true })
      .eq("id", leadId);
    expect(count).toBe(1);
  });

  it("cliente convertido mantém o mesmo pessoa_id e as tags/notas associadas", async () => {
    const { data: cliente } = await admin
      .schema("aba_people")
      .from("clientes")
      .select("id, razao_social")
      .eq("id", leadId)
      .single();
    // id do cliente É o id da pessoa/lead original — chave compartilhada.
    expect(cliente?.id).toBe(leadId);
    expect(cliente?.razao_social).toBe("Lead Fictício Conversão");

    const { data: tags } = await admin
      .schema("aba_people")
      .from("pessoa_tags")
      .select("tag_id")
      .eq("pessoa_id", leadId);
    expect(tags).toHaveLength(1);
    expect(tags?.[0].tag_id).toBe(tagId);

    const { data: notas } = await admin
      .schema("aba_people")
      .from("pessoa_notas")
      .select("conteudo")
      .eq("pessoa_id", leadId);
    expect(notas).toHaveLength(1);
    expect(notas?.[0].conteudo).toBe("Nota fixture 01.2");

    const { data: lead } = await admin.schema("aba_people").from("leads").select("status").eq("id", leadId).single();
    expect(lead?.status).toBe("convertido");
  });

  it("viewer não converte (RLS de create em aba_people.clientes)", async () => {
    const outroId = await criarLeadFixture(admin, ctx.accountId, "Lead Fictício Viewer Não Converte");
    try {
      const client = await clientAs("viewer");
      const { error } = await client.schema("aba_people").rpc("converter_lead", { p_lead_id: outroId });
      expect(ehErroRls(error)).toBe(true);

      const { count } = await admin
        .schema("aba_people")
        .from("clientes")
        .select("id", { count: "exact", head: true })
        .eq("id", outroId);
      expect(count).toBe(0);
    } finally {
      await apagarPessoa(admin, outroId);
    }
  });

  it("lead desqualificado não é convertido", async () => {
    const recusadoId = await criarLeadFixture(admin, ctx.accountId, "Lead Fictício Desqualificado");
    await admin.schema("aba_people").from("leads").update({ status: "desqualificado" }).eq("id", recusadoId);

    try {
      const client = await clientAs("agent");
      const { error } = await client.schema("aba_people").rpc("converter_lead", { p_lead_id: recusadoId });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/desqualificado/i);
    } finally {
      await apagarPessoa(admin, recusadoId);
    }
  });
});
