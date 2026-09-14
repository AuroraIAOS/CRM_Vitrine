#!/usr/bin/env node
/**
 * Evidência ponta a ponta do odontograma autoral (Subetapa 03.7.a).
 *
 * Reescrita da evidência da 03.7, e a regra da reescrita foi: **manter o
 * CICLO CLÍNICO que ela já exercitava, trocar só as asserções que mediam a
 * biblioteca.** O ciclo — abrir sessão → marcar → salvar → conferir no banco →
 * recarregar e as marcações voltarem → abrir outro paciente e a boca estar
 * limpa — é exatamente o que a versão autoral tem de provar, e é onde a
 * Subetapa 02.9 já aprendeu que os defeitos aparecem. Evidência que para na
 * primeira tela verde não encontra esta classe de defeito.
 *
 * ============================================================
 * A ASSERÇÃO QUE NÃO PODE SE PERDER
 * ============================================================
 * A suíte da 03.7 ficou **27/27 verde com a arcada em 0px de largura** — a
 * peça central da tela invisível — porque todas as asserções olhavam a lista
 * lateral do prontuário, que é dado NOSSO e estava inteiramente correto.
 * "O dado foi gravado" não é o mesmo que "a tela funciona". A asserção de
 * LARGURA DA ARCADA e a de CONTAGEM DE DENTES NO DOM ficam, com alvo novo
 * (`.od-arcada` e `.od-posicao`), e a pergunta que elas respondem é: se o
 * desenho sumisse da tela agora, qual destas asserções ficaria vermelha?
 *
 * ============================================================
 * O QUE SAIU, E POR QUÊ
 * ============================================================
 * · As três asserções de tradução `pt-br` e a do resíduo "Odontogram": mediam
 *   as 907 chaves de tradução da biblioteca. O componente autoral nasce em
 *   português e não tem dicionário.
 * · As duas de governança (barra do aplicativo de demonstração escondida,
 *   nenhum botão de exportação exposto): a moldura que elas vigiavam era da
 *   biblioteca. Sem ela, não há o que esconder — e a exportação de prontuário
 *   com token e segunda prova de identidade continua sendo a Subetapa 03.13.
 * · As de token de tema (`--accent`/`--card`/`--muted`) FICAM, e mudaram de
 *   alvo: elas vigiavam CSS de terceiro entrando na cascata global; agora
 *   vigiam o nosso próprio `odontograma.css`, que declara `--od-*` e não pode
 *   tocar nos tokens do design system. O modo de falha é o mesmo.
 *
 * ============================================================
 * O QUE ENTROU
 * ============================================================
 * · CLIQUE POR FACE devolvendo dente + região — o motivo de esta subetapa
 *   existir. `react-advanced-odontogram` só resolvia clique no dente.
 * · A separação ACHADO × TRABALHO provada pela UI real (achado A2): marcar
 *   cárie na oclusal e planejar restauração em mesial+distal+oclusal tem de
 *   gravar DUAS listas de faces diferentes.
 * · `executado` com DATA e AUTOR (achado A4, restrição 2), gravado pela tela.
 * · As 52 posições, incluindo as 20 decíduas (achado A3).
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

/**
 * DOIS CLIENTES SEM SESSÃO ABERTA — e a escolha não é detalhe.
 *
 * A versão da 03.7 pegava os dois PRIMEIROS clientes da conta. Medido nesta
 * subetapa: dos 10 clientes da conta de demonstração, **5 têm evolução aberta**
 * — resíduo de execuções de evidência de subetapas anteriores —, e os dois
 * primeiros estavam entre eles. O efeito foi silencioso e errado nos dois
 * sentidos: "Abrir sessão" não aparecia (já havia uma aberta), então a
 * evidência **escrevia dentro da sessão de outra pessoa**; e a limpeza por
 * diferença de conjunto, que existe justamente para não apagar linha alheia,
 * classificava essa linha como pré-existente e a deixava lá — com o dado de
 * teste dentro.
 *
 * A lição de `handoffs/instrucoes.md` §5 sobre resíduo de fixture cobria
 * APAGAR o que não é seu. Este caso é o simétrico: **ESCREVER no que não é
 * seu.** Limpeza por diferença de conjunto não protege contra ele, porque o
 * dano acontece antes de a limpeza começar a pensar.
 */
const { data: candidatos } = await db
  .schema("aba_people")
  .from("clientes")
  .select("id")
  .eq("account_id", perfil.account_id);
const { data: abertas } = await db
  .schema("aba_health")
  .from("evolucoes")
  .select("cliente_id")
  .eq("travada", false);
const comSessaoAberta = new Set((abertas ?? []).map((e) => e.cliente_id));
const clientes = (candidatos ?? []).filter((c) => !comSessaoAberta.has(c.id)).slice(0, 2);
if (clientes.length < 2) {
  console.error(
    "A evidência exige DOIS clientes SEM sessão aberta na conta de demonstração.\n" +
      `  Clientes na conta: ${(candidatos ?? []).length}; com sessão aberta: ${comSessaoAberta.size}.\n` +
      "  Ela abre a própria sessão e apaga só o que criou — escrever numa sessão\n" +
      "  pré-existente contaminaria dado que não é dela.",
  );
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

/** Toda requisição de JS/CSS, para provar QUANDO o chunk do odontograma viaja. */
const pedidos = [];
pagina.on("request", (r) => {
  const u = r.url();
  // `.tsx`/`.ts` entram porque em desenvolvimento o Vite serve módulo a
  // módulo, sem empacotar: o chunk que em produção é
  // `assets/OdontogramaClinico-<hash>.js` aqui chega como
  // `/src/features/health/OdontogramaClinico.tsx?t=…`. Filtrar só por
  // `.js` faria a sonda concluir que o módulo nunca foi buscado — e a
  // conclusão errada seria a TRANQUILIZADORA, que é a pior das duas.
  if (/\.(js|css|tsx|ts|svg)(\?|$)/.test(u)) pedidos.push(u);
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

// Tokens do app ANTES de o CSS do odontograma existir na página.
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

const clicarPorTexto = (texto) =>
  pagina.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === t);
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }, texto);

console.log("\n2) escolhendo a aba Odontograma");
pedidos.length = 0;
afirmar("botão 'Odontograma' encontrado e clicado", await clicarPorTexto("Odontograma"));
await esperar(4000);
afirmar(
  "o chunk do odontograma viaja SÓ AGORA",
  pedidos.some((u) => /OdontogramaClinico/.test(u)),
  pedidos.filter((u) => /Odontograma/.test(u)).map((u) => u.split("/").pop()).join(", "),
);

/**
 * A ARCADA ESTÁ DE FATO DESENHADA, E COM LARGURA — a asserção herdada.
 *
 * Nasceu de um defeito real da 03.7: um ajuste de grade deixou a arcada com
 * **0px de largura**, completamente invisível, e a suíte continuou 27/27 verde
 * porque todas as outras medições olhavam a lista lateral do prontuário. Ela
 * troca de alvo (`.od-arcada` / `.od-posicao`) e NÃO troca de propósito.
 */
const arcada = await pagina.evaluate(() => {
  const a = document.querySelector(".od-arcada");
  return {
    largura: a ? Math.round(a.getBoundingClientRect().width) : 0,
    posicoes: document.querySelectorAll(".od-posicao").length,
    decíduas: document.querySelectorAll('.od-linha[data-linha^="decidua"] .od-posicao').length,
    svgs: document.querySelectorAll(".od-desenho svg").length,
    faces: document.querySelectorAll(".od-desenho [data-face]").length,
    raizes: document.querySelectorAll('.od-desenho [data-regiao="raiz"]').length,
    espelhados: document.querySelectorAll('.od-posicao[data-espelhado="sim"]').length,
  };
});
afirmar("o container do odontograma está no DOM", (await pagina.$(".odontograma")) !== null);
afirmar("a arcada tem largura de verdade (não colapsou na grade)", arcada.largura > 600, `${arcada.largura}px`);
afirmar("as 52 posições estão desenhadas", arcada.posicoes === 52, `${arcada.posicoes} posições`);
afirmar("as 20 posições decíduas existem (dentição mista, achado A3)", arcada.decíduas === 20, `${arcada.decíduas}`);
afirmar("todo desenho virou <svg> de verdade", arcada.svgs === 52, `${arcada.svgs} svg`);
afirmar("5 faces nomeadas por posição — 260 no total", arcada.faces === 260, `${arcada.faces} faces`);
afirmar("toda posição tem pelo menos uma raiz endereçável", arcada.raizes >= 52, `${arcada.raizes} raízes`);
afirmar(
  "os quadrantes 2, 3, 6 e 7 saem espelhados (mesial em direção à linha média)",
  arcada.espelhados === 26,
  `${arcada.espelhados} espelhados`,
);

/**
 * AS QUATRO LINHAS CABEM NA AREA VISIVEL — e nao so no DOM.
 *
 * Esta asserção nasceu de um defeito real desta subetapa, achado por captura
 * de tela depois de 47/48 verdes: as 52 posições estavam no DOM, a arcada
 * tinha 1.104px de largura, e a linha PERMANENTE INFERIOR caia abaixo da dobra
 * do painel rolavel. Contagem no DOM e largura da arcada nao pegam isso.
 * E o mesmo modo de falha da 03.7 (27/27 verde com a arcada em 0px) num eixo
 * diferente: la a peca era invisivel por largura, aqui por altura.
 */
const dobra = await pagina.evaluate(() => {
  const caixa = document.querySelector(".od-arcada").closest("div[class*=overflow]") ?? document.body;
  const limite = caixa.getBoundingClientRect().bottom;
  const linhas = [...document.querySelectorAll(".od-linha")].map((l) => ({
    linha: l.dataset.linha,
    fim: Math.round(l.getBoundingClientRect().bottom),
  }));
  return { limite: Math.round(limite), linhas };
});
afirmar(
  "as QUATRO linhas cabem na area visivel — nenhuma arcada abaixo da dobra",
  dobra.linhas.length === 4 && dobra.linhas.every((l) => l.fim <= dobra.limite + 1),
  dobra.linhas.map((l) => `${l.linha}=${l.fim}`).join(" ") + ` | limite=${dobra.limite}`,
);

console.log("\n3) o CSS do odontograma não vazou para o app");
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

console.log("\n4) nada de clínico em localStorage");
const armazenado = await pagina.evaluate(() => {
  const chaves = [];
  for (let i = 0; i < localStorage.length; i++) chaves.push(localStorage.key(i));
  return chaves;
});
afirmar(
  "nenhuma chave de odontograma em localStorage",
  !armazenado.some((k) => /odontogram|dente/i.test(k)),
  `chaves: ${armazenado.join(", ") || "(nenhuma)"}`,
);

// ============================================================
// 5) CICLO CLÍNICO — abrir, clicar NA FACE, marcar, salvar, recarregar
// ============================================================
console.log("\n5) ciclo clínico: abrir sessão → clicar na face → marcar → salvar");
afirmar("sessão aberta pela UI", await clicarPorTexto("Abrir sessão"));
await esperar(2500);

/** Clica numa região nomeada de um dente — sem coordenada, sem mapa de pixels. */
const clicarRegiao = (fdi, seletor) =>
  pagina.evaluate(
    (f, s) => {
      const el = document.querySelector(`[data-dente="${f}"] ${s}`);
      if (!el) return false;
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return true;
    },
    fdi,
    seletor,
  );

afirmar("clique na FACE oclusal do dente 16", await clicarRegiao("16", '[data-face="oclusal"]'));
await esperar(600);

/**
 * O CLIQUE RESOLVEU DENTE **E** FACE — o motivo de esta subetapa existir.
 *
 * `react-advanced-odontogram` resolvia só o dente (`onToothClick(toothNo)`), e
 * a face vinha de uma grade de caixas de seleção num painel lateral. Aqui o
 * alvo do evento carrega `data-face`, e o pop-up abre já sabendo os dois.
 */
const aposClique = await pagina.evaluate(() => {
  const p = document.querySelector(".od-popup");
  return {
    aberto: !!p,
    dente: p?.dataset.denteAberto ?? null,
    facesAtivas: [...document.querySelectorAll('.od-popup [data-face-chip][data-ativo="sim"]')].map(
      (b) => b.dataset.faceChip,
    ),
    marcadaNoDesenho: !!document.querySelector('[data-dente="16"] [data-face="oclusal"][data-alvo="sim"]'),
  };
});
afirmar("o pop-up por dente abriu", aposClique.aberto);
afirmar("o pop-up sabe QUAL dente", aposClique.dente === "16", `dente=${aposClique.dente}`);
afirmar(
  "o clique resolveu a FACE sozinho, sem painel lateral",
  aposClique.facesAtivas.length === 1 && aposClique.facesAtivas[0] === "oclusal",
  `faces ativas: ${aposClique.facesAtivas.join(", ") || "(nenhuma)"}`,
);
afirmar("a face clicada aparece selecionada no próprio desenho", aposClique.marcadaNoDesenho);

await pagina.screenshot({ path: path.join(DESTINO, "17_odontograma.png"), type: "png" });

// -------- achado na oclusal (onde há doença) --------
console.log("\n6) achado × trabalho: as duas faces são diferentes de propósito (achado A2)");
await pagina.evaluate(() => document.querySelector('.od-popup [data-acao="acrescentar-achado"]')?.click());
await esperar(500);

// -------- trabalho em mesial + distal + oclusal (onde vai haver trabalho) --------
for (const face of ["mesial", "distal"]) {
  await pagina.evaluate((f) => document.querySelector(`.od-popup [data-face-chip="${f}"]`)?.click(), face);
  await esperar(200);
}
await pagina.evaluate(() => {
  const i = document.querySelector('.od-popup [data-campo="descricao-trabalho"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(i, "restauração MOD");
  i.dispatchEvent(new Event("input", { bubbles: true }));
});
await esperar(300);
await pagina.evaluate(() => document.querySelector('.od-popup [data-acao="propor-trabalho"]')?.click());
await esperar(600);

/**
 * A contagem exclui o pop-up — e ela ja mentiu por isso.
 *
 * A primeira execucao desta evidencia deu "antes 2, depois 1" e parecia perda
 * de marcacao. Nao era: o cabecalho do pop-up tambem renderiza `Dente 16`, e o
 * pop-up estava ABERTO na primeira contagem e fechado depois do recarregamento.
 * A asserção media a minha propria janela. `:not(.od-popup *)` fecha isso, e o
 * que se conta passa a ser so a lista lateral do prontuario.
 */
const contarNaLista = () =>
  pagina.evaluate(
    () =>
      [...document.querySelectorAll("span:not(.od-popup span)")].filter((s) =>
        /^Dente \d\d$/.test(s.textContent.trim()),
      ).length,
  );
const marcacoesNaTela = await contarNaLista();
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
const dente16 = arr.find((m) => m?.regiao === "16");

afirmar("a evolução gravou mapa_tipo = odontograma", linha?.mapa_tipo === "odontograma");
afirmar("o CHECK da migration 025 continua satisfeito: marcacoes é ARRAY", Array.isArray(linha?.marcacoes));
afirmar("o registro do dente 16 foi gravado", !!dente16, `${arr.length} item(ns) no array`);
afirmar(
  "NENHUM item sentinela `estado_nativo` — o envelope da 03.7 não voltou",
  !arr.some((m) => m?.regiao === "estado_nativo"),
);
afirmar(
  "a FACE DO TRABALHO é o que `faces` carrega (é o que a 03.8 orça)",
  JSON.stringify(dente16?.faces) === JSON.stringify(["mesial", "distal", "oclusal"]),
  JSON.stringify(dente16?.faces),
);
afirmar(
  "a FACE DO ACHADO é outra lista, e é MENOR — o defeito A2 não pode voltar",
  JSON.stringify(dente16?.achados?.[0]?.faces) === JSON.stringify(["oclusal"]),
  JSON.stringify(dente16?.achados?.[0]?.faces),
);
afirmar(
  "as duas listas de face são de fato diferentes neste caso",
  JSON.stringify(dente16?.faces) !== JSON.stringify(dente16?.achados?.[0]?.faces),
);
afirmar(
  "o trabalho nasce `proposto` — rascunho, e é o único estado que se apaga",
  dente16?.trabalhos?.[0]?.estado === "proposto",
  dente16?.trabalhos?.[0]?.estado,
);

// -------- `executado` é fato afirmado, com data e autor --------
console.log("\n7) `executado` deixa de ser inferência: data e autor gravados (achado A4, restrição 2)");
await clicarRegiao("16", '[data-face="oclusal"]');
await esperar(600);
await pagina.evaluate(() => {
  const s = document.querySelector('.od-popup [data-campo="estado-trabalho"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
  setter.call(s, "executado");
  s.dispatchEvent(new Event("change", { bubbles: true }));
});
await esperar(600);
afirmar("rascunho salvo com o trabalho executado", await clicarPorTexto("Salvar rascunho"));
await esperar(3000);

const { data: gravadas2 } = await db
  .schema("aba_health")
  .from("evolucoes")
  .select("marcacoes")
  .eq("id", linha.id)
  .single();
const executado = (Array.isArray(gravadas2?.marcacoes) ? gravadas2.marcacoes : [])
  .find((m) => m?.regiao === "16")
  ?.trabalhos?.find((t) => t.estado === "executado");
afirmar("o trabalho ficou `executado`", !!executado);
afirmar(
  "`executado` carrega DATA — a trava de finalização da 03.8.a lê daqui",
  !!executado?.executadoEm && !Number.isNaN(Date.parse(executado.executadoEm)),
  executado?.executadoEm ?? "(ausente)",
);
afirmar(
  "`executado` carrega AUTOR — inferência entre sessões não tem a quem responsabilizar",
  typeof executado?.executadoPor === "string" && executado.executadoPor.length > 0,
  executado?.executadoPor ?? "(ausente)",
);

console.log("\n8) a marcação reaparece depois de recarregar a página");
await pagina.goto(`${BASE}/prontuario/${clienteA.id}`, { waitUntil: "networkidle2" });
await esperar(2500);
await clicarPorTexto("Odontograma");
await esperar(3500);
const depoisDeRecarregar = await contarNaLista();
afirmar(
  "as marcações voltaram sem o profissional refazer nada",
  depoisDeRecarregar > 0 && depoisDeRecarregar === marcacoesNaTela,
  `antes ${marcacoesNaTela}, depois ${depoisDeRecarregar}`,
);
const pintado = await pagina.evaluate(
  () => document.querySelectorAll('[data-dente="16"] [data-marcado]').length,
);
afirmar("e o DESENHO voltou pintado, não só a lista lateral", pintado >= 3, `${pintado} faces marcadas no dente 16`);
await pagina.screenshot({ path: path.join(DESTINO, "18_odontograma_persistido.png"), type: "png" });

console.log("\n9) trocar de paciente NÃO carrega a boca do anterior");
await pagina.goto(`${BASE}/prontuario/${clienteB.id}`, { waitUntil: "networkidle2" });
await esperar(2500);
await clicarPorTexto("Odontograma");
await esperar(3500);
const noOutroPaciente = {
  lista: await contarNaLista(),
  pintados: await pagina.evaluate(() => document.querySelectorAll(".od-desenho [data-marcado]").length),
};
// Na 03.7 este era o teste do singleton de módulo da biblioteca. Aqui não há
// estado de módulo nenhum — mas a asserção fica, porque quem garante isso hoje
// é uma decisão de desenho, e decisão de desenho se desfaz sem avisar.
afirmar(
  "o odontograma do paciente B está limpo na lista",
  noOutroPaciente.lista === 0,
  `${noOutroPaciente.lista} marcações — deveria ser 0`,
);
afirmar(
  "e limpo TAMBÉM no desenho (nenhuma face herdada do paciente A)",
  noOutroPaciente.pintados === 0,
  `${noOutroPaciente.pintados} faces marcadas — deveria ser 0`,
);

// ============================================================
// 10) a faixa unificada não quebrou as outras sete abas
// ============================================================
console.log("\n10) as oito abas do bloco unificado respondem");
await pagina.goto(`${BASE}/prontuario/${clienteA.id}`, { waitUntil: "networkidle2" });
await esperar(2500);
for (const [rotulo, esperado, precisaDeSvg] of [
  ["Anamnese", "Queixa principal", false],
  ["Evoluções", "Evolu", false],
  ["Anexos", "Anexo", false],
  ["Consentimentos", "Consentimento", false],
  ["Mapa facial", "achado ativo", true],
  ["Mapa corporal", "área tratada na sessão", true],
  ["Acupuntura", "ponto agulhado", true],
  ["Odontograma", "52 posições", false],
]) {
  const ok = await clicarPorTexto(rotulo);
  // Espera por SINAL, nao por relogio, no unico conteudo que chega por rede:
  // o odontograma e chunk preguicoso, e um `sleep` fixo aqui transforma
  // latencia em falha vermelha sem defeito nenhum atras dela.
  if (rotulo === "Odontograma") {
    await pagina.waitForSelector(".od-arcada", { timeout: 20_000 }).catch(() => {});
  } else {
    await esperar(1200);
  }
  // COMPARACAO SEM CAIXA, e o motivo foi medido aqui: `innerText` devolve o
  // texto RENDERIZADO, entao um rotulo com `text-transform: uppercase` chega
  // em maiuscula e um `includes()` literal fica vermelho sem defeito nenhum
  // atras dele. Foi o que aconteceu com "52 posicoes", que o cabecalho do
  // odontograma desenha em versalete. E a mesma familia da armadilha ja
  // registrada nesta suite (procurar texto que nao e no de texto de verdade):
  // o que se afirma tem de ser o que a tela DIZ, nao como ela o pinta.
  const achou = await pagina.evaluate(
    (t) => document.body.innerText.toLocaleLowerCase("pt-BR").includes(t.toLocaleLowerCase("pt-BR")),
    esperado,
  );
  const trecho = achou
    ? ""
    : await pagina.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 220));
  const desenhou = precisaDeSvg
    ? await pagina.evaluate(() => {
        const s = document.querySelector('main svg[role="img"]');
        return !!s && s.getBoundingClientRect().height > 100;
      })
    : true;
  afirmar(
    `aba "${rotulo}" abre e mostra o conteúdo dela`,
    ok && achou && desenhou,
    `procurado: "${esperado}"${precisaDeSvg ? " + svg do mapa" : ""}${trecho ? ` | tela: ${trecho}` : ""}`,
  );
}

console.log("\n11) erros de página");
afirmar("nenhum erro de JavaScript não tratado", erros.length === 0, erros.slice(0, 2).join(" | "));

await browser.close();
await limpar();

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} verdes.`);
if (falhas.length) {
  console.log("falhas: " + falhas.map((f) => f.nome).join("; "));
  process.exit(1);
}
