#!/usr/bin/env node
/**
 * Evidência de BANCO da Subetapa 03.9 — multiunidade e trava de nível, em
 * PRODUÇÃO, com sessões reais.
 *
 * A suíte `24_adversarial_multiunidade.spec.ts` prova as regras no banco de
 * TESTES. Esta prova a mesma corrente no banco que serve a vitrine pública,
 * depois da aplicação das 054–057 por MCP: além do hash, é a única forma de
 * saber que a transcrição não mudou comportamento (`instrucoes.md` §5).
 *
 * AS PERSONAGENS:
 *   · `multi` — login DESCARTÁVEL criado por este script: owner da clínica
 *     própria (E, com paciente e evolução) e AGENT na clínica de demonstração.
 *     Duas sessões reais (dois "aparelhos").
 *   · `dona` (`proprietaria@`, owner da demonstração, perfil único).
 *   · `recepcao` (`recepcao@`, admin da demonstração, perfil único) — prova
 *     que quem tem uma clínica só não percebe mudança nenhuma.
 * O serviço só PREPARA e LIMPA, por identificador.
 *
 * USO:  cd crm && node scripts/evidencia_multiunidade.mjs
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

const EMAIL = { dona: "proprietaria@vitrinedemo.local", recepcao: "recepcao@vitrinedemo.local" };

const resultados = [];
function afirmar(nome, ok, detalhe = "") {
  resultados.push({ nome, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${nome}${detalhe ? `  — ${detalhe}` : ""}`);
}
function exigir(r, oque) {
  if (r.error) throw new Error(`${oque}: ${r.error.message}`);
  return r.data;
}

/** Sessão REAL: link mágico trocado por sessão. Cada chamada é uma sessão nova. */
async function sessao(email) {
  const { data, error } = await servico.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`link de ${email}: ${error.message}`);
  const c = createClient(URL, env.SUPABASE_ANON_KEY, opcoesCliente);
  const { error: e2 } = await c.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (e2) throw new Error(`sessão de ${email}: ${e2.message}`);
  return c;
}

const marca = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
const emailMulti = `evidencia-0309-${marca}@vitrinedemo.local`;
const criado = { userId: null, contaE: null, perfilDemo: null, funcionarioDemo: null, pessoaFuncionarioDemo: null, evolucaoE: null, profissionalE: null };

const perfilDona = exigir(await servico.from("profiles").select("user_id, account_id").eq("email", EMAIL.dona).single(), "dona");
const DEMO = perfilDona.account_id;

async function limpar() {
  console.log("\nlimpeza (por identificador, só o que este script criou):");
  const passo = async (nome, f) => {
    const { error } = await f();
    console.log(error ? `  ✗ ${nome}: ${error.message}` : `  · ${nome}`);
  };
  if (criado.evolucaoE) {
    await passo("log da clínica E", () => servico.schema("aba_health").from("log_acesso").delete().eq("account_id", criado.contaE));
    await passo("evolução de E", () => servico.schema("aba_health").from("evolucoes").delete().eq("id", criado.evolucaoE));
  }
  if (criado.profissionalE) await passo("profissional de E", () => servico.schema("aba_scheduling").from("profissionais").delete().eq("id", criado.profissionalE));
  if (criado.perfilDemo) await passo("perfil na demonstração (se restou)", () => servico.from("profiles").delete().eq("id", criado.perfilDemo));
  if (criado.funcionarioDemo) {
    await passo("funcionário-retrato na demonstração", () => servico.schema("aba_people").from("funcionarios").delete().eq("id", criado.funcionarioDemo));
    await passo("pessoa do funcionário na demonstração", () => servico.schema("aba_people").from("pessoas").delete().eq("id", criado.funcionarioDemo));
  }
  if (criado.contaE) await passo("clínica E (cascata)", () => servico.from("accounts").delete().eq("id", criado.contaE));
  if (criado.userId) {
    const { error } = await servico.auth.admin.deleteUser(criado.userId);
    console.log(error ? `  ✗ login descartável: ${error.message}` : "  · login descartável");
  }
}

try {
  console.log("\n0) preparo pelo serviço: login descartável com clínica própria (E) + perfil de agent na demonstração");
  const u = exigir(await servico.auth.admin.createUser({ email: emailMulti, email_confirm: true }), "login");
  criado.userId = u.user.id;
  const perfilE = exigir(await servico.from("profiles").select("id, account_id").eq("user_id", criado.userId).single(), "perfil E");
  criado.contaE = perfilE.account_id;

  const nome = `Paciente de E 03.9 ${marca}`;
  const pessoa = exigir(await servico.schema("aba_people").from("pessoas").insert({ account_id: criado.contaE, nome_exibicao: nome }).select("id").single(), "pessoa E");
  exigir(await servico.schema("aba_people").from("clientes").insert({ id: pessoa.id, account_id: criado.contaE, razao_social: nome, status: "ativo" }), "cliente E");
  const funcE = exigir(await servico.schema("aba_people").from("funcionarios").select("id").eq("profile_id", perfilE.id).single(), "funcionário E");
  const profE = exigir(await servico.schema("aba_scheduling").from("profissionais").insert({
    account_id: criado.contaE, nome_exibicao: "Prof E 03.9", funcionario_id: funcE.id, profile_id: perfilE.id, ativo: true, acesso_clinico: true,
  }).select("id").single(), "profissional E");
  criado.profissionalE = profE.id;
  const evo = exigir(await servico.schema("aba_health").from("evolucoes").insert({
    account_id: criado.contaE, cliente_id: pessoa.id, profissional_id: profE.id, avaliacao: "segredo clínico da clínica E",
  }).select("id").single(), "evolução E");
  criado.evolucaoE = evo.id;
  const form = exigir(await servico.schema("aba_health").from("formularios_anamnese").insert({
    account_id: criado.contaE, nome: `Anamnese sigilosa de E ${marca}`, perguntas: [],
  }).select("id").single(), "formulário E");

  const pDemo = exigir(await servico.from("profiles").insert({
    user_id: criado.userId, account_id: DEMO, account_role: "agent", full_name: "Evidência 03.9", email: emailMulti,
  }).select("id").single(), "perfil na demonstração");
  criado.perfilDemo = pDemo.id;
  const fDemo = exigir(await servico.schema("aba_people").from("funcionarios").select("id").eq("profile_id", pDemo.id).single(), "funcionário demo");
  criado.funcionarioDemo = fDemo.id;

  const s1 = await sessao(emailMulti);
  const s2 = await sessao(emailMulti);
  const dona = await sessao(EMAIL.dona);
  const recepcao = await sessao(EMAIL.recepcao);

  console.log("\n1) duas clínicas, nenhuma escolha: nada");
  afirmar("conta ativa nula sem escolha", (await s1.rpc("active_account_id")).data === null);
  afirmar("clientes vazios sem escolha", (exigir(await s1.schema("aba_people").from("clientes").select("id"), "clientes")).length === 0);
  const minhas = exigir(await s1.rpc("my_accounts"), "my_accounts");
  afirmar("seletor mostra as duas clínicas com o papel de cada uma",
    minhas.length === 2 && minhas.some((m) => m.account_id === DEMO && m.account_role === "agent") && minhas.some((m) => m.account_id === criado.contaE && m.account_role === "owner"));

  console.log("\n2) S1 ativa na demonstração (agent): nada de E, e nada do owner de E");
  exigir(await s1.rpc("set_active_account", { p_account_id: DEMO }), "escolher demonstração");
  afirmar("access.can('health') = false (não herda o owner de E)", (await s1.schema("access").rpc("can", { p_module_key: "health", p_action: "read" })).data === false);
  afirmar("ler_evolucoes do paciente de E volta vazio", (exigir(await s1.schema("aba_health").rpc("ler_evolucoes", { p_cliente_id: pessoa.id }), "ler")).length === 0);
  const clientesS1 = exigir(await s1.schema("aba_people").from("clientes").select("account_id"), "clientes S1");
  afirmar("clientes só da demonstração", clientesS1.length > 0 && clientesS1.every((c) => c.account_id === DEMO), `${clientesS1.length} linha(s)`);
  afirmar("criar convite recusado (agent)", (await s1.rpc("criar_convite", { p_role: "viewer" })).error?.code === "42501");

  console.log("\n3) S2 ativa em E (owner): lê a própria clínica, nada da demonstração");
  exigir(await s2.rpc("set_active_account", { p_account_id: criado.contaE }), "escolher E");
  afirmar("ler_evolucoes do paciente de E devolve a evolução", (exigir(await s2.schema("aba_health").rpc("ler_evolucoes", { p_cliente_id: pessoa.id }), "ler E")).length === 1);
  const clientesS2 = exigir(await s2.schema("aba_people").from("clientes").select("account_id"), "clientes S2");
  afirmar("clientes só de E", clientesS2.length === 1 && clientesS2[0].account_id === criado.contaE);
  afirmar("S1 continua na demonstração (escolha por sessão)", (await s1.rpc("active_account_id")).data === DEMO);

  console.log("\n4) quem tem uma clínica só não percebe mudança");
  afirmar("dona entra direto na demonstração", (await dona.rpc("active_account_id")).data === DEMO);
  afirmar("recepção lê o próprio perfil por user_id, como a tela publicada faz",
    (exigir(await recepcao.from("profiles").select("id").eq("email", EMAIL.recepcao).maybeSingle(), "perfil recepção")) !== null);
  afirmar("menu da recepção continua com módulos", (exigir(await recepcao.schema("access").rpc("readable_modules"), "menu")).length > 0);
  const niveis = exigir(await dona.schema("licensing").rpc("account_modules"), "módulos");
  afirmar("demonstração em diamante com todos os módulos liberados", niveis.length >= 11 && niveis.every((m) => m.enabled && m.tier_key === "diamante"));

  console.log("\n5) o achado dos formulários, em produção");
  afirmar("dona da demonstração não lê o formulário de E", (exigir(await dona.schema("aba_health").from("formularios_anamnese").select("id").eq("id", form.id), "form")).length === 0);
  const alt = await dona.schema("aba_health").from("formularios_anamnese").update({ nome: "alterado por estranho" }).eq("id", form.id).select("id");
  afirmar("dona da demonstração não altera o formulário de E", (alt.data ?? []).length === 0);

  console.log("\n6) gestão de membro não atravessa clínica");
  exigir(await dona.rpc("set_member_role", { p_user_id: criado.userId, p_new_role: "viewer" }), "rebaixar");
  const papeis = exigir(await servico.from("profiles").select("account_id, account_role").eq("user_id", criado.userId), "papéis");
  afirmar("rebaixado a viewer SÓ na demonstração; em E continua owner",
    papeis.find((p) => p.account_id === DEMO)?.account_role === "viewer" && papeis.find((p) => p.account_id === criado.contaE)?.account_role === "owner");
  exigir(await dona.rpc("remove_account_member", { p_user_id: criado.userId }), "remover");
  const restantes = exigir(await servico.from("profiles").select("account_id").eq("user_id", criado.userId), "restantes");
  afirmar("removido da demonstração sem ganhar conta nova", restantes.length === 1 && restantes[0].account_id === criado.contaE);
  if (restantes.every((p) => p.account_id !== DEMO)) criado.perfilDemo = null;
  afirmar("S1, que estava na demonstração, fica sem clínica (nunca cai em E)", (await s1.rpc("active_account_id")).data === null);
  afirmar("S1 sem clínica não lê clientes", (exigir(await s1.schema("aba_people").from("clientes").select("id"), "clientes S1 pós")).length === 0);
  const ret = exigir(await servico.schema("aba_people").from("funcionarios").select("ativo, profile_id").eq("id", criado.funcionarioDemo).single(), "retrato");
  afirmar("funcionário na demonstração virou retrato de ex-membro", ret.ativo === false && ret.profile_id === null);

  console.log("\n7) portas e guardas");
  afirmar("anônimo não escolhe clínica", (await createClient(URL, env.SUPABASE_ANON_KEY, opcoesCliente).rpc("set_active_account", { p_account_id: DEMO })).error !== null);
  for (const g of ["politicas_sem_cerca_de_conta", "funcoes_sem_conta_ativa", "atalhos_de_owner_sem_nivel", "modulos_sem_linha_de_nivel", "fks_sem_isolamento_de_conta"]) {
    afirmar(`guarda ${g} = 0`, (exigir(await servico.rpc(g), g)).length === 0);
  }
  afirmar("guarda não executável por sessão de conta", (await dona.rpc("funcoes_sem_conta_ativa")).error !== null);
} catch (e) {
  afirmar("execução sem exceção", false, e.message);
} finally {
  await limpar();
  const { data: sobra } = await servico.from("profiles").select("id").eq("email", emailMulti);
  const { data: sobraF } = criado.funcionarioDemo
    ? await servico.schema("aba_people").from("funcionarios").select("id").eq("id", criado.funcionarioDemo)
    : { data: [] };
  afirmar("resíduo zero (perfil e funcionário)", (sobra ?? []).length === 0 && (sobraF ?? []).length === 0);
  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\n${resultados.length - falhas}/${resultados.length} verdes`);
  process.exit(falhas ? 1 : 0);
}
