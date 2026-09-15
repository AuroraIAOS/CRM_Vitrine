import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adminClient, anonClient } from "./helpers";
import { AMBIENTE_DE_TESTE } from "./ambiente";

/**
 * Subetapa 03.9 — PORTÃO COMPLETO: multiunidade + trava de nível.
 *
 * O VETOR OBRIGATÓRIO é "usuário com duas contas lendo dado da conta
 * inativa", que o plano chama de o vazamento mais provável do MVP. Ele não
 * se prova olhando uma tabela: prova-se VARRENDO O CATÁLOGO. Toda tabela com
 * `account_id`, em todo schema da aplicação, é lida como o usuário real (com
 * o `session_id` do JWT dele) e tem de devolver zero linha de conta que não
 * seja a ativa.
 *
 * AS PERSONAGENS, todas descartáveis e fora da conta de teste compartilhada:
 *   - `dona`   — owner da clínica B, perfil único.
 *   - `multi`  — owner da clínica M (a própria, com dado) e AGENT em B.
 *                Duas sessões: `multiS1` e `multiS2` (dois aparelhos).
 *   - `terceira` — owner da clínica C, que convida `multi` (convite híbrido).
 *   - `novata` — conta própria vazia, aceita convite de B (migração 037).
 *
 * O papel que importa é o AGENT com uma segunda conta onde é OWNER: é aí que
 * `SELECT ... INTO` sem conta ativa pega a primeira linha e herda o papel da
 * outra clínica, sem erro nenhum.
 *
 * DECISÕES DE MAX (2026-09-14) que este arquivo prova: conta ativa por
 * sessão; convite híbrido; dono de duas clínicas por transferência; rede
 * fora da 03.9; matriz de nível fica para depois, mas o CORTE tem de
 * funcionar contra o owner.
 */

const SCHEMAS_APP = [
  "public", "access", "licensing", "aba_people", "aba_catalog", "aba_scheduling", "aba_finance",
  "aba_health", "aba_messaging", "aba_sales", "aba_automations", "aba_ai", "aba_treatment",
];

/**
 * Tabelas que `authenticated` não lê de jeito nenhum, POR DESENHO — o `42501`
 * é a própria proteção. `public.active_accounts` só se escreve por
 * `set_active_account` e só se lê por `active_account_id` (054, verificação
 * c). `aba_health.tentativas_token_externo` e `aba_health.remessas_externas`
 * (059, Subetapa 03.10) são só do servidor: sem GRANT e sem policy — a
 * caixa de entrada abre por função com log na 03.11. Qualquer OUTRA tabela
 * ilegível faz a varredura falhar.
 */
const SEM_PRIVILEGIO_POR_DESENHO = [
  "public.active_accounts",
  "aba_health.tentativas_token_externo",
  "aba_health.remessas_externas",
];

const admin = adminClient();

type Pessoa = { userId: string; email: string; password: string; client: SupabaseClient; conta: string };

async function criarPessoa(prefixo: string): Promise<Pessoa> {
  const email = `multi-${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@crmvitrine.local`;
  const password = `Rls!${Math.random().toString(36).slice(2, 12)}Aa1`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`criarPessoa(${email}): ${error?.message}`);
  const client = await entrar(email, password);
  const { data: perfil, error: e2 } = await admin.from("profiles").select("account_id").eq("user_id", data.user.id).single();
  if (e2) throw e2;
  return { userId: data.user.id, email, password, client, conta: perfil.account_id };
}

async function entrar(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(AMBIENTE_DE_TESTE.url, AMBIENTE_DE_TESTE.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`entrar(${email}): ${error.message}`);
  return client;
}

/** As claims do JWT de um cliente — o `session_id` é a chave da conta ativa. */
async function claimsDe(client: SupabaseClient): Promise<{ sub: string; session_id: string; role: string }> {
  const { data } = await client.auth.getSession();
  const token = data.session!.access_token;
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

async function donoPg() {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_TEST_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
}

/**
 * Lê TODA tabela com `account_id` como o usuário da sessão, e devolve as que
 * mostraram linha de outra conta. Roda como `authenticated` com as claims
 * REAIS da sessão, numa transação desfeita. Coluna sem privilégio de leitura
 * não conta como "sem vazamento" em silêncio: ela volta na lista `ilegiveis`
 * e o teste decide.
 */
async function varrerContas(client: SupabaseClient, contaAtiva: string) {
  const claims = await claimsDe(client);
  const c = await donoPg();
  const vazou: { tabela: string; linhas: number }[] = [];
  const ilegiveis: string[] = [];
  let varridas = 0;
  try {
    const { rows: tabelas } = await c.query<{ s: string; t: string }>(
      `SELECT table_schema s, table_name t FROM information_schema.columns
        WHERE column_name = 'account_id' AND table_schema = ANY($1)
          AND (table_schema, table_name) IN (SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE')
        ORDER BY 1, 2`,
      [SCHEMAS_APP],
    );
    for (const { s, t } of tabelas) {
      await c.query("BEGIN");
      try {
        await c.query("SET LOCAL ROLE authenticated");
        await c.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
        const { rows } = await c.query<{ n: string }>(
          `SELECT count(*) n FROM "${s}"."${t}" WHERE account_id IS DISTINCT FROM $1`,
          [contaAtiva],
        );
        varridas++;
        if (Number(rows[0].n) > 0) vazou.push({ tabela: `${s}.${t}`, linhas: Number(rows[0].n) });
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "42501" && !SEM_PRIVILEGIO_POR_DESENHO.includes(`${s}.${t}`)) ilegiveis.push(`${s}.${t}`);
        else if (code === "42501") varridas++;
        else throw e;
      } finally {
        await c.query("ROLLBACK");
      }
    }
  } finally {
    await c.end();
  }
  return { vazou, ilegiveis, varridas };
}

describe("multiunidade: duas contas, uma ativa por sessão (Subetapa 03.9)", () => {
  let dona: Pessoa;       // owner de B
  let multi: Pessoa;      // owner de M, agent em B
  let multiS2: SupabaseClient;
  let terceira: Pessoa;   // owner de C
  let novata: Pessoa;     // conta própria vazia
  let contaB: string;
  let contaM: string;
  let pacienteB: string;
  let pacienteM: string;
  let formularioM: string;
  let perfilMultiEmB: string;
  let funcionarioMultiEmB: string;

  async function semearPaciente(conta: string, nome: string) {
    const { data: p, error } = await admin.schema("aba_people").from("pessoas")
      .insert({ account_id: conta, nome_exibicao: nome }).select("id").single();
    if (error) throw error;
    const { error: e2 } = await admin.schema("aba_people").from("clientes")
      .insert({ id: p.id, account_id: conta, razao_social: nome, status: "ativo" });
    if (e2) throw e2;
    return p.id as string;
  }

  async function semearEvolucao(conta: string, userId: string, cliente: string) {
    const { data: perfil } = await admin.from("profiles").select("id").eq("user_id", userId).eq("account_id", conta).single();
    const { data: func } = await admin.schema("aba_people").from("funcionarios")
      .select("id").eq("account_id", conta).eq("profile_id", perfil!.id).single();
    const { data: prof, error } = await admin.schema("aba_scheduling").from("profissionais")
      .insert({ account_id: conta, nome_exibicao: `Prof ${conta.slice(0, 4)}`, funcionario_id: func!.id,
                profile_id: perfil!.id, ativo: true, acesso_clinico: true })
      .select("id").single();
    if (error) throw error;
    const { error: e2 } = await admin.schema("aba_health").from("evolucoes")
      .insert({ account_id: conta, cliente_id: cliente, profissional_id: prof.id, avaliacao: `segredo clínico de ${conta}` });
    if (e2) throw e2;
  }

  beforeAll(async () => {
    dona = await criarPessoa("dona");
    multi = await criarPessoa("multi");
    terceira = await criarPessoa("terceira");
    novata = await criarPessoa("novata");
    contaB = dona.conta;
    contaM = multi.conta;

    // `multi` ganha o segundo perfil, como AGENT em B. É exatamente o que a
    // `UNIQUE (user_id)` impedia; o convite híbrido tem teste próprio abaixo.
    const { data: pB, error: ePerfil } = await admin.from("profiles")
      .insert({ user_id: multi.userId, account_id: contaB, account_role: "agent", full_name: "Multi em B", email: multi.email })
      .select("id").single();
    if (ePerfil) throw new Error(`fixture: segundo perfil de multi em B recusado — ${ePerfil.code} ${ePerfil.message}`);
    perfilMultiEmB = pB.id;
    const { data: fB, error: eFB } = await admin.schema("aba_people").from("funcionarios")
      .select("id").eq("account_id", contaB).eq("profile_id", perfilMultiEmB).single();
    if (eFB) throw eFB;
    funcionarioMultiEmB = fB.id;

    pacienteB = await semearPaciente(contaB, "Paciente de B 03.9");
    pacienteM = await semearPaciente(contaM, "Paciente de M 03.9");
    await semearEvolucao(contaB, dona.userId, pacienteB);
    await semearEvolucao(contaM, multi.userId, pacienteM);

    const { data: f, error: eF } = await admin.schema("aba_health").from("formularios_anamnese")
      .insert({ account_id: contaM, nome: "Anamnese sigilosa de M", perguntas: [{ pergunta: "segredo" }] })
      .select("id").single();
    if (eF) throw eF;
    formularioM = f.id;

    const { error: eN } = await admin.from("notifications")
      .insert({ account_id: contaM, user_id: multi.userId, type: "teste_03_9", title: "Notificação da clínica M" });
    if (eN) throw eN;

    multiS2 = await entrar(multi.email, multi.password);
  });

  afterAll(async () => {
    const dono = await donoPg();
    try {
      const usuarios = [dona, multi, terceira, novata].filter(Boolean).map((p) => p.userId);
      await dono.query("ALTER TABLE aba_health.evolucoes DISABLE TRIGGER USER");
      await dono.query(`DELETE FROM aba_health.log_acesso WHERE account_id IN (SELECT account_id FROM public.profiles WHERE user_id = ANY($1))`, [usuarios]);
      await dono.query(`DELETE FROM aba_health.evolucoes WHERE account_id IN (SELECT id FROM public.accounts WHERE owner_user_id = ANY($1))`, [usuarios]);
      await dono.query("ALTER TABLE aba_health.evolucoes ENABLE TRIGGER USER");
      await dono.query(`DELETE FROM licensing.tiers WHERE key = 'teste_03_9'`).catch(() => {});
      await dono.query(`DELETE FROM public.accounts WHERE owner_user_id = ANY($1)`, [usuarios]);
      await dono.query(`DELETE FROM public.profiles WHERE user_id = ANY($1)`, [usuarios]);
    } finally {
      await dono.query("ALTER TABLE aba_health.evolucoes ENABLE TRIGGER USER").catch(() => {});
      await dono.end();
    }
    for (const p of [dona, multi, terceira, novata].filter(Boolean)) await admin.auth.admin.deleteUser(p.userId);
  });

  // ------------------------------------------------------------------
  // 1. SEM ESCOLHA, NADA
  // ------------------------------------------------------------------
  it("com dois perfis e nenhuma escolha na sessão, a conta ativa é NULA e tudo nega", async () => {
    const { data: ativa, error } = await multi.client.rpc("active_account_id");
    expect(error).toBeNull();
    expect(ativa).toBeNull();

    const { data: pode } = await multi.client.schema("access").rpc("can", { p_module_key: "people", p_action: "read" });
    expect(pode).toBe(false);

    const { data: clientes } = await multi.client.schema("aba_people").from("clientes").select("id");
    expect(clientes).toEqual([]);
  });

  it("o seletor enxerga as duas clínicas pelo único caminho aberto para isso, com o papel de cada uma", async () => {
    const { data, error } = await multi.client.rpc("my_accounts");
    expect(error).toBeNull();
    const porConta = Object.fromEntries((data as { account_id: string; account_role: string }[]).map((r) => [r.account_id, r.account_role]));
    expect(porConta).toEqual({ [contaB]: "agent", [contaM]: "owner" });
  });

  it("perfil único dispensa escolha: a dona entra direto em B", async () => {
    const { data } = await dona.client.rpc("active_account_id");
    expect(data).toBe(contaB);
  });

  // ------------------------------------------------------------------
  // 2. O VETOR OBRIGATÓRIO — varredura por catálogo
  // ------------------------------------------------------------------
  it("escolher conta sem vínculo é recusado (42501) e não muda nada", async () => {
    const { error } = await multi.client.rpc("set_active_account", { p_account_id: terceira.conta });
    expect(error?.code).toBe("42501");
    const { data } = await multi.client.rpc("active_account_id");
    expect(data).toBeNull();
  });

  it("anônimo não escolhe conta nenhuma", async () => {
    const { error } = await anonClient().rpc("set_active_account", { p_account_id: contaB });
    expect(error).not.toBeNull();
  });

  it("VETOR OBRIGATÓRIO: ativa em B, a varredura de TODA tabela com account_id não devolve linha de outra conta", async () => {
    const { error } = await multi.client.rpc("set_active_account", { p_account_id: contaB });
    expect(error).toBeNull();
    const r = await varrerContas(multi.client, contaB);
    expect(r.varridas).toBeGreaterThan(80);
    // Tabela ilegível por privilégio de coluna sairia da varredura em silêncio.
    expect(r.ilegiveis).toEqual([]);
    expect(r.vazou).toEqual([]);
  });

  it("VETOR OBRIGATÓRIO: ativa em M (onde é owner), nada de B aparece — e a outra sessão continua sem escolha", async () => {
    const { error } = await multiS2.rpc("set_active_account", { p_account_id: contaM });
    expect(error).toBeNull();
    const r = await varrerContas(multiS2, contaM);
    expect(r.vazou).toEqual([]);

    // Duas sessões, duas escolhas: a S1 continua em B.
    const { data: s1 } = await multi.client.rpc("active_account_id");
    expect(s1).toBe(contaB);
  });

  it("o owner de B não lê o formulário de anamnese de M (achado da 03.9: a política não tinha cerca de conta)", async () => {
    const r = await varrerContas(dona.client, contaB);
    expect(r.vazou).toEqual([]);
    const { data } = await dona.client.schema("aba_health").from("formularios_anamnese").select("id").eq("id", formularioM);
    expect(data).toEqual([]);
    const { error, data: alterado } = await dona.client.schema("aba_health").from("formularios_anamnese")
      .update({ nome: "alterado por estranho" }).eq("id", formularioM).select("id");
    expect(error === null ? alterado : []).toEqual([]);
  });

  // ------------------------------------------------------------------
  // 3. O PAPEL É O DA CONTA ATIVA
  // ------------------------------------------------------------------
  it("ativa em B, multi é AGENT: não herda o owner de M em access.can nem em pode_acessar", async () => {
    const { data: saude } = await multi.client.schema("access").rpc("can", { p_module_key: "health", p_action: "read" });
    expect(saude).toBe(false);
    const { data: alcance } = await multi.client.schema("aba_health").rpc("pode_acessar", { p_cliente_id: null, p_acao: "leitura" });
    expect(alcance).toBe(false);
    const { error: eConvite } = await multi.client.rpc("criar_convite", { p_role: "viewer" });
    expect(eConvite?.code).toBe("42501");
    const { error: eMatriz } = await multi.client.schema("access").rpc("set_module_permission", {
      p_role: "viewer", p_module_key: "people", p_action: "read", p_allowed: false,
    });
    expect(eMatriz).not.toBeNull();
  });

  it("ativa em B, as leituras clínicas com ID de M voltam vazias, e a de B também (agent sem alcance)", async () => {
    const { data: deM } = await multi.client.schema("aba_health").rpc("ler_evolucoes", { p_cliente_id: pacienteM });
    expect(deM).toEqual([]);
    const { data: planosM } = await multi.client.schema("aba_treatment").rpc("ler_planos", { p_cliente_id: pacienteM });
    expect(planosM ?? []).toEqual([]);
  });

  it("ativa em M, a mesma pessoa é OWNER e lê a própria evolução — controle positivo", async () => {
    const { data, error } = await multiS2.schema("aba_health").rpc("ler_evolucoes", { p_cliente_id: pacienteM });
    expect(error).toBeNull();
    expect((data as unknown[]).length).toBe(1);
    const { data: deB } = await multiS2.schema("aba_health").rpc("ler_evolucoes", { p_cliente_id: pacienteB });
    expect(deB).toEqual([]);
  });

  it("ativa em B, escrever com account_id de M é recusado pela RLS (42501)", async () => {
    const { error } = await multi.client.schema("aba_people").from("pessoas")
      .insert({ account_id: contaM, nome_exibicao: "plantada em M a partir de B" });
    expect(error?.code).toBe("42501");
  });

  it("as notificações de M não aparecem com a sessão ativa em B, e aparecem em M", async () => {
    const { data: emB } = await multi.client.from("notifications").select("id, account_id");
    expect((emB ?? []).filter((n) => n.account_id !== contaB)).toEqual([]);
    const { data: emM } = await multiS2.from("notifications").select("id").eq("type", "teste_03_9");
    expect((emM ?? []).length).toBe(1);
  });

  it("presença é por conta: marcar presença em B e em M gera duas linhas, uma por clínica", async () => {
    expect((await multi.client.rpc("touch_presence", { p_status: "online" })).error).toBeNull();
    expect((await multiS2.rpc("touch_presence", { p_status: "away" })).error).toBeNull();
    const { data } = await admin.from("member_presence").select("account_id, status").eq("user_id", multi.userId);
    const porConta = Object.fromEntries((data ?? []).map((r) => [r.account_id, r.status]));
    expect(porConta).toEqual({ [contaB]: "online", [contaM]: "away" });
  });

  it("ninguém escreve direto na tabela de conta ativa — nem para si mesmo", async () => {
    const claims = await claimsDe(multi.client);
    const { error } = await multi.client.from("active_accounts")
      .upsert({ session_id: claims.session_id, user_id: multi.userId, account_id: contaM });
    expect(error).not.toBeNull();
    const { data } = await multi.client.rpc("active_account_id");
    expect(data).toBe(contaB);
  });

  it("perfil novo não se cria por INSERT direto, nem para quem já tem perfil (a UNIQUE que saiu não era a trava)", async () => {
    const { error } = await multi.client.from("profiles")
      .insert({ user_id: multi.userId, account_id: terceira.conta, account_role: "owner", full_name: "x", email: multi.email });
    expect(error?.code).toBe("42501");
  });

  // ------------------------------------------------------------------
  // 4. GESTÃO DE MEMBRO NÃO ATRAVESSA CLÍNICA
  // ------------------------------------------------------------------
  it("a dona rebaixa multi em B, e o perfil de multi em M continua OWNER", async () => {
    const { error } = await dona.client.rpc("set_member_role", { p_user_id: multi.userId, p_new_role: "viewer" });
    expect(error).toBeNull();
    const { data } = await admin.from("profiles").select("account_id, account_role").eq("user_id", multi.userId);
    const porConta = Object.fromEntries((data ?? []).map((r) => [r.account_id, r.account_role]));
    expect(porConta[contaB]).toBe("viewer");
    expect(porConta[contaM]).toBe("owner");
  });

  it("multi ativo em M não promove nem remove ninguém de B, onde é só viewer", async () => {
    const { error } = await multiS2.rpc("set_member_role", { p_user_id: dona.userId, p_new_role: "viewer" });
    expect(error?.code).toBe("42501");
  });

  it("a dona transfere B para multi: vira owner de DUAS clínicas, e M fica intacta (decisão 3 de Max)", async () => {
    await dona.client.rpc("set_member_role", { p_user_id: multi.userId, p_new_role: "admin" });
    const { error } = await dona.client.rpc("transfer_account_ownership", { p_new_owner_user_id: multi.userId });
    expect(error).toBeNull();
    const { data: perfis } = await admin.from("profiles").select("user_id, account_id, account_role").in("user_id", [multi.userId, dona.userId]);
    const papel = (u: string, c: string) => perfis?.find((p) => p.user_id === u && p.account_id === c)?.account_role;
    expect(papel(multi.userId, contaB)).toBe("owner");
    expect(papel(multi.userId, contaM)).toBe("owner");
    expect(papel(dona.userId, contaB)).toBe("admin");
    const { data: contas } = await admin.from("accounts").select("id, owner_user_id").in("id", [contaB, contaM]);
    expect(contas?.every((c) => c.owner_user_id === multi.userId)).toBe(true);
  });

  it("quem ESTAVA ativo numa conta de onde saiu fica sem conta — nunca cai em silêncio na outra", async () => {
    // Devolve B à dona para poder remover multi de lá.
    const { error: eVolta } = await multi.client.rpc("transfer_account_ownership", { p_new_owner_user_id: dona.userId });
    expect(eVolta).toBeNull();
    const { error } = await dona.client.rpc("remove_account_member", { p_user_id: multi.userId });
    expect(error).toBeNull();

    // multi tinha outra clínica: nenhuma conta nova nasceu, o perfil em B saiu.
    const { data: perfis } = await admin.from("profiles").select("account_id").eq("user_id", multi.userId);
    expect(perfis?.map((p) => p.account_id)).toEqual([contaM]);
    const { data: contasDela } = await admin.from("accounts").select("id").eq("owner_user_id", multi.userId);
    expect(contasDela?.map((c) => c.id)).toEqual([contaM]);

    // A sessão 1 escolhera B. Agora ela não enxerga NADA — nem M.
    const { data: ativa } = await multi.client.rpc("active_account_id");
    expect(ativa).toBeNull();
    const { data: clientes } = await multi.client.schema("aba_people").from("clientes").select("id");
    expect(clientes).toEqual([]);

    // O funcionário de multi em B foi desativado e desvinculado, não apagado.
    const { data: func } = await admin.schema("aba_people").from("funcionarios")
      .select("ativo, profile_id").eq("id", funcionarioMultiEmB).single();
    expect(func).toEqual({ ativo: false, profile_id: null });
  });

  // ------------------------------------------------------------------
  // 5. CONVITE HÍBRIDO (decisão 2 de Max)
  // ------------------------------------------------------------------
  it("conta de origem com uso: aceitar convite ACRESCENTA perfil e preserva a clínica de origem com o dado dela", async () => {
    const { data: convite, error: e1 } = await terceira.client.rpc("criar_convite", { p_role: "agent" });
    expect(e1).toBeNull();
    const { data: conta, error } = await multiS2.rpc("resgatar_convite", { p_token: convite.token });
    expect(error).toBeNull();
    expect(conta).toBe(terceira.conta);
    const { data: perfis } = await admin.from("profiles").select("account_id, account_role").eq("user_id", multi.userId);
    const porConta = Object.fromEntries((perfis ?? []).map((r) => [r.account_id, r.account_role]));
    expect(porConta).toEqual({ [contaM]: "owner", [terceira.conta]: "agent" });
    const { data: pacienteAindaLa } = await admin.schema("aba_people").from("clientes").select("id").eq("id", pacienteM);
    expect(pacienteAindaLa?.length).toBe(1);
  });

  it("conta de origem solitária e vazia: aceitar convite MIGRA o perfil e apaga a conta, como a 037 já fazia", async () => {
    const { data: convite } = await dona.client.rpc("criar_convite", { p_role: "viewer" });
    const { error } = await novata.client.rpc("resgatar_convite", { p_token: convite.token });
    expect(error).toBeNull();
    const { data: perfis } = await admin.from("profiles").select("account_id").eq("user_id", novata.userId);
    expect(perfis?.map((p) => p.account_id)).toEqual([contaB]);
    const { data: antiga } = await admin.from("accounts").select("id").eq("id", novata.conta);
    expect(antiga).toEqual([]);
  });

  it("aceitar convite da clínica onde já é membro continua recusado (23505)", async () => {
    const { data: convite } = await terceira.client.rpc("criar_convite", { p_role: "viewer" });
    const { error } = await multiS2.rpc("resgatar_convite", { p_token: convite.token });
    expect(error?.code).toBe("23505");
  });

  // ------------------------------------------------------------------
  // 6. TRAVA DE NÍVEL — o corte tem de valer CONTRA O OWNER
  // ------------------------------------------------------------------
  describe("trava de nível (licensing), consultada antes do atalho de owner", () => {
    beforeAll(async () => {
      const dono = await donoPg();
      try {
        // Nível de teste com `people`, `health` e `treatment` cortados.
        await dono.query(`INSERT INTO licensing.tiers (key, label, position) VALUES ('teste_03_9', 'Teste 03.9', 99)`);
        await dono.query(
          `INSERT INTO licensing.tier_modules (tier_key, module_key, enabled)
             SELECT 'teste_03_9', m.key, m.key NOT IN ('people','health','treatment') FROM access.modules m`,
        );
        await dono.query(`UPDATE licensing.account_limits SET tier_key = 'teste_03_9' WHERE account_id = $1`, [contaM]);
      } finally {
        await dono.end();
      }
    });

    afterAll(async () => {
      const dono = await donoPg();
      try {
        await dono.query(`UPDATE licensing.account_limits SET tier_key = 'diamante' WHERE account_id = $1`, [contaM]);
        await dono.query(`DELETE FROM licensing.tiers WHERE key = 'teste_03_9'`);
      } finally {
        await dono.end();
      }
    });

    it("toda conta nasce com os módulos todos liberados (a matriz é decisão futura de Max)", async () => {
      const { data } = await dona.client.schema("licensing").rpc("account_modules");
      const cortados = (data as { module_key: string; enabled: boolean }[]).filter((m) => !m.enabled);
      expect((data as unknown[]).length).toBeGreaterThanOrEqual(11);
      expect(cortados).toEqual([]);
    });

    it("com o módulo cortado, o OWNER de M não o enxerga em access.can nem no menu", async () => {
      const { data: pode } = await multiS2.schema("access").rpc("can", { p_module_key: "people", p_action: "read" });
      expect(pode).toBe(false);
      const { data: menu } = await multiS2.schema("access").rpc("readable_modules");
      const chaves = (menu as { module_key: string }[]).map((m) => m.module_key);
      expect(chaves).not.toContain("people");
      expect(chaves).not.toContain("health");
      expect(chaves).toContain("finance");
    });

    it("com o módulo cortado, o OWNER de M não lê a tabela nem o prontuário — o atalho de owner de pode_acessar também obedece", async () => {
      const { data: clientes } = await multiS2.schema("aba_people").from("clientes").select("id");
      expect(clientes).toEqual([]);
      const { data: alcance } = await multiS2.schema("aba_health").rpc("pode_acessar", { p_cliente_id: pacienteM, p_acao: "leitura" });
      expect(alcance).toBe(false);
      const { data: evolucoes } = await multiS2.schema("aba_health").rpc("ler_evolucoes", { p_cliente_id: pacienteM });
      expect(evolucoes).toEqual([]);
      const { data: planos } = await multiS2.schema("aba_treatment").rpc("ler_planos", { p_cliente_id: pacienteM });
      expect(planos ?? []).toEqual([]);
    });

    it("o nível é o da conta ATIVA: a mesma pessoa, ativa na clínica C, continua vendo people", async () => {
      const { error } = await multiS2.rpc("set_active_account", { p_account_id: terceira.conta });
      expect(error).toBeNull();
      const { data: pode } = await multiS2.schema("access").rpc("can", { p_module_key: "people", p_action: "read" });
      expect(pode).toBe(true);
      await multiS2.rpc("set_active_account", { p_account_id: contaM });
    });

    it("o módulo de configurações não pode ser cortado — o dono não se tranca fora", async () => {
      const dono = await donoPg();
      try {
        const erro = await dono.query(
          `UPDATE licensing.tier_modules SET enabled = false WHERE tier_key = 'teste_03_9' AND module_key = 'settings'`,
        ).then(() => null, (e: { code?: string }) => e.code);
        expect(erro).toBe("23514");
      } finally {
        await dono.end();
      }
    });

    it("o owner não troca o próprio nível nem mexe na matriz", async () => {
      const u1 = await multiS2.schema("licensing").from("account_limits").update({ tier_key: "diamante" }).eq("account_id", contaM).select("account_id");
      expect(u1.error !== null || (u1.data ?? []).length === 0).toBe(true);
      const u2 = await multiS2.schema("licensing").from("tier_modules").update({ enabled: true }).eq("tier_key", "teste_03_9").select("tier_key");
      expect(u2.error !== null || (u2.data ?? []).length === 0).toBe(true);
      const { data: ainda } = await admin.schema("licensing").from("account_limits").select("tier_key").eq("account_id", contaM).single();
      expect(ainda?.tier_key).toBe("teste_03_9");
    });
  });

  // ------------------------------------------------------------------
  // 7. EDGE FUNCTIONS — resolviam a conta com service_role por user_id
  // ------------------------------------------------------------------
  describe("Edge Functions: o perfil vem da clínica ativa, pelo JWT do chamador", () => {
    const FUNCOES = ["ia-configurar", "ia-responder", "whatsapp-configurar", "whatsapp-enviar"];

    async function chamar(client: SupabaseClient, nome: string) {
      const { data } = await client.auth.getSession();
      const r = await fetch(`${AMBIENTE_DE_TESTE.url}/functions/v1/${nome}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session!.access_token}`, apikey: AMBIENTE_DE_TESTE.anonKey, "Content-Type": "application/json" },
        body: "{}",
      });
      return { status: r.status, corpo: await r.json().catch(() => ({})) as { error?: string } };
    }

    it("com a clínica ativa escolhida, a pessoa de duas clínicas passa da checagem de perfil nas quatro funções", async () => {
      // multiS2: perfis em M (owner) e C (agent), ativa em M.
      for (const nome of FUNCOES) {
        const r = await chamar(multiS2, nome);
        expect({ nome, erro: r.corpo.error }).not.toEqual({ nome, erro: "Perfil não encontrado" });
        expect([400, 500]).toContain(r.status); // validação do corpo ou ambiente — depois do perfil
      }
    });

    it("sessão sem clínica resolvida é recusada nas quatro (403), em vez de cair numa clínica qualquer", async () => {
      // multi.client (S1) escolhera B e foi removida de lá: a conta ativa é NULL.
      for (const nome of FUNCOES) {
        const r = await chamar(multi.client, nome);
        expect({ nome, status: r.status, erro: r.corpo.error }).toEqual({ nome, status: 403, erro: "Perfil não encontrado" });
      }
    });
  });
});

// --------------------------------------------------------------------
// 7. GUARDA PERMANENTE — no molde do F01-b da 02.15
// --------------------------------------------------------------------
describe("guardas permanentes da 03.9: sem elas a correção vale só para hoje", () => {
  it("nenhuma política de tabela com account_id fica sem cerca de conta", async () => {
    const { data, error } = await admin.rpc("politicas_sem_cerca_de_conta");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("nenhuma função descobre a conta do chamador sem passar pela conta ativa", async () => {
    const { data, error } = await admin.rpc("funcoes_sem_conta_ativa");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("nenhum atalho de owner fica antes da trava de nível", async () => {
    const { data, error } = await admin.rpc("atalhos_de_owner_sem_nivel");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("todo módulo tem linha em todo nível — módulo novo sem linha ficaria invisível sem aviso", async () => {
    const { data, error } = await admin.rpc("modulos_sem_linha_de_nivel");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
