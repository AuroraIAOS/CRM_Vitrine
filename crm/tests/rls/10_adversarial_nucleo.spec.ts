// ============================================================
// 10_adversarial_nucleo.spec.ts — Portão de segurança adversarial
// (Subetapa 01.8), vetores 1, 5 e 6 da pendência vigiada de
// docs/00_PLANO_E_CRITERIOS.md:
//   V1 — CRUD fora do que a role permite
//   V5 — alteração de parâmetro/valor padrão protegido
//   V6 — sequestro de credencial
//
// DIFERENÇA PARA AS SUÍTES 00–09: aquelas provam que o caminho
// PRETENDIDO funciona. Esta ataca de propósito, procurando o caminho
// NÃO pretendido. Todo caso aqui afirma o comportamento SEGURO — um
// caso vermelho é um achado real, não um teste mal escrito.
//
// ALVO CONTIDO (decisão de Max, 2026-08-17): ataque destrutivo sempre
// mira conta/usuário descartáveis criados na hora, nunca a conta de
// teste principal — se um ataque passar, o dano fica contido.
// ============================================================
import { describe, it, expect, afterAll } from "vitest";
import {
  adminClient,
  clientAs,
  createThrowawayUser,
  deleteThrowawayUser,
  loadContext,
  ehErroRls,
  ehErroConstraintOuTrigger,
} from "./helpers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../../.env") });
config({ path: path.resolve(__dirname, "../../.env.test") });

const SUPABASE_URL = process.env.SUPABASE__URL!;
const ANON_KEY = process.env.SUPABASE_ANON_KEY!;

/** Sessão autenticada avulsa (usuário descartável, fora do cache de papéis). */
async function signInAs(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInAs(${email}): ${error.message}`);
  return c;
}

/** Um ataque só está barrado se o erro for de RLS/privilégio OU de constraint/trigger. */
function ataqueBarrado(err: { code?: string | null; message?: string | null } | null): boolean {
  return ehErroRls(err) || ehErroConstraintOuTrigger(err);
}

const limpeza: Array<() => Promise<void>> = [];
afterAll(async () => {
  for (const fn of limpeza.reverse()) {
    try {
      await fn();
    } catch (e) {
      console.warn("limpeza adversarial falhou:", (e as Error).message);
    }
  }
});

// ============================================================
// V1 — CRUD fora do que a role permite
// ============================================================
describe("V1 — escalação de privilégio no núcleo", () => {
  it("H2: usuário SEM perfil não pode se inserir em conta alheia como owner", async () => {
    const admin = adminClient();
    const ctx = await loadContext();
    const atacante = await createThrowawayUser(admin, "adv-h2");
    limpeza.push(async () => {
      // Remove qualquer perfil que o ataque tenha conseguido plantar.
      await admin.from("profiles").delete().eq("user_id", atacante.userId);
      await deleteThrowawayUser(admin, atacante.userId);
    });

    // Estado "usuário sem perfil": alcançável de verdade em produção
    // porque handle_new_user (001_core_public.sql) engole qualquer
    // exceção com EXCEPTION WHEN OTHERS ... RETURN NEW — o usuário
    // fica em auth.users sem linha em profiles.
    const { error: delErr } = await admin.from("profiles").delete().eq("user_id", atacante.userId);
    expect(delErr).toBeNull();

    const sessao = await signInAs(atacante.email, atacante.password);

    // O ataque: entrar na conta da VÍTIMA (conta de teste) como owner.
    const { data, error } = await sessao
      .from("profiles")
      .insert({
        user_id: atacante.userId,
        account_id: ctx.accountId, // conta alheia
        account_role: "owner", // papel máximo
        full_name: "Invasor",
        email: atacante.email,
      })
      .select("id, account_id, account_role");

    if (!error) {
      // Achado confirmado — mede o alcance antes de falhar, para o relatório.
      const { data: vazamento } = await sessao.from("accounts").select("id, name").eq("id", ctx.accountId);
      console.error(
        "H2 EXPLORÁVEL — perfil plantado:",
        JSON.stringify(data),
        "| conta da vítima visível ao invasor:",
        JSON.stringify(vazamento),
      );
    }

    expect(ataqueBarrado(error), `INSERT em profiles com account_id alheio + role owner NÃO foi barrado (erro: ${JSON.stringify(error)})`).toBe(true);
  });

  it("H3: admin não pode se apossar da conta reescrevendo accounts.owner_user_id", async () => {
    const ctx = await loadContext();
    const admin = await clientAs("admin");

    const { data, error } = await admin
      .from("accounts")
      .update({ owner_user_id: ctx.userIds.admin }) // admin tentando virar dono do registro
      .eq("id", ctx.accountId)
      .select("id, owner_user_id");

    if (!error && data && data.length > 0) {
      // Reverte imediatamente — não deixar a fixture sequestrada.
      await adminClient().from("accounts").update({ owner_user_id: ctx.userIds.owner }).eq("id", ctx.accountId);
      console.error("H3 EXPLORÁVEL — owner_user_id reescrito por admin:", JSON.stringify(data));
    }

    expect(ataqueBarrado(error), `admin conseguiu reescrever accounts.owner_user_id (erro: ${JSON.stringify(error)})`).toBe(true);
  });

  it("viewer não escreve em profiles de outro membro da própria conta", async () => {
    const ctx = await loadContext();
    const viewer = await clientAs("viewer");

    const { error } = await viewer
      .from("profiles")
      .update({ full_name: "sequestrado" })
      .eq("id", ctx.profileIds.owner)
      .select("id");

    // profiles_update exige auth.uid() = user_id — a linha do owner
    // simplesmente não é visível para escrita; 0 linhas afetadas também
    // é barrado (não houve efeito).
    const { data: conferencia } = await adminClient()
      .from("profiles")
      .select("full_name")
      .eq("id", ctx.profileIds.owner)
      .single();
    expect(conferencia?.full_name).not.toBe("sequestrado");
    expect(error === null || ataqueBarrado(error)).toBe(true);
  });

  it("agent não altera o próprio account_role para admin (trava de coluna)", async () => {
    const ctx = await loadContext();
    const agent = await clientAs("agent");

    const { error } = await agent
      .from("profiles")
      .update({ account_role: "admin" })
      .eq("user_id", ctx.userIds.agent)
      .select("id");

    expect(ehErroRls(error), `agent escalou o próprio papel (erro: ${JSON.stringify(error)})`).toBe(true);

    const { data: conferencia } = await adminClient()
      .from("profiles")
      .select("account_role")
      .eq("user_id", ctx.userIds.agent)
      .single();
    expect(conferencia?.account_role).toBe("agent");
  });

  it("membro não migra a si mesmo para outra conta (account_id travado)", async () => {
    const ctx = await loadContext();
    const admin = adminClient();
    const vitima = await createThrowawayUser(admin, "adv-conta-alvo");
    limpeza.push(() => deleteThrowawayUser(admin, vitima.userId));

    const { data: perfilVitima } = await admin
      .from("profiles")
      .select("account_id")
      .eq("user_id", vitima.userId)
      .single();

    const agent = await clientAs("agent");
    const { error } = await agent
      .from("profiles")
      .update({ account_id: perfilVitima!.account_id })
      .eq("user_id", ctx.userIds.agent)
      .select("id");

    expect(ehErroRls(error), `agent migrou a si mesmo para conta alheia (erro: ${JSON.stringify(error)})`).toBe(true);
  });
});

// ============================================================
// V5 — alteração de parâmetro / valor padrão protegido
// ============================================================
describe("V5 — parâmetro protegido (teto de assentos, enum/CHECK)", () => {
  it("nem o owner eleva o próprio teto de assentos", async () => {
    const ctx = await loadContext();
    const owner = await clientAs("owner");

    const { data, error } = await owner
      .from("licensing.account_limits" as never)
      .update({ max_users: 999 } as never)
      .eq("account_id", ctx.accountId)
      .select("account_id");

    // A tabela vive no schema licensing — via .schema() é o caminho real.
    const { data: d2, error: e2 } = await owner
      .schema("licensing")
      .from("account_limits")
      .update({ max_users: 999 })
      .eq("account_id", ctx.accountId)
      .select("account_id");

    const { data: conferencia } = await adminClient()
      .schema("licensing")
      .from("account_limits")
      .select("max_users")
      .eq("account_id", ctx.accountId)
      .single();

    expect(conferencia?.max_users, "teto de assentos foi elevado por um papel de conta").not.toBe(999);
    expect(
      (e2 !== null && ataqueBarrado(e2)) || (d2 ?? []).length === 0,
      `owner alterou o teto de assentos (data: ${JSON.stringify(d2)}, erro: ${JSON.stringify(e2)})`,
    ).toBe(true);
    void data;
    void error;
  });

  it("owner não insere linha nova de limite para inflar o teto", async () => {
    const admin = adminClient();
    const alvo = await createThrowawayUser(admin, "adv-teto");
    limpeza.push(() => deleteThrowawayUser(admin, alvo.userId));

    const { data: perfilAlvo } = await admin
      .from("profiles")
      .select("account_id")
      .eq("user_id", alvo.userId)
      .single();

    const owner = await clientAs("owner");
    const { data, error } = await owner
      .schema("licensing")
      .from("account_limits")
      .insert({ account_id: perfilAlvo!.account_id, max_users: 999 })
      .select("account_id");

    expect(
      (error !== null && ataqueBarrado(error)) || (data ?? []).length === 0,
      `INSERT em licensing.account_limits passou (data: ${JSON.stringify(data)}, erro: ${JSON.stringify(error)})`,
    ).toBe(true);
  });

  it("teto de assentos barra o INSERT direto de perfil numa conta lotada", async () => {
    const admin = adminClient();
    const dono = await createThrowawayUser(admin, "adv-lotada");
    limpeza.push(async () => {
      await admin.from("profiles").delete().eq("user_id", dono.userId);
      await deleteThrowawayUser(admin, dono.userId);
    });

    const { data: perfilDono } = await admin
      .from("profiles")
      .select("account_id")
      .eq("user_id", dono.userId)
      .single();

    // Teto de fábrica = 3; força a conta a 1 assento, já ocupado pelo dono.
    await admin
      .schema("licensing")
      .from("account_limits")
      .upsert({ account_id: perfilDono!.account_id, max_users: 1 }, { onConflict: "account_id" });

    const intruso = await createThrowawayUser(admin, "adv-intruso");
    limpeza.push(async () => {
      await admin.from("profiles").delete().eq("user_id", intruso.userId);
      await deleteThrowawayUser(admin, intruso.userId);
    });
    await admin.from("profiles").delete().eq("user_id", intruso.userId);

    const sessao = await signInAs(intruso.email, intruso.password);
    const { error } = await sessao
      .from("profiles")
      .insert({
        user_id: intruso.userId,
        account_id: perfilDono!.account_id,
        account_role: "viewer",
        full_name: "Intruso",
        email: intruso.email,
      })
      .select("id");

    expect(ataqueBarrado(error), `perfil entrou em conta lotada (erro: ${JSON.stringify(error)})`).toBe(true);
  });

  it("CHECK de enum não aceita valor fora do domínio (convite como owner)", async () => {
    const ctx = await loadContext();
    const owner = await clientAs("owner");

    const { error } = await owner
      .from("account_invitations")
      .insert({
        account_id: ctx.accountId,
        token_hash: `adv-${Date.now()}`,
        role: "owner", // CHECK (role <> 'owner')
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .select("id");

    expect(ataqueBarrado(error), `convite com papel owner foi aceito (erro: ${JSON.stringify(error)})`).toBe(true);
  });

  it("CHECK de provedor não aceita 'evolution' em envios_fatura (escopo fora do MVP)", async () => {
    const ctx = await loadContext();
    const owner = await clientAs("owner");

    // Fatura mínima para pendurar o envio.
    const { data: cliente } = await adminClient()
      .schema("aba_people")
      .from("clientes")
      .select("id")
      .limit(1)
      .maybeSingle();

    const { data: fatura } = await owner
      .schema("aba_finance")
      .from("faturas")
      .insert({
        account_id: ctx.accountId,
        cliente_id: cliente?.id ?? null,
        vencimento: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .maybeSingle();

    if (fatura?.id) {
      limpeza.push(async () => {
        await adminClient().schema("aba_finance").from("faturas").delete().eq("id", fatura.id);
      });

      const { error } = await owner
        .schema("aba_finance")
        .from("envios_fatura")
        .insert({ account_id: ctx.accountId, fatura_id: fatura.id, provedor: "evolution" })
        .select("id");

      expect(ataqueBarrado(error), `provedor 'evolution' aceito fora do MVP (erro: ${JSON.stringify(error)})`).toBe(true);
    }
  });
});

// ============================================================
// V6 — sequestro de credencial
// ============================================================
describe("V6 — credencial guardada no banco não vaza pela API", () => {
  it("H19: viewer NÃO lê webhook_endpoints.secret", async () => {
    const ctx = await loadContext();
    const admin = adminClient();

    const segredo = `adv-segredo-${Date.now()}`;
    const { data: endpoint, error: seedErr } = await admin
      .from("webhook_endpoints")
      .insert({ account_id: ctx.accountId, url: "https://exemplo.invalido/hook", secret: segredo })
      .select("id")
      .single();
    if (seedErr) throw new Error(`seed webhook_endpoints: ${seedErr.message}`);
    limpeza.push(async () => {
      await admin.from("webhook_endpoints").delete().eq("id", endpoint.id);
    });

    const viewer = await clientAs("viewer");
    const { data, error } = await viewer.from("webhook_endpoints").select("secret").eq("id", endpoint.id);

    const vazou = !error && (data ?? []).some((l) => (l as { secret?: string }).secret === segredo);
    if (vazou) console.error("H19 EXPLORÁVEL — viewer leu o segredo de assinatura em texto puro:", JSON.stringify(data));

    expect(vazou, "viewer leu webhook_endpoints.secret (segredo de assinatura em texto puro)").toBe(false);
  });

  it("H20: viewer NÃO lê api_keys.key_hash", async () => {
    const ctx = await loadContext();
    const admin = adminClient();

    const hash = `adv-hash-${Date.now()}`;
    const { data: chave, error: seedErr } = await admin
      .from("api_keys")
      .insert({ account_id: ctx.accountId, name: "adv", key_prefix: "adv_", key_hash: hash })
      .select("id")
      .single();
    if (seedErr) throw new Error(`seed api_keys: ${seedErr.message}`);
    limpeza.push(async () => {
      await admin.from("api_keys").delete().eq("id", chave.id);
    });

    const viewer = await clientAs("viewer");
    const { data, error } = await viewer.from("api_keys").select("key_hash").eq("id", chave.id);

    const vazou = !error && (data ?? []).some((l) => (l as { key_hash?: string }).key_hash === hash);
    if (vazou) console.error("H20 EXPLORÁVEL — viewer leu api_keys.key_hash:", JSON.stringify(data));

    expect(vazou, "viewer leu api_keys.key_hash (hash de credencial exposto a ataque offline)").toBe(false);
  });

  it("H21: viewer NÃO lê aba_ai.ia_configuracoes.chave_api", async () => {
    const ctx = await loadContext();
    const admin = adminClient();

    const cifrada = `adv-cifrada-${Date.now()}`;
    const { data: cfg, error: seedErr } = await admin
      .schema("aba_ai")
      .from("ia_configuracoes")
      .upsert(
        { account_id: ctx.accountId, provedor: "openai", modelo: "gpt-4o-mini", chave_api: cifrada },
        { onConflict: "account_id" },
      )
      .select("id")
      .single();
    if (seedErr) throw new Error(`seed ia_configuracoes: ${seedErr.message}`);
    limpeza.push(async () => {
      await admin.schema("aba_ai").from("ia_configuracoes").delete().eq("id", cfg.id);
    });

    const viewer = await clientAs("viewer");
    const { data, error } = await viewer.schema("aba_ai").from("ia_configuracoes").select("chave_api").eq("id", cfg.id);

    const vazou = !error && (data ?? []).some((l) => (l as { chave_api?: string }).chave_api === cifrada);
    if (vazou) console.error("H21 EXPLORÁVEL — viewer leu ia_configuracoes.chave_api:", JSON.stringify(data));

    expect(vazou, "viewer leu aba_ai.ia_configuracoes.chave_api (texto cifrado, mas credencial mesmo assim)").toBe(false);
  });

  it("CONTROLE NEGATIVO: esconder a credencial não quebrou o acesso legítimo", async () => {
    const ctx = await loadContext();
    const admin = adminClient();

    // Um endpoint real, com segredo, na conta de teste.
    const { data: endpoint } = await admin
      .from("webhook_endpoints")
      .insert({ account_id: ctx.accountId, url: "https://exemplo.invalido/ok", secret: `ctrl-${Date.now()}` })
      .select("id")
      .single();
    limpeza.push(async () => {
      await admin.from("webhook_endpoints").delete().eq("id", endpoint!.id);
    });

    // O papel que administra webhooks continua enxergando o que precisa
    // para operar a tela — tudo, menos a credencial.
    const adminSessao = await clientAs("admin");
    const { data, error } = await adminSessao
      .from("webhook_endpoints")
      .select("id, url, events, is_active, failure_count, created_at")
      .eq("id", endpoint!.id);

    expect(error, `o narrowing quebrou a leitura legítima de webhook_endpoints: ${JSON.stringify(error)}`).toBeNull();
    expect((data ?? []).length, "admin deixou de enxergar o próprio endpoint de webhook").toBe(1);
    expect((data ?? [])[0]?.url).toBe("https://exemplo.invalido/ok");

    // E a service role — que é quem assina de fato — continua lendo o segredo.
    const { data: comSegredo, error: erroServico } = await admin
      .from("webhook_endpoints")
      .select("secret")
      .eq("id", endpoint!.id);
    expect(erroServico).toBeNull();
    expect((comSegredo ?? [])[0]?.secret, "service_role perdeu acesso ao segredo que precisa para assinar").toBeTruthy();
  });

  it("H22 (controle): narrowing de aba_messaging de fato nega as colunas de segredo", async () => {
    const owner = await clientAs("owner");

    const { error: e1 } = await owner
      .schema("aba_messaging")
      .from("configuracao_whatsapp")
      .select("token_acesso_cifrado")
      .limit(1);
    const { error: e2 } = await owner
      .schema("aba_messaging")
      .from("provedores_canal")
      .select("token_instancia_cifrado, segredo_webhook_cifrado")
      .limit(1);
    const { error: e3 } = await owner
      .schema("aba_messaging")
      .from("provedores_canal")
      .select("hash_segredo_webhook")
      .limit(1);

    // Este caso é o CONTROLE POSITIVO da suíte: prova que o padrão de
    // narrowing por coluna funciona quando aplicado — logo, a ausência
    // dele no núcleo (H19/H20/H21) é lacuna, não limitação da técnica.
    expect(ehErroRls(e1), `token_acesso_cifrado legível (erro: ${JSON.stringify(e1)})`).toBe(true);
    expect(ehErroRls(e2), `segredos de provedores_canal legíveis (erro: ${JSON.stringify(e2)})`).toBe(true);
    expect(ehErroRls(e3), `hash_segredo_webhook legível (erro: ${JSON.stringify(e3)})`).toBe(true);
  });
});
