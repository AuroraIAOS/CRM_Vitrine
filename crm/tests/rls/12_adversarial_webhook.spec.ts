// ============================================================
// 12_adversarial_webhook.spec.ts — Portão de segurança adversarial
// (Subetapa 01.8), achado A06: isolamento entre inquilinos no único
// endpoint público do sistema.
//
// ACHADO ORIGINAL — supabase/functions/whatsapp-webhook/index.ts,
// processarAtualizacaoStatus() atualizava aba_messaging.mensagens
// filtrando SÓ por id_mensagem_externa, com service_role (que ignora
// RLS) e sem filtro por account_id. A função sequer recebia o
// accountId que o chamador já havia resolvido pelo phone_number_id.
// Um evento de status legitimamente destinado a uma conta alterava a
// mensagem de qualquer outra que tivesse o mesmo id externo.
//
// Este teste ataca a FUNÇÃO IMPLANTADA de verdade — payload assinado
// com HMAC-SHA256 real, como a Meta faz —, não uma simulação da
// sentença SQL. Sem isso, o teste provaria só o SQL que eu mesmo
// escrevi, e não que o endpoint no ar está correto.
//
// META_APP_SECRET é lido em tempo de execução para calcular a
// assinatura e NUNCA é impresso (mesmo padrão de
// crm/scripts/test_webhook_meta.mjs, Subetapa 01.6).
// ============================================================
import { describe, it, expect, afterAll } from "vitest";
import { adminClient, createThrowawayUser, deleteThrowawayUser } from "./helpers";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

function lerEnv(arquivo: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const linha of readFileSync(arquivo, "utf-8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim();
  }
  return vars;
}

const raizEnv = lerEnv(path.resolve(__dirname, "../../../.env"));
const SUPABASE_URL = raizEnv.SUPABASE__URL;
const META_APP_SECRET = raizEnv.META_APP_SECRET;
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;

function assinar(corpo: string): string {
  return "sha256=" + createHmac("sha256", META_APP_SECRET).update(corpo, "utf8").digest("hex");
}

const limpeza: Array<() => Promise<void>> = [];
afterAll(async () => {
  for (const fn of limpeza.reverse()) {
    try {
      await fn();
    } catch (e) {
      console.warn("limpeza adversarial falhou:", (e as Error).message);
    }
  }
});

/** Conta com número de WhatsApp configurado + uma mensagem de id externo controlado. */
async function semearInquilino(
  accountId: string,
  idNumeroTelefone: string,
  idExterno: string,
): Promise<string> {
  const admin = adminClient();

  const { data: cfg, error: cfgErr } = await admin
    .schema("aba_messaging")
    .from("configuracao_whatsapp")
    .insert({
      account_id: accountId,
      id_numero_telefone: idNumeroTelefone,
      token_acesso_cifrado: "adv-token-ficticio-nao-e-credencial",
      status: "conectado",
    })
    .select("id")
    .single();
  if (cfgErr) throw new Error(`semear configuracao_whatsapp: ${cfgErr.message}`);

  const { data: contato, error: contatoErr } = await admin
    .schema("aba_messaging")
    .from("contatos_canal")
    // Indicativo +999, reservado pela ITU e nao roteavel. `5511…` gerava um
      // numero BRASILEIRO plausivel, e a regra do projeto e nao inventar numero:
      // o provedor completa digitos ao rotear e pode atingir terceiro (incidente
      // real em projeto irmao, instrucoes.md §6). Fixture nunca envia, mas a
      // regra nao abre excecao por intencao.
      .insert({ account_id: accountId, telefone: `+9991${Math.floor(Math.random() * 1e8)}`, nome: "adv" })
    .select("id")
    .single();
  if (contatoErr) throw new Error(`semear contato: ${contatoErr.message}`);

  const { data: conversa, error: conversaErr } = await admin
    .schema("aba_messaging")
    .from("conversas")
    .insert({ account_id: accountId, contato_id: contato.id, status: "aberta" })
    .select("id")
    .single();
  if (conversaErr) throw new Error(`semear conversa: ${conversaErr.message}`);

  const { data: msg, error: msgErr } = await admin
    .schema("aba_messaging")
    .from("mensagens")
    .insert({
      account_id: accountId,
      conversa_id: conversa.id,
      tipo_remetente: "agente",
      tipo_conteudo: "texto",
      conteudo_texto: "mensagem de teste adversarial",
      id_mensagem_externa: idExterno,
      status: "enviada",
      provedor: "meta",
    })
    .select("id")
    .single();
  if (msgErr) throw new Error(`semear mensagem: ${msgErr.message}`);

  limpeza.push(async () => {
    await admin.schema("aba_messaging").from("mensagens").delete().eq("id", msg.id);
    await admin.schema("aba_messaging").from("conversas").delete().eq("id", conversa.id);
    await admin.schema("aba_messaging").from("contatos_canal").delete().eq("id", contato.id);
    await admin.schema("aba_messaging").from("configuracao_whatsapp").delete().eq("id", cfg.id);
    await admin.schema("aba_messaging").from("eventos_provedor").delete().eq("account_id", accountId);
  });

  return msg.id as string;
}

describe("A06 — isolamento entre contas no webhook público", () => {
  it("evento de status assinado só altera a mensagem da conta destinatária", async () => {
    const admin = adminClient();

    // Conta B: descartável, criada na hora (alvo contido — decisão de Max).
    const outro = await createThrowawayUser(admin, "adv-a06");
    limpeza.push(() => deleteThrowawayUser(admin, outro.userId));
    const { data: perfilOutro } = await admin
      .from("profiles")
      .select("account_id")
      .eq("user_id", outro.userId)
      .single();
    const contaB = perfilOutro!.account_id as string;

    // Mesmo id externo nas duas contas, números de telefone distintos.
    const idExterno = `wamid.ADV${Date.now()}`;
    const numeroA = `adv-num-A-${Date.now()}`;
    const numeroB = `adv-num-B-${Date.now()}`;

    // Conta A tambem descartavel. Antes era a conta de teste COMPARTILHADA,
    // e a partir da 02.5 ela passou a ter uma configuracao de WhatsApp real —
    // colidindo com `configuracao_whatsapp_account_id_key` (uma por conta) e
    // derrubando este teste. O que A06 mede e isolamento ENTRE contas; qual
    // conta faz o papel de A e indiferente, e usar duas descartaveis remove a
    // dependencia do estado de uma conta que outras subetapas tambem mexem.
    const outroA = await createThrowawayUser(admin, "adv-a06-a");
    limpeza.push(() => deleteThrowawayUser(admin, outroA.userId));
    const { data: perfilA } = await admin
      .from("profiles")
      .select("account_id")
      .eq("user_id", outroA.userId)
      .single();
    const contaA = perfilA!.account_id as string;

    const msgA = await semearInquilino(contaA, numeroA, idExterno);
    const msgB = await semearInquilino(contaB, numeroB, idExterno);

    // Evento LEGÍTIMO da Meta, endereçado ao número da conta A.
    const corpo = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "adv-entry",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "5511999999999", phone_number_id: numeroA },
                statuses: [{ id: idExterno, status: "read", timestamp: `${Date.now()}` }],
              },
            },
          ],
        },
      ],
    });

    const resposta = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-signature-256": assinar(corpo) },
      body: corpo,
    });
    expect(resposta.status, "o webhook deveria aceitar o payload corretamente assinado").toBe(200);

    const { data: depoisA } = await admin
      .schema("aba_messaging")
      .from("mensagens")
      .select("status")
      .eq("id", msgA)
      .single();
    const { data: depoisB } = await admin
      .schema("aba_messaging")
      .from("mensagens")
      .select("status")
      .eq("id", msgB)
      .single();

    expect(depoisA?.status, "a mensagem da conta destinatária deveria ter virado 'lida'").toBe("lida");

    if (depoisB?.status === "lida") {
      console.error(
        `A06 EXPLORÁVEL — evento destinado à conta ${contaA} alterou mensagem da conta ${contaB} ` +
          `(id externo compartilhado: ${idExterno})`,
      );
    }

    expect(
      depoisB?.status,
      "evento de status atravessou a fronteira de conta e alterou mensagem de outro inquilino",
    ).toBe("enviada");
  });
});
