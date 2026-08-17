// ============================================================
// whatsapp-webhook — Edge Function do webhook da Meta Cloud API
// (Subetapa 01.6)
//
// SEARCH-FIRST (CLAUDE.md §11), confirmado em 2026-08-16 contra a
// documentação vigente da Meta:
//   - Versão da Graph API: v26.0 (lançada 2026-07-29). Usada só na
//     URL de ENVIO (não existe no contrato de entrada do webhook).
//   - Handshake de verificação: GET com hub.mode=subscribe,
//     hub.verify_token, hub.challenge — responder o challenge em
//     texto puro se o token bater.
//   - Autenticidade do evento: cabeçalho X-Hub-Signature-256,
//     HMAC-SHA256 do CORPO BRUTO (antes de qualquer parse), chaveado
//     pelo META_APP_SECRET, prefixado "sha256=".
//   Fontes: developers.facebook.com/docs/graph-api/changelog,
//   .../docs/graph-api/webhooks/getting-started,
//   .../docs/whatsapp/cloud-api/webhooks/components.
//
// AUTENTICAÇÃO DESTA FUNÇÃO — verify_jwt DESLIGADO de propósito: este
// é o único endpoint público e não autenticado do sistema (mesmo
// papel que a rota de webhook tinha no CRM Maximus). A autenticação
// real é a assinatura HMAC validada abaixo, não um JWT do Supabase
// Auth — a Meta não manda esse header.
//
// SEGREDOS — META_APP_SECRET e META_WEBHOOK_VERIFY_TOKEN são secrets
// de Edge Function (Deno.env), nunca gravados no banco nem no .env do
// app (CLAUDE.md §4). SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY são
// injetados automaticamente pelo runtime do Supabase — não precisam
// ser configurados à mão.
//
// HARDENING (mesmo espírito de 020_aba_messaging.sql, Maximus
// 055/057, já embutido desde a primeira versão):
//   - Requisição sem assinatura, ou com assinatura que não bate, é
//     rejeitada ANTES de qualquer leitura do banco — nunca processa
//     payload não autenticado.
//   - Comparação de assinatura em tempo constante (timingSafeEqual),
//     não ===, para não vazar informação por tempo de resposta.
//   - Idempotência por CONTA: eventos_provedor tem
//     UNIQUE(account_id, provedor, id_externo) — reentrega do mesmo
//     evento (retry da Meta) é tratada como sucesso, não duplica
//     mensagem.
//   - phone_number_id do payload resolve a conta via
//     configuracao_whatsapp — evento sem número cadastrado é
//     descartado (200, sem processar) em vez de adivinhar a conta.
//
// Idempotente por natureza (é um handler HTTP, não uma migration).
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const META_WEBHOOK_VERIFY_TOKEN = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Comparação em tempo constante — não vaza quantos bytes bateram por diferença de tempo. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function assinaturaValida(corpoBruto: string, cabecalhoAssinatura: string | null): Promise<boolean> {
  if (!cabecalhoAssinatura || !cabecalhoAssinatura.startsWith("sha256=")) {
    return false;
  }
  if (!META_APP_SECRET) {
    console.error("whatsapp-webhook: META_APP_SECRET ausente — recusando por falha fechada");
    return false;
  }

  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(META_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinaturaCalculada = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpoBruto));
  const recebidaHex = cabecalhoAssinatura.slice("sha256=".length).trim();

  let recebidaBytes: Uint8Array;
  try {
    recebidaBytes = hexToBytes(recebidaHex);
  } catch {
    return false;
  }

  return timingSafeEqual(new Uint8Array(assinaturaCalculada), recebidaBytes);
}

// Traduz o content_type do payload da Meta para o vocabulário PT-BR de
// aba_messaging.mensagens.tipo_conteudo (020_aba_messaging.sql).
function tipoConteudoDe(tipoMeta: string): string {
  const mapa: Record<string, string> = {
    text: "texto",
    image: "imagem",
    document: "documento",
    audio: "audio",
    video: "video",
    location: "localizacao",
    interactive: "interativo",
  };
  return mapa[tipoMeta] ?? "texto";
}

function statusMensagemDe(statusMeta: string): string | null {
  const mapa: Record<string, string> = {
    sent: "enviada",
    delivered: "entregue",
    read: "lida",
    failed: "falhou",
  };
  return mapa[statusMeta] ?? null;
}

async function processarMensagemRecebida(
  accountId: string,
  valor: Record<string, unknown>,
): Promise<void> {
  const mensagensMeta = (valor.messages as Array<Record<string, unknown>> | undefined) ?? [];
  const contatosMeta = (valor.contacts as Array<Record<string, unknown>> | undefined) ?? [];

  for (const msg of mensagensMeta) {
    const telefoneWa = String(msg.from ?? "");
    if (!telefoneWa) continue;

    const nomeContato = (contatosMeta.find((c) => (c.wa_id as string) === telefoneWa)?.profile as
      | Record<string, unknown>
      | undefined)?.name as string | undefined;

    // Upsert do contato de canal por (account_id, telefone).
    const { data: contato, error: contatoErr } = await admin
      .schema("aba_messaging")
      .from("contatos_canal")
      .upsert(
        { account_id: accountId, telefone: telefoneWa, nome: nomeContato ?? null },
        { onConflict: "account_id,telefone", ignoreDuplicates: false },
      )
      .select("id")
      .single();
    if (contatoErr || !contato) {
      console.error("whatsapp-webhook: falha ao upsert contato_canal", contatoErr);
      continue;
    }

    // Conversa aberta mais recente para este contato, ou cria uma nova.
    const { data: conversaExistente } = await admin
      .schema("aba_messaging")
      .from("conversas")
      .select("id")
      .eq("account_id", accountId)
      .eq("contato_id", contato.id)
      .neq("status", "fechada")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversaId = conversaExistente?.id as string | undefined;
    if (!conversaId) {
      const { data: novaConversa, error: conversaErr } = await admin
        .schema("aba_messaging")
        .from("conversas")
        .insert({ account_id: accountId, contato_id: contato.id, status: "aberta" })
        .select("id")
        .single();
      if (conversaErr || !novaConversa) {
        console.error("whatsapp-webhook: falha ao criar conversa", conversaErr);
        continue;
      }
      conversaId = novaConversa.id;
    }

    const tipoMeta = String(msg.type ?? "text");
    const textoBody = (msg.text as Record<string, unknown> | undefined)?.body as string | undefined;

    // Resposta a botão/lista: a Meta manda o id escolhido em
    // interactive.button_reply.id ou interactive.list_reply.id.
    const interactive = msg.interactive as Record<string, unknown> | undefined;
    const buttonReply = interactive?.button_reply as Record<string, unknown> | undefined;
    const listReply = interactive?.list_reply as Record<string, unknown> | undefined;
    const idRespostaInterativa = (buttonReply?.id ?? listReply?.id) as string | undefined;

    const { error: mensagemErr } = await admin.schema("aba_messaging").from("mensagens").insert({
      conversa_id: conversaId,
      account_id: accountId,
      tipo_remetente: "cliente",
      tipo_conteudo: tipoConteudoDe(tipoMeta),
      conteudo_texto: textoBody ?? null,
      id_resposta_interativa: idRespostaInterativa ?? null,
      id_mensagem_externa: String(msg.id ?? ""),
      status: "entregue",
      provedor: "meta",
    });
    if (mensagemErr) {
      console.error("whatsapp-webhook: falha ao gravar mensagem", mensagemErr);
      continue;
    }

    // contador_nao_lidas fica para a Etapa 02 (depende de "lido por
    // qual agente", não só de existir mensagem nova) — só a prévia da
    // caixa de entrada é atualizada aqui.
    await admin
      .schema("aba_messaging")
      .from("conversas")
      .update({
        ultima_mensagem_texto: textoBody ?? `[${tipoConteudoDe(tipoMeta)}]`,
        ultima_mensagem_em: new Date().toISOString(),
      })
      .eq("id", conversaId);
  }
}

async function processarAtualizacaoStatus(valor: Record<string, unknown>): Promise<void> {
  const statusesMeta = (valor.statuses as Array<Record<string, unknown>> | undefined) ?? [];
  for (const s of statusesMeta) {
    const novoStatus = statusMensagemDe(String(s.status ?? ""));
    const idExterno = String(s.id ?? "");
    if (!novoStatus || !idExterno) continue;

    await admin
      .schema("aba_messaging")
      .from("mensagens")
      .update({ status: novoStatus })
      .eq("id_mensagem_externa", idExterno);
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // ------------------------------------------------------------
  // Handshake de verificação (GET) — Meta chama isto ao salvar a URL
  // do webhook no App Dashboard.
  // ------------------------------------------------------------
  if (req.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const tokenRecebido = url.searchParams.get("hub.verify_token");
    const desafio = url.searchParams.get("hub.challenge");

    if (modo === "subscribe" && tokenRecebido && META_WEBHOOK_VERIFY_TOKEN && tokenRecebido === META_WEBHOOK_VERIFY_TOKEN) {
      console.log("whatsapp-webhook: handshake de verificação aceito");
      return new Response(desafio ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
    }

    console.warn("whatsapp-webhook: handshake de verificação recusado (hub.verify_token não confere)");
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // ------------------------------------------------------------
  // Evento (POST) — corpo bruto lido ANTES de qualquer parse, porque a
  // assinatura é sobre os bytes exatos que a Meta enviou.
  // ------------------------------------------------------------
  const corpoBruto = await req.text();
  const cabecalhoAssinatura = req.headers.get("x-hub-signature-256");

  if (!(await assinaturaValida(corpoBruto, cabecalhoAssinatura))) {
    console.warn("whatsapp-webhook: requisição REJEITADA — assinatura ausente ou inválida");
    return new Response("Invalid signature", { status: 401 });
  }

  console.log("whatsapp-webhook: requisição ACEITA — assinatura válida");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(corpoBruto);
  } catch {
    console.error("whatsapp-webhook: corpo assinado, mas não é JSON válido");
    return new Response("OK", { status: 200 }); // assinatura já provou a origem; corpo malformado não é motivo pra Meta reenviar
  }

  const entradas = (payload.entry as Array<Record<string, unknown>> | undefined) ?? [];

  for (const entrada of entradas) {
    const mudancas = (entrada.changes as Array<Record<string, unknown>> | undefined) ?? [];

    for (const mudanca of mudancas) {
      const valor = (mudanca.value as Record<string, unknown> | undefined) ?? {};
      const metadata = (valor.metadata as Record<string, unknown> | undefined) ?? {};
      const idNumeroTelefone = metadata.phone_number_id as string | undefined;

      if (!idNumeroTelefone) {
        console.warn("whatsapp-webhook: evento sem phone_number_id no metadata — descartado");
        continue;
      }

      const { data: config } = await admin
        .schema("aba_messaging")
        .from("configuracao_whatsapp")
        .select("account_id")
        .eq("id_numero_telefone", idNumeroTelefone)
        .maybeSingle();

      if (!config) {
        console.warn(`whatsapp-webhook: nenhuma conta configurada para phone_number_id=${idNumeroTelefone} — descartado`);
        continue;
      }

      const accountId = config.account_id as string;
      const idExterno = (valor.messages as Array<Record<string, unknown>> | undefined)?.[0]?.id as
        | string
        | undefined ?? (valor.statuses as Array<Record<string, unknown>> | undefined)?.[0]?.id as
        | string
        | undefined;

      // Registro bruto do evento — idempotente por conta (Maximus 057).
      const { error: eventoErr } = await admin.schema("aba_messaging").from("eventos_provedor").insert({
        account_id: accountId,
        provedor: "meta",
        tipo_evento: mudanca.field as string | null,
        id_externo: idExterno ?? null,
        payload: valor,
      });
      if (eventoErr) {
        if (eventoErr.code === "23505") {
          console.log("whatsapp-webhook: evento duplicado (reentrega da Meta) — ignorado sem reprocessar");
          continue;
        }
        console.error("whatsapp-webhook: falha ao gravar eventos_provedor", eventoErr);
      }

      if (valor.messages) {
        await processarMensagemRecebida(accountId, valor);
      }
      if (valor.statuses) {
        await processarAtualizacaoStatus(valor);
      }
    }
  }

  return new Response("OK", { status: 200 });
});
