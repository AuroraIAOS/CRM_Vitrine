#!/usr/bin/env node
/**
 * Evidência da Subetapa 03.12 — assinatura do paciente por link, em
 * PRODUÇÃO, com sessão real.
 *
 * A suíte `27_assinatura_paciente_link.spec.ts` prova as regras no banco de
 * TESTES. Esta exerce a corrente no projeto que serve a vitrine, depois da
 * 061 aplicada por MCP e da Edge Function `token-externo` republicada:
 * a clínica gera o link (dona, por QR e por cópia), o "celular do paciente"
 * chama o endpoint público sem sessão, confirma a data de nascimento, lê,
 * desenha e assina — os TRÊS documentos —, e a recusa do token expirado.
 *
 * PERSONAGENS, por link mágico (nunca senha): `dona` (`proprietaria@`,
 * owner) e `recepcao` (`recepcao@`, admin sem acesso clínico). O serviço só
 * PREPARA fixture (paciente, profissional, evolução travada, contrato com o
 * documento emitido e assinado pelo profissional), LÊ carimbos e LIMPA.
 *
 * USO:  cd crm && node scripts/evidencia_assinatura_link.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { createHash as hash } from "node:crypto";
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
const BUCKET = "assinaturas-pacientes";
const NASCIMENTO = "1985-03-09";
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
const sha = (t) => hash("sha256").update(t, "utf8").digest("hex");

async function sessao(email) {
  const { data, error } = await servico.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`link de ${email}: ${error.message}`);
  const c = createClient(URL, env.SUPABASE_ANON_KEY, opcoesCliente);
  const { error: e2 } = await c.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (e2) throw new Error(`sessão de ${email}: ${e2.message}`);
  return c;
}

/** PNG real de 120×40 com um traço: o que um canvas de celular produziria. */
function pngDeAssinatura() {
  const w = 120, h = 40;
  const crc = (buf) => {
    let c, crcTable = [];
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
    let x = 0xffffffff;
    for (const b of buf) x = crcTable[(x ^ b) & 0xff] ^ (x >>> 8);
    return (x ^ 0xffffffff) >>> 0;
  };
  const bloco = (tipo, dados) => {
    const t = Buffer.from(tipo, "ascii");
    const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, dados])));
    return Buffer.concat([len, t, dados, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const linhas = [];
  for (let y = 0; y < h; y++) {
    const l = Buffer.alloc(w + 1, 255); l[0] = 0;
    for (let x = 10; x < 110; x++) if (Math.abs(y - (20 + Math.round(8 * Math.sin(x / 9)))) < 2) l[x + 1] = 0;
    linhas.push(l);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco("IHDR", ihdr), bloco("IDAT", deflateSync(Buffer.concat(linhas))), bloco("IEND", Buffer.alloc(0)),
  ]);
}

async function celular(token, corpo) {
  const headers = { apikey: env.SUPABASE_ANON_KEY, "x-token-externo": token };
  if (!corpo) return (await fetch(FUNCAO, { headers })).json();
  if (corpo instanceof FormData) return (await fetch(FUNCAO, { method: "POST", headers, body: corpo })).json();
  return (await fetch(FUNCAO, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(corpo) })).json();
}

async function assinarPeloCelular(token, rotulo) {
  const g = await celular(token);
  afirmar(`${rotulo}: link abre sem mostrar dado do paciente`, g.ok === true && !JSON.stringify(g).includes("Evidência 03.12"));
  const errada = await celular(token, { acao: "abrir", data_nascimento: "2000-01-01" });
  afirmar(`${rotulo}: data de nascimento errada não abre`, errada.ok === false && errada.motivo === "confirmacao_invalida");
  const aberto = await celular(token, { acao: "abrir", data_nascimento: NASCIMENTO });
  afirmar(`${rotulo}: data certa abre o documento com o hash do texto exato`,
    aberto.ok === true && (aberto.documento.formato === "html" || aberto.documento.hash === sha(aberto.documento.conteudo)));
  const f = new FormData();
  f.append("acao", "assinar");
  f.append("data_nascimento", NASCIMENTO);
  f.append("hash", aberto.documento.hash);
  f.append("desenho", new Blob([new Uint8Array(pngDeAssinatura())], { type: "image/png" }), "assinatura.png");
  const r = await celular(token, f);
  afirmar(`${rotulo}: assinatura registrada`, r.ok === true, r.motivo ?? "");
  return aberto.documento.hash;
}

const criado = { paciente: null, profissional: null, evolucoes: [], contrato: null, modelo: null, concessoes: [] };

async function limpar() {
  console.log("\nlimpeza (por identificador, só o que este script criou):");
  const passo = async (nome, f) => {
    const { error } = await f();
    console.log(error ? `  ✗ ${nome}: ${error.message}` : `  · ${nome}`);
  };
  const h = () => servico.schema("aba_health");
  if (criado.concessoes.length) {
    const { data: ass } = await h().from("assinaturas_externas").select("desenho_caminho").in("concessao_id", criado.concessoes);
    if (ass?.length) await passo("desenhos do bucket", () => servico.storage.from(BUCKET).remove(ass.map((a) => a.desenho_caminho)));
    await passo("assinaturas externas", () => h().from("assinaturas_externas").delete().in("concessao_id", criado.concessoes));
  }
  if (criado.paciente) {
    await passo("consentimentos", () => h().from("consentimentos").delete().eq("cliente_id", criado.paciente));
    await passo("log de acesso", () => h().from("log_acesso").delete().eq("cliente_id", criado.paciente));
    await passo("concessões (tentativas em cascata)", () => h().from("concessoes_externas").delete().eq("cliente_id", criado.paciente));
  }
  // Os gatilhos de evolução travada e de contrato assinado agem em UPDATE
  // ou só com sessão: o serviço apaga a fixture desta execução, por id.
  if (criado.evolucoes.length) await passo("evoluções", () => h().from("evolucoes").delete().in("id", criado.evolucoes));
  if (criado.contrato) await passo("contrato (eventos e assinaturas em cascata)", () => servico.schema("aba_finance").from("contratos").delete().eq("id", criado.contrato));
  if (criado.modelo) await passo("modelo de termo", () => h().from("modelos_consentimento").delete().eq("id", criado.modelo));
  if (criado.profissional) await passo("profissional", () => servico.schema("aba_scheduling").from("profissionais").delete().eq("id", criado.profissional));
  if (criado.paciente) {
    await passo("cliente", () => servico.schema("aba_people").from("clientes").delete().eq("id", criado.paciente));
    await passo("pessoa", () => servico.schema("aba_people").from("pessoas").delete().eq("id", criado.paciente));
  }
}

try {
  const perfil = exigir(await servico.from("profiles").select("account_id, user_id").eq("email", "proprietaria@vitrinedemo.local").single(), "dona");
  const DEMO = perfil.account_id;
  const dona = await sessao("proprietaria@vitrinedemo.local");
  const recepcao = await sessao("recepcao@vitrinedemo.local");

  console.log("\n0) fixture");
  const p = exigir(await servico.schema("aba_people").from("pessoas").insert({ account_id: DEMO, nome_exibicao: "Evidência 03.12 — paciente" }).select("id").single(), "pessoa");
  criado.paciente = p.id;
  exigir(await servico.schema("aba_people").from("clientes").insert({ id: p.id, account_id: DEMO, razao_social: "Evidência 03.12 — paciente", status: "ativo", data_nascimento: NASCIMENTO }), "cliente");
  const prof = exigir(await servico.schema("aba_scheduling").from("profissionais").insert({ account_id: DEMO, nome_exibicao: "Evidência 03.12 — Dra.", ativo: false, acesso_clinico: false }).select("id").single(), "profissional");
  criado.profissional = prof.id;
  const ev = exigir(await servico.schema("aba_health").from("evolucoes").insert({ account_id: DEMO, cliente_id: p.id, profissional_id: prof.id, avaliacao: "Evidência 03.12 — profilaxia e orientação de higiene.", travada: true }).select("id").single(), "evolução");
  criado.evolucoes.push(ev.id);
  const k = exigir(await servico.schema("aba_finance").from("contratos").insert({ account_id: DEMO, cliente_id: p.id, status: "rascunho" }).select("id").single(), "contrato");
  criado.contrato = k.id;
  const html = `<h1>Contrato de evidência 03.12</h1><p>${k.id}</p>`;
  exigir(await servico.schema("aba_finance").from("contratos").update({ documento_html: html, documento_hash: sha(html), documento_emitido_em: new Date().toISOString() }).eq("id", k.id), "documento");
  exigir(await servico.schema("aba_finance").from("assinaturas_contrato").insert({ account_id: DEMO, contrato_id: k.id, parte: "profissional", via: "presencial", hash_assinado: sha(html), assinada_em: new Date().toISOString(), registrada_por: perfil.user_id }), "assinatura profissional");

  console.log("\n1) a clínica publica o termo e gera os links (sessão real)");
  criado.modelo = exigir(await dona.schema("aba_health").rpc("publicar_modelo_consentimento", {
    p_tipo: "uso_imagem", p_titulo: "Evidência 03.12 — termo de uso de imagem",
    p_texto: "Autorizo o registro fotográfico do meu tratamento para acompanhamento clínico." }), "modelo");
  const gerar = async (quem, documento, id, extra = {}) => {
    const [l] = exigir(await quem.schema("aba_health").rpc("emitir_link_assinatura", { p_documento: documento, p_documento_id: id, ...extra }), `link ${documento}`);
    criado.concessoes.push(l.concessao_id);
    return l;
  };
  const lEv = await gerar(dona, "evolucao", ev.id, { p_canal: "qr_code" });
  const lCons = await gerar(dona, "consentimento", criado.modelo, { p_cliente_id: p.id });
  const lK = await gerar(recepcao, "contrato", k.id, { p_canal: "qr_code" });
  afirmar("três links gerados: evolução e termo pela dona, contrato pela recepção", !!lEv.token && !!lCons.token && !!lK.token);
  const semAlcance = await recepcao.schema("aba_health").rpc("emitir_link_assinatura", { p_documento: "evolucao", p_documento_id: ev.id });
  afirmar("a recepção (sem acesso clínico) não gera link de evolução", semAlcance.error?.code === "42501");

  console.log("\n2) o celular do paciente assina os três documentos");
  const hEv = await assinarPeloCelular(lEv.token, "evolução (QR)");
  const hCons = await assinarPeloCelular(lCons.token, "consentimento (link copiado)");
  const hK = await assinarPeloCelular(lK.token, "contrato (QR)");

  console.log("\n3) o que ficou registrado");
  const e = exigir(await servico.schema("aba_health").from("evolucoes").select("assinatura_paciente_hash").eq("id", ev.id).single(), "evolução");
  afirmar("evolução com o aceite e o hash do texto", e.assinatura_paciente_hash === hEv);
  const c = exigir(await servico.schema("aba_health").from("consentimentos").select("concedido, evidencia").eq("cliente_id", p.id).single(), "consentimento");
  afirmar("consentimento concedido com a evidência do link", c.concedido === true && c.evidencia.via === "link" && c.evidencia.hash === hCons);
  const kk = exigir(await servico.schema("aba_finance").from("contratos").select("status").eq("id", k.id).single(), "contrato");
  const ak = exigir(await servico.schema("aba_finance").from("assinaturas_contrato").select("via, hash_assinado").eq("contrato_id", k.id).eq("parte", "paciente").single(), "assinatura");
  afirmar("contrato assinado, com a parte do paciente por link sobre o mesmo hash", kk.status === "assinado" && ak.via === "link" && ak.hash_assinado === hK);
  const ass = exigir(await dona.schema("aba_health").rpc("ler_assinaturas_externas", { p_cliente_id: p.id }), "ler assinaturas");
  afirmar("a dona lê as três assinaturas, com canal", ass.length === 3 && ass.filter((a) => a.canal === "qr_code").length === 2,
    ass.map((a) => `${a.documento}/${a.canal}`).join(", "));
  const url = await dona.storage.from(BUCKET).createSignedUrl(ass[0].desenho_caminho, 60);
  afirmar("a dona abre o desenho por URL assinada; a recepção não", !url.error && !!(await recepcao.storage.from(BUCKET).createSignedUrl(ass[0].desenho_caminho, 60)).error);
  afirmar("link usado não se reusa", (await celular(lEv.token, { acao: "abrir", data_nascimento: NASCIMENTO })).motivo === "token_consumido");

  console.log("\n4) token expirado");
  const ev2 = exigir(await servico.schema("aba_health").from("evolucoes").insert({ account_id: DEMO, cliente_id: p.id, profissional_id: prof.id, avaliacao: "Evidência 03.12 — expirado.", travada: true }).select("id").single(), "evolução 2");
  criado.evolucoes.push(ev2.id);
  const lExp = await gerar(dona, "evolucao", ev2.id, { p_validade: "5 minutes" });
  exigir(await servico.schema("aba_health").from("concessoes_externas").update({ criado_em: new Date(Date.now() - 3600_000).toISOString(), token_expira_em: new Date(Date.now() - 60_000).toISOString() }).eq("id", lExp.concessao_id), "envelhecer");
  const exp = await celular(lExp.token, { acao: "abrir", data_nascimento: NASCIMENTO });
  afirmar("token expirado é recusado", exp.ok === false && exp.motivo === "token_expirado");
} catch (e) {
  afirmar("execução sem exceção", false, e.message);
} finally {
  await limpar();
}

const falhas = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} afirmações verdes`);
process.exit(falhas ? 1 : 0);
