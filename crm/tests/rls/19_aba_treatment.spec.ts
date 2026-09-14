import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, clientAs, ehErroRls, loadContext, type TestContext } from "./helpers";

/**
 * Subetapa 03.8 — P-sub de `aba_treatment`.
 *
 * O QUE MUDA O NÍVEL DE RISCO E EXIGE SUÍTE PRÓPRIA. `aba_treatment` não
 * é uma tabela clínica, e ainda assim as linhas dele carregam DENTE e
 * FACE — que são dado de saúde. O schema novo é a primeira superfície do
 * produto que guarda dado de saúde FORA de `aba_health`, e por isso a
 * pergunta que esta suíte responde não é "a RLS está ligada?", é: **o
 * alcance clínico governa o plano com a mesma severidade com que governa
 * o prontuário, ou o schema novo abriu uma porta lateral?**
 *
 * Três famílias de caso, e as três importam por motivos diferentes:
 *
 *   1. FRONTEIRA — quem não tem alcance clínico não vê plano nenhum, e a
 *      porta é `aba_treatment.pode_planejar()`, que é a conjunção de
 *      `aba_health.pode_acessar()` com `access.can('treatment', ...)`.
 *   2. REGRA NO BANCO — a forma do código (03.6.a), o teto de quantidade
 *      (03.6), a trava de consentimento e o ciclo de estado precisam
 *      recusar do lado do banco. Regra clínica que só a tela guarda é
 *      regra que a próxima tela esquece.
 *   3. HISTÓRICO — só `proposto` não recusado se apaga. O registro de
 *      que o paciente escolheu A e recusou B é o que protege a clínica
 *      depois; se ele puder ser apagado, não protege nada.
 *
 * SAVEPOINT NÃO SE APLICA AQUI, e vale dizer por quê: a lição da 03.6.a
 * ("sem SAVEPOINT, um teste de CHECK em lote fica verde sem ter testado
 * nada — `25P02` se disfarça de recusa") vale para várias tentativas
 * inválidas DENTRO da mesma transação. Cada caso abaixo é uma requisição
 * PostgREST independente, isto é, uma transação por caso. A guarda
 * equivalente é a que está em todo `expect`: afirmar o SQLSTATE
 * (`23514` para CHECK/trigger, `42501` para permissão), nunca só "deu
 * erro".
 */
describe("aba_treatment — o plano de tratamento segue o regime clínico (Subetapa 03.8)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let clienteId: string;
  let categoriaId: string;
  let planoId: string;
  let opcaoA: string;
  let opcaoB: string;
  let diagnosticoId: string;
  let faseDefinitiva: string;
  let faseManutencao: string;

  /** Códigos com regra de forma diferente, para cada trava ter alvo próprio. */
  let procLivre: string;        // sem regra nenhuma
  let procMOD: string;          // por dente, 1–3 faces, posterior
  let procAnterior: string;     // por dente, região anterior
  let procComTermo: string;     // exige consentimento de tratamento
  let procInformado: string;    // exige consentimento informado
  let procComDiagnostico: string; // exige achado diagnóstico vinculado
  let procTeto2: string;        // quantidade_maxima = 2

  let consentimentoOk: string;
  let consentimentoInformado: string;
  let consentimentoRevogado: string;

  async function criarProcedimento(nome: string, extra: Record<string, unknown>) {
    const { data, error } = await admin
      .schema("aba_catalog")
      .from("procedimentos")
      .insert({ account_id: ctx.accountId, categoria_id: categoriaId, nome, ...extra })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  /** Insere uma célula da matriz como `service_role` — o caminho de fixture, não o de teste. */
  async function inserirProc(campos: Record<string, unknown>) {
    return admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .insert({
        account_id: ctx.accountId,
        plano_id: planoId,
        opcao_id: opcaoA,
        fase_id: faseDefinitiva,
        ...campos,
      })
      .select("id")
      .single();
  }

  beforeAll(async () => {
    ctx = await loadContext();

    // ---- cliente ----
    const { data: pessoa, error: pessoaErr } = await admin
      .schema("aba_people")
      .from("pessoas")
      .insert({ account_id: ctx.accountId, nome_exibicao: "Cliente Fictício Plano 03.8" })
      .select("id")
      .single();
    if (pessoaErr) throw pessoaErr;
    clienteId = pessoa.id;
    const { error: cliErr } = await admin
      .schema("aba_people")
      .from("clientes")
      .insert({ id: clienteId, account_id: ctx.accountId, razao_social: "Cliente Fictício Plano 03.8", status: "ativo" });
    if (cliErr) throw cliErr;

    // ---- catálogo ----
    const { data: cat, error: catErr } = await admin
      .schema("aba_catalog")
      .from("categorias")
      .insert({ account_id: ctx.accountId, nome: "Categoria Fictícia 03.8" })
      .select("id")
      .single();
    if (catErr) throw catErr;
    categoriaId = cat.id;

    procLivre = await criarProcedimento("Procedimento livre 03.8", {});
    procMOD = await criarProcedimento("Restauração MOD 03.8", {
      unidade_lancamento: "dente",
      aceita_faces: true,
      faces_minimo: 1,
      faces_maximo: 3,
      regiao_dentaria: "posterior",
    });
    procAnterior = await criarProcedimento("Faceta anterior 03.8", {
      unidade_lancamento: "dente",
      regiao_dentaria: "anterior",
    });
    procComTermo = await criarProcedimento("Exodontia 03.8", {
      unidade_lancamento: "dente",
      exige_consentimento_tratamento: true,
    });
    procInformado = await criarProcedimento("Cirurgia de risco 03.8", {
      unidade_lancamento: "dente",
      exige_consentimento_informado: true,
    });
    procComDiagnostico = await criarProcedimento("Endodontia 03.8", {
      unidade_lancamento: "dente",
      exige_achado_diagnostico: true,
    });
    procTeto2 = await criarProcedimento("Procedimento com teto 2 03.8", {
      unidade_lancamento: "dente",
      quantidade_maxima: 2,
    });

    // ---- consentimentos ----
    const consentimentos = [
      { tipo: "procedimento", concedido: true, revogado_em: null },
      { tipo: "procedimento_informado", concedido: true, revogado_em: null },
      { tipo: "procedimento", concedido: true, revogado_em: new Date().toISOString() },
    ];
    const ids: string[] = [];
    for (const c of consentimentos) {
      const { data, error } = await admin
        .schema("aba_health")
        .from("consentimentos")
        .insert({
          account_id: ctx.accountId,
          cliente_id: clienteId,
          versao_texto: "v1 — fixture 03.8",
          concedido_em: new Date().toISOString(),
          ...c,
        })
        .select("id")
        .single();
      if (error) throw error;
      ids.push(data.id);
    }
    [consentimentoOk, consentimentoInformado, consentimentoRevogado] = ids;

    // ---- fases (semeadas pela migration) ----
    const { data: fases, error: fasesErr } = await admin
      .schema("aba_treatment")
      .from("fases")
      .select("id, chave")
      .eq("account_id", ctx.accountId);
    if (fasesErr) throw fasesErr;
    faseDefinitiva = fases!.find((f) => f.chave === "definitiva")!.id;
    faseManutencao = fases!.find((f) => f.chave === "manutencao")!.id;

    // ---- plano + duas opções + diagnóstico ----
    const { data: plano, error: planoErr } = await admin
      .schema("aba_treatment")
      .from("planos")
      .insert({ account_id: ctx.accountId, cliente_id: clienteId, titulo: "Plano Fictício 03.8" })
      .select("id")
      .single();
    if (planoErr) throw planoErr;
    planoId = plano.id;

    const { data: opcoes, error: opErr } = await admin
      .schema("aba_treatment")
      .from("opcoes")
      .insert([
        { account_id: ctx.accountId, plano_id: planoId, rotulo: "A", ordem: 1 },
        { account_id: ctx.accountId, plano_id: planoId, rotulo: "B", ordem: 2 },
      ])
      .select("id, rotulo");
    if (opErr) throw opErr;
    opcaoA = opcoes!.find((o) => o.rotulo === "A")!.id;
    opcaoB = opcoes!.find((o) => o.rotulo === "B")!.id;

    const { data: diag, error: diagErr } = await admin
      .schema("aba_treatment")
      .from("diagnosticos")
      .insert({
        account_id: ctx.accountId,
        plano_id: planoId,
        dente: "16",
        faces: ["oclusal"],
        descricao: "Cárie oclusal profunda",
      })
      .select("id")
      .single();
    if (diagErr) throw diagErr;
    diagnosticoId = diag.id;
  });

  afterAll(async () => {
    // DELETE completo, nunca desativação — a lição de resíduo de fixture
    // já custou uma subetapa neste projeto (`instrucoes.md` §5), e a
    // 03.7.a mostrou a metade que faltava: resíduo também faz a execução
    // SEGUINTE escrever no lugar errado.
    await admin.schema("aba_treatment").from("procedimentos_plano").delete().eq("plano_id", planoId);
    await admin.schema("aba_treatment").from("diagnosticos").delete().eq("plano_id", planoId);
    await admin.schema("aba_treatment").from("opcoes").delete().eq("plano_id", planoId);
    await admin.schema("aba_treatment").from("planos").delete().eq("id", planoId);
    await admin.schema("aba_health").from("consentimentos").delete().eq("cliente_id", clienteId);
    await admin.schema("aba_health").from("log_acesso").delete().eq("cliente_id", clienteId);
    for (const id of [procLivre, procMOD, procAnterior, procComTermo, procInformado, procComDiagnostico, procTeto2]) {
      await admin.schema("aba_catalog").from("procedimentos").delete().eq("id", id);
    }
    await admin.schema("aba_catalog").from("categorias").delete().eq("id", categoriaId);
    await admin.schema("aba_people").from("clientes").delete().eq("id", clienteId);
    await admin.schema("aba_people").from("pessoas").delete().eq("id", clienteId);
  });

  // ============================================================
  // 1. FRONTEIRA — o alcance clínico governa o plano
  // ============================================================

  it("ATAQUE: agent sem alcance clínico não vê plano nenhum — conjunto vazio, não erro", async () => {
    const agent = await clientAs("agent");
    const { data, error } = await agent.schema("aba_treatment").from("planos").select("id").eq("id", planoId);
    expect(error).toBeNull();
    // Vazio e não erro: a RLS filtra a linha, não recusa a consulta. É a
    // mesma resposta que `aba_health` dá — o schema novo não pode ser
    // mais falante que o antigo sobre a existência do registro.
    expect(data).toEqual([]);
  });

  it("ATAQUE: viewer não vê o plano, e também não vê a célula da matriz", async () => {
    const viewer = await clientAs("viewer");
    const { data: p } = await viewer.schema("aba_treatment").from("planos").select("id").eq("id", planoId);
    const { data: pp } = await viewer
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .select("id")
      .eq("plano_id", planoId);
    expect(p).toEqual([]);
    expect(pp).toEqual([]);
  });

  it("ATAQUE: `anon` não alcança nenhuma tabela do schema novo", async () => {
    const anon = anonClient();
    for (const tabela of ["fases", "planos", "opcoes", "diagnosticos", "procedimentos_plano"]) {
      const { error } = await anon.schema("aba_treatment").from(tabela).select("id").limit(1);
      expect(ehErroRls(error), `${tabela} deveria recusar anon`).toBe(true);
    }
  });

  it("ATAQUE: `anon` não executa a porta do schema nem a operação de consentimento", async () => {
    const anon = anonClient();
    const { error: e1 } = await anon
      .schema("aba_treatment")
      .rpc("pode_planejar", { p_cliente_id: clienteId, p_acao: "leitura" });
    const { error: e2 } = await anon.schema("aba_treatment").rpc("consentir_opcao", { p_opcao_id: opcaoA });
    expect(e1).not.toBeNull();
    expect(e2).not.toBeNull();
  });

  it("CONTROLE POSITIVO: owner enxerga o plano — a fronteira não bloqueia todo mundo", async () => {
    const owner = await clientAs("owner");
    const { data, error } = await owner.schema("aba_treatment").from("planos").select("id").eq("id", planoId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("a porta do schema é a conjunção das duas camadas, e é fail-closed em ação inválida", async () => {
    const owner = await clientAs("owner");
    const { data: ok } = await owner
      .schema("aba_treatment")
      .rpc("pode_planejar", { p_cliente_id: clienteId, p_acao: "leitura" });
    const { data: invalida } = await owner
      .schema("aba_treatment")
      .rpc("pode_planejar", { p_cliente_id: clienteId, p_acao: "voar" });
    expect(ok).toBe(true);
    // Ação fora do vocabulário devolve NULL no mapeamento, e
    // `access.can(module, NULL)` nega por desenho — sem `if` próprio.
    expect(invalida).toBe(false);
  });

  // ============================================================
  // 2. A REGRA VIVE NO BANCO — forma do código, teto, consentimento
  // ============================================================

  it("a matriz monta: duas opções sob o MESMO diagnóstico, em fases diferentes", async () => {
    const { error: e1 } = await inserirProc({
      procedimento_id: procMOD,
      diagnostico_id: diagnosticoId,
      dente: "16",
      faces: ["mesial", "distal", "oclusal"],
    });
    const { error: e2 } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .insert({
        account_id: ctx.accountId,
        plano_id: planoId,
        opcao_id: opcaoB,
        fase_id: faseManutencao,
        procedimento_id: procLivre,
        diagnostico_id: diagnosticoId,
      });
    expect(e1).toBeNull();
    expect(e2).toBeNull();

    const { data } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .select("opcao_id, fase_id, diagnostico_id")
      .eq("plano_id", planoId);
    // O diagnóstico ATRAVESSA as colunas: a mesma cárie aparece sob duas
    // opções. É essa forma que transforma o plano em conversa clínica.
    const porDiagnostico = data!.filter((r) => r.diagnostico_id === diagnosticoId);
    expect(new Set(porDiagnostico.map((r) => r.opcao_id)).size).toBe(2);
  });

  it("RECUSA: código lançado por dente não aceita linha sem dente", async () => {
    const { error } = await inserirProc({ procedimento_id: procMOD, faces: [], dente: null });
    expect(error?.code).toBe("23514");
    expect(error?.message).toMatch(/lançado por dente/i);
  });

  it("RECUSA: mais faces do que o código aceita (regra de forma da 03.6.a)", async () => {
    const { error } = await inserirProc({
      procedimento_id: procMOD,
      dente: "16",
      faces: ["mesial", "distal", "oclusal", "vestibular"],
    });
    expect(error?.code).toBe("23514");
    expect(error?.message).toMatch(/no máximo 3 face/i);
  });

  it("RECUSA: código de dente ANTERIOR lançado num molar", async () => {
    const { error } = await inserirProc({ procedimento_id: procAnterior, dente: "16" });
    expect(error?.code).toBe("23514");
    expect(error?.message).toMatch(/anterior/i);
  });

  it("RECUSA: face em código que não aceita marcação por face", async () => {
    const { error } = await inserirProc({ procedimento_id: procLivre, dente: "16", faces: ["oclusal"] });
    expect(error?.code).toBe("23514");
    expect(error?.message).toMatch(/não aceita marcação por face/i);
  });

  it("RECUSA: face sem dente é recusada pelo CHECK, antes de qualquer trigger", async () => {
    const { error } = await inserirProc({ procedimento_id: procMOD, dente: null, faces: ["oclusal"] });
    expect(error?.code).toBe("23514");
  });

  it("RECUSA: dente fora da notação FDI", async () => {
    const { error } = await inserirProc({ procedimento_id: procMOD, dente: "99", faces: ["oclusal"] });
    expect(error?.code).toBe("23514");
  });

  it("O TETO DE QUANTIDADE DA 03.6 PASSA A TER EFEITO — e o terceiro lançamento é recusado", async () => {
    const primeiro = await inserirProc({ procedimento_id: procTeto2, dente: "11" });
    const segundo = await inserirProc({ procedimento_id: procTeto2, dente: "12" });
    expect(primeiro.error).toBeNull();
    expect(segundo.error).toBeNull();

    const terceiro = await inserirProc({ procedimento_id: procTeto2, dente: "13" });
    expect(terceiro.error?.code).toBe("23514");
    expect(terceiro.error?.message).toMatch(/no máximo 2 lançamento/i);
  });

  it("A TRAVA DE CONSENTIMENTO: procedimento que exige termo não sai de `proposto` sem ele", async () => {
    const { data, error } = await inserirProc({ procedimento_id: procComTermo, dente: "18" });
    expect(error).toBeNull();

    const { error: semTermo } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .update({ estado: "planejado" })
      .eq("id", data!.id);
    expect(semTermo?.code).toBe("23514");
    expect(semTermo?.message).toMatch(/exige termo de consentimento/i);

    // Termo REVOGADO não vale — e este é o caso que separa "tem um termo
    // vinculado" de "tem um termo vigente".
    const { error: revogado } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .update({ estado: "planejado", consentimento_id: consentimentoRevogado })
      .eq("id", data!.id);
    expect(revogado?.code).toBe("23514");
    expect(revogado?.message).toMatch(/vigente/i);

    const { error: comTermo } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .update({ estado: "planejado", consentimento_id: consentimentoOk })
      .eq("id", data!.id);
    expect(comTermo).toBeNull();
  });

  it("as DUAS bandeiras de requisito têm efeito próprio — o termo comum não serve para o informado", async () => {
    const { data } = await inserirProc({ procedimento_id: procInformado, dente: "28" });

    // Se `exige_consentimento_informado` fosse satisfeito pelo mesmo
    // termo do requisito comum, a coluna não mudaria nada — e coluna que
    // não muda nada é a classe de defeito que este projeto já pagou.
    const { error: comum } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .update({ estado: "planejado", consentimento_id: consentimentoOk })
      .eq("id", data!.id);
    expect(comum?.code).toBe("23514");
    expect(comum?.message).toMatch(/procedimento_informado/);

    const { error: informado } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .update({ estado: "planejado", consentimento_id: consentimentoInformado })
      .eq("id", data!.id);
    expect(informado).toBeNull();
  });

  it("a trava de ACHADO DIAGNÓSTICO vinculado também segura em `proposto`", async () => {
    const { data } = await inserirProc({ procedimento_id: procComDiagnostico, dente: "26" });

    const { error: sem } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .update({ estado: "planejado" })
      .eq("id", data!.id);
    expect(sem?.code).toBe("23514");
    expect(sem?.message).toMatch(/achado diagnóstico/i);

    const { error: com } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .update({ estado: "planejado", diagnostico_id: diagnosticoId })
      .eq("id", data!.id);
    expect(com).toBeNull();
  });

  it("CICLO DE ESTADO: transição fora do ciclo é recusada, e `executado` carrega data", async () => {
    const { data } = await inserirProc({ procedimento_id: procLivre, dente: null });

    // proposto → em_execucao pula `planejado`: recusado.
    const { error: pulo } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .update({ estado: "em_execucao" })
      .eq("id", data!.id);
    expect(pulo?.code).toBe("23514");
    expect(pulo?.message).toMatch(/Transição de estado inválida/i);

    await admin.schema("aba_treatment").from("procedimentos_plano").update({ estado: "planejado" }).eq("id", data!.id);
    const { error: exec } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .update({ estado: "executado" })
      .eq("id", data!.id);
    expect(exec).toBeNull();

    const { data: lido } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .select("estado, executado_em")
      .eq("id", data!.id)
      .single();
    // `executado` é FATO AFIRMADO, com data — é o que a trava de
    // finalização de contrato da 03.8.a vai ler.
    expect(lido!.estado).toBe("executado");
    expect(lido!.executado_em).not.toBeNull();

    // E é terminal: não volta.
    const { error: volta } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .update({ estado: "planejado" })
      .eq("id", data!.id);
    expect(volta?.code).toBe("23514");
  });

  it("RE-CONSENTIMENTO: mudar o DENTE derruba o termo e devolve a linha para `proposto`", async () => {
    const { data } = await inserirProc({ procedimento_id: procComTermo, dente: "48" });
    await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .update({ estado: "planejado", consentimento_id: consentimentoOk })
      .eq("id", data!.id);

    const { error } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .update({ dente: "38" })
      .eq("id", data!.id);
    expect(error).toBeNull();

    const { data: depois } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .select("estado, consentimento_id, dente")
      .eq("id", data!.id)
      .single();
    expect(depois!.dente).toBe("38");
    expect(depois!.estado).toBe("proposto");
    expect(depois!.consentimento_id).toBeNull();
  });

  it("RE-CONSENTIMENTO: mudar FACE, FASE ou OPÇÃO **não** exige termo novo", async () => {
    const { data } = await inserirProc({
      procedimento_id: procMOD,
      dente: "17",
      faces: ["oclusal"],
      diagnostico_id: diagnosticoId,
    });
    await admin.schema("aba_treatment").from("procedimentos_plano").update({ estado: "planejado" }).eq("id", data!.id);

    const { error } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .update({ faces: ["mesial", "oclusal"], fase_id: faseManutencao, opcao_id: opcaoB })
      .eq("id", data!.id);
    expect(error).toBeNull();

    const { data: depois } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .select("estado, faces")
      .eq("id", data!.id)
      .single();
    // A regra mora em dado, não num `if` espalhado pela tela: face, fase,
    // opção e diagnóstico mudam sem derrubar o consentimento.
    expect(depois!.estado).toBe("planejado");
    expect(depois!.faces).toEqual(["mesial", "oclusal"]);
  });

  // ============================================================
  // 3. HISTÓRICO — recusa implícita e o que não se apaga
  // ============================================================

  it("RECUSA IMPLÍCITA: consentir a Opção A marca a Opção B do MESMO diagnóstico como recusada", async () => {
    // Plano próprio para este caso, para não depender do estado deixado
    // pelos anteriores — cada asserção de história precisa da sua.
    const { data: plano } = await admin
      .schema("aba_treatment")
      .from("planos")
      .insert({ account_id: ctx.accountId, cliente_id: clienteId, titulo: "Plano da recusa implícita" })
      .select("id")
      .single();
    const { data: ops } = await admin
      .schema("aba_treatment")
      .from("opcoes")
      .insert([
        { account_id: ctx.accountId, plano_id: plano!.id, rotulo: "A", ordem: 1 },
        { account_id: ctx.accountId, plano_id: plano!.id, rotulo: "B", ordem: 2 },
      ])
      .select("id, rotulo");
    const a = ops!.find((o) => o.rotulo === "A")!.id;
    const b = ops!.find((o) => o.rotulo === "B")!.id;
    const { data: diag } = await admin
      .schema("aba_treatment")
      .from("diagnosticos")
      .insert({ account_id: ctx.accountId, plano_id: plano!.id, dente: "36", descricao: "Cárie profunda" })
      .select("id")
      .single();
    const { data: outroDiag } = await admin
      .schema("aba_treatment")
      .from("diagnosticos")
      .insert({ account_id: ctx.accountId, plano_id: plano!.id, dente: "46", descricao: "Outro achado" })
      .select("id")
      .single();

    const base = { account_id: ctx.accountId, plano_id: plano!.id, fase_id: faseDefinitiva, procedimento_id: procLivre };
    await admin.schema("aba_treatment").from("procedimentos_plano").insert([
      { ...base, opcao_id: a, diagnostico_id: diag!.id },
      { ...base, opcao_id: b, diagnostico_id: diag!.id },
      // Este trata OUTRA coisa: ninguém o recusou, e marcar como
      // recusado o que não foi é tão errado quanto não marcar o que foi.
      { ...base, opcao_id: b, diagnostico_id: outroDiag!.id },
    ]);

    const owner = await clientAs("owner");
    const { data: resultado, error } = await owner.schema("aba_treatment").rpc("consentir_opcao", { p_opcao_id: a });
    expect(error).toBeNull();
    expect(resultado![0].planejados).toBe(1);
    expect(resultado![0].recusados).toBe(1);

    const { data: linhas } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .select("opcao_id, diagnostico_id, estado, recusado_em, recusado_por")
      .eq("plano_id", plano!.id);

    const daOpcaoA = linhas!.find((l) => l.opcao_id === a)!;
    const bMesmoDiag = linhas!.find((l) => l.opcao_id === b && l.diagnostico_id === diag!.id)!;
    const bOutroDiag = linhas!.find((l) => l.opcao_id === b && l.diagnostico_id === outroDiag!.id)!;

    expect(daOpcaoA.estado).toBe("planejado");
    // O registro de que o paciente escolheu A e recusou B é o que protege
    // a clínica depois — requisito ético e jurídico, não conveniência.
    expect(bMesmoDiag.recusado_em).not.toBeNull();
    expect(bMesmoDiag.recusado_por).not.toBeNull();
    expect(bOutroDiag.recusado_em).toBeNull();

    // A opção consentida fica carimbada.
    const { data: opcao } = await admin
      .schema("aba_treatment")
      .from("opcoes")
      .select("consentida_em, consentida_por")
      .eq("id", a)
      .single();
    expect(opcao!.consentida_em).not.toBeNull();
    expect(opcao!.consentida_por).not.toBeNull();

    // ATAQUE: a linha recusada não muda mais de estado nem se apaga.
    const { error: mudar } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .update({ estado: "planejado" })
      .eq("opcao_id", b)
      .eq("diagnostico_id", diag!.id);
    expect(mudar?.code).toBe("23514");

    const ownerDel = await clientAs("owner");
    await ownerDel
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .delete()
      .eq("opcao_id", b)
      .eq("diagnostico_id", diag!.id);
    const { count } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .select("id", { count: "exact", head: true })
      .eq("opcao_id", b)
      .eq("diagnostico_id", diag!.id);
    // A policy de DELETE exige `proposto` E `recusado_em IS NULL`: sem a
    // segunda condição bastaria apagar a Opção B recusada para sumir com
    // a prova de que o paciente escolheu A.
    expect(count).toBe(1);

    await admin.schema("aba_treatment").from("procedimentos_plano").delete().eq("plano_id", plano!.id);
    await admin.schema("aba_treatment").from("diagnosticos").delete().eq("plano_id", plano!.id);
    await admin.schema("aba_treatment").from("opcoes").delete().eq("plano_id", plano!.id);
    await admin.schema("aba_treatment").from("planos").delete().eq("id", plano!.id);
  });

  it("SÓ `proposto` NÃO RECUSADO SE APAGA — o que já foi planejado permanece", async () => {
    const { data } = await inserirProc({ procedimento_id: procLivre, dente: null });
    await admin.schema("aba_treatment").from("procedimentos_plano").update({ estado: "planejado" }).eq("id", data!.id);

    const owner = await clientAs("owner");
    await owner.schema("aba_treatment").from("procedimentos_plano").delete().eq("id", data!.id);
    const { count: aindaLa } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .select("id", { count: "exact", head: true })
      .eq("id", data!.id);
    expect(aindaLa).toBe(1);

    // E o `proposto` limpo sai, para a proposta rascunho não virar
    // histórico eterno de coisa que ninguém chegou a propor de verdade.
    const { data: rascunho } = await inserirProc({ procedimento_id: procLivre, dente: null });
    await owner.schema("aba_treatment").from("procedimentos_plano").delete().eq("id", rascunho!.id);
    const { count: saiu } = await admin
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .select("id", { count: "exact", head: true })
      .eq("id", rascunho!.id);
    expect(saiu).toBe(0);
  });

  // ============================================================
  // 4. HARDENING — o que a migration prometeu, medido no catálogo
  // ============================================================

  it("a auditoria de isolamento de conta ENXERGA o schema novo e devolve zero linhas", async () => {
    const { data, error } = await admin.rpc("fks_sem_isolamento_de_conta");
    expect(error).toBeNull();
    // O contrato é zero linhas no banco inteiro. O que esta subetapa
    // acrescentou é a lista de schemas da própria função: `aba_treatment`
    // não estava nela, e o schema novo nasceria invisível para a guarda
    // que existe justamente para pegar a chave desprotegida seguinte.
    expect(data).toEqual([]);
  });

  it("`treatment` está no catálogo de módulos com o rótulo da decisão D-V1", async () => {
    const { data, error } = await admin.schema("access").from("modules").select("key, label, position").eq("key", "treatment").single();
    expect(error).toBeNull();
    expect(data!.label).toBe("Plano");
    // Logo depois de Prontuário: a ordem da navegação é a do trabalho.
    expect(data!.position).toBe(6);
  });

  // ============================================================
  // 5. LEITURA REGISTRADA — o regime de aba_health tem DUAS metades
  //
  // A política diz QUEM pode ler; a função de leitura diz QUE ALGUÉM LEU.
  // A 03.8 entregou a primeira e reportou a segunda como pendência; Max
  // recusou a pendência ("dado de saúde se resolve agora"), e a migration
  // `047` fechou. Estes casos existem para que a segunda metade não possa
  // ser desfeita sem ficar vermelho.
  // ============================================================

  async function contarLogPlano(acao: string): Promise<number> {
    const { count } = await admin
      .schema("aba_health")
      .from("log_acesso")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", clienteId)
      .eq("tipo_registro", "plano")
      .eq("acao", acao);
    return count ?? 0;
  }

  it("ATAQUE: dente e face NÃO saem por select direto — nem para o owner", async () => {
    const owner = await clientAs("owner");
    for (const [tabela, coluna] of [
      ["procedimentos_plano", "dente"],
      ["procedimentos_plano", "faces"],
      ["procedimentos_plano", "observacao"],
      ["diagnosticos", "dente"],
      ["diagnosticos", "faces"],
      ["diagnosticos", "descricao"],
      ["planos", "titulo"],
      ["planos", "observacao"],
    ] as const) {
      const { error } = await owner.schema("aba_treatment").from(tabela).select(coluna).limit(1);
      expect(ehErroRls(error), `${tabela}.${coluna} deveria estar revogada`).toBe(true);
    }
  });

  it("ATAQUE: `select('*')` também não abre a porta no schema do plano", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner.schema("aba_treatment").from("procedimentos_plano").select("*").limit(1);
    expect(ehErroRls(error)).toBe(true);
  });

  it("CONTROLE POSITIVO: o metadado CONTINUA legível — a revogação não passou do ponto", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner
      .schema("aba_treatment")
      .from("procedimentos_plano")
      .select("id, plano_id, opcao_id, fase_id, estado, recusado_em, executado_em")
      .eq("plano_id", planoId);
    // Sem estas colunas a aplicação não lista, não junta e não atualiza —
    // em Postgres, `UPDATE ... WHERE id = $1` exige SELECT no `id`.
    expect(error).toBeNull();
  });

  it("ler_planos() devolve a matriz INTEIRA e grava o log na mesma transação", async () => {
    const antes = await contarLogPlano("leitura");

    const owner = await clientAs("owner");
    const { data, error } = await owner.schema("aba_treatment").rpc("ler_planos", { p_cliente_id: clienteId });
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);

    const plano = (data as Record<string, unknown>[]).find((p) => p.id === planoId)!;
    expect(plano.titulo).toBe("Plano Fictício 03.8");
    // As três partes da matriz vêm na MESMA leitura registrada: as opções
    // (coluna), os diagnósticos (que atravessam as colunas) e as células.
    expect(Array.isArray(plano.opcoes)).toBe(true);
    expect((plano.opcoes as unknown[]).length).toBe(2);
    const procs = plano.procedimentos as { dente: string | null; faces: string[] }[];
    expect(procs.some((x) => x.dente === "16")).toBe(true);
    const diags = plano.diagnosticos as { id: string; fasado: boolean }[];
    // A fila de trabalho vem calculada: diagnóstico sem procedimento é
    // `fasado: false`, e é por ele que o planejamento começa.
    expect(diags.find((d) => d.id === diagnosticoId)?.fasado).toBe(true);

    expect(await contarLogPlano("leitura")).toBeGreaterThan(antes);
  });

  it("ATAQUE: agent sem alcance clínico recebe conjunto vazio de ler_planos E NENHUM log", async () => {
    const antes = await contarLogPlano("leitura");

    const agent = await clientAs("agent");
    const { data, error } = await agent.schema("aba_treatment").rpc("ler_planos", { p_cliente_id: clienteId });
    expect(error).toBeNull();
    expect(data).toEqual([]);
    // Nada foi lido, então não há o que registrar. Log a mais aqui seria
    // log mentindo — e um log que mente é pior que log nenhum.
    expect(await contarLogPlano("leitura")).toBe(antes);
  });

  it("ESCRITA no plano também gera log — a metade que a migration 070 do Maximus ensinou", async () => {
    const antes = await contarLogPlano("criacao");

    const owner = await clientAs("owner");
    const { data, error } = await owner
      .schema("aba_treatment")
      .from("planos")
      .insert({ account_id: ctx.accountId, cliente_id: clienteId, titulo: "Plano do teste de log" })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(await contarLogPlano("criacao")).toBe(antes + 1);

    const antesUpd = await contarLogPlano("atualizacao");
    await owner.schema("aba_treatment").from("planos").update({ observacao: "mexido" }).eq("id", data!.id);
    expect(await contarLogPlano("atualizacao")).toBe(antesUpd + 1);

    await admin.schema("aba_treatment").from("planos").delete().eq("id", data!.id);
  });

  it("as seis fases clínicas nasceram semeadas, e na ordem clínica", async () => {
    const { data } = await admin
      .schema("aba_treatment")
      .from("fases")
      .select("chave, ordem")
      .eq("account_id", ctx.accountId)
      .order("ordem");
    expect(data!.map((f) => f.chave)).toEqual([
      "emergencia",
      "sistemica",
      "aguda",
      "controle_doenca",
      "definitiva",
      "manutencao",
    ]);
  });
});
