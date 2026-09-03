#!/usr/bin/env node
/**
 * Evidência ponta a ponta do odontograma (Subetapa 03.7).
 *
 * Repete o caminho de `capturar_telas.mjs` — link de acesso pela API de
 * administração, `puppeteer-core` com o Chrome local, nenhuma senha no
 * script — e exercita o CICLO CLÍNICO COMPLETO, que é onde a Subetapa
 * 02.9 já aprendeu que os defeitos aparecem: abrir → marcar → salvar →
 * recarregar → trocar de paciente. Evidência que para na primeira tela
 * verde não encontra esta classe de defeito.
 *
 * O que ele PROVA, em vez de só ilustrar:
 *   1. o chunk do odontograma NÃO é buscado ao abrir o prontuário — só
 *      quando a aba Odontograma é escolhida (restrição 1 da Qualidade);
 *   2. o CSS da biblioteca NÃO altera os tokens do app (`--accent`,
 *      `--card`, `--muted`) nem o `<select>` fora do container;
 *   3. nada de clínico vai para `localStorage`;
 *   4. a marcação persiste e REAPARECE depois de recarregar a página;
 *   5. trocar de paciente NÃO carrega a boca do paciente anterior.
 *
 * PRÉ-REQUISITO: app em http://localhost:3000
 *   cd crm && npm run dev -- --port 3000 --strictPort
 */
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "../..");
const DESTINO = path.join(RAIZ, "screenshots");
const BASE = "http://localhost:3000";
const EMAIL_DEMO = "proprietaria@vitrinedemo.local";

const NAVEGADORES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

function lerEnv(arquivo) {
  const vars = {};
  for (const linha of readFileSync(arquivo, "utf-8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim().replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1");
  }
  return vars;
}

const env = lerEnv(path.join(RAIZ, ".env"));
const navegador = NAVEGADORES.find((p) => existsSync(p));
if (!navegador) {
  console.error("Nenhum navegador Chromium encontrado.");
  process.exit(1);
}

const db = createClient(env.SUPABASE__URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: perfil, error: erroPerfil } = await db
  .from("profiles")
  .select("account_id")
  .eq("email", EMAIL_DEMO)
  .single();
if (erroPerfil) {
  console.error(`Conta de demonstração não encontrada: ${erroPerfil.message}`);
  process.exit(1);
}

const { data: clientes } = await db
  .schema("aba_people")
  .from("clientes")
  .select("id")
  .eq("account_id", perfil.account_id)
  .limit(2);
if (!clientes || clientes.length < 2) {
  console.error("A evidência exige DOIS clientes na conta de demonstração (o teste de troca de paciente).");
  process.exit(1);
}
const [clienteA, clienteB] = clientes;

try {
  const r = await fetch(BASE, { method: "HEAD" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch {
  console.error(`App não responde em ${BASE}.  cd crm && npm run dev -- --port 3000 --strictPort`);
  process.exit(1);
}

mkdirSync(DESTINO, { recursive: true });

/**
 * ESTA EVIDÊNCIA ESCREVE NUMA CONTA DE DEMONSTRAÇÃO PÚBLICA, e por isso
 * anota o que existia ANTES para apagar exatamente o que criou.
 * `handoffs/instrucoes.md` §5 registra duas vezes o custo de não fazer
 * isso — resíduo de teste que quebra fixture de outra subetapa, e a
 * suíte que rodava dentro do banco de produção. A limpeza é por
 * diferença de conjunto, nunca por "apagar o mais recente": o mais
 * recente pode ser de um profissional de verdade usando a demonstração
 * no mesmo minuto.
 */
const { data: antesDaEvidencia } = await db
  .schema("aba_health")
  .from("evolucoes")
  .select("id")
  .in("cliente_id", [clienteA.id, clienteB.id]);
const idsPreexistentes = new Set((antesDaEvidencia ?? []).map((e) => e.id));

async function limpar() {
  const { data: agora } = await db
    .schema("aba_health")
    .from("evolucoes")
    .select("id")
    .in("cliente_id", [clienteA.id, clienteB.id]);
  const novas = (agora ?? []).map((e) => e.id).filter((id) => !idsPreexistentes.has(id));
  if (novas.length === 0) {
    console.log("\nlimpeza: nada a remover.");
    return;
  }
  const { error } = await db.schema("aba_health").from("evolucoes").delete().in("id", novas);
  console.log(
    error
      ? `\n✗ LIMPEZA FALHOU (${novas.length} evoluções ficaram): ${error.message}`
      : `\nlimpeza: ${novas.length} evolução(ões) de teste removida(s).`,
  );
}

const browser = await puppeteer.launch({
  executablePath: navegador,
  headless: "new",
  defaultViewport: { width: 1680, height: 1050 },
});
const pagina = await browser.newPage();
pagina.setDefaultNavigationTimeout(60_000);

/** Toda requisição de JS/CSS, para provar QUANDO o chunk pesado viaja. */
const pedidos = [];
pagina.on("request", (r) => {
  const u = r.url();
  // `.tsx`/`.ts` entram porque em desenvolvimento o Vite serve módulo a
  // módulo, sem empacotar: o chunk que em produção é
  // `assets/OdontogramaClinico-<hash>.js` aqui chega como
  // `/src/features/health/OdontogramaClinico.tsx?t=…`. Filtrar só por
  // `.js` faria a sonda concluir que o módulo nunca foi buscado — e a
  // conclusão errada seria a TRANQUILIZADORA, que é a pior das duas.
  if (/\.(js|css|tsx|ts)(\?|$)/.test(u)) pedidos.push(u);
});

const erros = [];
pagina.on("pageerror", (e) => erros.push(String(e)));

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const resultados = [];
function afirmar(nome, ok, detalhe = "") {
  resultados.push({ nome, ok, detalhe });
  console.log(`  ${ok ? "✓" : "✗"} ${nome}${detalhe ? `  — ${detalhe}` : ""}`);
}

// ---------------------------------------------------------------- login
const { data: link, error: erroLink } = await db.auth.admin.generateLink({
  type: "magiclink",
  email: EMAIL_DEMO,
  options: { redirectTo: BASE },
});
if (erroLink) {
  console.error(`falha ao gerar link: ${erroLink.message}`);
  await browser.close();
  process.exit(1);
}
await pagina.goto(link.properties.action_link, { waitUntil: "networkidle2" });
await esperar(3000);

// Tokens do app ANTES de o CSS da biblioteca existir na página.
const tokensAntes = await pagina.evaluate(() => {
  const s = getComputedStyle(document.documentElement);
  return {
    accent: s.getPropertyValue("--accent").trim(),
    card: s.getPropertyValue("--card").trim(),
    muted: s.getPropertyValue("--muted").trim(),
  };
});

console.log("\n1) prontuário aberto, aba Odontograma AINDA não escolhida");
pedidos.length = 0;
await pagina.goto(`${BASE}/prontuario/${clienteA.id}`, { waitUntil: "networkidle2" });
await esperar(2500);
afirmar(
  "o chunk do odontograma NÃO viaja ao abrir o prontuário",
  !pedidos.some((u) => /OdontogramaClinico/.test(u)),
  `${pedidos.length} arquivos pedidos`,
);

console.log("\n2) escolhendo a aba Odontograma");
pedidos.length = 0;
const clicou = await pagina.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Odontograma");
  if (!b) return false;
  b.click();
  return true;
});
afirmar("botão 'Odontograma' encontrado e clicado", clicou);
await esperar(5000);
afirmar(
  "o chunk do odontograma viaja SÓ AGORA",
  pedidos.some((u) => /OdontogramaClinico/.test(u)),
  pedidos.filter((u) => /Odontograma/.test(u)).map((u) => u.split("/").pop()).join(", "),
);

const montado = await pagina.evaluate(() => {
  const escopo = document.querySelector(".odontograma-escopo");
  return {
    escopo: !!escopo,
    dentes: document.querySelectorAll(".odontograma-escopo .tooth-tile, .odontograma-escopo [data-tooth]").length,
    texto: (document.querySelector(".odontograma-escopo")?.textContent ?? "").slice(0, 4000),
  };
});
afirmar("container escopado presente no DOM", montado.escopo);

/**
 * A ARCADA ESTÁ DE FATO DESENHADA, E COM LARGURA.
 *
 * Esta asserção nasceu de um defeito real desta subetapa: um ajuste de
 * grade deixou `.chart-column` com **0px de largura** — a arcada
 * completamente invisível — e a suíte continuou 27/27 verde, porque
 * todas as outras medições olhavam a lista lateral do prontuário, que é
 * dado nosso e estava certo. "Marcação gravada" não é o mesmo que
 * "odontograma visível", e só medindo o desenho os dois se separam.
 */
const arcada = await pagina.evaluate(() => {
  const c = document.querySelector(".odontograma-escopo .chart-column");
  const s = document.querySelector(".odontograma-escopo section.chart");
  return {
    larguraColuna: c ? Math.round(c.getBoundingClientRect().width) : 0,
    dentes: document.querySelectorAll(".odontograma-escopo .tooth-tile").length,
    larguraArcada: s ? Math.round(s.getBoundingClientRect().width) : 0,
  };
});
afirmar(
  "a arcada tem largura de verdade (não colapsou na grade)",
  arcada.larguraColuna > 600,
  `chart-column = ${arcada.larguraColuna}px`,
);
afirmar("os 32 dentes estão desenhados", arcada.dentes >= 32, `${arcada.dentes} dentes no DOM`);

console.log("\n3) tradução pt-BR de fato na tela");
const visiveis = await pagina.evaluate(() => {
  // `textContent` inclui o que está escondido — medir por texto diria que
  // a barra da biblioteca continua lá. O que interessa é o que se VÊ.
  const visivel = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const raiz = document.querySelector(".odontograma-escopo");
  const junta = (el) =>
    [...el.querySelectorAll("*")]
      .filter((e) => visivel(e) && e.children.length === 0)
      .map((e) => e.textContent.trim())
      .filter(Boolean)
      .join(" | ");
  return {
    texto: junta(raiz),
    topbarVisivel: visivel(raiz.querySelector("header.topbar") ?? document.createElement("i")),
    exportacaoVisivel: [...raiz.querySelectorAll('[id^="btnStatus"],[id^="btnPerio"]')].some(visivel),
  };
});
console.log("   [texto visível] " + visiveis.texto.replace(/\s+/g, " ").slice(0, 600));
for (const termo of ["Ficha dentária", "Dentição mista", "Estado periodontal"]) {
  afirmar(`rótulo em português visível: "${termo}"`, visiveis.texto.includes(termo));
}
// Resíduo conhecido e declarado: a biblioteca não expõe via de override
// de tradução, e `view.odontogram` vem "Odontogram" de fábrica. Aferido
// para que ele apareça no relatório em vez de passar despercebido.
afirmar(
  "resíduo declarado: o alternador de visão ainda diz 'Odontogram'",
  visiveis.texto.includes("Odontogram") && !visiveis.texto.includes("| Odontograma |"),
  "sem API de override na biblioteca — registrado no Status",
);

console.log("\n3b) a moldura do aplicativo de demonstração não aparece");
afirmar("barra superior da biblioteca escondida", !visiveis.topbarVisivel);
afirmar(
  "nenhum botão de exportação de prontuário exposto (governança da 03.13)",
  !visiveis.exportacaoVisivel,
);

console.log("\n4) o CSS da biblioteca não vazou para o app");
const tokensDepois = await pagina.evaluate(() => {
  const s = getComputedStyle(document.documentElement);
  return {
    accent: s.getPropertyValue("--accent").trim(),
    card: s.getPropertyValue("--card").trim(),
    muted: s.getPropertyValue("--muted").trim(),
  };
});
for (const t of ["accent", "card", "muted"]) {
  afirmar(
    `token --${t} intacto na raiz do documento`,
    tokensAntes[t] === tokensDepois[t] && /\d/.test(tokensDepois[t]),
    `antes="${tokensAntes[t]}" depois="${tokensDepois[t]}"`,
  );
}
const selectFora = await pagina.evaluate(() => {
  const s = [...document.querySelectorAll("select")].find((e) => !e.closest(".odontograma-escopo"));
  if (!s) return null;
  const cs = getComputedStyle(s);
  return { minWidth: cs.minWidth, appearance: cs.appearance };
});
afirmar(
  "<select> fora do container não foi reestilizado pela biblioteca",
  selectFora === null || selectFora.minWidth !== "220px",
  selectFora ? `min-width=${selectFora.minWidth}` : "nenhum select na tela",
);

console.log("\n5) nada de clínico em localStorage");
const armazenado = await pagina.evaluate(() => {
  const chaves = [];
  for (let i = 0; i < localStorage.length; i++) chaves.push(localStorage.key(i));
  return chaves;
});
afirmar(
  "nenhuma chave de odontograma em localStorage",
  !armazenado.some((k) => /odontogram/i.test(k)),
  `chaves: ${armazenado.join(", ") || "(nenhuma)"}`,
);

await pagina.screenshot({ path: path.join(DESTINO, "17_odontograma.png"), type: "png" });

// ============================================================
// 6) CICLO CLÍNICO COMPLETO — abrir, marcar, salvar, recarregar
// ============================================================
// A lição da Subetapa 02.9: evidência que para na primeira tela verde
// não encontra esta classe de defeito. O ciclo inteiro é o teste.
console.log("\n6) ciclo clínico: abrir sessão → marcar → salvar → recarregar");

const clicarPorTexto = (texto) =>
  pagina.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === t);
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }, texto);

afirmar("sessão aberta pela UI", await clicarPorTexto("Abrir sessão"));
await esperar(3000);

// "Dentição mista" é escolha deliberada de marcação: um clique só, e é
// exatamente o que o Objetivo do item 2 pede que exista (permanente,
// decídua E MISTA). Marcar face a face provaria menos e quebraria mais.
afirmar("dentição mista aplicada no odontograma", await clicarPorTexto("Dentição mista"));
await esperar(2000);

const marcacoesNaTela = await pagina.evaluate(() =>
  [...document.querySelectorAll("span")].filter((s) => /^Dente \d\d$/.test(s.textContent.trim())).length,
);
afirmar("a projeção legível apareceu na lista lateral", marcacoesNaTela > 0, `${marcacoesNaTela} dentes listados`);

afirmar("rascunho salvo", await clicarPorTexto("Salvar rascunho"));
await esperar(3000);

// O que de fato chegou ao banco — lido pelo servidor, não pela tela.
const { data: gravadas } = await db
  .schema("aba_health")
  .from("evolucoes")
  .select("id, mapa_tipo, marcacoes")
  .eq("cliente_id", clienteA.id)
  .eq("travada", false)
  .order("registrado_em", { ascending: false })
  .limit(1);
const linha = gravadas?.[0];
const arr = Array.isArray(linha?.marcacoes) ? linha.marcacoes : [];
const envelope = arr.find((m) => m?.regiao === "estado_nativo");
const dentesGravados = arr.filter((m) => m?.regiao !== "estado_nativo");
afirmar("a evolução gravou mapa_tipo = odontograma", linha?.mapa_tipo === "odontograma");
afirmar("marcações de dente gravadas", dentesGravados.length > 0, `${dentesGravados.length} dentes`);
afirmar("item sentinela com o payload nativo gravado", !!envelope?.payload?.teeth);
afirmar(
  "a poda funcionou: o payload NÃO carrega os 32 dentes",
  envelope && Object.keys(envelope.payload.teeth).length < 32,
  `${envelope ? Object.keys(envelope.payload.teeth).length : "?"} dentes no payload, de 32 possíveis`,
);
afirmar(
  "o CHECK da migration 025 continua satisfeito: marcacoes é ARRAY",
  Array.isArray(linha?.marcacoes),
);

console.log("\n7) a marcação reaparece depois de recarregar a página");
await pagina.goto(`${BASE}/prontuario/${clienteA.id}`, { waitUntil: "networkidle2" });
await esperar(2500);
await pagina.evaluate(() =>
  [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Odontograma")?.click(),
);
await esperar(5000);
const depoisDeRecarregar = await pagina.evaluate(() =>
  [...document.querySelectorAll("span")].filter((s) => /^Dente \d\d$/.test(s.textContent.trim())).length,
);
afirmar(
  "as marcações voltaram sem o profissional refazer nada",
  depoisDeRecarregar > 0 && depoisDeRecarregar === marcacoesNaTela,
  `antes ${marcacoesNaTela}, depois ${depoisDeRecarregar}`,
);
await pagina.screenshot({ path: path.join(DESTINO, "18_odontograma_persistido.png"), type: "png" });

console.log("\n8) trocar de paciente NÃO carrega a boca do anterior");
await pagina.goto(`${BASE}/prontuario/${clienteB.id}`, { waitUntil: "networkidle2" });
await esperar(2500);
await pagina.evaluate(() =>
  [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Odontograma")?.click(),
);
await esperar(5000);
const noOutroPaciente = await pagina.evaluate(() =>
  [...document.querySelectorAll("span")].filter((s) => /^Dente \d\d$/.test(s.textContent.trim())).length,
);
afirmar(
  "o odontograma do paciente B está limpo (singleton de módulo não vazou)",
  noOutroPaciente === 0,
  `${noOutroPaciente} marcações — deveria ser 0`,
);

// ============================================================
// 9) a faixa unificada não quebrou as outras sete abas
// ============================================================
// Guarda contra regressão da reestruturação de 2026-09-03 (decisão de
// Max): os quatro mapas viraram abas do mesmo bloco das quatro abas de
// texto. Uma tela que mostra o odontograma perfeitamente e perdeu a
// anamnese não está pronta — e nada mais nesta suíte olharia para lá.
console.log("\n9) as oito abas do bloco unificado respondem");
await pagina.goto(`${BASE}/prontuario/${clienteA.id}`, { waitUntil: "networkidle2" });
await esperar(2500);
// O texto procurado em cada mapa é um rótulo da LEGENDA, que é nó de
// texto de verdade. O nome das regiões (`Zona T`, `Lombar`) vive em
// `<title>` de SVG e não entra em `innerText` — procurar por ele daria
// vermelho sem haver defeito, que é o pior tipo de teste.
for (const [rotulo, esperado, precisaDeSvg] of [
  ["Anamnese", "Queixa principal", false],
  ["Evoluções", "Evolu", false],
  ["Anexos", "Anexo", false],
  ["Consentimentos", "Consentimento", false],
  ["Mapa facial", "achado ativo", true],
  ["Mapa corporal", "área tratada na sessão", true],
  ["Acupuntura", "ponto agulhado", true],
  ["Odontograma", "Ficha dentária", false],
]) {
  const ok = await clicarPorTexto(rotulo);
  await esperar(rotulo === "Odontograma" ? 4000 : 1200);
  const achou = await pagina.evaluate((t) => document.body.innerText.includes(t), esperado);
  // Legenda visível sem desenho seria uma tela vazia com rodapé certo:
  // nos três mapas esquemáticos, exigir o `<svg>` fecha essa brecha.
  const desenhou = precisaDeSvg
    ? await pagina.evaluate(() => {
        const s = document.querySelector('main svg[role="img"]');
        return !!s && s.getBoundingClientRect().height > 100;
      })
    : true;
  afirmar(
    `aba "${rotulo}" abre e mostra o conteúdo dela`,
    ok && achou && desenhou,
    `procurado: "${esperado}"${precisaDeSvg ? " + svg do mapa" : ""}`,
  );
}

console.log("\n10) erros de página");
afirmar("nenhum erro de JavaScript não tratado", erros.length === 0, erros.slice(0, 2).join(" | "));

await browser.close();
await limpar();

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} verdes.`);
if (falhas.length) {
  console.log("falhas: " + falhas.map((f) => f.nome).join("; "));
  process.exit(1);
}
