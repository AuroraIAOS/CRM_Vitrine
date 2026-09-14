import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, clientAs, ehErroRls, loadContext, type TestContext } from "./helpers";

/**
 * Subetapa 03.8.c — P-sub da opção heterogênea e da reaprovação.
 *
 * TRÊS PERGUNTAS, cada uma com um jeito diferente de dar errado em silêncio:
 *
 *   1. O ARCO — a célula do plano, a tarifa e o item do orçamento aceitam
 *      procedimento OU pacote (D-F1, D-F6). O modo de falha é a linha com
 *      zero ou com dois itens, que o preço resolveria por qualquer um dos
 *      dois. Recusa conferida pelo SQLSTATE **e** pelo nome do CHECK — a
 *      lição da 03.6.a é que "deu erro" não prova qual regra barrou.
 *
 *   2. O PREÇO DO PACOTE — sobe a mesma escada do procedimento, com
 *      `preco_total` como fundo (decisão registrada na migration `051`).
 *      O modo de falha é o pacote do conveniado saindo pelo preço de balcão.
 *
 *   3. QUEM APROVA, E O QUE DESFAZ A APROVAÇÃO (D-F3, D-F7) — só o
 *      profissional que vai executar aprova; mexer em dinheiro devolve o
 *      orçamento a rascunho. O modo de falha mais caro é o `UPDATE` direto
 *      pelo PostgREST com carimbo de outra pessoa, que a policy de `agent`
 *      autoriza e só o gatilho recusa.
 *
 * TODA RECUSA É CONFERIDA CONTANDO O ESTADO DEPOIS (lição da 03.8): uma
 * operação que não faz nada não gera erro, gera ausência de efeito.
 */
describe("opção heterogênea, preço do pacote e reaprovação (Subetapa 03.8.c)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let clienteId: string;
  let categoriaId: string;
  let procId: string;
  let pacoteId: string;
  let pacoteEscadaId: string;
  let pacoteInativoId: string;
  let planoId: string;
  let opcaoA: string;
  let opcaoB: string;
  let faseId: string;
  let profAgent: string;
  let orcA: string;
  let orcB: string;
  const tabelas: string[] = [];

  const codigo = (e: { code?: string } | null) => e?.code ?? null;

  async function comprometerComoOwner(tabelaId: string) {
    const owner = await clientAs("owner");
    const { error } = await owner.schema("aba_finance").rpc("comprometer_tabela_preco", { p_tabela_id: tabelaId });
    if (error) throw error;
  }

  async function estadoDoOrcamento(id: string) {
    const { data } = await admin
      .schema("aba_finance").from("orcamentos")
      .select("estado, aprovado_em, aprovado_por, desconto_valor").eq("id", id).single();
    return data!;
  }

  beforeAll(async () => {
    ctx = await loadContext();

    const { data: p, error: e1 } = await admin
      .schema("aba_people").from("pessoas")
      .insert({ account_id: ctx.accountId, nome_exibicao: "Paciente 03.8.c" }).select("id").single();
    if (e1) throw e1;
    const { error: e2 } = await admin
      .schema("aba_people").from("clientes")
      .insert({ id: p.id, account_id: ctx.accountId, razao_social: "Paciente 03.8.c", status: "ativo" });
    if (e2) throw e2;
    clienteId = p.id;

    const { data: cat, error: e3 } = await admin
      .schema("aba_catalog").from("categorias")
      .insert({ account_id: ctx.accountId, nome: "Categoria 03.8.c" }).select("id").single();
    if (e3) throw e3;
    categoriaId = cat.id;

    const { data: proc, error: e4 } = await admin
      .schema("aba_catalog").from("procedimentos")
      .insert({
        account_id: ctx.accountId, categoria_id: categoriaId, nome: "Lente de porcelana 03.8.c",
        preco_base: 900, unidade_lancamento: "dente", faces_minimo: 1, faces_maximo: 3,
      })
      .select("id").single();
    if (e4) throw e4;
    procId = proc.id;

    const pacotes: [string, number, boolean][] = [
      ["Combo clareamento 03.8.c", 600, true],
      ["Combo escada 03.8.c", 500, true],
      ["Combo inativo 03.8.c", 100, false],
    ];
    const ids: string[] = [];
    for (const [nome, preco, ativo] of pacotes) {
      const { data, error } = await admin
        .schema("aba_catalog").from("pacotes")
        .insert({ account_id: ctx.accountId, nome, preco_total: preco, ativo }).select("id").single();
      if (error) throw error;
      ids.push(data.id);
    }
    [pacoteId, pacoteEscadaId, pacoteInativoId] = ids;

    // O PROFISSIONAL QUE VAI EXECUTAR É O LOGIN `agent` (D-F7). Inativo,
    // porque profissional ativo exige funcionário ativo com login
    // (`instrucoes.md` §5) — e aprovar não depende de estar em atividade,
    // depende de SER aquela pessoa.
    const { data: func } = await admin
      .schema("aba_people").from("funcionarios")
      .select("id").eq("profile_id", ctx.profileIds.agent).single();
    const { data: prof, error: e5 } = await admin
      .schema("aba_scheduling").from("profissionais")
      .insert({
        account_id: ctx.accountId, nome_exibicao: "Dra. Agent 03.8.c",
        funcionario_id: func!.id, profile_id: ctx.profileIds.agent, ativo: false, acesso_clinico: false,
      })
      .select("id").single();
    if (e5) throw e5;
    profAgent = prof.id;

    const { data: plano, error: e6 } = await admin
      .schema("aba_treatment").from("planos")
      .insert({ account_id: ctx.accountId, cliente_id: clienteId, titulo: "Plano 03.8.c", profissional_id: profAgent })
      .select("id").single();
    if (e6) throw e6;
    planoId = plano.id;

    for (const [rotulo, ordem] of [["A", 1], ["B", 2]] as const) {
      const { data, error } = await admin
        .schema("aba_treatment").from("opcoes")
        .insert({ account_id: ctx.accountId, plano_id: planoId, rotulo, ordem }).select("id").single();
      if (error) throw error;
      if (rotulo === "A") opcaoA = data.id;
      else opcaoB = data.id;
    }

    const { data: fases } = await admin
      .schema("aba_treatment").from("fases").select("id, chave").eq("account_id", ctx.accountId);
    faseId = fases!.find((f) => f.chave === "definitiva")!.id;

    // Tabela da prática com tarifa só para o PROCEDIMENTO — é o que faz as
    // duas opções saírem de degraus diferentes.
    const { data: t, error: e7 } = await admin
      .schema("aba_finance").from("tabelas_preco")
      .insert({ account_id: ctx.accountId, nome: "Prática 03.8.c", escopo: "pratica" }).select("id").single();
    if (e7) throw e7;
    tabelas.push(t.id);
    const { error: e8 } = await admin
      .schema("aba_finance").from("tarifas")
      .insert({ account_id: ctx.accountId, tabela_preco_id: t.id, procedimento_id: procId, valor: 750 });
    if (e8) throw e8;
    await comprometerComoOwner(t.id);
  });

  afterAll(async () => {
    // Mesmo método da suíte 20: conexão de DONO com `DISABLE TRIGGER`,
    // porque tarifa comprometida não se apaga por nenhum caminho da
    // aplicação — e é bom que continue assim.
    const { default: pg } = await import("pg");
    const dono = new pg.Client({ connectionString: process.env.SUPABASE_TEST_DB_URL, ssl: { rejectUnauthorized: false } });
    await dono.connect();
    const tabelasComGatilho = ["aba_finance.tarifas", "aba_finance.tabelas_preco",
                               "aba_finance.orcamentos", "aba_finance.itens_orcamento"];
    try {
      for (const t of tabelasComGatilho) await dono.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
      await dono.query(`DELETE FROM aba_finance.eventos_orcamento WHERE orcamento_id IN (SELECT id FROM aba_finance.orcamentos WHERE plano_id = $1)`, [planoId]);
      await dono.query(`DELETE FROM aba_finance.itens_orcamento WHERE orcamento_id IN (SELECT id FROM aba_finance.orcamentos WHERE plano_id = $1)`, [planoId]);
      await dono.query(`DELETE FROM aba_finance.orcamentos WHERE plano_id = $1`, [planoId]);
      if (tabelas.length) {
        await dono.query(`DELETE FROM aba_finance.tarifas WHERE tabela_preco_id = ANY($1)`, [tabelas]);
        await dono.query(`DELETE FROM aba_finance.tabelas_preco WHERE id = ANY($1)`, [tabelas]);
      }
    } finally {
      for (const t of tabelasComGatilho) await dono.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`).catch(() => {});
      await dono.end();
    }

    await admin.schema("aba_treatment").from("procedimentos_plano").delete().eq("plano_id", planoId);
    await admin.schema("aba_treatment").from("opcoes").delete().eq("plano_id", planoId);
    await admin.schema("aba_treatment").from("planos").delete().eq("id", planoId);
    if (profAgent) await admin.schema("aba_scheduling").from("profissionais").delete().eq("id", profAgent);
    for (const id of [pacoteId, pacoteEscadaId, pacoteInativoId]) {
      if (id) await admin.schema("aba_catalog").from("pacotes").delete().eq("id", id);
    }
    await admin.schema("aba_catalog").from("procedimentos").delete().eq("id", procId);
    await admin.schema("aba_catalog").from("categorias").delete().eq("id", categoriaId);
    await admin.schema("aba_health").from("log_acesso").delete().eq("cliente_id", clienteId);
    await admin.schema("aba_people").from("clientes").delete().eq("id", clienteId);
    await admin.schema("aba_people").from("pessoas").delete().eq("id", clienteId);
  });

  // ============================================================
  // 1. O ARCO
  // ============================================================

  it("uma opção com PROCEDIMENTO e outra com PACOTE nascem no mesmo plano", async () => {
    const owner = await clientAs("owner");
    const { data: a, error: ea } = await owner
      .schema("aba_treatment").from("procedimentos_plano")
      .insert({ account_id: ctx.accountId, plano_id: planoId, opcao_id: opcaoA, fase_id: faseId,
                procedimento_id: procId, dente: "11", faces: ["vestibular"] })
      .select("id").single();
    expect(ea).toBeNull();
    expect(a!.id).toBeTruthy();

    const { data: b, error: eb } = await owner
      .schema("aba_treatment").from("procedimentos_plano")
      .insert({ account_id: ctx.accountId, plano_id: planoId, opcao_id: opcaoB, fase_id: faseId, pacote_id: pacoteId })
      .select("id").single();
    expect(eb).toBeNull();
    expect(b!.id).toBeTruthy();
  });

  it("ATAQUE: a célula recusa ZERO itens e recusa DOIS — pelo CHECK do arco, com o nome dele", async () => {
    const owner = await clientAs("owner");
    const base = { account_id: ctx.accountId, plano_id: planoId, opcao_id: opcaoB, fase_id: faseId };

    const zero = await owner.schema("aba_treatment").from("procedimentos_plano").insert(base);
    expect(codigo(zero.error)).toBe("23514");
    expect(zero.error!.message, zero.error!.message).toContain("procedimentos_plano_um_item");

    // SEM dente, de propósito: com dente, o CHECK `pacote_sem_dente` também
    // seria violado e o Postgres reportaria o primeiro que avaliasse —
    // o teste passaria a provar outra regra. Medido na primeira execução.
    const dois = await owner.schema("aba_treatment").from("procedimentos_plano")
      .insert({ ...base, procedimento_id: procId, pacote_id: pacoteId });
    expect(codigo(dois.error)).toBe("23514");
    expect(dois.error!.message, dois.error!.message).toContain("procedimentos_plano_um_item");

    const { count } = await admin.schema("aba_treatment").from("procedimentos_plano")
      .select("id", { count: "exact", head: true }).eq("plano_id", planoId);
    expect(count).toBe(2);
  });

  it("ATAQUE: pacote não se lança por dente, e pacote inativo não entra em proposta nova", async () => {
    const owner = await clientAs("owner");
    const base = { account_id: ctx.accountId, plano_id: planoId, opcao_id: opcaoB, fase_id: faseId };

    const comDente = await owner.schema("aba_treatment").from("procedimentos_plano")
      .insert({ ...base, pacote_id: pacoteId, dente: "11" });
    expect(codigo(comDente.error)).toBe("23514");
    expect(comDente.error!.message).toContain("procedimentos_plano_pacote_sem_dente");

    const inativo = await owner.schema("aba_treatment").from("procedimentos_plano")
      .insert({ ...base, pacote_id: pacoteInativoId });
    expect(codigo(inativo.error)).toBe("23514");
    expect(inativo.error!.message).toContain("inativo");
  });

  it("ATAQUE: a tarifa recusa zero itens e recusa dois", async () => {
    const owner = await clientAs("owner");
    const { data: t } = await owner.schema("aba_finance").from("tabelas_preco")
      .insert({ account_id: ctx.accountId, nome: "Rascunho arco 03.8.c", escopo: "pratica" }).select("id").single();
    tabelas.push(t!.id);

    const zero = await owner.schema("aba_finance").from("tarifas")
      .insert({ account_id: ctx.accountId, tabela_preco_id: t!.id, valor: 10 });
    expect(codigo(zero.error)).toBe("23514");
    expect(zero.error!.message).toContain("tarifas_um_item");

    const dois = await owner.schema("aba_finance").from("tarifas")
      .insert({ account_id: ctx.accountId, tabela_preco_id: t!.id, procedimento_id: procId, pacote_id: pacoteId, valor: 10 });
    expect(codigo(dois.error)).toBe("23514");
    expect(dois.error!.message).toContain("tarifas_um_item");
  });

  it("a escada recusa pergunta sem item e com dois itens (22023), e resolver_preco segue sem parâmetro de tabela", async () => {
    const owner = await clientAs("owner");
    const nenhum = await owner.schema("aba_finance").rpc("resolver_preco_item", {
      p_procedimento_id: null, p_pacote_id: null, p_cliente_id: clienteId,
    });
    expect(codigo(nenhum.error)).toBe("22023");
    const ambos = await owner.schema("aba_finance").rpc("resolver_preco_item", {
      p_procedimento_id: procId, p_pacote_id: pacoteId, p_cliente_id: clienteId,
    });
    expect(codigo(ambos.error)).toBe("22023");

    // Tentar passar uma tabela é pedir uma assinatura que não existe.
    const escolha = await owner.schema("aba_finance").rpc("resolver_preco_item", {
      p_procedimento_id: procId, p_pacote_id: null, p_tabela_preco_id: tabelas[0],
    } as never);
    expect(escolha.error).not.toBeNull();
  });

  // ============================================================
  // 2. O PREÇO DO PACOTE
  // ============================================================

  it("as duas opções orçadas lado a lado saem de DEGRAUS DIFERENTES — procedimento pela tabela, pacote pelo cadastro", async () => {
    const agent = await clientAs("agent");
    const a = await agent.schema("aba_finance").rpc("montar_orcamento", { p_opcao_id: opcaoA, p_profissional_id: profAgent });
    const b = await agent.schema("aba_finance").rpc("montar_orcamento", { p_opcao_id: opcaoB, p_profissional_id: profAgent });
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    orcA = a.data as unknown as string;
    orcB = b.data as unknown as string;

    const { data: itens } = await admin.schema("aba_finance").from("itens_orcamento")
      .select("orcamento_id, procedimento_id, pacote_id, valor_resolvido, degrau").in("orcamento_id", [orcA, orcB]);
    const itemA = itens!.find((i) => i.orcamento_id === orcA)!;
    const itemB = itens!.find((i) => i.orcamento_id === orcB)!;
    expect(itemA.procedimento_id).toBe(procId);
    expect(itemA.degrau).toBe("pratica");
    expect(Number(itemA.valor_resolvido)).toBe(750);
    expect(itemB.pacote_id).toBe(pacoteId);
    expect(itemB.procedimento_id).toBeNull();
    expect(itemB.degrau).toBe("catalogo");
    expect(Number(itemB.valor_resolvido)).toBe(600);
  });

  it("o pacote SOBE A ESCADA: tarifa comprometida vence o `preco_total`, e a cortesia do paciente vence a prática", async () => {
    const owner = await clientAs("owner");
    const antes = await owner.schema("aba_finance").rpc("resolver_preco_item", {
      p_procedimento_id: null, p_pacote_id: pacoteEscadaId, p_cliente_id: clienteId,
    });
    expect(antes.data![0].degrau).toBe("catalogo");
    expect(Number(antes.data![0].valor)).toBe(500);

    for (const [nome, extra, valor] of [
      ["Prática pacote 03.8.c", { escopo: "pratica" }, 450],
      ["Cortesia pacote 03.8.c", { escopo: "paciente", cliente_id: clienteId }, 300],
    ] as const) {
      const { data: t, error } = await owner.schema("aba_finance").from("tabelas_preco")
        .insert({ account_id: ctx.accountId, nome, ...extra }).select("id").single();
      expect(error).toBeNull();
      tabelas.push(t!.id);
      const tf = await owner.schema("aba_finance").from("tarifas")
        .insert({ account_id: ctx.accountId, tabela_preco_id: t!.id, pacote_id: pacoteEscadaId, valor });
      expect(tf.error).toBeNull();
      await comprometerComoOwner(t!.id);
    }

    const comPaciente = await owner.schema("aba_finance").rpc("resolver_preco_item", {
      p_procedimento_id: null, p_pacote_id: pacoteEscadaId, p_cliente_id: clienteId,
    });
    expect(comPaciente.data![0].degrau).toBe("paciente");
    expect(Number(comPaciente.data![0].valor)).toBe(300);

    // Sem o paciente na pergunta, a cortesia dele some — e vale a prática.
    const semPaciente = await owner.schema("aba_finance").rpc("resolver_preco_item", {
      p_procedimento_id: null, p_pacote_id: pacoteEscadaId,
    });
    expect(semPaciente.data![0].degrau).toBe("pratica");
    expect(Number(semPaciente.data![0].valor)).toBe(450);
  });

  it("reajustar uma tabela copia a tarifa de PACOTE junto com a de procedimento", async () => {
    const owner = await clientAs("owner");
    const praticaPacote = tabelas[tabelas.length - 2];
    const { data: nova, error } = await owner.schema("aba_finance").rpc("reajustar_tabela_preco", {
      p_tabela_id: praticaPacote, p_percentual: 10,
    });
    expect(error).toBeNull();
    tabelas.push(nova as unknown as string);
    const { data: tf } = await admin.schema("aba_finance").from("tarifas")
      .select("pacote_id, procedimento_id, valor").eq("tabela_preco_id", nova as unknown as string);
    expect(tf).toHaveLength(1);
    expect(tf![0].pacote_id).toBe(pacoteEscadaId);
    expect(Number(tf![0].valor)).toBe(495);
  });

  it("ler_orcamentos devolve o item de pacote com `tipo`, sem dente, e o nome do pacote", async () => {
    const owner = await clientAs("owner");
    const { data, error } = await owner.schema("aba_finance").rpc("ler_orcamentos", { p_plano_id: planoId });
    expect(error).toBeNull();
    const b = data!.find((o: { id: string }) => o.id === orcB);
    expect(b.itens).toHaveLength(1);
    expect(b.itens[0].tipo).toBe("pacote");
    expect(b.itens[0].procedimento).toBe("Combo clareamento 03.8.c");
    expect(b.itens[0].dente).toBeNull();
  });

  it("trocar a célula de procedimento para pacote e remontar tira do orçamento a linha do preço antigo", async () => {
    const owner = await clientAs("owner");
    // Célula nova, só para este caso, na opção A.
    const { data: c } = await owner.schema("aba_treatment").from("procedimentos_plano")
      .insert({ account_id: ctx.accountId, plano_id: planoId, opcao_id: opcaoA, fase_id: faseId,
                procedimento_id: procId, dente: "21", faces: ["vestibular"] })
      .select("id").single();
    const agent = await clientAs("agent");
    await agent.schema("aba_finance").rpc("montar_orcamento", { p_opcao_id: opcaoA, p_profissional_id: profAgent });

    const troca = await owner.schema("aba_treatment").from("procedimentos_plano")
      .update({ procedimento_id: null, pacote_id: pacoteId, dente: null, faces: [] }).eq("id", c!.id);
    expect(troca.error).toBeNull();
    await agent.schema("aba_finance").rpc("montar_orcamento", { p_opcao_id: opcaoA, p_profissional_id: profAgent });

    const { data: linhas } = await admin.schema("aba_finance").from("itens_orcamento")
      .select("procedimento_id, pacote_id").eq("procedimento_plano_id", c!.id);
    expect(linhas).toHaveLength(1);
    expect(linhas![0].pacote_id).toBe(pacoteId);
    expect(linhas![0].procedimento_id).toBeNull();

    // Devolve a opção A ao estado do resto da suíte: um item só.
    await admin.schema("aba_finance").from("itens_orcamento").delete().eq("procedimento_plano_id", c!.id);
    await admin.schema("aba_treatment").from("procedimentos_plano").delete().eq("id", c!.id);
  });

  // ============================================================
  // 3. QUEM APROVA, E O QUE DESFAZ A APROVAÇÃO
  // ============================================================

  it("ATAQUE: nem o `owner` nem a recepção aprovam — só o profissional que vai executar (D-F7)", async () => {
    for (const papel of ["owner", "admin"] as const) {
      const c = await clientAs(papel);
      const { error } = await c.schema("aba_finance").rpc("aprovar_orcamento", { p_orcamento_id: orcA });
      expect(codigo(error), `${papel} deveria ser recusado`).toBe("42501");
      expect((await estadoDoOrcamento(orcA)).estado).toBe("rascunho");
    }
    const { count } = await admin.schema("aba_finance").from("eventos_orcamento")
      .select("id", { count: "exact", head: true }).eq("orcamento_id", orcA);
    expect(count).toBe(0);
  });

  it("ATAQUE: UPDATE direto com carimbo forjado não aprova, e orçamento não nasce aprovado", async () => {
    const owner = await clientAs("owner");
    const forjado = await owner.schema("aba_finance").from("orcamentos")
      .update({ estado: "aprovado", aprovado_em: new Date().toISOString(), aprovado_por: ctx.userIds.agent })
      .eq("id", orcA);
    expect(codigo(forjado.error)).toBe("42501");
    expect((await estadoDoOrcamento(orcA)).estado).toBe("rascunho");

    const { data: opC } = await admin.schema("aba_treatment").from("opcoes")
      .insert({ account_id: ctx.accountId, plano_id: planoId, rotulo: "C", ordem: 3 }).select("id").single();
    const nasceAprovado = await owner.schema("aba_finance").from("orcamentos")
      .insert({ account_id: ctx.accountId, plano_id: planoId, opcao_id: opC!.id, profissional_id: profAgent,
                estado: "aprovado", aprovado_em: new Date().toISOString(), aprovado_por: ctx.userIds.agent });
    expect(codigo(nasceAprovado.error)).toBe("23514");
    const { count } = await admin.schema("aba_finance").from("orcamentos")
      .select("id", { count: "exact", head: true }).eq("opcao_id", opC!.id);
    expect(count).toBe(0);
    await admin.schema("aba_treatment").from("opcoes").delete().eq("id", opC!.id);
  });

  it("o banco diz a quem pergunta se é quem aprova — a tela não recalcula permissão", async () => {
    const agent = await clientAs("agent");
    const owner = await clientAs("owner");
    const { data: vistoPeloAgent } = await agent.schema("aba_finance").rpc("ler_orcamentos", { p_plano_id: planoId });
    const { data: vistoPeloOwner } = await owner.schema("aba_finance").rpc("ler_orcamentos", { p_plano_id: planoId });
    expect(vistoPeloAgent!.find((o: { id: string }) => o.id === orcA).sou_quem_aprova).toBe(true);
    expect(vistoPeloOwner!.find((o: { id: string }) => o.id === orcA).sou_quem_aprova).toBe(false);
  });

  it("o profissional que executa aprova — com o carimbo DELE e a trilha gravada", async () => {
    const agent = await clientAs("agent");
    const { error } = await agent.schema("aba_finance").rpc("aprovar_orcamento", { p_orcamento_id: orcA });
    expect(error).toBeNull();
    const o = await estadoDoOrcamento(orcA);
    expect(o.estado).toBe("aprovado");
    expect(o.aprovado_por).toBe(ctx.userIds.agent);
    const { data: ev } = await admin.schema("aba_finance").from("eventos_orcamento")
      .select("tipo, ator").eq("orcamento_id", orcA);
    expect(ev).toEqual([{ tipo: "aprovado", ator: ctx.userIds.agent }]);
  });

  it("ATAQUE: o profissional não dá desconto no aprovado — a alçada recusa e a aprovação FICA", async () => {
    const agent = await clientAs("agent");
    const { error } = await agent.schema("aba_finance").from("orcamentos").update({ desconto_valor: 50 }).eq("id", orcA);
    expect(codigo(error)).toBe("42501");
    const o = await estadoDoOrcamento(orcA);
    expect(o.estado).toBe("aprovado");
    expect(Number(o.desconto_valor)).toBe(0);
  });

  it("ATAQUE: orçamento aprovado não troca de profissional por UPDATE direto", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner.schema("aba_finance").from("orcamentos").update({ profissional_id: null }).eq("id", orcA);
    expect(codigo(error)).toBe("23514");
    expect((await estadoDoOrcamento(orcA)).estado).toBe("aprovado");
  });

  it("D-F3: a recepção dá 10% de desconto e o orçamento VOLTA A RASCUNHO, com o aviso de nova aprovação", async () => {
    const adminUser = await clientAs("admin");
    const { error } = await adminUser.schema("aba_finance").from("orcamentos")
      .update({ desconto_valor: 75, desconto_motivo: "10% de cortesia" }).eq("id", orcA);
    expect(error).toBeNull();

    const o = await estadoDoOrcamento(orcA);
    expect(o.estado).toBe("rascunho");
    expect(o.aprovado_em).toBeNull();
    expect(o.aprovado_por).toBeNull();
    expect(Number(o.desconto_valor)).toBe(75);

    const { data: ev } = await admin.schema("aba_finance").from("eventos_orcamento")
      .select("tipo, colunas, ator").eq("orcamento_id", orcA).order("ocorrido_em");
    expect(ev!.map((e) => e.tipo)).toEqual(["aprovado", "devolvido_a_rascunho"]);
    expect(ev![1].colunas.sort()).toEqual(["desconto_motivo", "desconto_valor"]);
    expect(ev![1].ator).toBe(ctx.userIds.admin);

    const { data } = await adminUser.schema("aba_finance").rpc("ler_orcamentos", { p_plano_id: planoId });
    const aviso = data!.find((x: { id: string }) => x.id === orcA).ultima_devolucao;
    expect(aviso).not.toBeNull();
    expect(aviso.colunas).toContain("desconto_valor");
  });

  it("o profissional REAPROVA o orçamento alterado, e o aviso some", async () => {
    const agent = await clientAs("agent");
    const { error } = await agent.schema("aba_finance").rpc("aprovar_orcamento", { p_orcamento_id: orcA });
    expect(error).toBeNull();
    expect((await estadoDoOrcamento(orcA)).estado).toBe("aprovado");
    const { data } = await agent.schema("aba_finance").rpc("ler_orcamentos", { p_plano_id: planoId });
    expect(data!.find((x: { id: string }) => x.id === orcA).ultima_devolucao).toBeNull();
  });

  it("ATAQUE: a trilha de aprovação não é escrevível por quem ela registra", async () => {
    const adminUser = await clientAs("admin");
    const { count: antes } = await admin.schema("aba_finance").from("eventos_orcamento")
      .select("id", { count: "exact", head: true }).eq("orcamento_id", orcA);
    const forja = await adminUser.schema("aba_finance").from("eventos_orcamento")
      .insert({ account_id: ctx.accountId, orcamento_id: orcA, tipo: "aprovado", ator: ctx.userIds.agent });
    expect(ehErroRls(forja.error)).toBe(true);
    const apaga = await adminUser.schema("aba_finance").from("eventos_orcamento").delete().eq("orcamento_id", orcA);
    expect(apaga.error === null || ehErroRls(apaga.error)).toBe(true);
    const { count: depois } = await admin.schema("aba_finance").from("eventos_orcamento")
      .select("id", { count: "exact", head: true }).eq("orcamento_id", orcA);
    expect(depois).toBe(antes);
  });

  it("a RECEPÇÃO chega ao orçamento sem alcance clínico — e a porta não devolve nada clínico nem registra leitura", async () => {
    // O `admin` de teste não tem concessão de prontuário: `ler_planos`
    // devolve vazio para ele. Sem a porta financeira, a recepção não teria
    // como abrir o orçamento em que precisa dar desconto.
    const adminUser = await clientAs("admin");
    const { data: planosClinicos } = await adminUser.schema("aba_treatment").rpc("ler_planos", { p_cliente_id: clienteId });
    const { count: logsAntes } = await admin.schema("aba_health").from("log_acesso")
      .select("id", { count: "exact", head: true }).eq("cliente_id", clienteId).eq("usuario_ator_id", ctx.userIds.admin);

    const { data, error } = await adminUser.schema("aba_finance").rpc("planos_orcados_do_cliente", { p_cliente_id: clienteId });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].plano_id).toBe(planoId);
    expect(data![0].orcamentos).toBe(2);
    expect(Object.keys(data![0]).sort()).toEqual(["aprovados", "criado_em", "orcamentos", "plano_id"]);

    const { count: logsDepois } = await admin.schema("aba_health").from("log_acesso")
      .select("id", { count: "exact", head: true }).eq("cliente_id", clienteId).eq("usuario_ator_id", ctx.userIds.admin);
    // Se o admin de teste tivesse alcance clínico, `ler_planos` teria
    // devolvido o plano — o caso só vale quando ele NÃO tem.
    if ((planosClinicos ?? []).length === 0) expect(logsDepois).toBe(logsAntes);
  });

  it("ATAQUE: `anon` não chama a porta da recepção", async () => {
    const { anonClient } = await import("./helpers");
    const { data, error } = await anonClient().schema("aba_finance").rpc("planos_orcados_do_cliente", { p_cliente_id: clienteId });
    expect(error !== null || (data ?? []).length === 0).toBe(true);
    expect(ehErroRls(error)).toBe(true);
  });

  it("quem NÃO tem alcance clínico geral lê as fases — sem elas a matriz não tem linha (defeito da 045)", async () => {
    // Achado pela evidência de tela: o profissional com concessão NOMINAL
    // abria o plano e não conseguia pôr item nenhum, porque `fases_select`
    // exigia `pode_planejar(NULL, ...)` — o alcance GERAL. `fases` é
    // catálogo da conta, e passou a ser lido pelo módulo.
    const agent = await clientAs("agent");
    const { data: geral } = await agent.schema("aba_health").rpc("pode_acessar", { p_cliente_id: null, p_acao: "leitura" });
    const { data: fases, error } = await agent.schema("aba_treatment").from("fases").select("id, chave");
    expect(error).toBeNull();
    expect((fases ?? []).length, `alcance geral do agent = ${geral}`).toBeGreaterThanOrEqual(6);

    // E a ESCRITA continua fechada para quem não é admin.
    const escrita = await agent.schema("aba_treatment").from("fases")
      .insert({ account_id: ctx.accountId, chave: "fase_intrusa_0308c", rotulo: "Intrusa", ordem: 99 });
    expect(ehErroRls(escrita.error)).toBe(true);
    const { count } = await admin.schema("aba_treatment").from("fases")
      .select("id", { count: "exact", head: true }).eq("chave", "fase_intrusa_0308c");
    expect(count).toBe(0);
  });

  it("as chaves novas nasceram compostas por conta — a auditoria continua em zero linhas", async () => {
    const { data, error } = await admin.rpc("fks_sem_isolamento_de_conta");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
