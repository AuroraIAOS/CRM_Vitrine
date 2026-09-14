#!/usr/bin/env node
/**
 * Gerador da arte de referência do odontograma autoral (Subetapa 03.7.a).
 *
 *   node scripts/gerar_dentes_svg.mjs
 *
 * Escreve 26 arquivos em `src/features/health/dentes/` — um por
 * (dentição × arcada × posição FDI) —, que o componente instancia nas 52
 * posições da boca por espelhamento horizontal (quadrantes 2 e 3).
 *
 * ============================================================
 * ESTE SCRIPT NÃO É PRÉ-REQUISITO DE NADA
 * ============================================================
 * Ele existe para que a arte de PARTIDA nasça de código paramétrico em vez
 * de 26 arquivos desenhados à mão — e para que continue barato regenerar
 * tudo se uma medida geral mudar. Mas os `.svg` que ele produz são
 * COMMITADOS e passam a ser a verdade a partir daí: Max declarou (decisão
 * D-I1, 2026-09-03) que provavelmente vai redesenhar os desenhos, e a partir
 * do redesenho este gerador deixa de descrever o que está no disco.
 *
 * É por isso que ele NÃO roda no `npm run build` e o `validar_dentes_svg.mjs`
 * roda. A guarda do build compara o desenho com o CONTRATO
 * (`dentes/contrato.json`), nunca com a saída deste script — se comparasse
 * com a saída, redesenhar quebraria o build, que é exatamente o contrário do
 * que a restrição 1 da Qualidade pede.
 *
 * (A lição vem cara: a guarda `escopar_css_odontograma.mjs --verificar`, da
 * 03.7, comparava conteúdo gerado por igualdade exata de string e ficou
 * VERMELHA em todo checkout Windows por causa de CRLF × LF — deixou o
 * `npm run build` quebrado por duas subetapas. Ver `handoffs/instrucoes.md`
 * §5. Guarda de artefato gerado tem que cobrar o contrato, não os bytes.)
 *
 * ============================================================
 * ORIENTAÇÃO CANÔNICA, E POR QUE SÓ ELA É GERADA
 * ============================================================
 * Todo arquivo nasce na orientação da ARCADA DIREITA (quadrantes 1 e 4 da
 * FDI, que num odontograma ficam à esquerda da tela): mesial para a direita,
 * distal para a esquerda. Os quadrantes 2 e 3 são a mesma arte com
 * `transform: scaleX(-1)` aplicado pelo CSS do componente — o espelho troca
 * mesial e distal de lado na tela, que é precisamente o que a anatomia manda,
 * já que mesial é sempre "em direção à linha média".
 *
 * Superior e inferior são arquivos DIFERENTES, não espelho vertical em CSS,
 * por dois motivos medidos: o número de raízes muda de verdade entre as
 * arcadas (molar superior tem três, o inferior tem duas) e o desenho inferior
 * precisa nascer com a raiz para baixo e a face oclusal para cima, que é como
 * o odontograma apresenta a arcada de baixo.
 *
 * NENHUM TEXTO DENTRO DO SVG. O número do dente é desenhado pelo componente,
 * em HTML, fora do desenho — o mesmo arquivo serve quatro posições, e letra
 * dentro de arte espelhada sairia invertida.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DESTINO = path.join(AQUI, "..", "src", "features", "health", "dentes");
const CONTRATO = JSON.parse(fs.readFileSync(path.join(DESTINO, "contrato.json"), "utf-8"));

/** Caixa de desenho de um dente. Toda medida abaixo vive dentro dela. */
const LARGURA = 100;
const ALTURA = 240;

const n = (v) => Number(v).toFixed(2);

/** Setor anular da roseta oclusal, em coordenadas polares → path de arco. */
function setorAnular(cx, cy, rInt, rExt, grausInicio, grausFim) {
  const rad = (g) => ((g - 90) * Math.PI) / 180;
  const p = (r, g) => [cx + r * Math.cos(rad(g)), cy + r * Math.sin(rad(g))];
  const [x1, y1] = p(rExt, grausInicio);
  const [x2, y2] = p(rExt, grausFim);
  const [x3, y3] = p(rInt, grausFim);
  const [x4, y4] = p(rInt, grausInicio);
  const grande = grausFim - grausInicio > 180 ? 1 : 0;
  return `M ${n(x1)} ${n(y1)} A ${rExt} ${rExt} 0 ${grande} 1 ${n(x2)} ${n(y2)} ` +
         `L ${n(x3)} ${n(y3)} A ${rInt} ${rInt} 0 ${grande} 0 ${n(x4)} ${n(y4)} Z`;
}

/**
 * A roseta de cinco regiões — quatro setores mais o centro.
 *
 * Na orientação canônica (arcada direita, arcada SUPERIOR): vestibular em
 * cima, lingual embaixo, mesial à direita, distal à esquerda. O arquivo
 * inferior nasce com vestibular embaixo, porque é assim que a arcada de baixo
 * é apresentada — e é por isso que ele é arquivo próprio, e não um flip.
 */
function roseta(cx, cy, r, centro, arcada) {
  const rInt = r * 0.44;
  const superior = arcada === "superior";
  const setores = [
    ["distal", 225, 315],
    [superior ? "vestibular" : "lingual", 315, 405],
    ["mesial", 45, 135],
    [superior ? "lingual" : "vestibular", 135, 225],
  ];
  const partes = setores.map(
    ([face, g0, g1]) =>
      `      <path id="face-${face}" data-face="${face}" class="od-face" d="${setorAnular(cx, cy, rInt, r, g0, g1)}" />`,
  );
  partes.push(
    `      <circle id="face-${centro}" data-face="${centro}" class="od-face" cx="${n(cx)}" cy="${n(cy)}" r="${n(rInt)}" />`,
  );
  return partes.join("\n");
}

/**
 * Um dente completo: raízes, coroa em vista vestibular e roseta oclusal.
 *
 * `arcada` decide o sentido: na superior a raiz fica em cima e a roseta
 * embaixo; na inferior, o contrário. O sentido entra como reflexão das
 * COORDENADAS Y, não como `transform` no grupo, para que o arquivo salvo
 * seja legível por quem for redesenhar — um `scale(1,-1)` no topo do arquivo
 * obrigaria o designer a pensar de cabeça para baixo.
 */
function dente({ chave, nome, posicao, arcada, raizes, largura, centro }) {
  const superior = arcada === "superior";
  // `y` recebe a coordenada na orientação superior e devolve a real.
  const y = (v) => (superior ? v : ALTURA - v);
  const cx = LARGURA / 2;

  const yApice = 16;
  const yColo = 118;
  const yBordo = 174;
  const cyRoseta = 206;
  const rRoseta = 27;

  const base = Math.min(30, (largura - 2) / raizes);
  // Deslocamento de cada raiz: distribuídas simetricamente sob a coroa.
  const passo = raizes > 1 ? (largura - base) / (raizes - 1) : 0;
  const pathsRaiz = [];
  for (let i = 0; i < raizes; i++) {
    const dx = raizes === 1 ? 0 : -(largura - base) / 2 + i * passo;
    const x = cx + dx;
    // Curvatura: a raiz mais distal inclina para fora, como na boca.
    const curva = raizes === 1 ? 0 : dx * 0.22;
    pathsRaiz.push(
      `      <path id="raiz-${i + 1}" data-regiao="raiz" data-indice="${i + 1}" class="od-raiz" ` +
        `d="M ${n(x - base / 2)} ${n(y(yColo))} ` +
        `C ${n(x - base / 2 + curva)} ${n(y(yColo - 42))}, ${n(x - 4 + curva)} ${n(y(yColo - 66))}, ` +
        `${n(x + curva * 1.8)} ${n(y(yApice))} ` +
        `C ${n(x + 4 + curva)} ${n(y(yColo - 66))}, ${n(x + base / 2 + curva)} ${n(y(yColo - 42))}, ` +
        `${n(x + base / 2)} ${n(y(yColo))} Z" />`,
    );
  }

  const meia = largura / 2;
  // A coroa vem DEPOIS das raízes no documento, então cobre a junção — que é
  // o que a gengiva faz na boca, e o que dá o colo do dente de graça.
  const coroa =
    `      <path id="coroa" data-regiao="coroa" class="od-coroa" ` +
    `d="M ${n(cx - meia)} ${n(y(yColo - 6))} L ${n(cx - meia + 3)} ${n(y(yBordo - 8))} ` +
    `Q ${n(cx)} ${n(y(yBordo))} ${n(cx + meia - 3)} ${n(y(yBordo - 8))} ` +
    `L ${n(cx + meia)} ${n(y(yColo - 6))} Z" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGURA} ${ALTURA}"
     role="img" aria-label="${nome}"
     data-tipo="${chave}" data-posicao="${posicao}" data-arcada="${arcada}">
  <title>${nome} — faces: mesial, distal, vestibular, lingual, ${centro}</title>
  <g class="od-dente">
    <g class="od-regiao-raiz">
${pathsRaiz.join("\n")}
    </g>
    <g class="od-regiao-coroa">
${coroa}
    </g>
    <g class="od-regiao-faces">
${roseta(cx, y(cyRoseta), rRoseta, centro, arcada)}
    </g>
  </g>
</svg>
`;
}

const NOMES_PERMANENTE = [
  "Incisivo central", "Incisivo lateral", "Canino",
  "Primeiro pré-molar", "Segundo pré-molar",
  "Primeiro molar", "Segundo molar", "Terceiro molar",
];
const NOMES_DECIDUA = [
  "Incisivo central decíduo", "Incisivo lateral decíduo", "Canino decíduo",
  "Primeiro molar decíduo", "Segundo molar decíduo",
];

let escritos = 0;
for (const [chaveTipo, def] of Object.entries(CONTRATO.tipos)) {
  const [denticao, arcada] = chaveTipo.split("-");
  const nomes = denticao === "permanente" ? NOMES_PERMANENTE : NOMES_DECIDUA;
  for (let i = 0; i < def.raizes.length; i++) {
    const posicao = i + 1;
    const anterior = posicao <= 3;
    const centro = anterior ? CONTRATO.faces.centroAnterior : CONTRATO.faces.centroPosterior;
    const nome = `${nomes[i]} ${arcada}`;
    const arquivo = `${chaveTipo}-${posicao}.svg`;
    fs.writeFileSync(
      path.join(DESTINO, arquivo),
      dente({
        chave: chaveTipo,
        nome,
        posicao,
        arcada,
        raizes: def.raizes[i],
        largura: def.larguras[i],
        centro,
      }),
      "utf-8",
    );
    escritos++;
    console.log(`  ✓ ${arquivo.padEnd(30)} ${def.raizes[i]} raiz(es) · centro ${centro}`);
  }
}
console.log(`\n${escritos} desenhos escritos em src/features/health/dentes/.`);
console.log("Confira com: node scripts/validar_dentes_svg.mjs");
