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

describe("aba_health — marcação de mapa clínico segue o mesmo regime (Subetapa 02.9, migration 024)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let clienteId: string;
  let profissionalId: string;
  let evolucaoId: string;
  let concessaoId: string | undefined;

  beforeAll(async () => {
    ctx = await loadContext();
    clienteId = await criarClienteFixture(admin, ctx.accountId, "Cliente Fictício Mapa 02.9");

    const { data: profissional, error: profErr } = await admin
      .schema("aba_scheduling")
      .from("profissionais")
      // Só alvo de FK, como nos demais fixtures deste arquivo.
      .insert({ account_id: ctx.accountId, nome_exibicao: "Profissional Fictício Mapa 02.9", ativo: false })
      .select("id")
      .single();
    if (profErr) throw profErr;
    profissionalId = profissional.id;

    const { data: evolucao, error } = await admin
      .schema("aba_health")
      .from("evolucoes")
      .insert({
        account_id: ctx.accountId,
        cliente_id: clienteId,
        profissional_id: profissionalId,
        avaliacao: "Sessão com mapa facial",
        mapa_tipo: "facial",
        marcacoes: [{ regiao: "zona_t", rotulo: "Zona T", estado: "achado_ativo", nota: "Oleosidade grau 3" }],
      })
      .select("id")
      .single();
    if (error) throw error;
    evolucaoId = evolucao.id;
  });

  afterAll(async () => {
    if (concessaoId) {
      await admin.schema("aba_health").from("concessoes_prontuario").delete().eq("id", concessaoId);
    }
    await admin.schema("aba_health").from("log_acesso").delete().eq("cliente_id", clienteId);
    await admin.schema("aba_health").from("evolucoes").delete().eq("id", evolucaoId);
    await admin.schema("aba_scheduling").from("profissionais").delete().eq("id", profissionalId);
    await apagarCliente(admin, clienteId);
  });

  it("marcacoes e mapa_tipo NÃO são legíveis por select direto — nem para o owner (privilégio de coluna, 013+024)", async () => {
    const owner = await clientAs("owner");
    for (const coluna of ["marcacoes", "mapa_tipo"]) {
      const { error } = await owner.schema("aba_health").from("evolucoes").select(coluna).eq("id", evolucaoId);
      // 42501: revogação por COLUNA — independe da RLS de linha, que o
      // owner passaria. Leitura de marcação sem log é impossível.
      expect(ehErroRls(error), `coluna ${coluna} deveria estar revogada`).toBe(true);
    }
  });

  it("ler_evolucoes() devolve mapa_tipo e marcacoes E grava log de leitura", async () => {
    const antes = await contarLog(admin, clienteId, ctx.userIds.owner, "leitura");

    const owner = await clientAs("owner");
    const { data, error } = await owner.schema("aba_health").rpc("ler_evolucoes", { p_cliente_id: clienteId });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].mapa_tipo).toBe("facial");
    expect(data![0].marcacoes).toEqual([
      { regiao: "zona_t", rotulo: "Zona T", estado: "achado_ativo", nota: "Oleosidade grau 3" },
    ]);

    const depois = await contarLog(admin, clienteId, ctx.userIds.owner, "leitura");
    expect(depois).toBe(antes + 1);
  });

  it("gravar marcação pela UI gera log de atualização automaticamente (trigger 070)", async () => {
    const antes = await contarLog(admin, clienteId, ctx.userIds.owner, "atualizacao");

    const owner = await clientAs("owner");
    const { error } = await owner
      .schema("aba_health")
      .from("evolucoes")
      .update({ marcacoes: [{ regiao: "malar_esq", rotulo: "Malar esquerdo", estado: "em_melhora", nota: "" }] })
      .eq("id", evolucaoId);
    expect(error).toBeNull();

    const depois = await contarLog(admin, clienteId, ctx.userIds.owner, "atualizacao");
    expect(depois).toBe(antes + 1);
  });

  it("CHECK do banco recusa mapa_tipo fora do catálogo dos quatro mapas", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner
      .schema("aba_health")
      .from("evolucoes")
      .update({ mapa_tipo: "mapa_inventado" })
      .eq("id", evolucaoId);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514");
  });

  it("CHECK do banco recusa marcacoes que não sejam array JSON", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner
      .schema("aba_health")
      .from("evolucoes")
      .update({ marcacoes: { regiao: "zona_t" } })
      .eq("id", evolucaoId);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514");
  });

  it("evolução assinada não aceita alteração de marcação — só adendo em linha nova", async () => {
    const owner = await clientAs("owner");
    const { error: assinarErr } = await owner
      .schema("aba_health")
      .from("evolucoes")
      .update({ travada: true })
      .eq("id", evolucaoId);
    expect(assinarErr).toBeNull();

    const { error } = await owner
      .schema("aba_health")
      .from("evolucoes")
      .update({ marcacoes: [{ regiao: "mento", rotulo: "Mento", estado: "em_tratamento", nota: "" }] })
      .eq("id", evolucaoId);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514");
  });

  it("agent sem concessão nem atributo profissional não enxerga marcação nenhuma", async () => {
    const antes = await contarLog(admin, clienteId, ctx.userIds.agent, "leitura");

    const agent = await clientAs("agent");
    const { data, error } = await agent.schema("aba_health").rpc("ler_evolucoes", { p_cliente_id: clienteId });
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const depois = await contarLog(admin, clienteId, ctx.userIds.agent, "leitura");
    expect(depois).toBe(antes); // nada lido, nada logado
  });
});

/**
 * Subetapa 02.12b — anamnese não grava pela metade.
 *
 * O defeito foi encontrado em uso real por Max: uma anamnese gravada com
 * "3 resposta(s)" de 5, porque `AnamneseTab` só recusava quando NENHUMA
 * pergunta havia sido respondida. A tela foi corrigida, mas validação de
 * formulário é conveniência — estes testes batem no BANCO, que é onde a
 * regra precisa valer para um `insert` direto pela API não passar por cima.
 *
 * Por que isso é invariante clínica e não capricho de formulário: a linha
 * incompleta tem data, autor e aparência de registro completo, e quem a ler
 * depois não distingue "o paciente não tem alergia" de "a pergunta nunca foi
 * feita". As duas produzem o mesmo vazio, e só uma é segura para decidir
 * procedimento.
 */
describe("aba_health — anamnese incompleta é recusada pelo banco (Subetapa 02.12b, migration 034)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let clienteId: string;
  let formularioId: string;

  const COMPLETA = {
    queixa_principal: "Manchas na face",
    medicacao_continua: "Nao",
    alergias: "nada consta",
    historico: "nada consta",
    habitos: "nada consta",
  };

  beforeAll(async () => {
    ctx = await loadContext();
    clienteId = await criarClienteFixture(admin, ctx.accountId, "Cliente Fictício Anamnese 02.12b");

    const { data, error } = await admin
      .schema("aba_health")
      .from("formularios_anamnese")
      .insert({
        account_id: ctx.accountId,
        nome: "Formulário Fictício Anamnese 02.12b",
        versao: 1,
        perguntas: [
          { chave: "queixa_principal", rotulo: "Queixa principal", tipo: "texto" },
          { chave: "medicacao_continua", rotulo: "Uso de medicação contínua", tipo: "sim_nao" },
          { chave: "alergias", rotulo: "Alergias e sensibilidades", tipo: "texto" },
          { chave: "historico", rotulo: "Histórico de procedimentos anteriores", tipo: "texto" },
          { chave: "habitos", rotulo: "Hábitos", tipo: "texto" },
        ],
      })
      .select("id")
      .single();
    if (error) throw error;
    formularioId = data.id;
  });

  afterAll(async () => {
    await admin.schema("aba_health").from("respostas_anamnese").delete().eq("cliente_id", clienteId);
    await admin.schema("aba_health").from("formularios_anamnese").delete().eq("id", formularioId);
    await admin.schema("aba_health").from("log_acesso").delete().eq("cliente_id", clienteId);
    await admin.schema("aba_people").from("clientes").delete().eq("id", clienteId);
    await admin.schema("aba_people").from("pessoas").delete().eq("id", clienteId);
  });

  it("recusa exatamente o caso encontrado em produção: 3 respostas de 5", async () => {
    const { error } = await admin.schema("aba_health").from("respostas_anamnese").insert({
      account_id: ctx.accountId,
      cliente_id: clienteId,
      formulario_id: formularioId,
      respostas: { queixa_principal: "teste", medicacao_continua: "Sim", alergias: "testes" },
    });

    expect(error).not.toBeNull();
    expect(error!.code).toBe("23514");
    // A mensagem precisa NOMEAR o que falta — "anamnese inválida" mandaria a
    // pessoa procurar qual dos cinco campos ficou para trás.
    expect(error!.message).toContain("Histórico de procedimentos anteriores");
  });

  it("campo só com espaço em branco não conta como resposta", async () => {
    const { error } = await admin
      .schema("aba_health")
      .from("respostas_anamnese")
      .insert({
        account_id: ctx.accountId,
        cliente_id: clienteId,
        formulario_id: formularioId,
        respostas: { ...COMPLETA, habitos: "   " },
      });

    expect(error).not.toBeNull();
    expect(error!.code).toBe("23514");
  });

  it("aceita a anamnese completa, com 'nada consta' onde não há o que relatar", async () => {
    const { data, error } = await admin
      .schema("aba_health")
      .from("respostas_anamnese")
      .insert({
        account_id: ctx.accountId,
        cliente_id: clienteId,
        formulario_id: formularioId,
        respostas: COMPLETA,
      })
      .select("id")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it("a trava vale para UPDATE também — não dá para gravar completa e depois esvaziar", async () => {
    const { data: linha } = await admin
      .schema("aba_health")
      .from("respostas_anamnese")
      .select("id")
      .eq("cliente_id", clienteId)
      .limit(1)
      .single();

    const { error } = await admin
      .schema("aba_health")
      .from("respostas_anamnese")
      .update({ respostas: { queixa_principal: "só isto" } })
      .eq("id", linha!.id);

    expect(error).not.toBeNull();
    expect(error!.code).toBe("23514");
  });

  it("nem service_role escapa — a regra é do banco, não da camada de acesso", async () => {
    // `admin` já É service_role: se os casos acima falharam para ele, a
    // trava não depende de RLS nem de papel. Este caso registra a
    // afirmação explicitamente, para ninguém precisar deduzi-la.
    const { error } = await admin.schema("aba_health").from("respostas_anamnese").insert({
      account_id: ctx.accountId,
      cliente_id: clienteId,
      formulario_id: formularioId,
      respostas: {},
    });

    expect(error).not.toBeNull();
    expect(error!.code).toBe("23514");
  });
});

describe("aba_health — log_acesso só é legível pelo owner (Subetapa 03.5, migration 041)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let clienteId: string;

  beforeAll(async () => {
    ctx = await loadContext();
    clienteId = await criarClienteFixture(admin, ctx.accountId, "Cliente Fictício Health 03.5");

    // ler_prontuario() só grava log para prontuário que EXISTE (o INSERT
    // do log é um SELECT sobre a tabela real) — sem esta linha, a
    // concessão e a chamada abaixo rodariam sem erro e sem produzir
    // nenhum log, e o controle positivo falharia por falta de dado, não
    // por falha da política.
    const { error: prontuarioErr } = await admin
      .schema("aba_health")
      .from("prontuarios")
      .insert({ account_id: ctx.accountId, cliente_id: clienteId, tipo_pele: "mista" });
    if (prontuarioErr) throw prontuarioErr;

    // Gera pelo menos uma linha real de log_acesso, pelo caminho normal
    // (concessão + ler_prontuario), para o teste de leitura não depender
    // de conjunto vazio por falta de dado.
    const { data: concessao, error: concessaoErr } = await admin
      .schema("aba_health")
      .from("concessoes_prontuario")
      .insert({
        account_id: ctx.accountId,
        usuario_concedido_id: ctx.userIds.agent,
        escopo: "cliente_unico",
        cliente_id: clienteId,
        efeito: "permitir",
        motivo: "Teste 03.5 — gerar log",
      })
      .select("id")
      .single();
    if (concessaoErr) throw concessaoErr;

    const agentSetup = await clientAs("agent");
    const { error: leituraErr } = await agentSetup.schema("aba_health").rpc("ler_prontuario", { p_cliente_id: clienteId });
    if (leituraErr) throw leituraErr;

    await admin.schema("aba_health").from("concessoes_prontuario").delete().eq("id", concessao!.id);
  });

  afterAll(async () => {
    await admin.schema("aba_health").from("log_acesso").delete().eq("cliente_id", clienteId);
    await admin.schema("aba_health").from("prontuarios").delete().eq("cliente_id", clienteId);
    await apagarCliente(admin, clienteId);
  });

  it("ATAQUE: admin não vê log_acesso — a política antiga (013) permitia admin+, a 041 restringe a owner", async () => {
    const client = await clientAs("admin");
    const { data, error } = await client.schema("aba_health").from("log_acesso").select("id").eq("cliente_id", clienteId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("ATAQUE: agent não vê log_acesso, mesmo tendo lido o prontuário que gerou a linha", async () => {
    const client = await clientAs("agent");
    const { data, error } = await client.schema("aba_health").from("log_acesso").select("id").eq("cliente_id", clienteId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("ATAQUE: viewer não vê log_acesso", async () => {
    const client = await clientAs("viewer");
    const { data, error } = await client.schema("aba_health").from("log_acesso").select("id").eq("cliente_id", clienteId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("CONTROLE POSITIVO: owner vê a linha de log_acesso gerada no beforeAll — a política não bloqueia todo mundo", async () => {
    const client = await clientAs("owner");
    const { data, error } = await client.schema("aba_health").from("log_acesso").select("id, acao, tipo_registro").eq("cliente_id", clienteId);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
    expect(data!.some((l) => l.acao === "leitura" && l.tipo_registro === "prontuario")).toBe(true);
  });
});
