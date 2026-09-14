#!/usr/bin/env node
/**
 * Evidência ponta a ponta da Subetapa 03.8.c — o plano se monta NA TELA.
 *
 * ============================================================
 * O QUE ESTA EVIDÊNCIA PROVA, E POR QUE ELA É DE TELA
 * ============================================================
 * A Evidência do bloco pede "plano montado inteiro pela tela, do odontograma
 * ao orçamento, sem uma linha de SQL". O gatilho da subetapa foi exatamente o
 * contrário disso: na demonstração de 2026-09-05 o plano precisou nascer por
 * SQL, e pilotar a tela publicada achou em minutos dois defeitos que build,
 * `tsc`, 248 testes de RLS e a evidência de banco não pegaram
 * (`docs/08_CAMINHO_FELIZ.md`). A suíte `21_opcao_heterogenea_reaprovacao`
 * prova as regras; esta prova que uma PESSOA consegue percorrê-las.
 *
 * DUAS PESSOAS DE VERDADE, cada uma no seu contexto de navegador, logadas
 * por link mágico — nenhuma senha passa por aqui:
 *
 *   · o PROFISSIONAL (`terapeuta@`, Marcos Dias, `agent`) — monta o plano a
 *     partir do odontograma, põe procedimento numa opção e pacote na outra,
 *     gera os orçamentos e aprova;
 *   · a RECEPÇÃO (`recepcao@`, `admin`) — sem alcance clínico, chega ao
 *     orçamento pela porta financeira, dá 10% de desconto e vê o orçamento
 *     VOLTAR A RASCUNHO com o aviso;
 *   · e o profissional REAPROVA.
 *
 * "SEM UMA LINHA DE SQL" É CONFERIDO, NÃO DECLARADO: toda escrita no plano
 * dispara `aba_treatment.registrar_escrita_plano`, que só registra quando há
 * sessão autenticada. As linhas de `criacao` com o `usuario_ator_id` do
 * profissional em `aba_health.log_acesso` são a prova de que o plano entrou
 * pela aplicação — uma escrita por SQL de servidor não deixaria nenhuma.
 *
 * ============================================================
 * O QUE O SCRIPT CRIA ANTES, E POR QUÊ
 * ============================================================
 * `handoffs/instrucoes.md` §5 (03.7.a): script de evidência que escreve em
 * base compartilhada tem de CRIAR o que vai usar — reaproveitar registro que
 * já estava lá é indistinguível de escrever no registro de outra pessoa. E a
 * conta de demonstração é PÚBLICA. Então o preparo cria, e a limpeza apaga
 * por identificador, exatamente:
 *
 *   · um paciente descartável;
 *   · um procedimento odontológico descartável, lançado por dente e com
 *     faces — a conta de demonstração é de estética e não tem nenhum;
 *   · um odontograma desse paciente, com um achado e um trabalho — gravado
 *     como a tela do prontuário gravaria (a evidência do odontograma pela
 *     tela é da 03.7.a, `evidencia_odontograma.mjs`);
 *   · uma concessão nominal de prontuário, do paciente para o profissional
 *     — é o mecanismo real pelo qual um profissional ganha alcance clínico
 *     sobre um paciente, e a tela de concessões existe desde a 02.9.
 *
 * O resto — plano, opções, diagnóstico, três itens, dois orçamentos, duas
 * aprovações e o desconto — nasce pela tela.
 *
 * PRÉ-REQUISITO: app em http://localhost:3000 apontando para PRODUÇÃO, com a
 * migration `051` aplicada lá.
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
const EMAIL_PROFISSIONAL = "terapeuta@vitrinedemo.local";
const EMAIL_RECEPCAO = "recepcao@vitrinedemo.local";
const EMAIL_DONA = "proprietaria@vitrinedemo.local";

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

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ABRIR O NAVEGADOR E CONECTAR PELA PORTA — e não `puppeteer.launch()`.
 *
 * Medido nesta subetapa, e é a mesma classe de sintoma enganoso de sempre:
 * `puppeteer.launch()` com o Edge 153 falha com "Failed to launch the browser
 * process: Code: 0", sem nenhuma saída de erro — e parece bloqueio de sandbox
 * ou de política. Não é nenhum dos dois (fora do sandbox falha igual, e não há
 * política do Edge no registro). O teste que decidiu: abrir o `msedge.exe`
 * direto com `--remote-debugging-port` e consultar `/json/version`. A porta
 * RESPONDE — o navegador subiu — e o processo lançado já saiu com código 0.
 * O Edge desta versão entrega a sessão a outro processo e encerra o que foi
 * chamado; o puppeteer vê o processo que ele criou morrer e desiste.
 *
 * Então a evidência abre o navegador ela mesma, espera a porta e conecta.
 * Perfil temporário próprio, para nunca tocar no navegador de uso de Max.
 */
async function abrirNavegador() {
  const { spawn } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const porta = 9400 + Math.floor(Math.random() * 400);
  const perfilTemp = path.join(tmpdir(), `evidencia-0308c-${Date.now()}`);
  const filho = spawn(
    navegador,
    [`--headless`, `--remote-debugging-port=${porta}`, `--user-data-dir=${perfilTemp}`,
     "--no-first-run", "--no-default-browser-check", "--window-size=1680,1050", "about:blank"],
    { detached: true, stdio: "ignore" },
  );
  filho.unref();
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/json/version`);
      if (r.ok) {
        return await puppeteer.connect({
          browserURL: `http://127.0.0.1:${porta}`,
          defaultViewport: { width: 1680, height: 1050 },
        });
      }
    } catch {
      /* ainda subindo */
    }
    await esperar(500);
  }
  throw new Error(`O navegador não abriu a porta de depuração ${porta} em 20 s.`);
}
const resultados = [];
function afirmar(nome, ok, detalhe = "") {
  resultados.push({ nome, ok, detalhe });
  console.log(`  ${ok ? "✓" : "✗"} ${nome}${detalhe ? `  — ${detalhe}` : ""}`);
}
function falhar(msg) {
  console.error(`\n✗ ${msg}`);
  throw new Error(msg);
}

try {
  const r = await fetch(BASE, { method: "HEAD" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch {
  console.error(`App não responde em ${BASE}.  cd crm && npm run dev -- --port 3000 --strictPort`);
  process.exit(1);
}

// ------------------------------------------------------------ quem é quem
const { data: perfis, error: erroPerfis } = await db
  .from("profiles")
  .select("id, user_id, account_id, email, full_name")
  .in("email", [EMAIL_PROFISSIONAL, EMAIL_RECEPCAO, EMAIL_DONA]);
if (erroPerfis || (perfis ?? []).length !== 3) {
  console.error(`Perfis de demonstração não encontrados: ${erroPerfis?.message ?? (perfis ?? []).length}`);
  process.exit(1);
}
const perfil = (email) => perfis.find((p) => p.email === email);
const conta = perfil(EMAIL_DONA).account_id;
const profissionalLogin = perfil(EMAIL_PROFISSIONAL);
const recepcaoLogin = perfil(EMAIL_RECEPCAO);

const { data: prof } = await db
  .schema("aba_scheduling").from("profissionais")
  .select("id, nome_exibicao").eq("profile_id", profissionalLogin.id).eq("account_id", conta).single();
if (!prof) {
  console.error("O login do profissional não tem profissional ligado.");
  process.exit(1);
}

const { data: limpeza } = await db
  .schema("aba_catalog").from("procedimentos")
  .select("id, nome").eq("account_id", conta).eq("nome", "Limpeza de pele profunda").single();
const { data: pacote } = await db
  .schema("aba_catalog").from("pacotes")
  .select("id, nome, preco_total").eq("account_id", conta).eq("ativo", true).order("nome").limit(1).single();
if (!limpeza || !pacote) {
  console.error("A conta de demonstração não tem o procedimento com tarifa ou o pacote ativo que a evidência usa.");
  process.exit(1);
}

// ------------------------------------------------------------ o que se cria
const criado = { pessoa: null, procedimento: null, evolucao: null, concessao: null, plano: null };
const marca = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

async function limpar() {
  console.log("\nlimpeza (por identificador, só o que este script criou):");
  const passos = [];
  if (criado.plano) {
    // Orçamento aprovado não solta item (`048`): volta a rascunho pela
    // própria regra (gatilho da `051`) antes de o plano cair em cascata.
    passos.push(["orçamentos a rascunho", () => db.schema("aba_finance").from("orcamentos").update({ estado: "rascunho" }).eq("plano_id", criado.plano).eq("estado", "aprovado")]);
    passos.push(["plano (cascata: opções, diagnósticos, itens, orçamentos, trilha)", () => db.schema("aba_treatment").from("planos").delete().eq("id", criado.plano)]);
  }
  if (criado.evolucao) passos.push(["odontograma", () => db.schema("aba_health").from("evolucoes").delete().eq("id", criado.evolucao)]);
  if (criado.concessao) passos.push(["concessão", () => db.schema("aba_health").from("concessoes_prontuario").delete().eq("id", criado.concessao)]);
  if (criado.procedimento) passos.push(["procedimento descartável", () => db.schema("aba_catalog").from("procedimentos").delete().eq("id", criado.procedimento)]);
  if (criado.pessoa) {
    passos.push(["log do paciente descartável", () => db.schema("aba_health").from("log_acesso").delete().eq("cliente_id", criado.pessoa)]);
    passos.push(["cliente", () => db.schema("aba_people").from("clientes").delete().eq("id", criado.pessoa)]);
    passos.push(["pessoa", () => db.schema("aba_people").from("pessoas").delete().eq("id", criado.pessoa)]);
  }
  for (const [nome, f] of passos) {
    const { error } = await f();
    console.log(error ? `  ✗ ${nome}: ${error.message}` : `  · ${nome}`);
  }
}

let browser;
try {
  console.log("\n0) preparo — o que a evidência usa, criado por ela");
  const nomePaciente = `Paciente evidência 03.8.c ${marca}`;
  const { data: pessoa, error: e1 } = await db
    .schema("aba_people").from("pessoas")
    .insert({ account_id: conta, nome_exibicao: nomePaciente }).select("id").single();
  if (e1) falhar(`pessoa: ${e1.message}`);
  criado.pessoa = pessoa.id;
  const { error: e2 } = await db
    .schema("aba_people").from("clientes")
    .insert({ id: pessoa.id, account_id: conta, razao_social: nomePaciente, status: "ativo" });
  if (e2) falhar(`cliente: ${e2.message}`);

  const { data: categoria } = await db
    .schema("aba_catalog").from("procedimentos").select("categoria_id").eq("id", limpeza.id).single();
  const { data: proc, error: e3 } = await db
    .schema("aba_catalog").from("procedimentos")
    .insert({
      account_id: conta, categoria_id: categoria.categoria_id, nome: `Restauração em resina (evidência ${marca})`,
      preco_base: 320, unidade_lancamento: "dente", faces_minimo: 1, faces_maximo: 3, regiao_dentaria: "ambas",
    })
    .select("id").single();
  if (e3) falhar(`procedimento: ${e3.message}`);
  criado.procedimento = proc.id;

  const { data: evo, error: e4 } = await db
    .schema("aba_health").from("evolucoes")
    .insert({
      account_id: conta, cliente_id: pessoa.id, profissional_id: prof.id, mapa_tipo: "odontograma",
      marcacoes: [{
        regiao: "11", rotulo: "Dente 11", estado: "existente", nota: "",
        achados: [{ tipo: "carie", faces: ["vestibular"] }],
        trabalhos: [{ id: "t1", faces: ["mesial", "vestibular"], estado: "proposto", descricao: "restauração em resina" }],
      }],
    })
    .select("id").single();
  if (e4) falhar(`odontograma: ${e4.message}`);
  criado.evolucao = evo.id;

  const { data: conc, error: e5 } = await db
    .schema("aba_health").from("concessoes_prontuario")
    .insert({
      account_id: conta, usuario_concedido_id: profissionalLogin.user_id, escopo: "cliente_unico",
      cliente_id: pessoa.id, efeito: "permitir", motivo: "Evidência da Subetapa 03.8.c",
      concedido_por: perfil(EMAIL_DONA).user_id,
    })
    .select("id").single();
  if (e5) falhar(`concessão: ${e5.message}`);
  criado.concessao = conc.id;
  afirmar("preparo criado: paciente, procedimento por dente, odontograma e concessão", true, pessoa.id);

  mkdirSync(DESTINO, { recursive: true });
  browser = await abrirNavegador();

  async function sessao(email) {
    const contexto = await browser.createBrowserContext();
    const pagina = await contexto.newPage();
    pagina.setDefaultNavigationTimeout(60_000);
    const erros = [];
    pagina.on("pageerror", (e) => erros.push(String(e)));
    const { data: link, error } = await db.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: BASE } });
    if (error) falhar(`link mágico de ${email}: ${error.message}`);
    await pagina.goto(link.properties.action_link, { waitUntil: "networkidle2" });
    await esperar(2500);
    return { pagina, erros };
  }

  const texto = (p) => p.evaluate(() => document.body.textContent ?? "");
  const clicar = (p, rotulo, dentro = null) =>
    p.evaluate(
      (r, d) => {
        const raiz = d ? document.querySelector(d) : document;
        if (!raiz) return false;
        const b = [...raiz.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(r) && !x.disabled);
        if (!b) return false;
        b.click();
        return true;
      },
      rotulo,
      dentro,
    );
  const idDoPlano = async () =>
    (await db.schema("aba_treatment").from("planos").select("id").eq("cliente_id", criado.pessoa).maybeSingle()).data?.id ?? null;
  const opcoesDoPlano = async (planoId) =>
    (await db.schema("aba_treatment").from("opcoes").select("id, rotulo").eq("plano_id", planoId).order("ordem")).data ?? [];

  // ====================================================================
  console.log("\n1) o PROFISSIONAL monta o plano pela tela");
  const { pagina: pp, erros: errosProf } = await sessao(EMAIL_PROFISSIONAL);
  await pp.goto(`${BASE}/plano/${criado.pessoa}`, { waitUntil: "networkidle2" });
  await esperar(2500);
  afirmar("a tela diz que o paciente ainda não tem plano, e oferece criar", (await texto(pp)).includes("ainda não tem plano de tratamento") && !!(await pp.$('[data-form="plano"]')));

  await pp.type('input[aria-label="Título do plano"]', "Reabilitação — evidência 03.8.c");
  await pp.select('select[aria-label="Profissional responsável"]', prof.id);
  afirmar("clicou em Criar plano", await clicar(pp, "Criar plano"));
  await esperar(3000);
  criado.plano = await idDoPlano();
  afirmar("o plano existe no banco", !!criado.plano, criado.plano ?? "não nasceu");
  if (!criado.plano) falhar("o plano não nasceu pela tela");

  afirmar("criou a opção A", await clicar(pp, "+ Opção A"));
  await esperar(2500);
  afirmar("criou a opção B", await clicar(pp, "+ Opção B"));
  await esperar(2500);
  const opcoes = await opcoesDoPlano(criado.plano);
  const opA = opcoes.find((o) => o.rotulo === "A");
  const opB = opcoes.find((o) => o.rotulo === "B");
  afirmar("as duas opções concorrentes existem", !!opA && !!opB, opcoes.map((o) => o.rotulo).join(", "));

  console.log("\n2) do odontograma para o plano");
  afirmar("abriu 'Trazer do odontograma'", await clicar(pp, "Trazer do odontograma"));
  await esperar(3500);
  afirmar("o odontograma do paciente aparece no plano", (await texto(pp)).includes("achado: cárie (vestibular)"));
  afirmar("o achado virou diagnóstico", await clicar(pp, "virar diagnóstico", '[data-bloco="do-odontograma"]'));
  await esperar(3000);
  const { data: diag } = await db.schema("aba_treatment").from("diagnosticos").select("id, dente, faces").eq("plano_id", criado.plano);
  afirmar("o diagnóstico nasceu com o dente e a face DO ACHADO", diag?.length === 1 && diag[0].dente === "11" && diag[0].faces.join() === "vestibular", JSON.stringify(diag));

  afirmar("'lançar na matriz' levou o trabalho para o formulário", await clicar(pp, "lançar na matriz", '[data-bloco="do-odontograma"]'));
  await esperar(800);
  await pp.select('select[aria-label="Opção"]', opA.id);
  await pp.select('select[aria-label="Procedimento ou pacote"]', `procedimento:${criado.procedimento}`);
  await esperar(400);
  await pp.select('select[aria-label="Diagnóstico vinculado"]', diag[0].id);
  const prefill = await pp.evaluate(() => ({
    dente: document.querySelector('input[aria-label="Dente"]')?.value,
    faces: [...document.querySelectorAll('[data-form="item"] input[type=checkbox]:checked')].map((c) => c.parentElement.textContent.trim()),
  }));
  afirmar("dente e faces DO TRABALHO vieram preenchidos (nunca as do achado)", prefill.dente === "11" && prefill.faces.sort().join() === "mesial,vestibular", JSON.stringify(prefill));
  afirmar("gravou a restauração na opção A", await clicar(pp, "Gravar na opção"));
  await esperar(3000);

  await pp.select('select[aria-label="Opção"]', opA.id);
  await pp.select('select[aria-label="Procedimento ou pacote"]', `procedimento:${limpeza.id}`);
  afirmar("gravou o segundo procedimento na opção A", await clicar(pp, "Gravar na opção"));
  await esperar(3000);

  await pp.select('select[aria-label="Opção"]', opB.id);
  await pp.select('select[aria-label="Procedimento ou pacote"]', `pacote:${pacote.id}`);
  afirmar("a tela explica que pacote não se lança por dente", (await texto(pp)).includes("Pacote não se lança por dente"));
  afirmar("gravou o PACOTE na opção B", await clicar(pp, "Gravar na opção"));
  await esperar(3000);

  const { data: celulas } = await db.schema("aba_treatment").from("procedimentos_plano")
    .select("opcao_id, procedimento_id, pacote_id, dente, faces, diagnostico_id").eq("plano_id", criado.plano);
  afirmar("a matriz tem 3 células: 2 procedimentos na A, 1 pacote na B", celulas?.length === 3
    && celulas.filter((c) => c.opcao_id === opA.id && c.procedimento_id).length === 2
    && celulas.filter((c) => c.opcao_id === opB.id && c.pacote_id && !c.procedimento_id && !c.dente).length === 1,
    JSON.stringify(celulas?.map((c) => ({ o: c.opcao_id === opA.id ? "A" : "B", t: c.pacote_id ? "pacote" : "proc", d: c.dente, f: c.faces }))));
  afirmar("a restauração ficou vinculada ao diagnóstico", celulas?.some((c) => c.procedimento_id === criado.procedimento && c.diagnostico_id === diag[0].id && c.faces.sort().join() === "mesial,vestibular"));
  await pp.screenshot({ path: path.join(DESTINO, "0308c_01_matriz_montada_pela_tela.png"), fullPage: true });

  console.log("\n3) gerar os orçamentos das duas opções");
  afirmar("clicou em 'Gerar orçamento de todas as opções'", await clicar(pp, "Gerar orçamento de todas as opções"));
  await esperar(4000);
  const { data: orcs } = await db.schema("aba_finance").from("orcamentos").select("id, opcao_id, estado, valor_liquido").eq("plano_id", criado.plano);
  const orcA = orcs?.find((o) => o.opcao_id === opA.id);
  const orcB = orcs?.find((o) => o.opcao_id === opB.id);
  afirmar("nasceram os dois orçamentos, em rascunho", !!orcA && !!orcB && orcs.every((o) => o.estado === "rascunho"));
  const { data: itens } = await db.schema("aba_finance").from("itens_orcamento").select("orcamento_id, degrau, pacote_id, valor_resolvido").in("orcamento_id", orcs.map((o) => o.id));
  const degrausA = itens.filter((i) => i.orcamento_id === orcA.id).map((i) => i.degrau).sort();
  const degrausB = itens.filter((i) => i.orcamento_id === orcB.id).map((i) => i.degrau);
  afirmar("opção A: preços de degraus diferentes (tabela da casa e cadastro)", degrausA.join() === "catalogo,pratica", degrausA.join());
  afirmar("opção B: o pacote sai pelo preço do próprio pacote", degrausB.join() === "catalogo" && Number(itens.find((i) => i.orcamento_id === orcB.id).valor_resolvido) === Number(pacote.preco_total));

  await pp.goto(`${BASE}/plano/${criado.pessoa}`, { waitUntil: "networkidle2" });
  await esperar(3000);
  const telaA = await texto(pp);
  afirmar("a tela fala a língua da clínica: 'Preço aplicado' e 'Preço padrão da casa'", telaA.includes("Preço aplicado") && telaA.includes("Preço padrão da casa"));
  afirmar("vocabulário de construção fora da tela do orçamento ('escada', 'Veio de')", !/Veio de|escada de preço/i.test(telaA));
  afirmar("o profissional vê dente e face no orçamento (alcance clínico)", telaA.includes("dente 11"));

  console.log("\n4) o PROFISSIONAL aprova antes de ir ao paciente (D-F3, D-F7)");
  afirmar("o botão 'Aprovar orçamento' está lá para quem executa", await clicar(pp, "Aprovar orçamento", '[data-orcamento-opcao="A"]'));
  await esperar(3000);
  afirmar("orçamento A aprovado", !!(await pp.$('[data-orcamento-opcao="A"] [data-estado-orcamento="aprovado"]')));
  await pp.screenshot({ path: path.join(DESTINO, "0308c_02_orcamento_aprovado_pelo_profissional.png"), fullPage: true });

  // ====================================================================
  console.log("\n5) a RECEPÇÃO dá 10% de desconto — e o orçamento volta a rascunho");
  const { pagina: pr, erros: errosRec } = await sessao(EMAIL_RECEPCAO);
  await pr.goto(`${BASE}/plano/${criado.pessoa}`, { waitUntil: "networkidle2" });
  await esperar(3500);
  afirmar("a recepção chega aos orçamentos sem ver o plano clínico", !!(await pr.$('[data-vista="recepcao"]')) && !!(await pr.$('[data-orcamento-opcao="A"]')));
  const telaRec = await texto(pr);
  afirmar("a recepção NÃO vê dente nem face", !telaRec.includes("dente 11") && !telaRec.includes("mesial"));
  afirmar("a recepção não tem botão de aprovar", !(await pr.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Aprovar orçamento"))));

  const liquido = Number(await pr.$eval('[data-orcamento-opcao="A"] [data-valor-liquido]', (e) => e.getAttribute("data-valor-liquido")));
  const desconto = (liquido * 0.1).toFixed(2);
  const campoDesconto = await pr.$('[data-orcamento-opcao="A"] input[aria-label="Desconto em reais"]');
  await campoDesconto.click({ clickCount: 3 });
  await campoDesconto.type(desconto);
  await pr.type('[data-orcamento-opcao="A"] input[aria-label="Motivo do desconto"]', "10% de cortesia");
  afirmar("a recepção salvou as condições", await clicar(pr, "Salvar condições", '[data-orcamento-opcao="A"]'));
  await esperar(3500);
  afirmar("o orçamento VOLTOU A RASCUNHO", !!(await pr.$('[data-orcamento-opcao="A"] [data-estado-orcamento="rascunho"]')));
  afirmar("com o aviso de que precisa de nova aprovação", !!(await pr.$('[data-orcamento-opcao="A"] [data-aviso="reaprovacao"]')));
  await pr.screenshot({ path: path.join(DESTINO, "0308c_03_desconto_devolve_a_rascunho.png"), fullPage: true });

  // ====================================================================
  console.log("\n6) o PROFISSIONAL reaprova");
  await pp.goto(`${BASE}/plano/${criado.pessoa}`, { waitUntil: "networkidle2" });
  await esperar(3500);
  const aviso = await pp.$eval('[data-orcamento-opcao="A"] [data-aviso="reaprovacao"]', (e) => e.textContent).catch(() => null);
  afirmar("o profissional vê o aviso, com quem mexeu e no quê", !!aviso && aviso.includes("desconto"), aviso?.slice(0, 120) ?? "sem aviso");
  afirmar("reaprovou", await clicar(pp, "Aprovar orçamento", '[data-orcamento-opcao="A"]'));
  await esperar(3000);
  afirmar("aprovado de novo, e o aviso sumiu", !!(await pp.$('[data-orcamento-opcao="A"] [data-estado-orcamento="aprovado"]')) && !(await pp.$('[data-aviso="reaprovacao"]')));
  await pp.screenshot({ path: path.join(DESTINO, "0308c_04_reaprovado.png"), fullPage: true });

  // ====================================================================
  console.log("\n7) o banco confirma o que a tela mostrou");
  const { data: orcFinal } = await db.schema("aba_finance").from("orcamentos").select("estado, desconto_valor, aprovado_por").eq("id", orcA.id).single();
  afirmar("orçamento A: aprovado pelo profissional, com o desconto da recepção", orcFinal.estado === "aprovado" && orcFinal.aprovado_por === profissionalLogin.user_id && Number(orcFinal.desconto_valor) === Number(desconto), JSON.stringify(orcFinal));
  const { data: eventos } = await db.schema("aba_finance").from("eventos_orcamento").select("tipo, ator, colunas").eq("orcamento_id", orcA.id).order("ocorrido_em");
  afirmar("trilha: aprovado → devolvido pela recepção → aprovado",
    eventos.map((e) => e.tipo).join() === "aprovado,devolvido_a_rascunho,aprovado"
      && eventos[0].ator === profissionalLogin.user_id && eventos[1].ator === recepcaoLogin.user_id && eventos[2].ator === profissionalLogin.user_id,
    eventos.map((e) => `${e.tipo}${e.colunas.length ? `[${e.colunas.join(",")}]` : ""}`).join(" → "));

  const { data: escritas } = await db.schema("aba_health").from("log_acesso")
    .select("acao, contexto").eq("cliente_id", criado.pessoa).eq("usuario_ator_id", profissionalLogin.user_id).eq("acao", "criacao");
  const tabelas = new Set((escritas ?? []).map((l) => l.contexto?.tabela));
  afirmar("SEM UMA LINHA DE SQL: plano, opções, diagnóstico e células foram escritos pela sessão do profissional",
    ["planos", "opcoes", "diagnosticos", "procedimentos_plano"].every((t) => tabelas.has(t)), [...tabelas].join(", "));

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
