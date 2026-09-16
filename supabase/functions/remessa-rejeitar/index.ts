// =====================================================================
// remessa-rejeitar — rejeita a remessa da caixa de entrada e apaga os
// bytes do bucket (Subetapa 03.11, decisão de Max de 2026-09-16,
// `docs/02` §14.4)
//
// POR QUE EDGE FUNCTION: o banco não apaga `storage.objects` por SQL
// (`42501`, `handoffs/instrucoes.md` §5) — só a API do Storage apaga. As
// duas camadas do "rejeitado não deixa resíduo legível":
//   1. A REJEIÇÃO roda como o próprio usuário (client com o Authorization
//      dele): quem decide se pode é `processar_remessa_externa`, com conta
//      ativa, `pode_acessar` e `log_acesso`. No mesmo instante, a policy do
//      bucket deixa de servir o arquivo.
//   2. O EXPURGO roda com `service_role`, que só apaga o que o banco
//      devolve como rejeitado e ainda não expurgado — nunca um caminho
//      vindo do corpo da requisição.
//
// `verify_jwt` LIGADO (padrão). O corpo é `{ remessa_id, motivo }`.
// =====================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BUCKET = "remessas-externas";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ORIGENS_PERMITIDAS = [
  "https://vitrine.strategicepiphany.com",
  "http://localhost:3000",
  "http://localhost:5173",
];

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "aba_health" },
});

function cabecalhosCors(req: Request): Record<string, string> {
  const origem = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS_PERMITIDAS.includes(origem) ? origem : ORIGENS_PERMITIDAS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Vary": "Origin",
  };
}

function json(req: Request, corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhosCors(req), "Content-Type": "application/json" },
  });
}

// Apaga do bucket e carimba. Objeto que já não existe conta como apagado:
// o que importa é não haver bytes, e o `remove` não acusa ausência.
async function expurgar(remessaId: string, caminho: string): Promise<boolean> {
  const { error } = await admin.storage.from(BUCKET).remove([caminho]);
  if (error) {
    console.error(JSON.stringify({ evento: "remessa_rejeitar", desfecho: "falha_expurgo" }));
    return false;
  }
  const { data, error: erroMarca } = await admin.rpc("marcar_remessa_expurgada", { p_remessa_id: remessaId });
  return !erroMarca && data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cabecalhosCors(req) });
  if (req.method !== "POST") return json(req, { ok: false, erro: "Método não permitido" }, 405);

  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json(req, { ok: false, erro: "Sessão ausente." }, 401);

  let corpo: { remessa_id?: unknown; motivo?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return json(req, { ok: false, erro: "Corpo inválido." }, 400);
  }
  const remessaId = typeof corpo.remessa_id === "string" ? corpo.remessa_id.toLowerCase() : "";
  const motivo = typeof corpo.motivo === "string" ? corpo.motivo : "";
  if (!UUID.test(remessaId)) return json(req, { ok: false, erro: "Remessa inválida." }, 400);

  // Camada 1: a decisão é do banco, como o usuário.
  const comoUsuario = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
    db: { schema: "aba_health" },
  });
  const { data, error } = await comoUsuario.rpc("processar_remessa_externa", {
    p_remessa_id: remessaId,
    p_para: "rejeitada",
    p_motivo: motivo,
  });
  if (error) {
    console.log(JSON.stringify({ evento: "remessa_rejeitar", desfecho: "recusada", codigo: error.code }));
    return json(req, { ok: false, erro: error.message, codigo: error.code });
  }

  // Camada 2: os bytes saem. Primeiro a desta remessa, depois a varredura
  // de rejeitadas que ficaram para trás (RPC chamada sem esta função, ou
  // expurgo que falhou antes).
  const linha = Array.isArray(data) ? data[0] : null;
  let expurgada = false;
  if (linha?.arquivo_caminho) expurgada = await expurgar(remessaId, linha.arquivo_caminho);

  const { data: pendentes } = await admin.rpc("remessas_rejeitadas_por_expurgar", { p_limite: 20 });
  for (const p of (pendentes ?? []) as { remessa_id: string; arquivo_caminho: string }[]) {
    await expurgar(p.remessa_id, p.arquivo_caminho);
  }

  console.log(JSON.stringify({ evento: "remessa_rejeitar", desfecho: expurgada ? "rejeitada_expurgada" : "rejeitada_sem_expurgo" }));
  return json(req, { ok: true, status: "rejeitada", arquivo_expurgado: expurgada });
});
