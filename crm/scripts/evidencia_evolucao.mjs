#!/usr/bin/env node
/**
 * Evidência de BANCO da Subetapa 03.7.b — a sessão clínica que escreve, em
 * PRODUÇÃO, com os papéis que usam o fluxo de verdade.
 *
 * A suíte `23_evolucao_sessao.spec.ts` prova as regras no banco de TESTES.
 * Esta prova a mesma corrente no banco que serve a vitrine pública, depois da
 * aplicação da 053 por MCP — além do hash, é a única forma de saber que a
 * transcrição não mudou comportamento (`instrucoes.md` §5).
 *
 * NENHUM PASSO DO FLUXO RODA COMO `owner` NEM COMO SERVIÇO (lição da 03.8.c):
 *   · o PROFISSIONAL (`terapeuta@`, `agent`, com concessão NOMINAL do
 *     paciente) abre a sessão, escreve, assina, registra adendo e a recusa;
 *   · a RECEPÇÃO (`recepcao@`, `admin`, sem alcance clínico) tenta escrever e
 *     tenta registrar a recusa, e é barrada.
 * O serviço só PREPARA (paciente e concessão), faz os dois ataques que só um
 * caminho de servidor faz (recusa sem sessão, destravar) e LIMPA.
 *
 * USO:  cd crm && node scripts/evidencia_evolucao.mjs
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

const perfis = exigir(
  await servico.from("profiles").select("id, user_id, account_id, email, account_role").in("email", Object.values(EMAIL)),
  "perfis",
);
const perfil = (e) => perfis.find((p) => p.email === e);
const conta = perfil(EMAIL.dona).account_id;
const prof = exigir(
  await servico.schema("aba_scheduling").from("profissionais").select("id").eq("profile_id", perfil(EMAIL.profissional).id).single(),
  "profissional",
);

const marca = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
const criado = { pessoa: null, concessao: null, evolucoes: [] };

async function limpar() {
  console.log("\nlimpeza (por identificador, só o que este script criou):");
  const passo = async (nome, f) => {
    const { error } = await f();
    console.log(error ? `  ✗ ${nome}: ${error.message}` : `  · ${nome}`);
  };
  const h = () => servico.schema("aba_health");
  if (criado.pessoa) await passo("log do paciente", () => h().from("log_acesso").delete().eq("cliente_id", criado.pessoa));
  if (criado.evolucoes.length) {
    // Adendo primeiro: apagar a original faria `adendo_de_id` virar NULL por
    // UPDATE, e o gatilho da 013 recusa UPDATE em linha travada.
    await passo("adendos", () => h().from("evolucoes").delete().in("id", criado.evolucoes).not("adendo_de_id", "is", null));
    await passo("evoluções", () => h().from("evolucoes").delete().in("id", criado.evolucoes));
  }
  if (criado.concessao) await passo("concessão", () => h().from("concessoes_prontuario").delete().eq("id", criado.concessao));
  if (criado.pessoa) {
    await passo("cliente", () => servico.schema("aba_people").from("clientes").delete().eq("id", criado.pessoa));
    await passo("pessoa", () => servico.schema("aba_people").from("pessoas").delete().eq("id", criado.pessoa));
  }
}

try {
  console.log("\n0) preparo pelo serviço: paciente e concessão nominal ao profissional");
  const nome = `Paciente evolução 03.7.b ${marca}`;
  const pessoa = exigir(await servico.schema("aba_people").from("pessoas").insert({ account_id: conta, nome_exibicao: nome }).select("id").single(), "pessoa");
  criado.pessoa = pessoa.id;
  exigir(await servico.schema("aba_people").from("clientes").insert({ id: pessoa.id, account_id: conta, razao_social: nome, status: "ativo" }), "cliente");
  const conc = exigir(
    await servico.schema("aba_health").from("concessoes_prontuario").insert({
      account_id: conta, usuario_concedido_id: perfil(EMAIL.profissional).user_id, escopo: "cliente_unico",
      cliente_id: pessoa.id, efeito: "permitir", motivo: "Evidência 03.7.b", concedido_por: perfil(EMAIL.dona).user_id,
    }).select("id").single(),
    "concessão",
  );
  criado.concessao = conc.id;
  console.log(`  papéis: profissional=${perfil(EMAIL.profissional).account_role}, recepção=${perfil(EMAIL.recepcao).account_role}`);

  const profissional = await sessao(EMAIL.profissional);
  const recepcao = await sessao(EMAIL.recepcao);
  const hp = () => profissional.schema("aba_health");
  const ler = async () => exigir(await hp().rpc("ler_evolucoes", { p_cliente_id: pessoa.id }), "ler_evolucoes");

  console.log("\n1) o profissional abre a sessão e escreve em duas gravações");
  const ev = exigir(
    await hp().from("evolucoes").insert({ account_id: conta, cliente_id: pessoa.id, profissional_id: prof.id, marcacoes: [] }).select("id").single(),
    "abrir sessão",
  );
  criado.evolucoes.push(ev.id);
  afirmar("sessão aberta pelo profissional, sem texto", true);
  const g1 = await hp().from("evolucoes").update({ avaliacao: "Dor à percussão no 16.", notas_procedimento: "Remoção de cárie e restauração." }).eq("id", ev.id);
  const g2 = await hp().from("evolucoes").update({ resultado: "Concluída.", proximos_passos: "Retorno em 7 dias.", intercorrencia: "Sangramento leve, contido." }).eq("id", ev.id);
  afirmar("duas gravações separadas aceitas", !g1.error && !g2.error, g1.error?.message ?? g2.error?.message ?? "");
  let linha = (await ler()).find((e) => e.id === ev.id);
  afirmar(
    "o texto volta ÍNTEGRO por ler_evolucoes, com a intercorrência no lugar dela",
    linha.avaliacao === "Dor à percussão no 16." && linha.notas_procedimento === "Remoção de cárie e restauração." &&
      linha.resultado === "Concluída." && linha.proximos_passos === "Retorno em 7 dias." && linha.intercorrencia === "Sangramento leve, contido.",
  );
  const dir = await hp().from("evolucoes").select("intercorrencia").eq("id", ev.id);
  afirmar("intercorrência ilegível direto", dir.error?.code === "42501", `SQLSTATE ${dir.error?.code}`);

  console.log("\n2) a recepção, sem alcance clínico");
  const rUp = await recepcao.schema("aba_health").from("evolucoes").update({ intercorrencia: "escrito pela recepção" }).eq("id", ev.id).select("id");
  linha = (await ler()).find((e) => e.id === ev.id);
  afirmar("não escreve na sessão (zero linhas, texto intacto)", (rUp.data ?? []).length === 0 && linha.intercorrencia === "Sangramento leve, contido.");

  console.log("\n3) antes do fecho, a recusa não existe");
  const r0 = await hp().rpc("registrar_recusa_assinatura", { p_evolucao_id: ev.id, p_motivo: "não quis" });
  afirmar("recusa sobre evolução aberta recusada", r0.error?.code === "23514" && /assine a sessão primeiro/.test(r0.error.message), `SQLSTATE ${r0.error?.code}`);

  console.log("\n4) o profissional assina; o texto congela; o adendo continua");
  exigir(await hp().from("evolucoes").update({ travada: true }).eq("id", ev.id), "assinar");
  const alt = await hp().from("evolucoes").update({ intercorrencia: "trocada depois" }).eq("id", ev.id);
  afirmar("evolução assinada recusa texto novo", alt.error?.code === "23514" && /travada não aceita/.test(alt.error.message), `SQLSTATE ${alt.error?.code}`);
  const ad = await hp().from("evolucoes").insert({ account_id: conta, cliente_id: pessoa.id, profissional_id: prof.id, adendo_de_id: ev.id, avaliacao: "Adendo: sensibilidade ao frio." }).select("id").single();
  if (ad.data) criado.evolucoes.push(ad.data.id);
  afirmar("adendo gravado sobre evolução assinada", !ad.error, ad.error?.message ?? "");

  console.log("\n5) a recusa do paciente");
  const semSessao = await servico.schema("aba_health").rpc("registrar_recusa_assinatura", { p_evolucao_id: ev.id, p_motivo: "sem sessão" });
  afirmar("sem sessão autenticada: barrada com mensagem própria", semSessao.error?.code === "42501" && /exige sessão autenticada/.test(semSessao.error.message), semSessao.error?.message ?? "");
  const rRec = await recepcao.schema("aba_health").rpc("registrar_recusa_assinatura", { p_evolucao_id: ev.id, p_motivo: "recepção" });
  afirmar("recepção sem alcance não registra", rRec.error?.code === "42501", `SQLSTATE ${rRec.error?.code}`);
  const branco = await hp().rpc("registrar_recusa_assinatura", { p_evolucao_id: ev.id, p_motivo: "   " });
  afirmar("motivo em branco recusado", branco.error?.code === "23514", `SQLSTATE ${branco.error?.code}`);
  const forjada = await hp().from("evolucoes").update({ recusa_assinatura_em: new Date().toISOString(), recusa_assinatura_por: perfil(EMAIL.profissional).user_id, recusa_assinatura_motivo: "forjada" }).eq("id", ev.id);
  afirmar("UPDATE direto da recusa morre no privilégio de coluna", forjada.error?.code === "42501", `SQLSTATE ${forjada.error?.code}`);
  const ok = await hp().rpc("registrar_recusa_assinatura", { p_evolucao_id: ev.id, p_motivo: "  Quer ler em casa antes de assinar.  " });
  linha = (await ler()).find((e) => e.id === ev.id);
  afirmar(
    "recusa registrada: autor e data pelo banco, motivo aparado, texto intacto",
    !ok.error && linha.recusa_assinatura_por === perfil(EMAIL.profissional).user_id && !!linha.recusa_assinatura_em &&
      linha.recusa_assinatura_motivo === "Quer ler em casa antes de assinar." && linha.travada === true && linha.avaliacao === "Dor à percussão no 16.",
    `em ${linha.recusa_assinatura_em}`,
  );
  const deNovo = await hp().rpc("registrar_recusa_assinatura", { p_evolucao_id: ev.id, p_motivo: "outro" });
  afirmar("a recusa não se refaz", deNovo.error?.code === "23514" && /já foi registrada/.test(deNovo.error.message), `SQLSTATE ${deNovo.error?.code}`);
  const destravar = await servico.schema("aba_health").from("evolucoes").update({ travada: false }).eq("id", ev.id);
  afirmar("nem o servidor destrava a evolução recusada", destravar.error?.code === "23514", `SQLSTATE ${destravar.error?.code}`);

  console.log("\n6) o rastro");
  const { data: log } = await servico.schema("aba_health").from("log_acesso").select("acao, usuario_ator_id").eq("registro_id", ev.id);
  const doProf = (log ?? []).filter((l) => l.usuario_ator_id === perfil(EMAIL.profissional).user_id);
  const cont = (a) => doProf.filter((l) => l.acao === a).length;
  afirmar(
    "log_acesso: criação, gravações, assinatura e recusa registradas; leituras registradas",
    cont("criacao") === 1 && cont("atualizacao") >= 4 && cont("leitura") >= 1,
    `criação ${cont("criacao")}, atualização ${cont("atualizacao")}, leitura ${cont("leitura")}`,
  );
} catch (e) {
  afirmar(`execução interrompida: ${e.message}`, false);
} finally {
  await limpar();
  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\n${resultados.length - falhas}/${resultados.length} verdes\n`);
  process.exit(falhas ? 1 : 0);
}
