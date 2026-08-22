// ============================================================
// 18_adversarial_edge_functions.spec.ts — Portão adversarial da
// Etapa 02 (Subetapa 02.15): as Edge Functions de IA.
//
// POR QUE ESTA SUPERFÍCIE É DIFERENTE DE TODAS AS OUTRAS DA SUÍTE.
// Os 179 casos anteriores atacam o banco pela API do PostgREST, onde a
// RLS participa de toda leitura e escrita. Uma Edge Function não: ela
// roda com `service_role`, que IGNORA row level security por completo.
// A fronteira de conta ali não é imposta pelo banco — é imposta por
// código, à mão, e some no dia em que alguém esquecer de escrevê-la.
// Foi assim que nasceu o achado A06 da Subetapa 01.8, no webhook.
//
// A PERGUNTA CENTRAL, então, não é "a RLS protege?" — não protege, e
// não deveria ser chamada a protegê-la aqui. É: **de onde vem o
// `account_id` que a função usa?** Se vier do corpo da requisição, o
// chamador escolhe em qual conta escrever. Se vier do perfil do
// chamador, não escolhe.
//
// Nas duas funções de IA vem do perfil (`ia-configurar` linha ~144,
// `ia-responder` linha ~278), e o corpo sequer é lido em busca de
// conta. Estes casos travam esse contrato: são eles que ficam
// vermelhos se alguém, um dia, aceitar `account_id` do cliente.
//
// FORA DE ESCOPO NESTA EXECUÇÃO: `whatsapp-configurar`,
// `whatsapp-enviar` e `whatsapp-webhook`, por decisão de Max
// (2026-08-21) de congelar tudo que envolve a Meta. As três foram
// auditadas por LEITURA e o resultado está no relatório da 02.15;
// o que não houve foi ataque em execução.
// ============================================================
import { describe, it, expect } from "vitest";
import { clientAs } from "./helpers";
import { AMBIENTE_DE_TESTE } from "./ambiente";
import type { SupabaseClient } from "@supabase/supabase-js";

const BASE = `${AMBIENTE_DE_TESTE.url}/functions/v1`;

async function tokenDe(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("sessão sem access_token — globalSetup não preparou o papel?");
  return token;
}

async function chamar(
  funcao: string,
  opcoes: { token?: string; comApiKey?: boolean; corpo?: unknown } = {},
): Promise<{ status: number; texto: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // A `apikey` é o que identifica o projeto; o `Authorization` é o que
  // identifica o USUÁRIO. Separá-los deixa testar cada um sozinho.
  if (opcoes.comApiKey !== false) headers["apikey"] = AMBIENTE_DE_TESTE.anonKey;
  if (opcoes.token) headers["Authorization"] = `Bearer ${opcoes.token}`;

  const r = await fetch(`${BASE}/${funcao}`, {
    method: "POST",
    headers,
    body: JSON.stringify(opcoes.corpo ?? {}),
  });
  return { status: r.status, texto: await r.text() };
}

/** Uma chave falsa, com forma plausível, para nunca tocar provedor real. */
const CHAVE_FALSA = "sk-proj-000000000000000000000000000000000000000000000000";

describe("Edge Functions de IA — o account_id vem do perfil, nunca do corpo", () => {
  it("ia-configurar recusa chamada SEM sessão de usuário", async () => {
    const r = await chamar("ia-configurar", { corpo: { provedor: "openai", chave_api: CHAVE_FALSA } });
    expect(r.status, `esperava recusa, veio ${r.status}: ${r.texto.slice(0, 120)}`).toBeGreaterThanOrEqual(400);
  });

  it("ia-configurar recusa chamada SEM apikey do projeto", async () => {
    const r = await chamar("ia-configurar", { comApiKey: false, corpo: { provedor: "openai" } });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it("ia-responder recusa chamada SEM sessão de usuário", async () => {
    const r = await chamar("ia-responder", { corpo: { pergunta: "olá" } });
    expect(r.status, `esperava recusa, veio ${r.status}: ${r.texto.slice(0, 120)}`).toBeGreaterThanOrEqual(400);
  });

  it("viewer NÃO consegue configurar a chave de IA da conta", async () => {
    const viewer = await clientAs("viewer");
    const r = await chamar("ia-configurar", {
      token: await tokenDe(viewer),
      corpo: { provedor: "openai", modelo: "gpt-4o-mini", chave_api: CHAVE_FALSA },
    });
    expect(r.status, `viewer não deveria configurar IA — veio ${r.status}`).toBeGreaterThanOrEqual(400);
    expect(r.texto.toLowerCase()).toMatch(/papel|admin|permiss/);
  });

  it("agent NÃO consegue configurar a chave de IA da conta", async () => {
    const agent = await clientAs("agent");
    const r = await chamar("ia-configurar", {
      token: await tokenDe(agent),
      corpo: { provedor: "openai", modelo: "gpt-4o-mini", chave_api: CHAVE_FALSA },
    });
    expect(r.status, `agent não deveria configurar IA — veio ${r.status}`).toBeGreaterThanOrEqual(400);
    expect(r.texto.toLowerCase()).toMatch(/papel|admin|permiss/);
  });

  it("account_id forjado no corpo é IGNORADO — a recusa por papel vem antes e continua valendo", async () => {
    // Um viewer manda no corpo o `account_id` de outra conta, tentando
    // fazer a função escrever lá. Se a função lesse a conta do corpo, o
    // papel seria conferido contra a conta forjada — e o viewer poderia
    // ser owner dela. O contrato correto é o oposto: a conta sai do
    // perfil de quem chama, então o corpo não muda nada.
    const viewer = await clientAs("viewer");
    const r = await chamar("ia-configurar", {
      token: await tokenDe(viewer),
      corpo: {
        provedor: "openai",
        modelo: "gpt-4o-mini",
        chave_api: CHAVE_FALSA,
        account_id: "00000000-0000-0000-0000-000000000000",
        account_role: "owner",
      },
    });
    expect(r.status, "o corpo forjado não pode alterar a decisão de papel").toBeGreaterThanOrEqual(400);
    expect(r.texto.toLowerCase()).toMatch(/papel|admin|permiss/);
  });

  it("nenhuma resposta de erro devolve material que pareça credencial", async () => {
    // Mensagem de erro é o vazamento mais fácil de cometer e o mais
    // difícil de notar: basta ecoar o corpo recebido para devolver a
    // chave que o operador acabou de colar.
    const viewer = await clientAs("viewer");
    const r = await chamar("ia-configurar", {
      token: await tokenDe(viewer),
      corpo: { provedor: "openai", modelo: "gpt-4o-mini", chave_api: CHAVE_FALSA },
    });
    expect(r.texto).not.toContain(CHAVE_FALSA);
    expect(r.texto).not.toMatch(/ENCRYPTION_KEY|service_role|eyJhbGciOi/);
  });
});
