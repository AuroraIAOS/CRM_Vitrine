#!/usr/bin/env node
/**
 * Provisiona um banco Supabase a partir de `db/migrations/*.sql`
 * ==============================================================
 * Subetapa 02.15.
 *
 * POR QUE EXISTE: a suíte de RLS passou a rodar contra um projeto
 * Supabase separado do de produção, e esse projeto precisa ter o schema
 * inteiro. Aplicar 39 migrations à mão não é reprodutível — e o
 * repositório já precisava de uma forma de levantar o banco do zero:
 * é o mesmo gesto que uma clonagem de CRM-filho vai exigir.
 *
 * O QUE ELE PROVA DE BRINDE: que `db/migrations/` sozinho reconstrói o
 * banco. Se alguma migration só existia no projeto de produção — porque
 * foi aplicada ad hoc e nunca virou arquivo —, este script falha e
 * denuncia. É a checagem que a Subetapa 02.14 fez para o código
 * (arquivo no disco mas não no commit), agora para o schema.
 *
 * USO:
 *   node scripts/provisionar_banco.mjs                 # aplica tudo
 *   node scripts/provisionar_banco.mjs --de 035        # só de 035 em diante
 *   node scripts/provisionar_banco.mjs --conferir      # não aplica, só lista
 *
 * CONEXÃO: lida de `SUPABASE_TEST_DB_URL` no `.env` da raiz — a string
 * do **Session pooler** do projeto de teste (Settings > Database >
 * Connection string). O pooler é obrigatório, e não o host direto
 * `db.<ref>.supabase.co`: este resolve só para IPv6 sem o add-on pago de
 * IPv4, e falha com ENOTFOUND em rede sem IPv6 — armadilha já registrada
 * em `handoffs/instrucoes.md` §5.
 *
 * TRAVA DE SEGURANÇA: recusa rodar se a string apontar para o projeto de
 * produção. Este script executa DDL destrutiva (DROP/ALTER) por
 * definição; apontá-lo para produção por engano seria irreversível.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "../..");

function lerEnv(arquivo) {
  const vars = {};
  try {
    for (const linha of readFileSync(arquivo, "utf-8").split(/\r?\n/)) {
      const m = linha.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (m) vars[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
    }
  } catch {
    /* arquivo ausente é tratado adiante */
  }
  return vars;
}

const env = lerEnv(path.join(RAIZ, ".env"));
const conexao = env.SUPABASE_TEST_DB_URL;

if (!conexao) {
  console.error(`
SUPABASE_TEST_DB_URL ausente no .env da raiz.

No painel do projeto "CRM Vitrine — TESTES":
  Settings > Database > Connection string > **Session pooler**
  (o host termina em .pooler.supabase.com — NÃO use db.<ref>.supabase.co,
   que só responde em IPv6)

Cole no .env como:
  SUPABASE_TEST_DB_URL='postgresql://postgres.<ref>:<senha>@aws-...pooler.supabase.com:5432/postgres'
`);
  process.exit(1);
}

// Trava: nunca contra produção.
const refProducao = (env.SUPABASE__URL || "").match(/https:\/\/([a-z0-9]+)\./)?.[1];
if (refProducao && conexao.includes(refProducao)) {
  console.error(
    `RECUSADO: SUPABASE_TEST_DB_URL aponta para o projeto de PRODUÇÃO (${refProducao}).\n` +
      `Este script executa DDL destrutiva. Use a string do projeto de testes.`,
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const apenasConferir = args.includes("--conferir");
const de = args.includes("--de") ? args[args.indexOf("--de") + 1] : null;

const diretorio = path.join(RAIZ, "db", "migrations");
let arquivos = readdirSync(diretorio)
  .filter((f) => f.endsWith(".sql"))
  .sort(); // 001..039 — a ordem lexicográfica é a ordem de aplicação

if (de) arquivos = arquivos.filter((f) => f.slice(0, 3) >= de);

console.log(`\n${arquivos.length} migration(s) em ${path.relative(RAIZ, diretorio)}\n`);

if (apenasConferir) {
  for (const f of arquivos) console.log(`  ${f}`);
  process.exit(0);
}

const cliente = new pg.Client({
  connectionString: conexao,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 180_000,
});

await cliente.connect();
const { rows: quem } = await cliente.query("select current_database() as db, version() as v");
console.log(`conectado: ${quem[0].db} — ${quem[0].v.split(",")[0]}\n`);

let aplicadas = 0;
for (const arquivo of arquivos) {
  const sql = readFileSync(path.join(diretorio, arquivo), "utf-8");
  process.stdout.write(`  ${arquivo.padEnd(52)}`);
  try {
    // Cada migration numa transação própria: uma que falhe não deixa
    // metade aplicada, e o erro nomeia exatamente qual arquivo parou.
    await cliente.query("BEGIN");
    await cliente.query(sql);
    await cliente.query("COMMIT");
    aplicadas += 1;
    console.log("ok");
  } catch (e) {
    await cliente.query("ROLLBACK").catch(() => {});
    console.log("FALHOU");
    console.error(`\n${arquivo}: ${e.message}\n`);
    if (e.position) console.error(`posição ${e.position} no arquivo`);
    await cliente.end();
    process.exit(1);
  }
}

await cliente.end();
console.log(`\n${aplicadas} migration(s) aplicadas com sucesso.\n`);
