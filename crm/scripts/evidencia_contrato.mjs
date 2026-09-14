#!/usr/bin/env node
/**
 * Evidência de BANCO da Subetapa 03.8.b — o contrato, em PRODUÇÃO, com os
 * papéis que usam o fluxo de verdade.
 *
 * ============================================================
 * POR QUE ESTA EVIDÊNCIA EXISTE ALÉM DA SUÍTE 22
 * ============================================================
 * A suíte `22_contrato.spec.ts` prova as regras no banco de TESTES, com
 * usuários de teste. Esta prova a mesma corrente no banco que serve a vitrine
 * pública, depois da aplicação por MCP — e é a única forma de saber que a
 * transcrição não mudou comportamento, além do hash (`instrucoes.md` §5).
 *
 * NENHUM PASSO DO FLUXO RODA COMO `owner` NEM COMO SERVIÇO (lição da 03.8.c):
 *   · o PROFISSIONAL (`terapeuta@`, `agent`, com concessão NOMINAL do
 *     paciente) monta o plano, aprova, assina e executa as faces;
 *   · a RECEPÇÃO (`recepcao@`, `admin`, sem alcance clínico) contrata, emite,
 *     registra a assinatura do paciente, recebe e tenta encerrar;
 *   · a PROPRIETÁRIA aparece só onde a regra é dela (dispensa) ou onde a
 *     regra a recusa (assinar pela parte profissional).
 * As sessões são reais: link mágico gerado pelo serviço e trocado por sessão
 * com `verifyOtp` — nenhuma senha passa por aqui. O serviço só PREPARA (o
 * paciente, o procedimento, a concessão) e LIMPA.
 *
 * O que fica provado:
 *   1. um contrato com plano, pacote e procedimento avulso ao mesmo tempo;
 *   2. o mesmo contrato dá o mesmo hash, e linha diferente dá hash diferente;
 *   3. sem as duas assinaturas, nada se executa (D-V8);
 *   4. TRAVA DUPLA: pagou tudo e falta face → aberto; executou tudo e há
 *      saldo → aberto; as duas → encerra;
 *   5. a cadeia plano → contrato → fatura fecha por query;
 *   6. a dispensa do `owner` libera, com registro.
 *
 * USO:  cd crm && node scripts/evidencia_contrato.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "../..");

function lerEnv(arquivo) {
  const vars = {};
  for (const linha of readFileSync(arquivo, "utf-8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim().replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1");
  }
  return vars;
}

const env = lerEnv(path.join(RAIZ, ".env"));
const URL = env.SUPABASE__URL;
const opcoesCliente = { auth: { autoRefreshToken: false, persistSession: false } };
const servico = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, opcoesCliente);

const EMAIL = {
  profissional: "terapeuta@vitrinedemo.local",
  recepcao: "recepcao@vitrinedemo.local",
  dona: "proprietaria@vitrinedemo.local",
};

const resultados = [];
function afirmar(nome, ok, detalhe = "") {
  resultados.push({ nome, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${nome}${detalhe ? `  — ${detalhe}` : ""}`);
}
function exigir(r, oque) {
  if (r.error) throw new Error(`${oque}: ${r.error.message}`);
  return r.data;
}

/** Sessão REAL do papel: link mágico trocado por sessão. */
async function sessao(email) {
  const { data, error } = await servico.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`link de ${email}: ${error.message}`);
  const c = createClient(URL, env.SUPABASE_ANON_KEY, opcoesCliente);
  const { error: e2 } = await c.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (e2) throw new Error(`sessão de ${email}: ${e2.message}`);
  return c;
}

// ------------------------------------------------------------ quem é quem
const perfis = exigir(
  await servico.from("profiles").select("id, user_id, account_id, email").in("email", Object.values(EMAIL)),
  "perfis",
);
const perfil = (e) => perfis.find((p) => p.email === e);
const conta = perfil(EMAIL.dona).account_id;
const prof = exigir(
  await servico.schema("aba_scheduling").from("profissionais").select("id").eq("profile_id", perfil(EMAIL.profissional).id).single(),
  "profissional",
);
const pacote = exigir(
  await servico.schema("aba_catalog").from("pacotes").select("id, nome, preco_total").eq("account_id", conta).eq("nome", "Pacote Facial — 5 sessões").single(),
  "pacote",
);
const { data: fases } = await servico.schema("aba_treatment").from("fases").select("id, chave").eq("account_id", conta);
const fase = fases.find((f) => f.chave === "definitiva") ?? fases[0];

const marca = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
const criado = { pessoa: null, procedimento: null, concessao: null, planos: [], contratos: [], dispensa: null };

async function limpar() {
  console.log("\nlimpeza (por identificador, só o que este script criou):");
  const passo = async (nome, f) => {
    const { error } = await f();
    console.log(error ? `  ✗ ${nome}: ${error.message}` : `  · ${nome}`);
  };
  const f = () => servico.schema("aba_finance");
  const t = () => servico.schema("aba_treatment");
  if (criado.contratos.length) {
    const { data: itens } = await f().from("itens_contrato").select("id, pacote_cliente_id").in("contrato_id", criado.contratos);
    const ids = (itens ?? []).map((i) => i.id);
    const pcs = (itens ?? []).map((i) => i.pacote_cliente_id).filter(Boolean);
    if (ids.length) await passo("execuções avulsas", () => f().from("execucoes_item_contrato").delete().in("item_contrato_id", ids));
    await passo("faturas dos contratos (cascata: pagamentos, itens)", () => f().from("faturas").delete().in("contrato_id", criado.contratos));
    await passo("contratos (cascata: linhas, assinaturas, trilha, parcelas)", () => f().from("contratos").delete().in("id", criado.contratos));
    if (pcs.length) await passo("pacotes vendidos na assinatura", () => f().from("pacotes_cliente").delete().in("id", pcs));
  }
  if (criado.planos.length) {
    await passo("faces executadas", () => t().from("execucoes_face").delete().in("plano_id", criado.planos));
    await passo("orçamentos a rascunho", () => f().from("orcamentos").update({ estado: "rascunho", aprovado_em: null, aprovado_por: null }).in("plano_id", criado.planos).neq("estado", "rascunho"));
    await passo("planos (cascata)", () => t().from("planos").delete().in("id", criado.planos));
  }
  if (criado.dispensa) await passo("dispensa", () => servico.schema("aba_catalog").from("dispensas_contrato").delete().eq("id", criado.dispensa));
  if (criado.concessao) await passo("concessão", () => servico.schema("aba_health").from("concessoes_prontuario").delete().eq("id", criado.concessao));
  if (criado.procedimento) await passo("procedimentos descartáveis", () => servico.schema("aba_catalog").from("procedimentos").delete().like("nome", `%(evidência 03.8.b ${marca})`));
  if (criado.pessoa) {
    await passo("log do paciente", () => servico.schema("aba_health").from("log_acesso").delete().eq("cliente_id", criado.pessoa));
    await passo("cliente", () => servico.schema("aba_people").from("clientes").delete().eq("id", criado.pessoa));
    await passo("pessoa", () => servico.schema("aba_people").from("pessoas").delete().eq("id", criado.pessoa));
  }
}

try {
  console.log("\n0) preparo pelo serviço: paciente, dois procedimentos odontológicos e a concessão nominal");
  const nome = `Paciente contrato 03.8.b ${marca}`;
  const pessoa = exigir(await servico.schema("aba_people").from("pessoas").insert({ account_id: conta, nome_exibicao: nome }).select("id").single(), "pessoa");
  criado.pessoa = pessoa.id;
  exigir(await servico.schema("aba_people").from("clientes").insert({ id: pessoa.id, account_id: conta, razao_social: nome, status: "ativo" }), "cliente");
  const { data: cat } = await servico.schema("aba_catalog").from("categorias").select("id").eq("account_id", conta).limit(1).single();
  const procs = exigir(
    await servico.schema("aba_catalog").from("procedimentos").insert([
      { account_id: conta, categoria_id: cat.id, nome: `Restauração em resina (evidência 03.8.b ${marca})`, preco_base: 300,
        unidade_lancamento: "dente", faces_minimo: 1, faces_maximo: 3, regiao_dentaria: "ambas" },
      { account_id: conta, categoria_id: cat.id, nome: `Profilaxia (evidência 03.8.b ${marca})`, preco_base: 150 },
    ]).select("id, nome"),
    "procedimentos",
  );
  const restauracao = procs.find((p) => p.nome.startsWith("Restauração"));
  const profilaxia = procs.find((p) => p.nome.startsWith("Profilaxia"));
  criado.procedimento = restauracao.id;
  const conc = exigir(
    await servico.schema("aba_health").from("concessoes_prontuario").insert({
      account_id: conta, usuario_concedido_id: perfil(EMAIL.profissional).user_id, escopo: "cliente_unico",
      cliente_id: pessoa.id, efeito: "permitir", motivo: "Evidência da Subetapa 03.8.b", concedido_por: perfil(EMAIL.dona).user_id,
    }).select("id").single(),
    "concessão",
  );
  criado.concessao = conc.id;

  const P = await sessao(EMAIL.profissional);
  const R = await sessao(EMAIL.recepcao);
  const D = await sessao(EMAIL.dona);
  const codigo = (r) => r.error?.code ?? null;

  // ---- o profissional monta DOIS planos: um com procedimento e pacote (para o arco), um só com procedimento (para a trava)
  async function montarPlanoAprovado(titulo, celulas) {
    const plano = exigir(await P.schema("aba_treatment").from("planos").insert({ account_id: conta, cliente_id: pessoa.id, titulo, profissional_id: prof.id }).select("id").single(), "plano");
    criado.planos.push(plano.id);
    const op = exigir(await P.schema("aba_treatment").from("opcoes").insert({ account_id: conta, plano_id: plano.id, rotulo: "A", ordem: 1 }).select("id").single(), "opção");
    for (const c of celulas) {
      exigir(await P.schema("aba_treatment").from("procedimentos_plano").insert({ account_id: conta, plano_id: plano.id, opcao_id: op.id, fase_id: fase.id, ...c }), "célula");
    }
    exigir(await P.schema("aba_treatment").rpc("consentir_opcao", { p_opcao_id: op.id }), "consentir");
    const orc = exigir(await P.schema("aba_finance").rpc("montar_orcamento", { p_opcao_id: op.id, p_profissional_id: prof.id }), "montar");
    exigir(await P.schema("aba_finance").rpc("aprovar_orcamento", { p_orcamento_id: orc }), "aprovar");
    return { plano: plano.id, opcao: op.id, orcamento: orc };
  }

  console.log("\n1) o contrato com os TRÊS tipos de linha");
  const p1 = await montarPlanoAprovado("Plano com pacote", [
    { procedimento_id: restauracao.id, dente: "16", faces: ["mesial"] },
    { pacote_id: pacote.id },
  ]);
  const naCadeira = await P.schema("aba_finance").rpc("contratar_opcao", { p_orcamento_id: p1.orcamento });
  afirmar("o PROFISSIONAL não contrata (é da recepção)", codigo(naCadeira) === "42501");
  const c1 = exigir(await R.schema("aba_finance").rpc("contratar_opcao", { p_orcamento_id: p1.orcamento }), "contratar");
  criado.contratos.push(c1);
  exigir(await R.schema("aba_finance").rpc("acrescentar_item_contrato", { p_contrato_id: c1, p_procedimento_id: profilaxia.id, p_pacote_id: null, p_quantidade: 1 }), "avulso");
  const { data: lidos } = await R.schema("aba_finance").rpc("ler_contratos_do_cliente", { p_cliente_id: pessoa.id });
  const tipos = lidos.find((c) => c.id === c1).itens.map((i) => i.tipo).sort();
  afirmar("a recepção lê o contrato com plano, pacote e procedimento", tipos.join() === "pacote,plano,procedimento", tipos.join());
  afirmar("sem nada clínico na leitura da recepção", !/"dente"|mesial/.test(JSON.stringify(lidos)));

  // Um plano de OUTRO paciente da mesma clínica — o caso que a chave composta
  // não cobre e só o gatilho recusa. Tentado pelo serviço, que passa por cima
  // da RLS: a recusa tem de vir da regra, não da permissão.
  const { data: outroPlano } = await servico.schema("aba_treatment").from("planos")
    .select("id, cliente_id").eq("account_id", conta).neq("cliente_id", pessoa.id).limit(1).maybeSingle();
  if (outroPlano) {
    const planoDeOutro = await servico.schema("aba_finance").from("itens_contrato").insert({ account_id: conta, contrato_id: c1, plano_id: outroPlano.id, valor_unitario: 1 });
    afirmar("o plano de OUTRO paciente não entra no contrato (23514, pelo gatilho)", codigo(planoDeOutro) === "23514" && /outro paciente/.test(planoDeOutro.error?.message ?? ""));
  } else {
    afirmar("há plano de outro paciente na conta para o ataque", false, "conta sem outro plano");
  }
  const direto = await R.schema("aba_finance").from("itens_contrato").insert({ account_id: conta, contrato_id: c1, procedimento_id: profilaxia.id, degrau: "catalogo", valor_unitario: 1 });
  afirmar("a recepção não escreve linha direto pelo PostgREST (42501)", codigo(direto) === "42501");

  console.log("\n2) o documento canônico: mesmo contrato, mesmo hash");
  const h1 = exigir(await R.schema("aba_finance").rpc("emitir_documento_contrato", { p_contrato_id: c1 }), "emitir");
  const conf = exigir(await R.schema("aba_finance").rpc("conferir_documento_contrato", { p_contrato_id: c1 }), "conferir")[0];
  afirmar("renderizado de novo dá o MESMO hash, e o texto guardado bate", conf.hash_renderizado_agora === h1 && conf.integro, h1.slice(0, 16));
  const { data: linhas } = await R.schema("aba_finance").from("itens_contrato").select("id, procedimento_id").eq("contrato_id", c1);
  exigir(await R.schema("aba_finance").rpc("remover_item_contrato", { p_item_id: linhas.find((l) => l.procedimento_id).id }), "remover");
  const h2 = exigir(await R.schema("aba_finance").rpc("emitir_documento_contrato", { p_contrato_id: c1 }), "reemitir");
  afirmar("linha diferente dá hash DIFERENTE", h2 !== h1);
  const { data: doc } = await R.schema("aba_finance").from("contratos").select("documento_html").eq("id", c1).single();
  afirmar("o documento não carrega dente, face nem título do plano", !/dente|mesial|Plano com pacote/.test(doc.documento_html));
  exigir(await R.schema("aba_finance").from("contratos").update({ status: "cancelado" }).eq("id", c1), "cancelar rascunho");

  console.log("\n3) o contrato do plano: assinatura, D-V8 e a primeira metade da trava");
  const p2 = await montarPlanoAprovado("Plano só restauração", [{ procedimento_id: restauracao.id, dente: "26", faces: ["mesial", "oclusal"] }]);
  const c2 = exigir(await R.schema("aba_finance").rpc("contratar_opcao", { p_orcamento_id: p2.orcamento }), "contratar 2");
  criado.contratos.push(c2);
  const h = exigir(await R.schema("aba_finance").rpc("emitir_documento_contrato", { p_contrato_id: c2 }), "emitir 2");
  const { data: celula } = await servico.schema("aba_treatment").from("procedimentos_plano").select("id").eq("plano_id", p2.plano).single();
  const cedo = await P.schema("aba_treatment").from("execucoes_face").insert({ account_id: conta, plano_id: p2.plano, procedimento_plano_id: celula.id, face: "mesial" });
  afirmar("D-V8: contrato em rascunho, o profissional NÃO executa", codigo(cedo) === "23514" && /D-V8/.test(cedo.error?.message ?? ""));
  const { data: ass } = await R.schema("aba_finance").from("assinaturas_contrato").select("parte, via").eq("contrato_id", c2);
  afirmar("cópia fiel do orçamento: a assinatura do profissional DERIVOU da aprovação", ass.length === 1 && ass[0].via === "aprovacao_orcamento");
  const dona = await D.schema("aba_finance").rpc("assinar_contrato_como_profissional", { p_contrato_id: c2, p_hash: h });
  afirmar("a proprietária não assina pela parte profissional", dona.error !== null);
  exigir(await R.schema("aba_finance").rpc("registrar_assinatura_paciente", { p_contrato_id: c2, p_hash: h }), "assinatura do paciente");
  const { data: c2lido } = await servico.schema("aba_finance").from("contratos").select("status, valor").eq("id", c2).single();
  afirmar("com as duas assinaturas, ASSINADO", c2lido.status === "assinado");

  exigir(await P.schema("aba_treatment").from("execucoes_face").insert({ account_id: conta, plano_id: p2.plano, procedimento_plano_id: celula.id, face: "mesial" }), "face mesial");
  const { data: faturas } = await R.schema("aba_finance").from("faturas").select("id, valor, status").eq("contrato_id", c2);
  afirmar("a assinatura soltou a fatura prevista, em rascunho", faturas.length === 1 && faturas[0].status === "rascunho" && Number(faturas[0].valor) === Number(c2lido.valor));
  exigir(await R.schema("aba_finance").from("pagamentos").insert({ account_id: conta, fatura_id: faturas[0].id, valor: Number(faturas[0].valor), forma_pagamento: "pix" }), "pagamento");
  const trava1 = await R.schema("aba_finance").rpc("encerrar_contrato", { p_contrato_id: c2 });
  afirmar("TRAVA DUPLA (1/2): PAGOU TUDO e falta uma face → continua ABERTO", codigo(trava1) === "23514" && /falta execução \(1 de 2/.test(trava1.error.message) && !/falta pagamento/.test(trava1.error.message), trava1.error?.message);

  exigir(await P.schema("aba_treatment").from("execucoes_face").insert({ account_id: conta, plano_id: p2.plano, procedimento_plano_id: celula.id, face: "oclusal" }), "face oclusal");
  exigir(await R.schema("aba_finance").rpc("encerrar_contrato", { p_contrato_id: c2 }), "encerrar 2");
  const { data: c2fim } = await servico.schema("aba_finance").from("contratos").select("status").eq("id", c2).single();
  afirmar("pago E executado: ENCERRADO", c2fim.status === "encerrado");

  const { data: cadeia } = await servico.schema("aba_finance").from("itens_contrato")
    .select("plano_id, contratos!inner(id, faturas(id))").eq("plano_id", p2.plano);
  afirmar("a cadeia plano → contrato → fatura fecha por query", cadeia?.[0]?.contratos?.faturas?.length === 1, JSON.stringify(cadeia?.[0]?.contratos?.faturas?.length));

  console.log("\n4) a segunda metade: executou tudo e há saldo");
  const c3 = exigir(await R.schema("aba_finance").rpc("criar_contrato_avulso", { p_cliente_id: pessoa.id, p_profissional_id: prof.id }), "avulso");
  criado.contratos.push(c3);
  const item3 = exigir(await R.schema("aba_finance").rpc("acrescentar_item_contrato", { p_contrato_id: c3, p_procedimento_id: profilaxia.id, p_pacote_id: null, p_quantidade: 1 }), "linha avulsa");
  const h3 = exigir(await R.schema("aba_finance").rpc("emitir_documento_contrato", { p_contrato_id: c3 }), "emitir 3");
  exigir(await P.schema("aba_finance").rpc("assinar_contrato_como_profissional", { p_contrato_id: c3, p_hash: h3 }), "profissional assina 3");
  exigir(await R.schema("aba_finance").rpc("registrar_assinatura_paciente", { p_contrato_id: c3, p_hash: h3 }), "paciente assina 3");
  exigir(await P.schema("aba_finance").rpc("registrar_execucao_item", { p_item_id: item3 }), "execução avulsa");
  const trava2 = await R.schema("aba_finance").rpc("encerrar_contrato", { p_contrato_id: c3 });
  afirmar("TRAVA DUPLA (2/2): EXECUTOU TUDO e há saldo → continua ABERTO", codigo(trava2) === "23514" && /falta pagamento/.test(trava2.error.message) && !/falta execução/.test(trava2.error.message), trava2.error?.message);

  console.log("\n5) a dispensa do owner (D-V8)");
  const p4 = await montarPlanoAprovado("Plano sem contrato", [{ procedimento_id: profilaxia.id }]);
  const { data: cel4 } = await servico.schema("aba_treatment").from("procedimentos_plano").select("id").eq("plano_id", p4.plano).single();
  const semContrato = await P.schema("aba_treatment").from("execucoes_face").insert({ account_id: conta, plano_id: p4.plano, procedimento_plano_id: cel4.id, face: null });
  afirmar("sem contrato, a profilaxia não se executa", codigo(semContrato) === "23514");
  const pelaRecepcao = await R.schema("aba_catalog").from("dispensas_contrato").insert({ account_id: conta, procedimento_id: profilaxia.id, justificativa: "Procedimento simples de consultório." });
  afirmar("a recepção não dispensa", codigo(pelaRecepcao) === "42501");
  const disp = exigir(await D.schema("aba_catalog").from("dispensas_contrato").insert({ account_id: conta, procedimento_id: profilaxia.id, justificativa: "Profilaxia de rotina: risco assumido pela proprietária." }).select("id, dispensada_por").single(), "dispensa");
  criado.dispensa = disp.id;
  afirmar("a proprietária dispensa, com o nome dela no registro", disp.dispensada_por === perfil(EMAIL.dona).user_id);
  const comDispensa = await P.schema("aba_treatment").from("execucoes_face").insert({ account_id: conta, plano_id: p4.plano, procedimento_plano_id: cel4.id, face: null });
  afirmar("com a dispensa, o profissional executa", comDispensa.error === null, comDispensa.error?.message);

  const { data: escritas } = await servico.schema("aba_health").from("log_acesso")
    .select("contexto").eq("cliente_id", pessoa.id).eq("usuario_ator_id", perfil(EMAIL.profissional).user_id).eq("acao", "criacao");
  afirmar("as faces executadas ficaram no log clínico, pela sessão do profissional", (escritas ?? []).filter((l) => l.contexto?.tabela === "execucoes_face").length === 3);
} catch (e) {
  afirmar("a evidência terminou sem exceção", false, String(e?.message ?? e));
} finally {
  await limpar();
}

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} verificações verdes.`);
process.exit(falhas.length ? 1 : 0);
