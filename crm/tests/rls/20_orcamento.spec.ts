import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, clientAs, ehErroRls, loadContext, type TestContext } from "./helpers";

/**
 * Subetapa 03.8.a — P-sub do orçamento.
 *
 * O QUE MUDA O NÍVEL DE RISCO E EXIGE SUÍTE PRÓPRIA. O orçamento é a
 * primeira superfície do produto em que **dado clínico é projetado para a
 * recepção ler**. A pergunta que esta suíte responde não é "a RLS está
 * ligada?", é:
 *
 *   **a fronteira de `aba_health` sobreviveu à travessia para
 *   `aba_finance`, ou o orçamento virou a porta lateral por onde dente e
 *   face saem sem alcance clínico e sem rastro?**
 *
 * Quatro famílias de caso, e as quatro importam por motivos diferentes:
 *
 *   1. FRONTEIRA CLÍNICA — o item do orçamento não guarda dente nem face,
 *      e `ler_orcamentos()` só devolve o detalhe clínico a quem tem
 *      alcance, registrando a leitura. Sem alcance: mesmos valores,
 *      nenhum dente, nenhum log.
 *   2. ALÇADA FINANCEIRA — parcela, desconto, juros, mora e promoção são
 *      da recepção, nunca do profissional (Max, 2026-09-04). É trava de
 *      COLUNA, e a RLS não sabe responder sobre coluna
 *      (`instrucoes.md` §5).
 *   3. IMUTABILIDADE — tarifa comprometida não se altera nem se apaga.
 *      Passado de financeiro reescrito não tem conserto retroativo.
 *   4. A ESCADA — o preço se RESOLVE. Não há parâmetro por onde escolher
 *      a tabela, e o preço pessoal de um paciente não resolve o de outro.
 *
 * TODA RECUSA É CONFERIDA CONTANDO O ESTADO DEPOIS, nunca só pelo erro.
 * A lição é da 03.8, e custou uma policy de `DELETE` que nascera morta:
 * uma operação que não faz nada não gera erro — gera ausência de efeito,
 * indistinguível de sucesso.
 */
describe("orçamento — o preço se resolve, e a fronteira clínica atravessa (Subetapa 03.8.a)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let clienteId: string;
  let outroClienteId: string;
  let categoriaId: string;
  let procId: string;
  let planoId: string;
  let opcaoId: string;
  let celulaId: string;
  let tipoEspecialista: string;
  let profComum: string;
  let profEspecialista: string;
  let tabelaPratica: string;
  let tabelaTipo: string;
  let orcamentoId: string;
  const funcionarios: string[] = [];

  /** Profissional ativo exige funcionário ativo, que exige login real
   *  (`instrucoes.md` §5). A escada resolve pelo TIPO, que não depende de
   *  o profissional estar em atividade — então a fixture nasce inativa,
   *  sem criar conta de autenticação descartável. */
  async function criarProfissional(nome: string, tipoId: string | null) {
    const { data: pessoa, error: e1 } = await admin
      .schema("aba_people").from("pessoas")
      .insert({ account_id: ctx.accountId, nome_exibicao: nome }).select("id").single();
    if (e1) throw e1;
    const { error: e2 } = await admin
      .schema("aba_people").from("funcionarios")
      .insert({ id: pessoa.id, account_id: ctx.accountId, cargo: "Dentista", ativo: false });
    if (e2) throw e2;
    funcionarios.push(pessoa.id);
    const { data: prof, error: e3 } = await admin
      .schema("aba_scheduling").from("profissionais")
      .insert({
        account_id: ctx.accountId, nome_exibicao: nome, tipo_profissional_id: tipoId,
        funcionario_id: pessoa.id, ativo: false, acesso_clinico: false,
      })
      .select("id").single();
    if (e3) throw e3;
    return prof.id as string;
  }

  async function criarTabela(nome: string, extra: Record<string, unknown>, tarifa: number) {
    const { data: t, error } = await admin
      .schema("aba_finance").from("tabelas_preco")
      .insert({ account_id: ctx.accountId, nome, ...extra }).select("id").single();
    if (error) throw error;
    const { error: e2 } = await admin
      .schema("aba_finance").from("tarifas")
      .insert({ account_id: ctx.accountId, tabela_preco_id: t.id, procedimento_id: procId, valor: tarifa });
    if (e2) throw e2;
    return t.id as string;
  }

  beforeAll(async () => {
    ctx = await loadContext();

    for (const [nome, alvo] of [["Paciente 03.8.a", "cliente"], ["Outro paciente 03.8.a", "outro"]] as const) {
      const { data: p, error } = await admin
        .schema("aba_people").from("pessoas")
        .insert({ account_id: ctx.accountId, nome_exibicao: nome }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await admin
        .schema("aba_people").from("clientes")
        .insert({ id: p.id, account_id: ctx.accountId, razao_social: nome, status: "ativo" });
      if (e2) throw e2;
      if (alvo === "cliente") clienteId = p.id;
      else outroClienteId = p.id;
    }

    const { data: cat, error: catErr } = await admin
      .schema("aba_catalog").from("categorias")
      .insert({ account_id: ctx.accountId, nome: "Categoria 03.8.a" }).select("id").single();
    if (catErr) throw catErr;
    categoriaId = cat.id;

    const { data: proc, error: procErr } = await admin
      .schema("aba_catalog").from("procedimentos")
      // `aceita_faces` é DERIVADA desde a 03.6.a — o gatilho
      // `derivar_aceita_faces` a calcula como `faces_maximo IS NOT NULL`,
      // e escrevê-la à mão não tem efeito nenhum. Quem liga a face é a
      // regra de forma.
      .insert({
        account_id: ctx.accountId, categoria_id: categoriaId, nome: "Consulta 03.8.a",
        preco_base: 180, unidade_lancamento: "dente", faces_minimo: 1, faces_maximo: 3,
      })
      .select("id").single();
    if (procErr) throw procErr;
    procId = proc.id;

    const { data: tipos } = await admin
      .schema("aba_scheduling").from("tipos_profissional")
      .select("id, chave").eq("account_id", ctx.accountId);
    tipoEspecialista = tipos!.find((t) => t.chave === "especialista")!.id;
    const tipoComum = tipos!.find((t) => t.chave === "clinico_geral")!.id;

    profComum = await criarProfissional("Dr. Comum 03.8.a", tipoComum);
    profEspecialista = await criarProfissional("Dra. Especialista 03.8.a", tipoEspecialista);

    const { data: plano, error: pErr } = await admin
      .schema("aba_treatment").from("planos")
      .insert({ account_id: ctx.accountId, cliente_id: clienteId, titulo: "Plano 03.8.a", profissional_id: profComum })
      .select("id").single();
    if (pErr) throw pErr;
    planoId = plano.id;

    const { data: op, error: opErr } = await admin
      .schema("aba_treatment").from("opcoes")
      .insert({ account_id: ctx.accountId, plano_id: planoId, rotulo: "A", ordem: 1 }).select("id").single();
    if (opErr) throw opErr;
    opcaoId = op.id;

    const { data: fases } = await admin
      .schema("aba_treatment").from("fases").select("id, chave").eq("account_id", ctx.accountId);
    const faseId = fases!.find((f) => f.chave === "definitiva")!.id;

    const { data: celula, error: cErr } = await admin
      .schema("aba_treatment").from("procedimentos_plano")
      .insert({
        account_id: ctx.accountId, plano_id: planoId, opcao_id: opcaoId,
        fase_id: faseId, procedimento_id: procId, dente: "16", faces: ["oclusal"],
      })
      .select("id").single();
    if (cErr) throw cErr;
    celulaId = celula.id;

    tabelaPratica = await criarTabela("Prática 03.8.a", { escopo: "pratica" }, 250);
    tabelaTipo = await criarTabela(
      "Especialista 03.8.a",
      { escopo: "tipo_profissional", tipo_profissional_id: tipoEspecialista },
      400,
    );
    for (const id of [tabelaPratica, tabelaTipo]) {
      const { error } = await admin.schema("aba_finance").rpc("comprometer_tabela_preco", { p_tabela_id: id });
      // `service_role` não tem `auth.uid()`, e comprometer EXIGE autor —
      // a fixture usa o `owner`, que é o caminho real.
      if (error) {
        const owner = await clientAs("owner");
        const { error: e2 } = await owner.schema("aba_finance").rpc("comprometer_tabela_preco", { p_tabela_id: id });
        if (e2) throw e2;
      }
    }
  });

  afterAll(async () => {
    // DELETE completo, por identificador — resíduo de fixture já custou
    // uma subetapa neste projeto (`instrucoes.md` §5).
    //
    // E ELA PRECISA DA CONEXÃO DE DONO, com `DISABLE TRIGGER`. Isso não é
    // atalho de conveniência: é a confirmação, medida, de que os gatilhos
    // de imutabilidade da §3 da migration `048` **não têm caminho pela
    // aplicação** — nem `service_role`, que ignora RLS por natureza,
    // consegue apagar uma tarifa comprometida. Se um dia esta limpeza
    // voltar a funcionar sem desligar nada, a imutabilidade terá sido
    // afrouxada em algum lugar.
    // `pg` vem por import dinâmico e é tipado por `pg.d.ts`, ao lado —
    // o projeto não tem `@types/pg` porque todos os outros consumidores
    // dele são `.mjs`.
    const { default: pg } = await import("pg");
    const dono = new pg.Client({
      connectionString: process.env.SUPABASE_TEST_DB_URL,
      ssl: { rejectUnauthorized: false },
    });
    await dono.connect();
    try {
      for (const t of ["aba_finance.tarifas", "aba_finance.tabelas_preco",
                       "aba_finance.orcamentos", "aba_finance.itens_orcamento"]) {
        await dono.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
      }
      await dono.query(
        `DELETE FROM aba_finance.itens_orcamento WHERE orcamento_id IN
           (SELECT id FROM aba_finance.orcamentos WHERE plano_id = $1)`, [planoId]);
      await dono.query(`DELETE FROM aba_finance.orcamentos WHERE plano_id = $1`, [planoId]);
      const tabelas = [tabelaPratica, tabelaTipo].filter(Boolean);
      if (tabelas.length) {
        await dono.query(`DELETE FROM aba_finance.tarifas WHERE tabela_preco_id = ANY($1)`, [tabelas]);
        await dono.query(`DELETE FROM aba_finance.tabelas_preco WHERE id = ANY($1)`, [tabelas]);
      }
    } finally {
      for (const t of ["aba_finance.tarifas", "aba_finance.tabelas_preco",
                       "aba_finance.orcamentos", "aba_finance.itens_orcamento"]) {
        await dono.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`).catch(() => {});
      }
      await dono.end();
    }

    await admin.schema("aba_treatment").from("procedimentos_plano").delete().eq("plano_id", planoId);
    await admin.schema("aba_treatment").from("opcoes").delete().eq("plano_id", planoId);
    await admin.schema("aba_treatment").from("planos").delete().eq("id", planoId);
    for (const id of [profComum, profEspecialista]) {
      if (id) await admin.schema("aba_scheduling").from("profissionais").delete().eq("id", id);
    }
    for (const id of funcionarios) {
      await admin.schema("aba_people").from("funcionarios").delete().eq("id", id);
      await admin.schema("aba_people").from("pessoas").delete().eq("id", id);
    }
    await admin.schema("aba_catalog").from("procedimentos").delete().eq("id", procId);
    await admin.schema("aba_catalog").from("categorias").delete().eq("id", categoriaId);
    for (const id of [clienteId, outroClienteId]) {
      if (!id) continue;
      await admin.schema("aba_health").from("log_acesso").delete().eq("cliente_id", id);
      await admin.schema("aba_people").from("clientes").delete().eq("id", id);
      await admin.schema("aba_people").from("pessoas").delete().eq("id", id);
    }
  });

  // ============================================================
  // 1. FRONTEIRA — anon, e a superfície do schema
  // ============================================================

  it("ATAQUE: `anon` não alcança nenhuma tabela nova do orçamento", async () => {
    const anon = anonClient();
    for (const tabela of ["tabelas_preco", "tarifas", "orcamentos", "itens_orcamento"]) {
      const { error } = await anon.schema("aba_finance").from(tabela).select("id").limit(1);
      expect(ehErroRls(error), `${tabela} deveria recusar anon`).toBe(true);
    }
    const { error } = await anon.schema("aba_scheduling").from("tipos_profissional").select("id").limit(1);
    expect(ehErroRls(error)).toBe(true);
  });

  it("ATAQUE: `anon` não executa nenhuma das operações de preço", async () => {
    const anon = anonClient();
    const chamadas = [
      anon.schema("aba_finance").rpc("resolver_preco", { p_procedimento_id: procId }),
      anon.schema("aba_finance").rpc("montar_orcamento", { p_opcao_id: opcaoId }),
      anon.schema("aba_finance").rpc("ler_orcamentos", { p_plano_id: planoId }),
      anon.schema("aba_finance").rpc("comprometer_tabela_preco", { p_tabela_id: tabelaPratica }),
    ];
    for (const { error } of await Promise.all(chamadas)) {
      expect(error).not.toBeNull();
    }
  });

  // ============================================================
  // 2. A ESCADA — o preço se resolve, não se escolhe
  // ============================================================

  it("a mesma consulta custa R$ 250 com o profissional comum e R$ 400 com o especialista", async () => {
    const owner = await clientAs("owner");
    const { data: comum } = await owner.schema("aba_finance").rpc("resolver_preco", {
      p_procedimento_id: procId, p_cliente_id: clienteId, p_profissional_id: profComum,
    });
    const { data: espec } = await owner.schema("aba_finance").rpc("resolver_preco", {
      p_procedimento_id: procId, p_cliente_id: clienteId, p_profissional_id: profEspecialista,
    });
    // Ninguém escolheu tabela: o degrau é consequência do TIPO de quem
    // executa. É a prova ao vivo da fonte (`fontes/ice.md` §5.2).
    expect(Number(comum![0].valor)).toBe(250);
    expect(comum![0].degrau).toBe("pratica");
    expect(Number(espec![0].valor)).toBe(400);
    expect(espec![0].degrau).toBe("tipo_profissional");
  });

  it("ATAQUE: não há parâmetro por onde a tela escolher a tabela de preço", async () => {
    const owner = await clientAs("owner");
    // Passar a tabela como argumento não é "ignorado": o PostgREST não
    // acha função com essa assinatura. Não existe caminho.
    const { error } = await owner.schema("aba_finance").rpc("resolver_preco", {
      p_procedimento_id: procId, p_tabela_preco_id: tabelaTipo,
    } as Record<string, unknown>);
    expect(error).not.toBeNull();
  });

  it("ATAQUE: tabela de preço de OUTRA conta não resolve preço nesta", async () => {
    // O `account_id` do chamador é reafirmado dentro de `resolver_preco`,
    // que é `SECURITY DEFINER` e por isso não passa por RLS. Sem essa
    // linha, saber um UUID bastaria para ler preço alheio.
    const { data: outraConta } = await admin.from("accounts").select("id").neq("id", ctx.accountId).limit(1);
    if (!outraConta?.length) return; // banco de teste com uma conta só
    const owner = await clientAs("owner");
    const { data } = await owner.schema("aba_finance").rpc("resolver_preco", {
      p_procedimento_id: procId, p_cliente_id: clienteId, p_profissional_id: profEspecialista,
    });
    expect(data![0].tabela_preco_id).toBe(tabelaTipo);
  });

  // ============================================================
  // 3. IMUTABILIDADE — o passado do financeiro não se reescreve
  // ============================================================

  it("ATAQUE: `admin` não altera tarifa de tabela comprometida — e o valor continua o mesmo", async () => {
    const adminUser = await clientAs("admin");
    const { error } = await adminUser
      .schema("aba_finance").from("tarifas")
      .update({ valor: 999 }).eq("tabela_preco_id", tabelaTipo);
    expect(error?.code).toBe("23514");
    expect(error?.message).toMatch(/TABELA NOVA/i);

    // Contar depois é obrigatório: recusa que não deixa erro é
    // indistinguível de sucesso (lição da 03.8).
    const { data } = await admin.schema("aba_finance").from("tarifas")
      .select("valor").eq("tabela_preco_id", tabelaTipo).single();
    expect(Number(data!.valor)).toBe(400);
  });

  it("ATAQUE: apagar a tarifa comprometida — a porta dos fundos do reajuste", async () => {
    const adminUser = await clientAs("admin");
    const { error } = await adminUser
      .schema("aba_finance").from("tarifas").delete().eq("tabela_preco_id", tabelaTipo);
    expect(error?.code).toBe("23514");
    const { count } = await admin.schema("aba_finance").from("tarifas")
      .select("id", { count: "exact", head: true }).eq("tabela_preco_id", tabelaTipo);
    expect(count).toBe(1);
  });

  it("ATAQUE: mover o DEGRAU de uma tabela comprometida muda o passado sem tocar em valor", async () => {
    const adminUser = await clientAs("admin");
    const { error } = await adminUser
      .schema("aba_finance").from("tabelas_preco").update({ escopo: "paciente" }).eq("id", tabelaTipo);
    expect(error?.code).toBe("23514");
    const { data } = await admin.schema("aba_finance").from("tabelas_preco")
      .select("escopo").eq("id", tabelaTipo).single();
    expect(data!.escopo).toBe("tipo_profissional");
  });

  it("ATAQUE: `agent` não cria nem compromete tabela de preço — quem define preço é a recepção", async () => {
    const agent = await clientAs("agent");
    const { error: eInsert } = await agent
      .schema("aba_finance").from("tabelas_preco")
      .insert({ account_id: ctx.accountId, nome: "Tabela pirata 03.8.a", escopo: "pratica" });
    expect(ehErroRls(eInsert)).toBe(true);

    const { count } = await admin.schema("aba_finance").from("tabelas_preco")
      .select("id", { count: "exact", head: true }).eq("nome", "Tabela pirata 03.8.a");
    expect(count).toBe(0);
  });

  // ============================================================
  // 4. ALÇADA FINANCEIRA — dinheiro é da recepção
  // ============================================================

  it("o orçamento se monta pela escada, e a linha guarda a PROVENIÊNCIA", async () => {
    const agent = await clientAs("agent");
    const { data, error } = await agent
      .schema("aba_finance").rpc("montar_orcamento", { p_opcao_id: opcaoId, p_profissional_id: profEspecialista });
    expect(error).toBeNull();
    orcamentoId = data as unknown as string;

    const { data: itens } = await admin.schema("aba_finance").from("itens_orcamento")
      .select("valor_resolvido, degrau, tabela_preco_id, procedimento_plano_id").eq("orcamento_id", orcamentoId);
    expect(itens).toHaveLength(1);
    expect(Number(itens![0].valor_resolvido)).toBe(400);
    // Não é escolha de tela: é o registro de onde o número veio.
    expect(itens![0].tabela_preco_id).toBe(tabelaTipo);
    expect(itens![0].degrau).toBe("tipo_profissional");
    expect(itens![0].procedimento_plano_id).toBe(celulaId);
  });

  it("ATAQUE: `agent` (o profissional) não dá desconto, não parcela e não mexe em juros", async () => {
    const agent = await clientAs("agent");
    for (const campo of [
      { desconto_valor: 100 },
      { parcelas: 12 },
      { taxa_juros: 5 },
      { taxa_multa_atraso: 2 },
      { promocao: "Black Friday" },
    ]) {
      const { error } = await agent
        .schema("aba_finance").from("orcamentos").update(campo).eq("id", orcamentoId);
      expect(ehErroRls(error), `${Object.keys(campo)[0]} deveria exigir admin`).toBe(true);
    }

    // E nada mudou. A policy de UPDATE autoriza `agent` na LINHA — é o
    // gatilho de coluna que recusa, e sem esta conferência a diferença
    // entre "recusou" e "não fez efeito" ficaria invisível.
    const { data } = await admin.schema("aba_finance").from("orcamentos")
      .select("desconto_valor, parcelas, taxa_juros, promocao").eq("id", orcamentoId).single();
    expect(Number(data!.desconto_valor)).toBe(0);
    expect(data!.parcelas).toBe(1);
    expect(Number(data!.taxa_juros)).toBe(0);
    expect(data!.promocao).toBeNull();
  });

  it("CONTROLE POSITIVO: `admin` dá o desconto, e o líquido acompanha", async () => {
    const adminUser = await clientAs("admin");
    const { error } = await adminUser
      .schema("aba_finance").from("orcamentos")
      .update({ desconto_valor: 50, desconto_motivo: "Cortesia", parcelas: 3 }).eq("id", orcamentoId);
    expect(error).toBeNull();

    const { data } = await admin.schema("aba_finance").from("orcamentos")
      .select("valor_bruto, valor_liquido, parcelas").eq("id", orcamentoId).single();
    expect(Number(data!.valor_bruto)).toBe(400);
    expect(Number(data!.valor_liquido)).toBe(350);
    expect(data!.parcelas).toBe(3);
  });

  it("a troca de profissional avisa a diferença ANTES de confirmar, e a simulação não grava", async () => {
    const agent = await clientAs("agent");
    const { data: sim, error } = await agent
      .schema("aba_finance").rpc("simular_troca_de_profissional", {
        p_orcamento_id: orcamentoId, p_profissional_id: profComum,
      });
    expect(error).toBeNull();
    expect(sim).toHaveLength(1);
    expect(Number(sim![0].diferenca)).toBe(-150);

    const { data: intacto } = await admin.schema("aba_finance").from("orcamentos")
      .select("valor_bruto").eq("id", orcamentoId).single();
    expect(Number(intacto!.valor_bruto)).toBe(400);
  });

  // ============================================================
  // 5. P-SUB — a fronteira de aba_health atravessou para o financeiro?
  // ============================================================

  async function contarLogPeloOrcamento(): Promise<number> {
    const { data } = await admin.schema("aba_health").from("log_acesso")
      .select("id, contexto").eq("cliente_id", clienteId).eq("tipo_registro", "plano");
    return (data ?? []).filter(
      (l) => (l.contexto as Record<string, string> | null)?.via === "aba_finance.ler_orcamentos",
    ).length;
  }

  it("ATAQUE: o item do orçamento NÃO guarda dente nem face — a coluna não existe", async () => {
    const owner = await clientAs("owner");
    for (const coluna of ["dente", "faces"]) {
      const { error } = await owner.schema("aba_finance").from("itens_orcamento").select(coluna).limit(1);
      // Coluna que não existe é proteção mais forte que coluna revogada:
      // não há o que esquecer de revogar quando alguém acrescentar um
      // `GRANT` amplo depois.
      expect(error, `itens_orcamento.${coluna} não deveria existir`).not.toBeNull();
    }
  });

  it("ATAQUE: `viewer` com finance.read lê o orçamento inteiro e NÃO chega ao dente", async () => {
    const antes = await contarLogPeloOrcamento();
    const viewer = await clientAs("viewer");
    const { data, error } = await viewer.schema("aba_finance").rpc("ler_orcamentos", { p_plano_id: planoId });
    expect(error).toBeNull();

    const linhas = (data ?? []) as Record<string, unknown>[];
    expect(linhas.length).toBe(1);
    // Os valores saem: é para isso que o orçamento existe.
    expect(Number(linhas[0].valor_liquido)).toBe(350);
    expect(linhas[0].com_detalhe_clinico).toBe(false);
    const itens = linhas[0].itens as { dente: string | null; faces: string[] | null; procedimento: string }[];
    expect(itens.every((i) => i.dente === null && i.faces === null)).toBe(true);
    // E o nome do procedimento continua legível — `aba_catalog` é público
    // na conta desde a 01.3, e a fronteira que se protege é a associação
    // paciente × dente × face.
    expect(itens[0].procedimento).toBe("Consulta 03.8.a");

    // Nada clínico foi lido, então nada é logado: log a mais aqui seria
    // log mentindo.
    expect(await contarLogPeloOrcamento()).toBe(antes);
  });

  it("CONTROLE POSITIVO: quem TEM alcance clínico recebe o dente — e a leitura fica registrada", async () => {
    const antes = await contarLogPeloOrcamento();
    const owner = await clientAs("owner");
    const { data, error } = await owner.schema("aba_finance").rpc("ler_orcamentos", { p_plano_id: planoId });
    expect(error).toBeNull();

    const linhas = (data ?? []) as Record<string, unknown>[];
    expect(linhas[0].com_detalhe_clinico).toBe(true);
    const itens = linhas[0].itens as { dente: string | null; faces: string[] | null }[];
    expect(itens[0].dente).toBe("16");
    expect(itens[0].faces).toEqual(["oclusal"]);

    // Uma abertura de tela, uma linha de log. Um log que conta cliques em
    // vez de leituras é um log que ninguém consegue ler.
    expect(await contarLogPeloOrcamento()).toBe(antes + 1);
  });

  it("ATAQUE: o orçamento de um plano de outra conta não sai por `ler_orcamentos`", async () => {
    const owner = await clientAs("owner");
    const { data, error } = await owner
      .schema("aba_finance").rpc("ler_orcamentos", { p_plano_id: "00000000-0000-0000-0000-000000000000" });
    // Vazio e não erro: erro explícito confirmaria a existência do plano
    // a quem não pode enxergá-lo (mesma decisão de `ler_evolucoes`).
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("ATAQUE: célula do plano de OUTRO paciente não entra neste orçamento", async () => {
    const { data: outroPlano } = await admin
      .schema("aba_treatment").from("planos")
      .insert({ account_id: ctx.accountId, cliente_id: outroClienteId, titulo: "Plano alheio 03.8.a" })
      .select("id").single();

    const agent = await clientAs("agent");
    const { error } = await agent
      .schema("aba_finance").from("itens_orcamento")
      .insert({
        account_id: ctx.accountId, orcamento_id: orcamentoId, procedimento_plano_id: celulaId,
        procedimento_id: procId, valor_resolvido: 1, degrau: "catalogo",
      });
    // Aqui a recusa é do UNIQUE — o item já está no orçamento —, e o que
    // importa é o caso seguinte: a chave composta por `account_id` protege
    // entre CLÍNICAS e não entre PACIENTES da mesma clínica.
    expect(error).not.toBeNull();

    await admin.schema("aba_treatment").from("planos").delete().eq("id", outroPlano!.id);
  });

  it("a auditoria de isolamento de conta continua devolvendo zero linhas", async () => {
    const { data, error } = await admin.rpc("fks_sem_isolamento_de_conta");
    expect(error).toBeNull();
    // Nove chaves estrangeiras novas nasceram nesta subetapa, todas
    // compostas por `account_id`. A guarda já listava os três schemas
    // tocados — conferido antes do primeiro `CREATE TABLE`, que é a lição
    // que a 03.8 pagou.
    expect(data).toEqual([]);
  });
});
