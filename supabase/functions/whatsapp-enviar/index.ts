// ============================================================
// whatsapp-enviar — Edge Function que envia mensagem de texto pela
// Meta Cloud API (Subetapa 02.5)
//
// Só funciona dentro da janela de 24h de atendimento ao cliente (regra
// da própria Meta — mensagem livre fora da janela é rejeitada pela
// API com erro claro, que este endpoint repassa; envio de template
// fora da janela fica fora do escopo desta subetapa, docs/02 §5 já
// registra modelos_mensagem como pendência futura).
//
// account_id É REAFIRMADO NO FILTRO — esta função roda com
// service_role, que ignora RLS (achado A06 do portão adversarial da
// Subetapa 01.8, mesmo raciocínio do whatsapp-webhook).
//
// SEARCH-FIRST (CLAUDE.md §11): Graph API v26.0, mesma versão do
// whatsapp-webhook. Payload de envio portado de
// CRM_Maximus/src/lib/whatsapp/meta-api.ts:sendTextMessage
// (CLAUDE.md §14).
//
// CORS — chamado direto do client via supabase-js `functions.invoke`
// (preflight OPTIONS pelos headers authorization/apikey), ao contrário
// do whatsapp-webhook (server-a-server, nunca passa por CORS). Ver
// nota igual em whatsapp-configurar/index.ts.
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

/**
 * Nono dígito brasileiro — a Meta fala DUAS formas do mesmo número.
 *
 * Ela DEVOLVE o `wa_id` de celular brasileiro antigo sem o nono dígito
 * (`55` + DDD + 8 dígitos = 12), que é o que o webhook grava em
 * `contatos_canal.telefone` e, portanto, a forma canônica do banco. Mas
 * a lista de destinatários de teste (e o número que o cliente conhece)
 * guarda a forma discável, COM o nono dígito (13). Enviar usando o
 * `wa_id` cru bate em `131030 — Recipient phone number not in allowed
 * list`, medido ao vivo na Subetapa 02.5; enviar com 13 dígitos passa e
 * a própria Meta normaliza de volta para 12 no evento de status.
 *
 * Só mexe em celular: no Brasil o assinante de móvel começa em 6–9;
 * fixo (2–5) não leva nono dígito e passa intacto. Qualquer número que
 * não seja BR de 12 dígitos também passa intacto — a função é um no-op
 * fora do caso que ela existe para resolver.
 */
function normalizarTelefoneParaEnvio(telefone: string): string {
  const digitos = telefone.replace(/\D/g, "");
  if (!digitos.startsWith("55") || digitos.length !== 12) return digitos;
  const ddd = digitos.slice(2, 4);
  const assinante = digitos.slice(4);
  if (!/^[6-9]/.test(assinante)) return digitos;
  return `55${ddd}9${assinante}`;
}

/** Par de whatsapp-configurar.encrypt — mesmo formato, ver aquela função. */
async function decrypt(cifrado: string, chaveHex: string): Promise<string> {
  const partes = cifrado.split(":");
  if (partes.length !== 3) throw new Error("Formato de token cifrado inesperado");
  const [ivHex, ctHex, tagHex] = partes;
  const iv = hexToBytes(ivHex);
  const ciphertext = hexToBytes(ctHex);
  const tag = hexToBytes(tagHex);
  const combinado = new Uint8Array(ciphertext.length + tag.length);
  combinado.set(ciphertext, 0);
  combinado.set(tag, ciphertext.length);
  const chave = await crypto.subtle.importKey("raw", hexToBytes(chaveHex), { name: "AES-GCM" }, false, ["decrypt"]);
  const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, chave, combinado);
  return new TextDecoder().decode(plano);
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
  // Mesma régua de mensagens_insert (020_aba_messaging.sql): agent+ escreve.
  if (!["owner", "admin", "agent"].includes(perfil.account_role)) {
    return json({ error: "Papel sem permissão para enviar mensagem" }, 403);
  }

  let body: { conversa_id?: string; texto?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo inválido" }, 400);
  }
  const { conversa_id, texto } = body;
  if (!conversa_id || !texto?.trim()) {
    return json({ error: "conversa_id e texto são obrigatórios" }, 400);
  }

  const accountId = perfil.account_id as string;

  const { data: conversa, error: conversaErr } = await admin
    .schema("aba_messaging")
    .from("conversas")
    .select("id, contato_id")
    .eq("id", conversa_id)
    .eq("account_id", accountId)
    .maybeSingle();
  if (conversaErr || !conversa) return json({ error: "Conversa não encontrada" }, 404);

  const { data: contato, error: contatoErr } = await admin
    .schema("aba_messaging")
    .from("contatos_canal")
    .select("telefone")
    .eq("id", conversa.contato_id)
    .eq("account_id", accountId)
    .single();
  if (contatoErr || !contato) return json({ error: "Contato não encontrado" }, 404);

  const { data: config, error: configErr } = await admin
    .schema("aba_messaging")
    .from("configuracao_whatsapp")
    .select("id_numero_telefone, token_acesso_cifrado, status")
    .eq("account_id", accountId)
    .maybeSingle();
  if (configErr || !config || config.status !== "conectado") {
    return json({ error: "WhatsApp não conectado para esta conta" }, 400);
  }

  let accessToken: string;
  try {
    accessToken = await decrypt(config.token_acesso_cifrado, ENCRYPTION_KEY);
  } catch (err) {
    console.error("whatsapp-enviar: falha ao decifrar token", err);
    return json({ error: "Token de acesso corrompido — reconecte o WhatsApp" }, 500);
  }

  const destino = normalizarTelefoneParaEnvio(contato.telefone);
  console.log(`whatsapp-enviar: destino canonico=${contato.telefone} normalizado=${destino}`);

  const envio = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${config.id_numero_telefone}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: destino,
      type: "text",
      text: { body: texto },
    }),
  });

  if (!envio.ok) {
    const erro = await envio.json().catch(() => ({}));
    console.error("whatsapp-enviar: Meta recusou o envio", erro);
    return json({ error: erro?.error?.message ?? `Meta recusou o envio (${envio.status})` }, 400);
  }

  const dadosEnvio = await envio.json();
  const idExterno = dadosEnvio?.messages?.[0]?.id as string | undefined;

  const { data: mensagem, error: mensagemErr } = await admin
    .schema("aba_messaging")
    .from("mensagens")
    .insert({
      conversa_id,
      account_id: accountId,
      tipo_remetente: "agente",
      remetente_id: userData.user.id,
      tipo_conteudo: "texto",
      conteudo_texto: texto,
      id_mensagem_externa: idExterno ?? null,
      status: "enviada",
      provedor: "meta",
    })
    .select("*")
    .single();
  if (mensagemErr) {
    console.error("whatsapp-enviar: mensagem foi enviada pela Meta mas falhou ao gravar localmente", mensagemErr);
    return json({ error: "Mensagem enviada, mas houve falha ao registrar no CRM" }, 500);
  }

  await admin
    .schema("aba_messaging")
    .from("conversas")
    .update({ ultima_mensagem_texto: texto, ultima_mensagem_em: new Date().toISOString() })
    .eq("id", conversa_id)
    .eq("account_id", accountId);

  return json({ ok: true, mensagem });
});
