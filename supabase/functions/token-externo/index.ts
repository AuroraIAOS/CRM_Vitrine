// =====================================================================
// Edge Function: token-externo (Subetapa 03.10)
//
// PORTE de `receber-remessa` do CRM Sindcom (`CLAUDE.md` §14): o endpoint
// PÚBLICO, sem login, por onde alguém de fora da clínica usa o link que
// ela emitiu (`aba_health.emitir_concessao_externa`). Mesma classe de risco
// do `whatsapp-webhook` — e, diferente dele, serve dado clínico.
//
// DUAS AÇÕES, as duas pelo mesmo freio:
//   GET   → o link vale? devolve clínica, finalidade e prazo. Nada do paciente.
//   POST  → recebe UM arquivo (multipart, campo `arquivo`), guarda no bucket
//           privado `remessas-externas` e grava a remessa imutável.
//
// O TOKEN VIAJA NO CABEÇALHO `x-token-externo`, nunca na URL: a query
// string entra nos logs de acesso da plataforma em texto puro — medido com
// o `hub.verify_token` da Meta (`instrucoes.md` §5). A página pública lê o
// token do próprio endereço dela e o repassa por cabeçalho.
//
// ORDEM DAS GUARDAS (`instrucoes.md` §6, achado F03 da 02.15): método →
// token (a autenticação daqui) → freio → arquivo → efeito. Nenhuma
// verificação de configuração acontece antes de o token ser avaliado.
//
// O QUE ELA NUNCA FAZ
//   · Não decide nada sobre o token: avaliação, freio, consumo e registro
//     de tentativa moram no banco (`aba_health.*_token_externo`), numa
//     transação, e voltam como DADO. Recusa é `{ok:false}` com HTTP 200 —
//     exceção no caminho de negócio levaria o registro do freio junto.
//   · Não confia no navegador sobre o arquivo: o tipo é detectado pelos
//     bytes, e é o detectado que vai ao Storage — que recusa de novo, por
//     conta própria (`allowed_mime_types`, `file_size_limit`).
//   · Não escreve fora da conta da concessão: `account_id` sai do banco,
//     pelo hash do token, e o banco confere o caminho do objeto.
//   · Não lista nem lê o bucket. Quem tem o link só envia.
//
// service_role só existe DENTRO desta função, pela variável que o Supabase
// injeta. verify_jwt DESLIGADO de propósito (quem chama não tem sessão).
// =====================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "aba_health" },
});

const BUCKET = "remessas-externas";
const TAMANHO_MAXIMO = 20 * 1024 * 1024; // o bucket impõe o mesmo (059 §8)

const ORIGENS_PERMITIDAS = [
  "https://vitrine.strategicepiphany.com",
  "http://localhost:3000",
  "http://localhost:5173",
];

function cabecalhosCors(req: Request): Record<string, string> {
  const origem = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS_PERMITIDAS.includes(origem) ? origem : ORIGENS_PERMITIDAS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-token-externo",
    "Vary": "Origin",
  };
}

function json(req: Request, corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", ...cabecalhosCors(req) },
  });
}

// Mensagens para quem abriu o link. Expirado e revogado dizem o que houve:
// quem os recebe já tinha o link, e saber o motivo é o que o faz pedir outro.
const MENSAGEM: Record<string, string> = {
  token_ausente: "Link inválido.",
  token_inexistente: "Link inválido.",
  token_expirado: "Este link expirou. Peça um novo à clínica.",
  token_revogado: "Este link foi cancelado pela clínica. Peça um novo.",
  token_consumido: "Este link já foi usado. Peça um novo à clínica.",
  freado: "Muitas tentativas com este link. Aguarde 15 minutos e tente de novo.",
  arquivo_ausente: "Nenhum arquivo foi anexado.",
  arquivo_invalido: "Envie um PDF, JPG ou PNG de até 20 MB.",
  finalidade_incompativel: "Este link não recebe arquivos.",
  falha_upload: "Não foi possível guardar o arquivo. Tente de novo em alguns minutos.",
  falha_registro: "Não foi possível registrar o envio. Tente de novo.",
};

// Uma linha por desfecho no log da plataforma: método e motivo, NUNCA o
// token nem identificador — o rastro completo (hash, concessão, IP) mora
// em `aba_health.tentativas_token_externo`, que só o servidor lê.
function registrarDesfecho(req: Request, desfecho: string) {
  console.log(JSON.stringify({ evento: "token_externo", metodo: req.method, desfecho }));
}

function recusa(req: Request, motivo: string) {
  registrarDesfecho(req, motivo);
  return json(req, { ok: false, motivo, erro: MENSAGEM[motivo] ?? "Não foi possível concluir." });
}

/** IP de quem chamou (primeiro salto do x-forwarded-for). Inválido vira null. */
function ipDaRequisicao(req: Request): string | null {
  const bruto = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "").trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(bruto) ? bruto : null;
}

/** Tipo pelo conteúdo. Extensão e content-type do navegador não contam. */
function detectarTipo(b: Uint8Array): { mime: string; ext: string } | null {
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) {
    return { mime: "application/pdf", ext: "pdf" }; // %PDF-
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length >= 8 && png.every((v, i) => b[i] === v)) {
    return { mime: "image/png", ext: "png" };
  }
  return null;
}

async function sha256Hex(b: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", b));
  return Array.from(d, (x) => x.toString(16).padStart(2, "0")).join("");
}

type Resolucao = {
  ok: boolean;
  motivo?: string;
  concessao_id?: string;
  account_id?: string;
  finalidade?: string;
  clinica?: string;
  expira_em?: string;
  usos_restantes?: number | null;
  aceita_arquivo?: boolean;
};

async function registrarRecusa(token: string, motivo: string, ip: string | null, ua: string | null) {
  const { error } = await admin.rpc("registrar_recusa_token_externo", {
    p_token: token, p_motivo: motivo, p_ip: ip, p_user_agent: ua,
  });
  if (error) console.error("registrar_recusa_token_externo:", error.message);
}

Deno.serve(async (req: Request) => {
  // ------------------------------------------------------------ método
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cabecalhosCors(req) });
  if (req.method !== "GET" && req.method !== "POST") {
    return json(req, { ok: false, erro: "Método não permitido" }, 405);
  }

  const ip = ipDaRequisicao(req);
  const ua = req.headers.get("user-agent");

  // ------------------------------------------------------------- token
  const token = (req.headers.get("x-token-externo") ?? "").trim();
  if (!token) return recusa(req, "token_ausente");

  const { data, error } = await admin.rpc("resolver_token_externo", {
    p_token: token, p_metodo: req.method, p_ip: ip, p_user_agent: ua,
  });
  if (error) {
    console.error("resolver_token_externo:", error.message);
    return json(req, { ok: false, erro: "Falha ao validar o link. Tente de novo." });
  }
  const r = data as Resolucao;
  if (!r.ok) return recusa(req, r.motivo ?? "token_inexistente");

  // ---------------------------------------------------------- consulta
  if (req.method === "GET") {
    registrarDesfecho(req, "valido");
    return json(req, {
      ok: true,
      clinica: r.clinica,
      finalidade: r.finalidade,
      expira_em: r.expira_em,
      usos_restantes: r.usos_restantes,
      aceita_arquivo: r.aceita_arquivo,
    });
  }

  // ---------------------------------------------------------- recepção
  if (!r.aceita_arquivo) {
    await registrarRecusa(token, "finalidade_incompativel", ip, ua);
    return recusa(req, "finalidade_incompativel");
  }

  // Corpo declarado grande demais nem é lido.
  const declarado = Number(req.headers.get("content-length") ?? "0");
  if (declarado > TAMANHO_MAXIMO + 64 * 1024) {
    await registrarRecusa(token, "arquivo_invalido", ip, ua);
    return recusa(req, "arquivo_invalido");
  }

  let formulario: FormData;
  try {
    formulario = await req.formData();
  } catch {
    await registrarRecusa(token, "arquivo_ausente", ip, ua);
    return recusa(req, "arquivo_ausente");
  }

  const arquivo = formulario.get("arquivo");
  if (!(arquivo instanceof File)) {
    await registrarRecusa(token, "arquivo_ausente", ip, ua);
    return recusa(req, "arquivo_ausente");
  }

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = bytes.length > 0 && bytes.length <= TAMANHO_MAXIMO ? detectarTipo(bytes) : null;
  if (!tipo) {
    await registrarRecusa(token, "arquivo_invalido", ip, ua);
    return recusa(req, "arquivo_invalido");
  }

  // O caminho sai do banco (conta e concessão) e o próprio banco confere
  // de novo ao gravar a remessa.
  const caminho = `conta-${r.account_id}/concessao-${r.concessao_id}/${crypto.randomUUID()}.${tipo.ext}`;
  const { error: erroUpload } = await admin.storage.from(BUCKET).upload(caminho, bytes, {
    contentType: tipo.mime,
    upsert: false,
  });
  if (erroUpload) {
    console.error("upload:", erroUpload.message);
    await registrarRecusa(token, "falha_upload", ip, ua);
    return recusa(req, "falha_upload");
  }

  const { data: gravado, error: erroRemessa } = await admin.rpc("registrar_remessa_externa", {
    p_token: token,
    p_caminho: caminho,
    p_mime: tipo.mime,
    p_tamanho: bytes.length,
    p_sha256_hex: await sha256Hex(bytes),
    p_nome_original: arquivo.name,
    p_ip: ip,
    p_user_agent: ua,
  });

  const resultado = gravado as { ok: boolean; motivo?: string; remessa_id?: string } | null;
  if (erroRemessa || !resultado?.ok) {
    // O objeto já subiu; sem a linha ele seria órfão no bucket.
    await admin.storage.from(BUCKET).remove([caminho]);
    if (erroRemessa) {
      console.error("registrar_remessa_externa:", erroRemessa.message);
      await registrarRecusa(token, "falha_registro", ip, ua);
      return recusa(req, "falha_registro");
    }
    return recusa(req, resultado?.motivo ?? "falha_registro");
  }

  registrarDesfecho(req, "valido");
  return json(req, {
    ok: true,
    remessa_id: resultado.remessa_id,
    mensagem: "Recebemos o arquivo. A clínica confere antes de juntá-lo ao prontuário.",
  });
});
