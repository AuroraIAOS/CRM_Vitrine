/**
 * Medidor de contraste WCAG 2.x da paleta do CRM Vitrine.
 *
 * Produziu os números de `design/ux/01_DIAGNOSTICO.md` §F03/§F04/§F05 e as cores
 * propostas de `design/ux/02_FUNDACAO_VISUAL.md` §3. Sem dependência nenhuma.
 *
 *   node design/ux/referencias/medir_contraste.mjs           # audita a paleta atual
 *   node design/ux/referencias/medir_contraste.mjs --corrigir # propõe substitutos que passam
 *
 * Serve como teste permanente: cor nova na paleta passa por aqui antes de entrar
 * em `crm/src/index.css`.
 *
 * Fórmula: WCAG 2.2, Understanding SC 1.4.3 (luminância relativa) e SC 1.4.11.
 * https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
 */

const AA_TEXTO = 4.5; // texto normal (< 18,66px, ou < 14px em negrito)
const AA_GRANDE = 3.0; // texto grande
const AA_COMPONENTE = 3.0; // SC 1.4.11 — borda de campo, ícone informativo, anel de foco

// ---------- conversão de cor ----------
const canalLinear = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const hexParaRgb = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const rgbParaHex = ([r, g, b]) =>
  "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

const luminancia = ([r, g, b]) =>
  0.2126 * canalLinear(r) + 0.7152 * canalLinear(g) + 0.0722 * canalLinear(b);

/** Razão de contraste entre duas cores, aceitando hex ou [r,g,b]. */
export function contraste(a, b) {
  const rgb = (c) => (typeof c === "string" ? hexParaRgb(c) : c);
  const [claro, escuro] = [luminancia(rgb(a)), luminancia(rgb(b))].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

// ---------- HSL, para escurecer preservando o matiz ----------
function rgbParaHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslParaRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const f = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
}

/**
 * Escurece a cor mantendo matiz e saturação até que ela passe no `alvo` contra
 * TODOS os fundos informados. Devolve null se nem o preto puro resolver.
 */
export function ajustarParaPassar(hex, fundos, alvo) {
  const [h, s, lInicial] = rgbParaHsl(hexParaRgb(hex));
  for (let l = lInicial; l >= 0; l -= 0.002) {
    const candidato = hslParaRgb([h, s, l]);
    // testa o hex ARREDONDADO, não o float — é o valor que vai para o CSS
    const arredondado = hexParaRgb(rgbParaHex(candidato));
    if (fundos.every((f) => contraste(arredondado, f) >= alvo)) return rgbParaHex(candidato);
  }
  return null;
}

// ---------- a paleta em auditoria ----------
// Papel, cor, fundos em que a cor é DE FATO usada, e o mínimo exigível.
// Fonte das cores: docs/04_DESIGN_E_MARCA.md §5.2 / crm/src/index.css
const PALETA = [
  ["Texto primário",            "#26313a", ["#ffffff", "#f4f6f7"], AA_TEXTO],
  ["Texto secundário",          "#41535f", ["#ffffff"],            AA_TEXTO],
  ["Texto muted A",             "#7c8b95", ["#ffffff", "#f4f6f7"], AA_TEXTO],
  ["Texto muted B",             "#8b98a2", ["#ffffff", "#f4f6f7"], AA_TEXTO],
  ["Eyebrow mono / faint",      "#9aa8b1", ["#ffffff", "#f4f6f7"], AA_TEXTO],
  ["Placeholder",               "#a8b6bf", ["#ffffff"],            AA_TEXTO],
  ["Accent botão/link",         "#3d7396", ["#ffffff"],            AA_TEXTO],
  ["Branco sobre accent",       "#ffffff", ["#3d7396"],            AA_TEXTO],
  ["Accent sobre tint",         "#2b5f80", ["#e8eff4"],            AA_TEXTO],
  ["Badge sucesso (texto)",     "#4d7c69", ["#eef4f1"],            AA_TEXTO],
  ["Badge atenção (texto)",     "#8a7550", ["#faf6ef"],            AA_TEXTO],
  ["Badge perigo (texto)",      "#9c6b5e", ["#f8f0ee"],            AA_TEXTO],
  ["Borda de INPUT (1.4.11)",   "#dde4e8", ["#ffffff"],            AA_COMPONENTE],
  ["Série 1 de gráfico",        "#5b87a8", ["#ffffff"],            AA_COMPONENTE],
];

// Isentos por serem decoração, não componente (ver 02_FUNDACAO_VISUAL.md §4):
// #e4eaee (borda de card), #eef2f4 (hairline de tabela).

function auditar() {
  let reprovados = 0;
  console.log("PAPEL                        COR        FUNDO      RAZÃO      VEREDITO");
  console.log("-".repeat(78));
  for (const [papel, cor, fundos, alvo] of PALETA) {
    for (const fundo of fundos) {
      const r = contraste(cor, fundo);
      const ok = r >= alvo;
      if (!ok) reprovados++;
      const nota = ok
        ? r >= 7 ? "AAA" : "AA"
        : r >= AA_GRANDE ? `REPROVA (passa só em texto grande)` : "REPROVA";
      console.log(
        `${papel.padEnd(28)} ${cor}    ${fundo}    ${r.toFixed(2).padStart(5)}:1   ${nota}`,
      );
    }
  }
  console.log("-".repeat(78));
  console.log(reprovados === 0 ? "Tudo conforme." : `${reprovados} par(es) reprovando.`);
  return reprovados;
}

function corrigir() {
  // margem de 0,12 acima do alvo para o hex arredondado não cair na fronteira
  const MARGEM = 0.12;
  console.log("PAPEL                        ATUAL      ->  PROPOSTO   CONTRASTE RESULTANTE");
  console.log("-".repeat(78));
  for (const [papel, cor, fundos, alvo] of PALETA) {
    if (fundos.every((f) => contraste(cor, f) >= alvo)) continue;
    const novo = ajustarParaPassar(cor, fundos, alvo + MARGEM);
    const razoes = fundos.map((f) => `${contraste(novo, f).toFixed(2)}:1`).join(" · ");
    console.log(`${papel.padEnd(28)} ${cor}    ->  ${novo}    ${razoes}`);
  }
}

const modo = process.argv[2];
if (modo === "--corrigir") corrigir();
else process.exitCode = auditar() > 0 ? 1 : 0;
