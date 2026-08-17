import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  clientAs,
  createThrowawayUser,
  deleteThrowawayUser,
  ehErroRls,
  loadContext,
  type TestContext,
} from "./helpers";

describe("aba_ai — configuração bring-your-own-key e RLS (Subetapa 01.5)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let configId: string;

  beforeAll(async () => {
    ctx = await loadContext();
    const { data, error } = await admin
      .schema("aba_ai")
      .from("ia_configuracoes")
      .insert({
        account_id: ctx.accountId,
        provedor: "anthropic",
        modelo: "claude-fictício-01.5",
        chave_api: "texto-cifrado-fake-nao-e-segredo-real",
      })
      .select("id")
      .single();
    if (error) throw error;
    configId = data.id;
  });

  afterAll(async () => {
    await admin.schema("aba_ai").from("ia_configuracoes").delete().eq("id", configId);
  });

  it("viewer lê a configuração (settings-class: qualquer membro vê se a IA está ligada)", async () => {
    const client = await clientAs("viewer");
    const { data, error } = await client.schema("aba_ai").from("ia_configuracoes").select("id, ativo").eq("id", configId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("viewer não edita a configuração (42501 — só admin+)", async () => {
    const client = await clientAs("viewer");
    const { error } = await client.schema("aba_ai").from("ia_configuracoes").update({ ativo: true }).eq("id", configId);
    // RLS filtra a linha silenciosamente (sem erro), mas zero linhas afetadas.
    expect(error).toBeNull();
    const { data: inalterado } = await admin.schema("aba_ai").from("ia_configuracoes").select("ativo").eq("id", configId).single();
    expect(inalterado?.ativo).toBe(false);
  });

  it("admin ativa a configuração", async () => {
    const client = await clientAs("admin");
    const { data, error } = await client
      .schema("aba_ai")
      .from("ia_configuracoes")
      .update({ ativo: true })
      .eq("id", configId)
      .select("ativo");
    expect(error).toBeNull();
    expect(data?.[0].ativo).toBe(true);

    await admin.schema("aba_ai").from("ia_configuracoes").update({ ativo: false }).eq("id", configId);
  });

  it("uma configuração por conta — segunda inserção viola UNIQUE(account_id) (23505)", async () => {
    const { error } = await admin.schema("aba_ai").from("ia_configuracoes").insert({
      account_id: ctx.accountId,
      provedor: "openai",
      modelo: "gpt-fictício-01.5",
      chave_api: "outra-chave-cifrada-fake",
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23505");
  });
});

describe("aba_ai — base de conhecimento e isolamento entre contas na busca (Subetapa 01.5)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let documentoId: string;
  let foreignUserId: string;
  let foreignClient: SupabaseClient;

  beforeAll(async () => {
    ctx = await loadContext();

    const { data: documento, error: docErr } = await admin
      .schema("aba_ai")
      .from("ia_documentos_conhecimento")
      .insert({ account_id: ctx.accountId, titulo: "FAQ Fictícia 01.5", conteudo: "Horário de funcionamento" })
      .select("id")
      .single();
    if (docErr) throw docErr;
    documentoId = documento.id;

    const { error: trechoErr } = await admin.schema("aba_ai").from("ia_trechos_conhecimento").insert({
      documento_id: documentoId,
      account_id: ctx.accountId,
      conteudo: "Nosso horário de funcionamento é de segunda a sexta, das nove às dezoito horas.",
    });
    if (trechoErr) throw trechoErr;

    const created = await createThrowawayUser(admin, "rls-ai-cross-account");
    foreignUserId = created.userId;
    const { createClient } = await import("@supabase/supabase-js");
    foreignClient = createClient(process.env.SUPABASE__URL!, process.env.SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInErr } = await foreignClient.auth.signInWithPassword({
      email: created.email,
      password: created.password,
    });
    if (signInErr) throw signInErr;
  });

  afterAll(async () => {
    await deleteThrowawayUser(admin, foreignUserId);
    await admin.schema("aba_ai").from("ia_trechos_conhecimento").delete().eq("documento_id", documentoId);
    await admin.schema("aba_ai").from("ia_documentos_conhecimento").delete().eq("id", documentoId);
  });

  it("agent da própria conta recupera o trecho pela busca textual", async () => {
    const client = await clientAs("agent");
    const { data, error } = await client.schema("aba_ai").rpc("buscar_conhecimento_textual", {
      p_account_id: ctx.accountId,
      p_consulta: "horário funcionamento",
      p_limite: 10,
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].conteudo).toContain("segunda a sexta");
  });

  it("HARDENING 01.5: usuário de outra conta passando p_account_id alheio recebe conjunto vazio, nunca a base da conta vítima (evita o achado GHSA-fg5p-2qc3-jmxr do Maximus)", async () => {
    const { data, error } = await foreignClient.schema("aba_ai").rpc("buscar_conhecimento_textual", {
      p_account_id: ctx.accountId, // conta "vítima" — não é a do usuário estrangeiro
      p_consulta: "horário funcionamento",
      p_limite: 1000,
    });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("viewer não cria documento de conhecimento (42501 — só admin+)", async () => {
    const client = await clientAs("viewer");
    const { error } = await client
      .schema("aba_ai")
      .from("ia_documentos_conhecimento")
      .insert({ account_id: ctx.accountId, titulo: "Não deveria existir", conteudo: "x" });
    expect(ehErroRls(error)).toBe(true);
  });
});

describe("aba_ai — log de uso é billing-class (Subetapa 01.5)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let logId: string;

  beforeAll(async () => {
    ctx = await loadContext();
    const { data, error } = await admin
      .schema("aba_ai")
      .from("ia_log_uso")
      .insert({
        account_id: ctx.accountId,
        modo: "rascunho",
        provedor: "anthropic",
        modelo: "claude-fictício-01.5",
        tokens_total: 42,
      })
      .select("id")
      .single();
    if (error) throw error;
    logId = data.id;
  });

  afterAll(async () => {
    await admin.schema("aba_ai").from("ia_log_uso").delete().eq("id", logId);
  });

  it("agent não lê o log de uso (RLS exige admin+)", async () => {
    const client = await clientAs("agent");
    const { data, error } = await client.schema("aba_ai").from("ia_log_uso").select("id").eq("id", logId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("admin lê o log de uso", async () => {
    const client = await clientAs("admin");
    const { data, error } = await client.schema("aba_ai").from("ia_log_uso").select("id").eq("id", logId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("authenticated não grava no log de uso (só a Edge Function via service_role)", async () => {
    const client = await clientAs("admin");
    const { error } = await client.schema("aba_ai").from("ia_log_uso").insert({
      account_id: ctx.accountId,
      modo: "rascunho",
      provedor: "anthropic",
      modelo: "x",
    });
    expect(ehErroRls(error)).toBe(true);
  });
});
