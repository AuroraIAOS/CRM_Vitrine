#!/usr/bin/env node
/**
 * Evidência de TELA da Subetapa 03.8.b — o contrato percorrido por duas
 * pessoas de verdade, no navegador, contra PRODUÇÃO.
 *
 * ============================================================
 * O QUE ESTA EVIDÊNCIA PROVA QUE A DE BANCO NÃO PROVA
 * ============================================================
 * `evidencia_contrato.mjs` prova as regras com as sessões certas. Esta prova
 * o PERCURSO até elas (`instrucoes.md` §5, 03.8.c: "prove o percurso até a
 * porta, não só a resposta dela"):
 *
 *   · a RECEPÇÃO (`recepcao@`, `admin`, sem alcance clínico) abre o paciente,
 *     IMPRIME o orçamento aprovado (E4), contrata a opção, emite o documento,
 *     digita o código do papel e vê o contrato ASSINADO com a trava dupla na
 *     tela — e o "Encerrar" recusado com o motivo;
 *   · o PROFISSIONAL (`terapeuta@`, `agent`, concessão nominal) vê que antes
 *     do contrato não há o que executar, e depois marca as faces executadas —
 *     o passo 36 do caminho feliz — com data e autor aparecendo na célula;
 *   · a recepção VENDE UM PACOTE pelo Financeiro e o que nasce é um contrato
 *     em rascunho, não um saldo (D-F14).
 *
 * O PREPARO é o mínimo, e o plano já aprovado nasce pela SESSÃO do
 * profissional (API), não pelo serviço: montar o plano pela tela foi a
 * evidência da 03.8.c e não se repete aqui.
 *
 * NAVEGADOR: o Edge é aberto pelo próprio script e conectado PELA PORTA
 * (`instrucoes.md` §5: `puppeteer.launch()` com o Edge 153 falha com
 * "Code: 0" porque o processo lançado sai e entrega a sessão a outro).
 *
 * PRÉ-REQUISITO: app em http://localhost:3000 apontando para PRODUÇÃO, com a
 * migration `052` aplicada lá.
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
const EMAIL = {
  profissional: "terapeuta@vitrinedemo.local",
  recepcao: "recepcao@vitrinedemo.local",
  dona: "proprietaria@vitrinedemo.local",
};
const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));

function lerEnv(arquivo) {
  const vars = {};
  for (const linha of readFileSync(arquivo, "utf-8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim().replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1");
  }
  return vars;
}
const env = lerEnv(path.join(RAIZ, ".env"));
const opcoesCliente = { auth: { autoRefreshToken: false, persistSession: false } };
const servico = createClient(env.SUPABASE__URL, env.SUPABASE_SERVICE_ROLE_KEY, opcoesCliente);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

if (!EDGE) {
  console.error("Microsoft Edge não encontrado.");
  process.exit(1);
}
try {
  const r = await fetch(BASE, { method: "HEAD" });
  if (!r.ok) throw new Error();
} catch {
  console.error(`App não responde em ${BASE}.  cd crm && npm run dev -- --port 3000 --strictPort`);
  process.exit(1);
}

const resultados = [];
function afirmar(nome, ok, detalhe = "") {
  resultados.push({ nome, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${nome}${detalhe ? `  — ${detalhe}` : ""}`);
}
function exigir(r, oque) {
  if (r.error) throw new Error(`${oque}: ${r.error.message}`);
  return r.data;
}

async function abrirEdge() {
  const { spawn } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const porta = 9400 + Math.floor(Math.random() * 400);
  const perfil = path.join(tmpdir(), `evidencia-0308b-${Date.now()}`);
  spawn(EDGE, ["--headless", `--remote-debugging-port=${porta}`, `--user-data-dir=${perfil}`,
               "--no-first-run", "--no-default-browser-check", "--window-size=1680,1050", "about:blank"],
        { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/json/version`);
      if (r.ok) return puppeteer.connect({ browserURL: `http://127.0.0.1:${porta}`, defaultViewport: { width: 1680, height: 1050 } });
    } catch { /* subindo */ }
    await esperar(500);
  }
  throw new Error(`O Edge não abriu a porta ${porta}.`);
}

// ------------------------------------------------------------ quem é quem
const perfis = exigir(await servico.from("profiles").select("id, user_id, account_id, email").in("email", Object.values(EMAIL)), "perfis");
const perfil = (e) => perfis.find((p) => p.email === e);
const conta = perfil(EMAIL.dona).account_id;
const prof = exigir(await servico.schema("aba_scheduling").from("profissionais").select("id").eq("profile_id", perfil(EMAIL.profissional).id).single(), "profissional");
const pacote = exigir(await servico.schema("aba_catalog").from("pacotes").select("id, nome").eq("account_id", conta).eq("nome", "Pacote Facial — 5 sessões").single(), "pacote");
const { data: fases } = await servico.schema("aba_treatment").from("fases").select("id, chave").eq("account_id", conta);
const fase = fases.find((f) => f.chave === "definitiva") ?? fases[0];

const marca = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
const criado = { pessoa: null, concessao: null, plano: null };

async function limpar() {
  console.log("\nlimpeza (por identificador, só o que este script criou):");
  const passo = async (nome, f) => {
    const { error } = await f();
    console.log(error ? `  ✗ ${nome}: ${error.message}` : `  · ${nome}`);
  };
  const f = () => servico.schema("aba_finance");
  if (criado.pessoa) {
    const { data: contratos } = await f().from("contratos").select("id").eq("cliente_id", criado.pessoa);
    const ids = (contratos ?? []).map((c) => c.id);
    if (ids.length) {
      const { data: itens } = await f().from("itens_contrato").select("id, pacote_cliente_id").in("contrato_id", ids);
      const pcs = (itens ?? []).map((i) => i.pacote_cliente_id).filter(Boolean);
      await passo("execuções avulsas", () => f().from("execucoes_item_contrato").delete().in("item_contrato_id", (itens ?? []).map((i) => i.id)));
      await passo("faturas dos contratos", () => f().from("faturas").delete().in("contrato_id", ids));
      await passo("contratos (cascata)", () => f().from("contratos").delete().in("id", ids));
      if (pcs.length) await passo("pacotes vendidos na assinatura", () => f().from("pacotes_cliente").delete().in("id", pcs));
    }
  }
  if (criado.plano) {
    await passo("faces executadas", () => servico.schema("aba_treatment").from("execucoes_face").delete().eq("plano_id", criado.plano));
    await passo("orçamentos a rascunho", () => f().from("orcamentos").update({ estado: "rascunho", aprovado_em: null, aprovado_por: null }).eq("plano_id", criado.plano).neq("estado", "rascunho"));
    await passo("plano (cascata)", () => servico.schema("aba_treatment").from("planos").delete().eq("id", criado.plano));
  }
  await passo("procedimento descartável", () => servico.schema("aba_catalog").from("procedimentos").delete().like("nome", `%(evidência tela 03.8.b ${marca})`));
  if (criado.concessao) await passo("concessão", () => servico.schema("aba_health").from("concessoes_prontuario").delete().eq("id", criado.concessao));
  if (criado.pessoa) {
    await passo("log do paciente", () => servico.schema("aba_health").from("log_acesso").delete().eq("cliente_id", criado.pessoa));
    await passo("cliente", () => servico.schema("aba_people").from("clientes").delete().eq("id", criado.pessoa));
    await passo("pessoa", () => servico.schema("aba_people").from("pessoas").delete().eq("id", criado.pessoa));
  }
}

let browser;
try {
  console.log("\n0) preparo: paciente, procedimento e concessão pelo serviço; o plano aprovado pela SESSÃO do profissional");
  const nomePaciente = `Paciente tela 03.8.b ${marca}`;
  const pessoa = exigir(await servico.schema("aba_people").from("pessoas").insert({ account_id: conta, nome_exibicao: nomePaciente }).select("id").single(), "pessoa");
  criado.pessoa = pessoa.id;
  exigir(await servico.schema("aba_people").from("clientes").insert({ id: pessoa.id, account_id: conta, razao_social: nomePaciente, status: "ativo" }), "cliente");
  const { data: cat } = await servico.schema("aba_catalog").from("categorias").select("id").eq("account_id", conta).limit(1).single();
  const proc = exigir(await servico.schema("aba_catalog").from("procedimentos").insert({
    account_id: conta, categoria_id: cat.id, nome: `Restauração em resina (evidência tela 03.8.b ${marca})`, preco_base: 300,
    unidade_lancamento: "dente", faces_minimo: 1, faces_maximo: 3, regiao_dentaria: "ambas",
  }).select("id").single(), "procedimento");
  criado.concessao = exigir(await servico.schema("aba_health").from("concessoes_prontuario").insert({
    account_id: conta, usuario_concedido_id: perfil(EMAIL.profissional).user_id, escopo: "cliente_unico",
    cliente_id: pessoa.id, efeito: "permitir", motivo: "Evidência de tela da Subetapa 03.8.b", concedido_por: perfil(EMAIL.dona).user_id,
  }).select("id").single(), "concessão").id;

  const { data: link } = await servico.auth.admin.generateLink({ type: "magiclink", email: EMAIL.profissional });
  const P = createClient(env.SUPABASE__URL, env.SUPABASE_ANON_KEY, opcoesCliente);
  exigir(await P.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token }), "sessão do profissional");
  const plano = exigir(await P.schema("aba_treatment").from("planos").insert({ account_id: conta, cliente_id: pessoa.id, titulo: "Reabilitação — tela 03.8.b", profissional_id: prof.id }).select("id").single(), "plano");
  criado.plano = plano.id;
  const op = exigir(await P.schema("aba_treatment").from("opcoes").insert({ account_id: conta, plano_id: plano.id, rotulo: "A", ordem: 1 }).select("id").single(), "opção");
  exigir(await P.schema("aba_treatment").from("procedimentos_plano").insert({ account_id: conta, plano_id: plano.id, opcao_id: op.id, fase_id: fase.id, procedimento_id: proc.id, dente: "16", faces: ["mesial", "oclusal"] }), "célula");
  exigir(await P.schema("aba_treatment").from("procedimentos_plano").insert({ account_id: conta, plano_id: plano.id, opcao_id: op.id, fase_id: fase.id, pacote_id: pacote.id }), "célula pacote");
  exigir(await P.schema("aba_treatment").rpc("consentir_opcao", { p_opcao_id: op.id }), "consentir");
  const orc = exigir(await P.schema("aba_finance").rpc("montar_orcamento", { p_opcao_id: op.id, p_profissional_id: prof.id }), "montar");
  exigir(await P.schema("aba_finance").rpc("aprovar_orcamento", { p_orcamento_id: orc }), "aprovar");
  afirmar("preparo: plano com restauração (2 faces) e pacote, orçamento APROVADO pelo profissional", true, plano.id);

  mkdirSync(DESTINO, { recursive: true });
  browser = await abrirEdge();

  async function sessao(email) {
    const contexto = await browser.createBrowserContext();
    const pagina = await contexto.newPage();
    pagina.setDefaultNavigationTimeout(60_000);
    const erros = [];
    pagina.on("pageerror", (e) => erros.push(String(e)));
    // A impressão acontece num iframe escondido; o observador guarda o texto
    // dele antes de o iframe ser removido. `print()` em navegador sem tela
    // não abre diálogo nenhum.
    await pagina.evaluateOnNewDocument(() => {
      window.__impresso = [];
      new MutationObserver((ms) => {
        for (const m of ms) for (const n of m.addedNodes) {
          if (n.tagName === "IFRAME" && n.getAttribute("aria-hidden") === "true") {
            setTimeout(() => window.__impresso.push(n.contentDocument?.body?.innerText ?? ""), 0);
          }
        }
      // `document`, e não `document.documentElement`: este script roda ANTES
      // de o documento ter elemento raiz, e observar `null` lança erro.
      }).observe(document, { childList: true, subtree: true });
    });
    const { data, error } = await servico.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: BASE } });
    if (error) throw new Error(`link de ${email}: ${error.message}`);
    await pagina.goto(data.properties.action_link, { waitUntil: "networkidle2" });
    await esperar(2500);
    return { pagina, erros };
  }
  const texto = (p, sel = "body") => p.evaluate((s) => document.querySelector(s)?.textContent ?? "", sel);
  const clicar = (p, rotulo, dentro = null) =>
    p.evaluate((r, d) => {
      const raiz = d ? document.querySelector(d) : document;
      const b = raiz && [...raiz.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(r) && !x.disabled);
      if (!b) return false;
      b.click();
      return true;
    }, rotulo, dentro);

  // ====================================================================
  console.log("\n1) o PROFISSIONAL abre o plano: sem contrato, nada a executar");
  const { pagina: pp, erros: errosProf } = await sessao(EMAIL.profissional);
  await pp.goto(`${BASE}/plano/${pessoa.id}`, { waitUntil: "networkidle2" });
  await esperar(3500);
  afirmar("a célula diz 'sem contrato assinado — não se executa', e não há botão de marcar face",
    (await texto(pp)).includes("sem contrato assinado — não se executa") && !(await pp.$("[data-marcar-face]")));

  // ====================================================================
  console.log("\n2) a RECEPÇÃO imprime o orçamento aprovado e contrata");
  const { pagina: pr, erros: errosRec } = await sessao(EMAIL.recepcao);
  await pr.goto(`${BASE}/plano/${pessoa.id}`, { waitUntil: "networkidle2" });
  await esperar(3500);
  afirmar("a recepção está na vista sem o plano clínico", !!(await pr.$('[data-vista="recepcao"]')));
  afirmar("clicou em 'Imprimir orçamento'", await clicar(pr, "Imprimir orçamento", '[data-orcamento-opcao="A"]'));
  await esperar(1200);
  const impresso = (await pr.evaluate(() => window.__impresso))[0] ?? "";
  afirmar("o orçamento impresso tem o total e os itens, SEM dente nem face (quem imprime não tem alcance)",
    impresso.includes("Total:") && impresso.includes("Restauração em resina") && !/dente 16|mesial/.test(impresso), impresso.slice(0, 80).replace(/\s+/g, " "));

  afirmar("clicou em 'Contratar esta opção'", await clicar(pr, "Contratar esta opção", '[data-orcamento-opcao="A"]'));
  await esperar(4000);
  afirmar("o contrato aparece em Contratos, em rascunho", !!(await pr.$('[data-status-contrato="rascunho"]')));
  // Achado por esta evidência: os campos seguiam abertos num orçamento já
  // contratado, prometendo uma devolução a rascunho que o banco recusa.
  afirmar("as condições do orçamento contratado ficam CONGELADAS na tela",
    await pr.$eval('[data-orcamento-opcao="A"] input[aria-label="Desconto em reais"]', (e) => e.disabled)
      && (await texto(pr, '[data-orcamento-opcao="A"]')).includes("já foi contratada"));
  const tiposNaTela = await pr.$$eval("[data-item-contrato]", (els) => els.map((e) => e.getAttribute("data-item-contrato")).sort());
  afirmar("com a linha do plano e a do pacote", tiposNaTela.join() === "pacote,plano", tiposNaTela.join());

  afirmar("emitiu o documento", await clicar(pr, "Emitir documento", "[data-contrato]"));
  await esperar(3500);
  const codigo = await pr.$eval("[data-codigo-documento]", (e) => e.textContent.trim()).catch(() => null);
  afirmar("o código do documento aparece para ir no papel", /^[0-9A-F]{8}$/.test(codigo ?? ""), codigo ?? "sem código");
  afirmar("a assinatura do profissional DERIVOU da aprovação", (await texto(pr, '[data-assinatura="profissional"]')).includes("derivada da aprovação"));
  await pr.screenshot({ path: path.join(DESTINO, "0308b_01_contrato_emitido.png"), fullPage: true });

  await pr.type('input[aria-label="Código do documento assinado pelo paciente"]', "ABCDEF12");
  await clicar(pr, "Registrar assinatura do paciente");
  await esperar(1000);
  afirmar("código errado é recusado na tela, antes do banco", (await texto(pr)).includes("não é o deste documento") && !!(await pr.$('[data-status-contrato="rascunho"]')));

  await pr.$eval('input[aria-label="Código do documento assinado pelo paciente"]', (e) => { e.value = ""; });
  const campo = await pr.$('input[aria-label="Código do documento assinado pelo paciente"]');
  await campo.click({ clickCount: 3 });
  await campo.type(codigo);
  afirmar("registrou a assinatura do paciente", await clicar(pr, "Registrar assinatura do paciente"));
  await esperar(4500);
  afirmar("o contrato está ASSINADO", !!(await pr.$('[data-status-contrato="assinado"]')));
  afirmar("a trava dupla aparece com as duas metades", !!(await pr.$('[data-trava-dupla] [data-metade="pagamento"]')) && !!(await pr.$('[data-trava-dupla] [data-metade="execucao"]')));
  await pr.screenshot({ path: path.join(DESTINO, "0308b_02_contrato_assinado_trava_dupla.png"), fullPage: true });

  // ====================================================================
  console.log("\n3) o PROFISSIONAL marca as faces executadas (passo 36)");
  await pp.goto(`${BASE}/plano/${pessoa.id}`, { waitUntil: "networkidle2" });
  await pp.waitForSelector("[data-execucao-celula]", { timeout: 20_000 }).catch(async () => {
    await pp.screenshot({ path: path.join(DESTINO, "0308b_diag_profissional.png"), fullPage: true });
  });
  await esperar(1500);
  const botoes = await pp.$$eval("[data-marcar-face]", (els) => els.map((e) => e.getAttribute("data-marcar-face")).sort());
  if (botoes.length === 0) {
    // DIAGNÓSTICO, não correção: o que a tela mostra e o que o banco responde
    // à MESMA sessão, no mesmo instante.
    console.log("    [diag] célula:", (await texto(pp, "[data-execucao-celula]")).trim());
    console.log("    [diag] matriz:", (await texto(pp, "[data-matriz]")).replace(/\s+/g, " ").slice(0, 300));
    console.log("    [diag] página:", (await texto(pp)).replace(/\s+/g, " ").slice(0, 400));
    console.log("    [diag] erros JS:", JSON.stringify([...errosProf, ...errosRec]).slice(0, 1200));
    console.log("    [diag] url:", pp.url());
    console.log("    [diag] execucao_liberada_no_plano:", JSON.stringify(await P.schema("aba_finance").rpc("execucao_liberada_no_plano", { p_plano_id: plano.id })));
    console.log("    [diag] estado dos contratos:", JSON.stringify((await servico.schema("aba_finance").from("contratos").select("status").eq("cliente_id", pessoa.id)).data));
  }
  afirmar("com o contrato assinado, a célula oferece marcar mesial e oclusal", botoes.join() === "mesial,oclusal", botoes.join());
  await pp.click('[data-marcar-face="mesial"]');
  await esperar(3500);
  const feita = await pp.$eval('[data-face-executada="mesial"]', (e) => e.textContent).catch(() => null);
  afirmar("a face mesial aparece executada, com a data e o autor", !!feita && /\d{2}\/\d{2}\/\d{4}/.test(feita), feita?.trim());
  await pp.screenshot({ path: path.join(DESTINO, "0308b_03_face_executada.png"), fullPage: true });

  const { data: faces } = await servico.schema("aba_treatment").from("execucoes_face").select("face, executado_por").eq("plano_id", plano.id);
  afirmar("o banco gravou a face com o autor da SESSÃO (não do navegador)", faces.length === 1 && faces[0].executado_por === perfil(EMAIL.profissional).user_id);

  // ====================================================================
  console.log("\n4) a RECEPÇÃO recebe tudo e tenta encerrar — a trava segura");
  const { data: faturas } = await servico.schema("aba_finance").from("faturas").select("id, valor").eq("contrato_id", (await servico.schema("aba_finance").from("contratos").select("id").eq("cliente_id", pessoa.id).single()).data.id);
  const { data: link2 } = await servico.auth.admin.generateLink({ type: "magiclink", email: EMAIL.recepcao });
  const R = createClient(env.SUPABASE__URL, env.SUPABASE_ANON_KEY, opcoesCliente);
  exigir(await R.auth.verifyOtp({ type: "magiclink", token_hash: link2.properties.hashed_token }), "sessão da recepção");
  for (const fat of faturas) {
    exigir(await R.schema("aba_finance").from("pagamentos").insert({ account_id: conta, fatura_id: fat.id, valor: Number(fat.valor), forma_pagamento: "pix" }), "pagamento");
  }
  await pr.goto(`${BASE}/plano/${pessoa.id}`, { waitUntil: "networkidle2" });
  await esperar(3500);
  afirmar("a tela mostra o dinheiro PAGO", (await texto(pr, '[data-metade="pagamento"]')).startsWith("Pago"));
  afirmar("e o trabalho que falta (1 face + 5 sessões do pacote)", (await texto(pr, '[data-metade="execucao"]')).includes("1 de 7"), await texto(pr, '[data-metade="execucao"]'));
  afirmar("clicou em 'Encerrar contrato'", await clicar(pr, "Encerrar contrato"));
  await esperar(3000);
  const recusa = await texto(pr, '[data-contrato]');
  afirmar("PAGOU TUDO e falta trabalho: a tela mostra a recusa com o motivo, e o contrato segue ASSINADO",
    recusa.includes("falta execução") && !!(await pr.$('[data-status-contrato="assinado"]')));
  await pr.screenshot({ path: path.join(DESTINO, "0308b_04_trava_dupla_recusa_encerrar.png"), fullPage: true });

  // ====================================================================
  console.log("\n5) a venda de pacote do Financeiro vira CONTRATO em rascunho (D-F14)");
  await pr.goto(`${BASE}/financeiro`, { waitUntil: "networkidle2" });
  await esperar(3000);
  afirmar("abriu '+ Novo lançamento'", await clicar(pr, "+ Novo lançamento"));
  await esperar(800);
  afirmar("escolheu 'Venda de pacote'", await clicar(pr, "Venda de pacote"));
  await esperar(800);
  // As listas de paciente e de pacote chegam por consulta própria. Escolher
  // antes de a opção existir não dá erro — o `select` simplesmente não muda,
  // e o formulário `required` não envia nada (medido: foi o que deixou esta
  // verificação vermelha numa das execuções).
  const opcoesProntas = await pr.waitForFunction(
    (c, k) => document.querySelector(`form select option[value="${c}"]`) && document.querySelector(`form select option[value="${k}"]`),
    { timeout: 20_000 }, pessoa.id, pacote.id,
  ).then(() => true).catch(() => false);
  afirmar("as listas de paciente e de pacote carregaram no formulário", opcoesProntas);
  const selects = await pr.$$("form select");
  await selects[0].select(pessoa.id);
  await selects[1].select(pacote.id);
  afirmar("a tela explica que nasce contrato em rascunho, sem valor a digitar",
    (await texto(pr)).includes("contrato em rascunho") && !(await pr.$('form input[placeholder="0,00"]')));
  afirmar("clicou em 'Vender pacote'", await clicar(pr, "Vender pacote"));
  await esperar(3500);
  afirmar("a tela avisa e aponta para os contratos do paciente", (await texto(pr)).includes("Contrato criado em rascunho"));
  await pr.screenshot({ path: path.join(DESTINO, "0308b_05_venda_de_pacote_vira_contrato.png"), fullPage: true });
  const { data: avulso } = await servico.schema("aba_finance").from("contratos").select("status, id, orcamento_id").eq("cliente_id", pessoa.id).is("orcamento_id", null);
  const { count: saldos } = await servico.schema("aba_finance").from("pacotes_cliente").select("id", { count: "exact", head: true }).eq("cliente_id", pessoa.id);
  afirmar("no banco: contrato em RASCUNHO, e só o pacote do contrato assinado foi vendido (nenhum saldo solto)", avulso?.length === 1 && avulso[0].status === "rascunho" && saldos === 1, `saldos=${saldos}`);

  afirmar("nenhum erro de JavaScript nas duas sessões", errosProf.length === 0 && errosRec.length === 0, [...errosProf, ...errosRec].join(" | ").slice(0, 200));
} catch (e) {
  afirmar("a evidência terminou sem exceção", false, String(e?.message ?? e));
} finally {
  if (browser) await browser.close();
  await limpar();
}

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} verificações verdes.`);
process.exit(falhas.length ? 1 : 0);
