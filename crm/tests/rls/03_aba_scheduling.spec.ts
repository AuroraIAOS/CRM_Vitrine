import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, clientAs, ehErroRls, loadContext, type TestContext } from "./helpers";

/** Pessoa + cliente (chave compartilhada, sem passar por lead). */
async function criarClienteFixture(admin: ReturnType<typeof adminClient>, accountId: string, nome: string) {
  const { data: pessoa, error: pessoaErr } = await admin
    .schema("aba_people")
    .from("pessoas")
    .insert({ account_id: accountId, nome_exibicao: nome })
    .select("id")
    .single();
  if (pessoaErr) throw pessoaErr;

  const { error: clienteErr } = await admin
    .schema("aba_people")
    .from("clientes")
    .insert({ id: pessoa.id, account_id: accountId, razao_social: nome, status: "ativo" });
  if (clienteErr) throw clienteErr;

  return pessoa.id as string;
}

async function apagarCliente(admin: ReturnType<typeof adminClient>, clienteId: string) {
  await admin.schema("aba_people").from("clientes").delete().eq("id", clienteId);
  await admin.schema("aba_people").from("pessoas").delete().eq("id", clienteId);
}

/** Profissional com expediente cobrindo os 7 dias da semana (evita flakiness por dia de execução). */
async function criarProfissionalComExpediente(admin: ReturnType<typeof adminClient>, accountId: string, nome: string) {
  const { data: prof, error: profErr } = await admin
    .schema("aba_scheduling")
    .from("profissionais")
    .insert({ account_id: accountId, nome_exibicao: nome })
    .select("id")
    .single();
  if (profErr) throw profErr;

  const horarios = Array.from({ length: 7 }, (_, dia) => ({
    account_id: accountId,
    profissional_id: prof.id,
    dia_semana: dia,
    inicio: "00:00",
    fim: "23:59",
  }));
  const { error: horErr } = await admin.schema("aba_scheduling").from("horarios_profissionais").insert(horarios);
  if (horErr) throw horErr;

  return prof.id as string;
}

async function apagarProfissional(admin: ReturnType<typeof adminClient>, profissionalId: string) {
  await admin.schema("aba_scheduling").from("horarios_profissionais").delete().eq("profissional_id", profissionalId);
  await admin.schema("aba_scheduling").from("profissionais").delete().eq("id", profissionalId);
}

describe("aba_scheduling — RLS e regras de agenda (Subetapa 01.3)", () => {
  const admin = adminClient();
  let ctx: TestContext;
  let clienteId: string;
  let profissionalComExpedienteId: string;
  let profissionalSemExpedienteId: string;
  const agendamentosCriados: string[] = [];

  // Horário fixo no futuro (evita corrida com dados de outra execução da suíte).
  const inicio = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  inicio.setUTCHours(14, 0, 0, 0); // 14:00 UTC ~ 11:00 America/Sao_Paulo, bem dentro do expediente 00:00-23:59
  const fim = new Date(inicio.getTime() + 60 * 60 * 1000);

  beforeAll(async () => {
    ctx = await loadContext();
    clienteId = await criarClienteFixture(admin, ctx.accountId, "Cliente Fictício Agenda 01.3");
    profissionalComExpedienteId = await criarProfissionalComExpediente(admin, ctx.accountId, "Profissional Com Expediente 01.3");

    const { data: profSem, error } = await admin
      .schema("aba_scheduling")
      .from("profissionais")
      .insert({ account_id: ctx.accountId, nome_exibicao: "Profissional Sem Expediente 01.3" })
      .select("id")
      .single();
    if (error) throw error;
    profissionalSemExpedienteId = profSem.id;
  });

  afterAll(async () => {
    for (const id of agendamentosCriados) {
      await admin.schema("aba_scheduling").from("lembretes").delete().eq("agendamento_id", id);
      await admin.schema("aba_scheduling").from("agendamentos").delete().eq("id", id);
    }
    await apagarProfissional(admin, profissionalComExpedienteId);
    await admin.schema("aba_scheduling").from("profissionais").delete().eq("id", profissionalSemExpedienteId);
    await apagarCliente(admin, clienteId);
  });

  it("viewer não cria agendamento (42501)", async () => {
    const client = await clientAs("viewer");
    const { error } = await client.schema("aba_scheduling").from("agendamentos").insert({
      account_id: ctx.accountId,
      cliente_id: clienteId,
      profissional_id: profissionalComExpedienteId,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
    });
    expect(ehErroRls(error)).toBe(true);
  });

  it("agent cria agendamento dentro do expediente, e o lembrete é enfileirado automaticamente", async () => {
    const client = await clientAs("agent");
    const { data, error } = await client
      .schema("aba_scheduling")
      .from("agendamentos")
      .insert({
        account_id: ctx.accountId,
        cliente_id: clienteId,
        profissional_id: profissionalComExpedienteId,
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    agendamentosCriados.push(data!.id);

    const { data: lembretes } = await admin
      .schema("aba_scheduling")
      .from("lembretes")
      .select("id, status, canal")
      .eq("agendamento_id", data!.id);
    expect(lembretes).toHaveLength(1);
    expect(lembretes?.[0].status).toBe("pendente");
    expect(lembretes?.[0].canal).toBe("whatsapp");
  });

  it("viewer lê o agendamento criado", async () => {
    const client = await clientAs("viewer");
    const { data, error } = await client
      .schema("aba_scheduling")
      .from("agendamentos")
      .select("id")
      .eq("id", agendamentosCriados[0]);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("agendamento em profissional sem jornada cadastrada é recusado — falha fechada (23514)", async () => {
    const client = await clientAs("agent");
    const outroInicio = new Date(inicio.getTime() + 3 * 60 * 60 * 1000);
    const outroFim = new Date(outroInicio.getTime() + 60 * 60 * 1000);
    const { error } = await client.schema("aba_scheduling").from("agendamentos").insert({
      account_id: ctx.accountId,
      cliente_id: clienteId,
      profissional_id: profissionalSemExpedienteId,
      inicio: outroInicio.toISOString(),
      fim: outroFim.toISOString(),
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514");
  });

  it("dois agendamentos sobrepostos para o mesmo profissional são recusados pela restrição de exclusão (23P01)", async () => {
    const client = await clientAs("agent");
    const sobrepostoInicio = new Date(inicio.getTime() + 30 * 60 * 1000); // sobrepõe o primeiro agendamento
    const sobrepostoFim = new Date(sobrepostoInicio.getTime() + 60 * 60 * 1000);
    const { error } = await client.schema("aba_scheduling").from("agendamentos").insert({
      account_id: ctx.accountId,
      cliente_id: clienteId,
      profissional_id: profissionalComExpedienteId,
      inicio: sobrepostoInicio.toISOString(),
      fim: sobrepostoFim.toISOString(),
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23P01");
  });

  it("cancelar o agendamento cancela o lembrete pendente junto", async () => {
    const client = await clientAs("agent");
    const { error } = await client
      .schema("aba_scheduling")
      .from("agendamentos")
      .update({ status: "cancelado", motivo_cancelamento: "Teste 01.3" })
      .eq("id", agendamentosCriados[0]);
    expect(error).toBeNull();

    const { data: lembretes } = await admin
      .schema("aba_scheduling")
      .from("lembretes")
      .select("status")
      .eq("agendamento_id", agendamentosCriados[0]);
    expect(lembretes?.[0].status).toBe("cancelado");
  });
});
