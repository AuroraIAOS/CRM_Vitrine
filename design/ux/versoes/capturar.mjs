#!/usr/bin/env node
/**
 * Captura das três versões de UX/UI em alta resolução
 * ===================================================
 * Gera `telas/vNN_N_<tela>.png` para as três versões, nas mesmas seis telas,
 * para que a comparação seja de DESENHO e não de conteúdo — os dados são
 * idênticos nos três casos (`dados.js`).
 *
 * Formato: PNG sem perdas, viewport 1680×1050 com densidade 2× = 3360×2100 px.
 * É deliberadamente o mesmo formato de `crm/scripts/capturar_telas.mjs`, para
 * que estas capturas possam ser abertas lado a lado com `screenshots/` (o
 * produto como está hoje) sem diferença de escala atrapalhando o olho.
 *
 * O script sobe o próprio servidor estático (os módulos ES não carregam de
 * `file://` por CORS) e o derruba no fim. Não depende de nada rodando antes.
 *
 * USO:  node design/ux/versoes/capturar.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../../..");
const DESTINO = path.join(AQUI, "telas");
const PORTA = 4180;

// puppeteer-core vive em crm/node_modules; este script mora em design/.
const req = createRequire(path.join(RAIZ, "crm", "package.json"));
const puppeteer = (await import(pathToFileURL(req.resolve("puppeteer-core")))).default;

const NAVEGADORES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

const VERSOES = [
  { v: "01", nome: "padrao" },
  { v: "02", nome: "avancado" },
  { v: "03", nome: "recomendado" },
];

const TELAS = [
  { id: "inicio",    n: 1, rotulo: "Início / painel" },
  { id: "pessoas",   n: 2, rotulo: "Pessoas — lista" },
  { id: "ficha",     n: 3, rotulo: "Ficha da pessoa" },
  { id: "agenda",    n: 4, rotulo: "Agenda semanal" },
  { id: "funil",     n: 5, rotulo: "Funil comercial" },
  { id: "mensagens", n: 6, rotulo: "Mensagens" },
];

/** Telas exclusivas de uma versão, que mostram a assinatura dela. */
const EXTRAS = [
  { v: "02", id: "pessoas", extra: "paleta", n: 7, rotulo: "Paleta de comandos (⌘K)" },
];

/* ─────────────────────── servidor estático ─────────────────────── */
const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
                ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8" };

const servidor = http.createServer((rq, rs) => {
  const rel = decodeURIComponent(new URL(rq.url, "http://x").pathname);
  const arq = path.join(AQUI, rel === "/" ? "/index.html" : rel);
  if (!arq.startsWith(AQUI)) { rs.writeHead(403); return rs.end("403"); }
  fs.readFile(arq, (e, d) => {
    if (e) { rs.writeHead(404); return rs.end("404"); }
    rs.writeHead(200, { "Content-Type": TIPOS[path.extname(arq)] ?? "application/octet-stream" });
    rs.end(d);
  });
});
await new Promise((ok) => servidor.listen(PORTA, ok));

/* ─────────────────────── captura ─────────────────────── */
const navegador = NAVEGADORES.find((p) => fs.existsSync(p));
if (!navegador) {
  console.error("Nenhum Chrome ou Edge encontrado nos caminhos conhecidos.");
  process.exit(1);
}
fs.mkdirSync(DESTINO, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: navegador,
  headless: "new",
  args: ["--force-color-profile=srgb", "--font-render-hinting=none", "--hide-scrollbars"],
  defaultViewport: { width: 1680, height: 1050, deviceScaleFactor: 2 },
});

const pagina = await browser.newPage();
await pagina.goto(`http://localhost:${PORTA}/index.html?capturar=1`, { waitUntil: "networkidle0" });
await pagina.evaluate(() => document.fonts.ready);

const feitas = [];

async function capturar({ v, nome, tela, extra, n, rotulo }) {
  await pagina.evaluate((v, tela, extra) => window.pintarPara(v, tela, extra), v, tela, extra ?? null);
  await pagina.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 220));      // deixa o layout assentar
  const arquivo = `v${v}_${n}_${extra ?? tela}.png`;
  await pagina.screenshot({ path: path.join(DESTINO, arquivo), type: "png" });
  feitas.push({ arquivo, v, nome, tela: extra ?? tela, rotulo });
  console.log(`  ✓ ${arquivo.padEnd(28)} ${rotulo}`);
}

for (const { v, nome } of VERSOES) {
  console.log(`\nVersão ${v} — ${nome}`);
  for (const t of TELAS) await capturar({ v, nome, tela: t.id, n: t.n, rotulo: t.rotulo });
  for (const x of EXTRAS.filter((e) => e.v === v))
    await capturar({ v, nome, tela: x.id, extra: x.extra, n: x.n, rotulo: x.rotulo });
}

await browser.close();
servidor.close();

/* ─────────────────────── índice ─────────────────────── */
const linhas = feitas.map((f) =>
  `| \`${f.arquivo}\` | ${f.v} | ${f.rotulo} |`).join("\n");

fs.writeFileSync(path.join(DESTINO, "INDICE.md"), `# Capturas das três versões

Geradas por \`design/ux/versoes/capturar.mjs\` em ${new Date().toISOString().slice(0, 10)}.
PNG sem perdas, 3360×2100 px (1680×1050 @2×), tema claro, mesmos dados de demonstração
nas três versões — a diferença entre as imagens é só de desenho.

Mesmo formato de \`screenshots/\` (o produto como está hoje), para comparação direta.

| Arquivo | Versão | Tela |
|---|---|---|
${linhas}

Comparação e parecer em [\`../README.md\`](../README.md).
`, "utf-8");

console.log(`\n${feitas.length} capturas em design/ux/versoes/telas/`);
console.log("viewport 1680×1050 @2× = 3360×2100 px, PNG sem perdas");
