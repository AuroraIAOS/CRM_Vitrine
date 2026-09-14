import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import {
  adminClient,
  anonClient,
  clientAs,
  createThrowawayUser,
  deleteThrowawayUser,
  ehErroRls,
  loadContext,
  type TestContext,
} from "./helpers";

/**
 * Subetapa 03.8.b — P-sub do contrato.
 *
 * QUATRO PERGUNTAS, cada uma com um jeito diferente de dar errado em silêncio:
 *
 *   1. O ARCO — o contrato carrega procedimento avulso, pacote e plano ao
 *      mesmo tempo (D-V3), e nenhum deles aponta para outra clínica ou para o
 *      plano de outro paciente. Recusa lida pelo SQLSTATE E pelo nome da regra.
 *
 *   2. O DOCUMENTO — mesmo contrato, mesmo hash; linha diferente, hash
 *      diferente (D-V10). E assinatura sobre hash velho não assina nada.
 *
 *   3. A INVARIANTE DE EXECUÇÃO — sem as duas assinaturas, nada se executa
 *      (D-V8); o `owner` só dispensa por procedimento, por escrito (D-F11).
 *
 *   4. A TRAVA DUPLA — os dois testes obrigatórios e permanentes do plano:
 *      pagou tudo e falta face → aberto; executou tudo e há saldo → aberto.
 *      É a armadilha nomeada antes de acontecer: o simétrico do KPI "Vencido"
 *      que a 02.10 pagou.
 *
 * O FLUXO É PROVADO COM O PAPEL QUE O USA (lição da 03.8.c): o profissional é
 * o login `agent`, com concessão NOMINAL do paciente; a recepção é o `admin`,
 * sem alcance clínico; o `owner` só aparece onde a regra é dele (dispensa) ou
 * onde a regra o recusa.
 */

const codigo = (e: { code?: string } | null) => e?.code ?? null;

describe("contrato: arco, documento, assinatura, execução e trava dupla (Subetapa 03.8.b)", () => {
  const admin = adminClient();
  let ctx: TestContext;

  let pacienteA: string;
  let pacienteB: string;
  let categoriaId: string;
  let procRestauracao: string;
  let procLimpeza: string;
  let procSelante: string;
  let pacoteId: string;
  let profAgent: string;
  let faseId: string;
  let planoA: string;
  let planoB: string;
  let planoC: string;
  let opcaoA: string;
  let opcaoB: string;
  let celulaRestauracao: string;
  let celulaPacote: string;
  let celulaSelante: string;
  let orcA: string;
  let orcB: string;
  let contrato1: string;
  let contrato2: string;
  let itemAvulso1: string;
  let itemAvulso2: string;
  let hash1: string;
  let estranho: { userId: string } | null = null;
  let pacoteDeOutraConta: string;

  async function donoPg() {
    const c = new pg.Client({ connectionString: process.env.SUPABASE_TEST_DB_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();
    return c;
  }

  async function contrato(id: string) {
    const { data } = await admin
      .schema("aba_finance").from("contratos")
      .select("status, valor, valor_bruto, documento_hash, assinado_em, encerrado_em, parcelas")
      .eq("id", id).single();
    return data!;
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

  beforeAll(async () => {
    ctx = await loadContext();
    pacienteA = await inserirPessoa("Paciente A 03.8.b");
    pacienteB = await inserirPessoa("Paciente B 03.8.b");

    const { data: cat } = await admin.schema("aba_catalog").from("categorias")
      .insert({ account_id: ctx.accountId, nome: "Categoria 03.8.b" }).select("id").single();
    categoriaId = cat!.id;

    const procs: Record<string, unknown>[] = [
      { nome: "Restauração 03.8.b", preco_base: 300, unidade_lancamento: "dente", faces_minimo: 1, faces_maximo: 3 },
      { nome: "Limpeza 03.8.b", preco_base: 120 },
      { nome: "Selante 03.8.b", preco_base: 80, unidade_lancamento: "dente", faces_minimo: 1, faces_maximo: 1 },
    ];
    const ids: string[] = [];
    for (const p of procs) {
      const { data, error } = await admin.schema("aba_catalog").from("procedimentos")
        .insert({ account_id: ctx.accountId, categoria_id: categoriaId, ...p }).select("id").single();
      if (error) throw error;
      ids.push(data.id);
    }
    [procRestauracao, procLimpeza, procSelante] = ids;

    const { data: pk } = await admin.schema("aba_catalog").from("pacotes")
      .insert({ account_id: ctx.accountId, nome: "Combo limpeza 03.8.b", preco_total: 500 }).select("id").single();
    pacoteId = pk!.id;
    const { error: eItem } = await admin.schema("aba_catalog").from("itens_pacote")
      .insert({ account_id: ctx.accountId, pacote_id: pacoteId, procedimento_id: procLimpeza, sessoes_incluidas: 2 });
    if (eItem) throw eItem;

    // O PROFISSIONAL é o login `agent` (D-F7), com concessão NOMINAL do
    // paciente A — o mecanismo real pelo qual ele recebe um caso.
    const { data: func } = await admin.schema("aba_people").from("funcionarios")
      .select("id").eq("profile_id", ctx.profileIds.agent).single();
    const { data: prof, error: eProf } = await admin.schema("aba_scheduling").from("profissionais")
      .insert({ account_id: ctx.accountId, nome_exibicao: "Dra. Agent 03.8.b", funcionario_id: func!.id,
                profile_id: ctx.profileIds.agent, ativo: false, acesso_clinico: false })
      .select("id").single();
    if (eProf) throw eProf;
    profAgent = prof.id;

    const { error: eConc } = await admin.schema("aba_health").from("concessoes_prontuario")
      .insert({ account_id: ctx.accountId, usuario_concedido_id: ctx.userIds.agent, escopo: "cliente_unico",
                cliente_id: pacienteA, efeito: "permitir", motivo: "Suíte 03.8.b", concedido_por: ctx.userIds.owner });
    if (eConc) throw eConc;

    const { data: fases } = await admin.schema("aba_treatment").from("fases").select("id, chave").eq("account_id", ctx.accountId);
    faseId = fases!.find((f) => f.chave === "definitiva")!.id;

    const plano = async (cliente: string, titulo: string) => {
      const { data, error } = await admin.schema("aba_treatment").from("planos")
        .insert({ account_id: ctx.accountId, cliente_id: cliente, titulo, profissional_id: profAgent }).select("id").single();
      if (error) throw error;
      return data.id as string;
    };
    planoA = await plano(pacienteA, "Plano A 03.8.b");
    planoB = await plano(pacienteB, "Plano B 03.8.b");
    planoC = await plano(pacienteA, "Plano C 03.8.b");

    const opcao = async (planoId: string, rotulo: string, ordem: number) => {
      const { data, error } = await admin.schema("aba_treatment").from("opcoes")
        .insert({ account_id: ctx.accountId, plano_id: planoId, rotulo, ordem }).select("id").single();
      if (error) throw error;
      return data.id as string;
    };
    opcaoA = await opcao(planoA, "A", 1);
    opcaoB = await opcao(planoA, "B", 2);
    const opcaoC = await opcao(planoC, "A", 1);

    const celula = async (row: Record<string, unknown>) => {
      const { data, error } = await admin.schema("aba_treatment").from("procedimentos_plano")
        .insert({ account_id: ctx.accountId, fase_id: faseId, ...row }).select("id").single();
      if (error) throw error;
      return data.id as string;
    };
    celulaRestauracao = await celula({ plano_id: planoA, opcao_id: opcaoA, procedimento_id: procRestauracao,
                                       dente: "16", faces: ["mesial", "oclusal"] });
    celulaPacote = await celula({ plano_id: planoA, opcao_id: opcaoA, pacote_id: pacoteId });
    await celula({ plano_id: planoA, opcao_id: opcaoB, procedimento_id: procRestauracao, dente: "16", faces: ["oclusal"] });
    celulaSelante = await celula({ plano_id: planoC, opcao_id: opcaoC, procedimento_id: procSelante,
                                   dente: "26", faces: ["oclusal"] });

    // O profissional consente as opções — é o que tira as células de `proposto`.
    const agent = await clientAs("agent");
    for (const op of [opcaoA, opcaoC]) {
      const { error } = await agent.schema("aba_treatment").rpc("consentir_opcao", { p_opcao_id: op });
      if (error) throw error;
    }

    // Os orçamentos: o profissional monta; a recepção parcela em 2; o
    // profissional (re)aprova A. B fica aprovado também — é a perdedora.
    const a = await agent.schema("aba_finance").rpc("montar_orcamento", { p_opcao_id: opcaoA, p_profissional_id: profAgent });
    const b = await agent.schema("aba_finance").rpc("montar_orcamento", { p_opcao_id: opcaoB, p_profissional_id: profAgent });
    if (a.error || b.error) throw a.error ?? b.error;
    orcA = a.data as unknown as string;
    orcB = b.data as unknown as string;
    const recepcao = await clientAs("admin");
    const { error: eParc } = await recepcao.schema("aba_finance").from("orcamentos").update({ parcelas: 2 }).eq("id", orcA);
    if (eParc) throw eParc;
    for (const o of [orcA, orcB]) {
      const { error } = await agent.schema("aba_finance").rpc("aprovar_orcamento", { p_orcamento_id: o });
      if (error) throw error;
    }

    // Pacote de OUTRA clínica, para o ataque de chave estrangeira.
    estranho = await createThrowawayUser(admin, "contrato-0308b");
    const { data: contaEstranha } = await admin.from("accounts").select("id").eq("owner_user_id", estranho.userId).single();
    const { data: pkFora, error: eFora } = await admin.schema("aba_catalog").from("pacotes")
      .insert({ account_id: contaEstranha!.id, nome: "Pacote de fora 03.8.b", preco_total: 1 }).select("id").single();
    if (eFora) throw eFora;
    pacoteDeOutraConta = pkFora.id;
  });

  afterAll(async () => {
    // Conexão de DONO com `DISABLE TRIGGER USER` (mesmo método das suítes 20
    // e 21): contrato assinado, execução afirmada e trilha não se apagam por
    // nenhum caminho da aplicação — e é bom que continue assim.
    const dono = await donoPg();
    const tabelas = [
      "aba_treatment.execucoes_face", "aba_finance.execucoes_item_contrato", "aba_finance.eventos_contrato",
      "aba_finance.assinaturas_contrato", "aba_finance.itens_contrato", "aba_finance.pagamentos",
      "aba_finance.parcelas_contrato", "aba_finance.itens_fatura", "aba_finance.faturas", "aba_finance.extrato_pacote",
      "aba_finance.saldos_pacote", "aba_finance.pacotes_cliente", "aba_finance.contratos", "aba_finance.eventos_orcamento",
      "aba_finance.itens_orcamento", "aba_finance.orcamentos", "aba_catalog.dispensas_contrato",
      "aba_treatment.procedimentos_plano", "aba_treatment.opcoes", "aba_treatment.planos",
    ];
    const clientes = [pacienteA, pacienteB].filter(Boolean);
    try {
      for (const t of tabelas) await dono.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
      const porCliente = `(SELECT id FROM aba_finance.contratos WHERE cliente_id = ANY($1))`;
      await dono.query(`DELETE FROM aba_treatment.execucoes_face WHERE plano_id IN (SELECT id FROM aba_treatment.planos WHERE cliente_id = ANY($1))`, [clientes]);
      await dono.query(`DELETE FROM aba_finance.execucoes_item_contrato WHERE item_contrato_id IN (SELECT id FROM aba_finance.itens_contrato WHERE contrato_id IN ${porCliente})`, [clientes]);
      await dono.query(`DELETE FROM aba_finance.eventos_contrato WHERE contrato_id IN ${porCliente}`, [clientes]);
      await dono.query(`DELETE FROM aba_finance.assinaturas_contrato WHERE contrato_id IN ${porCliente}`, [clientes]);
      await dono.query(`DELETE FROM aba_finance.itens_contrato WHERE contrato_id IN ${porCliente}`, [clientes]);
      await dono.query(`DELETE FROM aba_finance.pagamentos WHERE fatura_id IN (SELECT id FROM aba_finance.faturas WHERE cliente_id = ANY($1))`, [clientes]);
      await dono.query(`DELETE FROM aba_finance.parcelas_contrato WHERE contrato_id IN ${porCliente}`, [clientes]);
      await dono.query(`DELETE FROM aba_finance.itens_fatura WHERE fatura_id IN (SELECT id FROM aba_finance.faturas WHERE cliente_id = ANY($1))`, [clientes]);
      await dono.query(`DELETE FROM aba_finance.faturas WHERE cliente_id = ANY($1)`, [clientes]);
      await dono.query(`DELETE FROM aba_finance.extrato_pacote WHERE pacote_cliente_id IN (SELECT id FROM aba_finance.pacotes_cliente WHERE cliente_id = ANY($1))`, [clientes]);
      await dono.query(`DELETE FROM aba_finance.saldos_pacote WHERE pacote_cliente_id IN (SELECT id FROM aba_finance.pacotes_cliente WHERE cliente_id = ANY($1))`, [clientes]);
      await dono.query(`DELETE FROM aba_finance.pacotes_cliente WHERE cliente_id = ANY($1)`, [clientes]);
      await dono.query(`DELETE FROM aba_finance.contratos WHERE cliente_id = ANY($1)`, [clientes]);
      const planos = `(SELECT id FROM aba_treatment.planos WHERE cliente_id = ANY($1))`;
      await dono.query(`DELETE FROM aba_finance.eventos_orcamento WHERE orcamento_id IN (SELECT id FROM aba_finance.orcamentos WHERE plano_id IN ${planos})`, [clientes]);
      await dono.query(`DELETE FROM aba_finance.itens_orcamento WHERE orcamento_id IN (SELECT id FROM aba_finance.orcamentos WHERE plano_id IN ${planos})`, [clientes]);
      await dono.query(`DELETE FROM aba_finance.orcamentos WHERE plano_id IN ${planos}`, [clientes]);
      await dono.query(`DELETE FROM aba_catalog.dispensas_contrato WHERE procedimento_id = ANY($1)`, [[procRestauracao, procLimpeza, procSelante].filter(Boolean)]);
      await dono.query(`DELETE FROM aba_treatment.procedimentos_plano WHERE plano_id IN ${planos}`, [clientes]);
      await dono.query(`DELETE FROM aba_treatment.opcoes WHERE plano_id IN ${planos}`, [clientes]);
      await dono.query(`DELETE FROM aba_treatment.planos WHERE cliente_id = ANY($1)`, [clientes]);
    } finally {
      for (const t of tabelas) await dono.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`).catch(() => {});
      await dono.end();
    }

    await admin.schema("aba_health").from("concessoes_prontuario").delete().in("cliente_id", clientes);
    await admin.schema("aba_health").from("log_acesso").delete().in("cliente_id", clientes);
    if (profAgent) await admin.schema("aba_scheduling").from("profissionais").delete().eq("id", profAgent);
    if (pacoteId) {
      await admin.schema("aba_catalog").from("itens_pacote").delete().eq("pacote_id", pacoteId);
      await admin.schema("aba_catalog").from("pacotes").delete().eq("id", pacoteId);
    }
    for (const id of [procRestauracao, procLimpeza, procSelante]) {
      if (id) await admin.schema("aba_catalog").from("procedimentos").delete().eq("id", id);
    }
    if (categoriaId) await admin.schema("aba_catalog").from("categorias").delete().eq("id", categoriaId);
    for (const id of clientes) {
      await admin.schema("aba_people").from("clientes").delete().eq("id", id);
      await admin.schema("aba_people").from("pessoas").delete().eq("id", id);
    }
    if (pacoteDeOutraConta) await admin.schema("aba_catalog").from("pacotes").delete().eq("id", pacoteDeOutraConta);
    if (estranho) await deleteThrowawayUser(admin, estranho.userId);
  });

  // ============================================================
  // 1. CONTRATAR A OPÇÃO VENCEDORA, E O ARCO
  // ============================================================

  it("ATAQUE: contratar é da recepção — o profissional e o viewer são recusados", async () => {
    for (const papel of ["agent", "viewer"] as const) {
      const c = await clientAs(papel);
      const { error } = await c.schema("aba_finance").rpc("contratar_opcao", { p_orcamento_id: orcA });
      expect(codigo(error), papel).toBe("42501");
    }
    const { count } = await admin.schema("aba_finance").from("contratos")
      .select("id", { count: "exact", head: true }).eq("orcamento_id", orcA);
    expect(count).toBe(0);
  });

  it("a recepção contrata a opção A: o plano vira UMA linha, o pacote outra, e a opção B fica recusada (D-F9)", async () => {
    const recepcao = await clientAs("admin");
    const { data, error } = await recepcao.schema("aba_finance").rpc("contratar_opcao", { p_orcamento_id: orcA });
    expect(error).toBeNull();
    contrato1 = data as unknown as string;

    const { data: itens } = await admin.schema("aba_finance").from("itens_contrato")
      .select("procedimento_id, pacote_id, plano_id, valor_unitario, item_orcamento_id, degrau").eq("contrato_id", contrato1);
    expect(itens).toHaveLength(2);
    const plano = itens!.find((i) => i.plano_id)!;
    const pacote = itens!.find((i) => i.pacote_id)!;
    expect(plano.plano_id).toBe(planoA);
    expect(Number(plano.valor_unitario)).toBe(300);
    expect(plano.degrau).toBeNull();
    expect(pacote.pacote_id).toBe(pacoteId);
    expect(Number(pacote.valor_unitario)).toBe(500);
    expect(pacote.item_orcamento_id).not.toBeNull();

    const c = await contrato(contrato1);
    expect(c.status).toBe("rascunho");
    expect(Number(c.valor)).toBe(800);
    expect(c.parcelas).toBe(2);

    const { data: b } = await admin.schema("aba_finance").from("orcamentos").select("estado").eq("id", orcB).single();
    expect(b!.estado).toBe("recusado");
  });

  it("ATAQUE: a mesma opção não se contrata duas vezes, e a perdedora não se contrata", async () => {
    const recepcao = await clientAs("admin");
    const de_novo = await recepcao.schema("aba_finance").rpc("contratar_opcao", { p_orcamento_id: orcA });
    expect(codigo(de_novo.error)).toBe("23514");
    const perdedora = await recepcao.schema("aba_finance").rpc("contratar_opcao", { p_orcamento_id: orcB });
    expect(codigo(perdedora.error)).toBe("23514");
  });

  it("a recepção acrescenta um procedimento AVULSO: o mesmo contrato carrega plano, pacote e procedimento", async () => {
    const recepcao = await clientAs("admin");
    const { data, error } = await recepcao.schema("aba_finance").rpc("acrescentar_item_contrato", {
      p_contrato_id: contrato1, p_procedimento_id: procLimpeza, p_pacote_id: null, p_quantidade: 1,
    });
    expect(error).toBeNull();
    itemAvulso1 = data as unknown as string;
    const { data: itens } = await admin.schema("aba_finance").from("itens_contrato")
      .select("procedimento_id, pacote_id, plano_id, degrau, valor_unitario").eq("contrato_id", contrato1);
    expect(itens!.filter((i) => i.plano_id)).toHaveLength(1);
    expect(itens!.filter((i) => i.pacote_id)).toHaveLength(1);
    const avulso = itens!.find((i) => i.procedimento_id)!;
    expect(avulso.degrau).toBe("catalogo");
    expect(Number(avulso.valor_unitario)).toBe(120);
    expect(Number((await contrato(contrato1)).valor)).toBe(920);
  });

  it("ATAQUE: o profissional não acrescenta linha (é dinheiro) — e ninguém escreve linha direto pelo PostgREST", async () => {
    const agent = await clientAs("agent");
    const pelaFuncao = await agent.schema("aba_finance").rpc("acrescentar_item_contrato", {
      p_contrato_id: contrato1, p_procedimento_id: procLimpeza, p_pacote_id: null,
    });
    expect(codigo(pelaFuncao.error)).toBe("42501");

    const recepcao = await clientAs("admin");
    const direto = await recepcao.schema("aba_finance").from("itens_contrato")
      .insert({ account_id: ctx.accountId, contrato_id: contrato1, procedimento_id: procLimpeza, degrau: "catalogo", valor_unitario: 1 });
    expect(ehErroRls(direto.error)).toBe(true);
    const { count } = await admin.schema("aba_finance").from("itens_contrato")
      .select("id", { count: "exact", head: true }).eq("contrato_id", contrato1);
    expect(count).toBe(3);
  });

  it("ATAQUE: a linha recusa ZERO braços e recusa DOIS — pelo CHECK do arco, com o nome dele", async () => {
    const base = { account_id: ctx.accountId, contrato_id: contrato1, quantidade: 1, valor_unitario: 1 };
    const zero = await admin.schema("aba_finance").from("itens_contrato").insert({ ...base, degrau: "catalogo" });
    expect(codigo(zero.error)).toBe("23514");
    expect(zero.error!.message).toContain("itens_contrato_um_item");

    // Dois braços SEM mais nenhuma regra ferida: procedimento e pacote, com
    // degrau coerente e quantidade 1 (a lição da 03.8.c).
    const dois = await admin.schema("aba_finance").from("itens_contrato")
      .insert({ ...base, procedimento_id: procLimpeza, pacote_id: pacoteId, degrau: "catalogo" });
    expect(codigo(dois.error)).toBe("23514");
    expect(dois.error!.message).toContain("itens_contrato_um_item");
  });

  it("ATAQUE: o plano de OUTRO PACIENTE não entra no contrato (gatilho) — e o pacote de OUTRA CLÍNICA também não (23503)", async () => {
    const outroPaciente = await admin.schema("aba_finance").from("itens_contrato")
      .insert({ account_id: ctx.accountId, contrato_id: contrato1, plano_id: planoB, valor_unitario: 1 });
    expect(codigo(outroPaciente.error)).toBe("23514");
    expect(outroPaciente.error!.message).toMatch(/outro paciente/);

    const outraClinica = await admin.schema("aba_finance").from("itens_contrato")
      .insert({ account_id: ctx.accountId, contrato_id: contrato1, pacote_id: pacoteDeOutraConta, degrau: "catalogo", valor_unitario: 1 });
    expect(codigo(outraClinica.error)).toBe("23503");

    const recepcao = await clientAs("admin");
    const pelaFuncao = await recepcao.schema("aba_finance").rpc("acrescentar_item_contrato", {
      p_contrato_id: contrato1, p_procedimento_id: null, p_pacote_id: pacoteDeOutraConta,
    });
    expect(pelaFuncao.error).not.toBeNull();
    const { count } = await admin.schema("aba_finance").from("itens_contrato")
      .select("id", { count: "exact", head: true }).eq("contrato_id", contrato1);
    expect(count).toBe(3);
  });

  it("as chaves novas nasceram compostas por conta — a auditoria continua em zero linhas", async () => {
    const { data, error } = await admin.rpc("fks_sem_isolamento_de_conta");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  // ============================================================
  // 2. O DOCUMENTO CANÔNICO
  // ============================================================

  it("emitir gera o documento com hash; o MESMO contrato dá o MESMO hash, e o texto guardado bate com ele", async () => {
    const recepcao = await clientAs("admin");
    const { data, error } = await recepcao.schema("aba_finance").rpc("emitir_documento_contrato", { p_contrato_id: contrato1 });
    expect(error).toBeNull();
    hash1 = data as unknown as string;
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);

    const { data: conf } = await recepcao.schema("aba_finance").rpc("conferir_documento_contrato", { p_contrato_id: contrato1 });
    expect(conf![0].hash_guardado).toBe(hash1);
    expect(conf![0].hash_do_texto_guardado).toBe(hash1);
    expect(conf![0].hash_renderizado_agora).toBe(hash1);
    expect(conf![0].integro).toBe(true);

    const { data: segunda } = await recepcao.schema("aba_finance").rpc("conferir_documento_contrato", { p_contrato_id: contrato1 });
    expect(segunda![0].hash_renderizado_agora).toBe(hash1);

    // O documento não leva dado clínico: nem o dente, nem as faces, nem o título do plano.
    const { data: doc } = await admin.schema("aba_finance").from("contratos").select("documento_html").eq("id", contrato1).single();
    expect(doc!.documento_html).toContain("Restauração 03.8.b");
    expect(doc!.documento_html).toContain("R$ 920,00");
    expect(doc!.documento_html).not.toMatch(/dente|mesial|oclusal|Plano A 03\.8\.b/);
  });

  it("com o avulso, o contrato NÃO é cópia fiel do orçamento — e a assinatura do profissional não deriva da aprovação", async () => {
    const { data } = await admin.schema("aba_finance").from("assinaturas_contrato").select("parte").eq("contrato_id", contrato1);
    expect(data).toEqual([]);
  });

  it("mudar uma linha DESCARTA o documento e muda o hash; voltar ao mesmo conteúdo devolve o MESMO hash", async () => {
    const recepcao = await clientAs("admin");
    const { error: eRem } = await recepcao.schema("aba_finance").rpc("remover_item_contrato", { p_item_id: itemAvulso1 });
    expect(eRem).toBeNull();
    expect((await contrato(contrato1)).documento_hash).toBeNull();

    const { data: h2 } = await recepcao.schema("aba_finance").rpc("emitir_documento_contrato", { p_contrato_id: contrato1 });
    expect(h2).not.toBe(hash1);

    // Sem o avulso, o contrato É cópia fiel: a assinatura do profissional
    // deriva da aprovação dele (D-F3, D-F7), sobre o hash novo.
    const { data: ass } = await admin.schema("aba_finance").from("assinaturas_contrato")
      .select("parte, via, hash_assinado, registrada_por").eq("contrato_id", contrato1);
    expect(ass).toEqual([{ parte: "profissional", via: "aprovacao_orcamento", hash_assinado: h2, registrada_por: ctx.userIds.agent }]);

    const { data: novo } = await recepcao.schema("aba_finance").rpc("acrescentar_item_contrato", {
      p_contrato_id: contrato1, p_procedimento_id: procLimpeza, p_pacote_id: null, p_quantidade: 1,
    });
    itemAvulso1 = novo as unknown as string;
    // A assinatura sobre o hash que deixou de descrever o contrato some junto.
    const { count } = await admin.schema("aba_finance").from("assinaturas_contrato")
      .select("id", { count: "exact", head: true }).eq("contrato_id", contrato1);
    expect(count).toBe(0);

    const { data: h3 } = await recepcao.schema("aba_finance").rpc("emitir_documento_contrato", { p_contrato_id: contrato1 });
    expect(h3).toBe(hash1);
  });

  it("ATAQUE: ninguém escreve documento, hash ou carimbo direto; e assinatura é trilha não forjável", async () => {
    const recepcao = await clientAs("admin");
    const hash = await recepcao.schema("aba_finance").from("contratos")
      .update({ documento_hash: "0".repeat(64) }).eq("id", contrato1);
    expect(ehErroRls(hash.error)).toBe(true);

    const forja = await recepcao.schema("aba_finance").from("assinaturas_contrato").insert({
      account_id: ctx.accountId, contrato_id: contrato1, parte: "paciente", via: "presencial",
      hash_assinado: hash1, assinada_em: new Date().toISOString(), registrada_por: ctx.userIds.admin,
    });
    expect(ehErroRls(forja.error)).toBe(true);
    expect((await contrato(contrato1)).documento_hash).toBe(hash1);
  });

  // ============================================================
  // 3. ASSINATURA E A INVARIANTE DE EXECUÇÃO (D-V8, D-V9)
  // ============================================================

  it("ATAQUE: com o contrato em RASCUNHO, o profissional não executa — nem por face, nem pelo estado da célula", async () => {
    const agent = await clientAs("agent");
    const face = await agent.schema("aba_treatment").from("execucoes_face")
      .insert({ account_id: ctx.accountId, plano_id: planoA, procedimento_plano_id: celulaRestauracao, face: "mesial" });
    expect(codigo(face.error)).toBe("23514");
    expect(face.error!.message).toMatch(/D-V8/);

    const estado = await agent.schema("aba_treatment").from("procedimentos_plano")
      .update({ estado: "em_execucao" }).eq("id", celulaRestauracao);
    expect(codigo(estado.error)).toBe("23514");
    expect(estado.error!.message).toMatch(/D-V8/);

    const { count } = await admin.schema("aba_treatment").from("execucoes_face")
      .select("id", { count: "exact", head: true }).eq("procedimento_plano_id", celulaRestauracao);
    expect(count).toBe(0);
  });

  it("ATAQUE: o contrato não vira `assinado` nem `ativo` por UPDATE direto, e o paciente não assina antes do profissional", async () => {
    const recepcao = await clientAs("admin");
    const assinado = await recepcao.schema("aba_finance").from("contratos").update({ status: "assinado" }).eq("id", contrato1);
    expect(codigo(assinado.error)).toBe("23514");
    const ativo = await recepcao.schema("aba_finance").from("contratos").update({ status: "ativo" }).eq("id", contrato1);
    expect(codigo(ativo.error)).toBe("23514");

    const antes = await recepcao.schema("aba_finance").rpc("registrar_assinatura_paciente", { p_contrato_id: contrato1, p_hash: hash1 });
    expect(codigo(antes.error)).toBe("23514");
    expect(antes.error!.message).toMatch(/profissional assina antes/);
    expect((await contrato(contrato1)).status).toBe("rascunho");
  });

  it("ATAQUE: pela parte profissional só assina o profissional responsável — o `owner` é recusado (D-F7) — e só sobre o hash atual", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner.schema("aba_finance").rpc("assinar_contrato_como_profissional", { p_contrato_id: contrato1, p_hash: hash1 });
    expect(codigo(error)).toBe("42501");

    const agent = await clientAs("agent");
    const hashVelho = await agent.schema("aba_finance").rpc("assinar_contrato_como_profissional", {
      p_contrato_id: contrato1, p_hash: "f".repeat(64),
    });
    expect(codigo(hashVelho.error)).toBe("23514");
  });

  it("o profissional assina em pessoa; a recepção registra o paciente; o contrato vira ASSINADO e solta as faturas previstas", async () => {
    const agent = await clientAs("agent");
    const { error: e1 } = await agent.schema("aba_finance").rpc("assinar_contrato_como_profissional", { p_contrato_id: contrato1, p_hash: hash1 });
    expect(e1).toBeNull();

    // O profissional não registra a assinatura do paciente: é da recepção.
    const pelaCadeira = await agent.schema("aba_finance").rpc("registrar_assinatura_paciente", { p_contrato_id: contrato1, p_hash: hash1 });
    expect(codigo(pelaCadeira.error)).toBe("42501");

    const recepcao = await clientAs("admin");
    const { error: e2 } = await recepcao.schema("aba_finance").rpc("registrar_assinatura_paciente", { p_contrato_id: contrato1, p_hash: hash1 });
    expect(e2).toBeNull();

    const c = await contrato(contrato1);
    expect(c.status).toBe("assinado");
    expect(c.assinado_em).not.toBeNull();

    // INVERSÃO BRASILEIRA: a cobrança se solta na assinatura, antes de
    // qualquer execução — duas faturas previstas, que somam o contrato.
    const { data: faturas } = await admin.schema("aba_finance").from("faturas")
      .select("id, status, valor").eq("contrato_id", contrato1).order("data_vencimento");
    expect(faturas).toHaveLength(2);
    expect(faturas!.every((f) => f.status === "rascunho")).toBe(true);
    expect(faturas!.reduce((s, f) => s + Number(f.valor), 0)).toBe(920);

    // O pacote foi VENDIDO na assinatura, e o saldo está ligado à linha.
    const { data: linha } = await admin.schema("aba_finance").from("itens_contrato")
      .select("pacote_cliente_id").eq("contrato_id", contrato1).not("pacote_id", "is", null).single();
    expect(linha!.pacote_cliente_id).not.toBeNull();
    const { data: saldo } = await admin.schema("aba_finance").from("saldos_pacote")
      .select("sessoes_totais, sessoes_usadas").eq("pacote_cliente_id", linha!.pacote_cliente_id);
    expect(saldo).toEqual([{ sessoes_totais: 2, sessoes_usadas: 0 }]);
  });

  it("a cadeia plano → contrato → fatura fecha por query", async () => {
    const dono = await donoPg();
    try {
      const { rows } = await dono.query(
        `SELECT p.id AS plano, c.id AS contrato, count(f.id)::int AS faturas
           FROM aba_treatment.planos p
           JOIN aba_finance.itens_contrato i ON i.plano_id = p.id AND i.account_id = p.account_id
           JOIN aba_finance.contratos c ON c.id = i.contrato_id AND c.account_id = i.account_id
           JOIN aba_finance.faturas f ON f.contrato_id = c.id AND f.account_id = c.account_id
          WHERE p.id = $1 GROUP BY p.id, c.id`, [planoA]);
      expect(rows).toEqual([{ plano: planoA, contrato: contrato1, faturas: 2 }]);
    } finally {
      await dono.end();
    }
  });

  it("ATAQUE: contrato assinado congela — sem desconto novo, sem linha nova, sem cancelar, sem apagar; e o orçamento contratado também não muda", async () => {
    const recepcao = await clientAs("admin");
    const desconto = await recepcao.schema("aba_finance").from("contratos").update({ desconto_valor: 10 }).eq("id", contrato1);
    expect(codigo(desconto.error)).toBe("23514");
    const linha = await recepcao.schema("aba_finance").rpc("acrescentar_item_contrato", {
      p_contrato_id: contrato1, p_procedimento_id: procLimpeza, p_pacote_id: null,
    });
    expect(codigo(linha.error)).toBe("23514");
    const cancelar = await recepcao.schema("aba_finance").from("contratos").update({ status: "cancelado" }).eq("id", contrato1);
    expect(codigo(cancelar.error)).toBe("23514");
    const orc = await recepcao.schema("aba_finance").from("orcamentos").update({ desconto_valor: 10 }).eq("id", orcA);
    expect(codigo(orc.error)).toBe("23514");

    // A opção contratada não ganha célula: acréscimo é contrato novo (D-V4).
    const celula = await admin.schema("aba_treatment").from("procedimentos_plano")
      .insert({ account_id: ctx.accountId, plano_id: planoA, opcao_id: opcaoA, fase_id: faseId, procedimento_id: procLimpeza });
    expect(codigo(celula.error)).toBe("23514");
    expect(celula.error!.message).toMatch(/D-V4/);

    const c = await contrato(contrato1);
    expect(c.status).toBe("assinado");
    expect(Number(c.valor)).toBe(920);
  });

  it("ATAQUE: contrato novo não nasce `ativo` nem assinado, e vender pacote solto no balcão acabou (D-F14)", async () => {
    const recepcao = await clientAs("admin");
    const ativo = await recepcao.schema("aba_finance").from("contratos")
      .insert({ account_id: ctx.accountId, cliente_id: pacienteA, status: "ativo", valor: 10 });
    expect(codigo(ativo.error)).toBe("23514");

    const agent = await clientAs("agent");
    const venda = await agent.schema("aba_finance").rpc("vender_pacote", { p_cliente_id: pacienteA, p_pacote_id: pacoteId });
    expect(venda.error).not.toBeNull();
    expect(ehErroRls(venda.error)).toBe(true);
  });

  // ============================================================
  // 4. EXECUÇÃO POR FACE (passo 36) — com o papel que executa de verdade
  // ============================================================

  it("ATAQUE: face que não é do trabalho, célula de pacote e recepção sem alcance clínico são recusadas", async () => {
    const agent = await clientAs("agent");
    const foraDoPlano = await agent.schema("aba_treatment").from("execucoes_face")
      .insert({ account_id: ctx.accountId, plano_id: planoA, procedimento_plano_id: celulaRestauracao, face: "distal" });
    expect(codigo(foraDoPlano.error)).toBe("23514");
    expect(foraDoPlano.error!.message).toMatch(/faces planejadas/);

    const pacote = await agent.schema("aba_treatment").from("execucoes_face")
      .insert({ account_id: ctx.accountId, plano_id: planoA, procedimento_plano_id: celulaPacote, face: null });
    expect(codigo(pacote.error)).toBe("23514");
    expect(pacote.error!.message).toMatch(/pacote/);

    const recepcao = await clientAs("admin");
    const semAlcance = await recepcao.schema("aba_treatment").from("execucoes_face")
      .insert({ account_id: ctx.accountId, plano_id: planoA, procedimento_plano_id: celulaRestauracao, face: "mesial" });
    expect(ehErroRls(semAlcance.error)).toBe(true);
  });

  it("o profissional marca a face executada: data e autor são do BANCO, a célula entra em execução e a escrita fica no log", async () => {
    const agent = await clientAs("agent");
    const { error } = await agent.schema("aba_treatment").from("execucoes_face")
      .insert({ account_id: ctx.accountId, plano_id: planoA, procedimento_plano_id: celulaRestauracao, face: "mesial" });
    expect(error).toBeNull();

    const { data: exec } = await admin.schema("aba_treatment").from("execucoes_face")
      .select("face, executado_por, executado_em").eq("procedimento_plano_id", celulaRestauracao);
    expect(exec).toHaveLength(1);
    expect(exec![0].executado_por).toBe(ctx.userIds.agent);
    expect(exec![0].executado_em).not.toBeNull();

    const { data: cel } = await admin.schema("aba_treatment").from("procedimentos_plano")
      .select("estado").eq("id", celulaRestauracao).single();
    expect(cel!.estado).toBe("em_execucao");

    const { count } = await admin.schema("aba_health").from("log_acesso")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", pacienteA).eq("usuario_ator_id", ctx.userIds.agent).eq("acao", "criacao")
      .contains("contexto", { tabela: "execucoes_face" });
    expect(count).toBe(1);

    const repetida = await agent.schema("aba_treatment").from("execucoes_face")
      .insert({ account_id: ctx.accountId, plano_id: planoA, procedimento_plano_id: celulaRestauracao, face: "mesial" });
    expect(codigo(repetida.error)).toBe("23505");
  });

  it("ATAQUE: a célula não vira `executado` por UPDATE direto enquanto faltar face", async () => {
    const agent = await clientAs("agent");
    const { error } = await agent.schema("aba_treatment").from("procedimentos_plano")
      .update({ estado: "executado" }).eq("id", celulaRestauracao);
    expect(codigo(error)).toBe("23514");
    expect(error!.message).toMatch(/1 de 2/);
  });

  it("a face executada sai pela leitura que registra — e é ilegível por `select` direto", async () => {
    const agent = await clientAs("agent");
    const direto = await agent.schema("aba_treatment").from("execucoes_face").select("face").eq("plano_id", planoA);
    expect(ehErroRls(direto.error)).toBe(true);

    const { data } = await agent.schema("aba_treatment").rpc("ler_planos", { p_cliente_id: pacienteA });
    const plano = data!.find((p: { id: string }) => p.id === planoA);
    const cel = plano.procedimentos.find((c: { id: string }) => c.id === celulaRestauracao);
    expect(cel.execucoes).toHaveLength(1);
    expect(cel.execucoes[0].face).toBe("mesial");
    expect(cel.execucoes[0].executado_por).toBe(ctx.userIds.agent);
  });

  // ============================================================
  // 5. A TRAVA DUPLA — os dois testes obrigatórios e permanentes
  // ============================================================

  it("TRAVA DUPLA (1/2): PAGOU TUDO e ainda falta uma face → o contrato CONTINUA ABERTO", async () => {
    const recepcao = await clientAs("admin");
    const agent = await clientAs("agent");

    // Todo o trabalho que não é a última face: o avulso e as duas sessões do pacote.
    const { error: eAvulso } = await agent.schema("aba_finance").rpc("registrar_execucao_item", { p_item_id: itemAvulso1 });
    expect(eAvulso).toBeNull();
    const { data: linha } = await admin.schema("aba_finance").from("itens_contrato")
      .select("pacote_cliente_id").eq("contrato_id", contrato1).not("pacote_id", "is", null).single();
    for (let i = 0; i < 2; i++) {
      // Consumo pelo LIVRO (`extrato_pacote`), que o gatilho aplica ao saldo —
      // o mesmo caminho do atendimento concluído, sem montar uma agenda.
      const { error } = await admin.schema("aba_finance").from("extrato_pacote").insert({
        account_id: ctx.accountId, pacote_cliente_id: linha!.pacote_cliente_id, procedimento_id: procLimpeza,
        delta: -1, motivo: "Sessão da suíte 03.8.b",
      });
      expect(error).toBeNull();
    }

    // E TODO o dinheiro.
    const { data: faturas } = await admin.schema("aba_finance").from("faturas").select("id, valor").eq("contrato_id", contrato1);
    for (const f of faturas!) {
      const { error } = await recepcao.schema("aba_finance").from("pagamentos")
        .insert({ account_id: ctx.accountId, fatura_id: f.id, valor: Number(f.valor), forma_pagamento: "pix" });
      expect(error).toBeNull();
    }

    const { data: sit } = await recepcao.schema("aba_finance").rpc("situacao_contrato", { p_contrato_id: contrato1 });
    expect(sit![0].falta_pagamento).toBe(false);
    expect(sit![0].falta_execucao).toBe(true);
    expect(sit![0].unidades_previstas).toBe(5);
    expect(sit![0].unidades_executadas).toBe(4);
    expect(sit![0].pode_encerrar).toBe(false);

    const { error } = await recepcao.schema("aba_finance").rpc("encerrar_contrato", { p_contrato_id: contrato1 });
    expect(codigo(error)).toBe("23514");
    expect(error!.message).toMatch(/falta execução \(4 de 5/);
    expect(error!.message).not.toMatch(/falta pagamento/);

    // E pelo UPDATE direto, o mesmo muro.
    const direto = await recepcao.schema("aba_finance").from("contratos").update({ status: "encerrado" }).eq("id", contrato1);
    expect(codigo(direto.error)).toBe("23514");
    expect((await contrato(contrato1)).status).toBe("assinado");
  });

  it("TRAVA DUPLA (2/2): EXECUTOU TUDO e há SALDO DEVEDOR → o contrato CONTINUA ABERTO", async () => {
    const recepcao = await clientAs("admin");
    const agent = await clientAs("agent");

    const { data: c2 } = await recepcao.schema("aba_finance").rpc("criar_contrato_avulso", {
      p_cliente_id: pacienteA, p_profissional_id: profAgent,
    });
    contrato2 = c2 as unknown as string;
    const { data: it2 } = await recepcao.schema("aba_finance").rpc("acrescentar_item_contrato", {
      p_contrato_id: contrato2, p_procedimento_id: procLimpeza, p_pacote_id: null, p_quantidade: 1,
    });
    itemAvulso2 = it2 as unknown as string;
    const { data: h } = await recepcao.schema("aba_finance").rpc("emitir_documento_contrato", { p_contrato_id: contrato2 });
    // Sem orçamento, nada deriva: o profissional assina em pessoa.
    expect((await agent.schema("aba_finance").rpc("assinar_contrato_como_profissional", { p_contrato_id: contrato2, p_hash: h })).error).toBeNull();
    expect((await recepcao.schema("aba_finance").rpc("registrar_assinatura_paciente", { p_contrato_id: contrato2, p_hash: h })).error).toBeNull();

    const exec = await agent.schema("aba_finance").rpc("registrar_execucao_item", { p_item_id: itemAvulso2 });
    expect(exec.error).toBeNull();
    const alem = await agent.schema("aba_finance").rpc("registrar_execucao_item", { p_item_id: itemAvulso2 });
    expect(codigo(alem.error)).toBe("23514");

    const { data: sit } = await recepcao.schema("aba_finance").rpc("situacao_contrato", { p_contrato_id: contrato2 });
    expect(sit![0].falta_execucao).toBe(false);
    expect(sit![0].falta_pagamento).toBe(true);
    expect(Number(sit![0].saldo_devedor)).toBe(120);

    const { error } = await recepcao.schema("aba_finance").rpc("encerrar_contrato", { p_contrato_id: contrato2 });
    expect(codigo(error)).toBe("23514");
    expect(error!.message).toMatch(/falta pagamento/);
    expect(error!.message).not.toMatch(/falta execução/);
    expect((await contrato(contrato2)).status).toBe("assinado");
  });

  it("ATAQUE: a recepção não afirma execução clínica", async () => {
    const recepcao = await clientAs("admin");
    const { error } = await recepcao.schema("aba_finance").rpc("registrar_execucao_item", { p_item_id: itemAvulso2 });
    expect(codigo(error)).toBe("42501");
  });

  it("com as DUAS metades satisfeitas, e só então, o contrato se encerra", async () => {
    const recepcao = await clientAs("admin");
    const agent = await clientAs("agent");

    // Contrato 1: a última face.
    const { error: eFace } = await agent.schema("aba_treatment").from("execucoes_face")
      .insert({ account_id: ctx.accountId, plano_id: planoA, procedimento_plano_id: celulaRestauracao, face: "oclusal" });
    expect(eFace).toBeNull();
    const { data: cel } = await admin.schema("aba_treatment").from("procedimentos_plano")
      .select("estado, executado_em").eq("id", celulaRestauracao).single();
    expect(cel!.estado).toBe("executado");
    expect(cel!.executado_em).not.toBeNull();
    expect((await recepcao.schema("aba_finance").rpc("encerrar_contrato", { p_contrato_id: contrato1 })).error).toBeNull();
    const c1 = await contrato(contrato1);
    expect(c1.status).toBe("encerrado");
    expect(c1.encerrado_em).not.toBeNull();

    // Contrato 2: o pagamento.
    const { data: f2 } = await admin.schema("aba_finance").from("faturas").select("id, valor").eq("contrato_id", contrato2).single();
    await recepcao.schema("aba_finance").from("pagamentos")
      .insert({ account_id: ctx.accountId, fatura_id: f2!.id, valor: Number(f2!.valor), forma_pagamento: "dinheiro" });
    expect((await recepcao.schema("aba_finance").rpc("encerrar_contrato", { p_contrato_id: contrato2 })).error).toBeNull();
    expect((await contrato(contrato2)).status).toBe("encerrado");

    const { data: ev } = await admin.schema("aba_finance").from("eventos_contrato")
      .select("tipo").eq("contrato_id", contrato1).order("ocorrido_em");
    expect(ev!.map((e) => e.tipo)).toEqual(expect.arrayContaining(["criado", "documento_emitido", "assinado", "encerrado"]));
  });

  // ============================================================
  // 6. A DISPENSA DO OWNER (D-V8, D-F11)
  // ============================================================

  it("D-V8: sem contrato, o selante não se executa; a recepção não dispensa; o `owner` dispensa POR ESCRITO e só então executa", async () => {
    const agent = await clientAs("agent");
    const semContrato = await agent.schema("aba_treatment").from("execucoes_face")
      .insert({ account_id: ctx.accountId, plano_id: planoC, procedimento_plano_id: celulaSelante, face: "oclusal" });
    expect(codigo(semContrato.error)).toBe("23514");

    const recepcao = await clientAs("admin");
    const pelaRecepcao = await recepcao.schema("aba_catalog").from("dispensas_contrato")
      .insert({ account_id: ctx.accountId, procedimento_id: procSelante, justificativa: "Procedimento simples e de baixo risco." });
    expect(ehErroRls(pelaRecepcao.error)).toBe(true);

    const owner = await clientAs("owner");
    const curta = await owner.schema("aba_catalog").from("dispensas_contrato")
      .insert({ account_id: ctx.accountId, procedimento_id: procSelante, justificativa: "ok" });
    expect(codigo(curta.error)).toBe("23514");
    expect(curta.error!.message).toContain("dispensas_contrato_justificativa_escrita");

    const { data: disp, error } = await owner.schema("aba_catalog").from("dispensas_contrato")
      .insert({ account_id: ctx.accountId, procedimento_id: procSelante,
                justificativa: "Selante em consultório: risco assumido pelo proprietário." })
      .select("id, dispensada_por, dispensada_em").single();
    expect(error).toBeNull();
    expect(disp!.dispensada_por).toBe(ctx.userIds.owner);

    const { data: liberadas } = await agent.schema("aba_finance").rpc("execucao_liberada_no_plano", { p_plano_id: planoC });
    expect(liberadas).toEqual([{ celula_id: celulaSelante, liberada_por: "dispensa" }]);

    const comDispensa = await agent.schema("aba_treatment").from("execucoes_face")
      .insert({ account_id: ctx.accountId, plano_id: planoC, procedimento_plano_id: celulaSelante, face: "oclusal" });
    expect(comDispensa.error).toBeNull();

    // A dispensa não se reescreve; revoga-se, com autor.
    const reescrita = await owner.schema("aba_catalog").from("dispensas_contrato")
      .update({ revogada_em: new Date().toISOString(), justificativa: "outra coisa qualquer escrita aqui" } as never).eq("id", disp!.id);
    expect(reescrita.error).not.toBeNull();
    const { error: eRev } = await owner.schema("aba_catalog").from("dispensas_contrato")
      .update({ revogada_em: new Date().toISOString() }).eq("id", disp!.id);
    expect(eRev).toBeNull();
    const { data: rev } = await admin.schema("aba_catalog").from("dispensas_contrato")
      .select("revogada_por, revogada_em").eq("id", disp!.id).single();
    expect(rev!.revogada_por).toBe(ctx.userIds.owner);
  });

  // ============================================================
  // 7. O CARDÁPIO E AS PORTAS DE LEITURA
  // ============================================================

  it("o cardápio mostra o plano só ao paciente dono dele — e a recepção, sem alcance clínico, não vê plano nenhum", async () => {
    const agent = await clientAs("agent");
    const { data: doA } = await agent.schema("aba_finance").rpc("ofertas_para", { p_cliente_id: pacienteA });
    const planos = (doA ?? []).filter((o: { tipo: string }) => o.tipo === "plano").map((o: { item_id: string }) => o.item_id);
    expect(planos).toEqual(expect.arrayContaining([planoA, planoC]));
    expect(planos).not.toContain(planoB);
    expect((doA ?? []).some((o: { tipo: string; item_id: string }) => o.tipo === "pacote" && o.item_id === pacoteId)).toBe(true);

    const recepcao = await clientAs("admin");
    const { data: vistaRecepcao } = await recepcao.schema("aba_finance").rpc("ofertas_para", { p_cliente_id: pacienteA });
    expect((vistaRecepcao ?? []).filter((o: { tipo: string }) => o.tipo === "plano")).toEqual([]);
  });

  it("a recepção lê os contratos do paciente com linhas, assinaturas e situação — sem nada clínico e sem log", async () => {
    const recepcao = await clientAs("admin");
    const { count: antes } = await admin.schema("aba_health").from("log_acesso")
      .select("id", { count: "exact", head: true }).eq("cliente_id", pacienteA).eq("usuario_ator_id", ctx.userIds.admin);
    const { data, error } = await recepcao.schema("aba_finance").rpc("ler_contratos_do_cliente", { p_cliente_id: pacienteA });
    expect(error).toBeNull();
    const c1 = data!.find((c: { id: string }) => c.id === contrato1);
    expect(c1.itens.map((i: { tipo: string }) => i.tipo).sort()).toEqual(["pacote", "plano", "procedimento"]);
    expect(c1.assinaturas.map((a: { parte: string }) => a.parte)).toEqual(["paciente", "profissional"]);
    expect(c1.situacao.pode_encerrar).toBe(false);
    expect(JSON.stringify(c1)).not.toMatch(/mesial|oclusal|"dente"/);
    const { count: depois } = await admin.schema("aba_health").from("log_acesso")
      .select("id", { count: "exact", head: true }).eq("cliente_id", pacienteA).eq("usuario_ator_id", ctx.userIds.admin);
    expect(depois).toBe(antes);

    const anon = await anonClient().schema("aba_finance").rpc("ler_contratos_do_cliente", { p_cliente_id: pacienteA });
    expect(ehErroRls(anon.error)).toBe(true);
  });

  it("privilégio de coluna MEDIDO no catálogo: documento, carimbo, face e linhas fora do alcance de escrita", async () => {
    const dono = await donoPg();
    try {
      const { rows } = await dono.query(`
        SELECT
          has_column_privilege('authenticated', 'aba_finance.contratos', 'documento_hash', 'UPDATE') AS doc_update,
          has_column_privilege('authenticated', 'aba_finance.contratos', 'assinado_em', 'UPDATE') AS assinado_update,
          has_column_privilege('authenticated', 'aba_finance.contratos', 'status', 'UPDATE') AS status_update,
          has_column_privilege('authenticated', 'aba_treatment.execucoes_face', 'face', 'SELECT') AS face_select,
          has_column_privilege('authenticated', 'aba_treatment.execucoes_face', 'executado_por', 'SELECT') AS autor_select,
          has_table_privilege('authenticated', 'aba_finance.itens_contrato', 'INSERT') AS itens_insert,
          has_table_privilege('authenticated', 'aba_finance.assinaturas_contrato', 'INSERT') AS assinaturas_insert,
          has_function_privilege('authenticated', 'aba_finance.vender_pacote(uuid,uuid,numeric,uuid,timestamptz)', 'EXECUTE') AS vender`);
      expect(rows[0]).toEqual({
        doc_update: false, assinado_update: false, status_update: true,
        face_select: false, autor_select: true,
        itens_insert: false, assinaturas_insert: false, vender: false,
      });
    } finally {
      await dono.end();
    }
  });
});
