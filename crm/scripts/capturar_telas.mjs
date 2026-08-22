#!/usr/bin/env node
/**
 * Captura de tela de todas as rotas do CRM, em alta resolução
 * ===========================================================
 * Criado a pedido de Max (2026-08-22) para servir de base a análises
 * visuais futuras — estética, hierarquia, espaçamento, UX/UI.
 *
 * POR QUE UM SCRIPT E NÃO CAPTURA MANUAL: a automação de navegador
 * usada nas auditorias entrega JPEG de 1568×750 (~12 KB), suficiente
 * para verificar comportamento e insuficiente para julgar estética —
 * texto pequeno vira borrão e cor perde fidelidade. Aqui a captura sai
 * em **PNG sem perdas, com densidade 2×**, e é REPETÍVEL: quando a
 * interface mudar, roda de novo e o conjunto inteiro se atualiza.
 *
 * TEMA CLARO, por instrução de Max. O tema é preferência de CONTA
 * (`public.account_preferences`), e não do navegador — o script confere
 * o valor antes de capturar e avisa se estiver diferente de `light`,
 * em vez de gerar 17 imagens no tema errado sem ninguém notar.
 *
 * AUTENTICAÇÃO SEM SENHA: usa link de acesso gerado pela API de
 * administração. Nenhuma senha é digitada, nem existe no script.
 *
 * PRÉ-REQUISITO: o app servido em http://localhost:3000
 *   cd crm && npm run dev -- --port 3000 --strictPort
 * A porta 3000 não é escolha estética: é a Site URL padrão do projeto
 * Supabase, e portanto o único destino que o link de acesso aceita sem
 * alterar a configuração de Auth de produção só para tirar foto.
 *
 * USO: node scripts/capturar_telas.mjs
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "../..");
const DESTINO = path.join(RAIZ, "screenshots");
const BASE = "http://localhost:3000";

const NAVEGADORES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

function lerEnv(arquivo) {
  const vars = {};
  for (const linha of readFileSync(arquivo, "utf-8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim().replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1");
  }
  return vars;
}

const env = lerEnv(path.join(RAIZ, ".env"));
const EMAIL_DEMO = "proprietaria@vitrinedemo.local";

// Telas públicas (sem sessão) e telas internas. A ordem do prefixo é a
// ordem de leitura de quem for analisar depois, não a ordem do roteador.
const PUBLICAS = [
  { arquivo: "01_login", rota: "/login", titulo: "Login" },
];

function internas(clienteId, pessoaId) {
  return [
    { arquivo: "02_dashboard", rota: "/", titulo: "Dashboard" },
    { arquivo: "03_pessoas_lista", rota: "/pessoas", titulo: "Pessoas — lista" },
    { arquivo: "04_pessoas_ficha", rota: `/pessoas/${pessoaId}`, titulo: "Pessoas — ficha" },
    { arquivo: "05_agenda", rota: "/agenda", titulo: "Agenda" },
    { arquivo: "06_vendas", rota: "/vendas", titulo: "Vendas — funil" },
    { arquivo: "07_financeiro", rota: "/financeiro", titulo: "Financeiro" },
    { arquivo: "08_prontuario_lista", rota: "/prontuario", titulo: "Prontuário — lista" },
    { arquivo: "09_prontuario_ficha", rota: `/prontuario/${clienteId}`, titulo: "Prontuário — ficha" },
    { arquivo: "10_prontuario_mapas", rota: "/prontuario/mapas", titulo: "Prontuário — mapas clínicos" },
    { arquivo: "11_catalogo", rota: "/catalogo", titulo: "Catálogo" },
    { arquivo: "12_mensagens", rota: "/mensagens", titulo: "Mensagens" },
    { arquivo: "13_automacoes", rota: "/automacoes", titulo: "Automações" },
    { arquivo: "14_ia", rota: "/ia", titulo: "IA" },
    { arquivo: "15_configuracoes", rota: "/configuracoes", titulo: "Configurações" },
    { arquivo: "16_suporte", rota: "/suporte", titulo: "Suporte" },
  ];
}

const navegador = NAVEGADORES.find((p) => existsSync(p));
if (!navegador) {
  console.error("Nenhum navegador Chromium encontrado. Caminhos procurados:\n  " + NAVEGADORES.join("\n  "));
  process.exit(1);
}

const db = createClient(env.SUPABASE__URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- pré-checagens, antes de gastar 17 capturas -----------------------
const { data: perfil, error: erroPerfil } = await db
  .from("profiles").select("account_id").eq("email", EMAIL_DEMO).single();
if (erroPerfil) {
  console.error(`Conta de demonstração não encontrada (${EMAIL_DEMO}): ${erroPerfil.message}`);
  process.exit(1);
}

const { data: pref } = await db
  .from("account_preferences").select("theme").eq("account_id", perfil.account_id).maybeSingle();
if (pref && pref.theme !== "light") {
  console.error(
    `A conta de demonstração está no tema "${pref.theme}", e a captura foi pedida no tema CLARO.\n` +
    `Ajuste em Configurações > Aparência antes de rodar — senão saem 17 imagens no tema errado.`,
  );
  process.exit(1);
}

try {
  const r = await fetch(BASE, { method: "HEAD" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch {
  console.error(`O app não responde em ${BASE}.\n  cd crm && npm run dev -- --port 3000 --strictPort`);
  process.exit(1);
}

const { data: cliente } = await db.schema("aba_people").from("clientes")
  .select("id").eq("account_id", perfil.account_id).limit(1).single();
const { data: pessoa } = await db.schema("aba_people").from("pessoas")
  .select("id").eq("account_id", perfil.account_id).limit(1).single();

mkdirSync(DESTINO, { recursive: true });

// --- captura ----------------------------------------------------------
const browser = await puppeteer.launch({
  executablePath: navegador,
  headless: "new",
  args: ["--force-device-scale-factor=2", "--hide-scrollbars"],
  defaultViewport: { width: 1680, height: 1050, deviceScaleFactor: 2 },
});

const pagina = await browser.newPage();
pagina.setDefaultNavigationTimeout(60_000);

async function capturar({ arquivo, rota, titulo }) {
  await pagina.goto(`${BASE}${rota}`, { waitUntil: "networkidle2" });
  // Margem para animação de entrada e para consulta que chega depois do
  // primeiro render — sem isto, painéis aparecem vazios na imagem.
  await new Promise((r) => setTimeout(r, 2500));
  const destino = path.join(DESTINO, `${arquivo}.png`);
  await pagina.screenshot({ path: destino, type: "png" });
  const kb = Math.round(readFileSync(destino).length / 1024);
  console.log(`  ${arquivo.padEnd(24)} ${String(kb).padStart(5)} KB   ${titulo}`);
  return { arquivo: `${arquivo}.png`, rota, titulo, kb };
}

console.log(`\nnavegador: ${path.basename(navegador)}`);
console.log(`viewport : 1680×1050 @2× = 3360×2100 px, PNG sem perdas`);
console.log(`destino  : ${path.relative(RAIZ, DESTINO)}\n`);

const capturadas = [];

console.log("públicas (sem sessão):");
for (const tela of PUBLICAS) capturadas.push(await capturar(tela));

const { data: link, error: erroLink } = await db.auth.admin.generateLink({
  type: "magiclink",
  email: EMAIL_DEMO,
  options: { redirectTo: BASE },
});
if (erroLink) {
  console.error(`falha ao gerar link de acesso: ${erroLink.message}`);
  await browser.close();
  process.exit(1);
}
await pagina.goto(link.properties.action_link, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3000));

console.log("\ninternas (autenticado como a proprietária da demonstração):");
for (const tela of internas(cliente.id, pessoa.id)) capturadas.push(await capturar(tela));

await browser.close();

// Índice legível para quem for analisar as imagens depois.
const indice = [
  "# Capturas de tela — CRM Vitrine",
  "",
  `Geradas por \`crm/scripts/capturar_telas.mjs\` em ${new Date().toISOString().slice(0, 10)}.`,
  "PNG sem perdas, 3360×2100 px (1680×1050 @2×), tema claro, conta de demonstração.",
  "",
  "Para regerar: `cd crm && npm run dev -- --port 3000 --strictPort` e, noutro terminal,",
  "`node scripts/capturar_telas.mjs`.",
  "",
  "| Arquivo | Rota | Tela |",
  "|---|---|---|",
  ...capturadas.map((c) => `| \`${c.arquivo}\` | \`${c.rota}\` | ${c.titulo} |`),
  "",
].join("\n");
writeFileSync(path.join(DESTINO, "INDICE.md"), indice);

console.log(`\n${capturadas.length} tela(s) capturada(s) em ${path.relative(RAIZ, DESTINO)}/`);
console.log("índice escrito em screenshots/INDICE.md");
