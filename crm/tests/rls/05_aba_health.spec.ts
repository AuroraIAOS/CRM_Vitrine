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

/** Conta quantas linhas de log_acesso existem para (cliente, ator, ação) — usado para provar log incremental. */
async function contarLog(
  admin: ReturnType<typeof adminClient>,
  clienteId: string,
  usuarioAtorId: string,
  acao: string,
): Promise<number> {
  const { count, error } = await admin
    .schema("aba_health")
    .from("log_acesso")
    .select("id", { count: "exact", head: true })
    .eq("cliente_id", clienteId)
    .eq("usuario_ator_id", usuarioAtorId)
    .eq("acao", acao);
  if (error) throw error;
  return count ?? 0;
}

describe("aba_health — concessão nominal (negado/permitido) + log obrigatório (Subetapa 01.4)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let clienteId: string;
  let prontuarioId: string;
  let concessaoId: string | undefined;

  beforeAll(async () => {
    ctx = await loadContext();
    clienteId = await criarClienteFixture(admin, ctx.accountId, "Cliente Fictício Health 01.4");

    const { data: prontuario, error } = await admin
      .schema("aba_health")
      .from("prontuarios")
      .insert({ account_id: ctx.accountId, cliente_id: clienteId, tipo_pele: "mista" })
      .select("id")
      .single();
    if (error) throw error;
    prontuarioId = prontuario.id;
  });

  afterAll(async () => {
    if (concessaoId) {
      await admin.schema("aba_health").from("concessoes_prontuario").delete().eq("id", concessaoId);
    }
    await admin.schema("aba_health").from("log_acesso").delete().eq("cliente_id", clienteId);
    await admin.schema("aba_health").from("evolucoes").delete().eq("cliente_id", clienteId);
    await admin.schema("aba_health").from("prontuarios").delete().eq("id", prontuarioId);
    await apagarCliente(admin, clienteId);
  });

  it("CENÁRIO NEGADO: agent sem concessão e sem atributo profissional — ler_prontuario devolve vazio, sem log", async () => {
    const antes = await contarLog(admin, clienteId, ctx.userIds.agent, "leitura");

    const client = await clientAs("agent");
    const { data, error } = await client.schema("aba_health").rpc("ler_prontuario", { p_cliente_id: clienteId });
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const depois = await contarLog(admin, clienteId, ctx.userIds.agent, "leitura");
    expect(depois).toBe(antes); // nenhuma linha nova: nada foi lido, nada foi logado
  });

  it("select direto na tabela nunca devolve coluna clínica — leitura sem log é impossível (Maximus 053)", async () => {
    const client = await clientAs("viewer");
    const { error } = await client
      .schema("aba_health")
      .from("prontuarios")
      .select("medicamentos")
      .eq("id", prontuarioId);
    // 42501: privilégio de COLUNA revogado — independe da RLS, vale
    // para qualquer papel, inclusive quem passaria a política de linha.
    expect(ehErroRls(error)).toBe(true);
  });

  it("CENÁRIO PERMITIDO: concessão 'permitir' nominal libera a leitura e grava log (Subetapa 01.4, evidência)", async () => {
    const owner = await clientAs("owner");
    const { data: concessao, error: concessaoErr } = await owner
      .schema("aba_health")
      .from("concessoes_prontuario")
      .insert({
        account_id: ctx.accountId,
        usuario_concedido_id: ctx.userIds.agent,
        escopo: "cliente_unico",
        cliente_id: clienteId,
        efeito: "permitir",
        motivo: "Teste 01.4",
      })
      .select("id")
      .single();
    expect(concessaoErr).toBeNull();
    concessaoId = concessao!.id;

    const antes = await contarLog(admin, clienteId, ctx.userIds.agent, "leitura");

    const client = await clientAs("agent");
    const { data, error } = await client.schema("aba_health").rpc("ler_prontuario", { p_cliente_id: clienteId });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(prontuarioId);
    expect(data![0].tipo_pele).toBe("mista");

    const depois = await contarLog(admin, clienteId, ctx.userIds.agent, "leitura");
    expect(depois).toBe(antes + 1); // a leitura gerou exatamente uma linha de log
  });

  it("revogar a concessão volta a negar a leitura (concessão nominal é a fonte, não um cache)", async () => {
    expect(concessaoId).toBeTruthy();
    await admin.schema("aba_health").from("concessoes_prontuario").delete().eq("id", concessaoId!);
    concessaoId = undefined;

    const client = await clientAs("agent");
    const { data, error } = await client.schema("aba_health").rpc("ler_prontuario", { p_cliente_id: clienteId });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("ESCRITA CLÍNICA TAMBÉM GERA LOG (Maximus 070): INSERT em evolucoes grava log 'criacao' automaticamente", async () => {
    const owner = await clientAs("owner");
    const { data: concessao, error: concessaoErr } = await owner
      .schema("aba_health")
      .from("concessoes_prontuario")
      .insert({
        account_id: ctx.accountId,
        usuario_concedido_id: ctx.userIds.agent,
        escopo: "cliente_unico",
        cliente_id: clienteId,
        efeito: "permitir",
        motivo: "Teste 01.4 - escrita",
      })
      .select("id")
      .single();
    expect(concessaoErr).toBeNull();
    concessaoId = concessao!.id;

    const { data: profissional, error: profErr } = await admin
      .schema("aba_scheduling")
      .from("profissionais")
      // Só precisa existir como alvo de FK para evolucoes.profissional_id
      // — não representa vínculo de governança (Subetapa 02.2), então
      // ativo:false satisfaz profissionais_ativo_exige_funcionario sem
      // precisar de um funcionário/login por trás.
      .insert({ account_id: ctx.accountId, nome_exibicao: "Profissional Fictício Evolução 01.4", ativo: false })
      .select("id")
      .single();
    expect(profErr).toBeNull();

    const antesCriacao = await contarLog(admin, clienteId, ctx.userIds.agent, "criacao");
    const antesAtualizacao = await contarLog(admin, clienteId, ctx.userIds.agent, "atualizacao");

    const client = await clientAs("agent");
    const { data: evolucao, error: evolucaoErr } = await client
      .schema("aba_health")
      .from("evolucoes")
      .insert({
        account_id: ctx.accountId,
        cliente_id: clienteId,
        profissional_id: profissional!.id,
        avaliacao: "Avaliação de teste 01.4",
      })
      .select("id")
      .single();
    expect(evolucaoErr).toBeNull();

    const depoisCriacao = await contarLog(admin, clienteId, ctx.userIds.agent, "criacao");
    expect(depoisCriacao).toBe(antesCriacao + 1);

    const { error: updateErr } = await client
      .schema("aba_health")
      .from("evolucoes")
      .update({ resultado: "Resultado de teste 01.4" })
      .eq("id", evolucao!.id);
    expect(updateErr).toBeNull();

    const depoisAtualizacao = await contarLog(admin, clienteId, ctx.userIds.agent, "atualizacao");
    expect(depoisAtualizacao).toBe(antesAtualizacao + 1);

    await admin.schema("aba_health").from("evolucoes").delete().eq("id", evolucao!.id);
    await admin.schema("aba_scheduling").from("profissionais").delete().eq("id", profissional!.id);
  });

  it("evolução travada não aceita alteração — só adendo em nova linha", async () => {
    const { data: profissional, error: profErr } = await admin
      .schema("aba_scheduling")
      .from("profissionais")
      // Idem — só alvo de FK, ativo:false satisfaz o CHECK sem funcionário.
      .insert({ account_id: ctx.accountId, nome_exibicao: "Profissional Fictício Trava 01.4", ativo: false })
      .select("id")
      .single();
    expect(profErr).toBeNull();

    const { data: evolucao, error: evolucaoErr } = await admin
      .schema("aba_health")
      .from("evolucoes")
      .insert({
        account_id: ctx.accountId,
        cliente_id: clienteId,
        profissional_id: profissional!.id,
        avaliacao: "Evolução a ser travada",
        travada: true,
      })
      .select("id")
      .single();
    expect(evolucaoErr).toBeNull();

    const { error: updateErr } = await admin
      .schema("aba_health")
      .from("evolucoes")
      .update({ resultado: "Não deveria conseguir" })
      .eq("id", evolucao!.id);
    expect(updateErr).not.toBeNull();
    expect(updateErr?.code).toBe("23514");

    await admin.schema("aba_health").from("evolucoes").delete().eq("id", evolucao!.id);
    await admin.schema("aba_scheduling").from("profissionais").delete().eq("id", profissional!.id);
  });
});

describe("aba_health — atributo profissional exige funcionário ativo (Maximus 076, Subetapa 01.4)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let clienteId: string;
  let prontuarioId: string;
  let funcionarioId: string;
  let profissionalId: string;

  beforeAll(async () => {
    ctx = await loadContext();
    clienteId = await criarClienteFixture(admin, ctx.accountId, "Cliente Fictício Profissional 01.4");

    const { data: prontuario, error } = await admin
      .schema("aba_health")
      .from("prontuarios")
      .insert({ account_id: ctx.accountId, cliente_id: clienteId, tipo_pele: "seca" })
      .select("id")
      .single();
    if (error) throw error;
    prontuarioId = prontuario.id;

    // Libera o módulo 'health' para o papel agent — o atributo profissional
    // só concede acesso se access.can('health', ação) também for verdadeiro
    // (passo 4 de aba_health.pode_acessar()).
    const owner = await clientAs("owner");
    for (const acao of ["read"] as const) {
      const { error: setErr } = await owner.schema("access").rpc("set_module_permission", {
        p_role: "agent",
        p_module_key: "health",
        p_action: acao,
        p_allowed: true,
      });
      if (setErr) throw setErr;
    }

    // Funcionário (chave compartilhada com pessoas) vinculado ao profile
    // do usuário de teste "agent" — é esse vínculo que o atributo
    // profissional segue. Desde a Subetapa 02.2, todo profile já nasce
    // com um funcionário automático (trigger aba_people.
    // nascer_funcionario_do_perfil, aplicado por backfill aos 4 perfis
    // de teste) — reaproveita esse funcionário em vez de criar um
    // segundo (o índice único idx_funcionarios_profile_unico bloquearia
    // um profile_id duplicado).
    const { data: funcionarioExistente, error: funcErr } = await admin
      .schema("aba_people")
      .from("funcionarios")
      .select("id")
      .eq("profile_id", ctx.profileIds.agent)
      .single();
    if (funcErr) throw funcErr;
    funcionarioId = funcionarioExistente.id;

    const { data: profissional, error: profErr } = await admin
      .schema("aba_scheduling")
      .from("profissionais")
      .insert({
        account_id: ctx.accountId,
        profile_id: ctx.profileIds.agent,
        funcionario_id: funcionarioId,
        nome_exibicao: "Profissional Fictício 01.4",
        ativo: true,
        acesso_clinico: true,
      })
      .select("id")
      .single();
    if (profErr) throw profErr;
    profissionalId = profissional.id;
  });

  afterAll(async () => {
    const owner = await clientAs("owner");
    await owner.schema("access").rpc("set_module_permission", {
      p_role: "agent",
      p_module_key: "health",
      p_action: "read",
      p_allowed: false,
    });

    await admin.schema("aba_scheduling").from("profissionais").delete().eq("id", profissionalId);
    // funcionarioId aponta para o funcionário PERMANENTE do fixture
    // rls.agent (nascido pelo backfill da Subetapa 02.2) — não é deste
    // teste para apagar, só para usar como referência.
    await admin.schema("aba_health").from("log_acesso").delete().eq("cliente_id", clienteId);
    await admin.schema("aba_health").from("prontuarios").delete().eq("id", prontuarioId);
    await apagarCliente(admin, clienteId);
  });

  it("profissional ativo com funcionário ativo lê o prontuário sem concessão nominal", async () => {
    const client = await clientAs("agent");
    const { data, error } = await client.schema("aba_health").rpc("ler_prontuario", { p_cliente_id: clienteId });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(prontuarioId);
  });

  it("desativar o funcionário por trás do profissional revoga o acesso clínico (076)", async () => {
    const { error: desativarErr } = await admin
      .schema("aba_people")
      .from("funcionarios")
      .update({ ativo: false })
      .eq("id", funcionarioId);
    expect(desativarErr).toBeNull();

    const client = await clientAs("agent");
    const { data, error } = await client.schema("aba_health").rpc("ler_prontuario", { p_cliente_id: clienteId });
    expect(error).toBeNull();
    expect(data).toEqual([]); // profissional.ativo continua true, mas o funcionário não — nega

    // Reativa para não vazar estado para os afterAll/outros specs.
    await admin.schema("aba_people").from("funcionarios").update({ ativo: true }).eq("id", funcionarioId);
  });
});
