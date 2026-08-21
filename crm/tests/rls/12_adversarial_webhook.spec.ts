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
import { AMBIENTE_DE_TESTE } from "./ambiente";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

function lerEnv(arquivo: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const linha of readFileSync(arquivo, "utf-8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    // Remove aspas envolventes: a regra do projeto manda gravar todo
    // segredo do `.env` entre aspas simples (§6 de instrucoes.md), e sem
    // isto a aspa entrava no valor — assinando o HMAC com a chave errada.
    if (m) vars[m[1]] = m[2].trim().replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1");
  }
  return vars;
}

const raizEnv = lerEnv(path.resolve(__dirname, "../../../.env"));
const SUPABASE_URL = AMBIENTE_DE_TESTE.url;
const META_APP_SECRET = raizEnv.META_APP_SECRET;
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;

function assinar(corpo: string): string {
  return "sha256=" + createHmac("sha256", META_APP_SECRET).update(corpo, "utf8").digest("hex");
}

/**
 * O webhook é o único caso da suíte que depende de um segredo de Edge
 * Function (`META_APP_SECRET`) configurado no MESMO projeto Supabase em
 * que a suíte roda. Desde a Subetapa 02.15 a suíte roda no projeto de
 * TESTES, e Max decidiu (2026-08-21) manter tudo que envolve a Meta
 * congelado — então esse segredo não é definido lá.
 *
 * ESTE PREFLIGHT EXISTE PARA NÃO MENTIR EM NENHUMA DAS DUAS DIREÇÕES.
 * Sem ele restariam duas saídas ruins: deixar o caso vermelho, e aí um
 * problema de CONFIGURAÇÃO passaria a parecer falha de segurança no
 * portão; ou pular em silêncio, e aí o portão exibiria verde sobre um
 * ataque que nunca rodou — que é exatamente o defeito que a Subetapa
 * 02.13.b encontrou e custou uma subetapa inteira para corrigir.
 *
 * A saída correta é a terceira: detectar, PULAR EM VOZ ALTA dizendo o
 * motivo e o conserto, e registrar como não coberto no relatório.
 *
 * Vale notar o que NÃO se perde: o risco que este caso guarda (A06 —
 * um evento destinado a uma conta alterando linha de outra) passou a
 * ser barrado também pelo banco na migration 035, e
 * `17_adversarial_isolamento_fk` prova que nem `service_role` — que é
 * justamente o papel com que o webhook roda — atravessa a fronteira.
 * O que fica sem exercício é o caminho HTTP ponta a ponta.
 */
async function webhookUtilizavel(): Promise<{ ok: boolean; motivo: string }> {
  if (!META_APP_SECRET) {
    return { ok: false, motivo: "META_APP_SECRET ausente no .env da raiz" };
  }
  const corpo = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  try {
    const r = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-signature-256": assinar(corpo) },
      body: corpo,
    });
    if (r.status === 200) return { ok: true, motivo: "" };
    if (r.status === 401) {
      return {
        ok: false,
        motivo:
          `a função respondeu 401 a um payload corretamente assinado — o segredo META_APP_SECRET ` +
          `não está configurado no projeto de teste (Edge Functions > Secrets), ou não é o mesmo do .env`,
      };
    }
    if (r.status === 404) {
      return { ok: false, motivo: "a Edge Function whatsapp-webhook não está implantada neste projeto" };
    }
    return { ok: false, motivo: `resposta inesperada do webhook: HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, motivo: `webhook inalcançável: ${(e as Error).message}` };
  }
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
  it("evento de status assinado só altera a mensagem da conta destinatária", async (ctx) => {
    const disponivel = await webhookUtilizavel();
    if (!disponivel.ok) {
      // Barulhento de propósito. Um caso pulado que passa despercebido é
      // pior que um caso vermelho — ver o comentário de webhookUtilizavel().
      console.warn(
        [
          "",
          "═".repeat(78),
          "  A06 (webhook) NÃO EXERCIDO nesta execução.",
          `  Motivo: ${disponivel.motivo}.`,
          "  Isto NÃO é um teste passando — é um ataque que não rodou.",
          "  Para cobrir: definir META_APP_SECRET em Edge Functions > Secrets do",
          "  projeto de teste, com o mesmo valor do .env da raiz.",
          "  Congelado por decisão de Max (2026-08-21): tudo que envolve a Meta",
          "  segue parado até a configuração da API oficial destravar.",
          "═".repeat(78),
          "",
        ].join("\n"),
      );
      ctx.skip();
      return;
    }

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
