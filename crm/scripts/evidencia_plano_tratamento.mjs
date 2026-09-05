#!/usr/bin/env node
/**
 * Evidência da matriz do plano de tratamento (Subetapa 03.8).
 *
 *   node scripts/evidencia_plano_tratamento.mjs
 *
 * ============================================================
 * O QUE ESTA EVIDÊNCIA PROVA, E QUE A SUÍTE DE RLS NÃO PROVA
 * ============================================================
 * `tests/rls/19_aba_treatment.spec.ts` prova a fronteira, as travas e o
 * histórico — 25 casos, todos como usuário autenticado real. O que ele
 * não prova é o ELO DA CORRENTE: que o plano se monta **a partir do
 * odontograma**, que é a cláusula da Conclusão desta subetapa e a razão
 * de a 03.7.a ter vindo antes dela na corrente obrigatória.
 *
 * Aqui a ponte é percorrida inteira, com dado de verdade:
 *
 *   `aba_health.evolucoes.marcacoes`            (o que a 03.7.a grava)
 *        │  achados[].faces  → onde há doença   → diagnóstico
 *        │  faces            → onde vai haver trabalho → procedimento
 *        ▼
 *   `aba_treatment.diagnosticos` + `procedimentos_plano`
 *
 * E a asserção que mais importa é a que separa as duas listas: se o
 * plano nascer lendo a face do ACHADO, o orçamento da 03.8.a cobrará a
 * face onde há doença em vez da face onde haverá trabalho. Não daria
 * erro nenhum — geraria um plano coerente consigo mesmo e errado quanto
 * ao negócio (achado A2 da pesquisa `analise-ice`).
 *
 * ============================================================
 * RODA NO BANCO DE TESTES, NUNCA NO DE PRODUÇÃO
 * ============================================================
 * Mesma trava de `provisionar_banco.mjs`, e pelo mesmo motivo medido na
 * 02.15: enquanto a verificação rodar ao lado do dado real, todo portão
 * futuro ataca produção. A 03.7.a acrescentou a metade que faltava dessa
 * lição — resíduo de execução anterior faz a execução SEGUINTE escrever
 * no lugar errado —, e por isso este script cria tudo o que usa e apaga
 * exatamente o que criou, por identificador, nunca por "o mais recente".
 */
import { readFileSync } from "node:fs";
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
// A trava é por REF do projeto, e não por nome amigável: o nome muda no
// painel sem ninguém avisar, o ref não.
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

const MARCA = "EVIDENCIA_03_8";
let contaId, clienteId, categoriaId, planoId;

try {
  ({ rows: [{ id: contaId }] } = await q("SELECT id FROM public.accounts ORDER BY created_at LIMIT 1"));

  // ------------------------------------------------------------------
  // 1. O ODONTOGRAMA — exatamente a forma que a 03.7.a grava
  // ------------------------------------------------------------------
  console.log("\n1) o odontograma da 03.7.a, gravado em aba_health.evolucoes.marcacoes");

  ({ rows: [{ id: clienteId }] } = await q(
    "INSERT INTO aba_people.pessoas (account_id, nome_exibicao) VALUES ($1, $2) RETURNING id",
    [contaId, `Paciente ${MARCA}`],
  ));
  await q(
    "INSERT INTO aba_people.clientes (id, account_id, razao_social, status) VALUES ($1,$2,$3,'ativo')",
    [clienteId, contaId, `Paciente ${MARCA}`],
  );

  const { rows: [prof] } = await q(
    "INSERT INTO aba_scheduling.profissionais (account_id, nome_exibicao, ativo) VALUES ($1,$2,false) RETURNING id",
    [contaId, `Profissional ${MARCA}`],
  );

  // O envelope da 03.7.a: duas listas de face por dente, de propósito.
  const marcacoes = [
    {
      regiao: "16",
      rotulo: "Dente 16",
      estado: "proposto",
      nota: "cárie (oclusal) · restauração MOD",
      faces: ["mesial", "distal", "oclusal"],
      denticao: "erupcionado",
      achados: [{ faces: ["oclusal"], tipo: "carie" }],
      trabalhos: [{ id: "t1", faces: ["mesial", "distal", "oclusal"], estado: "proposto", descricao: "restauração MOD" }],
    },
  ];

  const { rows: [evolucao] } = await q(
    `INSERT INTO aba_health.evolucoes (account_id, cliente_id, profissional_id, avaliacao, mapa_tipo, marcacoes)
     VALUES ($1,$2,$3,$4,'odontograma',$5::jsonb) RETURNING id`,
    [contaId, clienteId, prof.id, `Sessão ${MARCA}`, JSON.stringify(marcacoes)],
  );

  const { rows: [lido] } = await q("SELECT marcacoes FROM aba_health.evolucoes WHERE id = $1", [evolucao.id]);
  const dente16 = lido.marcacoes.find((m) => m.regiao === "16");
  afirmar(
    "a face do TRABALHO e a face do ACHADO chegam como listas distintas",
    JSON.stringify(dente16.faces) === JSON.stringify(["mesial", "distal", "oclusal"]) &&
      JSON.stringify(dente16.achados[0].faces) === JSON.stringify(["oclusal"]),
    `trabalho=${JSON.stringify(dente16.faces)} achado=${JSON.stringify(dente16.achados[0].faces)}`,
  );

  // ------------------------------------------------------------------
  // 2. A PONTE — o plano nasce do odontograma
  // ------------------------------------------------------------------
  console.log("\n2) a ponte: o diagnóstico sai do ACHADO, o procedimento sai do TRABALHO");

  const { rows: [cat] } = await q(
    "INSERT INTO aba_catalog.categorias (account_id, nome) VALUES ($1,$2) RETURNING id",
    [contaId, `Categoria ${MARCA}`],
  );
  categoriaId = cat.id;

  const criarProc = async (nome, extra = {}) => {
    const colunas = ["account_id", "categoria_id", "nome", ...Object.keys(extra)];
    const valores = [contaId, categoriaId, nome, ...Object.values(extra)];
    const { rows } = await q(
      `INSERT INTO aba_catalog.procedimentos (${colunas.join(",")})
       VALUES (${valores.map((_, i) => `$${i + 1}`).join(",")}) RETURNING id`,
      valores,
    );
    return rows[0].id;
  };

  const procMOD = await criarProc(`Restauração MOD ${MARCA}`, {
    unidade_lancamento: "dente",
    aceita_faces: true,
    faces_minimo: 1,
    faces_maximo: 3,
    regiao_dentaria: "posterior",
  });
  const procCoroa = await criarProc(`Coroa total ${MARCA}`, {
    unidade_lancamento: "dente",
    regiao_dentaria: "posterior",
    exige_consentimento_tratamento: true,
  });
  const procTeto = await criarProc(`Selante com teto 2 ${MARCA}`, {
    unidade_lancamento: "dente",
    quantidade_maxima: 2,
  });

  ({ rows: [{ id: planoId }] } = await q(
    "INSERT INTO aba_treatment.planos (account_id, cliente_id, profissional_id, titulo) VALUES ($1,$2,$3,$4) RETURNING id",
    [contaId, clienteId, prof.id, `Plano ${MARCA}`],
  ));

  const { rows: opcoes } = await q(
    `INSERT INTO aba_treatment.opcoes (account_id, plano_id, rotulo, ordem)
     VALUES ($1,$2,'A',1), ($1,$2,'B',2) RETURNING id, rotulo`,
    [contaId, planoId],
  );
  const opcaoA = opcoes.find((o) => o.rotulo === "A").id;
  const opcaoB = opcoes.find((o) => o.rotulo === "B").id;

  const { rows: fases } = await q(
    "SELECT id, chave FROM aba_treatment.fases WHERE account_id = $1 ORDER BY ordem",
    [contaId],
  );
  const fase = (chave) => fases.find((f) => f.chave === chave).id;

  // O DIAGNÓSTICO SAI DO ACHADO — faces do achado, nunca as do trabalho.
  const { rows: [diag] } = await q(
    `INSERT INTO aba_treatment.diagnosticos (account_id, plano_id, dente, faces, descricao)
     VALUES ($1,$2,$3,$4::text[],$5) RETURNING id`,
    [contaId, planoId, dente16.regiao, dente16.achados[0].faces, "Cárie oclusal — do odontograma"],
  );

  // O PROCEDIMENTO SAI DO TRABALHO — faces do trabalho, nunca as do achado.
  const { rows: [linhaA] } = await q(
    `INSERT INTO aba_treatment.procedimentos_plano
       (account_id, plano_id, opcao_id, fase_id, procedimento_id, diagnostico_id, dente, faces)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::text[]) RETURNING id, faces`,
    [contaId, planoId, opcaoA, fase("definitiva"), procMOD, diag.id, dente16.regiao, dente16.faces],
  );

  // A alternativa concorrente, sob o MESMO diagnóstico e em outra fase.
  await q(
    `INSERT INTO aba_treatment.procedimentos_plano
       (account_id, plano_id, opcao_id, fase_id, procedimento_id, diagnostico_id, dente)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [contaId, planoId, opcaoB, fase("manutencao"), procCoroa, diag.id, dente16.regiao],
  );

  afirmar(
    "o procedimento do plano carrega a face do TRABALHO, não a do achado",
    JSON.stringify(linhaA.faces) === JSON.stringify(dente16.faces),
    JSON.stringify(linhaA.faces),
  );
  afirmar(
    "e o diagnóstico do plano carrega a face do ACHADO",
    JSON.stringify((await q("SELECT faces FROM aba_treatment.diagnosticos WHERE id=$1", [diag.id])).rows[0].faces) ===
      JSON.stringify(dente16.achados[0].faces),
  );

  // ------------------------------------------------------------------
  // 3. A MATRIZ COMPLETA, como consulta
  // ------------------------------------------------------------------
  console.log("\n3) a matriz: fase na linha, opção na coluna, diagnóstico atravessando");
  const { rows: matriz } = await q(
    `SELECT f.rotulo AS fase, o.rotulo AS opcao, d.descricao AS diagnostico,
            s.nome AS procedimento, pp.dente, pp.faces, pp.estado,
            pp.recusado_em IS NOT NULL AS recusado
       FROM aba_treatment.procedimentos_plano pp
       JOIN aba_treatment.fases f  ON f.id = pp.fase_id
       JOIN aba_treatment.opcoes o ON o.id = pp.opcao_id
       JOIN aba_catalog.procedimentos s ON s.id = pp.procedimento_id
       LEFT JOIN aba_treatment.diagnosticos d ON d.id = pp.diagnostico_id
      WHERE pp.plano_id = $1
      ORDER BY f.ordem, o.ordem`,
    [planoId],
  );
  for (const r of matriz) {
    console.log(
      `   ${String(r.fase).padEnd(18)} | opção ${r.opcao} | ${String(r.diagnostico).padEnd(30)} | ` +
        `${String(r.procedimento).slice(0, 28).padEnd(28)} | dente ${r.dente} | ` +
        `${(r.faces ?? []).join(",") || "—"} | ${r.estado}${r.recusado ? " (recusado)" : ""}`,
    );
  }
  afirmar(
    "duas opções concorrentes sob o MESMO diagnóstico, em fases diferentes",
    matriz.length === 2 &&
      new Set(matriz.map((r) => r.opcao)).size === 2 &&
      new Set(matriz.map((r) => r.fase)).size === 2 &&
      new Set(matriz.map((r) => r.diagnostico)).size === 1,
  );

  // A FILA DE TRABALHO é derivada: diagnóstico sem procedimento nenhum.
  const { rows: [{ id: diagSolto }] } = await q(
    `INSERT INTO aba_treatment.diagnosticos (account_id, plano_id, dente, descricao)
     VALUES ($1,$2,'26','Achado ainda não fasado') RETURNING id`,
    [contaId, planoId],
  );
  const { rows: fila } = await q(
    `SELECT d.id FROM aba_treatment.diagnosticos d
      WHERE d.plano_id = $1
        AND NOT EXISTS (SELECT 1 FROM aba_treatment.procedimentos_plano pp WHERE pp.diagnostico_id = d.id)`,
    [planoId],
  );
  afirmar(
    "a fila de trabalho é DERIVADA — diagnóstico sem procedimento, sem coluna própria",
    fila.length === 1 && fila[0].id === diagSolto,
  );

  // ------------------------------------------------------------------
  // 4. AS RECUSAS — a regra vive no banco
  // ------------------------------------------------------------------
  console.log("\n4) as recusas: forma do código, teto de quantidade e consentimento");

  const recusa = async (nome, sql, params, padrao) => {
    try {
      await q(sql, params);
      afirmar(nome, false, "NÃO recusou");
    } catch (e) {
      afirmar(nome, e.code === "23514" && padrao.test(e.message), `${e.code} — ${e.message.slice(0, 90)}`);
    }
  };

  await recusa(
    "recusa a quarta face num código de no máximo três",
    `INSERT INTO aba_treatment.procedimentos_plano (account_id, plano_id, opcao_id, fase_id, procedimento_id, dente, faces)
     VALUES ($1,$2,$3,$4,$5,'17',ARRAY['mesial','distal','oclusal','lingual'])`,
    [contaId, planoId, opcaoA, fase("definitiva"), procMOD],
    /no máximo 3 face/i,
  );

  await recusa(
    "recusa código de dente posterior lançado num incisivo",
    `INSERT INTO aba_treatment.procedimentos_plano (account_id, plano_id, opcao_id, fase_id, procedimento_id, dente)
     VALUES ($1,$2,$3,$4,$5,'11')`,
    [contaId, planoId, opcaoA, fase("definitiva"), procCoroa],
    /posterior/i,
  );

  for (const dente of ["14", "15"]) {
    await q(
      `INSERT INTO aba_treatment.procedimentos_plano (account_id, plano_id, opcao_id, fase_id, procedimento_id, dente)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [contaId, planoId, opcaoA, fase("definitiva"), procTeto, dente],
    );
  }
  await recusa(
    "recusa o terceiro lançamento de um código com teto 2 (quantidade_maxima da 03.6)",
    `INSERT INTO aba_treatment.procedimentos_plano (account_id, plano_id, opcao_id, fase_id, procedimento_id, dente)
     VALUES ($1,$2,$3,$4,$5,'24')`,
    [contaId, planoId, opcaoA, fase("definitiva"), procTeto],
    /no máximo 2 lançamento/i,
  );

  const { rows: [linhaB] } = await q(
    "SELECT id FROM aba_treatment.procedimentos_plano WHERE plano_id=$1 AND opcao_id=$2 AND procedimento_id=$3",
    [planoId, opcaoB, procCoroa],
  );
  await recusa(
    "recusa sair de `proposto` sem o termo que o código exige",
    "UPDATE aba_treatment.procedimentos_plano SET estado='planejado' WHERE id=$1",
    [linhaB.id],
    /exige termo de consentimento/i,
  );

  // ------------------------------------------------------------------
  // 5. RECUSA IMPLÍCITA — consentir A recusa B para o mesmo diagnóstico
  // ------------------------------------------------------------------
  console.log("\n5) a recusa implícita da opção concorrente");

  // CONSENTIR EXIGE SESSÃO — e esta evidência prova as duas metades.
  // Sem `auth.uid()` a operação recusa, porque recusa sem autor não
  // protege ninguém; com um sujeito na sessão, a atribuição chega ao
  // banco. `request.jwt.claims` é exatamente de onde `auth.uid()` lê.
  try {
    await q("SELECT aba_treatment.consentir_opcao($1)", [opcaoA]);
    afirmar("consentir SEM sessão autenticada é recusado", false, "não recusou");
  } catch (e) {
    afirmar("consentir SEM sessão autenticada é recusado", e.code === "42501", e.message.slice(0, 80));
  }

  const { rows: [algumUsuario] } = await q(
    "SELECT user_id FROM public.profiles WHERE account_id = $1 LIMIT 1", [contaId]);
  await q("BEGIN");
  await q("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: algumUsuario.user_id })]);
  await q("SELECT aba_treatment.consentir_opcao($1)", [opcaoA]);
  await q("COMMIT");

  const { rows: depois } = await q(
    `SELECT o.rotulo, pp.estado, pp.recusado_em IS NOT NULL AS recusado
       FROM aba_treatment.procedimentos_plano pp
       JOIN aba_treatment.opcoes o ON o.id = pp.opcao_id
      WHERE pp.plano_id = $1 AND pp.diagnostico_id = $2`,
    [planoId, diag.id],
  );
  const da = depois.find((r) => r.rotulo === "A");
  const db = depois.find((r) => r.rotulo === "B");
  afirmar("a opção consentida saiu de `proposto` para `planejado`", da.estado === "planejado", da.estado);
  afirmar("a concorrente do MESMO diagnóstico ficou registrada como recusada", db.recusado === true);

  const { rows: [atribuicao] } = await q(
    `SELECT pp.recusado_por, (SELECT o.consentida_por FROM aba_treatment.opcoes o WHERE o.id = $2) AS consentida_por
       FROM aba_treatment.procedimentos_plano pp
      WHERE pp.plano_id = $1 AND pp.recusado_em IS NOT NULL LIMIT 1`,
    [planoId, opcaoA],
  );
  afirmar(
    "a recusa e o consentimento chegam ATRIBUÍDOS — quem registrou fica no dado",
    atribuicao.recusado_por === algumUsuario.user_id && atribuicao.consentida_por === algumUsuario.user_id,
  );

  // ------------------------------------------------------------------
  // 6. PRIVILÉGIO DE COLUNA — medido no catálogo, não presumido
  // ------------------------------------------------------------------
  console.log("\n6) privilégio, medido no catálogo");
  const { rows: privs } = await q(
    `SELECT c.relname AS tabela,
            has_table_privilege('anon', c.oid, 'SELECT') AS anon_le,
            has_table_privilege('authenticated', c.oid, 'TRUNCATE') AS auth_truncate,
            c.relrowsecurity AS rls,
            (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::int AS policies
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'aba_treatment' AND c.relkind = 'r' ORDER BY 1`,
  );
  for (const p of privs) {
    console.log(
      `   ${p.tabela.padEnd(22)} rls=${p.rls} policies=${p.policies} anon_select=${p.anon_le} auth_truncate=${p.auth_truncate}`,
    );
  }
  afirmar("RLS ligada e com policy em todas as 5 tabelas", privs.length === 5 && privs.every((p) => p.rls && p.policies > 0));
  afirmar("`anon` não lê nenhuma tabela do schema", privs.every((p) => !p.anon_le));
  afirmar("ninguém recebeu TRUNCATE — ele não passa por RLS", privs.every((p) => !p.auth_truncate));

  const { rows: funcs } = await q(
    `SELECT p.proname,
            has_function_privilege('public', p.oid, 'EXECUTE') AS pub,
            has_function_privilege('anon', p.oid, 'EXECUTE') AS anon
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'aba_treatment' ORDER BY 1`,
  );
  afirmar(
    "nenhuma função do schema é executável por PUBLIC ou anon",
    funcs.every((f) => !f.pub && !f.anon),
    funcs.map((f) => f.proname).join(", "),
  );

  // ---- a metade que a migration 047 acrescentou: leitura registrada ----
  const { rows: colunas } = await q(
    `SELECT x.tab, x.col, has_column_privilege('authenticated', ('aba_treatment.'||x.tab)::regclass, x.col, 'SELECT') AS le
       FROM (VALUES ('planos','titulo'),('planos','observacao'),
                    ('diagnosticos','dente'),('diagnosticos','faces'),('diagnosticos','descricao'),
                    ('procedimentos_plano','dente'),('procedimentos_plano','faces'),
                    ('procedimentos_plano','observacao'),
                    ('procedimentos_plano','id'),('procedimentos_plano','estado')
            ) AS x(tab,col)`,
  );
  const clinicas = colunas.filter((c) => !["id", "estado"].includes(c.col));
  const metadado = colunas.filter((c) => ["id", "estado"].includes(c.col));
  afirmar(
    "dente, face e texto livre estão REVOGADOS de authenticated — só saem pela função que registra",
    clinicas.every((c) => !c.le),
    clinicas.filter((c) => c.le).map((c) => `${c.tab}.${c.col}`).join(", ") || "nenhuma vazando",
  );
  afirmar("e o metadado continua legível — a revogação não passou do ponto", metadado.every((c) => c.le));

  const { rows: [{ n: logsAntes }] } = await q(
    "SELECT count(*)::int n FROM aba_health.log_acesso WHERE cliente_id=$1 AND tipo_registro='plano' AND acao='leitura'",
    [clienteId],
  );
  await q("BEGIN");
  await q("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: algumUsuario.user_id })]);
  const { rows: lidos } = await q("SELECT * FROM aba_treatment.ler_planos($1)", [clienteId]);
  await q("COMMIT");
  const { rows: [{ n: logsDepois }] } = await q(
    "SELECT count(*)::int n FROM aba_health.log_acesso WHERE cliente_id=$1 AND tipo_registro='plano' AND acao='leitura'",
    [clienteId],
  );
  afirmar(
    "ler_planos() devolve a matriz inteira numa linha por plano",
    lidos.length === 1 && lidos[0].opcoes.length === 2 && lidos[0].procedimentos.length > 0,
    `${lidos.length} plano(s), ${lidos[0]?.opcoes?.length ?? 0} opções, ${lidos[0]?.procedimentos?.length ?? 0} células`,
  );
  afirmar(
    "e a leitura DEIXA RASTRO em aba_health.log_acesso — uma linha por plano lido",
    logsDepois === logsAntes + 1,
    `${logsAntes} → ${logsDepois}`,
  );
  afirmar(
    "a fila de trabalho vem calculada na própria leitura (diagnóstico sem procedimento)",
    lidos[0].diagnosticos.some((d) => d.fasado === false),
  );

  const { rows: [{ n: fksAbertas }] } = await q(
    `SELECT count(*)::int n FROM public.fks_sem_isolamento_de_conta()
      WHERE filho LIKE 'aba_treatment.%' OR pai LIKE 'aba_treatment.%'`,
  );
  afirmar("a auditoria da 039 enxerga aba_treatment e não acha FK desprotegida", fksAbertas === 0);
} finally {
  // ---- limpeza por identificador, nunca por "o mais recente" ----
  if (planoId) {
    await q("DELETE FROM aba_treatment.procedimentos_plano WHERE plano_id=$1", [planoId]);
    await q("DELETE FROM aba_treatment.diagnosticos WHERE plano_id=$1", [planoId]);
    await q("DELETE FROM aba_treatment.opcoes WHERE plano_id=$1", [planoId]);
    await q("DELETE FROM aba_treatment.planos WHERE id=$1", [planoId]);
  }
  if (clienteId) {
    await q("DELETE FROM aba_health.evolucoes WHERE cliente_id=$1", [clienteId]);
    await q("DELETE FROM aba_health.log_acesso WHERE cliente_id=$1", [clienteId]);
  }
  if (categoriaId) {
    await q("DELETE FROM aba_catalog.procedimentos WHERE categoria_id=$1", [categoriaId]);
    await q("DELETE FROM aba_catalog.categorias WHERE id=$1", [categoriaId]);
  }
  if (clienteId) {
    await q("DELETE FROM aba_people.clientes WHERE id=$1", [clienteId]);
    await q("DELETE FROM aba_people.pessoas WHERE id=$1", [clienteId]);
  }
  await q("DELETE FROM aba_scheduling.profissionais WHERE nome_exibicao LIKE $1", [`%${MARCA}%`]);
  await cliente.end();
}

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} verdes.`);
if (falhas.length) {
  console.log("falhas: " + falhas.map((f) => f.nome).join("; "));
  process.exit(1);
}
