// scripts/seed_test_users.mjs — fixture idempotente da suíte de RLS
// (tests/rls/). Cria (ou reaproveita) os 4 usuários de teste — um por
// papel — e garante que todos ficam na MESMA conta, com o account_role
// correto. Nunca roda em CI sem confirmação humana: só uso local,
// contra o projeto Supabase real do Vitrine.
//
// Uso: node scripts/seed_test_users.mjs
//
// Por quê UPDATE profiles em vez da RPC de convite: a Subetapa 01.2 não
// porta ainda as RPCs de convite de equipe (ver db/migrations/001_core_public.sql,
// "Escopo conscientemente adiado"). Service role bypassa RLS mas NÃO
// bypassa trigger — licensing.enforce_seat_limit_on_move ainda dispara,
// por isso o teto de assentos da conta de teste é elevado antes de mover
// os três papéis não-owner para dentro dela.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseEnvFile(filePath) {
  const text = readFileSync(filePath, "utf-8");
  const vars = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim();
  }
  return vars;
}

const rootEnv = parseEnvFile(path.resolve(__dirname, "../../.env"));
const testEnv = parseEnvFile(path.resolve(__dirname, "../.env.test"));

const url = rootEnv.SUPABASE__URL;
const serviceKey = rootEnv.SUPABASE_SERVICE_ROLE_KEY;
const password = testEnv.TEST_USER_PASSWORD;
const EMAILS = {
  owner: testEnv.TEST_OWNER_EMAIL,
  admin: testEnv.TEST_ADMIN_EMAIL,
  agent: testEnv.TEST_AGENT_EMAIL,
  viewer: testEnv.TEST_VIEWER_EMAIL,
};

for (const [k, v] of Object.entries({ url, serviceKey, password, ...EMAILS })) {
  if (!v) throw new Error(`Variável ausente: ${k} (conferir .env raiz e crm/.env.test)`);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function ensureUser(email) {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === email);
  if (existing) return existing.id;

  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  return data.user.id;
}

async function getProfile(userId) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, account_id, account_role")
    .eq("user_id", userId)
    .single();
  if (error) throw new Error(`profiles de ${userId} não encontrado (handle_new_user falhou?): ${error.message}`);
  return data;
}

async function main() {
  const userIds = {};
  for (const [role, email] of Object.entries(EMAILS)) {
    userIds[role] = await ensureUser(email);
    console.log(`usuário ${role}: ${email} -> ${userIds[role]}`);
  }

  const ownerProfile = await getProfile(userIds.owner);
  const accountId = ownerProfile.account_id;
  console.log(`conta de teste: ${accountId}`);

  // Teto de assentos: 4 papéis numa conta só, acima do padrão de fábrica (3).
  const { error: limitErr } = await admin
    .schema("licensing")
    .from("account_limits")
    .upsert({ account_id: accountId, max_users: 10 }, { onConflict: "account_id" });
  if (limitErr) throw new Error(`elevar teto de assentos: ${limitErr.message}`);

  for (const role of ["admin", "agent", "viewer"]) {
    const profile = await getProfile(userIds[role]);
    if (profile.account_id !== accountId || profile.account_role !== role) {
      const { error: moveErr } = await admin
        .from("profiles")
        .update({ account_id: accountId, account_role: role })
        .eq("id", profile.id);
      if (moveErr) throw new Error(`mover ${role} para a conta de teste: ${moveErr.message}`);

      // Limpa a conta pessoal órfã que handle_new_user criou no signup.
      await admin.from("accounts").delete().eq("owner_user_id", userIds[role]);
      console.log(`${role}: movido para a conta de teste.`);
    } else {
      console.log(`${role}: já está na conta de teste.`);
    }
  }

  console.log("\nFixture pronta:");
  console.log(JSON.stringify({ accountId, userIds }, null, 2));
}

main().catch((err) => {
  console.error("FALHA:", err.message);
  process.exit(1);
});
