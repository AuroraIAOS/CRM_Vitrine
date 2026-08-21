// ============================================================
// 17_adversarial_isolamento_fk.spec.ts — Portão adversarial da
// Etapa 02 (Subetapa 02.15): escrita entre contas por chave
// estrangeira.
//
// O ACHADO QUE ORIGINOU ESTE ARQUIVO. A RLS isola pela coluna
// `account_id`: ela responde "esta linha é sua?". Ela NUNCA é
// consultada na outra pergunta — "a linha que você está APONTANDO é
// sua?" —, porque a verificação de integridade referencial roda como
// dona da tabela. Documentação do PostgreSQL, "Row Security Policies":
//
//   "Referential integrity checks, such as unique or primary key
//    constraints and foreign key references, always bypass row
//    security to ensure that data integrity is maintained."
//
// Resultado medido na auditoria, antes da correção: um usuário da
// conta A inseria linha SUA (`account_id = A`, aceita pela RLS)
// apontando para linha da conta B — provado em `aba_finance.pagamentos`
// (pagamento quitando fatura alheia, que ainda por cima faz
// `marcar_faturas_vencidas()` deixar de vencê-la), `pessoa_notas` e
// `aba_sales.oportunidades`. 73 chaves estavam nessa condição.
//
// Corrigido pela migration `035`: toda chave entre tabelas
// multi-inquilino passou a ser composta por `account_id`.
//
// POR QUE O PRIMEIRO TESTE É O MAIS IMPORTANTE DO ARQUIVO: os ataques
// abaixo provam três chaves. O teste de catálogo prova TODAS, inclusive
// as que ainda não existem. A 74ª chave — escrita na Etapa 03, ou na
// primeira clonagem de CRM-filho — recriaria a classe inteira com
// sintoma ZERO: nada falha, nada avisa, nenhum teste fica vermelho, e a
// falha só aparece quando alguém a explora. É a diferença entre um teste
// que prova um conserto e um teste que sustenta uma garantia.
// ============================================================
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { adminClient, anonClient, clientAs, createThrowawayUser, deleteThrowawayUser } from "./helpers";


const admin = adminClient();
const limpeza: Array<() => Promise<void>> = [];

afterAll(async () => {
  for (const fn of limpeza.reverse()) {
    try {
      await fn();
    } catch (e) {
      console.warn("limpeza 17_adversarial_isolamento_fk falhou:", (e as Error).message);
    }
  }
});

/** Conta criada por `handle_new_user` para um usuário descartável. */
async function contaDe(userId: string): Promise<string> {
  const { data, error } = await admin.from("profiles").select("account_id").eq("user_id", userId).single();
  if (error) throw new Error(`contaDe(${userId}): ${error.message}`);
  return data!.account_id as string;
}

describe("Isolamento de conta na chave estrangeira — a pergunta que a RLS não faz", () => {
  it("GUARDA PERMANENTE: nenhuma chave estrangeira multi-inquilino sem account_id", async () => {
    const { data, error } = await admin.rpc("fks_sem_isolamento_de_conta");
    expect(error).toBeNull();

    // Se este teste ficar vermelho, NÃO o ajuste: ele está certo e o
    // banco está aberto. A linha devolvida nomeia exatamente a chave a
    // corrigir, e a correção é a da migration 035 — a chave passa a
    // referenciar `(coluna, account_id)` contra o `UNIQUE (id,
    // account_id)` da tabela-pai. Reaplicar a 035 conserta em lote:
    // ela é dirigida por catálogo e idempotente.
    const abertas = (data ?? []) as Array<{ filho: string; chave: string; colunas: string; pai: string }>;
    const descricao = abertas.map((f) => `${f.filho}.(${f.colunas}) -> ${f.pai} [${f.chave}]`).join("\n  ");
    expect(abertas.length, `chaves estrangeiras atravessáveis entre contas:\n  ${descricao}`).toBe(0);
  });

  it("a própria auditoria não é superfície: anon e authenticated não executam a função de catálogo", async () => {
    const anon = anonClient();
    const { error: erroAnon } = await anon.rpc("fks_sem_isolamento_de_conta");
    expect(erroAnon, "anon não deveria executar a introspecção de catálogo").not.toBeNull();

    const viewer = await clientAs("viewer");
    const { error: erroViewer } = await viewer.rpc("fks_sem_isolamento_de_conta");
    expect(erroViewer, "authenticated não deveria executar a introspecção de catálogo").not.toBeNull();
  });
});

describe("Ataque real: apontar para linha de outra conta (regressão permanente)", () => {
  let contaA = "";
  let contaB = "";
  let pessoaB = "";
  let funilA = "";
  let etapaA = "";

  beforeAll(async () => {
    const a = await createThrowawayUser(admin, "fk-iso-a");
    limpeza.push(() => deleteThrowawayUser(admin, a.userId));
    const b = await createThrowawayUser(admin, "fk-iso-b");
    limpeza.push(() => deleteThrowawayUser(admin, b.userId));

    contaA = await contaDe(a.userId);
    contaB = await contaDe(b.userId);

    const { data, error } = await admin
      .schema("aba_people")
      .from("pessoas")
      .insert({ account_id: contaB, nome_exibicao: "Alvo da conta B" })
      .select("id")
      .single();
    if (error) throw new Error(`beforeAll: falha ao semear pessoa na conta B: ${error.message}`);
    pessoaB = data!.id as string;

    // Funil e etapa na conta A. Semeados aqui de propósito: sem eles o
    // caso da oportunidade não teria o que atacar e passaria por omissão
    // — teste que não roda parece verde do jeito errado (lição da 02.13.b).
    const { data: funil, error: erroFunil } = await admin
      .schema("aba_sales")
      .from("funis")
      .insert({ account_id: contaA, nome: "Funil do ataque 02.15" })
      .select("id")
      .single();
    if (erroFunil) throw new Error(`beforeAll: falha ao semear funil na conta A: ${erroFunil.message}`);
    funilA = funil!.id as string;

    const { data: etapa, error: erroEtapa } = await admin
      .schema("aba_sales")
      .from("etapas_funil")
      .insert({ funil_id: funilA, nome: "Entrada", ordem: 1 })
      .select("id")
      .single();
    if (erroEtapa) throw new Error(`beforeAll: falha ao semear etapa na conta A: ${erroEtapa.message}`);
    etapaA = etapa!.id as string;
  });

  // NOTA DELIBERADA SOBRE O PAPEL USADO NO ATAQUE: estes casos atacam com
  // `service_role`, que é o papel MAIS forte do sistema e ignora RLS por
  // completo. Não é para facilitar — é para provar mais. Se nem
  // `service_role` consegue atravessar a fronteira, nenhum papel abaixo
  // dele consegue. E é exatamente o caminho que a RLS nunca protegeu:
  // Edge Function e job de `pg_cron` rodam como `service_role` (achado
  // A06 da Subetapa 01.8). A chave composta protege esse caminho também,
  // que é o que a RLS, por construção, jamais faria.

  it("nota da conta A não pode apontar para pessoa da conta B", async () => {
    const { error } = await admin
      .schema("aba_people")
      .from("pessoa_notas")
      .insert({ account_id: contaA, pessoa_id: pessoaB, conteudo: "ataque 02.15" });

    expect(error, "a escrita cruzada deveria ser recusada pelo banco").not.toBeNull();
    expect(error?.code, `esperava violação de chave estrangeira, veio: ${error?.message}`).toBe("23503");
  });

  it("oportunidade da conta A não pode apontar para pessoa da conta B", async () => {
    expect(funilA, "fixture incompleta: o caso precisa de funil na conta A").toBeTruthy();

    const { error } = await admin
      .schema("aba_sales")
      .from("oportunidades")
      .insert({
        account_id: contaA,
        funil_id: funilA,
        etapa_id: etapaA,
        pessoa_id: pessoaB,
        titulo: "ataque 02.15",
      });

    expect(error, "a escrita cruzada deveria ser recusada pelo banco").not.toBeNull();
    expect(error?.code, `esperava violação de chave estrangeira, veio: ${error?.message}`).toBe("23503");
  });

  it("CONTROLE POSITIVO: a mesma oportunidade com pessoa da PRÓPRIA conta é aceita", async () => {
    const { data: pessoaA, error: erroPessoa } = await admin
      .schema("aba_people")
      .from("pessoas")
      .insert({ account_id: contaA, nome_exibicao: "Pessoa da conta A" })
      .select("id")
      .single();
    expect(erroPessoa).toBeNull();

    const { error } = await admin
      .schema("aba_sales")
      .from("oportunidades")
      .insert({
        account_id: contaA,
        funil_id: funilA,
        etapa_id: etapaA,
        pessoa_id: pessoaA!.id,
        titulo: "controle: mesma conta",
      });

    expect(error, "a correção não pode ter quebrado a oportunidade legítima").toBeNull();
  });

  it("CONTROLE POSITIVO: a mesma escrita DENTRO da própria conta continua funcionando", async () => {
    // Sem este controle, os casos acima passariam também se a tabela
    // estivesse quebrada por completo — "barrado" não prova isolamento,
    // prova só que algo falhou.
    const { data, error } = await admin
      .schema("aba_people")
      .from("pessoa_notas")
      .insert({ account_id: contaB, pessoa_id: pessoaB, conteudo: "controle: mesma conta" })
      .select("id")
      .single();

    expect(error, "a escrita legítima não pode ter sido quebrada pela correção").toBeNull();
    expect(data?.id).toBeTruthy();
  });
});

describe("Convite — teto de validade (migration 036)", () => {
  it("pedir 3650 dias devolve um convite de no máximo 7", async () => {
    const owner = await clientAs("owner");
    const { data, error } = await owner.rpc("criar_convite", {
      p_role: "viewer",
      p_label: "teto de validade 02.15",
      p_dias_validade: 3650,
    });

    expect(error).toBeNull();
    const convite = data as { ok: boolean; invitation_id: string; expires_at: string };
    expect(convite.ok).toBe(true);

    limpeza.push(async () => {
      await admin.from("account_invitations").delete().eq("id", convite.invitation_id);
    });

    const dias = (new Date(convite.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(dias, `convite nasceu com ${dias.toFixed(1)} dias de validade`).toBeLessThanOrEqual(7.01);
    expect(dias).toBeGreaterThan(6.9);
  });
});
