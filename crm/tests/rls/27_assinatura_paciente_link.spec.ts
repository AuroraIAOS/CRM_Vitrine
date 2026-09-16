import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient, anonClient, clientAs, createThrowawayUser, deleteThrowawayUser, ehErroRls, loadContext,
  type TestContext,
} from "./helpers";
import { AMBIENTE_DE_TESTE } from "./ambiente";

/**
 * Subetapa 03.12 — assinatura do paciente por link (P-sub: `aba_health` +
 * endpoint público servindo documento clínico). Migration 061 + Edge
 * Function `token-externo` estendida (abrir/assinar).
 *
 * CONCLUSÃO DA SUBETAPA: o paciente assina pelo celular o contrato, a
 * evolução e o consentimento; cada assinatura fica com data, canal, hash do
 * texto exato, desenho e a concessão usada; token expirado é recusado.
 *
 * ATAQUES: emitir sem alcance ou sem data de nascimento; adivinhar a data
 * (o freio conta, e conta por TOKEN); assinar com hash velho, desenho que
 * não é PNG ou data errada; reusar o link; documento que mudou entre abrir e
 * assinar; ler a assinatura sem alcance; alterar a evidência pelo dono do
 * banco.
 */

const admin = adminClient();
const FUNCAO = `${AMBIENTE_DE_TESTE.url}/functions/v1/token-externo`;
const BUCKET = "assinaturas-pacientes";
const NASCIMENTO = "1990-05-17";
const PNG = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(96)]);
const JPEG = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(96)]);
const sha256Hex = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

type Resposta = { ok: boolean; motivo?: string; documento?: { tipo: string; conteudo: string; hash: string; formato: string }; [k: string]: unknown };

async function donoPg() {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_TEST_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
}

async function entrar(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(AMBIENTE_DE_TESTE.url, AMBIENTE_DE_TESTE.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

async function getLink(token: string) {
  const r = await fetch(FUNCAO, { headers: { apikey: AMBIENTE_DE_TESTE.anonKey, "x-token-externo": token } });
  return (await r.json()) as Resposta;
}

async function abrir(token: string, dataNascimento: string | null) {
  const r = await fetch(FUNCAO, {
    method: "POST",
    headers: { apikey: AMBIENTE_DE_TESTE.anonKey, "x-token-externo": token, "content-type": "application/json" },
    body: JSON.stringify({ acao: "abrir", data_nascimento: dataNascimento }),
  });
  expect(r.status).toBe(200);
  return (await r.json()) as Resposta;
}

async function assinar(token: string, dataNascimento: string, hash: string, desenho: Buffer = PNG()) {
  const corpo = new FormData();
  corpo.append("acao", "assinar");
  corpo.append("data_nascimento", dataNascimento);
  corpo.append("hash", hash);
  corpo.append("desenho", new Blob([new Uint8Array(desenho)], { type: "image/png" }), "assinatura.png");
  const r = await fetch(FUNCAO, {
    method: "POST", headers: { apikey: AMBIENTE_DE_TESTE.anonKey, "x-token-externo": token }, body: corpo,
  });
  expect(r.status).toBe(200);
  return (await r.json()) as Resposta;
}

describe("assinatura do paciente por link (Subetapa 03.12)", () => {
  let ctx: TestContext;
  let owner: SupabaseClient;
  let adminPapel: SupabaseClient;
  let agent: SupabaseClient;
  let outra: { userId: string; client: SupabaseClient; conta: string };

  let paciente: string;
  let semNascimento: string;
  let prof: string;
  let modelo: string;
  const pessoas: string[] = [];
  const concessoes: string[] = [];
  const evolucoes: string[] = [];
  const contratos: string[] = [];

  async function inserirPaciente(nome: string, nascimento: string | null) {
    const { data: p, error } = await admin.schema("aba_people").from("pessoas")
      .insert({ account_id: ctx.accountId, nome_exibicao: nome }).select("id").single();
    if (error) throw error;
    const { error: e2 } = await admin.schema("aba_people").from("clientes")
      .insert({ id: p.id, account_id: ctx.accountId, razao_social: nome, status: "ativo", data_nascimento: nascimento });
    if (e2) throw e2;
    pessoas.push(p.id);
    return p.id as string;
  }

  async function evolucaoTravada(texto = "Restauração classe II no 36, sem intercorrência.") {
    const { data, error } = await admin.schema("aba_health").from("evolucoes")
      .insert({ account_id: ctx.accountId, cliente_id: paciente, profissional_id: prof, avaliacao: texto,
                notas_procedimento: "Resina A2", travada: true })
      .select("id").single();
    if (error) throw error;
    evolucoes.push(data.id);
    return data.id as string;
  }

  /** Contrato em rascunho, documento emitido e já assinado pelo profissional (fixture de servidor). */
  async function contratoProntoParaPaciente() {
    const { data: c, error } = await admin.schema("aba_finance").from("contratos")
      .insert({ account_id: ctx.accountId, cliente_id: paciente, status: "rascunho" }).select("id").single();
    if (error) throw error;
    contratos.push(c.id);
    const html = `<h1>Contrato ${c.id}</h1><p>Tratamento restaurador.</p>`;
    const hash = sha256Hex(html);
    const { error: e2 } = await admin.schema("aba_finance").from("contratos")
      .update({ documento_html: html, documento_hash: hash, documento_emitido_em: new Date().toISOString() })
      .eq("id", c.id);
    if (e2) throw e2;
    const { error: e3 } = await admin.schema("aba_finance").from("assinaturas_contrato")
      .insert({ account_id: ctx.accountId, contrato_id: c.id, parte: "profissional", via: "presencial",
                hash_assinado: hash, assinada_em: new Date().toISOString(), registrada_por: ctx.userIds.owner });
    if (e3) throw e3;
    return { id: c.id as string, hash };
  }

  async function emitir(quem: SupabaseClient, documento: string, documentoId: string, extra: Record<string, unknown> = {}) {
    const { data, error } = await quem.schema("aba_health").rpc("emitir_link_assinatura", {
      p_documento: documento, p_documento_id: documentoId, ...extra,
    });
    if (error) return { token: null as string | null, id: null as string | null, error };
    const l = (data as { concessao_id: string; token: string }[])[0];
    concessoes.push(l.concessao_id);
    return { token: l.token, id: l.concessao_id, error: null };
  }

  async function emitirOk(quem: SupabaseClient, documento: string, documentoId: string, extra: Record<string, unknown> = {}) {
    const r = await emitir(quem, documento, documentoId, extra);
    if (r.error) throw r.error;
    return r as { token: string; id: string };
  }

  beforeAll(async () => {
    ctx = await loadContext();
    [owner, adminPapel, agent] = await Promise.all([clientAs("owner"), clientAs("admin"), clientAs("agent")]);
    paciente = await inserirPaciente("Paciente 03.12", NASCIMENTO);
    semNascimento = await inserirPaciente("Paciente sem nascimento 03.12", null);

    const { data: p, error: eProf } = await admin.schema("aba_scheduling").from("profissionais")
      .insert({ account_id: ctx.accountId, nome_exibicao: "Dra. Fixture 03.12", ativo: false, acesso_clinico: false })
      .select("id").single();
    if (eProf) throw eProf;
    prof = p.id;

    const { data: m, error: eM } = await owner.schema("aba_health").rpc("publicar_modelo_consentimento", {
      p_tipo: "uso_imagem", p_titulo: "Termo de uso de imagem 03.12",
      p_texto: "Autorizo o uso de fotografias clínicas para acompanhamento do meu tratamento.",
    });
    if (eM) throw eM;
    modelo = m as string;

    const u = await createThrowawayUser(admin, "assinatura-link-outra");
    const client = await entrar(u.email, u.password);
    const { data: perfil, error } = await admin.from("profiles").select("account_id").eq("user_id", u.userId).single();
    if (error) throw error;
    outra = { userId: u.userId, client, conta: perfil.account_id };
  }, 60_000);

  afterAll(async () => {
    const dono = await donoPg();
    try {
      const { rows } = await dono.query<{ desenho_caminho: string; consentimento_id: string | null }>(
        "SELECT desenho_caminho, consentimento_id FROM aba_health.assinaturas_externas WHERE concessao_id = ANY($1)", [concessoes]);
      if (rows.length) await admin.storage.from(BUCKET).remove(rows.map((r) => r.desenho_caminho));
      await dono.query("DELETE FROM aba_health.assinaturas_externas WHERE concessao_id = ANY($1)", [concessoes]);
      await dono.query("DELETE FROM aba_health.consentimentos WHERE cliente_id = ANY($1)", [pessoas]);
      await dono.query("DELETE FROM aba_health.log_acesso WHERE cliente_id = ANY($1)", [pessoas]);
      await dono.query("DELETE FROM aba_health.concessoes_externas WHERE cliente_id = ANY($1)", [pessoas]);
      await dono.query("ALTER TABLE aba_health.evolucoes DISABLE TRIGGER USER");
      await dono.query("DELETE FROM aba_health.evolucoes WHERE id = ANY($1)", [evolucoes]);
      await dono.query("ALTER TABLE aba_health.evolucoes ENABLE TRIGGER USER");
      await dono.query("ALTER TABLE aba_finance.contratos DISABLE TRIGGER USER");
      await dono.query("DELETE FROM aba_finance.contratos WHERE id = ANY($1)", [contratos]);
      await dono.query("ALTER TABLE aba_finance.contratos ENABLE TRIGGER USER");
      await dono.query("ALTER TABLE aba_health.modelos_consentimento DISABLE TRIGGER USER");
      await dono.query("DELETE FROM aba_health.modelos_consentimento WHERE account_id = $1 AND titulo LIKE '%03.12%'", [ctx.accountId]);
      await dono.query("ALTER TABLE aba_health.modelos_consentimento ENABLE TRIGGER USER");
      await dono.query("DELETE FROM aba_scheduling.profissionais WHERE id = $1", [prof]);
    } finally {
      await dono.end();
    }
    for (const id of pessoas) {
      await admin.schema("aba_people").from("clientes").delete().eq("id", id);
      await admin.schema("aba_people").from("pessoas").delete().eq("id", id);
    }
    if (outra) await deleteThrowawayUser(admin, outra.userId);
  }, 120_000);

  // ------------------------------------------------------------------
  // 1. Emissão
  // ------------------------------------------------------------------
  describe("emissão do link", () => {
    it("owner emite para evolução travada: uso único, alvo e destinatário = o paciente, só o hash guardado", async () => {
      const ev = await evolucaoTravada();
      const l = await emitirOk(owner, "evolucao", ev);
      expect(l.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const dono = await donoPg();
      try {
        const { rows } = await dono.query(
          `SELECT usos_maximos, evolucao_id, pessoa_id, cliente_id, finalidade, encode(token_hash,'hex') h,
                  token_expira_em - criado_em AS validade
             FROM aba_health.concessoes_externas WHERE id = $1`, [l.id]);
        expect(rows[0]).toMatchObject({ usos_maximos: 1, evolucao_id: ev, pessoa_id: paciente, cliente_id: paciente,
                                         finalidade: "assinatura_paciente", h: sha256Hex(l.token) });
      } finally {
        await dono.end();
      }
    });

    it("recusas: pela função genérica, sem data de nascimento, evolução em rascunho, validade longa", async () => {
      const generica = await owner.schema("aba_health").rpc("emitir_concessao_externa", {
        p_cliente_id: paciente, p_pessoa_id: paciente, p_finalidade: "assinatura_paciente" });
      expect(generica.error?.code).toBe("23514");

      const semData = await emitir(owner, "consentimento", modelo, { p_cliente_id: semNascimento });
      expect(semData.error?.code).toBe("23514");

      const { data: rasc } = await admin.schema("aba_health").from("evolucoes")
        .insert({ account_id: ctx.accountId, cliente_id: paciente, profissional_id: prof, avaliacao: "rascunho" })
        .select("id").single();
      evolucoes.push(rasc!.id);
      expect((await emitir(owner, "evolucao", rasc!.id)).error?.code).toBe("23514");

      const ev = await evolucaoTravada();
      expect((await emitir(owner, "evolucao", ev, { p_validade: "8 days" })).error?.code).toBe("23514");
    });

    it("sem alcance: agent não emite para evolução nem contrato; outra clínica não emite nada daqui; anon nem chama", async () => {
      const ev = await evolucaoTravada();
      expect((await emitir(agent, "evolucao", ev)).error?.code).toBe("42501");
      const c = await contratoProntoParaPaciente();
      expect((await emitir(agent, "contrato", c.id)).error?.code).toBe("42501");
      expect((await emitir(outra.client, "evolucao", ev)).error?.code).toBe("42501");
      expect((await emitir(outra.client, "consentimento", modelo, { p_cliente_id: paciente })).error?.code).toBe("42501");
      const { error } = await anonClient().schema("aba_health").rpc("emitir_link_assinatura", {
        p_documento: "evolucao", p_documento_id: ev });
      expect(error).not.toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // 2. Abrir: a data de nascimento e o freio
  // ------------------------------------------------------------------
  describe("abrir o documento", () => {
    it("GET não entrega nada do paciente; com a data certa vem o texto exato e o hash dele", async () => {
      const ev = await evolucaoTravada("Avaliação única 03.12 — profilaxia.");
      const l = await emitirOk(owner, "evolucao", ev);
      const g = await getLink(l.token);
      expect(g).toMatchObject({ ok: true, finalidade: "assinatura_paciente" });
      expect(JSON.stringify(g)).not.toContain("Paciente 03.12");
      expect(JSON.stringify(g)).not.toContain("profilaxia");

      const r = await abrir(l.token, NASCIMENTO);
      expect(r.ok).toBe(true);
      expect(r.documento!.conteudo).toContain("Avaliação única 03.12 — profilaxia.");
      expect(r.documento!.hash).toBe(sha256Hex(r.documento!.conteudo));
    });

    it("data errada não abre, e 5 erros freiam AQUELE link — até a data certa fica recusada; outro link do mesmo paciente abre", async () => {
      const ev = await evolucaoTravada();
      const alvo = await emitirOk(owner, "evolucao", ev);
      const vizinho = await emitirOk(owner, "consentimento", modelo, { p_cliente_id: paciente });

      const errada = await abrir(alvo.token, "1991-01-01");
      expect(errada).toMatchObject({ ok: false, motivo: "confirmacao_invalida" });
      expect(errada.documento).toBeUndefined();
      for (let i = 0; i < 4; i++) await abrir(alvo.token, "1991-01-01");

      expect(await abrir(alvo.token, NASCIMENTO)).toMatchObject({ ok: false, motivo: "freado" });
      expect((await abrir(vizinho.token, NASCIMENTO)).ok).toBe(true);
    }, 60_000);

    it("token expirado é recusado", async () => {
      const ev = await evolucaoTravada();
      const l = await emitirOk(owner, "evolucao", ev);
      const dono = await donoPg();
      try {
        await dono.query(
          "UPDATE aba_health.concessoes_externas SET criado_em = now() - interval '4 days', token_expira_em = now() - interval '1 minute' WHERE id = $1",
          [l.id]);
      } finally {
        await dono.end();
      }
      expect(await abrir(l.token, NASCIMENTO)).toMatchObject({ ok: false, motivo: "token_expirado" });
    });
  });

  // ------------------------------------------------------------------
  // 3. Assinar
  // ------------------------------------------------------------------
  describe("assinar", () => {
    it("evolução: grava aceite com o hash, a evidência e o desenho; o link não se reusa; a recusa depois é impossível", async () => {
      const ev = await evolucaoTravada();
      const l = await emitirOk(owner, "evolucao", ev, { p_canal: "qr_code" });
      const doc = (await abrir(l.token, NASCIMENTO)).documento!;

      const r = await assinar(l.token, NASCIMENTO, doc.hash);
      expect(r).toMatchObject({ ok: true, documento: "evolucao" });

      const dono = await donoPg();
      try {
        const { rows: e } = await dono.query(
          "SELECT assinatura_paciente_em, assinatura_paciente_hash FROM aba_health.evolucoes WHERE id = $1", [ev]);
        expect(e[0].assinatura_paciente_hash).toBe(doc.hash);
        const { rows: a } = await dono.query(
          "SELECT canal, hash_documento, desenho_caminho FROM aba_health.assinaturas_externas WHERE concessao_id = $1", [l.id]);
        expect(a[0]).toMatchObject({ canal: "qr_code", hash_documento: doc.hash });
        const partes = (a[0].desenho_caminho as string).split("/");
        const { data } = await admin.storage.from(BUCKET).list(partes.slice(0, 2).join("/"));
        expect((data ?? []).some((o) => o.name === partes[2])).toBe(true);
      } finally {
        await dono.end();
      }

      expect(await assinar(l.token, NASCIMENTO, doc.hash)).toMatchObject({ ok: false, motivo: "token_consumido" });
      const recusa = await owner.schema("aba_health").rpc("registrar_recusa_assinatura", { p_evolucao_id: ev, p_motivo: "não informou" });
      expect(recusa.error).not.toBeNull();
    }, 60_000);

    it("hash que não é o do documento, desenho que não é PNG e data errada: nada gravado, nada no bucket", async () => {
      const ev = await evolucaoTravada();
      const l = await emitirOk(owner, "evolucao", ev);
      const doc = (await abrir(l.token, NASCIMENTO)).documento!;

      expect(await assinar(l.token, NASCIMENTO, sha256Hex("outro texto"))).toMatchObject({ ok: false, motivo: "documento_indisponivel" });
      expect(await assinar(l.token, NASCIMENTO, doc.hash, JPEG())).toMatchObject({ ok: false, motivo: "desenho_invalido" });
      expect(await assinar(l.token, "1980-01-01", doc.hash)).toMatchObject({ ok: false, motivo: "confirmacao_invalida" });

      const { data } = await admin.storage.from(BUCKET).list(`conta-${ctx.accountId}/concessao-${l.id}`);
      expect(data ?? []).toHaveLength(0);
      const dono = await donoPg();
      try {
        const { rows } = await dono.query(
          "SELECT usos, (SELECT count(*)::int FROM aba_health.assinaturas_externas WHERE concessao_id = $1) n FROM aba_health.concessoes_externas WHERE id = $1",
          [l.id]);
        expect(rows[0]).toMatchObject({ usos: 0, n: 0 });
      } finally {
        await dono.end();
      }
    }, 60_000);

    it("contrato: a assinatura por link completa a dupla assinatura e o contrato passa a assinado (mesmo estado da D-V9)", async () => {
      const c = await contratoProntoParaPaciente();
      const l = await emitirOk(adminPapel, "contrato", c.id);
      const doc = (await abrir(l.token, NASCIMENTO)).documento!;
      expect(doc).toMatchObject({ formato: "html", hash: c.hash });

      expect((await assinar(l.token, NASCIMENTO, doc.hash)).ok).toBe(true);
      const { data: k } = await admin.schema("aba_finance").from("contratos").select("status, assinado_em").eq("id", c.id).single();
      expect(k!.status).toBe("assinado");
      const { data: a } = await admin.schema("aba_finance").from("assinaturas_contrato")
        .select("parte, via, hash_assinado").eq("contrato_id", c.id).eq("parte", "paciente").single();
      expect(a).toMatchObject({ via: "link", hash_assinado: c.hash });
    }, 60_000);

    it("documento que muda entre abrir e assinar não se assina: o contrato fica em rascunho", async () => {
      const c = await contratoProntoParaPaciente();
      const l = await emitirOk(owner, "contrato", c.id);
      const doc = (await abrir(l.token, NASCIMENTO)).documento!;

      const novoHtml = "<h1>Contrato alterado</h1>";
      await admin.schema("aba_finance").from("contratos")
        .update({ documento_html: novoHtml, documento_hash: sha256Hex(novoHtml) }).eq("id", c.id);

      expect(await assinar(l.token, NASCIMENTO, doc.hash)).toMatchObject({ ok: false, motivo: "documento_indisponivel" });
      const { data: k } = await admin.schema("aba_finance").from("contratos").select("status").eq("id", c.id).single();
      expect(k!.status).toBe("rascunho");
    }, 60_000);

    it("consentimento: nasce concedido com a evidência do link; termo republicado derruba o link antigo", async () => {
      const l = await emitirOk(owner, "consentimento", modelo, { p_cliente_id: paciente });
      const doc = (await abrir(l.token, NASCIMENTO)).documento!;
      expect(doc.conteudo).toContain("Autorizo o uso de fotografias clínicas");
      expect((await assinar(l.token, NASCIMENTO, doc.hash)).ok).toBe(true);

      const dono = await donoPg();
      try {
        const { rows } = await dono.query(
          "SELECT concedido, tipo, evidencia->>'via' via, evidencia->>'hash' hash FROM aba_health.consentimentos WHERE cliente_id = $1 ORDER BY criado_em DESC LIMIT 1",
          [paciente]);
        expect(rows[0]).toMatchObject({ concedido: true, tipo: "uso_imagem", via: "link", hash: doc.hash });
      } finally {
        await dono.end();
      }

      const antigo = await emitirOk(owner, "consentimento", modelo, { p_cliente_id: paciente });
      const { data: novo, error } = await owner.schema("aba_health").rpc("publicar_modelo_consentimento", {
        p_tipo: "uso_imagem", p_titulo: "Termo de uso de imagem 03.12 v2",
        p_texto: "Autorizo o uso de fotografias clínicas, inclusive em publicações científicas anonimizadas.",
      });
      expect(error).toBeNull();
      expect(await abrir(antigo.token, NASCIMENTO)).toMatchObject({ ok: false, motivo: "documento_indisponivel" });
      modelo = novo as string;
    }, 60_000);
  });

  // ------------------------------------------------------------------
  // 4. Leitura, privilégio e evidência imutável
  // ------------------------------------------------------------------
  describe("leitura e evidência", () => {
    it("owner lê as assinaturas com log por linha e abre o desenho; agent e outra clínica não; anon não assina URL", async () => {
      const ev = await evolucaoTravada();
      const l = await emitirOk(owner, "evolucao", ev);
      const doc = (await abrir(l.token, NASCIMENTO)).documento!;
      await assinar(l.token, NASCIMENTO, doc.hash);

      const dono = await donoPg();
      let caminho: string;
      let assinaturaId: string;
      try {
        const { rows } = await dono.query<{ id: string; desenho_caminho: string }>(
          "SELECT id, desenho_caminho FROM aba_health.assinaturas_externas WHERE concessao_id = $1", [l.id]);
        caminho = rows[0].desenho_caminho;
        assinaturaId = rows[0].id;
      } finally {
        await dono.end();
      }

      const { data, error } = await owner.schema("aba_health").rpc("ler_assinaturas_externas", { p_cliente_id: paciente });
      expect(error).toBeNull();
      expect((data as { assinatura_id: string }[]).some((a) => a.assinatura_id === assinaturaId)).toBe(true);
      const dono2 = await donoPg();
      try {
        const { rows } = await dono2.query(
          "SELECT count(*)::int n FROM aba_health.log_acesso WHERE registro_id = $1 AND tipo_registro = 'assinatura_externa' AND acao = 'leitura'",
          [assinaturaId]);
        expect(rows[0].n).toBe(1);
      } finally {
        await dono2.end();
      }

      expect((await owner.storage.from(BUCKET).createSignedUrl(caminho, 60)).error).toBeNull();
      expect((await agent.storage.from(BUCKET).createSignedUrl(caminho, 60)).error).not.toBeNull();
      expect((await outra.client.storage.from(BUCKET).createSignedUrl(caminho, 60)).error).not.toBeNull();
      expect((await anonClient().storage.from(BUCKET).createSignedUrl(caminho, 60)).error).not.toBeNull();

      expect((await agent.schema("aba_health").rpc("ler_assinaturas_externas", { p_cliente_id: paciente })).error?.code).toBe("42501");
      expect((await outra.client.schema("aba_health").rpc("ler_assinaturas_externas", { p_cliente_id: paciente })).error?.code).toBe("42501");
    }, 60_000);

    it("ninguém de dentro lê a tabela, escreve modelo direto, publica sem ser admin ou chama função de servidor", async () => {
      const ler = await owner.schema("aba_health").from("assinaturas_externas").select("id").limit(1);
      expect(ehErroRls(ler.error!)).toBe(true);
      const inserir = await owner.schema("aba_health").from("modelos_consentimento").insert({
        account_id: ctx.accountId, tipo: "procedimento", versao: 99, titulo: "Direto 03.12",
        texto: "Tentativa de inserir modelo sem a função.", criado_por: ctx.userIds.owner });
      expect(ehErroRls(inserir.error!)).toBe(true);
      const publicar = await agent.schema("aba_health").rpc("publicar_modelo_consentimento", {
        p_tipo: "procedimento", p_titulo: "Agent 03.12", p_texto: "O agent não é administrador da clínica." });
      expect(publicar.error?.code).toBe("42501");
      const servidor = await owner.schema("aba_health").rpc("abrir_documento_externo", {
        p_token: randomBytes(32).toString("base64url"), p_data_nascimento: NASCIMENTO, p_ip: null, p_user_agent: null });
      expect(servidor.error).not.toBeNull();
    });

    it("link de contrato: a recepção (admin) vê e cancela; link de evolução não aparece para ela", async () => {
      const c = await contratoProntoParaPaciente();
      const lc = await emitirOk(adminPapel, "contrato", c.id);
      const ev = await evolucaoTravada();
      const le = await emitirOk(owner, "evolucao", ev);

      const { data } = await adminPapel.schema("aba_health").from("concessoes_externas")
        .select("id, contrato_id").in("id", [lc.id, le.id]);
      const vistos = (data ?? []).map((d) => d.id);
      expect(vistos).toContain(lc.id);
      expect(vistos).not.toContain(le.id);

      expect((await adminPapel.schema("aba_health").rpc("revogar_concessao_externa", { p_concessao_id: lc.id })).error).toBeNull();
      expect((await adminPapel.schema("aba_health").rpc("revogar_concessao_externa", { p_concessao_id: le.id })).error?.code).toBe("42501");
      expect(await abrir(lc.token, NASCIMENTO)).toMatchObject({ ok: false, motivo: "token_revogado" });
    }, 60_000);

    it("nem o dono do banco altera a assinatura, o texto do termo ou reassina a evolução", async () => {
      const ev = await evolucaoTravada();
      const l = await emitirOk(owner, "evolucao", ev);
      const doc = (await abrir(l.token, NASCIMENTO)).documento!;
      await assinar(l.token, NASCIMENTO, doc.hash);

      const dono = await donoPg();
      try {
        await expect(dono.query("UPDATE aba_health.assinaturas_externas SET canal = 'link' WHERE concessao_id = $1", [l.id]))
          .rejects.toMatchObject({ code: "42501" });
        await expect(dono.query("UPDATE aba_health.modelos_consentimento SET texto = texto || ' alterado' WHERE id = $1", [modelo]))
          .rejects.toMatchObject({ code: "42501" });
        await expect(dono.query(
          "UPDATE aba_health.evolucoes SET assinatura_paciente_em = now(), assinatura_paciente_hash = $2 WHERE id = $1",
          [ev, sha256Hex("forjado")])).rejects.toMatchObject({ code: "23514" });
      } finally {
        await dono.end();
      }
    }, 60_000);
  });
});
