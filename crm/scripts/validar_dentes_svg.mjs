#!/usr/bin/env node
/**
 * Guarda do CONTRATO DE NOMES do odontograma (Subetapa 03.7.a, restrição 1).
 *
 * Roda no fim de `npm run build` e QUEBRA O BUILD quando um desenho de dente
 * perde uma região nomeada. Toma o lugar que `escopar_css_odontograma.mjs
 * --verificar` ocupava na cadeia de `"build"` — o objeto que aquela guarda
 * domava (o CSS global de terceiro) saiu do projeto junto com a biblioteca.
 *
 * ============================================================
 * O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
 * ============================================================
 * Max declarou, ao decidir o odontograma autoral (D-I1, 2026-09-03), que
 * provavelmente vai REDESENHAR os SVG. Isso é requisito, não observação: o
 * componente foi escrito para não depender da geometria, só dos nomes
 * (`data-face`, `data-regiao`). O risco que isso cria é exatamente o inverso
 * do risco de biblioteca de terceiro — não é a arte mudar, é a arte mudar e
 * PERDER UM NOME.
 *
 * Um dente que volta do redesenho sem `data-face="mesial"` não gera erro
 * nenhum: o desenho aparece, o clique naquela região simplesmente não resolve
 * face, e a Subetapa 03.8 passa a montar orçamento sem aquela face — para
 * aquele dente, e só para ele. É defeito silencioso, parcial e clínico. A
 * única defesa barata é cobrar o contrato a cada build.
 *
 * ============================================================
 * O QUE ELE COMPARA — E O QUE ELE DELIBERADAMENTE NÃO COMPARA
 * ============================================================
 * Compara cada `.svg` do diretório com `dentes/contrato.json`: as cinco faces
 * (quatro comuns mais o centro, que é `incisal` no anterior e `oclusal` no
 * posterior), a coroa, e pelo menos uma raiz — cada uma exatamente UMA vez,
 * porque face duplicada é ambiguidade de clique.
 *
 * NÃO compara bytes com a saída de `gerar_dentes_svg.mjs`, e isso é decisão,
 * não economia. A guarda da 03.7 comparava conteúdo gerado por igualdade
 * exata de string e ficou vermelha em TODO checkout Windows por diferença de
 * fim de linha (CRLF no disco × LF em memória), deixando o `npm run build`
 * quebrado por duas subetapas — `handoffs/instrucoes.md` §5. Pior que o custo
 * do vermelho falso é o que ele diria: "o desenho mudou" quando nada mudou. E
 * aqui o desenho PODE mudar; é o contrato que não pode.
 *
 * Por isso, também, a leitura é por atributo e não por `id`: os 26 arquivos
 * são instanciados nas 52 posições da boca, e `id` repetido no mesmo
 * documento é HTML inválido. O componente resolve o clique por
 * `data-face`/`data-regiao`, que não têm exigência de unicidade — o `id` fica
 * no arquivo para quem desenha, e nunca é lido em tempo de execução.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(AQUI, "..", "src", "features", "health", "dentes");
const CONTRATO = JSON.parse(fs.readFileSync(path.join(DIR, "contrato.json"), "utf-8"));

/** Toda posição que o contrato declara, como `<tipo>-<posição>`. */
const ESPERADOS = [];
for (const [chaveTipo, def] of Object.entries(CONTRATO.tipos)) {
  for (let i = 0; i < def.raizes.length; i++) {
    ESPERADOS.push({ arquivo: `${chaveTipo}-${i + 1}.svg`, posicao: i + 1, raizes: def.raizes[i] });
  }
}

const problemas = [];
const encontrados = new Set(fs.readdirSync(DIR).filter((f) => f.endsWith(".svg")));

/** Ocorrências de um atributo, com o valor — regex basta: o alvo é atributo, não estrutura. */
function valores(svg, atributo) {
  return [...svg.matchAll(new RegExp(`\\b${atributo}="([^"]+)"`, "g"))].map((m) => m[1]);
}

for (const esperado of ESPERADOS) {
  const caminho = path.join(DIR, esperado.arquivo);
  if (!fs.existsSync(caminho)) {
    problemas.push(`${esperado.arquivo}: arquivo ausente — o contrato declara esta posição.`);
    continue;
  }
  encontrados.delete(esperado.arquivo);
  const svg = fs.readFileSync(caminho, "utf-8");

  const centro = esperado.posicao <= 3 ? CONTRATO.faces.centroAnterior : CONTRATO.faces.centroPosterior;
  const facesExigidas = [...CONTRATO.faces.comuns, centro];
  const faces = valores(svg, "data-face");

  for (const face of facesExigidas) {
    const quantas = faces.filter((f) => f === face).length;
    if (quantas === 0) problemas.push(`${esperado.arquivo}: falta data-face="${face}".`);
    else if (quantas > 1) problemas.push(`${esperado.arquivo}: data-face="${face}" aparece ${quantas}× — clique ambíguo.`);
  }
  for (const face of new Set(faces)) {
    if (!facesExigidas.includes(face)) {
      problemas.push(
        `${esperado.arquivo}: data-face="${face}" não está no contrato ` +
          `(esperadas: ${facesExigidas.join(", ")}).`,
      );
    }
  }

  const regioes = valores(svg, "data-regiao");
  if (!regioes.includes("coroa")) problemas.push(`${esperado.arquivo}: falta data-regiao="coroa".`);
  if (regioes.filter((r) => r === "coroa").length > 1) {
    problemas.push(`${esperado.arquivo}: data-regiao="coroa" aparece mais de uma vez.`);
  }
  const raizes = regioes.filter((r) => r === "raiz").length;
  if (raizes === 0) problemas.push(`${esperado.arquivo}: nenhuma data-regiao="raiz".`);
  for (const r of new Set(regioes)) {
    if (!CONTRATO.regioesNaoFace.includes(r)) {
      problemas.push(`${esperado.arquivo}: data-regiao="${r}" não está no contrato.`);
    }
  }

  // `viewBox` é o único traço de geometria que o componente precisa que
  // sobreviva ao redesenho: sem ele o dente não escala junto dos vizinhos e a
  // arcada sai desalinhada. Não fixa NENHUMA medida — só exige que exista.
  if (!/\bviewBox="[^"]+"/.test(svg)) problemas.push(`${esperado.arquivo}: sem viewBox.`);
}

for (const sobrando of encontrados) {
  problemas.push(`${sobrando}: desenho sem posição correspondente no contrato — sobra ou nome errado.`);
}

const total = ESPERADOS.length;
if (problemas.length > 0) {
  console.error(`\n✗ contrato de nomes do odontograma violado (${problemas.length} problema(s)):\n`);
  for (const p of problemas) console.error(`   · ${p}`);
  console.error(
    "\n  O desenho pode mudar à vontade; os NOMES não. Se a mudança for de modelo\n" +
      "  (um dente passa a ter outra face, ou some do MVP), edite\n" +
      "  src/features/health/dentes/contrato.json — é lá que essa decisão mora.\n",
  );
  process.exit(1);
}

const faces = ESPERADOS.length * 5;
console.log(`✓ contrato de nomes do odontograma: ${total} desenhos, ${faces} faces e ${total} coroas conferidos.`);
