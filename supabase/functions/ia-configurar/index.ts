// ============================================================
// ia-configurar — Edge Function que guarda a chave de IA da conta
// (Subetapa 02.11)
//
// BRING-YOUR-OWN-KEY (docs/01_ARQUITETURA.md §2, CLAUDE.md §4): não
// existe chave global de LLM no `.env` deste projeto. Cada conta cola a
// própria chave, ela é **verificada contra o provedor antes de salvar**,
// cifrada (AES-256-GCM com ENCRYPTION_KEY) e gravada em
// `aba_ai.ia_configuracoes.chave_api`. O client nunca a lê de volta:
// `SELECT` dessa coluna está revogado para `authenticated` desde a
// migration 022 (achado A05 do portão adversarial da Subetapa 01.8).
//
// Formato de cifra idêntico ao de `whatsapp-configurar` (Subetapa 02.5)
// e ao do CRM Maximus: `<iv-hex>:<ciphertext-hex>:<authTag-hex>`. Portar
// a lógica, não reinventá-la (CLAUDE.md §14) — um segundo formato de
// cifra no mesmo produto significa duas superfícies para auditar e duas
// para errar.
//
// A CHAVE NUNCA VOLTA, NEM PARA QUEM A COLOU. A resposta devolve só o
// sufixo de 4 caracteres, para a tela poder dizer "termina em ...ab12" e
// o operador reconhecer qual chave está lá sem que ela transite de novo.
//
// verify_jwt LIGADO (padrão) e `admin+` exigido: a policy de
// `ia_configuracoes` já exige `admin` para escrever, e aqui a checagem é
// repetida à mão porque esta função usa `service_role` para gravar —
// onde service_role escreve, a RLS não protege nada (achado A06 da 01.8).
//
// CORS explícito — chamada do browser por `functions.invoke` dispara
// preflight OPTIONS; sem isto o erro que chega ao client é o genérico
// "Failed to send a request to the Edge Function", sem log nenhum aqui
// (armadilha medida na Subetapa 02.5).
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY") ?? "";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
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
  const cifradoComTag = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, new TextEncoder().encode(texto)),
  );
  const ciphertext = cifradoComTag.slice(0, cifradoComTag.length - 16);
  const tag = cifradoComTag.slice(cifradoComTag.length - 16);
  return `${bytesToHex(iv)}:${bytesToHex(ciphertext)}:${bytesToHex(tag)}`;
}

/**
 * Verifica a chave contra o provedor ANTES de gravar. Uma chave inválida
 * guardada só é descoberta na primeira conversa real com um cliente —
 * que é o pior momento possível para descobrir. Mesmo princípio do
 * `whatsapp-configurar`, que confere as credenciais contra a Meta antes
 * de salvar.
 *
 * Usa o endpoint mais barato de cada provedor (listar modelos), não uma
 * geração: verificar credencial não deve consumir cota de quem está
 * apenas configurando.
 */
async function verificarChave(provedor: string, chave: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    if (provedor === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/models?limit=1", {
        headers: { "x-api-key": chave, "anthropic-version": "2023-06-01" },
      });
      if (r.ok) return { ok: true };
      const corpo = await r.json().catch(() => ({}));
      return { ok: false, erro: corpo?.error?.message ?? `HTTP ${r.status}` };
    }

    if (provedor === "openrouter") {
      // `/api/v1/key` devolve os dados da própria chave — é o endpoint
      // natural de verificação, e não consome cota de geração.
      const r = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${chave}` },
      });
      if (r.ok) return { ok: true };
      const corpo = await r.json().catch(() => ({}));
      return { ok: false, erro: corpo?.error?.message ?? `HTTP ${r.status}` };
    }

    const r = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${chave}` },
    });
    if (r.ok) return { ok: true };
    const corpo = await r.json().catch(() => ({}));
    return { ok: false, erro: corpo?.error?.message ?? `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "falha de rede ao verificar a chave" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  if (!ENCRYPTION_KEY) {
    // Falha fechada: sem chave de cifra, gravar em texto puro seria pior
    // que não gravar (CLAUDE.md §4).
    return json({ error: "ENCRYPTION_KEY não configurada no ambiente da função" }, 500);
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return json({ error: "Não autenticado" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Sessão inválida" }, 401);

  const { data: perfil, error: perfilErr } = await admin
    .from("profiles")
    .select("account_id, account_role")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (perfilErr || !perfil) return json({ error: "Perfil não encontrado" }, 403);
  if (!["owner", "admin"].includes(perfil.account_role)) {
    return json({ error: "Só owner/admin pode configurar a chave de IA da conta" }, 403);
  }

  let body: { provedor?: string; modelo?: string; chave_api?: string; prompt_sistema?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo inválido" }, 400);
  }

  const provedor = body.provedor;
  const modelo = body.modelo;
  const chaveApi = body.chave_api;

  if (provedor !== "anthropic" && provedor !== "openai" && provedor !== "openrouter") {
    return json({ error: "provedor deve ser 'anthropic', 'openai' ou 'openrouter'" }, 400);
  }
  if (!modelo) return json({ error: "modelo é obrigatório" }, 400);
  if (!chaveApi) return json({ error: "chave_api é obrigatória" }, 400);

  const verificacao = await verificarChave(provedor, chaveApi);
  if (!verificacao.ok) {
    return json({ error: `O provedor recusou a chave: ${verificacao.erro}` }, 400);
  }

  const cifrada = await encrypt(chaveApi, ENCRYPTION_KEY);

  // `account_id` é UNIQUE em ia_configuracoes — uma configuração por
  // conta. O upsert por essa coluna deixa reconfigurar (trocar chave ou
  // modelo) sem apagar o resto do comportamento já ajustado.
  const { error: upsertErr } = await admin
    .schema("aba_ai")
    .from("ia_configuracoes")
    .upsert(
      {
        account_id: perfil.account_id,
        criado_por: userData.user.id,
        provedor,
        modelo,
        chave_api: cifrada,
        ...(body.prompt_sistema !== undefined ? { prompt_sistema: body.prompt_sistema } : {}),
      },
      { onConflict: "account_id" },
    );
  if (upsertErr) return json({ error: `Falha ao gravar: ${upsertErr.message}` }, 500);

  // Só o sufixo volta — nunca a chave. Serve para a tela dizer qual
  // chave está guardada sem que ela transite outra vez pela rede.
  return json({
    ok: true,
    provedor,
    modelo,
    chave_final: chaveApi.slice(-4),
  });
});
