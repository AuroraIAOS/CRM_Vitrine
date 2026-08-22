// ============================================================
// ia-responder — Edge Function que faz o agente responder (02.11)
//
// Decifra a chave da conta, recupera trechos da base de conhecimento,
// chama o provedor escolhido pela conta e grava uma linha em
// `aba_ai.ia_log_uso`. Devolve o texto e o consumo.
//
// POR QUE A CHAVE É DECIFRADA AQUI E EM NENHUM OUTRO LUGAR
// `chave_api` é ilegível para `authenticated` (migration 022) e a
// ENCRYPTION_KEY só existe no ambiente das Edge Functions. Decifrar no
// navegador exigiria mandar a chave de cifra para lá, o que anularia a
// cifra inteira. O par cifrar/decifrar fica auditável em dois arquivos:
// `ia-configurar` grava, este lê.
//
// A CHAVE NUNCA APARECE NA RESPOSTA NEM NO LOG. `ia_log_uso` guarda
// provedor, modelo e contagem de tokens — nada de conteúdo de mensagem e
// nada de credencial.
//
// SEARCH-FIRST (CLAUDE.md §11): SDK oficial `@anthropic-ai/sdk` 0.117.1
// (versão confirmada no registro npm nesta sessão, não presumida de
// memória) para o provedor `anthropic`; API REST oficial da OpenAI para
// o provedor `openai`. Nada de shim "compatível com OpenAI" para falar
// com a Anthropic — são contratos diferentes e o shim esconde a
// diferença até ela quebrar.
//
// `thinking` NÃO é enviado de propósito: o modelo é escolhido pela conta
// e pode ser qualquer um dos dois provedores, inclusive versões antigas
// que rejeitam o parâmetro com 400. Atendimento fundamentado em base de
// conhecimento também não é a carga de trabalho que justifica raciocínio
// estendido. Quando o produto fixar um conjunto de modelos suportados,
// é aqui que a decisão muda.
//
// `max_tokens` deliberadamente curto (1024): a saída vai virar mensagem
// de WhatsApp. Resposta longa aqui não é qualidade, é problema de
// produto — e o teto também protege a fatura de quem colou a chave.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.117.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY") ?? "";

const MAX_TOKENS_RESPOSTA = 1024;
const TRECHOS_DE_CONTEXTO = 4;

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

async function decrypt(cifrado: string, chaveHex: string): Promise<string> {
  const partes = cifrado.split(":");
  if (partes.length !== 3) throw new Error("Formato de chave cifrada inesperado");
  const [ivHex, ctHex, tagHex] = partes;
  const ciphertext = hexToBytes(ctHex);
  const tag = hexToBytes(tagHex);
  const combinado = new Uint8Array(ciphertext.length + tag.length);
  combinado.set(ciphertext, 0);
  combinado.set(tag, ciphertext.length);
  const chave = await crypto.subtle.importKey("raw", hexToBytes(chaveHex), { name: "AES-GCM" }, false, ["decrypt"]);
  const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: hexToBytes(ivHex) }, chave, combinado);
  return new TextDecoder().decode(plano);
}

type Configuracao = {
  provedor: "anthropic" | "openai" | "openrouter";
  modelo: string;
  chave_api: string;
  prompt_sistema: string | null;
  ativo: boolean;
  pode_consultar_horarios: boolean;
  pode_criar_agendamento: boolean;
  pode_ler_prontuario: boolean;
  pode_conceder_desconto: boolean;
  horario_atuacao: string | null;
};

/**
 * Monta as instruções do agente. Os interruptores da tela `1l` viram
 * texto explícito aqui — é o que eles significam nesta versão, e está
 * declarado como tal na migration 028.
 *
 * A linha do prontuário é escrita SEMPRE como proibição, independente da
 * configuração, porque o dado clínico nunca entra no contexto: a função
 * não lê `aba_health`. A instrução existe para o agente não prometer ao
 * cliente algo que ele não pode fazer — não como mecanismo de proteção.
 * O que protege é a ausência do dado (e o CHECK da migration 028).
 */
function montarInstrucoes(cfg: Configuracao, conhecimento: string): string {
  const permissoes = [
    cfg.pode_consultar_horarios
      ? "Você pode informar horários livres da agenda quando eles constarem do contexto abaixo."
      : "Você não deve afirmar disponibilidade de horário: peça para a pessoa aguardar a confirmação da equipe.",
    cfg.pode_criar_agendamento
      ? "Você pode confirmar a intenção de agendamento e registrar o pedido para a equipe concluir."
      : "Você não agenda. Encaminhe o pedido de agendamento para a equipe humana.",
    cfg.pode_conceder_desconto
      ? "Você pode mencionar as condições comerciais que constarem do contexto abaixo."
      : "Você não concede desconto nem negocia preço em nenhuma hipótese.",
    "Você não tem acesso a prontuário, histórico clínico, diagnóstico ou qualquer dado de saúde, e não deve dar orientação clínica. Se perguntarem, diga que só a profissional responsável pode tratar disso.",
    "Quando houver dor, urgência, reclamação ou insistência em desconto, transfira para um humano em vez de responder.",
  ];

  const base = cfg.prompt_sistema?.trim() ||
    "Você é o agente de atendimento desta empresa. Responda em português do Brasil, com tom acolhedor e direto, em no máximo três frases.";

  const partes = [base, "", "Regras:", ...permissoes.map((p) => `- ${p}`)];

  if (cfg.horario_atuacao) {
    partes.push(`- Horário de atuação combinado com a equipe: ${cfg.horario_atuacao}.`);
  }

  if (conhecimento) {
    partes.push(
      "",
      "Contexto recuperado da base de conhecimento da empresa. Use apenas o que estiver aqui; se a resposta não estiver, diga que vai confirmar com a equipe:",
      conhecimento,
    );
  } else {
    partes.push(
      "",
      "Não há contexto recuperado para esta pergunta. Não invente informação de preço, prazo ou disponibilidade — diga que vai confirmar com a equipe.",
    );
  }

  return partes.join("\n");
}

async function responderAnthropic(
  cfg: Configuracao,
  chave: string,
  instrucoes: string,
  mensagem: string,
): Promise<{ texto: string; tokensPrompt: number; tokensResposta: number }> {
  const client = new Anthropic({ apiKey: chave });
  const resposta = await client.messages.create({
    model: cfg.modelo,
    max_tokens: MAX_TOKENS_RESPOSTA,
    system: instrucoes,
    messages: [{ role: "user", content: mensagem }],
  });

  // `content` é uma união discriminada — estreitar por `.type` antes de
  // ler `.text`, e juntar todos os blocos de texto em vez de assumir um.
  const texto = resposta.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return {
    texto,
    tokensPrompt: resposta.usage.input_tokens,
    tokensResposta: resposta.usage.output_tokens,
  };
}

/**
 * OpenAI e OpenRouter compartilham o formato *chat completions*, então
 * compartilham esta função — confirmado na documentação do OpenRouter
 * (search-first, 2026-08-19): a API deles é compatível e aceita o mesmo
 * corpo, no endpoint `https://openrouter.ai/api/v1/chat/completions`
 * com `Authorization: Bearer`.
 *
 * Duas diferenças, ambas tratadas abaixo:
 *   · `max_completion_tokens` é o nome atual na OpenAI; o OpenRouter
 *     segue o campo clássico `max_tokens`, então cada um recebe o que
 *     entende — mandar o campo errado faz o teto ser ignorado em
 *     silêncio, que é como uma resposta longa vira fatura inesperada;
 *   · o OpenRouter recomenda `HTTP-Referer` e `X-OpenRouter-Title` para
 *     identificar a aplicação. São opcionais e não alteram cobrança.
 */
async function responderChatCompletions(
  cfg: Configuracao,
  chave: string,
  instrucoes: string,
  mensagem: string,
): Promise<{ texto: string; tokensPrompt: number; tokensResposta: number }> {
  const ehOpenRouter = cfg.provedor === "openrouter";
  const url = ehOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${chave}`,
    "Content-Type": "application/json",
  };
  if (ehOpenRouter) {
    headers["HTTP-Referer"] = "https://vitrine.strategicepiphany.com";
    headers["X-OpenRouter-Title"] = "CRM Vitrine";
  }

  const corpoRequisicao: Record<string, unknown> = {
    model: cfg.modelo,
    messages: [
      { role: "system", content: instrucoes },
      { role: "user", content: mensagem },
    ],
  };
  if (ehOpenRouter) corpoRequisicao.max_tokens = MAX_TOKENS_RESPOSTA;
  else corpoRequisicao.max_completion_tokens = MAX_TOKENS_RESPOSTA;

  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(corpoRequisicao) });
  if (!r.ok) {
    const erro = await r.json().catch(() => ({}));
    const nome = ehOpenRouter ? "OpenRouter" : "OpenAI";
    throw new Error(erro?.error?.message ?? `${nome} respondeu ${r.status}`);
  }
  const corpo = await r.json();

  // O OpenRouter roteia entre provedores e nem todos devolvem `usage`.
  // Zero aqui significa "não informado", não "não consumiu" — o log
  // registra a chamada de qualquer forma, que é o que permite conferir
  // volume mesmo quando a contagem de tokens não vem.
  return {
    texto: (corpo?.choices?.[0]?.message?.content ?? "").trim(),
    tokensPrompt: corpo?.usage?.prompt_tokens ?? 0,
    tokensResposta: corpo?.usage?.completion_tokens ?? 0,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

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

  // ORDEM IMPORTA (achado do portão adversarial da Subetapa 02.15): esta
  // verificação ficava ANTES da autenticação, contando a um chamador sem
  // sessão nenhuma que o servidor estava mal configurado — e o nome exato
  // da variável que falta. Estado interno não se conta a quem ainda não
  // provou quem é. As funções de WhatsApp já autenticavam primeiro; eram
  // as duas de IA que haviam regredido.
  if (!ENCRYPTION_KEY) return json({ error: "ENCRYPTION_KEY não configurada" }, 500);

  let body: { mensagem?: string; modo?: string; conversa_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo inválido" }, 400);
  }
  const mensagem = body.mensagem?.trim();
  if (!mensagem) return json({ error: "mensagem é obrigatória" }, 400);
  const modo = body.modo === "resposta_automatica" ? "resposta_automatica" : "rascunho";

  // A conta vem do PERFIL do chamador, nunca do corpo da requisição —
  // esta função roda com service_role e a RLS não participa daqui em
  // diante (achado A06 da Subetapa 01.8).
  const accountId = perfil.account_id;

  const { data: cfgLinha, error: cfgErr } = await admin
    .schema("aba_ai")
    .from("ia_configuracoes")
    .select(
      "provedor, modelo, chave_api, prompt_sistema, ativo, pode_consultar_horarios, pode_criar_agendamento, pode_ler_prontuario, pode_conceder_desconto, horario_atuacao",
    )
    .eq("account_id", accountId)
    .maybeSingle();
  if (cfgErr) return json({ error: `Falha ao ler configuração: ${cfgErr.message}` }, 500);
  if (!cfgLinha) return json({ error: "Esta conta ainda não tem chave de IA configurada" }, 400);

  const cfg = cfgLinha as unknown as Configuracao;
  if (!cfg.ativo) return json({ error: "O agente está desativado nesta conta" }, 400);

  // Defesa em profundidade: o CHECK da migration 028 já impede que este
  // valor seja true. Se algum dia ele passar (migration futura), esta
  // função ainda recusa — porque ela não implementa o caminho auditado
  // de leitura clínica, e responder como se implementasse seria o pior
  // desfecho possível.
  if (cfg.pode_ler_prontuario) {
    return json(
      { error: "Leitura de prontuário pelo agente não é suportada — exige caminho auditado (CLAUDE.md §5)" },
      400,
    );
  }

  let chave: string;
  try {
    chave = await decrypt(cfg.chave_api, ENCRYPTION_KEY);
  } catch {
    return json({ error: "Não foi possível decifrar a chave da conta — reconfigure-a" }, 500);
  }

  // Recuperação lexical na base de conhecimento. `p_account_id` é o da
  // conta do chamador: a função é SECURITY INVOKER, mas aqui ela roda
  // como service_role (sem RLS), então este parâmetro É a fronteira.
  const { data: trechos } = await admin.schema("aba_ai").rpc("buscar_conhecimento_textual", {
    p_account_id: accountId,
    p_consulta: mensagem,
    p_limite: TRECHOS_DE_CONTEXTO,
  });
  const conhecimento = ((trechos ?? []) as { conteudo: string }[]).map((t) => `- ${t.conteudo}`).join("\n");

  const instrucoes = montarInstrucoes(cfg, conhecimento);

  let resultado: { texto: string; tokensPrompt: number; tokensResposta: number };
  try {
    resultado = cfg.provedor === "anthropic"
      ? await responderAnthropic(cfg, chave, instrucoes, mensagem)
      : await responderChatCompletions(cfg, chave, instrucoes, mensagem);
  } catch (e) {
    // A mensagem do provedor volta para a tela poder explicar (chave sem
    // crédito, modelo inexistente, limite de taxa). A chave não aparece
    // em nenhuma delas.
    return json({ error: e instanceof Error ? e.message : "Falha ao chamar o provedor de IA" }, 502);
  }

  const { error: logErr } = await admin.schema("aba_ai").from("ia_log_uso").insert({
    account_id: accountId,
    conversa_id: body.conversa_id ?? null,
    modo,
    provedor: cfg.provedor,
    modelo: cfg.modelo,
    tokens_prompt: resultado.tokensPrompt,
    tokens_resposta: resultado.tokensResposta,
    tokens_total: resultado.tokensPrompt + resultado.tokensResposta,
  });
  // Falha de log não invalida a resposta já gerada e paga, mas precisa
  // aparecer — consumo sem registro é exatamente o que a tela existe
  // para evitar.
  if (logErr) console.error("ia-responder: falha ao gravar ia_log_uso:", logErr.message);

  return json({
    ok: true,
    texto: resultado.texto,
    provedor: cfg.provedor,
    modelo: cfg.modelo,
    tokens_prompt: resultado.tokensPrompt,
    tokens_resposta: resultado.tokensResposta,
    trechos_usados: (trechos ?? []).length,
    log_gravado: !logErr,
  });
});
