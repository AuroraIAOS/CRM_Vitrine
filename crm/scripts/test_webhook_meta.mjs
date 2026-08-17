// scripts/test_webhook_meta.mjs — evidência da Subetapa 01.6: prova
// que o webhook da Meta recusa requisição não assinada e aceita
// payload assinado corretamente, persistindo a mensagem de teste.
//
// Lê META_APP_SECRET/META_WEBHOOK_VERIFY_TOKEN do .env da raiz em
// tempo de execução — o valor nunca é impresso, só usado para calcular
// a assinatura HMAC-SHA256 que a rota espera. Mesmo padrão de
// scripts/seed_test_users.mjs (nunca roda em CI, só local, contra o
// projeto Supabase real).
//
// Uso: node scripts/test_webhook_meta.mjs
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
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

const SUPABASE_URL = rootEnv.SUPABASE__URL;
const SERVICE_ROLE_KEY = rootEnv.SUPABASE_SERVICE_ROLE_KEY;
const META_APP_SECRET = rootEnv.META_APP_SECRET;
const META_WEBHOOK_VERIFY_TOKEN = rootEnv.META_WEBHOOK_VERIFY_TOKEN;
const TEST_OWNER_EMAIL = testEnv.TEST_OWNER_EMAIL;
const TEST_PASSWORD = testEnv.TEST_USER_PASSWORD;

for (const [k, v] of Object.entries({
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  META_APP_SECRET,
  META_WEBHOOK_VERIFY_TOKEN,
  TEST_OWNER_EMAIL,
  TEST_PASSWORD,
})) {
  if (!v) throw new Error(`Variável ausente: ${k} (conferir .env raiz e crm/.env.test)`);
}

const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

function assinar(corpo) {
  return "sha256=" + createHmac("sha256", META_APP_SECRET).update(corpo, "utf8").digest("hex");
}

let falhas = 0;
function afirmar(condicao, mensagem) {
  if (condicao) {
    console.log(`  OK   ${mensagem}`);
  } else {
    console.error(`  FALHOU  ${mensagem}`);
    falhas++;
  }
}

async function main() {
  const { data: ownerProfile, error: profileErr } = await admin
    .from("profiles")
    .select("account_id")
    .eq("email", TEST_OWNER_EMAIL)
    .single();
  if (profileErr) throw new Error(`perfil de teste não encontrado: ${profileErr.message}. Rode seed_test_users.mjs antes.`);
  const accountId = ownerProfile.account_id;

  const phoneNumberId = `teste-01.6-${Date.now()}`;
  const wamid = `wamid.TESTE01.6.${Date.now()}`;
  const waId = "5511999990000";

  console.log(`Conta de teste: ${accountId}`);
  console.log(`Edge Function: ${WEBHOOK_URL}\n`);

  // Fixture: configuracao_whatsapp apontando para um phone_number_id
  // fictício — é assim que o webhook resolve a conta a partir do
  // payload, sem depender de número real da Meta.
  const { error: configErr } = await admin.schema("aba_messaging").from("configuracao_whatsapp").insert({
    account_id: accountId,
    id_numero_telefone: phoneNumberId,
    token_acesso_cifrado: "placeholder-nao-e-segredo-real",
  });
  if (configErr) throw new Error(`fixture configuracao_whatsapp: ${configErr.message}`);

  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "id-waba-teste",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: waId, phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: "Contato Fictício 01.6" }, wa_id: waId }],
              messages: [
                {
                  from: waId,
                  id: wamid,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: "Mensagem de teste da Subetapa 01.6" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const corpo = JSON.stringify(payload);

  try {
    console.log("1. GET handshake com hub.verify_token CORRETO");
    const urlOk = new URL(WEBHOOK_URL);
    urlOk.searchParams.set("hub.mode", "subscribe");
    urlOk.searchParams.set("hub.verify_token", META_WEBHOOK_VERIFY_TOKEN);
    urlOk.searchParams.set("hub.challenge", "desafio-123");
    const respGetOk = await fetch(urlOk.toString());
    afirmar(respGetOk.status === 200, `status 200 (recebido: ${respGetOk.status})`);
    const corpoDesafio = await respGetOk.text();
    afirmar(corpoDesafio === "desafio-123", `corpo ecoa o hub.challenge (recebido: "${corpoDesafio}")`);

    console.log("\n2. GET handshake com hub.verify_token ERRADO");
    const urlBad = new URL(WEBHOOK_URL);
    urlBad.searchParams.set("hub.mode", "subscribe");
    urlBad.searchParams.set("hub.verify_token", "token-errado-de-proposito");
    urlBad.searchParams.set("hub.challenge", "nao-deveria-aparecer");
    const respGetBad = await fetch(urlBad.toString());
    afirmar(respGetBad.status === 403, `status 403 (recebido: ${respGetBad.status})`);

    console.log("\n3. POST SEM assinatura — deve ser REJEITADO");
    const respSemAssinatura = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: corpo,
    });
    afirmar(respSemAssinatura.status === 401, `status 401 (recebido: ${respSemAssinatura.status})`);

    console.log("\n4. POST com assinatura INVÁLIDA — deve ser REJEITADO");
    const respAssinaturaErrada = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": "sha256=" + "0".repeat(64),
      },
      body: corpo,
    });
    afirmar(respAssinaturaErrada.status === 401, `status 401 (recebido: ${respAssinaturaErrada.status})`);

    console.log("\n5. POST com assinatura VÁLIDA — deve ser ACEITO e a mensagem persistida");
    const assinaturaValida = assinar(corpo);
    const respValida = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-signature-256": assinaturaValida },
      body: corpo,
    });
    afirmar(respValida.status === 200, `status 200 (recebido: ${respValida.status})`);

    // Dá um instante para o Edge Function terminar de escrever.
    await new Promise((r) => setTimeout(r, 1500));

    const { data: mensagem, error: mensagemErr } = await admin
      .schema("aba_messaging")
      .from("mensagens")
      .select("id, conteudo_texto, tipo_remetente, status")
      .eq("id_mensagem_externa", wamid)
      .maybeSingle();
    afirmar(!mensagemErr && !!mensagem, `mensagem gravada em aba_messaging.mensagens (erro: ${mensagemErr?.message ?? "nenhum"})`);
    if (mensagem) {
      afirmar(mensagem.conteudo_texto === "Mensagem de teste da Subetapa 01.6", "conteudo_texto bate com o payload");
      afirmar(mensagem.tipo_remetente === "cliente", "tipo_remetente = cliente");
    }

    const { data: contato } = await admin
      .schema("aba_messaging")
      .from("contatos_canal")
      .select("id, nome, telefone")
      .eq("account_id", accountId)
      .eq("telefone", waId)
      .maybeSingle();
    afirmar(!!contato, "contato_canal criado via upsert do webhook");

    const { data: evento } = await admin
      .schema("aba_messaging")
      .from("eventos_provedor")
      .select("id")
      .eq("account_id", accountId)
      .eq("id_externo", wamid)
      .maybeSingle();
    afirmar(!!evento, "evento bruto gravado em eventos_provedor (idempotência)");

    console.log("\n6. Reenvio do MESMO evento (retry da Meta) — idempotência, não deve duplicar mensagem");
    const respReenvio = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-signature-256": assinaturaValida },
      body: corpo,
    });
    afirmar(respReenvio.status === 200, `status 200 no reenvio (recebido: ${respReenvio.status})`);
    await new Promise((r) => setTimeout(r, 1000));
    const { count } = await admin
      .schema("aba_messaging")
      .from("mensagens")
      .select("id", { count: "exact", head: true })
      .eq("id_mensagem_externa", wamid);
    afirmar(count === 1, `ainda existe exatamente 1 mensagem com este id_mensagem_externa (recebido: ${count})`);

    // Limpeza.
    if (contato) {
      await admin.schema("aba_messaging").from("mensagens").delete().eq("conteudo_texto", "Mensagem de teste da Subetapa 01.6");
      await admin.schema("aba_messaging").from("conversas").delete().eq("contato_id", contato.id);
      await admin.schema("aba_messaging").from("contatos_canal").delete().eq("id", contato.id);
    }
    await admin.schema("aba_messaging").from("eventos_provedor").delete().eq("account_id", accountId).eq("id_externo", wamid);
    await admin.schema("aba_messaging").from("configuracao_whatsapp").delete().eq("id_numero_telefone", phoneNumberId);
  } finally {
    // Garantia de limpeza mesmo se alguma asserção lançar antes.
    await admin.schema("aba_messaging").from("configuracao_whatsapp").delete().eq("id_numero_telefone", phoneNumberId);
  }

  console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : `${falhas} TESTE(S) FALHARAM`}`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("ERRO FATAL:", err.message);
  process.exit(1);
});
