import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient, anonClient, clientAs, createThrowawayUser, deleteThrowawayUser, loadContext,
  type TestContext,
} from "./helpers";
import { AMBIENTE_DE_TESTE } from "./ambiente";

/**
 * Subetapa 03.11 — caixa de entrada de exames (P-sub: `aba_health` +
 * endpoint público). Migration 060 + Edge Function `remessa-rejeitar`,
 * sobre a infraestrutura da 03.10.
 *
 * CONCLUSÃO DA SUBETAPA, caso a caso: arquivo enviado por token cai na
 * caixa de entrada, NÃO no prontuário; só o aceite explícito (depois da
 * conferência) o migra; o rejeitado não deixa resíduo legível — a leitura
 * é negada na mesma transação e os bytes saem do bucket.
 *
 * ATAQUES: pular a conferência, voltar estado, decidir duas vezes em
 * paralelo, mexer na remessa pelo dono do banco, decidir remessa de outra
 * clínica, ler a caixa sem alcance clínico, ler arquivo rejeitado pela
 * janela entre a rejeição e o expurgo, e emitir link de exame para quem
 * não é laboratório.
 */

const admin = adminClient();
const FUNCAO_TOKEN = `${AMBIENTE_DE_TESTE.url}/functions/v1/token-externo`;
const FUNCAO_REJEITAR = `${AMBIENTE_DE_TESTE.url}/functions/v1/remessa-rejeitar`;
const BUCKET = "remessas-externas";
const PDF = () => Buffer.concat([Buffer.from("%PDF-1.4\n"), randomBytes(48), Buffer.from("\n%%EOF\n")]);

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

async function jwtDe(c: SupabaseClient) {
  const { data } = await c.auth.getSession();
  return data.session!.access_token;
}

describe("caixa de entrada de exames (Subetapa 03.11)", () => {
  let ctx: TestContext;
  let owner: SupabaseClient;
  let agent: SupabaseClient;
  let outra: { userId: string; client: SupabaseClient; conta: string };

  let paciente: string;
  let laboratorio: string;
  let naoFornecedor: string;
  let fornecedorInativo: string;

  const concessoes: string[] = [];
  const pessoas: [string, string][] = [];

  async function inserirPessoa(conta: string, nome: string, tipo: "cliente" | "fornecedor" | "nada", ativo = true) {
    const { data: p, error } = await admin.schema("aba_people").from("pessoas")
      .insert({ account_id: conta, nome_exibicao: nome }).select("id").single();
    if (error) throw error;
    if (tipo === "cliente") {
      const { error: e } = await admin.schema("aba_people").from("clientes")
        .insert({ id: p.id, account_id: conta, razao_social: nome, status: "ativo" });
      if (e) throw e;
    }
    if (tipo === "fornecedor") {
      const { error: e } = await admin.schema("aba_people").from("fornecedores")
        .insert({ id: p.id, account_id: conta, razao_social: nome, ativo });
      if (e) throw e;
    }
    pessoas.push([conta, p.id]);
    return p.id as string;
  }

  async function emitir(quem: SupabaseClient, pessoa: string) {
    const { data, error } = await quem.schema("aba_health").rpc("emitir_concessao_externa", {
      p_cliente_id: paciente, p_pessoa_id: pessoa, p_finalidade: "recepcao_exame", p_validade: "1 day",
    });
    if (error) return { token: null, error };
    const l = (data as { concessao_id: string; token: string }[])[0];
    concessoes.push(l.concessao_id);
    return { token: l.token, error: null };
  }

  /** O laboratório manda um PDF pelo endpoint público; devolve a remessa. */
  async function remessaNova(): Promise<{ id: string; caminho: string }> {
    const { token, error } = await emitir(owner, laboratorio);
    if (error) throw error;
    const corpo = new FormData();
    corpo.append("arquivo", new Blob([new Uint8Array(PDF())], { type: "application/pdf" }), "hemograma.pdf");
    const r = await fetch(FUNCAO_TOKEN, {
      method: "POST", headers: { apikey: AMBIENTE_DE_TESTE.anonKey, "x-token-externo": token! }, body: corpo,
    });
    const j = (await r.json()) as { ok: boolean; remessa_id: string; motivo?: string };
    expect(j, j.motivo).toMatchObject({ ok: true });
    const dono = await donoPg();
    try {
      const { rows } = await dono.query<{ arquivo_caminho: string }>(
        "SELECT arquivo_caminho FROM aba_health.remessas_externas WHERE id = $1", [j.remessa_id]);
      return { id: j.remessa_id, caminho: rows[0].arquivo_caminho };
    } finally {
      await dono.end();
    }
  }

  const processar = (quem: SupabaseClient, id: string, para: string, motivo?: string) =>
    quem.schema("aba_health").rpc("processar_remessa_externa", { p_remessa_id: id, p_para: para, p_motivo: motivo ?? null });

  async function rejeitarPelaFuncao(quem: SupabaseClient | null, id: string, motivo = "exame de outro paciente") {
    const headers: Record<string, string> = { apikey: AMBIENTE_DE_TESTE.anonKey, "content-type": "application/json" };
    if (quem) headers.authorization = `Bearer ${await jwtDe(quem)}`;
    const r = await fetch(FUNCAO_REJEITAR, { method: "POST", headers, body: JSON.stringify({ remessa_id: id, motivo }) });
    return { status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  }

  async function linha(id: string) {
    const dono = await donoPg();
    try {
      const { rows } = await dono.query<{
        status: string; processada_em: string; processada_por: string | null; motivo_rejeicao: string | null;
        arquivo_expurgado_em: string | null; sha: string; ip: string | null;
      }>(
        `SELECT status, processada_em, processada_por, motivo_rejeicao, arquivo_expurgado_em,
                encode(sha256, 'hex') sha, host(ip_origem) ip
           FROM aba_health.remessas_externas WHERE id = $1`, [id]);
      return rows[0];
    } finally {
      await dono.end();
    }
  }

  async function logs(id: string, acao?: string) {
    const dono = await donoPg();
    try {
      const { rows } = await dono.query(
        `SELECT count(*)::int n FROM aba_health.log_acesso
          WHERE registro_id = $1 AND tipo_registro = 'remessa_externa' AND ($2::text IS NULL OR acao = $2)`,
        [id, acao ?? null]);
      return rows[0].n as number;
    } finally {
      await dono.end();
    }
  }

  async function objetoExiste(caminho: string) {
    const partes = caminho.split("/");
    const { data } = await admin.storage.from(BUCKET).list(partes.slice(0, 2).join("/"), { search: partes[2] });
    return (data ?? []).some((o) => o.name === partes[2]);
  }

  beforeAll(async () => {
    ctx = await loadContext();
    [owner, agent] = await Promise.all([clientAs("owner"), clientAs("agent")]);
    paciente = await inserirPessoa(ctx.accountId, "Paciente 03.11", "cliente");
    laboratorio = await inserirPessoa(ctx.accountId, "Laboratório 03.11", "fornecedor");
    naoFornecedor = await inserirPessoa(ctx.accountId, "Pessoa comum 03.11", "nada");
    fornecedorInativo = await inserirPessoa(ctx.accountId, "Laboratório inativo 03.11", "fornecedor", false);

    const u = await createThrowawayUser(admin, "caixa-exames-outra");
    const client = await entrar(u.email, u.password);
    const { data: perfil, error } = await admin.from("profiles").select("account_id").eq("user_id", u.userId).single();
    if (error) throw error;
    outra = { userId: u.userId, client, conta: perfil.account_id };
  }, 60_000);

  afterAll(async () => {
    const dono = await donoPg();
    try {
      const { rows } = await dono.query<{ id: string; arquivo_caminho: string }>(
        "SELECT id, arquivo_caminho FROM aba_health.remessas_externas WHERE concessao_id = ANY($1)", [concessoes]);
      // storage.objects recusa DELETE por SQL (instrucoes.md §5): pela Storage API.
      if (rows.length) await admin.storage.from(BUCKET).remove(rows.map((r) => r.arquivo_caminho));
      await dono.query("DELETE FROM aba_health.remessas_externas WHERE concessao_id = ANY($1)", [concessoes]);
      await dono.query("DELETE FROM aba_health.log_acesso WHERE registro_id = ANY($1)",
        [[...concessoes, ...rows.map((r) => r.id)]]);
      await dono.query(
        "DELETE FROM aba_health.tentativas_token_externo WHERE concessao_id = ANY($1)", [concessoes]);
      await dono.query("DELETE FROM aba_health.concessoes_externas WHERE id = ANY($1)", [concessoes]);
    } finally {
      await dono.end();
    }
    for (const [conta, id] of pessoas) {
      await admin.schema("aba_people").from("fornecedores").delete().eq("id", id).eq("account_id", conta);
      await admin.schema("aba_people").from("clientes").delete().eq("id", id).eq("account_id", conta);
      await admin.schema("aba_people").from("pessoas").delete().eq("id", id).eq("account_id", conta);
    }
    if (outra) await deleteThrowawayUser(admin, outra.userId);
  }, 120_000);

  // ------------------------------------------------------------------
  // 1. Quem manda exame é laboratório
  // ------------------------------------------------------------------
  it("link de exame só para fornecedor ativo: pessoa comum e fornecedor inativo são recusados", async () => {
    expect((await emitir(owner, naoFornecedor)).error?.code).toBe("42501");
    expect((await emitir(owner, fornecedorInativo)).error?.code).toBe("42501");
    expect((await emitir(owner, laboratorio)).error).toBeNull();
  });

  // ------------------------------------------------------------------
  // 2. Cai na caixa, não no prontuário
  // ------------------------------------------------------------------
  describe("chegada", () => {
    it("o arquivo recebido aparece na caixa (com log por linha) e NÃO nos exames do prontuário", async () => {
      const r = await remessaNova();
      const antes = await logs(r.id, "leitura");

      const { data: caixa, error } = await owner.schema("aba_health").rpc("ler_caixa_de_entrada", {});
      expect(error).toBeNull();
      const minha = (caixa as { remessa_id: string; status: string; ip_origem: string | null; arquivo_caminho: string }[])
        .find((x) => x.remessa_id === r.id);
      expect(minha).toMatchObject({ status: "recebida", arquivo_caminho: r.caminho });
      expect(await logs(r.id, "leitura")).toBe(antes + 1);

      const { data: exames, error: e2 } = await owner.schema("aba_health").rpc("ler_exames_importados", { p_cliente_id: paciente });
      expect(e2).toBeNull();
      expect((exames as { remessa_id: string }[]).some((x) => x.remessa_id === r.id)).toBe(false);
    }, 60_000);

    it("sem alcance clínico (agent), a caixa não mostra a remessa e não há log em nome dele", async () => {
      const r = await remessaNova();
      const { data, error } = await agent.schema("aba_health").rpc("ler_caixa_de_entrada", {});
      expect(error).toBeNull();
      expect((data as { remessa_id: string }[]).some((x) => x.remessa_id === r.id)).toBe(false);

      const dono = await donoPg();
      try {
        const { rows } = await dono.query(
          "SELECT count(*)::int n FROM aba_health.log_acesso WHERE registro_id = $1 AND usuario_ator_id = $2",
          [r.id, ctx.userIds.agent]);
        expect(rows[0].n).toBe(0);
      } finally {
        await dono.end();
      }
      expect((await processar(agent, r.id, "validada")).error?.code).toBe("42501");
    }, 60_000);

    it("anônimo não chama nenhuma função da caixa", async () => {
      const anon = anonClient();
      for (const [fn, args] of [
        ["ler_caixa_de_entrada", {}],
        ["ler_exames_importados", { p_cliente_id: paciente }],
        ["processar_remessa_externa", { p_remessa_id: crypto.randomUUID(), p_para: "validada" }],
      ] as const) {
        const { error } = await anon.schema("aba_health").rpc(fn, args);
        expect(error, fn).not.toBeNull();
      }
    });

    it("a outra clínica não vê, não decide e não lê exames desta", async () => {
      const r = await remessaNova();
      const { data } = await outra.client.schema("aba_health").rpc("ler_caixa_de_entrada", {});
      expect(((data ?? []) as { remessa_id: string }[]).some((x) => x.remessa_id === r.id)).toBe(false);
      expect((await processar(outra.client, r.id, "validada")).error?.code).toBe("42501");
      const exames = await outra.client.schema("aba_health").rpc("ler_exames_importados", { p_cliente_id: paciente });
      expect(exames.error?.code).toBe("42501");
      expect((await linha(r.id)).status).toBe("recebida");
    }, 60_000);
  });

  // ------------------------------------------------------------------
  // 3. A máquina de estados é do banco
  // ------------------------------------------------------------------
  describe("máquina de estados", () => {
    it("aceitar sem conferir é recusado: recebida não vai direto a importada", async () => {
      const r = await remessaNova();
      const { error } = await processar(owner, r.id, "importada");
      expect(error?.code).toBe("23514");
      expect((await linha(r.id)).status).toBe("recebida");
    }, 60_000);

    it("conferir → aceitar migra para o prontuário, carimba autor e grava log de cada ato e da leitura", async () => {
      const r = await remessaNova();
      expect((await processar(owner, r.id, "validada")).error).toBeNull();
      const conferida = await linha(r.id);
      expect(conferida).toMatchObject({ status: "validada", processada_por: ctx.userIds.owner });

      expect((await processar(owner, r.id, "importada")).error).toBeNull();
      const importada = await linha(r.id);
      expect(importada.status).toBe("importada");
      expect(new Date(importada.processada_em).getTime()).toBeGreaterThan(new Date(conferida.processada_em).getTime());
      expect(await logs(r.id, "atualizacao")).toBe(2);

      const leiturasAntes = await logs(r.id, "leitura");
      const { data } = await owner.schema("aba_health").rpc("ler_exames_importados", { p_cliente_id: paciente });
      const exame = (data as { remessa_id: string; sha256_hex: string }[]).find((x) => x.remessa_id === r.id);
      expect(exame?.sha256_hex).toBe(importada.sha);
      expect(await logs(r.id, "leitura")).toBe(leiturasAntes + 1);

      // Controle positivo do bucket: o exame importado abre.
      const url = await owner.storage.from(BUCKET).createSignedUrl(r.caminho, 60);
      expect(url.error).toBeNull();
    }, 60_000);

    it("estado final não volta: importada não é rejeitada nem reconferida; rejeitar exige motivo", async () => {
      const r = await remessaNova();
      expect((await processar(owner, r.id, "rejeitada")).error?.code).toBe("23514"); // sem motivo
      await processar(owner, r.id, "validada");
      await processar(owner, r.id, "importada");
      expect((await processar(owner, r.id, "rejeitada", "mudei de ideia")).error?.code).toBe("23514");
      expect((await processar(owner, r.id, "validada")).error?.code).toBe("23514");
      expect((await processar(owner, r.id, "recebida")).error?.code).toBe("23514");
      expect((await linha(r.id)).status).toBe("importada");
    }, 60_000);

    it("duas decisões simultâneas sobre a mesma remessa: exatamente uma passa", async () => {
      const r = await remessaNova();
      const [a, b] = await Promise.all([processar(owner, r.id, "validada"), processar(owner, r.id, "validada")]);
      expect([a.error, b.error].filter((e) => e === null)).toHaveLength(1);
      expect(await logs(r.id, "atualizacao")).toBe(1);
    }, 60_000);

    it("nem o dono do banco pula estado, volta estado ou mexe no carimbo sem transição", async () => {
      const r = await remessaNova();
      const dono = await donoPg();
      try {
        await expect(dono.query(
          "UPDATE aba_health.remessas_externas SET status = 'importada', processada_em = now(), processada_por = $2 WHERE id = $1",
          [r.id, ctx.userIds.owner])).rejects.toMatchObject({ code: "23514" });
        await processar(owner, r.id, "validada");
        await expect(dono.query(
          "UPDATE aba_health.remessas_externas SET processada_por = $2 WHERE id = $1", [r.id, ctx.userIds.admin]))
          .rejects.toMatchObject({ code: "42501" });
        await expect(dono.query(
          "UPDATE aba_health.remessas_externas SET status = 'recebida', processada_em = NULL, processada_por = NULL WHERE id = $1",
          [r.id])).rejects.toMatchObject({ code: "23514" });
        await expect(dono.query(
          "UPDATE aba_health.remessas_externas SET arquivo_expurgado_em = now() WHERE id = $1", [r.id]))
          .rejects.toMatchObject({ code: "42501" });
      } finally {
        await dono.end();
      }
    }, 60_000);
  });

  // ------------------------------------------------------------------
  // 4. Rejeitada não deixa resíduo legível
  // ------------------------------------------------------------------
  describe("rejeição", () => {
    it("pela Edge Function: leitura negada, bytes apagados, evidência sem conteúdo preservada", async () => {
      const r = await remessaNova();
      await processar(owner, r.id, "validada");
      expect((await owner.storage.from(BUCKET).createSignedUrl(r.caminho, 60)).error).toBeNull(); // antes, abre
      const antes = await linha(r.id);

      const res = await rejeitarPelaFuncao(owner, r.id);
      expect(res.corpo).toMatchObject({ ok: true, arquivo_expurgado: true });

      const depois = await linha(r.id);
      expect(depois).toMatchObject({ status: "rejeitada", motivo_rejeicao: "exame de outro paciente", sha: antes.sha });
      expect(depois.arquivo_expurgado_em).not.toBeNull();
      expect(await objetoExiste(r.caminho)).toBe(false);
      expect((await owner.storage.from(BUCKET).createSignedUrl(r.caminho, 60)).error).not.toBeNull();

      const { data } = await owner.schema("aba_health").rpc("ler_caixa_de_entrada", { p_status: "rejeitada" });
      const vista = (data as { remessa_id: string; arquivo_caminho: string | null }[]).find((x) => x.remessa_id === r.id);
      expect(vista).toBeDefined();
      expect(vista!.arquivo_caminho).toBeNull();
    }, 60_000);

    it("rejeição pela RPC direta: a leitura cai NA HORA, e os bytes saem na próxima passagem da Edge Function", async () => {
      const r = await remessaNova();
      expect(await objetoExiste(r.caminho)).toBe(true);
      expect((await processar(owner, r.id, "rejeitada", "ilegível")).error).toBeNull();
      // A janela entre rejeição e expurgo não serve o arquivo a ninguém de dentro.
      expect((await owner.storage.from(BUCKET).createSignedUrl(r.caminho, 60)).error).not.toBeNull();
      expect(await objetoExiste(r.caminho)).toBe(true);

      const outraRemessa = await remessaNova();
      expect((await rejeitarPelaFuncao(owner, outraRemessa.id)).corpo).toMatchObject({ ok: true });
      expect(await objetoExiste(r.caminho)).toBe(false);
      expect((await linha(r.id)).arquivo_expurgado_em).not.toBeNull();
    }, 90_000);

    it("a Edge Function não serve de atalho: sem sessão é 401, e sem alcance clínico nada muda nem some", async () => {
      const r = await remessaNova();
      expect((await rejeitarPelaFuncao(null, r.id)).status).toBe(401);

      const pelaAgent = await rejeitarPelaFuncao(agent, r.id);
      expect(pelaAgent.corpo).toMatchObject({ ok: false, codigo: "42501" });
      const pelaOutra = await rejeitarPelaFuncao(outra.client, r.id);
      expect(pelaOutra.corpo).toMatchObject({ ok: false, codigo: "42501" });

      expect((await linha(r.id)).status).toBe("recebida");
      expect(await objetoExiste(r.caminho)).toBe(true);
    }, 60_000);
  });
});
