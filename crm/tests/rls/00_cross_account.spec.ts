import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, createThrowawayUser, deleteThrowawayUser, clientAs, loadContext, type TestContext } from "./helpers";

// "Usuário de outra conta não lê nada de nenhum schema" — prova o
// isolamento por account_id. Só aba_people existe nesta subetapa;
// finance/health entram quando 01.3/01.4 aplicarem os schemas deles.
describe("Isolamento entre contas (Subetapa 01.2)", () => {
  const admin = adminClient();

  let ctx: TestContext;
  let foreignUserId: string;
  let foreignClient: SupabaseClient;
  let pessoaId: string;

  beforeAll(async () => {
    ctx = await loadContext();

    const { data: pessoa, error: pessoaErr } = await admin
      .schema("aba_people")
      .from("pessoas")
      .insert({ account_id: ctx.accountId, nome_exibicao: "Cliente Fictício Isolamento 01.2" })
      .select("id")
      .single();
    if (pessoaErr) throw pessoaErr;
    pessoaId = pessoa.id;

    const created = await createThrowawayUser(admin, "rls-cross-account");
    foreignUserId = created.userId;

    // Reaproveita o mecanismo de clientAs autenticando manualmente,
    // sem cachear (papel "estrangeiro" não é um dos 4 papéis fixos).
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
    await admin.schema("aba_people").from("pessoas").delete().eq("id", pessoaId);
    await deleteThrowawayUser(admin, foreignUserId);
  });

  it("usuário de outra conta não lê aba_people.pessoas da conta principal", async () => {
    const { data, error } = await foreignClient.schema("aba_people").from("pessoas").select("id").eq("id", pessoaId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("usuário da conta principal continua enxergando a própria pessoa (controle)", async () => {
    const owner = await clientAs("owner");
    const { data, error } = await owner.schema("aba_people").from("pessoas").select("id").eq("id", pessoaId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});
