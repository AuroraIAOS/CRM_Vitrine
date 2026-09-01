#!/usr/bin/env node
/**
 * Coletor de referências visuais do benchmark odontológico
 * =======================================================
 * Captura material PÚBLICO dos concorrentes (home, página de preço, página de
 * recursos, ficha do ReclameAqui, ficha da loja de aplicativo) e, no mesmo
 * passe, extrai o texto da página para o log de coleta.
 *
 * Nunca faz login, nunca cria conta, nunca preenche formulário e nunca clica em
 * banner de consentimento — ver `00_PLANO_DE_ACAO.md` §4 e §8. O que estiver
 * atrás de cadastro é registrado como indisponível, não contornado.
 *
 * Formato: PNG, viewport 1680×1050 com densidade 2× = 3360×2100 px. É
 * deliberadamente o mesmo formato de `design/ux/versoes/capturar.mjs`, para que
 * a tela do concorrente possa ser aberta ao lado da nossa sem diferença de
 * escala atrapalhando o olho.
 *
 *   node design/benchmark/capturar.mjs            # tudo
 *   node design/benchmark/capturar.mjs simples    # só os alvos que casam com o filtro
 *
 * Os PNGs vão para `capturas/concorrentes/`; o texto extraído vai para fora do repositório
 * (pasta temporária impressa no fim), porque é matéria-prima de leitura, não
 * entrega.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../..");
const DESTINO = path.join(AQUI, "capturas", "concorrentes");
const TEXTOS = fs.mkdtempSync(path.join(os.tmpdir(), "bench-odonto-"));

const req = createRequire(path.join(RAIZ, "crm", "package.json"));
const puppeteer = (await import(pathToFileURL(req.resolve("puppeteer-core")))).default;

// Nesta máquina não há Chrome instalado, e o `msedge.exe` da raiz de
// Application/ é um lançador que sai imediatamente — o puppeteer perde o
// processo e falha com "Failed to launch the browser process: Code: 0". O
// binário real fica na pasta versionada, e é o que se procura aqui.
const RAIZES = [
  "C:\\Program Files\\Google\\Chrome\\Application",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application",
  "C:\\Program Files\\Microsoft\\Edge\\Application",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application",
];
function acharNavegador() {
  for (const raiz of RAIZES) {
    if (!fs.existsSync(raiz)) continue;
    const exe = raiz.includes("Chrome") ? "chrome.exe" : "msedge.exe";
    const versoes = fs
      .readdirSync(raiz, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d+\./.test(d.name))
      .map((d) => d.name)
      .sort()
      .reverse();
    for (const v of versoes) {
      const cheio = path.join(raiz, v, exe);
      if (fs.existsSync(cheio)) return cheio;
    }
    if (fs.existsSync(path.join(raiz, exe))) return path.join(raiz, exe);
  }
  return null;
}
const executablePath = acharNavegador();
if (!executablePath) {
  console.error("Nenhum Chrome/Edge encontrado nos caminhos padrão do Windows.");
  process.exit(1);
}

/* ─────────────────────── alvos ─────────────────────── */
// n  = ordem do concorrente na amostra (00_PLANO_DE_ACAO.md §3)
// tela = sufixo do arquivo; rolar = px a descer antes de capturar

const ALVOS = [
  // ── 1. Simples Dental
  { n: 1, slug: "simplesdental", tela: "home",    url: "https://www.simplesdental.com/" },
  { n: 1, slug: "simplesdental", tela: "precos",  url: "https://www.simplesdental.com/planos-e-precos", rolar: 700 },
  { n: 1, slug: "simplesdental", tela: "reclameaqui", url: "https://www.reclameaqui.com.br/empresa/simples-dental/" },
  // ── 2. Clinicorp
  { n: 2, slug: "clinicorp", tela: "home",   url: "https://www.clinicorp.com/" },
  { n: 2, slug: "clinicorp", tela: "precos", url: "https://www.clinicorp.com/planos", rolar: 600 },
  { n: 2, slug: "clinicorp", tela: "reclameaqui", url: "https://www.reclameaqui.com.br/empresa/clinicorp/" },
  // ── 3. Dental Office
  { n: 3, slug: "dentaloffice", tela: "home",    url: "https://www.dentaloffice.com.br/" },
  { n: 3, slug: "dentaloffice", tela: "precos",  url: "https://www.dentaloffice.com.br/planos/", rolar: 500 },
  { n: 3, slug: "dentaloffice", tela: "produto", url: "https://www.dentaloffice.com.br/dental-office/", rolar: 600 },
  { n: 3, slug: "dentaloffice", tela: "reclameaqui", url: "https://www.reclameaqui.com.br/empresa/dental-office/" },
  // ── 4. EasyDental
  { n: 4, slug: "easydental", tela: "home",     url: "https://easydental.com.br/" },
  { n: 4, slug: "easydental", tela: "precos",   url: "https://easydental.com.br/planos/", rolar: 500 },
  { n: 4, slug: "easydental", tela: "recursos", url: "https://easydental.com.br/recursos/", rolar: 500 },
  // ── 5. Santé Odonto
  { n: 5, slug: "sante", tela: "home",   url: "https://www.santesistemas.io/sante-odonto" },
  { n: 5, slug: "sante", tela: "precos", url: "https://www.santesistemas.io/planos", rolar: 600 },
  { n: 5, slug: "sante", tela: "produto", url: "https://www.santesistemas.io/", rolar: 800 },
  // ── 6. Dentrix Ascend (EUA)
  { n: 6, slug: "dentrixascend", tela: "home",     url: "https://www.dentrixascend.com/" },
  { n: 6, slug: "dentrixascend", tela: "recursos", url: "https://www.dentrixascend.com/features", rolar: 500 },
  // A Dentrix Ascend não publica preço: /pricing devolve 404. A ficha do
  // diretório é a fonte do valor relatado por terceiro — fica como evidência
  // de que o preço é de terceiro, nunca do fornecedor.
  { n: 6, slug: "dentrixascend", tela: "precos-terceiro", url: "https://www.softwareadvice.com/dental/dentrix-ascend-profile/", rolar: 400 },
  // ── 7. Curve Dental (EUA)
  { n: 7, slug: "curvedental", tela: "home",   url: "https://www.curvedental.com/" },
  { n: 7, slug: "curvedental", tela: "ia", url: "https://www.curvedental.com/ai", rolar: 500 },
  { n: 7, slug: "curvedental", tela: "precos", url: "https://www.curvedental.com/pricing/", rolar: 400 },
  // ── 8. Weave (EUA)
  { n: 8, slug: "weave", tela: "home",   url: "https://www.getweave.com/" },
  { n: 8, slug: "weave", tela: "precos", url: "https://www.getweave.com/pricing/", rolar: 500 },
  { n: 8, slug: "weave", tela: "produto", url: "https://www.getweave.com/dental/", rolar: 500 },
  // ── detalhe de plano que só existe em página interna
  { n: 5, slug: "sante", tela: "precos-odonto", url: "https://www.santesistemas.io/planos/sante-odonto", rolar: 600 },
  // ── eixo D: política de privacidade e termo de uso dos brasileiros
  { n: 1, slug: "simplesdental", tela: "termos", url: "https://www.simplesdental.com/termos", rolar: 400 },
  { n: 2, slug: "clinicorp", tela: "privacidade", url: "https://www.clinicorp.com/politica-de-privacidade", rolar: 400 },
  { n: 4, slug: "easydental", tela: "privacidade", url: "https://easydental.com.br/politica-de-privacidade/", rolar: 400 },
  // ── eixo D: as normas em si, em fonte oficial
  { n: 10, slug: "juridico", tela: "lei-13787", url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13787.htm" },
  { n: 10, slug: "juridico", tela: "sbis-certificacao", url: "https://sbis.org.br/certificacoes/certificacao-software/", rolar: 300 },
  { n: 10, slug: "juridico", tela: "cfo-codigo-etica", url: "https://website.cfo.org.br/wp-content/uploads/2018/03/codigo_etica.pdf" },
  // ── lojas de aplicativo (sinal 3 do ranking)
  { n: 9, slug: "lojas", tela: "play-dentaloffice", url: "https://play.google.com/store/apps/details?id=br.com.dentaloffice.dentists&hl=pt_BR" },
  { n: 9, slug: "lojas", tela: "appstore-simplesdental", url: "https://apps.apple.com/br/app/simples-dental-software-odonto/id954861717" },
];

const filtro = process.argv[2]?.toLowerCase();
const fila = filtro
  ? ALVOS.filter((a) => `${a.slug} ${a.tela} ${a.url}`.toLowerCase().includes(filtro))
  : ALVOS;

fs.mkdirSync(DESTINO, { recursive: true });

/* ─────────────────────── navegador ─────────────────────── */
// `puppeteer.launch()` falha nesta máquina com "Code: 0": o Edge do Windows não
// devolve o endereço do DevTools pelo stderr que o puppeteer lê, e o handshake
// morre. Medido: o mesmo binário, subido à mão com --remote-debugging-port,
// responde /json/version normalmente. Então subimos o processo aqui e usamos
// `connect()`, que só precisa da porta.
const PORTA_CDP = 9333;
const PERFIL = fs.mkdtempSync(path.join(os.tmpdir(), "bench-perfil-"));

const filho = spawn(
  executablePath,
  [
    "--headless=new",
    "--disable-gpu",
    `--remote-debugging-port=${PORTA_CDP}`,
    `--user-data-dir=${PERFIL}`,
    "--force-color-profile=srgb",
    "--font-render-hinting=none",
    "--hide-scrollbars",
    "--lang=pt-BR",
    "about:blank",
  ],
  { detached: true, stdio: "ignore" }
);

async function esperarCDP() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORTA_CDP}/json/version`);
      if (r.ok) return await r.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`navegador não abriu a porta ${PORTA_CDP} em 20 s`);
}
const versao = await esperarCDP();
console.log(`navegador: ${versao.Browser}\n`);

const browser = await puppeteer.connect({
  browserURL: `http://127.0.0.1:${PORTA_CDP}`,
  defaultViewport: null,
});
const pagina = await browser.newPage();
await pagina.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 2 });
await pagina.setExtraHTTPHeaders({ "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" });
// User-Agent de navegador real: várias das páginas devolvem 403 ao leitor automatizado.
await pagina.setUserAgent(
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
);

const feitas = [];
const falhas = [];

for (const alvo of fila) {
  const arquivo = `${String(alvo.n).padStart(2, "0")}_${alvo.slug}_${alvo.tela}.png`;
  try {
    const resp = await pagina.goto(alvo.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    const status = resp?.status() ?? 0;

    // sites de marketing têm rastreador que nunca deixa a rede ociosa: espera fixa
    await new Promise((r) => setTimeout(r, 2500));

    // desce até o fim e volta, para acordar imagem com carregamento preguiçoso
    await pagina.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((r) => setTimeout(r, 900));
    await pagina.evaluate((y) => window.scrollTo(0, y), alvo.rolar ?? 0);
    await new Promise((r) => setTimeout(r, 700));

    await pagina.screenshot({ path: path.join(DESTINO, arquivo), type: "png" });

    const texto = await pagina.evaluate(() => document.body.innerText.replace(/\n{3,}/g, "\n\n"));
    fs.writeFileSync(path.join(TEXTOS, `${alvo.slug}_${alvo.tela}.txt`), texto, "utf-8");

    feitas.push({ ...alvo, arquivo, status, chars: texto.length });
    console.log(`  ✓ ${arquivo.padEnd(38)} HTTP ${status}  ${texto.length} chars`);
  } catch (erro) {
    falhas.push({ ...alvo, erro: erro.message.split("\n")[0] });
    console.log(`  ✗ ${arquivo.padEnd(38)} ${erro.message.split("\n")[0]}`);
  }
}

await browser.disconnect();
try { process.kill(-filho.pid); } catch { try { filho.kill(); } catch {} }

console.log(`\n${feitas.length} capturas em ${DESTINO}`);
console.log(`texto extraído em ${TEXTOS}`);
if (falhas.length) {
  console.log(`\n${falhas.length} falha(s) — registrar como indisponível, não estimar:`);
  for (const f of falhas) console.log(`  ${f.slug}/${f.tela} — ${f.erro}`);
}

fs.writeFileSync(
  path.join(TEXTOS, "_resultado.json"),
  JSON.stringify({ feitas, falhas, coletadoEm: new Date().toISOString() }, null, 2),
  "utf-8"
);
