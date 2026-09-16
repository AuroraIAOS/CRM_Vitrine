#!/usr/bin/env node
/**
 * Evidência da Subetapa 03.10 — infraestrutura de token externo, em
 * PRODUÇÃO, com sessão real.
 *
 * A suíte `25_token_externo.spec.ts` prova as regras no banco de TESTES. Esta
 * exerce a mesma corrente no projeto que serve a vitrine pública, depois da
 * 059 aplicada por MCP e da Edge Function `token-externo` publicada: além do
 * hash normalizado, é a única forma de saber que a transcrição não mudou
 * comportamento (`instrucoes.md` §5).
 *
 * O QUE ELA MOSTRA — a conclusão da subetapa, desfecho a desfecho, cada
 * recusa com o motivo lido de `aba_health.tentativas_token_externo`:
 *   válido (GET e POST) · inexistente · expirado · revogado · já consumido ·
 *   arquivo inválido; e a prova de que o freio incide sobre o TOKEN e não
 *   sobre o remetente.
 *
 * PERSONAGENS: `dona` (`proprietaria@`, owner da demonstração), por link
 * mágico — nunca senha. O endpoint é chamado como qualquer pessoa de fora,
 * sem sessão. O serviço só PREPARA (paciente e laboratório de fixture),
 * envelhece uma concessão para o caso "expirado", LÊ as tentativas e LIMPA,
 * por identificador.
 *
 * USO:  cd crm && node scripts/evidencia_token_externo.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
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
const FUNCAO = `${URL}/functions/v1/token-externo`;
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

const PDF = Buffer.from("%PDF-1.4\n% evidencia 03.10\ntrailer <<>>\n%%EOF\n");
const EXE = Buffer.concat([Buffer.from("MZ"), randomBytes(128)]);
const sha256Hex = (t) => createHash("sha256").update(t, "utf8").digest("hex");

async function chamar(metodo, token, arquivo) {
  const headers = { apikey: env.SUPABASE_ANON_KEY };
  if (token) headers["x-token-externo"] = token;
  let body;
  if (metodo === "POST") {
    body = new FormData();
    if (arquivo) body.append("arquivo", new Blob([new Uint8Array(arquivo.bytes)], { type: arquivo.tipo }), arquivo.nome);
  }
  const r = await fetch(FUNCAO, { method: metodo, headers, body });
  return { status: r.status, corpo: await r.json() };
}

async function ultimaTentativa(token) {
  const { data } = await servico.schema("aba_health").from("tentativas_token_externo")
    .select("sucesso, motivo, metodo").eq("token_alvo_hash", `\\x${sha256Hex(token.slice(0, 512))}`)
    .order("id", { ascending: false }).limit(1);
  return data?.[0] ?? null;
}

const criado = { paciente: null, laboratorio: null, concessoes: [], hashesFalsos: [] };

async function limpar() {
  console.log("\nlimpeza (por identificador, só o que este script criou):");
  const passo = async (nome, f) => {
    const { error } = await f();
    console.log(error ? `  ✗ ${nome}: ${error.message}` : `  · ${nome}`);
  };
  if (criado.concessoes.length) {
    const { data: remessas } = await servico.schema("aba_health").from("remessas_externas")
      .select("arquivo_caminho").in("concessao_id", criado.concessoes);
    if (remessas?.length) await passo("objetos do bucket", () => servico.storage.from(BUCKET).remove(remessas.map((r) => r.arquivo_caminho)));
    await passo("remessas", () => servico.schema("aba_health").from("remessas_externas").delete().in("concessao_id", criado.concessoes));
    await passo("log das concessões", () => servico.schema("aba_health").from("log_acesso").delete().in("registro_id", criado.concessoes));
    await passo("concessões (tentativas em cascata)", () => servico.schema("aba_health").from("concessoes_externas").delete().in("id", criado.concessoes));
  }
  for (const h of criado.hashesFalsos) {
    await passo("tentativas de token inventado", () => servico.schema("aba_health").from("tentativas_token_externo").delete().eq("token_alvo_hash", `\\x${h}`));
  }
  if (criado.paciente) {
    await passo("paciente de fixture", () => servico.schema("aba_people").from("clientes").delete().eq("id", criado.paciente));
    await passo("pessoa do paciente", () => servico.schema("aba_people").from("pessoas").delete().eq("id", criado.paciente));
  }
  if (criado.laboratorio) await passo("fornecedor de fixture", () => servico.schema("aba_people").from("fornecedores").delete().eq("id", criado.laboratorio));
  if (criado.laboratorio) await passo("laboratório de fixture", () => servico.schema("aba_people").from("pessoas").delete().eq("id", criado.laboratorio));
}

try {
  const perfil = exigir(await servico.from("profiles").select("account_id").eq("email", "proprietaria@vitrinedemo.local").single(), "dona");
  const DEMO = perfil.account_id;
  const dona = await sessao("proprietaria@vitrinedemo.local");

  console.log("\n0) fixture");
  const pac = exigir(await servico.schema("aba_people").from("pessoas").insert({ account_id: DEMO, nome_exibicao: "Evidência 03.10 — paciente" }).select("id").single(), "pessoa");
  criado.paciente = pac.id;
  exigir(await servico.schema("aba_people").from("clientes").insert({ id: pac.id, account_id: DEMO, razao_social: "Evidência 03.10 — paciente", status: "ativo" }), "cliente");
  const lab = exigir(await servico.schema("aba_people").from("pessoas").insert({ account_id: DEMO, nome_exibicao: "Evidência 03.10 — laboratório" }).select("id").single(), "laboratório");
  criado.laboratorio = lab.id;
  // Desde a 060 (03.11), link de exame só se emite para fornecedor ativo.
  exigir(await servico.schema("aba_people").from("fornecedores").insert({ id: lab.id, account_id: DEMO, razao_social: "Evidência 03.10 — laboratório" }), "fornecedor");

  const emitir = async (extra = {}) => {
    const linhas = exigir(await dona.schema("aba_health").rpc("emitir_concessao_externa", {
      p_cliente_id: criado.paciente, p_pessoa_id: criado.laboratorio, p_finalidade: "recepcao_exame", ...extra,
    }), "emitir");
    criado.concessoes.push(linhas[0].concessao_id);
    return linhas[0];
  };

  console.log("\n1) emissão pela dona (sessão real)");
  const unico = await emitir({ p_usos_maximos: 1 });
  afirmar("token de 43 caracteres devolvido uma vez", /^[A-Za-z0-9_-]{43}$/.test(unico.token));
  const guardado = exigir(await servico.schema("aba_health").from("concessoes_externas").select("usos, usos_maximos").eq("id", unico.concessao_id).single(), "concessão");
  afirmar("concessão nasce com usos 0 de 1", guardado.usos === 0 && guardado.usos_maximos === 1);
  const lerHash = await dona.schema("aba_health").from("concessoes_externas").select("token_hash").eq("id", unico.concessao_id);
  afirmar("a própria dona não lê token_hash", lerHash.error?.code === "42501");

  console.log("\n2) os desfechos do endpoint público");
  let r = await chamar("GET", unico.token);
  afirmar("VÁLIDO (GET): serve clínica e prazo, nada do paciente", r.status === 200 && r.corpo.ok === true && !JSON.stringify(r.corpo).includes(criado.paciente), `clínica "${r.corpo.clinica}"`);
  r = await chamar("POST", unico.token, { bytes: PDF, nome: "laudo.pdf", tipo: "application/pdf" });
  afirmar("VÁLIDO (POST): PDF recebido", r.corpo.ok === true);
  const rem = exigir(await servico.schema("aba_health").from("remessas_externas").select("account_id, arquivo_caminho, mime").eq("id", r.corpo.remessa_id).single(), "remessa");
  afirmar("remessa na conta da concessão, caminho da concessão", rem.account_id === DEMO && rem.arquivo_caminho.startsWith(`conta-${DEMO}/concessao-${unico.concessao_id}/`));

  r = await chamar("POST", unico.token, { bytes: PDF, nome: "laudo2.pdf", tipo: "application/pdf" });
  afirmar("JÁ CONSUMIDO: segundo envio recusado", r.corpo.motivo === "token_consumido");
  afirmar("   motivo registrado", (await ultimaTentativa(unico.token))?.motivo === "token_consumido");

  const falso = randomBytes(32).toString("base64url");
  criado.hashesFalsos.push(sha256Hex(falso));
  r = await chamar("GET", falso);
  afirmar("INEXISTENTE: recusado", r.corpo.motivo === "token_inexistente");
  afirmar("   motivo registrado", (await ultimaTentativa(falso))?.motivo === "token_inexistente");

  const envelhecido = await emitir();
  exigir(await servico.schema("aba_health").from("concessoes_externas").update({
    criado_em: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    token_expira_em: new Date(Date.now() - 86_400_000).toISOString(),
  }).eq("id", envelhecido.concessao_id), "envelhecer");
  r = await chamar("GET", envelhecido.token);
  afirmar("EXPIRADO: recusado", r.corpo.motivo === "token_expirado");
  afirmar("   motivo registrado", (await ultimaTentativa(envelhecido.token))?.motivo === "token_expirado");

  const revogado = await emitir();
  exigir(await dona.schema("aba_health").rpc("revogar_concessao_externa", { p_concessao_id: revogado.concessao_id }), "revogar");
  r = await chamar("GET", revogado.token);
  afirmar("REVOGADO: recusado", r.corpo.motivo === "token_revogado");
  afirmar("   motivo registrado", (await ultimaTentativa(revogado.token))?.motivo === "token_revogado");

  const reutilizavel = await emitir();
  r = await chamar("POST", reutilizavel.token, { bytes: EXE, nome: "laudo.pdf", tipo: "application/pdf" });
  afirmar("ARQUIVO INVÁLIDO (bytes de executável com nome .pdf): recusado", r.corpo.motivo === "arquivo_invalido");
  afirmar("   motivo registrado", (await ultimaTentativa(reutilizavel.token))?.motivo === "arquivo_invalido");

  console.log("\n3) o freio incide sobre o TOKEN, não sobre o remetente");
  for (let i = 0; i < 4; i++) await chamar("GET", revogado.token); // 1 + 4 = 5 falhas
  r = await chamar("GET", revogado.token);
  afirmar("5 falhas no token revogado: o 6º acesso é freado", r.corpo.motivo === "freado");
  r = await chamar("GET", reutilizavel.token);
  afirmar("mesmo laboratório, mesma clínica, mesmo IP: o link válido segue servindo", r.corpo.ok === true);
  r = await chamar("POST", reutilizavel.token, { bytes: PDF, nome: "laudo.pdf", tipo: "application/pdf" });
  afirmar("   e recebe arquivo", r.corpo.ok === true);

  console.log("\n4) o arquivo sai só por autorização clínica");
  const url = await dona.storage.from(BUCKET).createSignedUrl(rem.arquivo_caminho, 60);
  const baixado = url.data ? await fetch(url.data.signedUrl) : null;
  afirmar("dona assina URL e baixa o PDF (a policy existe — ausência faria sumir)", baixado?.status === 200);
  const anon = createClient(URL, env.SUPABASE_ANON_KEY, opcoesCliente);
  afirmar("anônimo não assina URL", (await anon.storage.from(BUCKET).createSignedUrl(rem.arquivo_caminho, 60)).error !== null);
  const upAnon = await anon.storage.from(BUCKET).upload(`conta-${DEMO}/concessao-${unico.concessao_id}/${crypto.randomUUID()}.pdf`, PDF, { contentType: "application/pdf" });
  afirmar("anônimo não sobe arquivo direto (mime certo, para não confundir com o 415)", upAnon.error !== null, upAnon.error?.message);

  console.log("\n5) guardas permanentes");
  for (const g of ["politicas_sem_cerca_de_conta", "funcoes_sem_conta_ativa", "atalhos_de_owner_sem_nivel", "modulos_sem_linha_de_nivel", "fks_sem_isolamento_de_conta"]) {
    afirmar(`guarda ${g} = 0`, (exigir(await servico.rpc(g), g)).length === 0);
  }
} catch (e) {
  afirmar("execução sem exceção", false, e.message);
} finally {
  await limpar();
  const { data: sobra } = criado.concessoes.length
    ? await servico.schema("aba_health").from("concessoes_externas").select("id").in("id", criado.concessoes)
    : { data: [] };
  afirmar("resíduo zero (concessões)", (sobra ?? []).length === 0);
  const falhas = resultados.filter((x) => !x.ok).length;
  console.log(`\n${resultados.length - falhas}/${resultados.length} verdes`);
  process.exit(falhas ? 1 : 0);
}
