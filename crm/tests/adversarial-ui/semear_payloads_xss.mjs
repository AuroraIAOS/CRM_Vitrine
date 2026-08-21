#!/usr/bin/env node
/**
 * Semeia payloads de XSS armazenado no banco de TESTE — Subetapa 02.15
 * ====================================================================
 *
 * POR QUE ISTO EXISTE. O banco guardar o payload literal é CORRETO: ele
 * é um repositório de dados, não de HTML, e escapar na gravação
 * corromperia o dado (um cliente pode legitimamente se chamar
 * `O'Brien <Consultoria>`). A defesa contra XSS armazenado pertence à
 * camada de RENDERIZAÇÃO — e por isso ela só pode ser provada abrindo
 * as telas de verdade, nunca consultando o banco.
 *
 * É item obrigatório do portão adversarial da Etapa 02
 * (`docs/00_PLANO_E_CRITERIOS.md`, Subetapa 02.15).
 *
 * NENHUM PAYLOAD USA `alert()`, `confirm()` OU `prompt()`. Não é
 * delicadeza: um diálogo modal do navegador BLOQUEIA a automação do
 * Chrome e derruba a sessão de auditoria inteira. Os payloads aqui
 * marcam `window.__XSS_EXECUTOU` e escrevem no console — detectáveis
 * por leitura, sem travar nada.
 *
 * SÓ RODA CONTRA O PROJETO DE TESTE. A trava é a mesma de
 * `crm/tests/rls/ambiente.ts`: se a URL de teste faltar ou coincidir
 * com a de produção, o script para. Semear XSS em produção seria
 * transformar uma auditoria em incidente.
 *
 * USO:
 *   node tests/adversarial-ui/semear_payloads_xss.mjs           # semeia
 *   node tests/adversarial-ui/semear_payloads_xss.mjs --limpar  # remove
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "../../..");

function lerEnv(arquivo) {
  const vars = {};
  for (const linha of readFileSync(arquivo, "utf-8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim().replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1");
  }
  return vars;
}

const env = lerEnv(path.join(RAIZ, ".env"));
const url = env.SUPABASE_TEST__URL;
const chave = env.SUPABASE_TEST_SERVICE_ROLE_KEY;

if (!url || !chave) {
  console.error("SUPABASE_TEST__URL / SUPABASE_TEST_SERVICE_ROLE_KEY ausentes no .env da raiz.");
  process.exit(1);
}
if (env.SUPABASE__URL && url === env.SUPABASE__URL) {
  console.error("RECUSADO: a URL de teste é a de produção. Semear XSS lá seria um incidente, não uma auditoria.");
  process.exit(1);
}

const db = createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } });

// Marcador único: permite achar e remover tudo depois, e permite ao
// auditor distinguir "o payload apareceu como TEXTO na tela" (correto)
// de "o payload sumiu da tela" (suspeito — pode ter virado elemento).
const MARCA = "XSS0215";

const PAYLOADS = {
  // Executa via atributo de evento, sem <script> — passa por filtros
  // ingênuos que só procuram a tag script.
  img: `<img src=x onerror="window.__XSS_EXECUTOU=(window.__XSS_EXECUTOU||0)+1;console.log('${MARCA}_IMG')">`,
  // O caso clássico. React escapa por padrão; só quebra com
  // dangerouslySetInnerHTML ou innerHTML manual.
  script: `<script>window.__XSS_EXECUTOU=(window.__XSS_EXECUTOU||0)+1;console.log('${MARCA}_SCRIPT')</script>`,
  // Sink de URL: vira execução se o valor cair num href/src sem validação
  // de esquema — o par href/src de AnexosTab é o único candidato do app.
  url: `javascript:window.__XSS_EXECUTOU=(window.__XSS_EXECUTOU||0)+1;console.log('${MARCA}_URL')`,
  // Quebra de atributo: fecha a aspa e injeta um handler no elemento host.
  atributo: `" onmouseover="window.__XSS_EXECUTOU=(window.__XSS_EXECUTOU||0)+1;console.log('${MARCA}_ATTR')" x="`,
  // SVG tem vetor próprio de execução ao carregar.
  svg: `<svg onload="window.__XSS_EXECUTOU=(window.__XSS_EXECUTOU||0)+1;console.log('${MARCA}_SVG')">`,
};

async function contaDeTeste() {
  const { data, error } = await db
    .from("profiles")
    .select("account_id, email")
    .eq("email", env.TEST_OWNER_EMAIL ?? "rls.owner@crmvitrine.local")
    .single();
  if (error) throw new Error(`conta de teste não encontrada: ${error.message}`);
  return data.account_id;
}

async function semear() {
  const conta = await contaDeTeste();
  console.log(`conta de teste: ${conta}\n`);
  const feitos = [];

  const registrar = (onde, r) => {
    if (r.error) console.log(`  ${onde.padEnd(46)} FALHOU: ${r.error.message.slice(0, 60)}`);
    else { console.log(`  ${onde.padEnd(46)} ok`); feitos.push(onde); }
  };

  // Pessoas — nome aparece na lista, na ficha, no cabeçalho e em toda
  // tela que cite a pessoa (agenda, vendas, financeiro, prontuário).
  const pessoa = await db.schema("aba_people").from("pessoas").insert({
    account_id: conta,
    nome_exibicao: `${MARCA} ${PAYLOADS.img}`,
    email: `xss-${MARCA}@crmvitrine.local`,
  }).select("id").single();
  registrar("aba_people.pessoas.nome_exibicao (img)", pessoa);

  const pessoa2 = await db.schema("aba_people").from("pessoas").insert({
    account_id: conta,
    nome_exibicao: `${MARCA} ${PAYLOADS.script}`,
    email: `xss2-${MARCA}@crmvitrine.local`,
  }).select("id").single();
  registrar("aba_people.pessoas.nome_exibicao (script)", pessoa2);

  if (pessoa.data) {
    registrar("aba_people.pessoa_notas.conteudo (svg)", await db.schema("aba_people").from("pessoa_notas").insert({
      account_id: conta, pessoa_id: pessoa.data.id, conteudo: `${MARCA} ${PAYLOADS.svg}`,
    }));
  }

  registrar("aba_people.tags.nome (atributo)", await db.schema("aba_people").from("tags").insert({
    account_id: conta, nome: `${MARCA} ${PAYLOADS.atributo}`, cor: "#ff0000",
  }));

  // `servicos.categoria_id` é NOT NULL — a categoria vem primeiro, e ela
  // mesma carrega payload, porque aparece como agrupador na tela `1i`.
  const categoria = await db.schema("aba_catalog").from("categorias").insert({
    account_id: conta, nome: `${MARCA} ${PAYLOADS.atributo}`,
  }).select("id").single();
  registrar("aba_catalog.categorias.nome (atributo)", categoria);

  if (categoria.data) {
    registrar("aba_catalog.servicos.nome (img)", await db.schema("aba_catalog").from("servicos").insert({
      account_id: conta, categoria_id: categoria.data.id, nome: `${MARCA} ${PAYLOADS.img}`,
      descricao: `${MARCA} ${PAYLOADS.script}`, duracao_padrao_minutos: 30, preco_base: 10,
    }));
  }

  registrar("aba_automations.automacoes.nome (svg)", await db.schema("aba_automations").from("automacoes").insert({
    account_id: conta, nome: `${MARCA} ${PAYLOADS.svg}`,
    descricao: `${MARCA} ${PAYLOADS.img}`, tipo_gatilho: "manual", ativo: false,
  }));

  registrar("aba_ai.ia_documentos_conhecimento.titulo (img)", await db.schema("aba_ai").from("ia_documentos_conhecimento").insert({
    account_id: conta, titulo: `${MARCA} ${PAYLOADS.img}`, conteudo: `${MARCA} ${PAYLOADS.script}`,
  }));

  console.log(`\n${feitos.length} payload(s) semeado(s). Marca: ${MARCA}`);
  console.log("Agora abra as telas e confira window.__XSS_EXECUTOU — tem que ser undefined.");
}

async function limpar() {
  const conta = await contaDeTeste();
  const alvos = [
    ["aba_ai", "ia_documentos_conhecimento", "titulo"],
    ["aba_automations", "automacoes", "nome"],
    ["aba_catalog", "servicos", "nome"],
    ["aba_catalog", "categorias", "nome"],
    ["aba_people", "tags", "nome"],
    ["aba_people", "pessoas", "nome_exibicao"],
  ];
  for (const [schema, tabela, coluna] of alvos) {
    const { error } = await db.schema(schema).from(tabela).delete()
      .eq("account_id", conta).like(coluna, `${MARCA}%`);
    console.log(`  ${schema}.${tabela}`.padEnd(46), error ? `FALHOU: ${error.message.slice(0, 50)}` : "limpo");
  }
}

if (process.argv.includes("--limpar")) await limpar();
else await semear();
