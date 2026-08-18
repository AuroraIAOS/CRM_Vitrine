// ============================================================
// whatsapp-configurar — Edge Function que conecta o WhatsApp da conta
// (Subetapa 02.5)
//
// Recebe phone_number_id + waba_id + access_token (colados pelo
// owner/admin na UI, nunca digitados por mim — CLAUDE.md §4), verifica
// as credenciais contra a Meta ANTES de salvar, cifra o token
// (AES-256-GCM, ENCRYPTION_KEY) e grava em
// aba_messaging.configuracao_whatsapp. O client NUNCA lê
// token_acesso_cifrado de volta — narrowing de coluna já revoga SELECT
// dessa coluna para `authenticated` desde 020_aba_messaging.sql.
//
// Formato de cifra idêntico ao CRM Maximus (src/lib/whatsapp/
// encryption.ts, CLAUDE.md §14 — portar a lógica, traduzir os nomes):
// `<iv-hex>:<ciphertext-hex>:<authTag-hex>` (AES-256-GCM). Reimplementado
// aqui com Web Crypto (Deno não tem o módulo `crypto` do Node) — mesmo
// formato textual, para o par cifrar/decifrar ficar auditável em um
// lugar só por par de função (esta grava, whatsapp-enviar lê).
//
// SEARCH-FIRST (CLAUDE.md §11): Graph API v26.0, mesma versão já
// confirmada e em uso no whatsapp-webhook (Subetapa 01.6/02.5).
//
// verify_jwt LIGADO (padrão) — ao contrário do whatsapp-webhook, este
// endpoint só atende usuário autenticado da própria conta.
//
// CORS — ao contrário do whatsapp-webhook (chamado servidor-a-servidor
// pela Meta, nunca pelo browser), este endpoint é chamado direto do
// client via supabase-js `functions.invoke`, que dispara preflight
// OPTIONS por causa dos headers `authorization`/`apikey` customizados.
// Sem tratar OPTIONS e sem Access-Control-Allow-*, o browser bloqueia a
// requisição antes de ela chegar aqui — sintoma: "Failed to send a
// request to the Edge Function" no client, sem log nenhum nesta função
// (achado real, Subetapa 02.5 — a UI chamou e nada apareceu no log).
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY") ?? "";
const META_API_VERSION = "v26.0";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  return bytes;
}
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function encrypt(texto: string, chaveHex: string): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", hexToBytes(chaveHex), { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifradoComTag = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, new TextEncoder().encode(texto)));
  // Web Crypto devolve ciphertext+tag concatenados (tag = últimos 16 bytes);
  // separa para o formato de 3 partes (iv:ct:tag) do Maximus.
  const ciphertext = cifradoComTag.slice(0, cifradoComTag.length - 16);
  const tag = cifradoComTag.slice(cifradoComTag.length - 16);
  return `${bytesToHex(iv)}:${bytesToHex(ciphertext)}:${bytesToHex(tag)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return json({ error: "Não autenticado" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Sessão inválida" }, 401);

  const { data: perfil, error: perfilErr } = await admin
    .from("profiles")
    .select("account_id, account_role")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (perfilErr || !perfil) return json({ error: "Perfil não encontrado" }, 403);
  if (!["owner", "admin"].includes(perfil.account_role)) {
    return json({ error: "Só owner/admin pode conectar o WhatsApp da conta" }, 403);
  }

  let body: { phone_number_id?: string; waba_id?: string; access_token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo inválido" }, 400);
  }
  const { phone_number_id, waba_id, access_token } = body;
  if (!phone_number_id || !access_token) {
    return json({ error: "phone_number_id e access_token são obrigatórios" }, 400);
  }

  // Verifica as credenciais contra a Meta ANTES de salvar (mesmo padrão do Maximus).
  const verificacao = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${phone_number_id}?fields=id,display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${access_token}` } },
  );
  if (!verificacao.ok) {
    const erro = await verificacao.json().catch(() => ({}));
    return json({ error: `A Meta recusou as credenciais: ${erro?.error?.message ?? verificacao.status}` }, 400);
  }
  const infoTelefone = await verificacao.json();

  // Impede duas contas reivindicando o mesmo número (mesmo raciocínio do
  // Maximus — webhook resolve por id_numero_telefone, e essa coluna já é
  // UNIQUE no banco; checagem aqui só dá uma mensagem de erro legível
  // em vez de estourar a constraint.
  const { data: reivindicado } = await admin
    .schema("aba_messaging")
    .from("configuracao_whatsapp")
    .select("account_id")
    .eq("id_numero_telefone", phone_number_id)
    .neq("account_id", perfil.account_id)
    .maybeSingle();
  if (reivindicado) {
    return json({ error: "Este número já está conectado a outra conta." }, 409);
  }

  // Assina a WABA a este app — idempotente, best-effort (não bloqueia o
  // save; número de teste da Meta já vem pré-assinado).
  let assinaturaWaba: unknown = null;
  if (waba_id) {
    try {
      const respAssinatura = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${waba_id}/subscribed_apps`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}` },
      });
      assinaturaWaba = await respAssinatura.json().catch(() => ({ status: respAssinatura.status }));
      console.log("whatsapp-configurar: subscribed_apps ->", JSON.stringify(assinaturaWaba));
    } catch (err) {
      console.error("whatsapp-configurar: subscribed_apps falhou (rede)", err);
    }
  }

  const tokenCifrado = await encrypt(access_token, ENCRYPTION_KEY);

  const { error: upsertErr } = await admin
    .schema("aba_messaging")
    .from("configuracao_whatsapp")
    .upsert(
      {
        account_id: perfil.account_id,
        id_numero_telefone: phone_number_id,
        id_waba: waba_id || null,
        token_acesso_cifrado: tokenCifrado,
        status: "conectado",
        conectado_em: new Date().toISOString(),
      },
      { onConflict: "account_id" },
    );
  if (upsertErr) {
    console.error("whatsapp-configurar: falha ao salvar configuração", upsertErr);
    return json({ error: "Falha ao salvar configuração" }, 500);
  }

  return json({
    ok: true,
    display_phone_number: infoTelefone.display_phone_number,
    verified_name: infoTelefone.verified_name,
    diagnostico_assinatura_waba: assinaturaWaba,
  });
});
