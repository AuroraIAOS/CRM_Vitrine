import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, anonClient, clientAs, createThrowawayUser, deleteThrowawayUser, loadContext, type TestContext } from "./helpers";

/**
 * Subetapa 02.12 — superfície nova das Configurações (tela `1m`):
 * `public.account_preferences` (migration 032) e
 * `access.matriz_permissoes()` (migration 033).
 *
 * O que estes testes existem para impedir:
 *  - preferência de aparência vazando entre contas (é linha por conta, num
 *    schema `public` que não tem prefixo de módulo para lembrar disso);
 *  - o CHECK de template único virando decorativo — o v01 entrega um
 *    template só, e isso precisa ser recusado pelo BANCO, não pelo HTML;
 *  - a matriz de permissões ficando legível para quem não é admin;
 *  - `accounts.owner_user_id` voltando a ser editável por uma superfície
 *    nova (reafirma o achado A02 do portão adversarial da 01.8).
 */
describe("02.12 — preferências de conta e matriz de permissões", () => {
  let ctx: TestContext;
  let admin: SupabaseClient;

  beforeAll(async () => {
    ctx = await loadContext();
    admin = adminClient();
  });

  // ----------------------------------------------------------------
  // account_preferences — leitura
  // ----------------------------------------------------------------
  it("toda conta nasce com exatamente uma linha de preferências", async () => {
    const { data, error } = await admin
      .from("account_preferences")
      .select("account_id, theme, density, accent, typography, layout_template")
      .eq("account_id", ctx.accountId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].layout_template).toBe("fixed_sidebar");
  });

  it("qualquer membro lê a preferência da própria conta — inclusive viewer", async () => {
    for (const papel of ["owner", "admin", "agent", "viewer"] as const) {
      const client = await clientAs(papel);
      const { data, error } = await client
        .from("account_preferences")
        .select("account_id, theme, density, accent, typography, layout_template")
        .eq("account_id", ctx.accountId)
        .maybeSingle();

      expect(error, `papel ${papel} deveria ler`).toBeNull();
      expect(data?.account_id, `papel ${papel} deveria enxergar a linha`).toBe(ctx.accountId);
    }
  });

  it("anônimo não lê preferência nenhuma", async () => {
    const { data } = await anonClient()
      .from("account_preferences")
      .select("account_id, theme")
      .eq("account_id", ctx.accountId);

    expect(data ?? []).toHaveLength(0);
  });

  // ----------------------------------------------------------------
  // account_preferences — escrita
  // ----------------------------------------------------------------
  it("admin escreve; agent e viewer não", async () => {
    const original = await admin
      .from("account_preferences")
      .select("theme")
      .eq("account_id", ctx.accountId)
      .single();

    const adminClient_ = await clientAs("admin");
    const { error: erroAdmin } = await adminClient_
      .from("account_preferences")
      .update({ theme: "dark" })
      .eq("account_id", ctx.accountId);
    expect(erroAdmin).toBeNull();

    const depoisDoAdmin = await admin
      .from("account_preferences")
      .select("theme")
      .eq("account_id", ctx.accountId)
      .single();
    expect(depoisDoAdmin.data!.theme).toBe("dark");

    // agent e viewer: a policy de UPDATE exige admin+. Sem linha visível
    // para o UPDATE, o PostgREST devolve sucesso com zero linha afetada —
    // por isso o teste confere o ESTADO, não só a ausência de erro.
    for (const papel of ["agent", "viewer"] as const) {
      const client = await clientAs(papel);
      await client.from("account_preferences").update({ theme: "light" }).eq("account_id", ctx.accountId);

      const estado = await admin.from("account_preferences").select("theme").eq("account_id", ctx.accountId).single();
      expect(estado.data!.theme, `papel ${papel} não pode ter alterado o tema`).toBe("dark");
    }

    // devolve ao valor de partida
    await admin
      .from("account_preferences")
      .update({ theme: original.data!.theme })
      .eq("account_id", ctx.accountId);
  });

  // ----------------------------------------------------------------
  // O template único é trava de banco, não de UI
  // ----------------------------------------------------------------
  it("layout_template recusa qualquer valor fora de 'fixed_sidebar' — inclusive para service_role", async () => {
    const client = await clientAs("owner");
    const { error } = await client
      .from("account_preferences")
      .update({ layout_template: "top_nav" })
      .eq("account_id", ctx.accountId);

    expect(error).not.toBeNull();
    expect(error!.code).toBe("23514");

    // service_role ignora RLS, mas não ignora CHECK — é o que faz desta
    // uma garantia de banco, e não uma permissão a mais.
    const { error: erroServico } = await admin
      .from("account_preferences")
      .update({ layout_template: "top_nav" })
      .eq("account_id", ctx.accountId);
    expect(erroServico).not.toBeNull();
    expect(erroServico!.code).toBe("23514");

    const estado = await admin
      .from("account_preferences")
      .select("layout_template")
      .eq("account_id", ctx.accountId)
      .single();
    expect(estado.data!.layout_template).toBe("fixed_sidebar");
  });

  it("theme, density, accent e typography recusam valor fora do CHECK", async () => {
    const client = await clientAs("owner");
    const invalidos: Record<string, string> = {
      theme: "sepia",
      density: "gigante",
      accent: "neon",
      typography: "comic",
    };

    for (const [coluna, valor] of Object.entries(invalidos)) {
      const { error } = await client
        .from("account_preferences")
        .update({ [coluna]: valor })
        .eq("account_id", ctx.accountId);
      expect(error, `${coluna}='${valor}' deveria ser recusado`).not.toBeNull();
      expect(error!.code, `${coluna}='${valor}'`).toBe("23514");
    }
  });

  // ----------------------------------------------------------------
  // Isolamento entre contas
  // ----------------------------------------------------------------
  it("uma conta não lê nem escreve a preferência de outra", async () => {
    const forasteiro = await createThrowawayUser(admin, "prefs-forasteiro");
    try {
      const { data: perfil } = await admin
        .from("profiles")
        .select("account_id")
        .eq("user_id", forasteiro.userId)
        .single();
      const contaAlheia = perfil!.account_id as string;
      expect(contaAlheia).not.toBe(ctx.accountId);

      // A conta nova nasceu com a própria linha (trigger da migration 032).
      const { data: linhaAlheia } = await admin
        .from("account_preferences")
        .select("account_id, accent")
        .eq("account_id", contaAlheia)
        .maybeSingle();
      expect(linhaAlheia?.account_id).toBe(contaAlheia);

      const owner = await clientAs("owner");

      // Leitura da conta alheia: conjunto vazio.
      const { data: lida } = await owner
        .from("account_preferences")
        .select("account_id, accent")
        .eq("account_id", contaAlheia);
      expect(lida ?? []).toHaveLength(0);

      // Escrita na conta alheia: não altera nada.
      await owner.from("account_preferences").update({ accent: "terracotta" }).eq("account_id", contaAlheia);
      const { data: depois } = await admin
        .from("account_preferences")
        .select("accent")
        .eq("account_id", contaAlheia)
        .single();
      expect(depois!.accent).toBe("clinical_blue");
    } finally {
      await deleteThrowawayUser(admin, forasteiro.userId);
    }
  });

  // ----------------------------------------------------------------
  // access.matriz_permissoes()
  // ----------------------------------------------------------------
  it("a matriz é visível para owner e admin, e vazia para agent e viewer", async () => {
    for (const papel of ["owner", "admin"] as const) {
      const client = await clientAs(papel);
      const { data, error } = await client.schema("access").rpc("matriz_permissoes");
      expect(error, `papel ${papel}`).toBeNull();
      expect((data ?? []).length, `papel ${papel} deveria ver a matriz`).toBeGreaterThan(0);
    }

    for (const papel of ["agent", "viewer"] as const) {
      const client = await clientAs(papel);
      const { data } = await client.schema("access").rpc("matriz_permissoes");
      expect((data ?? []).length, `papel ${papel} não deveria ver a matriz`).toBe(0);
    }
  });

  it("a matriz não inclui owner — access.can() o curto-circuita antes da tabela", async () => {
    const client = await clientAs("owner");
    const { data } = await client.schema("access").rpc("matriz_permissoes");
    const papeis = new Set((data ?? []).map((c: { papel: string }) => c.papel));

    expect(papeis.has("owner")).toBe(false);
    expect(papeis).toEqual(new Set(["admin", "agent", "viewer"]));
  });

  it("a matriz devolve o padrão do banco quando não há exceção, e reflete a exceção quando há", async () => {
    const owner = await clientAs("owner");

    // Padrão medido, não presumido: `viewer` lê, mas não cria.
    const antes = await owner.schema("access").rpc("matriz_permissoes");
    const celula = (linhas: unknown[], papel: string, modulo: string, acao: string) =>
      (linhas as { papel: string; module_key: string; acao: string; permitido: boolean; e_excecao: boolean }[]).find(
        (c) => c.papel === papel && c.module_key === modulo && c.acao === acao,
      );

    const leituraViewer = celula(antes.data ?? [], "viewer", "people", "read");
    expect(leituraViewer?.permitido).toBe(true);
    expect(leituraViewer?.e_excecao).toBe(false);

    // Grava exceção negando a leitura e confere que a matriz acompanha.
    const { error: erroExcecao } = await owner
      .schema("access")
      .from("module_permissions")
      .upsert(
        { account_id: ctx.accountId, role: "viewer", module_key: "people", action: "read", allowed: false },
        { onConflict: "account_id,role,module_key,action" },
      );
    expect(erroExcecao).toBeNull();

    try {
      const depois = await owner.schema("access").rpc("matriz_permissoes");
      const agora = celula(depois.data ?? [], "viewer", "people", "read");
      expect(agora?.permitido).toBe(false);
      expect(agora?.e_excecao).toBe(true);
    } finally {
      // Limpeza completa, não desativação: exceção esquecida em `people`
      // derruba fixture de 01_aba_people na próxima execução da suíte.
      await admin
        .schema("access")
        .from("module_permissions")
        .delete()
        .eq("account_id", ctx.accountId)
        .eq("role", "viewer")
        .eq("module_key", "people")
        .eq("action", "read");
    }
  });

  it("admin lê a matriz mas não escreve em module_permissions — só owner escreve", async () => {
    const adminCli = await clientAs("admin");
    const { error } = await adminCli
      .schema("access")
      .from("module_permissions")
      .insert({ account_id: ctx.accountId, role: "viewer", module_key: "catalog", action: "delete", allowed: true });

    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");

    const { data } = await admin
      .schema("access")
      .from("module_permissions")
      .select("id")
      .eq("account_id", ctx.accountId)
      .eq("module_key", "catalog")
      .eq("action", "delete");
    expect(data ?? []).toHaveLength(0);
  });

  // ----------------------------------------------------------------
  // A trava A02 continua de pé pela superfície nova
  // ----------------------------------------------------------------
  it("accounts.owner_user_id continua irremovível por UPDATE direto, mesmo pelo owner", async () => {
    const owner = await clientAs("owner");
    const { error } = await owner
      .from("accounts")
      .update({ owner_user_id: ctx.userIds.admin })
      .eq("id", ctx.accountId);

    expect(error).not.toBeNull();

    const { data } = await admin.from("accounts").select("owner_user_id").eq("id", ctx.accountId).single();
    expect(data!.owner_user_id).toBe(ctx.userIds.owner);
  });

  it("accounts.name é editável por admin — é a única coluna que a tela 1m escreve", async () => {
    const antes = await admin.from("accounts").select("name").eq("id", ctx.accountId).single();
    const nomeTeste = `${antes.data!.name} ·teste0212`;

    const adminCli = await clientAs("admin");
    const { error } = await adminCli.from("accounts").update({ name: nomeTeste }).eq("id", ctx.accountId);
    expect(error).toBeNull();

    const depois = await admin.from("accounts").select("name").eq("id", ctx.accountId).single();
    expect(depois.data!.name).toBe(nomeTeste);

    await admin.from("accounts").update({ name: antes.data!.name }).eq("id", ctx.accountId);
  });

  afterAll(async () => {
    // Nada de resíduo: a linha da conta de teste volta ao estado de fábrica.
    await admin
      .from("account_preferences")
      .update({
        theme: "light",
        density: "comfortable",
        accent: "clinical_blue",
        typography: "sans",
        layout_template: "fixed_sidebar",
      })
      .eq("account_id", ctx.accountId);
  });
});
