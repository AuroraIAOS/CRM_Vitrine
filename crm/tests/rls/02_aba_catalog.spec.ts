import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, clientAs, ehErroRls, ehErroConstraintOuTrigger, loadContext, type TestContext } from "./helpers";

/** Cria categoria + serviço + duas variantes (Subetapa 01.3). */
async function criarServicoFixture(admin: ReturnType<typeof adminClient>, accountId: string) {
  const { data: categoria, error: catErr } = await admin
    .schema("aba_catalog")
    .from("categorias")
    .insert({ account_id: accountId, nome: "Categoria Fictícia 01.3" })
    .select("id")
    .single();
  if (catErr) throw catErr;

  const { data: servico, error: servErr } = await admin
    .schema("aba_catalog")
    .from("procedimentos")
    .insert({ account_id: accountId, categoria_id: categoria.id, nome: "Serviço Fictício 01.3" })
    .select("id")
    .single();
  if (servErr) throw servErr;

  const { data: variantePadrao, error: v1Err } = await admin
    .schema("aba_catalog")
    .from("variantes_procedimento")
    .insert({
      account_id: accountId,
      procedimento_id: servico.id,
      nome: "Padrão",
      preco: 100,
      duracao_minutos: 60,
      padrao: true,
    })
    .select("id")
    .single();
  if (v1Err) throw v1Err;

  const { data: varianteExtra, error: v2Err } = await admin
    .schema("aba_catalog")
    .from("variantes_procedimento")
    .insert({ account_id: accountId, procedimento_id: servico.id, nome: "Premium", preco: 200, duracao_minutos: 90 })
    .select("id")
    .single();
  if (v2Err) throw v2Err;

  return { categoriaId: categoria.id as string, procedimentoId: servico.id as string, variantePadraoId: variantePadrao.id as string, varianteExtraId: varianteExtra.id as string };
}

async function apagarServicoFixture(admin: ReturnType<typeof adminClient>, categoriaId: string, procedimentoId: string) {
  await admin.schema("aba_catalog").from("variantes_procedimento").delete().eq("procedimento_id", procedimentoId);
  await admin.schema("aba_catalog").from("procedimentos").delete().eq("id", procedimentoId);
  await admin.schema("aba_catalog").from("categorias").delete().eq("id", categoriaId);
}

describe("aba_catalog — RLS por papel (Subetapa 01.3)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let fx: Awaited<ReturnType<typeof criarServicoFixture>>;

  beforeAll(async () => {
    ctx = await loadContext();
    fx = await criarServicoFixture(admin, ctx.accountId);
  });

  afterAll(async () => {
    await apagarServicoFixture(admin, fx.categoriaId, fx.procedimentoId);
  });

  it("viewer lê categorias/serviços/variantes", async () => {
    const client = await clientAs("viewer");
    const servico = await client.schema("aba_catalog").from("procedimentos").select("id").eq("id", fx.procedimentoId);
    expect(servico.error).toBeNull();
    expect(servico.data).toHaveLength(1);
  });

  it("viewer não cria categoria (42501)", async () => {
    const client = await clientAs("viewer");
    const { error } = await client
      .schema("aba_catalog")
      .from("categorias")
      .insert({ account_id: ctx.accountId, nome: "Não deveria existir" });
    expect(ehErroRls(error)).toBe(true);
  });

  it("agent cria categoria e serviço", async () => {
    const client = await clientAs("agent");
    const { data: categoria, error: catErr } = await client
      .schema("aba_catalog")
      .from("categorias")
      .insert({ account_id: ctx.accountId, nome: "Categoria Criada Por Agent" })
      .select("id")
      .single();
    expect(catErr).toBeNull();

    const { error: servErr } = await client
      .schema("aba_catalog")
      .from("procedimentos")
      .insert({ account_id: ctx.accountId, categoria_id: categoria!.id, nome: "Serviço Criado Por Agent" });
    expect(servErr).toBeNull();

    await admin.schema("aba_catalog").from("procedimentos").delete().eq("categoria_id", categoria!.id);
    await admin.schema("aba_catalog").from("categorias").delete().eq("id", categoria!.id);
  });

  it("categoria com serviço vinculado não pode ser apagada (RESTRICT)", async () => {
    const { error } = await admin.schema("aba_catalog").from("categorias").delete().eq("id", fx.categoriaId);
    expect(error).not.toBeNull();
    expect(ehErroConstraintOuTrigger(error)).toBe(true);
  });

  it("duas variantes 'padrão' no mesmo serviço violam o índice único parcial", async () => {
    const { error } = await admin
      .schema("aba_catalog")
      .from("variantes_procedimento")
      .update({ padrao: true })
      .eq("id", fx.varianteExtraId);
    // A variante padrão já existe (variantePadraoId) — ligar outra sem
    // desligar a primeira esbarra em idx_variantes_servico_uma_padrao.
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23505");
  });

  describe("aba_catalog.definir_variante_padrao()", () => {
    it("troca a padrão em uma transação — nunca duas ligadas nem nenhuma", async () => {
      const client = await clientAs("agent");
      const { error } = await client.schema("aba_catalog").rpc("definir_variante_padrao", {
        p_variante_id: fx.varianteExtraId,
      });
      expect(error).toBeNull();

      const { data: variantes } = await admin
        .schema("aba_catalog")
        .from("variantes_procedimento")
        .select("id, padrao")
        .eq("procedimento_id", fx.procedimentoId);

      const padroes = variantes?.filter((v) => v.padrao) ?? [];
      expect(padroes).toHaveLength(1);
      expect(padroes[0].id).toBe(fx.varianteExtraId);
    });

    it("viewer não troca a variante padrão (RLS filtra as duas atualizações internas, sem erro nem efeito)", async () => {
      // definir_variante_padrao() é SECURITY INVOKER: os dois UPDATEs
      // internos rodam sob a RLS do chamador. Para viewer (sem
      // permissão de update em variantes_servico), a RLS filtra a
      // linha e o UPDATE afeta zero registros — não gera erro, mesmo
      // padrão já documentado em 01_aba_people.spec.ts ("RLS filtra a
      // linha, update afeta zero"). A prova real é o estado inalterado.
      const client = await clientAs("viewer");
      const { error } = await client.schema("aba_catalog").rpc("definir_variante_padrao", {
        p_variante_id: fx.variantePadraoId,
      });
      expect(error).toBeNull();

      const { data: variantes } = await admin
        .schema("aba_catalog")
        .from("variantes_procedimento")
        .select("id, padrao")
        .eq("procedimento_id", fx.procedimentoId);
      const padroes = variantes?.filter((v) => v.padrao) ?? [];
      expect(padroes).toHaveLength(1);
      expect(padroes[0].id).toBe(fx.varianteExtraId);
    });
  });
});
