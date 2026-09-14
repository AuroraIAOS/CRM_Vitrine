#!/usr/bin/env node
/**
 * Evidência do preço por grupo de pacientes (Subetapa 03.8.d).
 *
 *   node scripts/evidencia_preco_por_grupo.mjs
 *
 * ============================================================
 * O QUE ESTA EVIDÊNCIA PROVA
 * ============================================================
 * A escada ganhou um degrau na posição 2, e a ordem entre os degraus é
 * uma decisão de negócio de Max (D-F5) — não um detalhe de implementação.
 * Estas asserções são a ordem escrita como teste:
 *
 *   Paciente > Grupo > Tipo de profissional > Clínica > Rede > Prática
 *
 * As três que mais importam, e o motivo de cada uma:
 *
 *   1. **A cortesia individual vence o convênio.** É o gesto mais
 *      deliberado que a recepção faz — abrir exceção para uma pessoa — e
 *      o que menos pode se perder por acidente.
 *   2. **O convênio vence o tipo de profissional.** A apólice fecha
 *      tabela por procedimento; cobrar mais dela porque quem atendeu era
 *      especialista é glosa na certa.
 *   3. **Entre dois grupos, decide a PRIORIDADE.** Um paciente no
 *      convênio e na promoção do mês é situação comum, e sem prioridade o
 *      desempate cairia no "comprometida mais recente" — uma decisão
 *      silenciosa sobre dinheiro.
 *
 * ============================================================
 * SESSÃO SIMULADA POR `request.jwt.claims`
 * ============================================================
 * Mesma técnica de `evidencia_orcamento.mjs`, e pelo mesmo motivo: metade
 * das travas depende de QUEM está falando (`auth.uid()`,
 * `is_account_member`, a RLS inteira), e rodar como `postgres` provaria
 * apenas que o SQL compila. Sem gastar o endpoint de token, cujo limite de
 * taxa já produziu sintoma de "regressão de RLS aleatória"
 * (`instrucoes.md` §5).
 *
 * Roda no banco de TESTES, nunca no de produção.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
config({ path: path.join(RAIZ, ".env") });

const URL_TESTE = process.env.SUPABASE_TEST_DB_URL;
if (!URL_TESTE) {
  console.error("Falta SUPABASE_TEST_DB_URL no .env da raiz (Session pooler do projeto de TESTE).");
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
async function recusaComo(userId, fn) {
  try {
    await como(userId, fn);
    return null;
  } catch (e) {
    return e.code ?? "sem-codigo";
  }
}
/** Resolve o preço como o `owner`, e devolve `{valor, degrau, tabela}`. */
async function resolver(usuarios, procedimento, clienteId, profissionalId) {
  return como(usuarios.owner, async () => {
    const { rows } = await q(
      `SELECT valor, degrau, tabela_nome FROM aba_finance.resolver_preco($1,$2,$3)`,
      [procedimento, clienteId, profissionalId],
    );
    return rows[0] ?? {};
  });
}

const MARCA = "EVIDENCIA_03_8_D";
let contaId, conveniado, avulso, categoriaId, proc;
let tipoEspecialista, profEspecialista;
let grupoConvenio, grupoPromocao;
const tabelas = [];
const funcionarios = [];
const usuarios = {};

try {
  ({ rows: [{ id: contaId }] } = await q("SELECT id FROM public.accounts ORDER BY created_at LIMIT 1"));
  const { rows: us } = await q(
    `SELECT p.account_role AS papel, u.id FROM auth.users u
      JOIN public.profiles p ON p.user_id = u.id WHERE p.account_id = $1`, [contaId]);
  for (const u of us) usuarios[u.papel] = u.id;
  if (!usuarios.owner || !usuarios.admin || !usuarios.agent) {
    throw new Error("Faltam usuários de teste na conta. Rode scripts/seed_test_users.mjs.");
  }

  console.log("\n0) fixture — dois pacientes, um especialista, um procedimento de R$ 300 no catálogo");

  async function criarPaciente(nome) {
    const { rows: [p] } = await q(
      `INSERT INTO aba_people.pessoas (account_id, nome_exibicao) VALUES ($1,$2) RETURNING id`, [contaId, nome]);
    await q(`INSERT INTO aba_people.clientes (id, account_id, razao_social, status)
             VALUES ($1,$2,$3,'ativo')`, [p.id, contaId, nome]);
    return p.id;
  }
  conveniado = await criarPaciente(`Conveniado ${MARCA}`);
  avulso = await criarPaciente(`Avulso ${MARCA}`);

  ({ rows: [{ id: categoriaId }] } = await q(
    `INSERT INTO aba_catalog.categorias (account_id, nome) VALUES ($1,$2) RETURNING id`,
    [contaId, `Categoria ${MARCA}`]));
  ({ rows: [{ id: proc }] } = await q(
    `INSERT INTO aba_catalog.procedimentos (account_id, categoria_id, nome, preco_base)
     VALUES ($1,$2,$3,300) RETURNING id`, [contaId, categoriaId, `Consulta ${MARCA}`]));

  ({ rows: [{ id: tipoEspecialista }] } = await q(
    `SELECT id FROM aba_scheduling.tipos_profissional WHERE account_id=$1 AND chave='especialista'`, [contaId]));

  // Profissional inativo de propósito: a escada resolve pelo TIPO, que não
  // depende de o profissional estar em atividade, e criar login real só
  // para isto gastaria o endpoint de token (`instrucoes.md` §5).
  {
    const { rows: [pes] } = await q(
      `INSERT INTO aba_people.pessoas (account_id, nome_exibicao) VALUES ($1,$2) RETURNING id`,
      [contaId, `Dra. Especialista ${MARCA}`]);
    await q(`INSERT INTO aba_people.funcionarios (id, account_id, cargo, ativo)
             VALUES ($1,$2,'Dentista',FALSE)`, [pes.id, contaId]);
    funcionarios.push(pes.id);
    const { rows: [pr] } = await q(
      `INSERT INTO aba_scheduling.profissionais
         (account_id, nome_exibicao, tipo_profissional_id, funcionario_id, ativo, acesso_clinico)
       VALUES ($1,$2,$3,$4,FALSE,FALSE) RETURNING id`,
      [contaId, `Dra. Especialista ${MARCA}`, tipoEspecialista, pes.id]);
    profEspecialista = pr.id;
  }

  /**
   * Cria tabela de preço com uma tarifa e a compromete, como `admin`.
   * `discriminador` é o par coluna/valor do degrau — `null` nos degraus
   * que não têm (rede, prática), e é o CHECK do arco exclusivo que cobra
   * a coerência entre ele e o escopo.
   *
   * Comprometida ONTEM de propósito: encerrar tem piso no próprio início
   * (`instrucoes.md` §5), e o passo 3 precisa encerrar uma delas.
   */
  async function tabelaComprometida(nome, escopo, discriminador, valor) {
    const coluna = discriminador?.coluna ?? null;
    const id = await como(usuarios.admin, async () => {
      const sql = coluna
        ? `INSERT INTO aba_finance.tabelas_preco (account_id, nome, escopo, ${coluna})
           VALUES ($1,$2,$3,$4) RETURNING id`
        : `INSERT INTO aba_finance.tabelas_preco (account_id, nome, escopo)
           VALUES ($1,$2,$3) RETURNING id`;
      const params = coluna
        ? [contaId, nome, escopo, discriminador.valor]
        : [contaId, nome, escopo];
      const { rows: [t] } = await q(sql, params);
      await q(`INSERT INTO aba_finance.tarifas (account_id, tabela_preco_id, procedimento_id, valor)
               VALUES ($1,$2,$3,$4)`, [contaId, t.id, proc, valor]);
      await q(`SELECT aba_finance.comprometer_tabela_preco($1, CURRENT_DATE - 1)`, [t.id]);
      return t.id;
    });
    tabelas.push(id);
    return id;
  }

  console.log("\n1) o degrau novo: o grupo resolve o preço de quem está nele");

  grupoConvenio = await como(usuarios.admin, async () => {
    const { rows: [g] } = await q(
      `INSERT INTO aba_finance.grupos_preco (account_id, nome, prioridade)
       VALUES ($1,$2,10) RETURNING id`, [contaId, `Convênio Vida ${MARCA}`]);
    await q(`INSERT INTO aba_finance.clientes_grupo_preco (account_id, grupo_id, cliente_id)
             VALUES ($1,$2,$3)`, [contaId, g.id, conveniado]);
    return g.id;
  });

  const { rows: [carimbo] } = await q(
    `SELECT incluido_por FROM aba_finance.clientes_grupo_preco WHERE grupo_id=$1`, [grupoConvenio]);
  afirmar("incluir paciente no grupo carimba QUEM incluiu", carimbo.incluido_por === usuarios.admin);

  await tabelaComprometida(`Tabela do convênio ${MARCA}`, "grupo_paciente",
    { coluna: "grupo_preco_id", valor: grupoConvenio }, 120);
  await tabelaComprometida(`Preço padrão ${MARCA}`, "pratica", null, 250);

  const pConveniado = await resolver(usuarios, proc, conveniado, null);
  const pAvulso = await resolver(usuarios, proc, avulso, null);
  afirmar("paciente DO grupo resolve por ele (R$ 120, degrau grupo_paciente)",
    Number(pConveniado.valor) === 120 && pConveniado.degrau === "grupo_paciente",
    `${pConveniado.valor} / ${pConveniado.degrau}`);
  afirmar("paciente FORA do grupo não pega o preço dele (R$ 250, degrau pratica)",
    Number(pAvulso.valor) === 250 && pAvulso.degrau === "pratica",
    `${pAvulso.valor} / ${pAvulso.degrau}`);

  console.log("\n2) a ordem da escada, que é a decisão de negócio (D-F5)");

  await tabelaComprometida(`Tabela do especialista ${MARCA}`, "tipo_profissional",
    { coluna: "tipo_profissional_id", valor: tipoEspecialista }, 400);

  const comEspecialista = await resolver(usuarios, proc, conveniado, profEspecialista);
  afirmar("CONVÊNIO VENCE TIPO DE PROFISSIONAL — conveniado com especialista sai por R$ 120",
    Number(comEspecialista.valor) === 120 && comEspecialista.degrau === "grupo_paciente",
    `${comEspecialista.valor} / ${comEspecialista.degrau}`);

  const avulsoEspecialista = await resolver(usuarios, proc, avulso, profEspecialista);
  afirmar("…e quem não é do grupo continua pagando o do especialista (R$ 400)",
    Number(avulsoEspecialista.valor) === 400 && avulsoEspecialista.degrau === "tipo_profissional",
    `${avulsoEspecialista.valor} / ${avulsoEspecialista.degrau}`);

  await tabelaComprometida(`Cortesia pessoal ${MARCA}`, "paciente",
    { coluna: "cliente_id", valor: conveniado }, 80);

  const comCortesia = await resolver(usuarios, proc, conveniado, profEspecialista);
  afirmar("CORTESIA INDIVIDUAL VENCE O CONVÊNIO — o mesmo paciente sai por R$ 80",
    Number(comCortesia.valor) === 80 && comCortesia.degrau === "paciente",
    `${comCortesia.valor} / ${comCortesia.degrau}`);

  console.log("\n3) dois grupos ao mesmo tempo: decide a PRIORIDADE, não o acaso");

  // Tira a cortesia de cena para o degrau 2 voltar a decidir.
  await como(usuarios.admin, () =>
    q(`SELECT aba_finance.encerrar_tabela_preco(id) FROM aba_finance.tabelas_preco
        WHERE account_id=$1 AND nome = $2`, [contaId, `Cortesia pessoal ${MARCA}`]));

  grupoPromocao = await como(usuarios.admin, async () => {
    const { rows: [g] } = await q(
      `INSERT INTO aba_finance.grupos_preco (account_id, nome, prioridade)
       VALUES ($1,$2,5) RETURNING id`, [contaId, `Promoção do mês ${MARCA}`]);
    await q(`INSERT INTO aba_finance.clientes_grupo_preco (account_id, grupo_id, cliente_id)
             VALUES ($1,$2,$3)`, [contaId, g.id, conveniado]);
    return g.id;
  });
  await tabelaComprometida(`Tabela da promoção ${MARCA}`, "grupo_paciente",
    { coluna: "grupo_preco_id", valor: grupoPromocao }, 200);

  const doisGrupos = await resolver(usuarios, proc, conveniado, null);
  afirmar("o paciente está em DOIS grupos e vence o de menor prioridade (promoção, 5 < 10)",
    Number(doisGrupos.valor) === 200 && doisGrupos.degrau === "grupo_paciente",
    `R$ ${doisGrupos.valor} — e não os R$ 120 do convênio`);

  await como(usuarios.admin, () =>
    q(`UPDATE aba_finance.grupos_preco SET ativo = FALSE WHERE id=$1`, [grupoPromocao]));
  const promocaoDesligada = await resolver(usuarios, proc, conveniado, null);
  afirmar("desativar o grupo o tira da escada — volta ao convênio (R$ 120)",
    Number(promocaoDesligada.valor) === 120,
    `R$ ${promocaoDesligada.valor}`);

  console.log("\n4) o vocabulário: uma palavra, um dono");

  const { rows: [checks] } = await q(
    `SELECT
       (SELECT count(*) FROM pg_constraint
         WHERE conrelid='aba_finance.tabelas_preco'::regclass
           AND conname='tabelas_preco_escopo_valido'
           AND pg_get_constraintdef(oid) LIKE '%rede%'
           AND pg_get_constraintdef(oid) NOT LIKE '%''grupo''%')::int AS ok_escopo,
       (SELECT count(*) FROM aba_finance.tabelas_preco WHERE escopo='grupo')::int AS sobra`);
  afirmar("o escopo `grupo` virou `rede`, e `grupo` não é mais valor aceito",
    checks.ok_escopo === 1 && checks.sobra === 0);

  const redeOk = await como(usuarios.admin, async () => {
    const { rows: [t] } = await q(
      `INSERT INTO aba_finance.tabelas_preco (account_id, nome, escopo)
       VALUES ($1,$2,'rede') RETURNING id`, [contaId, `Rede ${MARCA}`]);
    tabelas.push(t.id);
    return t.id;
  });
  afirmar("o degrau da rede continua existindo com o nome novo", !!redeOk);

  console.log("\n5) as recusas do arco exclusivo");

  const semGrupo = await recusaComo(usuarios.admin, () =>
    q(`INSERT INTO aba_finance.tabelas_preco (account_id, nome, escopo)
       VALUES ($1,$2,'grupo_paciente')`, [contaId, `Sem grupo ${MARCA}`]));
  afirmar("tabela de grupo SEM grupo informado é recusada", semGrupo === "23514", semGrupo ?? "passou");

  const doisAlvos = await recusaComo(usuarios.admin, () =>
    q(`INSERT INTO aba_finance.tabelas_preco (account_id, nome, escopo, grupo_preco_id, cliente_id)
       VALUES ($1,$2,'grupo_paciente',$3,$4)`, [contaId, `Dois alvos ${MARCA}`, grupoConvenio, conveniado]));
  afirmar("tabela com DOIS discriminadores é recusada", doisAlvos === "23514", doisAlvos ?? "passou");

  const agentCriaGrupo = await recusaComo(usuarios.agent, () =>
    q(`INSERT INTO aba_finance.grupos_preco (account_id, nome) VALUES ($1,$2)`,
      [contaId, `Grupo pirata ${MARCA}`]));
  afirmar("agent NÃO cria grupo de preço — quem define preço é a recepção",
    agentCriaGrupo === "42501", agentCriaGrupo ?? "passou");

  const { rows: [pirata] } = await q(
    `SELECT count(*)::int AS n FROM aba_finance.grupos_preco WHERE nome=$1`, [`Grupo pirata ${MARCA}`]);
  afirmar("…e nada foi criado (recusa contada, não só o erro lido)", pirata.n === 0);

  const { rows: [fks] } = await q(`SELECT count(*)::int AS n FROM public.fks_sem_isolamento_de_conta()`);
  afirmar("a auditoria de isolamento continua devolvendo zero linhas", fks.n === 0);
} finally {
  await q("ROLLBACK").catch(() => {});
  await q("RESET ROLE").catch(() => {});
  try {
    // A imutabilidade da 048 não tem caminho pela aplicação, nem para o
    // dono — por isso a limpeza desliga os gatilhos. Se um dia isto passar
    // a funcionar sem desligar, a trava terá sido afrouxada.
    for (const t of ["aba_finance.tarifas", "aba_finance.tabelas_preco"]) {
      await q(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
    }
    if (tabelas.length) {
      await q(`DELETE FROM aba_finance.tarifas WHERE tabela_preco_id = ANY($1)`, [tabelas]);
      await q(`DELETE FROM aba_finance.tabelas_preco WHERE id = ANY($1)`, [tabelas]);
    }
    for (const t of ["aba_finance.tarifas", "aba_finance.tabelas_preco"]) {
      await q(`ALTER TABLE ${t} ENABLE TRIGGER USER`).catch(() => {});
    }
    await q(`DELETE FROM aba_finance.clientes_grupo_preco WHERE account_id=$1 AND grupo_id IN
               (SELECT id FROM aba_finance.grupos_preco WHERE nome LIKE '%'||$2)`, [contaId, MARCA]);
    await q(`DELETE FROM aba_finance.grupos_preco WHERE nome LIKE '%'||$1`, [MARCA]);
    if (profEspecialista) await q(`DELETE FROM aba_scheduling.profissionais WHERE id=$1`, [profEspecialista]);
    for (const id of funcionarios) {
      await q(`DELETE FROM aba_people.funcionarios WHERE id=$1`, [id]);
      await q(`DELETE FROM aba_people.pessoas WHERE id=$1`, [id]);
    }
    if (proc) await q(`DELETE FROM aba_catalog.procedimentos WHERE id=$1`, [proc]);
    if (categoriaId) await q(`DELETE FROM aba_catalog.categorias WHERE id=$1`, [categoriaId]);
    for (const id of [conveniado, avulso]) {
      if (!id) continue;
      await q(`DELETE FROM aba_people.clientes WHERE id=$1`, [id]);
      await q(`DELETE FROM aba_people.pessoas WHERE id=$1`, [id]);
    }
  } catch (e) {
    console.error(`\n  ! limpeza incompleta: ${e.message}`);
  }
  await cliente.end();
}

const ok = resultados.filter((r) => r.ok).length;
console.log(`\n${ok}/${resultados.length} verificações verdes\n`);
process.exit(ok === resultados.length ? 0 : 1);
