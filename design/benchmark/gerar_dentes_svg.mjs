#!/usr/bin/env node
/**
 * NOTA 04 — amostra de dentes em SVG com face, raiz e região clicáveis
 * ===================================================================
 * Gera três dentes (incisivo, pré-molar, molar) como prova de que o caminho
 * "o CODE gera o SVG" produz geometria **individualizada e endereçável**, e não
 * um desenho achatado. Amostra pedida por Max na NOTA 04 do prompt de abertura
 * da pesquisa `analise-ice`: *"se você conseguir gerar, PROVE com uma amostra de
 * 2 ou 3 dentes commitada, não com uma afirmação."*
 *
 *   node design/benchmark/gerar_dentes_svg.mjs
 *
 * Saída em `capturas/ice/`: três `.svg` + uma página de prova que pinta a região
 * clicada e registra o clique, para a medição por navegador de
 * `provar_dentes_svg.mjs`.
 *
 * ── DECISÕES DE DESENHO, E POR QUE ELAS SÃO O PONTO
 *
 * A anatomia aqui é deliberadamente esquemática — o ICE também é (NOTA 05: a
 * estética dele é arcaica e não se copia; o que interessa é a ESTRUTURA). O que
 * a amostra prova não é beleza, é que:
 *
 *   1. cada face é um `<path>` PRÓPRIO, com `id` estável e `data-face`, de modo
 *      que um clique resolve a face sozinho (`evt.target.dataset.face`), sem
 *      cálculo de coordenada e sem painel lateral;
 *   2. raiz e coroa são regiões separadas, endereçáveis pelo mesmo mecanismo;
 *   3. a roseta oclusal reproduz o desenho de cinco regiões que o ICE usa
 *      (D/M/F/L + centro oclusal), medido nas imagens `06`/`07`/`08` que Max
 *      separou em `screenshots/odontograma/`;
 *   4. o número de faces varia por tipo de dente — o incisivo não tem oclusal,
 *      tem incisal —, e isso é dado do gerador, não exceção no código.
 *
 * A geometria é PARAMÉTRICA (uma função por tipo de dente, com medidas em
 * variáveis), não caminho desenhado à mão: é o que permite gerar as 32 posições
 * permanentes e as 20 decíduas por espelhamento e escala, em vez de manter 52
 * arquivos de arte. Essa é a diferença de custo de manutenção que a NOTA 04 pede
 * para ser medida — e ela só existe se o SVG nascer de código.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DESTINO = path.join(AQUI, "capturas", "ice");
fs.mkdirSync(DESTINO, { recursive: true });

/** Paleta neutra: a amostra prova estrutura, não identidade visual. */
const TRACO = "#334155";
const ESMALTE = "#f8fafc";
const DENTINA = "#e2e8f0";
const RAIZ = "#e7e0d3";

/** Setor anular da roseta, em coordenadas polares → path de arco. */
function setorAnular(cx, cy, rInt, rExt, grausInicio, grausFim) {
  const rad = (g) => ((g - 90) * Math.PI) / 180;
  const p = (r, g) => [cx + r * Math.cos(rad(g)), cy + r * Math.sin(rad(g))];
  const [x1, y1] = p(rExt, grausInicio);
  const [x2, y2] = p(rExt, grausFim);
  const [x3, y3] = p(rInt, grausFim);
  const [x4, y4] = p(rInt, grausInicio);
  const grande = grausFim - grausInicio > 180 ? 1 : 0;
  const n = (v) => v.toFixed(2);
  return `M ${n(x1)} ${n(y1)} A ${rExt} ${rExt} 0 ${grande} 1 ${n(x2)} ${n(y2)} ` +
         `L ${n(x3)} ${n(y3)} A ${rInt} ${rInt} 0 ${grande} 0 ${n(x4)} ${n(y4)} Z`;
}

/**
 * A roseta de cinco regiões: quatro setores (distal, mesial, vestibular,
 * lingual) e o centro. O centro é `oclusal` no posterior e `incisal` no
 * anterior — nome diferente, mesma posição, porque é assim que a face se chama
 * clinicamente e o orçamento vai ler o nome, não a posição.
 */
function roseta(cx, cy, r, centro) {
  const rInt = r * 0.42;
  const setores = [
    ["distal", 225, 315, "D", cx - r * 0.72, cy],
    ["vestibular", 315, 45, "V", cx, cy - r * 0.72],
    ["mesial", 45, 135, "M", cx + r * 0.72, cy],
    ["lingual", 135, 225, "L", cx, cy + r * 0.72],
  ];
  const partes = setores.map(([face, g0, g1, letra, lx, ly]) => {
    const d = setorAnular(cx, cy, rInt, r, g0, g1 < g0 ? g1 + 360 : g1);
    return `    <path id="face-${face}" data-face="${face}" class="face" d="${d}" />\n` +
           `    <text class="rotulo" x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}">${letra}</text>`;
  });
  partes.push(
    `    <circle id="face-${centro}" data-face="${centro}" class="face" cx="${cx}" cy="${cy}" r="${rInt}" />`
  );
  return partes.join("\n");
}

/**
 * Um dente: raiz (uma ou mais), coroa em vista vestibular e a roseta.
 * `raizes` são pares [deslocamento em x, curvatura], para que molar (3 raízes),
 * pré-molar (2) e incisivo (1) saiam da mesma função.
 */
function dente({ id, nome, fdi, raizes, largura, centro, faces }) {
  const cxCoroa = 60;
  const yGengiva = 118;
  const meia = largura / 2;

  // A base de cada raiz divide a largura da coroa entre elas: um molar de três
  // raízes tem raiz mais estreita que um incisivo de uma só, como na boca.
  const base = Math.min(26, (largura - 4) / raizes.length);
  const apice = 24;
  const pathsRaiz = raizes.map(([dx, curva], i) => {
    const x = cxCoroa + dx;
    return `    <path id="raiz-${i + 1}" data-regiao="raiz" data-indice="${i + 1}" class="raiz" ` +
      `d="M ${(x - base / 2).toFixed(1)} ${yGengiva} ` +
      `C ${(x - base / 2 + curva).toFixed(1)} 76, ${(x - 3).toFixed(1)} 44, ${(x + curva * 1.6).toFixed(1)} ${apice} ` +
      `C ${(x + 3).toFixed(1)} 44, ${(x + base / 2 - curva).toFixed(1)} 76, ${(x + base / 2).toFixed(1)} ${yGengiva} Z" />`;
  }).join("\n");

  // A coroa é desenhada DEPOIS das raízes no documento, então cobre a junção —
  // que é o que a gengiva faz na boca, e o que dá o colo do dente de graça.
  const coroa =
    `    <path id="coroa" data-regiao="coroa" class="coroa" ` +
    `d="M ${cxCoroa - meia} ${yGengiva - 4} L ${cxCoroa - meia + 3} 172 ` +
    `Q ${cxCoroa} 184 ${cxCoroa + meia - 3} 172 L ${cxCoroa + meia} ${yGengiva - 4} Z" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 260" width="120" height="260"
     role="img" aria-label="${nome} — dente ${fdi}" data-dente="${fdi}" data-tipo="${id}">
  <title>${nome} (FDI ${fdi}) — faces: ${faces.join(", ")}</title>
  <style>
    .raiz  { fill: ${RAIZ};    stroke: ${TRACO}; stroke-width: 1.6; }
    .coroa { fill: ${ESMALTE}; stroke: ${TRACO}; stroke-width: 1.6; }
    .face  { fill: ${DENTINA}; stroke: ${TRACO}; stroke-width: 1.2; }
    .raiz, .coroa, .face { cursor: pointer; }
    .rotulo { font: 600 11px system-ui, sans-serif; fill: ${TRACO};
              text-anchor: middle; pointer-events: none; user-select: none; }
    .num    { font: 600 13px system-ui, sans-serif; fill: ${TRACO};
              text-anchor: middle; pointer-events: none; }
    /* A marcação é um atributo de dado, não uma classe de estilo solta: quem lê
       o SVG salvo sabe o que está marcado sem interpretar cor. */
    [data-marcado="a_realizar"] { fill: #fde68a; }
    [data-marcado="executado"]  { fill: #86efac; }
    [data-marcado="existente"]  { fill: #93c5fd; }
  </style>
  <g id="dente-${fdi}">
    <g id="regiao-raiz">
${pathsRaiz}
    </g>
    <g id="regiao-coroa">
${coroa}
    </g>
    <text class="num" x="${cxCoroa}" y="200">${fdi}</text>
    <g id="regiao-faces" transform="translate(0, 14)">
${roseta(cxCoroa, 216, 26, centro)}
    </g>
  </g>
</svg>
`;
}

const DENTES = [
  {
    arquivo: "svg_1_incisivo_11.svg",
    id: "incisivo", nome: "Incisivo central superior direito", fdi: 11,
    raizes: [[0, 2]], largura: 34, centro: "incisal",
    faces: ["mesial", "distal", "vestibular", "lingual", "incisal"],
  },
  {
    arquivo: "svg_2_premolar_14.svg",
    id: "premolar", nome: "Primeiro pré-molar superior direito", fdi: 14,
    raizes: [[-6, 3], [6, -3]], largura: 38, centro: "oclusal",
    faces: ["mesial", "distal", "vestibular", "lingual", "oclusal"],
  },
  {
    arquivo: "svg_3_molar_16.svg",
    id: "molar", nome: "Primeiro molar superior direito", fdi: 16,
    raizes: [[-13, 4], [0, 0], [13, -4]], largura: 48, centro: "oclusal",
    faces: ["mesial", "distal", "vestibular", "lingual", "oclusal"],
  },
];

for (const d of DENTES) {
  fs.writeFileSync(path.join(DESTINO, d.arquivo), dente(d), "utf-8");
  console.log(`  ✓ ${d.arquivo.padEnd(26)} ${d.faces.length} faces + ${d.raizes.length} raiz(es) + coroa`);
}

// ── página de prova: o clique resolve a região sozinho, sem cálculo de coordenada
const prova = `<!doctype html>
<meta charset="utf-8">
<title>NOTA 04 — prova de clique por face</title>
<style>
  body { font: 14px system-ui, sans-serif; margin: 24px; color: #0f172a; background: #fff; }
  .linha { display: flex; gap: 32px; align-items: flex-start; }
  #log { margin-top: 20px; font-family: ui-monospace, monospace; font-size: 13px;
         white-space: pre; background: #f1f5f9; padding: 12px; border-radius: 6px; min-height: 60px; }
</style>
<h1>Amostra da NOTA 04 — face, raiz e coroa clicáveis</h1>
<p>Clique em qualquer região. O identificador sai de <code>data-face</code> ou
   <code>data-regiao</code> do próprio alvo do evento — sem cálculo de coordenada,
   sem painel lateral, sem mapa de pixels.</p>
<div class="linha" id="dentes"></div>
<div id="log">(nenhum clique ainda)</div>
<script>
const ARQUIVOS = ${JSON.stringify(DENTES.map((d) => d.arquivo))};
const alvo = document.getElementById("dentes");
const log = document.getElementById("log");
const registro = [];
Promise.all(ARQUIVOS.map(f => fetch(f).then(r => r.text()))).then(svgs => {
  svgs.forEach(s => { const d = document.createElement("div"); d.innerHTML = s; alvo.appendChild(d); });
  alvo.addEventListener("click", e => {
    const el = e.target.closest("[data-face], [data-regiao]");
    if (!el) return;
    const svg = el.closest("svg");
    const item = {
      dente: svg.dataset.dente,
      regiao: el.dataset.face || el.dataset.regiao,
      indice: el.dataset.indice || null,
      id: el.id,
    };
    // Ciclo de três estados, o mesmo vocabulário da Subetapa 03.7.
    const ordem = ["", "a_realizar", "executado", "existente"];
    const atual = el.getAttribute("data-marcado") || "";
    const proximo = ordem[(ordem.indexOf(atual) + 1) % ordem.length];
    if (proximo) el.setAttribute("data-marcado", proximo); else el.removeAttribute("data-marcado");
    item.marcado = proximo || null;
    registro.push(item);
    window.__cliques = registro;
    log.textContent = registro.slice(-8).map(r =>
      \`dente \${r.dente} · \${r.regiao}\${r.indice ? " #" + r.indice : ""} · \${r.marcado || "(limpo)"}\`
    ).join("\\n");
  });
  window.__pronto = true;
});
</script>
`;
fs.writeFileSync(path.join(DESTINO, "svg_prova.html"), prova, "utf-8");
console.log(`  ✓ svg_prova.html            página de prova do clique`);
