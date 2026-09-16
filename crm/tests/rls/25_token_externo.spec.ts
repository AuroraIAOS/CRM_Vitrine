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
 * Subetapa 03.10 — infraestrutura de token externo (P-sub: endpoint público
 * servindo dado clínico). Porte de `sql/20`, `sql/21` e `receber-remessa`
 * do CRM Sindcom (migration 059 + Edge Function `token-externo`).
 *
 * CONCLUSÃO DA SUBETAPA, caso a caso: token válido serve; inexistente,
 * expirado, revogado, já consumido e arquivo inválido são recusados, cada um
 * com o motivo registrado em `aba_health.tentativas_token_externo`.
 *
 * AS TRÊS LIÇÕES DO SINDCOM viram casos permanentes:
 *   1. o freio conta por TOKEN — 5 falhas travam aquele token e o token
 *      válido do MESMO destinatário, da MESMA conta e do MESMO IP continua
 *      servindo;
 *   2. `file_size_limit`/`allowed_mime_types` recusam no próprio Storage,
 *      mesmo para `service_role`;
 *   3. a policy de leitura do bucket existe: o controle POSITIVO (owner
 *      assina URL e baixa) é a metade que prova que ela não é "negar tudo".
 *
 * PERSONAGENS: os quatro papéis da conta de teste compartilhada (o `agent`
 * não tem alcance clínico) e `outra`, owner de uma conta descartável.
 */

const admin = adminClient();
const FUNCAO = `${AMBIENTE_DE_TESTE.url}/functions/v1/token-externo`;
const BUCKET = "remessas-externas";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(64)]);
const EXE_COM_NOME_DE_PDF = Buffer.concat([Buffer.from("MZ"), randomBytes(128)]);

type Resposta = { ok: boolean; motivo?: string; [k: string]: unknown };

const sha256Hex = (texto: string) => createHash("sha256").update(texto, "utf8").digest("hex");
/** Texto com FORMA de token (43 base64url) que não foi emitido. */
const tokenFalso = () => randomBytes(32).toString("base64url");

async function donoPg() {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_TEST_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
}

async function chamar(metodo: "GET" | "POST", token?: string, arquivo?: { bytes: Buffer; nome: string; tipo: string }) {
  const headers: Record<string, string> = { apikey: AMBIENTE_DE_TESTE.anonKey };
  if (token !== undefined) headers["x-token-externo"] = token;
  let body: FormData | undefined;
  if (metodo === "POST") {
    body = new FormData();
    if (arquivo) body.append("arquivo", new Blob([new Uint8Array(arquivo.bytes)], { type: arquivo.tipo }), arquivo.nome);
    else body.append("outro_campo", "sem arquivo");
  }
  const r = await fetch(FUNCAO, { method: metodo, headers, body });
  expect(r.status).toBe(200); // recusa é RESULTADO, nunca status de erro
  return (await r.json()) as Resposta;
}

async function entrar(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(AMBIENTE_DE_TESTE.url, AMBIENTE_DE_TESTE.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

describe("token externo: concessão, freio por token, remessa e bucket (Subetapa 03.10)", () => {
  let ctx: TestContext;
  let owner: SupabaseClient;
  let agent: SupabaseClient;
  let viewer: SupabaseClient;
  let outra: { userId: string; client: SupabaseClient; conta: string };

  let paciente: string;        // conta compartilhada
  let laboratorio: string;     // pessoa destinatária, conta compartilhada
  let pacienteOutra: string;   // conta descartável
  let laboratorioOutra: string; // fornecedor da conta descartável

  const concessoes: string[] = [];
  const hashesFalsos: string[] = [];

  // 060 (03.11): link de exame só se emite para fornecedor ativo — o
  // laboratório do fixture é fornecedor desde então.
  async function inserirPessoa(conta: string, nome: string, cliente: boolean, fornecedor = false) {
    const { data: p, error } = await admin.schema("aba_people").from("pessoas")
      .insert({ account_id: conta, nome_exibicao: nome }).select("id").single();
    if (error) throw error;
    if (cliente) {
      const { error: e2 } = await admin.schema("aba_people").from("clientes")
        .insert({ id: p.id, account_id: conta, razao_social: nome, status: "ativo" });
      if (e2) throw e2;
    }
    if (fornecedor) {
      const { error: e3 } = await admin.schema("aba_people").from("fornecedores")
        .insert({ id: p.id, account_id: conta, razao_social: nome });
      if (e3) throw e3;
    }
    return p.id as string;
  }

  async function emitir(
    quem: SupabaseClient,
    args: { cliente?: string; pessoa?: string; finalidade?: string; usos?: number | null; validade?: string },
  ) {
    const { data, error } = await quem.schema("aba_health").rpc("emitir_concessao_externa", {
      p_cliente_id: args.cliente ?? paciente,
      p_pessoa_id: args.pessoa ?? laboratorio,
      p_finalidade: args.finalidade ?? "recepcao_exame",
      p_validade: args.validade ?? "7 days",
      p_usos_maximos: args.usos ?? null,
    });
    if (!error) {
      const linha = (data as { concessao_id: string; token: string; token_expira_em: string }[])[0];
      concessoes.push(linha.concessao_id);
      return { linha, error: null };
    }
    return { linha: null, error };
  }

  async function emitirOk(quem: SupabaseClient, args: Parameters<typeof emitir>[1] = {}) {
    const { linha, error } = await emitir(quem, args);
    if (error) throw error;
    return linha!;
  }

  async function tentativas(tokenOuHash: string, jaEhHash = false) {
    const dono = await donoPg();
    try {
      const { rows } = await dono.query<{ sucesso: boolean; motivo: string | null; metodo: string }>(
        `SELECT sucesso, motivo, metodo FROM aba_health.tentativas_token_externo
          WHERE token_alvo_hash = decode($1, 'hex') ORDER BY id`,
        [jaEhHash ? tokenOuHash : sha256Hex(tokenOuHash.slice(0, 512))],
      );
      return rows;
    } finally {
      await dono.end();
    }
  }

  beforeAll(async () => {
    ctx = await loadContext();
    [owner, agent, viewer] = await Promise.all([clientAs("owner"), clientAs("agent"), clientAs("viewer")]);
    paciente = await inserirPessoa(ctx.accountId, "Paciente 03.10", true);
    laboratorio = await inserirPessoa(ctx.accountId, "Laboratório 03.10", false, true);

    const u = await createThrowawayUser(admin, "token-externo-outra");
    const client = await entrar(u.email, u.password);
    const { data: perfil, error } = await admin.from("profiles").select("account_id").eq("user_id", u.userId).single();
    if (error) throw error;
    outra = { userId: u.userId, client, conta: perfil.account_id };
    pacienteOutra = await inserirPessoa(outra.conta, "Paciente da outra 03.10", true);
    laboratorioOutra = await inserirPessoa(outra.conta, "Laboratório da outra 03.10", false, true);
  }, 60_000);

  afterAll(async () => {
    const dono = await donoPg();
    try {
      const { rows } = await dono.query<{ arquivo_caminho: string }>(
        "SELECT arquivo_caminho FROM aba_health.remessas_externas WHERE concessao_id = ANY($1)", [concessoes]);
      // storage.objects recusa DELETE por SQL (instrucoes.md §5): pela Storage API.
      for (const id of concessoes) {
        for (const conta of [ctx.accountId, outra?.conta]) {
          const prefixo = `conta-${conta}/concessao-${id}`;
          const { data } = await admin.storage.from(BUCKET).list(prefixo);
          if (data?.length) await admin.storage.from(BUCKET).remove(data.map((o) => `${prefixo}/${o.name}`));
        }
      }
      if (rows.length) await admin.storage.from(BUCKET).remove(rows.map((r) => r.arquivo_caminho));
      await dono.query("DELETE FROM aba_health.remessas_externas WHERE concessao_id = ANY($1)", [concessoes]);
      await dono.query("DELETE FROM aba_health.log_acesso WHERE registro_id = ANY($1)", [concessoes]);
      await dono.query("DELETE FROM aba_health.concessoes_externas WHERE id = ANY($1)", [concessoes]);
      await dono.query(
        "DELETE FROM aba_health.tentativas_token_externo WHERE encode(token_alvo_hash, 'hex') = ANY($1)", [hashesFalsos]);
      await dono.query("UPDATE licensing.account_limits SET tier_key = 'diamante' WHERE account_id = $1", [outra?.conta]);
      await dono.query("DELETE FROM licensing.tiers WHERE key = 'teste_03_10'");
    } finally {
      await dono.end();
    }
    for (const [conta, id] of [[ctx.accountId, paciente], [ctx.accountId, laboratorio], [outra?.conta, pacienteOutra], [outra?.conta, laboratorioOutra]]) {
      if (!id) continue;
      await admin.schema("aba_people").from("fornecedores").delete().eq("id", id).eq("account_id", conta);
      await admin.schema("aba_people").from("clientes").delete().eq("id", id).eq("account_id", conta);
      await admin.schema("aba_people").from("pessoas").delete().eq("id", id).eq("account_id", conta);
    }
    if (outra) await deleteThrowawayUser(admin, outra.userId);
  }, 120_000);

  // ------------------------------------------------------------------
  // 1. EMISSÃO — só a clínica, só sobre paciente ao alcance, só o hash fica
  // ------------------------------------------------------------------
  describe("emissão e revogação", () => {
    it("owner emite: token de 43 caracteres, banco guarda só o sha256, log sem o token", async () => {
      const c = await emitirOk(owner);
      expect(c.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const dono = await donoPg();
      try {
        const { rows } = await dono.query(
          "SELECT encode(token_hash, 'hex') h, usos, usos_maximos FROM aba_health.concessoes_externas WHERE id = $1",
          [c.concessao_id]);
        expect(rows[0].h).toBe(sha256Hex(c.token));
        const { rows: log } = await dono.query(
          "SELECT acao, tipo_registro, contexto::text ctx FROM aba_health.log_acesso WHERE registro_id = $1", [c.concessao_id]);
        expect(log).toHaveLength(1);
        expect(log[0]).toMatchObject({ acao: "criacao", tipo_registro: "concessao_externa" });
        expect(log[0].ctx).not.toContain(c.token);
      } finally {
        await dono.end();
      }
    });

    it("authenticated não lê token_hash, não escreve direto e não chama função de servidor", async () => {
      const lerHash = await owner.schema("aba_health").from("concessoes_externas").select("id, token_hash").limit(1);
      expect(ehErroRls(lerHash.error!)).toBe(true);

      const lerSemHash = await owner.schema("aba_health").from("concessoes_externas").select("id, finalidade, token_expira_em");
      expect(lerSemHash.error).toBeNull();

      const inserir = await owner.schema("aba_health").from("concessoes_externas").insert({
        account_id: ctx.accountId, cliente_id: paciente, pessoa_id: laboratorio, finalidade: "recepcao_exame",
        token_hash: "\\x00", token_expira_em: new Date(Date.now() + 86_400_000).toISOString(), criado_por: ctx.userIds.owner,
      });
      expect(ehErroRls(inserir.error!)).toBe(true);

      for (const t of ["tentativas_token_externo", "remessas_externas"]) {
        const r = await owner.schema("aba_health").from(t).select("id").limit(1);
        expect(ehErroRls(r.error!), t).toBe(true);
      }

      const servidor = await owner.schema("aba_health").rpc("resolver_token_externo", {
        p_token: tokenFalso(), p_metodo: "GET", p_ip: null, p_user_agent: null,
      });
      expect(ehErroRls(servidor.error!)).toBe(true);
    });

    it("anon não lê nada e não emite", async () => {
      const anon = anonClient();
      for (const t of ["concessoes_externas", "tentativas_token_externo", "remessas_externas"]) {
        const r = await anon.schema("aba_health").from(t).select("id").limit(1);
        expect(r.error, t).not.toBeNull();
      }
      const e = await anon.schema("aba_health").rpc("emitir_concessao_externa", {
        p_cliente_id: paciente, p_pessoa_id: laboratorio, p_finalidade: "recepcao_exame",
      });
      expect(e.error).not.toBeNull();
    });

    it("agent sem alcance clínico e viewer não emitem", async () => {
      for (const quem of [agent, viewer]) {
        const { error } = await emitir(quem, {});
        expect(error?.code).toBe("42501");
      }
    });

    it("validade acima de 90 dias e usos zero são recusados pelo banco", async () => {
      expect((await emitir(owner, { validade: "91 days" })).error?.code).toBe("23514");
      expect((await emitir(owner, { usos: 0 })).error?.code).toBe("23514");
    });

    it("revogar: link passa a token_revogado; segunda revogação é recusada; log de atualização", async () => {
      const c = await emitirOk(owner);
      const r1 = await owner.schema("aba_health").rpc("revogar_concessao_externa", { p_concessao_id: c.concessao_id });
      expect(r1.error).toBeNull();
      const r2 = await owner.schema("aba_health").rpc("revogar_concessao_externa", { p_concessao_id: c.concessao_id });
      expect(r2.error?.code).toBe("23514");

      const resp = await chamar("GET", c.token);
      expect(resp).toMatchObject({ ok: false, motivo: "token_revogado" });
      expect((await tentativas(c.token)).at(-1)).toMatchObject({ sucesso: false, motivo: "token_revogado" });

      const dono = await donoPg();
      try {
        const { rows } = await dono.query(
          "SELECT count(*)::int n FROM aba_health.log_acesso WHERE registro_id = $1 AND acao = 'atualizacao'", [c.concessao_id]);
        expect(rows[0].n).toBe(1);
      } finally {
        await dono.end();
      }
    });
  });

  // ------------------------------------------------------------------
  // 2. ENTRE CONTAS e TRAVA DE NÍVEL
  // ------------------------------------------------------------------
  describe("fronteira de conta e nível contratado", () => {
    it("a outra clínica emite para o próprio paciente, mas não para paciente desta nem com destinatário desta", async () => {
      const propria = await emitir(outra.client, { cliente: pacienteOutra, pessoa: laboratorioOutra });
      expect(propria.error).toBeNull();

      expect((await emitir(outra.client, { cliente: paciente, pessoa: laboratorioOutra })).error?.code).toBe("42501");
      expect((await emitir(outra.client, { cliente: pacienteOutra, pessoa: laboratorio })).error?.code).toBe("42501");
    });

    it("a outra clínica não enxerga nem revoga concessão desta, e vice-versa", async () => {
      const desta = await emitirOk(owner);
      const daOutra = await emitirOk(outra.client, { cliente: pacienteOutra, pessoa: laboratorioOutra });

      const { data: vistas } = await outra.client.schema("aba_health").from("concessoes_externas").select("id, account_id");
      expect((vistas ?? []).every((v) => v.account_id === outra.conta)).toBe(true);
      expect((vistas ?? []).some((v) => v.id === desta.concessao_id)).toBe(false);

      const r1 = await outra.client.schema("aba_health").rpc("revogar_concessao_externa", { p_concessao_id: desta.concessao_id });
      expect(r1.error?.code).toBe("42501");
      const r2 = await owner.schema("aba_health").rpc("revogar_concessao_externa", { p_concessao_id: daOutra.concessao_id });
      expect(r2.error?.code).toBe("42501");
    });

    it("com `health` fora do nível, nem o owner emite", async () => {
      const dono = await donoPg();
      try {
        await dono.query("INSERT INTO licensing.tiers (key, label, position) VALUES ('teste_03_10', 'Teste 03.10', 98) ON CONFLICT DO NOTHING");
        await dono.query(
          `INSERT INTO licensing.tier_modules (tier_key, module_key, enabled)
             SELECT 'teste_03_10', m.key, m.key <> 'health' FROM access.modules m ON CONFLICT DO NOTHING`);
        await dono.query("UPDATE licensing.account_limits SET tier_key = 'teste_03_10' WHERE account_id = $1", [outra.conta]);
        const cortado = await emitir(outra.client, { cliente: pacienteOutra, pessoa: laboratorioOutra });
        expect(cortado.error?.code).toBe("42501");
      } finally {
        await dono.query("UPDATE licensing.account_limits SET tier_key = 'diamante' WHERE account_id = $1", [outra.conta]);
        await dono.end();
      }
    });
  });

  // ------------------------------------------------------------------
  // 3. OS DESFECHOS DO ENDPOINT PÚBLICO
  // ------------------------------------------------------------------
  describe("endpoint público token-externo: cada desfecho com o motivo registrado", () => {
    it("sem token: recusa, sem registro", async () => {
      expect(await chamar("GET")).toMatchObject({ ok: false, motivo: "token_ausente" });
    });

    it("inexistente — com forma de token e lixo de 10 KB — é recusado e registrado, sem erro 500", async () => {
      const falso = tokenFalso();
      hashesFalsos.push(sha256Hex(falso));
      expect(await chamar("GET", falso)).toMatchObject({ ok: false, motivo: "token_inexistente" });
      expect(await tentativas(falso)).toEqual([{ sucesso: false, motivo: "token_inexistente", metodo: "GET" }]);

      const lixo = "x".repeat(10_000);
      hashesFalsos.push(sha256Hex(lixo.slice(0, 512)));
      expect(await chamar("GET", lixo)).toMatchObject({ ok: false, motivo: "token_inexistente" });
      expect((await tentativas(lixo)).length).toBeGreaterThanOrEqual(1);
    });

    it("válido serve: GET devolve clínica e prazo, e nada do paciente", async () => {
      const c = await emitirOk(owner);
      const r = await chamar("GET", c.token);
      expect(r).toMatchObject({ ok: true, finalidade: "recepcao_exame", aceita_arquivo: true, usos_restantes: null });
      expect(Object.keys(r).sort()).toEqual(["aceita_arquivo", "clinica", "expira_em", "finalidade", "ok", "usos_restantes"]);
      expect(JSON.stringify(r)).not.toContain(paciente);
      expect((await tentativas(c.token)).at(-1)).toMatchObject({ sucesso: true, motivo: null, metodo: "GET" });
    });

    it("válido serve: POST de PDF grava a remessa na conta da concessão e consome um uso", async () => {
      const c = await emitirOk(owner, { usos: 3 });
      const r = await chamar("POST", c.token, { bytes: PDF, nome: "laudo.pdf", tipo: "application/pdf" });
      expect(r.ok).toBe(true);

      const dono = await donoPg();
      try {
        const { rows } = await dono.query(
          `SELECT r.account_id, r.cliente_id, r.mime, r.tamanho_bytes::int t, r.arquivo_caminho, encode(r.sha256, 'hex') h,
                  c.usos, c.primeiro_uso_em IS NOT NULL carimbado
             FROM aba_health.remessas_externas r JOIN aba_health.concessoes_externas c ON c.id = r.concessao_id
            WHERE r.id = $1`, [r.remessa_id]);
        expect(rows[0]).toMatchObject({
          account_id: ctx.accountId, cliente_id: paciente, mime: "application/pdf", t: PDF.length, usos: 1, carimbado: true,
          h: createHash("sha256").update(PDF).digest("hex"),
        });
        expect(String(rows[0].arquivo_caminho).startsWith(`conta-${ctx.accountId}/concessao-${c.concessao_id}/`)).toBe(true);
      } finally {
        await dono.end();
      }
      expect((await tentativas(c.token)).at(-1)).toMatchObject({ sucesso: true, metodo: "POST" });
    });

    it("expirado é recusado e registrado", async () => {
      const c = await emitirOk(owner);
      const dono = await donoPg();
      try {
        await dono.query(
          `UPDATE aba_health.concessoes_externas
              SET criado_em = NOW() - INTERVAL '2 days', token_expira_em = NOW() - INTERVAL '1 day' WHERE id = $1`,
          [c.concessao_id]);
      } finally {
        await dono.end();
      }
      expect(await chamar("GET", c.token)).toMatchObject({ ok: false, motivo: "token_expirado" });
      expect((await tentativas(c.token)).at(-1)).toMatchObject({ sucesso: false, motivo: "token_expirado" });
    });

    it("já consumido: uso único recusa o segundo envio e a consulta seguinte", async () => {
      const c = await emitirOk(owner, { usos: 1 });
      expect((await chamar("POST", c.token, { bytes: PNG, nome: "rx.png", tipo: "image/png" })).ok).toBe(true);
      expect(await chamar("POST", c.token, { bytes: PDF, nome: "laudo.pdf", tipo: "application/pdf" }))
        .toMatchObject({ ok: false, motivo: "token_consumido" });
      expect(await chamar("GET", c.token)).toMatchObject({ ok: false, motivo: "token_consumido" });
      expect((await tentativas(c.token)).filter((t) => t.motivo === "token_consumido")).toHaveLength(2);
    });

    it("corrida: dois envios simultâneos num uso único — um passa, o outro é consumido, nenhum arquivo órfão", async () => {
      const c = await emitirOk(owner, { usos: 1 });
      const [a, b] = await Promise.all([
        chamar("POST", c.token, { bytes: PDF, nome: "a.pdf", tipo: "application/pdf" }),
        chamar("POST", c.token, { bytes: PDF, nome: "b.pdf", tipo: "application/pdf" }),
      ]);
      const motivos = [a, b].map((x) => (x.ok ? "ok" : x.motivo)).sort();
      expect(motivos).toEqual(["ok", "token_consumido"]);

      const { data: objetos } = await admin.storage.from(BUCKET).list(`conta-${ctx.accountId}/concessao-${c.concessao_id}`);
      expect(objetos ?? []).toHaveLength(1);
    }, 60_000);

    it("arquivo inválido (bytes de executável com nome .pdf), ausente e finalidade sem arquivo: recusados e registrados, sem consumir", async () => {
      const c = await emitirOk(owner, { usos: 1 });
      expect(await chamar("POST", c.token, { bytes: EXE_COM_NOME_DE_PDF, nome: "laudo.pdf", tipo: "application/pdf" }))
        .toMatchObject({ ok: false, motivo: "arquivo_invalido" });
      expect(await chamar("POST", c.token)).toMatchObject({ ok: false, motivo: "arquivo_ausente" });
      expect((await tentativas(c.token)).map((t) => t.motivo)).toEqual(["arquivo_invalido", "arquivo_ausente"]);
      // Nada foi consumido: o uso único continua disponível.
      expect(await chamar("GET", c.token)).toMatchObject({ ok: true, usos_restantes: 1 });

      const assinatura = await emitirOk(owner, { finalidade: "assinatura_paciente" });
      expect(await chamar("POST", assinatura.token, { bytes: PDF, nome: "x.pdf", tipo: "application/pdf" }))
        .toMatchObject({ ok: false, motivo: "finalidade_incompativel" });
    });

    it("motivo de token não entra pela porta de recusa de arquivo (ninguém alimenta o freio de token alheio)", async () => {
      const c = await emitirOk(owner);
      const { data } = await admin.schema("aba_health").rpc("registrar_recusa_token_externo", {
        p_token: c.token, p_motivo: "token_inexistente", p_ip: null, p_user_agent: null,
      });
      expect(data).toMatchObject({ ok: false, motivo: "motivo_invalido" });
      expect(await tentativas(c.token)).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // 4. O FREIO — por token, nunca pela entidade
  // ------------------------------------------------------------------
  describe("freio por token (lição 1 do Sindcom)", () => {
    it("5 falhas travam AQUELE token; o token válido do mesmo destinatário, conta e IP segue servindo", async () => {
      const valido = await emitirOk(owner);
      const revogado = await emitirOk(owner);
      await owner.schema("aba_health").rpc("revogar_concessao_externa", { p_concessao_id: revogado.concessao_id });

      for (let i = 0; i < 5; i++) {
        expect(await chamar("GET", revogado.token)).toMatchObject({ ok: false, motivo: "token_revogado" });
      }
      expect(await chamar("GET", revogado.token)).toMatchObject({ ok: false, motivo: "freado" });
      // A consulta ao freio não se registra: a trava não se renova sozinha.
      expect(await tentativas(revogado.token)).toHaveLength(5);

      // Mesmo laboratório, mesma clínica, mesmo IP: o link legítimo não foi silenciado.
      expect(await chamar("GET", valido.token)).toMatchObject({ ok: true });
      expect((await chamar("POST", valido.token, { bytes: PDF, nome: "laudo.pdf", tipo: "application/pdf" })).ok).toBe(true);
    }, 60_000);

    it("varredura com tokens inventados trava cada texto, não o endpoint", async () => {
      const falso = tokenFalso();
      hashesFalsos.push(sha256Hex(falso));
      for (let i = 0; i < 5; i++) await chamar("GET", falso);
      expect(await chamar("GET", falso)).toMatchObject({ ok: false, motivo: "freado" });

      const valido = await emitirOk(owner);
      expect(await chamar("GET", valido.token)).toMatchObject({ ok: true });
    }, 60_000);

    it("arquivo inválido não freia: remetente legítimo errando o arquivo não se tranca para fora", async () => {
      const c = await emitirOk(owner);
      for (let i = 0; i < 6; i++) {
        expect(await chamar("POST", c.token, { bytes: EXE_COM_NOME_DE_PDF, nome: "x.pdf", tipo: "application/pdf" }))
          .toMatchObject({ ok: false, motivo: "arquivo_invalido" });
      }
      expect(await chamar("GET", c.token)).toMatchObject({ ok: true });
    }, 60_000);
  });

  // ------------------------------------------------------------------
  // 5. STORAGE — as duas camadas e a policy que não pode faltar
  // ------------------------------------------------------------------
  describe("bucket remessas-externas", () => {
    let caminho: string;
    let concessao: string;

    beforeAll(async () => {
      const c = await emitirOk(owner);
      concessao = c.concessao_id;
      const r = await chamar("POST", c.token, { bytes: PDF, nome: "laudo.pdf", tipo: "application/pdf" });
      const dono = await donoPg();
      try {
        const { rows } = await dono.query("SELECT arquivo_caminho FROM aba_health.remessas_externas WHERE id = $1", [r.remessa_id]);
        caminho = String(rows[0].arquivo_caminho);
      } finally {
        await dono.end();
      }
    });

    it("controle positivo: o owner (alcance clínico) assina URL e baixa o arquivo", async () => {
      const { data, error } = await owner.storage.from(BUCKET).createSignedUrl(caminho, 60);
      expect(error).toBeNull();
      const baixado = await fetch(data!.signedUrl);
      expect(baixado.status).toBe(200);
      expect(Buffer.from(await baixado.arrayBuffer()).equals(PDF)).toBe(true);
    });

    it("sem alcance clínico (agent, viewer), outra clínica e anon: não assinam nem listam", async () => {
      const anon = anonClient();
      for (const [nome, quem] of [["agent", agent], ["viewer", viewer], ["outra", outra.client], ["anon", anon]] as const) {
        const { error } = await quem.storage.from(BUCKET).createSignedUrl(caminho, 60);
        expect(error, nome).not.toBeNull();
        const { data } = await quem.storage.from(BUCKET).list(`conta-${ctx.accountId}/concessao-${concessao}`);
        expect(data ?? [], nome).toHaveLength(0);
      }
    });

    it("anon e authenticated não sobem arquivo direto (RLS do Storage, com o mime CERTO para não confundir com o 415)", async () => {
      const anon = anonClient();
      for (const [nome, quem] of [["anon", anon], ["owner", owner]] as const) {
        const { error } = await quem.storage.from(BUCKET)
          .upload(`conta-${ctx.accountId}/concessao-${concessao}/${crypto.randomUUID()}.pdf`, PDF, { contentType: "application/pdf" });
        expect(error, nome).not.toBeNull();
        expect(String(error?.message), nome).toMatch(/row-level security|Unauthorized|not allowed|403/i);
      }
    });

    it("segunda camada: o Storage recusa mime fora da lista e arquivo acima de 20 MB até para service_role", async () => {
      const base = `conta-${ctx.accountId}/concessao-${concessao}`;
      const mime = await admin.storage.from(BUCKET).upload(`${base}/${crypto.randomUUID()}.txt`, Buffer.from("texto"), { contentType: "text/plain" });
      expect(mime.error).not.toBeNull();
      expect(String(mime.error?.message)).toMatch(/mime/i);

      const grande = Buffer.concat([PDF, Buffer.alloc(20 * 1024 * 1024 + 1024)]);
      const tamanho = await admin.storage.from(BUCKET).upload(`${base}/${crypto.randomUUID()}.pdf`, grande, { contentType: "application/pdf" });
      expect(tamanho.error).not.toBeNull();
      expect(String(tamanho.error?.message)).toMatch(/size|exceeded|too large/i);
    }, 120_000);

    it("a remessa é imutável: nem o dono do banco altera a evidência; o status pode ser regravado", async () => {
      const dono = await donoPg();
      try {
        await expect(dono.query("UPDATE aba_health.remessas_externas SET ip_origem = '10.0.0.1' WHERE arquivo_caminho = $1", [caminho]))
          .rejects.toMatchObject({ code: "42501" });
        const { rows } = await dono.query(
          "UPDATE aba_health.remessas_externas SET status = 'recebida' WHERE arquivo_caminho = $1 RETURNING id", [caminho]);
        expect(rows).toHaveLength(1);
      } finally {
        await dono.end();
      }
    });
  });

  // ------------------------------------------------------------------
  // 6. CATÁLOGO — o token cru não tem onde morar
  // ------------------------------------------------------------------
  it("nenhuma coluna de texto das três tabelas pode guardar token (só hash em bytea)", async () => {
    const dono = await donoPg();
    try {
      const { rows } = await dono.query<{ t: string; c: string }>(
        `SELECT table_name t, column_name c FROM information_schema.columns
          WHERE table_schema = 'aba_health' AND data_type = 'text'
            AND table_name IN ('concessoes_externas', 'tentativas_token_externo', 'remessas_externas') ORDER BY 1, 2`);
      expect(rows.map((r) => `${r.t}.${r.c}`)).toEqual([
        "concessoes_externas.canal", "concessoes_externas.finalidade",
        "remessas_externas.arquivo_caminho", "remessas_externas.mime", "remessas_externas.motivo_rejeicao",
        "remessas_externas.nome_original",
        "remessas_externas.status", "remessas_externas.user_agent",
        "tentativas_token_externo.metodo", "tentativas_token_externo.motivo", "tentativas_token_externo.user_agent",
      ]);
    } finally {
      await dono.end();
    }
  });
});
