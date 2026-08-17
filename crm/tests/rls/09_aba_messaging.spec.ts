import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, clientAs, ehErroRls, loadContext, type TestContext } from "./helpers";

describe("aba_messaging — contatos, conversas e mensagens (Subetapa 01.6)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let contatoId: string;
  let conversaId: string;
  let mensagemId: string;

  beforeAll(async () => {
    ctx = await loadContext();

    const { data: contato, error: contatoErr } = await admin
      .schema("aba_messaging")
      .from("contatos_canal")
      .insert({ account_id: ctx.accountId, telefone: "5511988880001", nome: "Contato Fictício 01.6" })
      .select("id")
      .single();
    if (contatoErr) throw contatoErr;
    contatoId = contato.id;

    const { data: conversa, error: conversaErr } = await admin
      .schema("aba_messaging")
      .from("conversas")
      .insert({ account_id: ctx.accountId, contato_id: contatoId })
      .select("id")
      .single();
    if (conversaErr) throw conversaErr;
    conversaId = conversa.id;

    const { data: mensagem, error: mensagemErr } = await admin
      .schema("aba_messaging")
      .from("mensagens")
      .insert({
        conversa_id: conversaId,
        account_id: ctx.accountId,
        tipo_remetente: "cliente",
        conteudo_texto: "Mensagem fictícia 01.6",
      })
      .select("id")
      .single();
    if (mensagemErr) throw mensagemErr;
    mensagemId = mensagem.id;
  });

  afterAll(async () => {
    await admin.schema("aba_messaging").from("mensagens").delete().eq("conversa_id", conversaId);
    await admin.schema("aba_messaging").from("conversas").delete().eq("id", conversaId);
    await admin.schema("aba_messaging").from("contatos_canal").delete().eq("id", contatoId);
  });

  it("viewer lê contato, conversa e mensagem", async () => {
    const client = await clientAs("viewer");

    const c = await client.schema("aba_messaging").from("contatos_canal").select("id").eq("id", contatoId);
    expect(c.error).toBeNull();
    expect(c.data).toHaveLength(1);

    const conv = await client.schema("aba_messaging").from("conversas").select("id").eq("id", conversaId);
    expect(conv.error).toBeNull();
    expect(conv.data).toHaveLength(1);

    const m = await client.schema("aba_messaging").from("mensagens").select("id").eq("id", mensagemId);
    expect(m.error).toBeNull();
    expect(m.data).toHaveLength(1);
  });

  it("viewer não cria contato nem mensagem (42501)", async () => {
    const client = await clientAs("viewer");

    const { error: erroContato } = await client
      .schema("aba_messaging")
      .from("contatos_canal")
      .insert({ account_id: ctx.accountId, telefone: "5511988880002" });
    expect(ehErroRls(erroContato)).toBe(true);

    const { error: erroMensagem } = await client.schema("aba_messaging").from("mensagens").insert({
      conversa_id: conversaId,
      account_id: ctx.accountId,
      tipo_remetente: "agente",
      conteudo_texto: "Não deveria existir",
    });
    expect(ehErroRls(erroMensagem)).toBe(true);
  });

  it("agent envia mensagem e atualiza a conversa", async () => {
    const client = await clientAs("agent");
    const { data, error } = await client
      .schema("aba_messaging")
      .from("mensagens")
      .insert({
        conversa_id: conversaId,
        account_id: ctx.accountId,
        tipo_remetente: "agente",
        conteudo_texto: "Resposta do agent",
      })
      .select("id")
      .single();
    expect(error).toBeNull();

    await admin.schema("aba_messaging").from("mensagens").delete().eq("id", data!.id);
  });

  it("mesmo telefone não duplica contato_canal na mesma conta (23505)", async () => {
    const { error } = await admin
      .schema("aba_messaging")
      .from("contatos_canal")
      .insert({ account_id: ctx.accountId, telefone: "5511988880001" }); // mesmo telefone do fixture
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23505");
  });
});

describe("aba_messaging — reações restritas ao próprio ator (Subetapa 01.6)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let contatoId: string;
  let conversaId: string;
  let mensagemId: string;

  beforeAll(async () => {
    ctx = await loadContext();
    const { data: contato } = await admin
      .schema("aba_messaging")
      .from("contatos_canal")
      .insert({ account_id: ctx.accountId, telefone: "5511988880003" })
      .select("id")
      .single();
    contatoId = contato!.id;

    const { data: conversa } = await admin
      .schema("aba_messaging")
      .from("conversas")
      .insert({ account_id: ctx.accountId, contato_id: contatoId })
      .select("id")
      .single();
    conversaId = conversa!.id;

    const { data: mensagem } = await admin
      .schema("aba_messaging")
      .from("mensagens")
      .insert({ conversa_id: conversaId, account_id: ctx.accountId, tipo_remetente: "cliente", conteudo_texto: "Oi" })
      .select("id")
      .single();
    mensagemId = mensagem!.id;
  });

  afterAll(async () => {
    await admin.schema("aba_messaging").from("reacoes_mensagem").delete().eq("conversa_id", conversaId);
    await admin.schema("aba_messaging").from("mensagens").delete().eq("conversa_id", conversaId);
    await admin.schema("aba_messaging").from("conversas").delete().eq("id", conversaId);
    await admin.schema("aba_messaging").from("contatos_canal").delete().eq("id", contatoId);
  });

  it("agent reage à própria mensagem e não consegue apagar a reação de outro ator", async () => {
    const agent = await clientAs("agent");
    const { data: reacaoAgent, error: erroInsert } = await agent
      .schema("aba_messaging")
      .from("reacoes_mensagem")
      .insert({
        mensagem_id: mensagemId,
        conversa_id: conversaId,
        account_id: ctx.accountId,
        tipo_ator: "agente",
        ator_id: ctx.userIds.agent,
        emoji: "👍",
      })
      .select("id")
      .single();
    expect(erroInsert).toBeNull();

    // Reação "do cliente" só pode ser gravada pelo webhook (service_role).
    const { data: reacaoCliente } = await admin
      .schema("aba_messaging")
      .from("reacoes_mensagem")
      .insert({
        mensagem_id: mensagemId,
        conversa_id: conversaId,
        account_id: ctx.accountId,
        tipo_ator: "cliente",
        emoji: "❤️",
      })
      .select("id")
      .single();

    // access.can('messaging','delete') é FALSE para agent por padrão
    // (access.default_permission(), 003_core_access.sql: agent só tem
    // read/create/update de fábrica — delete exige concessão explícita
    // do owner). Habilita só para este teste, mesmo padrão de
    // 01_aba_people.spec.ts ("camada access.can() isolada").
    const owner = await clientAs("owner");
    const { error: setErr } = await owner.schema("access").rpc("set_module_permission", {
      p_role: "agent",
      p_module_key: "messaging",
      p_action: "delete",
      p_allowed: true,
    });
    expect(setErr).toBeNull();

    try {
      // agent não pode apagar a reação do cliente (tipo_ator/ator_id não batem).
      const { data: apagados } = await agent
        .schema("aba_messaging")
        .from("reacoes_mensagem")
        .delete()
        .eq("id", reacaoCliente!.id)
        .select("id");
      expect(apagados).toEqual([]);

      // agent apaga a própria reação normalmente.
      const { data: apagadosProprios, error: erroDelete } = await agent
        .schema("aba_messaging")
        .from("reacoes_mensagem")
        .delete()
        .eq("id", reacaoAgent!.id)
        .select("id");
      expect(erroDelete).toBeNull();
      expect(apagadosProprios).toHaveLength(1);
    } finally {
      await admin.schema("access").from("module_permissions").delete().match({
        account_id: ctx.accountId,
        role: "agent",
        module_key: "messaging",
        action: "delete",
      });
    }
  });
});

describe("aba_messaging — segredo de provedor e token de acesso nunca legíveis (Subetapa 01.6)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let configId: string;
  let provedorId: string;

  beforeAll(async () => {
    ctx = await loadContext();
    const { data: config, error } = await admin.schema("aba_messaging").from("configuracao_whatsapp").insert({
      account_id: ctx.accountId,
      id_numero_telefone: `teste-config-01.6-${Date.now()}`,
      token_acesso_cifrado: "placeholder-nao-e-segredo-real",
    }).select("id").single();
    if (error) throw error;
    configId = config.id;

    const { data: provedor, error: provedorErr } = await admin.schema("aba_messaging").from("provedores_canal").insert({
      account_id: ctx.accountId,
      provedor: "meta",
      token_instancia_cifrado: "placeholder",
      segredo_webhook_cifrado: "placeholder",
    }).select("id").single();
    if (provedorErr) throw provedorErr;
    provedorId = provedor.id;
  });

  afterAll(async () => {
    await admin.schema("aba_messaging").from("configuracao_whatsapp").delete().eq("id", configId);
    await admin.schema("aba_messaging").from("provedores_canal").delete().eq("id", provedorId);
  });

  it("owner não lê token_acesso_cifrado direto (privilégio de coluna, não RLS)", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner
      .schema("aba_messaging")
      .from("configuracao_whatsapp")
      .select("token_acesso_cifrado")
      .eq("id", configId);
    expect(ehErroRls(error)).toBe(true);
  });

  it("owner lê as demais colunas de configuracao_whatsapp normalmente", async () => {
    const owner = await clientAs("owner");
    const { data, error } = await owner
      .schema("aba_messaging")
      .from("configuracao_whatsapp")
      .select("id, id_numero_telefone, status")
      .eq("id", configId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("owner não lê token_instancia_cifrado nem segredo_webhook_cifrado de provedores_canal", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner
      .schema("aba_messaging")
      .from("provedores_canal")
      .select("token_instancia_cifrado, segredo_webhook_cifrado")
      .eq("id", provedorId);
    expect(ehErroRls(error)).toBe(true);
  });
});
