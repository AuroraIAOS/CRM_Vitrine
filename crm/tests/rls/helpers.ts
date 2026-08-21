import { config } from "dotenv";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AMBIENTE_DE_TESTE } from "./ambiente";

// Suíte de RLS (Subetapa 01.2, portão de fase da Etapa 01 — docs/00
// §01.2). Bate no Supabase real do projeto — nunca em mock — como
// usuário autenticado real por papel, exatamente como a aplicação vai
// fazer em produção. .env (raiz, segredo único do projeto) + .env.test
// (crm/, credenciais de teste, gitignorado) — nesta ordem, para que
// .env.test nunca precise duplicar URL/anon key.
config({ path: path.resolve(__dirname, "../../../.env") });
config({ path: path.resolve(__dirname, "../../.env.test") });

// Desde a Subetapa 02.15 a suíte fala com o projeto Supabase DE TESTE,
// nunca com o de produção — `ambiente.ts` para a execução se as
// variáveis faltarem ou se as duas URLs coincidirem. Antes disso, cada
// ataque adversarial e cada fixture rodavam no mesmo banco que serve a
// vitrine pública.
const SUPABASE_URL = AMBIENTE_DE_TESTE.url;
const ANON_KEY = AMBIENTE_DE_TESTE.anonKey;
const SERVICE_ROLE_KEY = AMBIENTE_DE_TESTE.serviceRoleKey;
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD;

export type Role = "owner" | "admin" | "agent" | "viewer";

export const TEST_EMAILS: Record<Role, string | undefined> = {
  owner: process.env.TEST_OWNER_EMAIL,
  admin: process.env.TEST_ADMIN_EMAIL,
  agent: process.env.TEST_AGENT_EMAIL,
  viewer: process.env.TEST_VIEWER_EMAIL,
};

// URL e chaves já foram exigidas por `ambiente.ts` (que também recusa
// apontar para produção). Aqui sobram as credenciais dos usuários de teste.
for (const [name, value] of Object.entries({
  TEST_USER_PASSWORD: TEST_PASSWORD,
  ...TEST_EMAILS,
})) {
  if (!value) {
    throw new Error(
      `tests/rls/helpers: variável de ambiente ausente (${name}). Confirme .env da raiz e crm/.env.test, e rode scripts/seed_test_users.mjs.`,
    );
  }
}

/** Chave de service role — ignora RLS. Só para semear/limpar fixtures de teste. */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Cliente sem sessão — simula requisição não autenticada. */
export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Cria um usuário de teste descartável, em conta própria (nunca a conta de teste principal). */
export async function createThrowawayUser(
  admin: SupabaseClient,
  emailPrefix: string,
): Promise<{ userId: string; email: string; password: string }> {
  const email = `${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@crmvitrine.local`;
  const password = `Rls!${Math.random().toString(36).slice(2, 12)}Aa1`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    throw new Error(`createThrowawayUser: falha ao criar ${email}: ${error?.message}`);
  }
  return { userId: data.user.id, email, password };
}

/**
 * Desfaz createThrowawayUser. handle_new_user deixa o usuário como
 * owner_user_id da própria conta nova (public.accounts) — apagar
 * auth.users direto viola accounts_owner_user_id_fkey. A conta sai
 * primeiro (cascata limpa profiles/licensing/access).
 */
export async function deleteThrowawayUser(admin: SupabaseClient, userId: string): Promise<void> {
  const { error: accountErr } = await admin.from("accounts").delete().eq("owner_user_id", userId);
  if (accountErr) {
    throw new Error(`deleteThrowawayUser: falha ao apagar public.accounts do usuário ${userId}: ${accountErr.message}`);
  }
  const { error: userErr } = await admin.auth.admin.deleteUser(userId);
  if (userErr) {
    throw new Error(`deleteThrowawayUser: falha ao apagar auth.users ${userId}: ${userErr.message}`);
  }
}

const roleClientCache = new Map<Role, SupabaseClient>();

/**
 * Sessões preparadas por `globalSetup.ts`, uma vez por execução.
 *
 * Este `Map` continua sendo cache de MÓDULO, e é por isso que ele sozinho
 * nunca bastou: o Vitest dá a cada arquivo de teste um registro de módulos
 * próprio, então ele se esvazia a cada arquivo. Com 17 arquivos × 4 papéis
 * eram até 68 `signInWithPassword` em ~45 segundos — acima do teto do
 * endpoint de token, com sintoma idêntico a RLS quebrada (sem token o
 * cliente vira anônimo e a RLS nega tudo).
 *
 * A correção não é um cache melhor em memória: é o token vir de FORA do
 * processo do arquivo. `globalSetup` autentica os quatro papéis uma vez e
 * grava em disco; aqui cada arquivo apenas monta o cliente com
 * `setSession()`, sem tocar no endpoint de login.
 */
const CAMINHO_SESSOES = path.resolve(__dirname, ".sessoes-teste.json");

type SessaoCacheada = { access_token: string; refresh_token: string; expires_at: number };

function sessoesPreparadas(): Partial<Record<Role, SessaoCacheada>> {
  try {
    return JSON.parse(readFileSync(CAMINHO_SESSOES, "utf8"));
  } catch {
    return {};
  }
}

/** Cliente autenticado como o usuário de teste do papel indicado (sessão real, preparada no globalSetup). */
export async function clientAs(role: Role): Promise<SupabaseClient> {
  const cached = roleClientCache.get(role);
  if (cached) return cached;

  const client = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const preparada = sessoesPreparadas()[role];
  if (preparada) {
    const { error } = await client.auth.setSession({
      access_token: preparada.access_token,
      refresh_token: preparada.refresh_token,
    });
    if (!error) {
      roleClientCache.set(role, client);
      return client;
    }
    // Token recusado (expirou entre o setup e agora): cai para o login,
    // que é raro e ainda assim correto — nunca falhar por causa do cache.
  }

  const { error } = await client.auth.signInWithPassword({
    email: TEST_EMAILS[role]!,
    password: TEST_PASSWORD!,
  });
  if (error) {
    throw new Error(`Falha ao autenticar papel "${role}" (${TEST_EMAILS[role]}): ${error.message}. Rode scripts/seed_test_users.mjs antes da suíte.`);
  }
  roleClientCache.set(role, client);
  return client;
}

export interface TestContext {
  accountId: string;
  userIds: Record<Role, string>;
  profileIds: Record<Role, string>;
}

let cachedContext: TestContext | null = null;

/** Resolve os IDs reais da conta de teste em tempo de execução — nunca hardcoded. */
export async function loadContext(): Promise<TestContext> {
  if (cachedContext) return cachedContext;
  const admin = adminClient();

  const { data: users, error: usersErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (usersErr) throw new Error(`loadContext: falha ao listar usuários: ${usersErr.message}`);

  const userIds = {} as Record<Role, string>;
  for (const role of Object.keys(TEST_EMAILS) as Role[]) {
    const match = users.users.find((u) => u.email === TEST_EMAILS[role]);
    if (!match) throw new Error(`loadContext: usuário de teste não encontrado para papel "${role}" (${TEST_EMAILS[role]}). Rode scripts/seed_test_users.mjs.`);
    userIds[role] = match.id;
  }

  const { data: profiles, error: profilesErr } = await admin
    .from("profiles")
    .select("id, user_id, account_id, account_role")
    .in("user_id", Object.values(userIds));
  if (profilesErr) throw new Error(`loadContext: falha ao consultar profiles: ${profilesErr.message}`);
  if (!profiles || profiles.length !== 4) {
    throw new Error(`loadContext: esperava 4 profiles para os quatro papéis de teste, encontrou ${profiles?.length ?? 0}.`);
  }

  const accountId: string = profiles[0].account_id;
  if (!profiles.every((p) => p.account_id === accountId)) {
    throw new Error("loadContext: os quatro usuários de teste não estão todos na mesma conta. Rode scripts/seed_test_users.mjs.");
  }

  const profileIds = {} as Record<Role, string>;
  for (const role of Object.keys(TEST_EMAILS) as Role[]) {
    const match = profiles.find((p) => p.user_id === userIds[role]);
    if (!match) throw new Error(`loadContext: profile ausente para papel "${role}".`);
    profileIds[role] = match.id;
  }

  cachedContext = { accountId, userIds, profileIds };
  return cachedContext;
}

// --- Asserções de RLS -------------------------------------------------------

type ErroSupabase = { code?: string | null; message?: string | null } | null;

/** Erro de RLS/permissão (negado): SQLSTATE 42501 ou mensagem equivalente. */
export function ehErroRls(err: ErroSupabase): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  const msg = err.message ?? "";
  return code === "42501" || /row-level security|permission denied|not authorized/i.test(msg);
}

const CODIGOS_CONSTRAINT = new Set(["23502", "23503", "23514", "23505"]);

/** Erro de constraint/trigger (RLS PASSOU, falhou depois nos dados). */
export function ehErroConstraintOuTrigger(err: ErroSupabase): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  return CODIGOS_CONSTRAINT.has(code) || code === "P0001";
}
