// ============================================================
// 13_equipe_convite.spec.ts — Subetapa 02.2: fluxo de equipe de 5
// passos (convite → aceite → funcionário nasce → atributo profissional
// → acesso segue role/atributo) + regressão do achado A02 da 01.8
// (ninguém se apossa da conta por um caminho novo).
// ============================================================
import { describe, it, expect, afterAll } from "vitest";
import { adminClient, clientAs, loadContext, ehErroRls } from "./helpers";
import { AMBIENTE_DE_TESTE } from "./ambiente";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../../.env") });
config({ path: path.resolve(__dirname, "../../.env.test") });

const SUPABASE_URL = AMBIENTE_DE_TESTE.url;
const ANON_KEY = AMBIENTE_DE_TESTE.anonKey;

const admin = adminClient();

/** Cria um usuário descartável autenticado (fora do cache de papéis fixos). */
async function criarUsuarioDescartavel(prefixo: string): Promise<{ userId: string; email: string; client: SupabaseClient }> {
  const email = `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@crmvitrine.local`;
  const password = `Rls!${Math.random().toString(36).slice(2, 12)}Aa1`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`criarUsuarioDescartavel(${email}): ${error?.message}`);

  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signIn(${email}): ${signInErr.message}`);

  return { userId: data.user.id, email, client };
}

/** Limpa um usuário descartável e a conta que ele possuir na hora da limpeza (CASCADE cuida do resto). */
async function apagarUsuarioDescartavel(userId: string): Promise<void> {
  await admin.from("accounts").delete().eq("owner_user_id", userId);
  await admin.from("profiles").delete().eq("user_id", userId);
  await admin.auth.admin.deleteUser(userId);
}

const limpeza: Array<() => Promise<void>> = [];
afterAll(async () => {
  for (const fn of limpeza.reverse()) {
    try {
      await fn();
    } catch (e) {
      console.warn("limpeza 13_equipe_convite falhou:", (e as Error).message);
    }
  }
});

describe("Fluxo completo — convite → funcionário → atributo profissional", () => {
  it("owner cria convite, convidado aceita, funcionário nasce ativo, atributo profissional liga e desliga", async () => {
    const owner = await clientAs("owner");
    const ctx = await loadContext();

    // 1) Owner cria o convite (role=agent — só agent pode virar profissional).
    const { data: convite, error: erroConvite } = await owner.rpc("criar_convite", {
      p_role: "agent",
      p_label: "Convite de teste 02.2",
    });
    expect(erroConvite).toBeNull();
    expect(convite.ok).toBe(true);
    expect(typeof convite.token).toBe("string");
    expect(convite.token.length).toBeGreaterThanOrEqual(32);

    // 2) peek_convite (anônimo) confirma o convite antes do login.
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: peek, error: erroPeek } = await anon.rpc("peek_convite", { p_token: convite.token });
    expect(erroPeek).toBeNull();
    expect(peek.ok).toBe(true);
    expect(peek.role).toBe("agent");

    // 3) Convidado (usuário novo, conta pessoal própria recém-criada) resgata.
    const convidado = await criarUsuarioDescartavel("equipe-agent");
    let funcionarioId: string | undefined;
    let profissionalId: string | undefined;
    limpeza.push(async () => {
      if (profissionalId) await admin.schema("aba_scheduling").from("profissionais").delete().eq("id", profissionalId);
      if (funcionarioId) {
        await admin.schema("aba_people").from("funcionarios").delete().eq("id", funcionarioId);
        await admin.schema("aba_people").from("pessoas").delete().eq("id", funcionarioId);
      }
      await admin.from("account_invitations").delete().eq("id", convite.invitation_id);
      await admin.from("profiles").delete().eq("user_id", convidado.userId);
      await admin.auth.admin.deleteUser(convidado.userId);
    });

    const { data: contaResgatada, error: erroResgate } = await convidado.client.rpc("resgatar_convite", {
      p_token: convite.token,
    });
    expect(erroResgate).toBeNull();
    expect(contaResgatada).toBe(ctx.accountId);

    // O perfil moveu de fato e ganhou o papel do convite.
    const { data: perfil } = await admin
      .from("profiles")
      .select("id, account_id, account_role")
      .eq("user_id", convidado.userId)
      .single();
    expect(perfil?.account_id).toBe(ctx.accountId);
    expect(perfil?.account_role).toBe("agent");

    // 4) Funcionário nasceu automaticamente, ativo.
    const { data: funcionario } = await admin
      .schema("aba_people")
      .from("funcionarios")
      .select("id, ativo, account_id")
      .eq("profile_id", perfil!.id)
      .single();
    expect(funcionario).not.toBeNull();
    expect(funcionario!.ativo).toBe(true);
    expect(funcionario!.account_id).toBe(ctx.accountId);
    funcionarioId = funcionario!.id;

    // 5) Owner liga o atributo profissional (funcionário é agent — permitido).
    const { data: profId, error: erroLigar } = await owner
      .schema("aba_scheduling")
      .rpc("definir_profissional", { p_funcionario_id: funcionarioId, p_profissional: true });
    expect(erroLigar).toBeNull();
    expect(profId).toBeTruthy();
    profissionalId = profId as string;

    const { data: profissional } = await admin
      .schema("aba_scheduling")
      .from("profissionais")
      .select("ativo, profile_id, funcionario_id")
      .eq("id", profissionalId)
      .single();
    expect(profissional?.ativo).toBe(true);
    expect(profissional?.funcionario_id).toBe(funcionarioId);
    expect(profissional?.profile_id).toBe(perfil!.id); // derivado pelo trigger sincronizar_perfil_profissional

    // Desliga — nunca DELETE, só ativo=false.
    const { error: erroDesligar } = await owner
      .schema("aba_scheduling")
      .rpc("definir_profissional", { p_funcionario_id: funcionarioId, p_profissional: false });
    expect(erroDesligar).toBeNull();

    const { data: desligado } = await admin
      .schema("aba_scheduling")
      .from("profissionais")
      .select("ativo")
      .eq("id", profissionalId)
      .single();
    expect(desligado?.ativo).toBe(false);

    // peek_convite do mesmo token agora diz "used".
    const { data: peekUsado } = await anon.rpc("peek_convite", { p_token: convite.token });
    expect(peekUsado.ok).toBe(false);
    expect(peekUsado.reason).toBe("used");
  });
});

describe("Regra nova de Max — atributo profissional só para account_role=agent", () => {
  it("admin não vira profissional mesmo com funcionário ativo e login válido", async () => {
    const owner = await clientAs("owner");

    const { data: convite } = await owner.rpc("criar_convite", { p_role: "admin", p_label: "Convite admin 02.2" });
    const convidado = await criarUsuarioDescartavel("equipe-admin");
    let funcionarioId: string | undefined;
    limpeza.push(async () => {
      if (funcionarioId) {
        await admin.schema("aba_scheduling").from("profissionais").delete().eq("funcionario_id", funcionarioId);
        await admin.schema("aba_people").from("funcionarios").delete().eq("id", funcionarioId);
        await admin.schema("aba_people").from("pessoas").delete().eq("id", funcionarioId);
      }
      await admin.from("account_invitations").delete().eq("id", convite.invitation_id);
      await admin.from("profiles").delete().eq("user_id", convidado.userId);
      await admin.auth.admin.deleteUser(convidado.userId);
    });

    await convidado.client.rpc("resgatar_convite", { p_token: convite.token });

    const { data: perfil } = await admin.from("profiles").select("id, account_role").eq("user_id", convidado.userId).single();
    expect(perfil?.account_role).toBe("admin");

    const { data: funcionario } = await admin
      .schema("aba_people")
      .from("funcionarios")
      .select("id")
      .eq("profile_id", perfil!.id)
      .single();
    funcionarioId = funcionario!.id;

    const { error } = await owner
      .schema("aba_scheduling")
      .rpc("definir_profissional", { p_funcionario_id: funcionarioId, p_profissional: true });
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/agent/i);

    const { count } = await admin
      .schema("aba_scheduling")
      .from("profissionais")
      .select("id", { count: "exact", head: true })
      .eq("funcionario_id", funcionarioId);
    expect(count).toBe(0);
  });
});

describe("Governança de convite — só admin+ cria, nunca concede owner", () => {
  it("agent não pode criar convite (42501)", async () => {
    const agent = await clientAs("agent");
    const { data, error } = await agent.rpc("criar_convite", { p_role: "viewer" });
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("viewer não pode criar convite (42501)", async () => {
    const viewer = await clientAs("viewer");
    const { data, error } = await viewer.rpc("criar_convite", { p_role: "viewer" });
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("owner não consegue criar convite de papel owner (22023) — só transfer_account_ownership promove", async () => {
    const owner = await clientAs("owner");
    const { data, error } = await owner.rpc("criar_convite", { p_role: "owner" });
    expect(data).toBeNull();
    expect(error?.code).toBe("22023");
  });
});

describe("peek_convite — os 3 estados de recusa", () => {
  it("token inexistente devolve not_found", async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data } = await anon.rpc("peek_convite", { p_token: "token-que-nunca-existiu-1234567890" });
    expect(data.ok).toBe(false);
    expect(data.reason).toBe("not_found");
  });

  it("convite expirado devolve expired", async () => {
    const owner = await clientAs("owner");
    const { data: convite } = await owner.rpc("criar_convite", { p_role: "viewer", p_dias_validade: 1 });
    limpeza.push(async () => {
      await admin.from("account_invitations").delete().eq("id", convite.invitation_id);
    });

    await admin.from("account_invitations").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", convite.invitation_id);

    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data } = await anon.rpc("peek_convite", { p_token: convite.token });
    expect(data.ok).toBe(false);
    expect(data.reason).toBe("expired");
  });
});

describe("resgatar_convite — recusas de segurança (achado A02 da 01.8, regressão)", () => {
  it("usuário já membro de conta compartilhada não consegue resgatar (23505) — fixture inalterada", async () => {
    // rls.viewer já é membro da conta de teste compartilhada (não é sole
    // owner da própria conta) — usa a fixture só para LER o resultado do
    // ataque, nunca escreve nela.
    const owner = await clientAs("owner");
    const { data: convite } = await owner.rpc("criar_convite", { p_role: "viewer" });
    limpeza.push(async () => {
      await admin.from("account_invitations").delete().eq("id", convite.invitation_id);
    });

    const viewer = await clientAs("viewer");
    const { data, error } = await viewer.rpc("resgatar_convite", { p_token: convite.token });
    expect(data).toBeNull();
    expect(error?.code).toBe("23505");

    // Confirma que a fixture não mudou de conta.
    const ctx = await loadContext();
    const { data: perfil } = await admin.from("profiles").select("account_id").eq("id", ctx.profileIds.viewer).single();
    expect(perfil?.account_id).toBe(ctx.accountId);
  });

  it("usuário com dado de domínio na própria conta não consegue resgatar (23505)", async () => {
    const owner = await clientAs("owner");
    const { data: convite } = await owner.rpc("criar_convite", { p_role: "viewer" });

    const convidado = await criarUsuarioDescartavel("equipe-com-dado");
    const { data: perfilConvidado } = await admin.from("profiles").select("account_id").eq("user_id", convidado.userId).single();

    // aba_people.pessoas NÃO serve para forjar "tem dado" — toda conta
    // nova já tem uma pessoa própria (o self-funcionário do trigger da
    // Parte 3), então o domain-check da resgatar_convite ignora pessoas
    // de propósito (ver comentário no cabeçalho da migration 024) e
    // olha para os papéis reais (leads/clientes/fornecedores).
    const { data: pessoa } = await admin
      .schema("aba_people")
      .from("pessoas")
      .insert({ account_id: perfilConvidado!.account_id, nome_exibicao: "Lead prévio na conta pessoal" })
      .select("id")
      .single();
    await admin
      .schema("aba_people")
      .from("leads")
      .insert({ id: pessoa!.id, account_id: perfilConvidado!.account_id, origem: "manual" });

    limpeza.push(async () => {
      await admin.schema("aba_people").from("leads").delete().eq("id", pessoa!.id);
      await admin.schema("aba_people").from("pessoas").delete().eq("id", pessoa!.id);
      await admin.from("account_invitations").delete().eq("id", convite.invitation_id);
      await apagarUsuarioDescartavel(convidado.userId);
    });

    const { data, error } = await convidado.client.rpc("resgatar_convite", { p_token: convite.token });
    expect(data).toBeNull();
    expect(error?.code).toBe("23505");
    expect(error?.message).toMatch(/dados/i);
  });
});

describe("Gestão de membro — set_member_role / transfer_account_ownership / remove_account_member", () => {
  it("cenário descartável ponta a ponta: promove, transfere titularidade e remove — nunca toca a conta de teste compartilhada", async () => {
    const fundador = await criarUsuarioDescartavel("gestao-fundador");
    const convidado = await criarUsuarioDescartavel("gestao-convidado");
    let contaFundadorId: string;

    limpeza.push(async () => {
      // A conta sobrevivente (qualquer que seja o owner final) cai por
      // CASCADE; os dois logins são removidos por último.
      await admin.from("accounts").delete().eq("id", contaFundadorId);
      await apagarUsuarioDescartavel(fundador.userId);
      await apagarUsuarioDescartavel(convidado.userId);
    });

    const { data: perfilFundador } = await admin.from("profiles").select("account_id").eq("user_id", fundador.userId).single();
    contaFundadorId = perfilFundador!.account_id;

    // Fundador convida o segundo usuário como admin.
    const { data: convite } = await fundador.client.rpc("criar_convite", { p_role: "admin" });
    const { error: erroResgate } = await convidado.client.rpc("resgatar_convite", { p_token: convite.token });
    expect(erroResgate).toBeNull();

    // set_member_role: fundador rebaixa o convidado para viewer.
    const { error: erroRebaixar } = await fundador.client.rpc("set_member_role", {
      p_user_id: convidado.userId,
      p_new_role: "viewer",
    });
    expect(erroRebaixar).toBeNull();
    const { data: perfilRebaixado } = await admin.from("profiles").select("account_role").eq("user_id", convidado.userId).single();
    expect(perfilRebaixado?.account_role).toBe("viewer");

    // set_member_role recusa promover a owner — só transfer_account_ownership.
    const { error: erroPromoverOwner } = await fundador.client.rpc("set_member_role", {
      p_user_id: convidado.userId,
      p_new_role: "owner",
    });
    expect(erroPromoverOwner?.code).toBe("22023");

    // transfer_account_ownership: fundador transfere para o convidado.
    const { error: erroTransferencia } = await fundador.client.rpc("transfer_account_ownership", {
      p_new_owner_user_id: convidado.userId,
    });
    expect(erroTransferencia).toBeNull();

    const { data: perfisPosTransferencia } = await admin
      .from("profiles")
      .select("user_id, account_role")
      .in("user_id", [fundador.userId, convidado.userId]);
    expect(perfisPosTransferencia?.find((p) => p.user_id === convidado.userId)?.account_role).toBe("owner");
    expect(perfisPosTransferencia?.find((p) => p.user_id === fundador.userId)?.account_role).toBe("admin");

    const { data: contaAtualizada } = await admin.from("accounts").select("owner_user_id").eq("id", contaFundadorId).single();
    expect(contaAtualizada?.owner_user_id).toBe(convidado.userId);

    // Regressão A02 — fundador (agora admin) NÃO reescreve owner_user_id direto.
    const { error: erroApossar } = await fundador.client
      .from("accounts")
      .update({ owner_user_id: fundador.userId })
      .eq("id", contaFundadorId);
    expect(ehErroRls(erroApossar)).toBe(true);

    // remove_account_member: novo owner (convidado) remove o fundador.
    const { data: novaContaFundador, error: erroRemover } = await convidado.client.rpc("remove_account_member", {
      p_user_id: fundador.userId,
    });
    expect(erroRemover).toBeNull();
    expect(novaContaFundador).not.toBe(contaFundadorId);

    const { data: perfilFundadorFinal } = await admin
      .from("profiles")
      .select("account_id, account_role")
      .eq("user_id", fundador.userId)
      .single();
    expect(perfilFundadorFinal?.account_id).toBe(novaContaFundador);
    expect(perfilFundadorFinal?.account_role).toBe("owner");

    // O funcionário do fundador na conta antiga foi desativado pelo
    // trigger de nascimento — nunca apagado, profile_id solto (a linha
    // pertencia ao profile ANTES da troca de conta; buscar pelo id do
    // profile, que não muda entre contas, só account_id/account_role mudam).
    const { data: funcionarioAntigo } = await admin
      .schema("aba_people")
      .from("funcionarios")
      .select("ativo, profile_id")
      .eq("account_id", contaFundadorId)
      .eq("ativo", false)
      .single();
    expect(funcionarioAntigo?.profile_id).toBeNull();
    // A conta nova do fundador (novaContaFundador) é limpa pelo
    // afterAll via apagarUsuarioDescartavel(fundador.userId) — ele é o
    // owner dela, DELETE FROM accounts WHERE owner_user_id=... cobre.
  });
});
