#!/usr/bin/env node
/**
 * Evidência de TELA da Subetapa 03.9 — o login em dois estágios e a troca de
 * clínica, no navegador, contra o SITE PÚBLICO já publicado.
 *
 * Ressalva 2 do parecer do portão: a evidência de banco provou as regras, e
 * esta prova o PERCURSO pela tela (`instrucoes.md` §5, 03.8.c):
 *
 *   · um login DESCARTÁVEL com duas clínicas (a própria, E, onde é owner, e a
 *     de demonstração, onde é agent) entra pelo formulário e cai no SELETOR,
 *     não no app;
 *   · escolhe a demonstração: vê os pacientes de lá e nenhum de E;
 *   · troca para E pelo cabeçalho: vê o paciente de E e nenhum da demonstração;
 *   · uma SEGUNDA sessão (outro "aparelho") entra de novo pelo seletor — a
 *     escolha é por sessão;
 *   · a DONA da demonstração, com uma clínica só, entra direto, sem seletor,
 *     e o cabeçalho mostra o nome da clínica.
 *
 * NAVEGADOR: Edge aberto pelo script e conectado pela porta (`instrucoes.md`
 * §5); espera por SELETOR, nunca por tempo fixo.
 *
 * USO:  cd crm && node scripts/evidencia_multiunidade_na_tela.mjs
 */
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "../..");
const DESTINO = path.join(RAIZ, "screenshots", "03.9");
mkdirSync(DESTINO, { recursive: true });

function lerEnv(arquivo) {
  const vars = {};
  for (const linha of readFileSync(arquivo, "utf-8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim().replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1");
  }
  return vars;
}
const env = lerEnv(path.join(RAIZ, ".env"));
const BASE = `https://${env.HOSTGATOR_VITRINE_DOMINIO}`;
const URL = env.SUPABASE__URL;
const REF = new globalThis.URL(URL).host.split(".")[0];
const opcoesCliente = { auth: { autoRefreshToken: false, persistSession: false } };
const servico = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, opcoesCliente);
const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const resultados = [];
function afirmar(nome, ok, detalhe = "") {
  resultados.push({ nome, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${nome}${detalhe ? `  — ${detalhe}` : ""}`);
}
function exigir(r, oque) {
  if (r.error) throw new Error(`${oque}: ${r.error.message}`);
  return r.data;
}

async function abrirEdge() {
  const { spawn } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const porta = 9400 + Math.floor(Math.random() * 400);
  const perfil = path.join(tmpdir(), `evidencia-0309-${Date.now()}`);
  spawn(EDGE, ["--headless", `--remote-debugging-port=${porta}`, `--user-data-dir=${perfil}`,
               "--no-first-run", "--no-default-browser-check", "--window-size=1440,960", "about:blank"],
        { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/json/version`);
      if (r.ok) return puppeteer.connect({ browserURL: `http://127.0.0.1:${porta}`, defaultViewport: { width: 1440, height: 960 } });
    } catch { /* subindo */ }
    await esperar(500);
  }
  throw new Error(`O Edge não abriu a porta ${porta}.`);
}

const textoDaPagina = (page) => page.evaluate(() => document.body.innerText.toLowerCase());

/** Espera o texto aparecer; se não aparecer, mostra o que a tela exibia (instrucoes.md §5, 03.8.b). */
async function esperarTexto(page, texto, nomeCaptura) {
  try {
    await page.waitForFunction((n) => document.body.innerText.toLowerCase().includes(n), { timeout: 30000 }, texto.toLowerCase());
  } catch {
    await page.screenshot({ path: path.join(DESTINO, `falha_${nomeCaptura}.png`) });
    const visto = await page.evaluate(() => document.body.innerText.slice(0, 900));
    throw new Error(`"${texto}" não apareceu em ${page.url()}. A tela mostrava: ${visto.replace(/\s+/g, " ")}`);
  }
}

const marca = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
const email = `tela-0309-${marca}@vitrinedemo.local`;
const senha = `Tela!${Math.random().toString(36).slice(2, 12)}Aa1`;
const criado = { userId: null, contaE: null, perfilDemo: null, funcionarioDemo: null };

const dona = exigir(await servico.from("profiles").select("user_id, account_id").eq("email", "proprietaria@vitrinedemo.local").single(), "dona");
const DEMO = dona.account_id;
const nomeDemo = exigir(await servico.from("accounts").select("name").eq("id", DEMO).single(), "conta demo").name;
// Controle, em duas medidas que não dependem da ordem da lista (as duas
// primeiras versões adivinharam a ordem e ficaram vermelhas sem defeito no
// produto — a tela mostrava só gente da demonstração):
//   · o CONTADOR "Todas · N" da tela tem de ser o número de pessoas daquela
//     clínica no banco — se uma pessoa de outra clínica vazasse, ele subiria;
//   · a pessoa da DONA, que a lista mostra no topo da equipe.
const perfilDona = exigir(await servico.from("profiles").select("id").eq("email", "proprietaria@vitrinedemo.local").single(), "perfil dona");
const pessoaDona = exigir(await servico.schema("aba_people").from("funcionarios").select("id").eq("profile_id", perfilDona.id).single(), "funcionário dona");
const nomeDona = exigir(await servico.schema("aba_people").from("pessoas").select("nome_exibicao").eq("id", pessoaDona.id).single(), "pessoa dona").nome_exibicao;
const pacientesDemo = [nomeDona];
async function contarPessoas(conta) {
  const { count, error } = await servico.schema("aba_people").from("pessoas").select("id", { count: "exact", head: true }).eq("account_id", conta);
  if (error) throw error;
  return count;
}
const contadorDaTela = (page) => page.evaluate(() => Number((document.body.innerText.match(/Todas\s*·\s*(\d+)/) || [])[1]));

async function limpar() {
  console.log("\nlimpeza (por identificador, só o que este script criou):");
  const passo = async (nome, f) => {
    const { error } = await f();
    console.log(error ? `  ✗ ${nome}: ${error.message}` : `  · ${nome}`);
  };
  // Funcionário ANTES do perfil: apagar o perfil anularia `profile_id` de um
  // funcionário ativo, e o CHECK `funcionarios_ativo_exige_login` recusa.
  if (criado.funcionarioDemo) {
    await passo("funcionário na demonstração", () => servico.schema("aba_people").from("funcionarios").delete().eq("id", criado.funcionarioDemo));
    await passo("pessoa do funcionário", () => servico.schema("aba_people").from("pessoas").delete().eq("id", criado.funcionarioDemo));
  }
  if (criado.perfilDemo) await passo("perfil na demonstração", () => servico.from("profiles").delete().eq("id", criado.perfilDemo));
  if (criado.contaE) await passo("clínica E (cascata)", () => servico.from("accounts").delete().eq("id", criado.contaE));
  if (criado.userId) {
    const { error } = await servico.auth.admin.deleteUser(criado.userId);
    console.log(error ? `  ✗ login descartável: ${error.message}` : "  · login descartável");
  }
}

let navegador;
try {
  console.log(`\n0) preparo pelo serviço — site: ${BASE}`);
  const u = exigir(await servico.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { full_name: "Evidência de tela 03.9" } }), "login");
  criado.userId = u.user.id;
  const perfilE = exigir(await servico.from("profiles").select("id, account_id").eq("user_id", criado.userId).single(), "perfil E");
  criado.contaE = perfilE.account_id;
  const nomeE = `Clínica E da evidência ${marca}`;
  exigir(await servico.from("accounts").update({ name: nomeE }).eq("id", criado.contaE), "nome E");
  const pacienteE = `Paciente exclusivo de E ${marca}`;
  const pE = exigir(await servico.schema("aba_people").from("pessoas").insert({ account_id: criado.contaE, nome_exibicao: pacienteE }).select("id").single(), "pessoa E");
  exigir(await servico.schema("aba_people").from("clientes").insert({ id: pE.id, account_id: criado.contaE, razao_social: pacienteE, status: "ativo" }), "cliente E");
  const pDemo = exigir(await servico.from("profiles").insert({ user_id: criado.userId, account_id: DEMO, account_role: "agent", full_name: "Evidência de tela 03.9", email }).select("id").single(), "perfil demo");
  criado.perfilDemo = pDemo.id;
  criado.funcionarioDemo = exigir(await servico.schema("aba_people").from("funcionarios").select("id").eq("profile_id", pDemo.id).single(), "funcionário demo").id;
  console.log(`  pacientes da demonstração usados como controle: ${pacientesDemo.join(", ")}`);

  navegador = await abrirEdge();

  console.log("\n1) login pelo formulário cai no seletor de clínica");
  const ctx1 = await navegador.createBrowserContext();
  const page = await ctx1.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#email");
  await page.type("#email", email);
  await page.type("#password", senha);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => document.body.innerText.includes("Em qual clínica você vai trabalhar?"), { timeout: 30000 });
  await page.screenshot({ path: path.join(DESTINO, "1_seletor.png") });
  let t = await textoDaPagina(page);
  afirmar("o seletor lista a clínica de demonstração", t.includes(nomeDemo.toLowerCase()));
  afirmar("o seletor lista a clínica própria", t.includes(nomeE.toLowerCase()));
  afirmar("o menu do app não aparece antes da escolha", !(await page.$('[aria-label="Trocar de clínica"]')));

  console.log("\n2) escolhe a demonstração: vê os pacientes de lá, nenhum de E");
  const [botaoDemo] = await page.$$("xpath/.//button[.//span[normalize-space(text())=" + JSON.stringify(nomeDemo) + "]]");
  await botaoDemo.click();
  await page.waitForSelector('[aria-label="Trocar de clínica"]', { timeout: 30000 });
  afirmar("o cabeçalho mostra a demonstração como clínica ativa",
    (await page.$eval('[aria-label="Trocar de clínica"]', (s) => s.options[s.selectedIndex].text)) === nomeDemo);
  await page.goto(`${BASE}/pessoas`, { waitUntil: "domcontentloaded" });
  await esperarTexto(page, pacientesDemo[0], "pessoas_demo");
  await page.screenshot({ path: path.join(DESTINO, "2_pessoas_demonstracao.png") });
  t = await textoDaPagina(page);
  afirmar("a dona da demonstração aparece na lista", t.includes(nomeDona.toLowerCase()));
  const nDemoBanco = await contarPessoas(DEMO);
  const nDemoTela = await contadorDaTela(page);
  afirmar("o contador da tela é exatamente o da demonstração no banco", nDemoTela === nDemoBanco, `tela ${nDemoTela} × banco ${nDemoBanco}`);
  afirmar("o paciente de E NÃO aparece", !t.includes(pacienteE.toLowerCase()));

  console.log("\n3) troca para E pelo cabeçalho: o contrário");
  await page.select('[aria-label="Trocar de clínica"]', criado.contaE);
  await page.waitForFunction((nome) => {
    const s = document.querySelector('[aria-label="Trocar de clínica"]');
    return s && s.options[s.selectedIndex]?.text === nome;
  }, { timeout: 30000 }, nomeE);
  afirmar("o cabeçalho passou para a clínica E", true);
  await page.goto(`${BASE}/pessoas`, { waitUntil: "domcontentloaded" });
  await esperarTexto(page, pacienteE, "pessoas_E");
  await page.screenshot({ path: path.join(DESTINO, "3_pessoas_clinica_E.png") });
  t = await textoDaPagina(page);
  afirmar("o paciente de E aparece", t.includes(pacienteE.toLowerCase()));
  afirmar("a dona da demonstração NÃO aparece", !t.includes(nomeDona.toLowerCase()));
  const nEBanco = await contarPessoas(criado.contaE);
  const nETela = await contadorDaTela(page);
  afirmar("o contador da tela é exatamente o de E no banco", nETela === nEBanco, `tela ${nETela} × banco ${nEBanco}`);

  console.log("\n4) outro aparelho: nova sessão, novo seletor");
  const ctx2 = await navegador.createBrowserContext();
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page2.waitForSelector("#email");
  await page2.type("#email", email);
  await page2.type("#password", senha);
  await page2.click('button[type="submit"]');
  await page2.waitForFunction(() => document.body.innerText.includes("Em qual clínica você vai trabalhar?"), { timeout: 30000 });
  afirmar("a segunda sessão pergunta de novo — a escolha é por sessão", true);
  await ctx2.close();

  console.log("\n5) quem tem uma clínica só entra direto");
  const { data: link } = await servico.auth.admin.generateLink({ type: "magiclink", email: "proprietaria@vitrinedemo.local" });
  const cli = createClient(URL, env.SUPABASE_ANON_KEY, opcoesCliente);
  const { data: s } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  const ctx3 = await navegador.createBrowserContext();
  const page3 = await ctx3.newPage();
  await page3.evaluateOnNewDocument((chave, valor) => localStorage.setItem(chave, valor), `sb-${REF}-auth-token`, JSON.stringify(s.session));
  await page3.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page3.waitForFunction((nome) => document.querySelector("header")?.innerText.includes(nome), { timeout: 30000 }, nomeDemo);
  await page3.screenshot({ path: path.join(DESTINO, "5_dona_entra_direto.png") });
  const t3 = await page3.evaluate(() => document.body.innerText);
  afirmar("a dona não vê seletor", !t3.includes("Em qual clínica você vai trabalhar?"));
  afirmar("a dona não vê o controle de troca (uma clínica só)", !(await page3.$('[aria-label="Trocar de clínica"]')));
  afirmar("o cabeçalho da dona mostra o nome da clínica", true);
  await cli.auth.signOut().catch(() => {});
  await ctx3.close();
} catch (e) {
  afirmar("execução sem exceção", false, e.message);
} finally {
  if (navegador) await navegador.close().catch(() => {});
  await limpar();
  const { data: sobra } = await servico.from("profiles").select("id").eq("email", email);
  afirmar("resíduo zero", (sobra ?? []).length === 0);
  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\n${resultados.length - falhas}/${resultados.length} verdes · capturas em ${DESTINO}`);
  process.exit(falhas ? 1 : 0);
}
