#!/usr/bin/env node
/**
 * Evidência do orçamento: o preço que se resolve (Subetapa 03.8.a).
 *
 *   node scripts/evidencia_orcamento.mjs
 *
 * ============================================================
 * O QUE ESTA EVIDÊNCIA PROVA, E QUE A SUÍTE DE RLS NÃO PROVA
 * ============================================================
 * `tests/rls/20_orcamento.spec.ts` prova a fronteira e as recusas por
 * usuário autenticado real. O que ele não prova é a CORRENTE COMPLETA do
 * preço, com dado de verdade e os cinco degraus montados ao mesmo tempo:
 *
 *   `aba_finance.tabelas_preco` (com vigência, comprometida)
 *        │  escada: Paciente > Tipo de profissional > Clínica > Grupo > Prática
 *        ▼
 *   `aba_finance.resolver_preco()`  ← sem parâmetro de tabela: NÃO SE ESCOLHE
 *        ▼
 *   `aba_finance.itens_orcamento.valor_resolvido` + `tabela_preco_id`
 *        (o valor congelado, com a PROVENIÊNCIA de onde ele veio)
 *
 * E a asserção que mais importa é a da fonte: a MESMA consulta custa
 * R$ 250 com um profissional comum e R$ 400 com um especialista, sem
 * ninguém escolher tabela nenhuma (`design/benchmark/fontes/ice.md`
 * §5.2). Se um dia alguém acrescentar um parâmetro de tabela a
 * `resolver_preco`, a escada vira sugestão — e a verificação (g) da
 * migration `048` existe justamente para recusar isso.
 *
 * ============================================================
 * SESSÃO SIMULADA POR `request.jwt.claims`, E POR QUÊ
 * ============================================================
 * Metade das travas desta subetapa depende de QUEM está falando —
 * `auth.uid()` para a autoria, `is_account_member()` para a alçada de
 * `admin`, a RLS inteira para o resto. Rodar como `postgres` provaria
 * apenas que o SQL compila; foi exatamente esse o caminho que, na 03.8,
 * escondeu o `auth.uid()` nulo de `consentir_opcao` até a evidência
 * quebrar (`instrucoes.md` §5).
 *
 * Então cada bloco abre transação, assume `role authenticated` e planta o
 * `sub` do usuário de teste em `request.jwt.claims` — que é literalmente
 * de onde `auth.uid()` lê. É o caminho da aplicação, sem gastar o
 * endpoint de token (rodar a suíte várias vezes seguidas estoura o rate
 * limit de auth e o sintoma parece regressão de RLS aleatória —
 * `instrucoes.md` §5).
 *
 * ============================================================
 * RODA NO BANCO DE TESTES, NUNCA NO DE PRODUÇÃO
 * ============================================================
 * Mesma trava de `provisionar_banco.mjs`. E cria tudo o que usa, apagando
 * exatamente o que criou, por identificador — nunca "o mais recente".
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
config({ path: path.join(RAIZ, ".env") });

const URL_TESTE = process.env.SUPABASE_TEST_DB_URL;
if (!URL_TESTE) {
  console.error("Falta SUPABASE_TEST_DB_URL no .env da raiz (string do Session pooler do projeto de TESTE).");
  process.exit(1);
}
if (process.env.SUPABASE__URL && URL_TESTE.includes(new URL(process.env.SUPABASE__URL).hostname.split(".")[0])) {
  console.error("SUPABASE_TEST_DB_URL aponta para o projeto de PRODUÇÃO. Recusando.");
  process.exit(1);
}

const cliente = new pg.Client({ connectionString: URL_TESTE, ssl: { rejectUnauthorized: false } });
await cliente.connect();

const resultados = [];
function afirmar(nome, ok, detalhe = "") {
  resultados.push({ nome, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${nome}${detalhe ? `  — ${detalhe}` : ""}`);
}
const q = (sql, params) => cliente.query(sql, params);

/**
 * Executa `fn` como o usuário indicado, dentro de uma transação própria.
 * `ROLLBACK` não serve aqui — parte da evidência é o estado que sobra
 * para o passo seguinte —, então cada bloco confirma; a limpeza é no
 * `finally`, por identificador.
 */
async function como(userId, fn) {
  await q("BEGIN");
  await q("SET LOCAL ROLE authenticated");
  await q("SELECT set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  try {
    const r = await fn();
    await q("COMMIT");
    return r;
  } catch (e) {
    await q("ROLLBACK").catch(() => {});
    throw e;
  }
}

/** Roda `fn` esperando recusa; devolve o SQLSTATE, ou null se passou. */
async function recusaComo(userId, fn) {
  try {
    await como(userId, fn);
    return null;
  } catch (e) {
    return e.code ?? "sem-codigo";
  }
}

const MARCA = "EVIDENCIA_03_8_A";
let contaId, clienteId, outroClienteId, categoriaId, procConsulta, procLimpeza;
let planoId, opcaoA, faseId, profComum, profEspecialista, tipoComum, tipoEspecialista;
let tabelaPratica, tabelaTipo, tabelaPaciente, orcamentoId, contratoId;
const funcionarios = [];
const usuarios = {};

try {
  ({ rows: [{ id: contaId }] } = await q("SELECT id FROM public.accounts ORDER BY created_at LIMIT 1"));
  const { rows: us } = await q(
    `SELECT p.account_role AS papel, u.id
       FROM auth.users u JOIN public.profiles p ON p.user_id = u.id
      WHERE p.account_id = $1`,
    [contaId],
  );
  for (const u of us) usuarios[u.papel] = u.id;
  if (!usuarios.owner || !usuarios.admin || !usuarios.agent) {
    throw new Error("Faltam usuários de teste na conta. Rode scripts/seed_test_users.mjs.");
  }

  // ==================================================================
  // 0. Fixture: dois profissionais de TIPOS diferentes, um plano e a
  //    célula que vai ser orçada.
  // ==================================================================
  console.log("\n0) fixture — dois profissionais, tipos diferentes, um plano com uma consulta");

  ({ rows: [{ id: clienteId }] } = await q(
    `INSERT INTO aba_people.pessoas (account_id, nome_exibicao) VALUES ($1, $2) RETURNING id`,
    [contaId, `Paciente ${MARCA}`],
  ));
  await q(
    `INSERT INTO aba_people.clientes (id, account_id, razao_social, status) VALUES ($1,$2,$3,'ativo')`,
    [clienteId, contaId, `Paciente ${MARCA}`],
  );
  ({ rows: [{ id: outroClienteId }] } = await q(
    `INSERT INTO aba_people.pessoas (account_id, nome_exibicao) VALUES ($1, $2) RETURNING id`,
    [contaId, `Outro paciente ${MARCA}`],
  ));
  await q(
    `INSERT INTO aba_people.clientes (id, account_id, razao_social, status) VALUES ($1,$2,$3,'ativo')`,
    [outroClienteId, contaId, `Outro paciente ${MARCA}`],
  );

  ({ rows: [{ id: categoriaId }] } = await q(
    `INSERT INTO aba_catalog.categorias (account_id, nome) VALUES ($1,$2) RETURNING id`,
    [contaId, `Categoria ${MARCA}`],
  ));
  ({ rows: [{ id: procConsulta }] } = await q(
    `INSERT INTO aba_catalog.procedimentos (account_id, categoria_id, nome, preco_base)
     VALUES ($1,$2,$3,180) RETURNING id`,
    [contaId, categoriaId, `Consulta ${MARCA}`],
  ));
  ({ rows: [{ id: procLimpeza }] } = await q(
    `INSERT INTO aba_catalog.procedimentos (account_id, categoria_id, nome, preco_base)
     VALUES ($1,$2,$3,90) RETURNING id`,
    [contaId, categoriaId, `Limpeza ${MARCA}`],
  ));

  ({ rows: [{ id: tipoComum }] } = await q(
    `SELECT id FROM aba_scheduling.tipos_profissional WHERE account_id=$1 AND chave='clinico_geral'`,
    [contaId],
  ));
  ({ rows: [{ id: tipoEspecialista }] } = await q(
    `SELECT id FROM aba_scheduling.tipos_profissional WHERE account_id=$1 AND chave='especialista'`,
    [contaId],
  ));
  afirmar("os dois tipos de profissional nasceram semeados pela migration", !!tipoComum && !!tipoEspecialista);

  // A CADEIA DE INVARIANTES DA EQUIPE, medida ao escrever esta evidência:
  // `profissionais_ativo_exige_funcionario` e, atrás dele,
  // `funcionarios_ativo_exige_login` — profissional ativo exige
  // funcionário ativo, que exige login real (`instrucoes.md` §5,
  // "fixture de agenda não nasce com profissional inventado").
  //
  // A fixture nasce INATIVA de propósito, e isso não enfraquece a
  // evidência: a escada de preço resolve pelo TIPO do profissional, e o
  // tipo não depende de o profissional estar em atividade. Criar usuário
  // de autenticação só para isto gastaria o endpoint de token — que é
  // exatamente o que este script existe para evitar — e deixaria conta
  // descartável no banco, que é o resíduo que a 02.15 achou em produção.
  async function criarProfissional(nome, tipoId) {
    const { rows: [pessoa] } = await q(
      `INSERT INTO aba_people.pessoas (account_id, nome_exibicao) VALUES ($1,$2) RETURNING id`,
      [contaId, nome],
    );
    await q(
      `INSERT INTO aba_people.funcionarios (id, account_id, cargo, ativo) VALUES ($1,$2,'Dentista',FALSE)`,
      [pessoa.id, contaId],
    );
    const { rows: [prof] } = await q(
      `INSERT INTO aba_scheduling.profissionais
         (account_id, nome_exibicao, tipo_profissional_id, funcionario_id, ativo, acesso_clinico)
       VALUES ($1,$2,$3,$4,FALSE,FALSE) RETURNING id`,
      [contaId, nome, tipoId, pessoa.id],
    );
    funcionarios.push(pessoa.id);
    return prof.id;
  }

  profComum = await criarProfissional(`Dr. Comum ${MARCA}`, tipoComum);
  profEspecialista = await criarProfissional(`Dra. Especialista ${MARCA}`, tipoEspecialista);

  ({ rows: [{ id: planoId }] } = await q(
    `INSERT INTO aba_treatment.planos (account_id, cliente_id, titulo, profissional_id)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [contaId, clienteId, `Plano ${MARCA}`, profComum],
  ));
  ({ rows: [{ id: opcaoA }] } = await q(
    `INSERT INTO aba_treatment.opcoes (account_id, plano_id, rotulo, ordem)
     VALUES ($1,$2,'A',1) RETURNING id`,
    [contaId, planoId],
  ));
  ({ rows: [{ id: faseId }] } = await q(
    `SELECT id FROM aba_treatment.fases WHERE account_id=$1 AND chave='definitiva'`,
    [contaId],
  ));
  await q(
    `INSERT INTO aba_treatment.procedimentos_plano
       (account_id, plano_id, opcao_id, fase_id, procedimento_id)
     VALUES ($1,$2,$3,$4,$5)`,
    [contaId, planoId, opcaoA, faseId, procConsulta],
  );

  // ==================================================================
  // 1. A TABELA DE PREÇO TEM VIGÊNCIA — e comprometer é ato datado
  // ==================================================================
  console.log("\n1) a tabela de preço como entidade com vigência (item 41)");

  tabelaPratica = await como(usuarios.admin, async () => {
    const { rows: [t] } = await q(
      `INSERT INTO aba_finance.tabelas_preco (account_id, nome, escopo)
       VALUES ($1,$2,'pratica') RETURNING id`,
      [contaId, `Prática ${MARCA}`],
    );
    await q(
      `INSERT INTO aba_finance.tarifas (account_id, tabela_preco_id, procedimento_id, valor)
       VALUES ($1,$2,$3,250), ($1,$2,$4,120)`,
      [contaId, t.id, procConsulta, procLimpeza],
    );
    return t.id;
  });
  afirmar("admin cria tabela de preço em rascunho e escreve tarifa nela", !!tabelaPratica);

  const semTarifa = await como(usuarios.admin, async () => {
    const { rows: [t] } = await q(
      `INSERT INTO aba_finance.tabelas_preco (account_id, nome, escopo)
       VALUES ($1,$2,'pratica') RETURNING id`,
      [contaId, `Vazia ${MARCA}`],
    );
    return t.id;
  });
  const recusaVazia = await recusaComo(usuarios.admin, () =>
    q(`SELECT aba_finance.comprometer_tabela_preco($1)`, [semTarifa]),
  );
  afirmar("tabela SEM tarifa não se compromete — ela entraria na escada sem resolver nada", recusaVazia === "23514", recusaVazia ?? "passou");
  await como(usuarios.admin, () => q(`DELETE FROM aba_finance.tabelas_preco WHERE id=$1`, [semTarifa]));

  await como(usuarios.admin, () => q(`SELECT aba_finance.comprometer_tabela_preco($1)`, [tabelaPratica]));
  const { rows: [comp] } = await q(
    `SELECT estado, vigente_de, comprometida_por FROM aba_finance.tabelas_preco WHERE id=$1`,
    [tabelaPratica],
  );
  afirmar(
    "comprometer carimba estado, data de vigência e AUTOR",
    comp.estado === "comprometida" && !!comp.vigente_de && comp.comprometida_por === usuarios.admin,
    `${comp.estado} / ${comp.vigente_de?.toISOString?.().slice(0, 10)}`,
  );

  // ==================================================================
  // 2. TARIFA COMPROMETIDA É IMUTÁVEL — reajuste é tabela nova
  // ==================================================================
  console.log("\n2) tarifa comprometida é imutável — passado de financeiro não se reescreve");

  const recusaUpdate = await recusaComo(usuarios.admin, () =>
    q(`UPDATE aba_finance.tarifas SET valor = 999 WHERE tabela_preco_id=$1 AND procedimento_id=$2`,
      [tabelaPratica, procConsulta]),
  );
  afirmar("UPDATE de tarifa comprometida é RECUSADO", recusaUpdate === "23514", recusaUpdate ?? "passou");

  const recusaDelete = await recusaComo(usuarios.admin, () =>
    q(`DELETE FROM aba_finance.tarifas WHERE tabela_preco_id=$1 AND procedimento_id=$2`,
      [tabelaPratica, procLimpeza]),
  );
  afirmar("DELETE de tarifa comprometida é RECUSADO — a metade que se esquece", recusaDelete === "23514", recusaDelete ?? "passou");

  const recusaEscopo = await recusaComo(usuarios.admin, () =>
    q(`UPDATE aba_finance.tabelas_preco SET escopo='clinica' WHERE id=$1`, [tabelaPratica]),
  );
  afirmar("mover o DEGRAU de uma tabela comprometida é RECUSADO — reescreveria o passado sem tocar em valor", recusaEscopo === "23514", recusaEscopo ?? "passou");

  const recusaApagar = await recusaComo(usuarios.admin, () =>
    q(`DELETE FROM aba_finance.tabelas_preco WHERE id=$1`, [tabelaPratica]),
  );
  afirmar("tabela comprometida não se apaga — ela é a proveniência do que resolveu", recusaApagar === "23514", recusaApagar ?? "passou");

  // ==================================================================
  // 3. A ESCADA — a mesma consulta, dois profissionais, dois preços
  // ==================================================================
  console.log("\n3) a escada: a MESMA consulta, R$ 250 com o comum e R$ 400 com o especialista");

  tabelaTipo = await como(usuarios.admin, async () => {
    const { rows: [t] } = await q(
      `INSERT INTO aba_finance.tabelas_preco (account_id, nome, escopo, tipo_profissional_id)
       VALUES ($1,$2,'tipo_profissional',$3) RETURNING id`,
      [contaId, `Especialista ${MARCA}`, tipoEspecialista],
    );
    await q(
      `INSERT INTO aba_finance.tarifas (account_id, tabela_preco_id, procedimento_id, valor)
       VALUES ($1,$2,$3,400)`,
      [contaId, t.id, procConsulta],
    );
    await q(`SELECT aba_finance.comprometer_tabela_preco($1)`, [t.id]);
    return t.id;
  });

  const precoComum = await como(usuarios.owner, async () => {
    const { rows } = await q(`SELECT * FROM aba_finance.resolver_preco($1,$2,$3)`, [procConsulta, clienteId, profComum]);
    return rows[0];
  });
  const precoEspec = await como(usuarios.owner, async () => {
    const { rows } = await q(`SELECT * FROM aba_finance.resolver_preco($1,$2,$3)`, [procConsulta, clienteId, profEspecialista]);
    return rows[0];
  });

  afirmar(
    "profissional COMUM resolve em R$ 250 pelo degrau `pratica`",
    Number(precoComum.valor) === 250 && precoComum.degrau === "pratica",
    `${precoComum.valor} / ${precoComum.degrau}`,
  );
  afirmar(
    "profissional ESPECIALISTA resolve em R$ 400 pelo degrau `tipo_profissional` — mesma consulta, ninguém escolheu nada",
    Number(precoEspec.valor) === 400 && precoEspec.degrau === "tipo_profissional",
    `${precoEspec.valor} / ${precoEspec.degrau}`,
  );

  // O degrau do paciente vence os dois — é o mesmo degrau que receberá o
  // convênio quando o convênio existir (D-V5, `docs/02` §13.4).
  tabelaPaciente = await como(usuarios.admin, async () => {
    const { rows: [t] } = await q(
      `INSERT INTO aba_finance.tabelas_preco (account_id, nome, escopo, cliente_id)
       VALUES ($1,$2,'paciente',$3) RETURNING id`,
      [contaId, `Cortesia ${MARCA}`, clienteId],
    );
    await q(
      `INSERT INTO aba_finance.tarifas (account_id, tabela_preco_id, procedimento_id, valor)
       VALUES ($1,$2,$3,100)`,
      [contaId, t.id, procConsulta],
    );
    // Comprometida ONTEM de propósito: o passo 5 precisa encerrá-la, e
    // encerrar tem piso no próprio início (uma tabela não deixa de valer
    // antes de ter valido).
    await q(`SELECT aba_finance.comprometer_tabela_preco($1, CURRENT_DATE - 1)`, [t.id]);
    return t.id;
  });

  const precoPaciente = await como(usuarios.owner, async () => {
    const { rows } = await q(`SELECT * FROM aba_finance.resolver_preco($1,$2,$3)`, [procConsulta, clienteId, profEspecialista]);
    return rows[0];
  });
  afirmar(
    "o degrau `paciente` vence o de tipo de profissional — a escada é percorrida na ordem",
    Number(precoPaciente.valor) === 100 && precoPaciente.degrau === "paciente",
    `${precoPaciente.valor} / ${precoPaciente.degrau}`,
  );

  const precoOutro = await como(usuarios.owner, async () => {
    const { rows } = await q(`SELECT * FROM aba_finance.resolver_preco($1,$2,$3)`, [procConsulta, outroClienteId, profEspecialista]);
    return rows[0];
  });
  afirmar(
    "preço PESSOAL de um paciente não resolve o preço de outro",
    Number(precoOutro.valor) === 400 && precoOutro.degrau === "tipo_profissional",
    `${precoOutro.valor} / ${precoOutro.degrau}`,
  );

  const precoSemTabela = await como(usuarios.owner, async () => {
    const { rows } = await q(`SELECT * FROM aba_finance.resolver_preco($1,$2,$3)`, [procLimpeza, outroClienteId, profEspecialista]);
    return rows[0];
  });
  afirmar(
    "procedimento fora da tabela do tipo cai para o degrau abaixo (R$ 120, `pratica`)",
    Number(precoSemTabela.valor) === 120 && precoSemTabela.degrau === "pratica",
    `${precoSemTabela.valor} / ${precoSemTabela.degrau}`,
  );

  // ==================================================================
  // 4. O ORÇAMENTO — valor congelado com PROVENIÊNCIA, sem escolha
  // ==================================================================
  console.log("\n4) o orçamento: valor resolvido e congelado, com a tabela que o resolveu");

  orcamentoId = await como(usuarios.agent, async () => {
    const { rows } = await q(`SELECT aba_finance.montar_orcamento($1,$2) AS id`, [opcaoA, profComum]);
    return rows[0].id;
  });

  const { rows: [item] } = await q(
    `SELECT i.valor_resolvido, i.degrau, i.tabela_preco_id, tp.nome AS tabela
       FROM aba_finance.itens_orcamento i
       LEFT JOIN aba_finance.tabelas_preco tp ON tp.id = i.tabela_preco_id
      WHERE i.orcamento_id = $1`,
    [orcamentoId],
  );
  afirmar(
    "a linha guarda o VALOR RESOLVIDO com a tabela que o resolveu como proveniência",
    Number(item.valor_resolvido) === 100 && item.degrau === "paciente" && item.tabela_preco_id === tabelaPaciente,
    `R$ ${item.valor_resolvido} via "${item.tabela}"`,
  );

  const { rows: [tot] } = await q(
    `SELECT valor_bruto, valor_liquido FROM aba_finance.orcamentos WHERE id=$1`, [orcamentoId]);
  afirmar("o total do orçamento é mantido por gatilho a partir dos itens",
    Number(tot.valor_bruto) === 100 && Number(tot.valor_liquido) === 100, `bruto ${tot.valor_bruto}`);

  const { rows: colunas } = await q(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='aba_finance' AND table_name='itens_orcamento'
        AND column_name IN ('dente','faces')`,
  );
  afirmar("o item do orçamento NÃO guarda dente nem face — a fronteira de aba_health não se copia", colunas.length === 0);

  // ==================================================================
  // 5. TROCAR O PROFISSIONAL AVISA A DIFERENÇA ANTES DE CONFIRMAR
  // ==================================================================
  console.log("\n5) trocar o profissional recalcula — e avisa a diferença ANTES de confirmar");

  // Sem o degrau do paciente no caminho, a troca move de fato o preço. E
  // a cortesia sai pela OPERAÇÃO, não por `UPDATE` na linha — a §3 da
  // migration recusa mexer na linha, e é isso que torna a operação
  // necessária.
  await como(usuarios.admin, () =>
    q(`SELECT aba_finance.encerrar_tabela_preco($1)`, [tabelaPaciente]));
  const { rows: [encerrada] } = await q(
    `SELECT estado, vigente_ate FROM aba_finance.tabelas_preco WHERE id=$1`, [tabelaPaciente]);
  afirmar("uma tabela sai da escada pela operação de encerramento, sem ser substituída",
    encerrada.estado === "encerrada" && !!encerrada.vigente_ate);
  await como(usuarios.agent, () => q(`SELECT aba_finance.trocar_profissional_do_orcamento($1,$2)`, [orcamentoId, profComum]));

  const simulacao = await como(usuarios.agent, async () => {
    const { rows } = await q(`SELECT * FROM aba_finance.simular_troca_de_profissional($1,$2)`, [orcamentoId, profEspecialista]);
    return rows;
  });
  const { rows: [antes] } = await q(`SELECT valor_bruto FROM aba_finance.orcamentos WHERE id=$1`, [orcamentoId]);
  afirmar(
    "a simulação avisa a diferença item a item e NÃO grava nada",
    simulacao.length === 1 && Number(simulacao[0].diferenca) === 150 && Number(antes.valor_bruto) === 250,
    `${simulacao[0].valor_atual} → ${simulacao[0].valor_novo} (${simulacao[0].diferenca >= 0 ? "+" : ""}${simulacao[0].diferenca})`,
  );

  const diferenca = await como(usuarios.agent, async () => {
    const { rows } = await q(`SELECT aba_finance.trocar_profissional_do_orcamento($1,$2) AS d`, [orcamentoId, profEspecialista]);
    return Number(rows[0].d);
  });
  const { rows: [depois] } = await q(`SELECT valor_bruto FROM aba_finance.orcamentos WHERE id=$1`, [orcamentoId]);
  afirmar(
    "confirmar aplica EXATAMENTE a diferença que foi avisada — mesma resolver_preco nos dois caminhos",
    diferenca === 150 && Number(depois.valor_bruto) === 400,
    `+${diferenca} → R$ ${depois.valor_bruto}`,
  );

  // ==================================================================
  // 6. SÓ `admin` MEXE EM DINHEIRO — a trava é de banco
  // ==================================================================
  console.log("\n6) só a recepção (admin) mexe em desconto, parcela, juros, mora e promoção");

  const recusaDesconto = await recusaComo(usuarios.agent, () =>
    q(`UPDATE aba_finance.orcamentos SET desconto_valor = 50 WHERE id=$1`, [orcamentoId]));
  afirmar("agent (o profissional) é RECUSADO ao dar desconto", recusaDesconto === "42501", recusaDesconto ?? "passou");

  const recusaParcela = await recusaComo(usuarios.agent, () =>
    q(`UPDATE aba_finance.orcamentos SET parcelas = 6 WHERE id=$1`, [orcamentoId]));
  afirmar("agent é RECUSADO ao parcelar", recusaParcela === "42501", recusaParcela ?? "passou");

  // O CONTRATO PRECISA EXISTIR PARA A RECUSA SIGNIFICAR ALGUMA COISA.
  // A primeira versão deste caso rodava o `UPDATE` sem nenhuma linha na
  // tabela: zero linhas afetadas, nenhum erro, e o teste ficava VERDE sem
  // ter exercitado o gatilho. É literalmente a lição que a 03.8 pagou com
  // a policy de DELETE que nascera morta — "não deu erro" não é "passou"
  // (`instrucoes.md` §5).
  contratoId = await como(usuarios.admin, async () => {
    const { rows: [c] } = await q(
      `INSERT INTO aba_finance.contratos (account_id, cliente_id, descricao, valor)
       VALUES ($1,$2,$3,400) RETURNING id`,
      [contaId, clienteId, `Contrato ${MARCA}`],
    );
    return c.id;
  });

  const recusaJuros = await recusaComo(usuarios.agent, () =>
    q(`UPDATE aba_finance.contratos SET taxa_juros = 2 WHERE id=$1`, [contratoId]));
  const { rows: [juros] } = await q(`SELECT taxa_juros FROM aba_finance.contratos WHERE id=$1`, [contratoId]);
  afirmar(
    "a trava alcança `contratos`, que já existia — a regra é do produto, não do código novo",
    recusaJuros === "42501" && Number(juros.taxa_juros) === 0,
    `${recusaJuros ?? "passou"}, juros seguem em ${juros.taxa_juros}`,
  );

  await como(usuarios.admin, () =>
    q(`UPDATE aba_finance.orcamentos SET desconto_valor = 50, desconto_motivo = 'Cortesia', parcelas = 3 WHERE id=$1`, [orcamentoId]));
  const { rows: [comDesconto] } = await q(
    `SELECT desconto_valor, valor_bruto, valor_liquido, parcelas FROM aba_finance.orcamentos WHERE id=$1`, [orcamentoId]);
  afirmar(
    "CONTROLE POSITIVO: admin dá o desconto e o líquido acompanha (coluna gerada)",
    Number(comDesconto.desconto_valor) === 50 && Number(comDesconto.valor_liquido) === 350 && comDesconto.parcelas === 3,
    `bruto ${comDesconto.valor_bruto} − 50 = ${comDesconto.valor_liquido} em ${comDesconto.parcelas}x`,
  );

  // ==================================================================
  // 7. REAJUSTE É TABELA NOVA — e não muda o que já foi acordado
  // ==================================================================
  console.log("\n7) reajuste é tabela NOVA — e nenhum valor já acordado se mexe");

  await como(usuarios.agent, () => q(`SELECT aba_finance.aprovar_orcamento($1)`, [orcamentoId]));
  const { rows: [aprovado] } = await q(
    `SELECT estado, aprovado_por, valor_liquido FROM aba_finance.orcamentos WHERE id=$1`, [orcamentoId]);
  afirmar("aprovar carimba estado, autor e data", aprovado.estado === "aprovado" && !!aprovado.aprovado_por);

  const valorAcordado = Number(aprovado.valor_liquido);

  const novaTabela = await como(usuarios.admin, async () => {
    const { rows } = await q(`SELECT aba_finance.reajustar_tabela_preco($1, 20, $2) AS id`, [tabelaTipo, `Especialista 2027 ${MARCA}`]);
    return rows[0].id;
  });
  const { rows: [nova] } = await q(
    `SELECT t.estado, t.substitui_id, tf.valor
       FROM aba_finance.tabelas_preco t
       JOIN aba_finance.tarifas tf ON tf.tabela_preco_id = t.id
      WHERE t.id = $1`, [novaTabela]);
  afirmar(
    "o reajuste NASCE como tabela nova em rascunho, com a origem registrada",
    nova.estado === "rascunho" && nova.substitui_id === tabelaTipo && Number(nova.valor) === 480,
    `R$ 400 → R$ ${nova.valor}`,
  );

  await como(usuarios.admin, () => q(`SELECT aba_finance.comprometer_tabela_preco($1)`, [novaTabela]));
  const { rows: [antiga] } = await q(`SELECT estado, vigente_ate FROM aba_finance.tabelas_preco WHERE id=$1`, [tabelaTipo]);
  afirmar("comprometer a nova ENCERRA a anterior na véspera — sem sobreposição", antiga.estado === "encerrada" && !!antiga.vigente_ate);

  const { rows: [depoisDoReajuste] } = await q(
    `SELECT o.valor_liquido, i.valor_resolvido, i.tabela_preco_id
       FROM aba_finance.orcamentos o JOIN aba_finance.itens_orcamento i ON i.orcamento_id = o.id
      WHERE o.id = $1`, [orcamentoId]);
  afirmar(
    "o orçamento JÁ ACORDADO não mudou um centavo com o reajuste",
    Number(depoisDoReajuste.valor_liquido) === valorAcordado
      && Number(depoisDoReajuste.valor_resolvido) === 400
      && depoisDoReajuste.tabela_preco_id === tabelaTipo,
    `R$ ${depoisDoReajuste.valor_liquido}, ainda pela tabela que o resolveu`,
  );

  const novoPreco = await como(usuarios.owner, async () => {
    const { rows } = await q(`SELECT * FROM aba_finance.resolver_preco($1,$2,$3)`, [procConsulta, outroClienteId, profEspecialista]);
    return rows[0];
  });
  afirmar("e o PRÓXIMO orçamento já resolve pelo preço reajustado", Number(novoPreco.valor) === 480, `R$ ${novoPreco.valor}`);

  const recusaItemAprovado = await recusaComo(usuarios.admin, () =>
    q(`DELETE FROM aba_finance.itens_orcamento WHERE orcamento_id=$1`, [orcamentoId]));
  afirmar("item de orçamento aprovado não se apaga", recusaItemAprovado === "23514", recusaItemAprovado ?? "passou");

  // ==================================================================
  // 8. P-SUB: o que a recepção vê do plano é fronteira de aba_health
  // ==================================================================
  console.log("\n8) P-sub: dente e face só saem por quem tem alcance clínico — e ficam registrados");

  const logAntes = async () => {
    const { rows } = await q(
      `SELECT count(*)::int AS n FROM aba_health.log_acesso
        WHERE cliente_id=$1 AND tipo_registro='plano' AND contexto->>'via'='aba_finance.ler_orcamentos'`,
      [clienteId]);
    return rows[0].n;
  };

  const nAntesOwner = await logAntes();
  const comAlcance = await como(usuarios.owner, async () => {
    const { rows } = await q(`SELECT * FROM aba_finance.ler_orcamentos($1)`, [planoId]);
    return rows[0];
  });
  const nDepoisOwner = await logAntes();
  afirmar(
    "quem TEM alcance clínico recebe o orçamento com dente/face e a leitura fica REGISTRADA",
    comAlcance.com_detalhe_clinico === true && nDepoisOwner === nAntesOwner + 1,
    `${comAlcance.itens.length} item(ns), ${nDepoisOwner - nAntesOwner} linha de log`,
  );

  const nAntesAgent = await logAntes();
  const semAlcance = await como(usuarios.agent, async () => {
    const { rows } = await q(`SELECT * FROM aba_finance.ler_orcamentos($1)`, [planoId]);
    return rows[0];
  });
  const nDepoisAgent = await logAntes();
  afirmar(
    "quem NÃO tem alcance recebe o MESMO orçamento com os mesmos valores",
    !!semAlcance && Number(semAlcance.valor_liquido) === valorAcordado,
    `R$ ${semAlcance?.valor_liquido}`,
  );
  afirmar(
    "…mas sem dente e sem face, e SEM log — nada clínico foi lido, log a mais seria log mentindo",
    semAlcance.com_detalhe_clinico === false
      && semAlcance.itens.every((i) => i.dente === null && i.faces === null)
      && nDepoisAgent === nAntesAgent,
    `com_detalhe_clinico=${semAlcance.com_detalhe_clinico}, ${nDepoisAgent - nAntesAgent} log`,
  );

  const { rows: [assinatura] } = await q(
    `SELECT pg_get_function_identity_arguments('aba_finance.resolver_preco(uuid,uuid,uuid,date)'::regprocedure) AS args`);
  afirmar(
    "a assinatura de resolver_preco NÃO tem parâmetro de tabela de preço — não há por onde a tela escolher",
    !/tabela/i.test(assinatura.args),
    assinatura.args,
  );
} finally {
  // ------------------------------------------------------------------
  // Limpeza por identificador, nunca por "o mais recente".
  //
  // E ELA PRECISA DESLIGAR OS GATILHOS DE IMUTABILIDADE, o que é a
  // confirmação de que a trava faz o que promete: não existe caminho de
  // aplicação que apague uma tarifa comprometida, nem para o `owner`. Só
  // o DONO do banco, com `DISABLE TRIGGER`, e é exatamente assim que tem
  // de ser — a trava existe contra a aplicação, não contra o faxineiro.
  // Se um dia esta limpeza voltar a funcionar sem desligar nada, a
  // imutabilidade terá sido afrouxada em algum lugar.
  // ------------------------------------------------------------------
  await q("ROLLBACK").catch(() => {});
  await q("RESET ROLE").catch(() => {});
  try {
    for (const t of ["aba_finance.tarifas", "aba_finance.tabelas_preco",
                     "aba_finance.orcamentos", "aba_finance.itens_orcamento"]) {
      await q(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
    }
    if (orcamentoId) {
      await q(`DELETE FROM aba_finance.itens_orcamento WHERE orcamento_id=$1`, [orcamentoId]);
      await q(`DELETE FROM aba_finance.orcamentos WHERE id=$1`, [orcamentoId]);
    }
    await q(`DELETE FROM aba_finance.tarifas WHERE tabela_preco_id IN (SELECT id FROM aba_finance.tabelas_preco WHERE nome LIKE '%'||$1)`, [MARCA]);
    await q(`UPDATE aba_finance.tabelas_preco SET substitui_id=NULL WHERE nome LIKE '%'||$1`, [MARCA]);
    await q(`DELETE FROM aba_finance.tabelas_preco WHERE nome LIKE '%'||$1`, [MARCA]);
    for (const t of ["aba_finance.tarifas", "aba_finance.tabelas_preco",
                     "aba_finance.orcamentos", "aba_finance.itens_orcamento"]) {
      await q(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
    }
    if (contratoId) {
      await q(`ALTER TABLE aba_finance.contratos DISABLE TRIGGER USER`);
      await q(`DELETE FROM aba_finance.contratos WHERE id=$1`, [contratoId]);
      await q(`ALTER TABLE aba_finance.contratos ENABLE TRIGGER USER`);
    }
    if (planoId) {
      await q(`DELETE FROM aba_treatment.procedimentos_plano WHERE plano_id=$1`, [planoId]);
      await q(`DELETE FROM aba_treatment.opcoes WHERE plano_id=$1`, [planoId]);
      await q(`DELETE FROM aba_treatment.planos WHERE id=$1`, [planoId]);
    }
    for (const id of [profComum, profEspecialista]) {
      if (id) await q(`DELETE FROM aba_scheduling.profissionais WHERE id=$1`, [id]);
    }
    for (const id of funcionarios) {
      await q(`DELETE FROM aba_people.funcionarios WHERE id=$1`, [id]);
      await q(`DELETE FROM aba_people.pessoas WHERE id=$1`, [id]);
    }
    for (const id of [procConsulta, procLimpeza]) {
      if (id) await q(`DELETE FROM aba_catalog.procedimentos WHERE id=$1`, [id]);
    }
    if (categoriaId) await q(`DELETE FROM aba_catalog.categorias WHERE id=$1`, [categoriaId]);
    for (const id of [clienteId, outroClienteId]) {
      if (id) {
        await q(`DELETE FROM aba_health.log_acesso WHERE cliente_id=$1`, [id]);
        await q(`DELETE FROM aba_people.clientes WHERE id=$1`, [id]);
        await q(`DELETE FROM aba_people.pessoas WHERE id=$1`, [id]);
      }
    }
  } catch (e) {
    console.error(`\n  ! limpeza incompleta: ${e.message}`);
  }
  await cliente.end();
}

const ok = resultados.filter((r) => r.ok).length;
console.log(`\n${ok}/${resultados.length} verificações verdes\n`);
process.exit(ok === resultados.length ? 0 : 1);
