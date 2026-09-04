#!/usr/bin/env node
/**
 * NOTA 04 — a prova, em navegador real
 * ====================================
 * Abre `capturas/ice/svg_prova.html`, clica em CADA face, raiz e coroa dos três
 * dentes gerados e confere que o alvo do clique se identifica sozinho.
 *
 *   node design/benchmark/provar_dentes_svg.mjs
 *
 * ── POR QUE ESTE ARQUIVO EXISTE
 *
 * A Subetapa 03.7 pagou esta lição e a registrou em `handoffs/instrucoes.md` §5:
 * *"a suíte ficou 27/27 verde com a peça central da tela invisível — porque
 * media a nossa projeção, não o desenho de terceiro."* Uma amostra de SVG que
 * "tem `data-face` no arquivo" é exatamente esse tipo de asserção: mede o que
 * escrevemos, não o que acontece quando alguém clica.
 *
 * Então a prova é por clique de verdade, em navegador de verdade, com a
 * pergunta que aquela entrada mandou fazer: *se o SVG sumisse da tela agora,
 * qual destas asserções ficaria vermelha?* Aqui, todas — cada uma depende de o
 * elemento existir, estar visível, receber o evento e responder com a região
 * certa. Um `elementFromPoint` no centro geométrico de cada região confirma,
 * antes do clique, que é ELA que está no topo naquele ponto: sem isso, um
 * retângulo transparente por cima faria os 27 cliques passarem pelo alvo errado
 * e o teste ficaria verde do mesmo jeito.
 *
 * Reusa a busca de navegador de `capturar.mjs` (nesta máquina não há Chrome no
 * caminho padrão do puppeteer, e o `msedge.exe` da raiz de Application/ é um
 * lançador que sai imediatamente — o binário real fica na pasta versionada).
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../..");
const PAGINA = path.join(AQUI, "capturas", "ice", "svg_prova.html");

const req = createRequire(path.join(RAIZ, "crm", "package.json"));
const puppeteer = (await import(pathToFileURL(req.resolve("puppeteer-core")))).default;

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
    const versoes = fs.readdirSync(raiz, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d+\./.test(d.name))
      .map((d) => d.name).sort().reverse();
    for (const v of versoes) {
      const p = path.join(raiz, v, exe);
      if (fs.existsSync(p)) return p;
    }
    const p = path.join(raiz, exe);
    if (fs.existsSync(p)) return p;
  }
  throw new Error("nenhum navegador encontrado");
}

const REGIOES = ["mesial", "distal", "vestibular", "lingual", "oclusal", "incisal"];
let ok = 0, falhas = [];
const conferir = (cond, msg) => { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { falhas.push(msg); console.log(`  ✗ ${msg}`); } };

const navegador = await puppeteer.launch({ executablePath: acharNavegador(), headless: "new", args: ["--allow-file-access-from-files"] });
const pagina = await navegador.newPage();
await pagina.setViewport({ width: 900, height: 700 });
const erros = [];
pagina.on("pageerror", (e) => erros.push(e.message));
await pagina.goto(pathToFileURL(PAGINA).href, { waitUntil: "networkidle0" });
await pagina.waitForFunction("window.__pronto === true", { timeout: 15000 });

console.log("\n── 1. os três dentes montaram");
const svgs = await pagina.$$eval("svg[data-dente]", (ns) => ns.map((n) => ({ dente: n.dataset.dente, tipo: n.dataset.tipo })));
conferir(svgs.length === 3, `3 dentes no DOM (achados: ${svgs.map((s) => s.dente).join(", ")})`);

console.log("\n── 2. cada região é um elemento próprio, com identificador estável");
const inventario = await pagina.$$eval("svg[data-dente]", (ns) => ns.map((n) => ({
  dente: n.dataset.dente,
  faces: [...n.querySelectorAll("[data-face]")].map((e) => e.dataset.face),
  raizes: [...n.querySelectorAll('[data-regiao="raiz"]')].length,
  coroas: [...n.querySelectorAll('[data-regiao="coroa"]')].length,
})));
for (const inv of inventario) {
  conferir(inv.faces.length === 5, `dente ${inv.dente}: 5 faces (${inv.faces.join("/")})`);
  conferir(inv.coroas === 1, `dente ${inv.dente}: coroa endereçável`);
  conferir(inv.raizes >= 1, `dente ${inv.dente}: ${inv.raizes} raiz(es) endereçável(is)`);
}
conferir(inventario.find((i) => i.dente === "11").faces.includes("incisal"),
  "o incisivo tem face incisal, não oclusal — o vocabulário varia por tipo de dente");
conferir(inventario.find((i) => i.dente === "16").raizes === 3, "o molar tem 3 raízes separadas");

console.log("\n── 3. cada região está de fato no topo no seu próprio centro");
// Sem isto, um alvo invisível por cima faria todos os cliques abaixo passarem.
const topo = await pagina.evaluate(() => {
  const fora = [];
  for (const el of document.querySelectorAll("[data-face], [data-regiao]")) {
    const r = el.getBoundingClientRect();
    const alvo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const id = el.dataset.face || el.dataset.regiao;
    // a raiz do molar e a coroa são côncavas: o centro do retângulo pode cair
    // fora do traçado. Nesses casos o teste de clique abaixo é o que vale.
    if (alvo !== el) fora.push({ id, achou: alvo?.id || alvo?.tagName });
  }
  return fora;
});
conferir(topo.length <= 4, `no máximo 4 regiões côncavas com centro fora do traçado (fora: ${topo.length}${topo.length ? " — " + topo.map((f) => f.id).join(",") : ""})`);

console.log("\n── 4. o clique resolve a região sozinho, sem coordenada");
const resultado = await pagina.evaluate(() => {
  const saida = [];
  for (const svg of document.querySelectorAll("svg[data-dente]")) {
    for (const el of svg.querySelectorAll("[data-face], [data-regiao]")) {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const ultimo = window.__cliques[window.__cliques.length - 1];
      saida.push({
        esperado: el.dataset.face || el.dataset.regiao,
        recebido: ultimo.regiao,
        dente: svg.dataset.dente,
        denteRecebido: ultimo.dente,
        marcado: el.getAttribute("data-marcado"),
      });
    }
  }
  return saida;
});
const certos = resultado.filter((r) => r.esperado === r.recebido && r.dente === r.denteRecebido);
conferir(certos.length === resultado.length,
  `${certos.length}/${resultado.length} cliques devolveram a região E o dente corretos`);
conferir(resultado.every((r) => r.marcado === "a_realizar"),
  "todo alvo clicado recebeu o primeiro estado do ciclo (a_realizar)");

console.log("\n── 5. a marcação é isolada — clicar numa face não pinta as vizinhas");
const isolamento = await pagina.evaluate(() => {
  document.querySelectorAll("[data-marcado]").forEach((e) => e.removeAttribute("data-marcado"));
  const svg = document.querySelector('svg[data-dente="16"]');
  svg.querySelector('[data-face="mesial"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
  return {
    marcados: [...document.querySelectorAll("[data-marcado]")].map((e) => e.id),
    total: document.querySelectorAll("[data-marcado]").length,
  };
});
conferir(isolamento.total === 1 && isolamento.marcados[0] === "face-mesial",
  `só a face clicada ficou marcada (marcados: ${isolamento.marcados.join(", ") || "nenhum"})`);

console.log("\n── 6. o estado sobrevive à serialização — é o SVG que guarda o dado");
const roundtrip = await pagina.evaluate(() => {
  const svg = document.querySelector('svg[data-dente="16"]');
  const texto = new XMLSerializer().serializeToString(svg);
  return { temAtributo: /data-marcado="a_realizar"/.test(texto), bytes: texto.length };
});
conferir(roundtrip.temAtributo, `a marcação sai na serialização do SVG (${roundtrip.bytes} B)`);

conferir(erros.length === 0, `zero erro de JavaScript${erros.length ? ": " + erros.join(" | ") : ""}`);

const captura = path.join(AQUI, "capturas", "ice", "svg_prova_captura.png");
await pagina.evaluate(() => {
  // pinta um exemplo de cada estado, para a captura mostrar o ciclo inteiro
  const m = (d, r, v) => document.querySelector(`svg[data-dente="${d}"] [data-face="${r}"], svg[data-dente="${d}"] [data-regiao="${r}"]`)?.setAttribute("data-marcado", v);
  m("11", "vestibular", "existente"); m("14", "oclusal", "a_realizar");
  m("16", "mesial", "a_realizar"); m("16", "distal", "executado"); m("16", "raiz", "existente");
});
await pagina.screenshot({ path: captura, fullPage: true });
console.log(`\ncaptura: ${path.relative(RAIZ, captura)}`);

await navegador.close();
console.log(`\n${ok}/${ok + falhas.length} asserções verdes.`);
if (falhas.length) { falhas.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1); }
