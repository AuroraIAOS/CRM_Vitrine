/**
 * Guarda de peso do service worker (Subetapa 03.7). Roda no fim de
 * `npm run build` e QUEBRA O BUILD quando o precache estoura o teto.
 *
 * ============================================================
 * O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
 * ============================================================
 * Precache é download ANTECIPADO: o que entra no manifesto do
 * `sw.js` é buscado na primeira visita, antes de qualquer navegação. Ou
 * seja, ele é capaz de desfazer, na rede, toda a divisão por rota que o
 * bundler fez no disco — e sem dar erro nenhum, porque tecnicamente
 * tudo funciona (funciona rápido, inclusive; só custa caro).
 *
 * Aconteceu de verdade nesta subetapa: instalado o odontograma, o
 * manifesto saltou de **1.089 KiB para 4.404 KiB** enquanto a saída do
 * `vite build` mostrava, com toda a razão, um chunk de entrada
 * praticamente inalterado (160.212 → 160.273 B gzip). Os dois números
 * eram verdadeiros; só um deles descrevia o que o usuário baixava.
 *
 * A correção (`globIgnores` + `runtimeCaching` em `vite.config.ts`)
 * valeria só para hoje. É este arquivo que a torna durável: a próxima
 * dependência pesada que alguém acrescentar sem pensar no precache
 * derruba o build aqui, em vez de aparecer meses depois como "o app
 * demora a abrir na primeira vez".
 *
 * Mesmo padrão de guarda das Subetapas 02.15 e 03.9: não basta corrigir
 * o caso encontrado, é preciso deixar quem falhe sozinho quando o caso
 * voltar.
 *
 * ============================================================
 * O TETO
 * ============================================================
 * 1.400 KiB brutos. A linha de base medida antes desta subetapa era
 * 1.089 KiB; depois dela, 1.096 KiB. A folga de ~300 KiB é para o
 * crescimento normal das telas das ondas seguintes (03.8 a 03.22) sem
 * exigir edição deste arquivo a cada subetapa.
 *
 * SUBIR O TETO É DECISÃO, NÃO MANUTENÇÃO. Se ele estourar, a pergunta
 * certa é "este pacote precisa mesmo estar no precache?" antes de
 * "quanto eu aumento?" — o teto é irmão do de 180 KB gzip do chunk de
 * entrada, em `design/ux/06_ORCAMENTO_DE_PESO.md` §4, e existe pelo
 * mesmo motivo.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(raiz, "dist");
const sw = path.join(dist, "sw.js");

const TETO_KIB = 1400;

if (!fs.existsSync(sw)) {
  console.error("✗ dist/sw.js não existe — o build do PWA não rodou.");
  process.exit(1);
}

const conteudo = fs.readFileSync(sw, "utf8");
const urls = [...conteudo.matchAll(/\{url:"([^"]+)",revision:/g)].map((m) => m[1]);

if (urls.length === 0) {
  // Manifesto vazio não é "tudo certo": é sinal de que o formato do
  // `sw.js` mudou e esta guarda parou de medir o que acha que mede.
  console.error("✗ manifesto de precache vazio — o formato do sw.js mudou e esta guarda cegou.");
  process.exit(1);
}

const itens = urls
  .map((u) => {
    const p = path.join(dist, u.replace(/^\.?\//, ""));
    return { url: u, bytes: fs.existsSync(p) ? fs.statSync(p).size : 0 };
  })
  .sort((a, b) => b.bytes - a.bytes);

const total = itens.reduce((s, i) => s + i.bytes, 0);
const kib = total / 1024;

console.log(`precache: ${itens.length} entradas, ${kib.toFixed(1)} KiB (teto ${TETO_KIB} KiB)`);
for (const i of itens.slice(0, 5)) {
  console.log(`   ${(i.bytes / 1024).toFixed(1).padStart(8)} KiB  ${i.url}`);
}

if (kib > TETO_KIB) {
  console.error(
    `\n✗ precache estourou o teto: ${kib.toFixed(1)} KiB > ${TETO_KIB} KiB.\n` +
      "  Precache é download antecipado — tudo aí é baixado na PRIMEIRA visita.\n" +
      "  Antes de subir o teto, pergunte se o pacote maior da lista acima\n" +
      "  precisa mesmo estar no precache, ou se ele é sob demanda e deveria\n" +
      "  entrar em `globIgnores` + `runtimeCaching` (vite.config.ts).",
  );
  process.exit(1);
}
console.log("✓ precache dentro do teto.");
