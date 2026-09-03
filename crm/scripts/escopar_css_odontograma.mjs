/**
 * Gera `src/features/health/odontograma-escopado.css` a partir do
 * stylesheet publicado por `react-advanced-odontogram` (Subetapa 03.7).
 *
 * ============================================================
 * POR QUE ESTE SCRIPT EXISTE — o custo que ele evita, medido
 * ============================================================
 * O README da biblioteca manda `import "react-advanced-odontogram/
 * style.css"`. Fazer isso num app com design system próprio é uma
 * regressão global silenciosa, e a medição mostrou exatamente onde:
 *
 *  1. o `:root` da biblioteca declara `--bg --panel --card --muted
 *     --text --line --accent --accent2` com valores HEX. Três desses
 *     nomes — `--card`, `--muted`, `--accent` — são tokens do shadcn
 *     usados por este projeto em `src/index.css`, e o projeto os consome
 *     como `hsl(var(--accent))`. Um hex dentro de `hsl()` é valor
 *     inválido: a cor não fica azul, ela some. Acento, card e muted
 *     quebrariam no app INTEIRO;
 *  2. existe uma regra de seletor exatamente `.dark`, e mais 106 que
 *     usam `.dark` como ancestral. `.dark` é a classe que
 *     `src/lib/preferencias.tsx` põe no `<html>` para o modo escuro —
 *     ou seja, essas regras cairiam sobre a raiz do nosso documento;
 *  3. `html, body { height: 100% }` e um bloco `select { … }` completo
 *     (aparência, borda, `min-width: 220px`, seta desenhada em
 *     gradiente) atingiriam todo `<select>` do produto — desfazendo, de
 *     passagem, o trabalho da Subetapa 02.12b, que existiu para dar
 *     fundo correto a campo de formulário nos dois temas.
 *
 * E o pior traço dessa falha é o atraso: o CSS de um chunk preguiçoso só
 * entra na cascata quando alguém abre a rota. O app funcionaria bem até
 * a primeira visita ao odontograma e passaria a exibir cor quebrada em
 * todas as outras telas a partir dali, sem nenhum erro em lugar nenhum.
 *
 * ============================================================
 * POR QUE OFFLINE, COM PARSER, E NÃO EM TEMPO DE EXECUÇÃO
 * ============================================================
 * Reescrever 597 blocos com expressão regular na hora do `import` erra
 * em `@keyframes` (onde `from`/`to`/`50%` não são seletores), em
 * `@media`/`@supports` aninhados e em `@font-face`. O PostCSS já é
 * dependência deste projeto e sabe a diferença. Rodando offline, o
 * resultado é um arquivo COMMITADO — some do diff nada, e quem revisar
 * a subetapa lê o CSS que de fato vai para produção, em vez de confiar
 * numa transformação invisível.
 *
 * ============================================================
 * A TRANSFORMAÇÃO, REGRA A REGRA
 * ============================================================
 *   `:root`            → `.odontograma-escopo`   (tokens passam a valer
 *                        só dentro do container; nada vaza para o app)
 *   `html`, `body`     → descartados             (altura de documento não
 *                        é assunto de um componente)
 *   `.dark …`          → `.dark .odontograma-escopo …`  (preserva o modo
 *                        escuro da biblioteca ancorado no NOSSO sinal de
 *                        tema, que é a mesma classe)
 *   qualquer outro     → `.odontograma-escopo …`
 *   dentro de @keyframes → intocado
 *
 * Uso:
 *   node scripts/escopar_css_odontograma.mjs             (gera)
 *   node scripts/escopar_css_odontograma.mjs --verificar (falha se o
 *        arquivo commitado não bate com a versão instalada da lib —
 *        é o que denuncia um `npm update` sem regeneração)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGEM = path.join(raiz, "node_modules/react-advanced-odontogram/dist/style.css");
const DESTINO = path.join(raiz, "src/features/health/odontograma-escopado.css");
const ESCOPO = ".odontograma-escopo";

/** Regras dentro destas at-rules não têm seletor de elemento. */
const SEM_SELETOR = /^(-\w+-)?keyframes$/i;

function escopar(seletor) {
  const p = seletor.trim();
  if (!p) return null;
  // `html`/`body` sozinhos ou combinados só entre si: a regra é sobre o
  // documento, não sobre o componente. Descartada por inteiro.
  if (/^(html|body)(\s*,\s*(html|body))*$/.test(p)) return null;
  if (p === ":root") return ESCOPO;
  // `.dark` é o nosso próprio sinal de tema, no <html>. Ancorar o escopo
  // DEPOIS dele mantém o significado: "quando o app está escuro, dentro
  // do odontograma…".
  if (/^\.dark(\s|$|,)/.test(p)) {
    const resto = p.slice(".dark".length).trim();
    return resto ? `.dark ${ESCOPO} ${resto}` : `.dark ${ESCOPO}`;
  }
  return `${ESCOPO} ${p}`;
}

const plugin = {
  postcssPlugin: "escopar-odontograma",
  Once(root) {
    root.walkRules((regra) => {
      const pai = regra.parent;
      if (pai && pai.type === "atrule" && SEM_SELETOR.test(pai.name)) return;
      const novos = regra.selectors.map(escopar).filter(Boolean);
      if (novos.length === 0) regra.remove();
      else regra.selectors = novos;
    });
  },
};

const origem = fs.readFileSync(ORIGEM, "utf8");
const versao = JSON.parse(
  fs.readFileSync(path.join(raiz, "node_modules/react-advanced-odontogram/package.json"), "utf8"),
).version;

const saida = await postcss([plugin]).process(origem, { from: ORIGEM, to: DESTINO });
const cabecalho = `/* GERADO por scripts/escopar_css_odontograma.mjs — NÃO EDITAR À MÃO.
   Origem: react-advanced-odontogram@${versao} dist/style.css
   Todo seletor foi ancorado em \`${ESCOPO}\`; \`:root\`, \`html\` e \`body\`
   deixaram de existir. Motivo completo no cabeçalho do script.
   Ao subir a versão da biblioteca, rodar o script de novo. */\n`;
const conteudo = cabecalho + saida.css + "\n";

if (process.argv.includes("--verificar")) {
  const atual = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, "utf8") : "";
  if (atual !== conteudo) {
    console.error(
      `✗ ${path.relative(raiz, DESTINO)} está desatualizado em relação a react-advanced-odontogram@${versao}.\n` +
        "  Rode: node scripts/escopar_css_odontograma.mjs",
    );
    process.exit(1);
  }
  console.log(`✓ CSS escopado em dia com react-advanced-odontogram@${versao}.`);
} else {
  fs.writeFileSync(DESTINO, conteudo);
  console.log(`✓ ${path.relative(raiz, DESTINO)} gerado de react-advanced-odontogram@${versao}.`);
}

// Conferência do resultado, sempre — o script não confia na própria
// transformação: ele mede a saída. Estes são exatamente os quatro
// vazamentos que motivaram o arquivo existir.
const vazamentos = [];
const conferir = postcss.parse(saida.css);
conferir.walkRules((regra) => {
  const pai = regra.parent;
  if (pai && pai.type === "atrule" && SEM_SELETOR.test(pai.name)) return;
  for (const s of regra.selectors) {
    const p = s.trim();
    if (p.startsWith(":root")) vazamentos.push(`:root sobreviveu → ${p}`);
    if (/^(html|body|select)\b/.test(p)) vazamentos.push(`seletor de elemento nu → ${p}`);
    if (/^\.dark\s*$/.test(p)) vazamentos.push(`.dark de topo sobreviveu → ${p}`);
    if (!p.includes(ESCOPO)) vazamentos.push(`sem escopo → ${p}`);
  }
});
if (vazamentos.length) {
  console.error("✗ vazamentos encontrados na saída:");
  for (const v of vazamentos.slice(0, 20)) console.error("   " + v);
  process.exit(1);
}
console.log(`✓ conferido: ${conferir.nodes.length} nós de topo, zero seletor fora de ${ESCOPO}.`);
