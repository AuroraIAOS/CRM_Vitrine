import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { adminClient, anonClient, clientAs, loadContext, type TestContext } from "./helpers";

/**
 * Subetapa 03.7.b — P-sub da sessão clínica que escreve.
 *
 * TRÊS PERGUNTAS, cada uma com um jeito de dar errado em silêncio:
 *
 *   1. O TEXTO — o profissional escreve durante a sessão aberta, salva
 *      quantas vezes quiser, e o que escreveu volta íntegro pela leitura que
 *      registra. Assinada, a evolução recusa texto novo; o adendo continua.
 *      A intercorrência tem coluna própria (D-F15) e o mesmo regime das
 *      outras: ilegível direto, legível por `ler_evolucoes`.
 *
 *   2. A RECUSA — o paciente recusa o texto FINAL, então a recusa só vale
 *      sobre evolução travada, uma vez, com data e autor gravados pelo banco
 *      (D-F16). Sem sessão, a função recusa com mensagem própria.
 *
 *   3. OS DOIS CADEADOS DA RECUSA, cada um provado SOZINHO: o privilégio de
 *      coluna (o `UPDATE` direto morre em `42501`) e a exceção estreita do
 *      gatilho (nem o caminho de servidor, que tem o privilégio, consegue
 *      mudar texto junto com a recusa ou destravar a evolução recusada).
 *
 * O FLUXO É PROVADO COM O PAPEL QUE O USA (lição da 03.8.c): o profissional é
 * o login `agent` com concessão NOMINAL do paciente; a recepção é o `admin`,
 * sem alcance clínico; o `owner`, que atalha `pode_acessar`, não aparece.
 */

const codigo = (e: { code?: string } | null) => e?.code ?? null;

describe("sessão clínica que escreve: texto, intercorrência e recusa de assinatura (Subetapa 03.7.b)", () => {
  const admin = adminClient();
  let ctx: TestContext;

  let pacienteA: string; // o agent tem concessão nominal
  let pacienteB: string; // ninguém além do owner alcança
  let profAgent: string;
  let sessao: string; // a evolução do fluxo feliz
  let adendo: string;
  let travadaSemRecusa: string; // alvo dos ataques de escrita direta
  let evolucaoDeB: string;

  async function donoPg() {
    const c = new pg.Client({ connectionString: process.env.SUPABASE_TEST_DB_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();
    return c;
  }

  async function inserirPessoa(nome: string) {
    const { data: p, error } = await admin.schema("aba_people").from("pessoas")
      .insert({ account_id: ctx.accountId, nome_exibicao: nome }).select("id").single();
    if (error) throw error;
    const { error: e2 } = await admin.schema("aba_people").from("clientes")
      .insert({ id: p.id, account_id: ctx.accountId, razao_social: nome, status: "ativo" });
    if (e2) throw e2;
    return p.id as string;
  }

  /** Evolução criada pelo caminho de servidor — só fixture, nunca o fluxo provado. */
  async function evolucaoDeServidor(cliente: string, extra: Record<string, unknown> = {}) {
    const { data, error } = await admin.schema("aba_health").from("evolucoes")
      .insert({ account_id: ctx.accountId, cliente_id: cliente, profissional_id: profAgent, ...extra })
      .select("id").single();
    if (error) throw error;
    return data.id as string;
  }

  async function lerComoAgent(cliente: string) {
    const agent = await clientAs("agent");
    const { data, error } = await agent.schema("aba_health").rpc("ler_evolucoes", { p_cliente_id: cliente });
    if (error) throw error;
    return data as Record<string, unknown>[];
  }

  beforeAll(async () => {
    ctx = await loadContext();
    pacienteA = await inserirPessoa("Paciente A 03.7.b");
    pacienteB = await inserirPessoa("Paciente B 03.7.b");

    const { data: func } = await admin.schema("aba_people").from("funcionarios")
      .select("id").eq("profile_id", ctx.profileIds.agent).single();
    const { data: prof, error: eProf } = await admin.schema("aba_scheduling").from("profissionais")
      .insert({ account_id: ctx.accountId, nome_exibicao: "Dra. Agent 03.7.b", funcionario_id: func!.id,
                profile_id: ctx.profileIds.agent, ativo: false, acesso_clinico: false })
      .select("id").single();
    if (eProf) throw eProf;
    profAgent = prof.id;

    const { error: eConc } = await admin.schema("aba_health").from("concessoes_prontuario")
      .insert({ account_id: ctx.accountId, usuario_concedido_id: ctx.userIds.agent, escopo: "cliente_unico",
                cliente_id: pacienteA, efeito: "permitir", motivo: "Suíte 03.7.b", concedido_por: ctx.userIds.owner });
    if (eConc) throw eConc;

    travadaSemRecusa = await evolucaoDeServidor(pacienteA, { avaliacao: "Fixture travada 03.7.b", travada: true });
    evolucaoDeB = await evolucaoDeServidor(pacienteB, { avaliacao: "Fixture de B 03.7.b", travada: true });
  });

  afterAll(async () => {
    // Evolução travada não se altera por nenhum caminho da aplicação, e o
    // `ON DELETE SET NULL` de `adendo_de_id` é um UPDATE que o gatilho
    // recusaria — mesma saída das suítes 20 a 22: conexão de dono com
    // `DISABLE TRIGGER USER` só durante a limpeza.
    const clientes = [pacienteA, pacienteB].filter(Boolean);
    const dono = await donoPg();
    try {
      await dono.query("ALTER TABLE aba_health.evolucoes DISABLE TRIGGER USER");
      await dono.query("DELETE FROM aba_health.log_acesso WHERE cliente_id = ANY($1)", [clientes]);
      await dono.query("DELETE FROM aba_health.evolucoes WHERE cliente_id = ANY($1) AND adendo_de_id IS NOT NULL", [clientes]);
      await dono.query("DELETE FROM aba_health.evolucoes WHERE cliente_id = ANY($1)", [clientes]);
    } finally {
      await dono.query("ALTER TABLE aba_health.evolucoes ENABLE TRIGGER USER").catch(() => {});
      await dono.end();
    }
    await admin.schema("aba_health").from("concessoes_prontuario").delete().in("cliente_id", clientes);
    if (profAgent) await admin.schema("aba_scheduling").from("profissionais").delete().eq("id", profAgent);
    for (const id of clientes) {
      await admin.schema("aba_people").from("clientes").delete().eq("id", id);
      await admin.schema("aba_people").from("pessoas").delete().eq("id", id);
    }
  });

  // ------------------------------------------------------------------
  // 1. O TEXTO
  // ------------------------------------------------------------------
  it("o profissional abre a sessão sem texto nenhum — o texto chega DURANTE o atendimento", async () => {
    const agent = await clientAs("agent");
    const { data, error } = await agent.schema("aba_health").from("evolucoes")
      .insert({ account_id: ctx.accountId, cliente_id: pacienteA, profissional_id: profAgent, mapa_tipo: "odontograma", marcacoes: [] })
      .select("id").single();
    expect(error).toBeNull();
    sessao = data!.id;
  });

  it("escreve em DUAS gravações separadas e recupera o texto íntegro, com a intercorrência no lugar dela", async () => {
    const agent = await clientAs("agent");
    const g1 = await agent.schema("aba_health").from("evolucoes")
      .update({ avaliacao: "Dor à percussão no 16.", notas_procedimento: "Anestesia infiltrativa; remoção de cárie." })
      .eq("id", sessao);
    expect(g1.error).toBeNull();
    const g2 = await agent.schema("aba_health").from("evolucoes")
      .update({ resultado: "Restauração em resina concluída.", proximos_passos: "Retorno em 7 dias.",
                intercorrencia: "Sangramento gengival leve, contido com compressão." })
      .eq("id", sessao);
    expect(g2.error).toBeNull();

    const linha = (await lerComoAgent(pacienteA)).find((e) => e.id === sessao)!;
    // A segunda gravação não apagou a primeira: é o que "salvar quantas
    // vezes quiser" precisa garantir.
    expect(linha.avaliacao).toBe("Dor à percussão no 16.");
    expect(linha.notas_procedimento).toBe("Anestesia infiltrativa; remoção de cárie.");
    expect(linha.resultado).toBe("Restauração em resina concluída.");
    expect(linha.proximos_passos).toBe("Retorno em 7 dias.");
    expect(linha.intercorrencia).toBe("Sangramento gengival leve, contido com compressão.");
    expect(linha.travada).toBe(false);
    expect(linha.recusa_assinatura_em).toBeNull();
  });

  it("a intercorrência é ilegível direto (42501) — como as outras quatro, só sai pela leitura que registra", async () => {
    const agent = await clientAs("agent");
    const { error } = await agent.schema("aba_health").from("evolucoes").select("intercorrencia").eq("id", sessao);
    expect(codigo(error)).toBe("42501");
    const { error: e2 } = await agent.schema("aba_health").from("evolucoes").select("avaliacao").eq("id", sessao);
    expect(codigo(e2)).toBe("42501");
  });

  it("as duas gravações e a leitura deixaram rastro em log_acesso, com o agent como autor", async () => {
    const { data } = await admin.schema("aba_health").from("log_acesso")
      .select("acao, usuario_ator_id").eq("registro_id", sessao);
    const doAgent = (data ?? []).filter((l) => l.usuario_ator_id === ctx.userIds.agent);
    expect(doAgent.filter((l) => l.acao === "criacao")).toHaveLength(1);
    expect(doAgent.filter((l) => l.acao === "atualizacao").length).toBeGreaterThanOrEqual(2);
    expect(doAgent.some((l) => l.acao === "leitura")).toBe(true);
  });

  it("a recepção sem alcance clínico não escreve na sessão — a policy devolve zero linhas, e o texto não muda", async () => {
    const recepcao = await clientAs("admin");
    const { data, error } = await recepcao.schema("aba_health").from("evolucoes")
      .update({ intercorrencia: "escrito pela recepção" }).eq("id", sessao).select("id");
    // RLS em UPDATE filtra a linha: sem erro e sem linha afetada. A prova é
    // o conteúdo, lido de volta.
    expect(error === null || codigo(error) === "42501").toBe(true);
    expect(data ?? []).toHaveLength(0);
    const linha = (await lerComoAgent(pacienteA)).find((e) => e.id === sessao)!;
    expect(linha.intercorrencia).toBe("Sangramento gengival leve, contido com compressão.");
  });

  it("recusa ANTES do fecho é recusada com o motivo (D-F16) — o texto ainda pode mudar", async () => {
    const agent = await clientAs("agent");
    const { error } = await agent.schema("aba_health").rpc("registrar_recusa_assinatura", {
      p_evolucao_id: sessao, p_motivo: "Paciente não quis assinar.",
    });
    expect(codigo(error)).toBe("23514");
    expect(error!.message).toMatch(/assine a sessão primeiro/);
  });

  it("assinada, a evolução recusa texto novo (23514, gatilho da 013) — em qualquer coluna de texto, inclusive a nova", async () => {
    const agent = await clientAs("agent");
    const { error: eAss } = await agent.schema("aba_health").from("evolucoes").update({ travada: true }).eq("id", sessao);
    expect(eAss).toBeNull();

    for (const coluna of ["avaliacao", "intercorrencia"]) {
      const { error } = await agent.schema("aba_health").from("evolucoes")
        .update({ [coluna]: "alterado depois de assinar" }).eq("id", sessao);
      expect(codigo(error), coluna).toBe("23514");
      expect(error!.message).toMatch(/Evolução travada não aceita alteração/);
    }
    const linha = (await lerComoAgent(pacienteA)).find((e) => e.id === sessao)!;
    expect(linha.avaliacao).toBe("Dor à percussão no 16.");
  });

  it("o adendo continua sendo o caminho depois do fecho, e não muda a original", async () => {
    const agent = await clientAs("agent");
    const { data, error } = await agent.schema("aba_health").from("evolucoes")
      .insert({ account_id: ctx.accountId, cliente_id: pacienteA, profissional_id: profAgent,
                adendo_de_id: sessao, avaliacao: "Adendo: paciente relatou sensibilidade ao frio." })
      .select("id").single();
    expect(error).toBeNull();
    adendo = data!.id;
    const linhas = await lerComoAgent(pacienteA);
    expect(linhas.find((e) => e.id === adendo)!.adendo_de_id).toBe(sessao);
    expect(linhas.find((e) => e.id === sessao)!.avaliacao).toBe("Dor à percussão no 16.");
  });

  // ------------------------------------------------------------------
  // 2. A RECUSA
  // ------------------------------------------------------------------
  it("recusa sem sessão autenticada é barrada com MENSAGEM PRÓPRIA (42501), não com o nome de um CHECK", async () => {
    // service_role executa a função e não tem `auth.uid()`: é exatamente o
    // caminho que gravaria recusa sem autor.
    const { error } = await admin.schema("aba_health").rpc("registrar_recusa_assinatura", {
      p_evolucao_id: sessao, p_motivo: "sem sessão",
    });
    expect(codigo(error)).toBe("42501");
    expect(error!.message).toMatch(/exige sessão autenticada/);
    expect(error!.message).not.toMatch(/evolucoes_recusa_completa/);
  });

  it("anon nem executa a função", async () => {
    const { error } = await anonClient().schema("aba_health").rpc("registrar_recusa_assinatura", {
      p_evolucao_id: sessao, p_motivo: "anônimo",
    });
    expect(error).not.toBeNull();
    expect(["42501", "PGRST202"]).toContain(codigo(error));
  });

  it("motivo em branco é recusado (23514) — recusa sem motivo é lacuna com cara de registro", async () => {
    const agent = await clientAs("agent");
    const { error } = await agent.schema("aba_health").rpc("registrar_recusa_assinatura", {
      p_evolucao_id: sessao, p_motivo: "   ",
    });
    expect(codigo(error)).toBe("23514");
    expect(error!.message).toMatch(/Escreva o motivo/);
  });

  it("a recepção sem alcance clínico não registra recusa (42501), e a mesma resposta vale para o paciente fora do alcance do agent", async () => {
    const recepcao = await clientAs("admin");
    const r1 = await recepcao.schema("aba_health").rpc("registrar_recusa_assinatura", {
      p_evolucao_id: sessao, p_motivo: "recepção",
    });
    expect(codigo(r1.error)).toBe("42501");
    expect(r1.error!.message).toMatch(/não está ao seu alcance/);

    const agent = await clientAs("agent");
    const r2 = await agent.schema("aba_health").rpc("registrar_recusa_assinatura", {
      p_evolucao_id: evolucaoDeB, p_motivo: "fora do alcance",
    });
    expect(codigo(r2.error)).toBe("42501");
    expect(r2.error!.message).toMatch(/não está ao seu alcance/);
  });

  it("o profissional registra a recusa: data e autor gravados pelo BANCO, motivo aparado, e a escrita registrada", async () => {
    const agent = await clientAs("agent");
    const antes = Date.now();
    const { data, error } = await agent.schema("aba_health").rpc("registrar_recusa_assinatura", {
      p_evolucao_id: sessao, p_motivo: "  Paciente disse que não assina nada sem ler em casa.  ",
    });
    expect(error).toBeNull();
    expect(new Date(data as unknown as string).getTime()).toBeGreaterThanOrEqual(antes - 60_000);

    const linha = (await lerComoAgent(pacienteA)).find((e) => e.id === sessao)!;
    expect(linha.recusa_assinatura_por).toBe(ctx.userIds.agent);
    expect(linha.recusa_assinatura_motivo).toBe("Paciente disse que não assina nada sem ler em casa.");
    expect(linha.recusa_assinatura_em).not.toBeNull();
    // A exceção do gatilho não abriu nada além da recusa.
    expect(linha.travada).toBe(true);
    expect(linha.avaliacao).toBe("Dor à percussão no 16.");

    const { data: log } = await admin.schema("aba_health").from("log_acesso")
      .select("acao, contexto").eq("registro_id", sessao).eq("usuario_ator_id", ctx.userIds.agent).eq("acao", "atualizacao");
    expect((log ?? []).length).toBeGreaterThanOrEqual(3); // duas gravações + assinatura + recusa
  });

  it("a recusa não se refaz nem se sobrescreve (23514)", async () => {
    const agent = await clientAs("agent");
    const { error } = await agent.schema("aba_health").rpc("registrar_recusa_assinatura", {
      p_evolucao_id: sessao, p_motivo: "outro motivo",
    });
    expect(codigo(error)).toBe("23514");
    expect(error!.message).toMatch(/já foi registrada/);
    const linha = (await lerComoAgent(pacienteA)).find((e) => e.id === sessao)!;
    expect(linha.recusa_assinatura_motivo).toBe("Paciente disse que não assina nada sem ler em casa.");
  });

  // ------------------------------------------------------------------
  // 3. OS DOIS CADEADOS, cada um sozinho
  // ------------------------------------------------------------------
  it("cadeado 1 — o UPDATE direto da recusa morre no privilégio de coluna (42501), em evolução travada e em aberta", async () => {
    const agent = await clientAs("agent");
    const carimbo = { recusa_assinatura_em: new Date().toISOString(), recusa_assinatura_por: ctx.userIds.agent,
                      recusa_assinatura_motivo: "forjada" };
    const naTravada = await agent.schema("aba_health").from("evolucoes").update(carimbo).eq("id", travadaSemRecusa);
    expect(codigo(naTravada.error)).toBe("42501");
    const noAdendo = await agent.schema("aba_health").from("evolucoes").update(carimbo).eq("id", adendo);
    expect(codigo(noAdendo.error)).toBe("42501");
  });

  it("cadeado 1 — nem o INSERT nasce com recusa carimbada pela aplicação (42501)", async () => {
    const agent = await clientAs("agent");
    const { error } = await agent.schema("aba_health").from("evolucoes")
      .insert({ account_id: ctx.accountId, cliente_id: pacienteA, profissional_id: profAgent,
                recusa_assinatura_em: new Date().toISOString(), recusa_assinatura_por: ctx.userIds.agent,
                recusa_assinatura_motivo: "forjada" });
    expect(codigo(error)).toBe("42501");
  });

  it("cadeado 2 — mesmo com o privilégio (servidor), a exceção não deixa mudar TEXTO junto com a recusa (23514 do gatilho)", async () => {
    const { error } = await admin.schema("aba_health").from("evolucoes")
      .update({ recusa_assinatura_em: new Date().toISOString(), recusa_assinatura_por: ctx.userIds.agent,
                recusa_assinatura_motivo: "servidor", avaliacao: "texto trocado junto" })
      .eq("id", travadaSemRecusa);
    expect(codigo(error)).toBe("23514");
    expect(error!.message).toMatch(/Evolução travada não aceita alteração/);
  });

  it("cadeado 2 — nem o servidor destrava a evolução recusada, e nem sobrescreve a recusa (23514 do gatilho)", async () => {
    const destravar = await admin.schema("aba_health").from("evolucoes").update({ travada: false }).eq("id", sessao);
    expect(codigo(destravar.error)).toBe("23514");
    expect(destravar.error!.message).toMatch(/Evolução travada não aceita alteração/);

    const sobrescrever = await admin.schema("aba_health").from("evolucoes")
      .update({ recusa_assinatura_motivo: "motivo trocado" }).eq("id", sessao);
    expect(codigo(sobrescrever.error)).toBe("23514");
    expect(sobrescrever.error!.message).toMatch(/Evolução travada não aceita alteração/);
  });

  it("CHECK evolucoes_recusa_completa: recusa sem autor não entra, nem pelo servidor (nome do CHECK lido)", async () => {
    // Só a regra dos três-juntos é ferida: a evolução está travada (a
    // outra regra passa) e só as colunas da recusa mudam (o gatilho passa).
    const { error } = await admin.schema("aba_health").from("evolucoes")
      .update({ recusa_assinatura_em: new Date().toISOString(), recusa_assinatura_motivo: "sem autor" })
      .eq("id", travadaSemRecusa);
    expect(codigo(error)).toBe("23514");
    expect(error!.message).toMatch(/evolucoes_recusa_completa/);
  });

  it("CHECK evolucoes_recusa_so_travada: recusa em evolução aberta não existe como dado (nome do CHECK lido)", async () => {
    const { error } = await admin.schema("aba_health").from("evolucoes")
      .insert({ account_id: ctx.accountId, cliente_id: pacienteA, profissional_id: profAgent, travada: false,
                recusa_assinatura_em: new Date().toISOString(), recusa_assinatura_por: ctx.userIds.agent,
                recusa_assinatura_motivo: "aberta" });
    expect(codigo(error)).toBe("23514");
    expect(error!.message).toMatch(/evolucoes_recusa_so_travada/);
  });

  it("privilégio medido no catálogo: sem escrita de TABELA, recusa fora da escrita, texto clínico fora da leitura", async () => {
    const dono = await donoPg();
    try {
      const { rows } = await dono.query(`
        SELECT
          has_table_privilege('authenticated','aba_health.evolucoes','UPDATE') AS upd_tabela,
          has_table_privilege('authenticated','aba_health.evolucoes','INSERT') AS ins_tabela,
          has_column_privilege('authenticated','aba_health.evolucoes','recusa_assinatura_motivo','UPDATE') AS upd_motivo,
          has_column_privilege('authenticated','aba_health.evolucoes','recusa_assinatura_por','INSERT') AS ins_por,
          has_column_privilege('authenticated','aba_health.evolucoes','intercorrencia','SELECT') AS sel_intercorrencia,
          has_column_privilege('authenticated','aba_health.evolucoes','recusa_assinatura_em','SELECT') AS sel_recusa,
          has_column_privilege('authenticated','aba_health.evolucoes','intercorrencia','UPDATE') AS upd_intercorrencia,
          has_column_privilege('authenticated','aba_health.evolucoes','anexos','UPDATE') AS upd_anexos,
          has_function_privilege('anon','aba_health.registrar_recusa_assinatura(uuid,text)','EXECUTE') AS anon_exec`);
      expect(rows[0]).toEqual({
        upd_tabela: false, ins_tabela: false, upd_motivo: false, ins_por: false,
        sel_intercorrencia: false, sel_recusa: false, upd_intercorrencia: true, upd_anexos: true, anon_exec: false,
      });
    } finally {
      await dono.end();
    }
  });
});
