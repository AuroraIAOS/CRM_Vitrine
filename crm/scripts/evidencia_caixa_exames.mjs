#!/usr/bin/env node
/**
 * Evidência da Subetapa 03.11 — caixa de entrada de exames, em PRODUÇÃO,
 * com sessão real.
 *
 * A suíte `26_caixa_de_entrada_exames.spec.ts` prova as regras no banco de
 * TESTES. Esta exerce o CICLO COMPLETO no projeto que serve a vitrine, depois
 * da 060 aplicada por MCP e da Edge Function `remessa-rejeitar` publicada:
 * laboratório envia por link → cai na caixa, não no prontuário → conferir →
 * aceitar → aparece no prontuário e abre; o outro arquivo é rejeitado e some.
 * Com a contagem de `aba_health.log_acesso` de cada ato.
 *
 * PERSONAGENS, por link mágico (nunca senha): `dona` (`proprietaria@`, owner)
 * e `recepcao` (`recepcao@`, admin SEM acesso clínico — o controle negativo
 * com papel real). O laboratório é quem chama o endpoint público, sem sessão.
 * O serviço só PREPARA (paciente e laboratório de fixture), LÊ carimbos e
 * log, e LIMPA por identificador.
 *
 * USO:  cd crm && node scripts/evidencia_caixa_exames.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
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
const FUNCAO_TOKEN = `${URL}/functions/v1/token-externo`;
const FUNCAO_REJEITAR = `${URL}/functions/v1/remessa-rejeitar`;
const BUCKET = "remessas-externas";
const opcoesCliente = { auth: { autoRefreshToken: false, persistSession: false } };
const servico = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, opcoesCliente);

const resultados = [];
function afirmar(nome, ok, detalhe = "") {
  resultados.push({ nome, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${nome}${detalhe ? `  — ${detalhe}` : ""}`);
}
function exigir(r, oque) {
  if (r.error) throw new Error(`${oque}: ${r.error.message}`);
  return r.data;
}

async function sessao(email) {
  const { data, error } = await servico.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`link de ${email}: ${error.message}`);
  const c = createClient(URL, env.SUPABASE_ANON_KEY, opcoesCliente);
  const { error: e2 } = await c.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (e2) throw new Error(`sessão de ${email}: ${e2.message}`);
  return c;
}

/** PDF real e válido de uma página ("Hemograma — evidência 03.11"). */
function pdfReal(titulo) {
  const conteudo = `BT /F1 14 Tf 72 720 Td (${titulo}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
const sha = (b) => createHash("sha256").update(b).digest("hex");

async function enviarPeloLaboratorio(token, bytes, nome) {
  const body = new FormData();
  body.append("arquivo", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), nome);
  const r = await fetch(FUNCAO_TOKEN, { method: "POST", headers: { apikey: env.SUPABASE_ANON_KEY, "x-token-externo": token }, body });
  return r.json();
}

async function remessa(id) {
  return exigir(await servico.schema("aba_health").from("remessas_externas")
    .select("status, arquivo_caminho, processada_por, motivo_rejeicao, arquivo_expurgado_em, sha256").eq("id", id).single(), "remessa");
}

async function contarLog(id) {
  const linhas = exigir(await servico.schema("aba_health").from("log_acesso")
    .select("acao, usuario_ator_id, contexto").eq("registro_id", id).eq("tipo_registro", "remessa_externa"), "log");
  const por = { leitura: 0, atualizacao: 0 };
  for (const l of linhas) por[l.acao] = (por[l.acao] ?? 0) + 1;
  return { total: linhas.length, ...por, linhas };
}

async function objetoExiste(caminho) {
  const partes = caminho.split("/");
  const { data } = await servico.storage.from(BUCKET).list(partes.slice(0, 2).join("/"), { search: partes[2] });
  return (data ?? []).some((o) => o.name === partes[2]);
}

const criado = { paciente: null, laboratorio: null, concessoes: [] };

async function limpar() {
  console.log("\nlimpeza (por identificador, só o que este script criou):");
  const passo = async (nome, f) => {
    const { error } = await f();
    console.log(error ? `  ✗ ${nome}: ${error.message}` : `  · ${nome}`);
  };
  if (criado.concessoes.length) {
    const { data: remessas } = await servico.schema("aba_health").from("remessas_externas")
      .select("id, arquivo_caminho").in("concessao_id", criado.concessoes);
    if (remessas?.length) {
      await passo("objetos do bucket", () => servico.storage.from(BUCKET).remove(remessas.map((r) => r.arquivo_caminho)));
      await passo("log das remessas", () => servico.schema("aba_health").from("log_acesso").delete().in("registro_id", remessas.map((r) => r.id)));
    }
    await passo("remessas", () => servico.schema("aba_health").from("remessas_externas").delete().in("concessao_id", criado.concessoes));
    await passo("log das concessões", () => servico.schema("aba_health").from("log_acesso").delete().in("registro_id", criado.concessoes));
    await passo("concessões (tentativas em cascata)", () => servico.schema("aba_health").from("concessoes_externas").delete().in("id", criado.concessoes));
  }
  if (criado.laboratorio) {
    await passo("fornecedor de fixture", () => servico.schema("aba_people").from("fornecedores").delete().eq("id", criado.laboratorio));
    await passo("pessoa do laboratório", () => servico.schema("aba_people").from("pessoas").delete().eq("id", criado.laboratorio));
  }
  if (criado.paciente) {
    await passo("paciente de fixture", () => servico.schema("aba_people").from("clientes").delete().eq("id", criado.paciente));
    await passo("pessoa do paciente", () => servico.schema("aba_people").from("pessoas").delete().eq("id", criado.paciente));
  }
}

try {
  const perfil = exigir(await servico.from("profiles").select("account_id, user_id").eq("email", "proprietaria@vitrinedemo.local").single(), "dona");
  const DEMO = perfil.account_id;
  const dona = await sessao("proprietaria@vitrinedemo.local");
  const recepcao = await sessao("recepcao@vitrinedemo.local");

  console.log("\n0) fixture");
  const pac = exigir(await servico.schema("aba_people").from("pessoas").insert({ account_id: DEMO, nome_exibicao: "Evidência 03.11 — paciente" }).select("id").single(), "pessoa");
  criado.paciente = pac.id;
  exigir(await servico.schema("aba_people").from("clientes").insert({ id: pac.id, account_id: DEMO, razao_social: "Evidência 03.11 — paciente", status: "ativo" }), "cliente");
  const lab = exigir(await servico.schema("aba_people").from("pessoas").insert({ account_id: DEMO, nome_exibicao: "Evidência 03.11 — laboratório" }).select("id").single(), "laboratório");
  criado.laboratorio = lab.id;

  console.log("\n1) o link é de laboratório");
  const semFornecedor = await dona.schema("aba_health").rpc("emitir_concessao_externa", {
    p_cliente_id: pac.id, p_pessoa_id: lab.id, p_finalidade: "recepcao_exame" });
  afirmar("pessoa que não é fornecedor não recebe link de exame", semFornecedor.error?.code === "42501");
  exigir(await servico.schema("aba_people").from("fornecedores").insert({ id: lab.id, account_id: DEMO, razao_social: "Evidência 03.11 — laboratório" }), "fornecedor");
  const [link] = exigir(await dona.schema("aba_health").rpc("emitir_concessao_externa", {
    p_cliente_id: pac.id, p_pessoa_id: lab.id, p_finalidade: "recepcao_exame", p_validade: "1 day" }), "emitir");
  criado.concessoes.push(link.concessao_id);
  afirmar("fornecedor recebe o link (token de 43 caracteres)", /^[A-Za-z0-9_-]{43}$/.test(link.token));

  console.log("\n2) o laboratório envia dois PDFs reais pelo endpoint público");
  const pdfA = pdfReal("Hemograma - evidencia 03.11");
  const pdfB = pdfReal("Exame de OUTRO paciente - evidencia 03.11");
  const ra = await enviarPeloLaboratorio(link.token, pdfA, "hemograma.pdf");
  const rb = await enviarPeloLaboratorio(link.token, pdfB, "outro_paciente.pdf");
  afirmar("os dois envios aceitos pelo endpoint", ra.ok === true && rb.ok === true);
  const A = ra.remessa_id, B = rb.remessa_id;

  console.log("\n3) cai na caixa de entrada, NÃO no prontuário");
  const caixa = exigir(await dona.schema("aba_health").rpc("ler_caixa_de_entrada", {}), "caixa");
  const naCaixa = caixa.filter((x) => x.remessa_id === A || x.remessa_id === B);
  afirmar("as duas remessas estão na caixa como recebidas", naCaixa.length === 2 && naCaixa.every((x) => x.status === "recebida"),
    `laboratório "${naCaixa[0]?.laboratorio_nome}", IP ${naCaixa[0]?.ip_origem}`);
  afirmar("a leitura da caixa gravou 1 log por remessa", (await contarLog(A)).leitura === 1 && (await contarLog(B)).leitura === 1);
  const antes = exigir(await dona.schema("aba_health").rpc("ler_exames_importados", { p_cliente_id: pac.id }), "exames");
  afirmar("o prontuário do paciente não tem exame nenhum ainda", antes.length === 0);

  console.log("\n4) recepção (admin sem acesso clínico), sessão real");
  const caixaRecepcao = exigir(await recepcao.schema("aba_health").rpc("ler_caixa_de_entrada", {}), "caixa recepção");
  afirmar("não vê as remessas", !caixaRecepcao.some((x) => x.remessa_id === A || x.remessa_id === B));
  afirmar("não confere", (await recepcao.schema("aba_health").rpc("processar_remessa_externa", { p_remessa_id: A, p_para: "validada" })).error?.code === "42501");
  const caminhoA = (await remessa(A)).arquivo_caminho;
  afirmar("não assina URL do arquivo", (await recepcao.storage.from(BUCKET).createSignedUrl(caminhoA, 60)).error !== null);

  console.log("\n5) o aceite: conferir e depois aceitar");
  const pulo = await dona.schema("aba_health").rpc("processar_remessa_externa", { p_remessa_id: A, p_para: "importada" });
  afirmar("aceitar sem conferir é recusado pelo banco", pulo.error?.code === "23514", pulo.error?.message);
  exigir(await dona.schema("aba_health").rpc("processar_remessa_externa", { p_remessa_id: A, p_para: "validada" }), "conferir");
  exigir(await dona.schema("aba_health").rpc("processar_remessa_externa", { p_remessa_id: A, p_para: "importada" }), "aceitar");
  const importada = await remessa(A);
  afirmar("remessa A importada, carimbada pela dona", importada.status === "importada" && importada.processada_por === perfil.user_id);
  const exames = exigir(await dona.schema("aba_health").rpc("ler_exames_importados", { p_cliente_id: pac.id }), "exames");
  afirmar("o exame aparece no prontuário com o sha256 do arquivo enviado", exames.length === 1 && exames[0].sha256_hex === sha(pdfA));
  const url = exigir(await dona.storage.from(BUCKET).createSignedUrl(caminhoA, 60), "assinar");
  const baixado = Buffer.from(await (await fetch(url.signedUrl)).arrayBuffer());
  afirmar("a dona abre o PDF por URL assinada e os bytes são os enviados", sha(baixado) === sha(pdfA), `${baixado.length} bytes`);
  const logA = await contarLog(A);
  afirmar("log da importação: 2 atualizações (conferir, aceitar) + 2 leituras (caixa, prontuário)",
    logA.atualizacao === 2 && logA.leitura === 2, `total ${logA.total}`);
  const reverter = await dona.schema("aba_health").rpc("processar_remessa_externa", { p_remessa_id: A, p_para: "rejeitada", p_motivo: "voltar atrás" });
  afirmar("importada não volta (rejeitar depois de aceitar é recusado)", reverter.error?.code === "23514");

  console.log("\n6) a rejeição não deixa resíduo legível");
  const caminhoB = (await remessa(B)).arquivo_caminho;
  afirmar("antes: o arquivo B existe no bucket", await objetoExiste(caminhoB));
  const { data: s } = await dona.auth.getSession();
  const rej = await fetch(FUNCAO_REJEITAR, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${s.session.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ remessa_id: B, motivo: "exame de outro paciente" }),
  }).then((r) => r.json());
  afirmar("Edge Function rejeita e expurga", rej.ok === true && rej.arquivo_expurgado === true);
  const rejeitada = await remessa(B);
  afirmar("remessa B rejeitada, com motivo e carimbo de expurgo; sha256 preservado",
    rejeitada.status === "rejeitada" && rejeitada.motivo_rejeicao === "exame de outro paciente"
      && rejeitada.arquivo_expurgado_em !== null && rejeitada.sha256.replace(/^\\x/, "") === sha(pdfB));
  afirmar("depois: o arquivo B não existe mais no bucket", !(await objetoExiste(caminhoB)));
  afirmar("a dona não assina URL do rejeitado", (await dona.storage.from(BUCKET).createSignedUrl(caminhoB, 60)).error !== null);
  const logB = await contarLog(B);
  afirmar("log da rejeição: 1 atualização com o motivo", logB.atualizacao === 1
    && logB.linhas.some((l) => l.contexto?.motivo === "exame de outro paciente"));
} catch (e) {
  afirmar("execução sem exceção", false, e.message);
} finally {
  await limpar();
}

const falhas = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} afirmações verdes`);
process.exit(falhas ? 1 : 0);
