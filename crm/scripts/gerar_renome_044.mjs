#!/usr/bin/env node
/**
 * Gerador da seção de funções da migration 044 (Subetapa 03.6.b)
 * ==============================================================
 * POR QUE EXISTE: `ALTER TABLE ... RENAME` conserta views, policies e
 * chaves estrangeiras sozinho, porque essas guardam OID. **Corpo de
 * função plpgsql é TEXTO**, resolvido só na execução — nove funções
 * continuariam apontando para tabelas que não existem mais, e o erro
 * só apareceria quando alguém as chamasse.
 *
 * Transcrever nove corpos à mão é a forma mais provável de introduzir
 * um erro numa subetapa que promete "renome sem mudança de
 * comportamento". Então a saída SQL é GERADA do catálogo do projeto de
 * teste (que já está em 043), com substituições explícitas, e o
 * resultado é **commitado** — quem revisa lê o SQL que vai rodar.
 *
 * USO: node scripts/gerar_renome_044.mjs > ../db/migrations/_044_funcoes.sql
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const env = {};
for (const l of readFileSync("C:/GitHub/CRM_Vitrine/.env", "utf-8").split(/\r?\n/)) {
  const m = l.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const c = new pg.Client({ connectionString: env.SUPABASE_TEST_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

/** Nome qualificado antigo → novo. Ordem: mais específico primeiro. */
const TABELAS = [
  ["aba_catalog.variantes_servico", "aba_catalog.variantes_procedimento"],
  ["aba_catalog.itens_plano", "aba_catalog.itens_pacote"],
  ["aba_catalog.servicos", "aba_catalog.procedimentos"],
  ["aba_catalog.planos", "aba_catalog.pacotes"],
  ["aba_finance.planos_cliente", "aba_finance.pacotes_cliente"],
  ["aba_finance.saldos_plano", "aba_finance.saldos_pacote"],
  ["aba_finance.extrato_plano", "aba_finance.extrato_pacote"],
  ["aba_scheduling.agendamento_servicos", "aba_scheduling.agendamento_procedimentos"],
];

/** Funções que mudam de nome (as três do sentido "pacote"). */
const FUNCOES = [
  ["aba_finance.vender_plano", "aba_finance.vender_pacote"],
  ["aba_finance.expirar_planos", "aba_finance.expirar_pacotes"],
  ["aba_finance.planos_vencendo_em", "aba_finance.pacotes_vencendo_em"],
];

/**
 * Identificadores soltos: colunas, PARÂMETROS de função, variáveis
 * locais e `DETAIL` de erro.
 *
 * Cuidado que custou uma rodada: `\bp_plano\b` NÃO casa dentro de
 * `p_plano_id`, porque `_` é caractere de palavra e o `\b` final não
 * existe ali. Os prefixos precisam de padrão próprio, e os mais longos
 * vêm primeiro.
 *
 * Renomear parâmetro **muda o contrato do RPC** no PostgREST:
 * `rpc("vender_plano", { p_plano_id })` passa a ser
 * `rpc("vender_pacote", { p_pacote_id })`. É intencional, e o front
 * muda junto na mesma subetapa.
 */
const IDENTIFICADORES = [
  [/\bvariante_servico_id\b/g, "variante_procedimento_id"],
  [/\b([vp])_plano_cliente_id\b/g, "$1_pacote_cliente_id"],
  [/\b([vp])_plano_id\b/g, "$1_pacote_id"],
  [/\b([vp])_servico_id\b/g, "$1_procedimento_id"],
  [/\b([vp])_plano\b/g, "$1_pacote"],
  [/\b([vp])_servico\b/g, "$1_procedimento"],
  [/\bplano_cliente_id\b/g, "pacote_cliente_id"],
  [/\bservico_id\b/g, "procedimento_id"],
  [/\bplano_id\b/g, "pacote_id"],
  [/\bplano_nao_encontrado\b/g, "pacote_nao_encontrado"],
  [/\bplano_inativo\b/g, "pacote_inativo"],
  [/\bplano_sem_itens\b/g, "pacote_sem_itens"],
  [/\bidx_saldos_plano_servico_unico\b/g, "idx_saldos_pacote_procedimento_unico"],
];

/**
 * Prosa dos comentários: só nas funções cujo assunto É o pacote. Fora
 * dessas, "plano" no comentário pode significar outra coisa e trocar
 * seria pior que deixar.
 */
const PROSA = new Set([
  "aba_finance.vender_plano",
  "aba_finance.expirar_planos",
  "aba_finance.planos_vencendo_em",
  "aba_finance.estornar_sessao",
  "aba_finance.aplicar_extrato_ao_saldo",
  "aba_finance.ao_concluir_agendamento",
]);

function traduzir(sql, nomeQualificado) {
  let s = sql;
  for (const [de, para] of [...TABELAS, ...FUNCOES]) s = s.split(de).join(para);
  for (const [re, para] of IDENTIFICADORES) s = s.replace(re, para);
  if (PROSA.has(nomeQualificado)) {
    s = s
      .replace(/\bplanos\b/g, "pacotes")
      .replace(/\bplano\b/g, "pacote")
      .replace(/\bPlanos\b/g, "Pacotes")
      .replace(/\bPlano\b/g, "Pacote")
      .replace(/\bserviços\b/g, "procedimentos")
      .replace(/\bserviço\b/g, "procedimento");
  }
  return s;
}

const { rows } = await c.query(`
  SELECT n.nspname||'.'||p.proname AS nome,
         pg_get_functiondef(p.oid)  AS def,
         pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prokind = 'f'
     AND n.nspname IN ('aba_catalog','aba_finance','aba_scheduling','aba_health','public','access')
     AND pg_get_functiondef(p.oid) ~ '(aba_catalog\\.servicos|aba_catalog\\.planos|aba_catalog\\.itens_plano|aba_catalog\\.variantes_servico|aba_finance\\.planos_cliente|aba_finance\\.saldos_plano|aba_finance\\.extrato_plano|aba_scheduling\\.agendamento_servicos|\\mservico_id\\M|\\mplano_id\\M|\\mplano_cliente_id\\M|\\mvariante_servico_id\\M)'
   ORDER BY 1`);

const saida = [];
saida.push("-- ============================================================");
saida.push("-- SEÇÃO 5 — FUNÇÕES (gerada por crm/scripts/gerar_renome_044.mjs)");
saida.push("--");
saida.push("-- Corpo de função plpgsql é TEXTO: `ALTER TABLE ... RENAME` não o");
saida.push("-- alcança. Estas " + rows.length + " funções foram encontradas por varredura de");
saida.push("-- catálogo (nenhuma lista escrita à mão) e reescritas com os nomes");
saida.push("-- novos. A seção 8 confere que nenhuma sobrou com nome antigo.");
saida.push("-- ============================================================");
saida.push("");

for (const r of rows) {
  const renomeada = FUNCOES.find(([a]) => a === r.nome);
  const argsNovos = traduzir(r.args, r.nome);
  saida.push(`-- ${r.nome}${renomeada ? "  →  " + renomeada[1] : ""}`);

  /**
   * `CREATE OR REPLACE FUNCTION` **não muda nome de parâmetro** — o
   * Postgres recusa com `cannot change name of input parameter`. Quando
   * a função mantém o nome mas um parâmetro dela é renomeado (o caso de
   * `estornar_sessao`, cujo `p_plano_cliente_id` vira
   * `p_pacote_cliente_id`), é preciso derrubar a versão antiga antes.
   *
   * Só vale para função sem dependente no banco. As de gatilho
   * (`ao_concluir_agendamento`, `aplicar_extrato_ao_saldo`) não têm
   * parâmetro nomeado e por isso nunca caem aqui — o que é bom, porque
   * um `DROP ... CASCADE` nelas levaria o gatilho junto.
   */
  if (!renomeada && argsNovos !== r.args) {
    saida.push(`-- Parâmetro renomeado (${r.args} → ${argsNovos}): CREATE OR REPLACE não dá conta.`);
    saida.push(`DROP FUNCTION IF EXISTS ${r.nome}(${r.args});`);
  }

  saida.push(traduzir(r.def, r.nome).trimEnd() + ";");
  saida.push("");
}

// As três que mudaram de nome deixam órfã a versão antiga.
saida.push("-- As três funções que mudaram de NOME deixam a versão antiga para trás.");
saida.push("-- DROP depois do CREATE, para nunca existir uma janela sem nenhuma das duas.");
for (const [antiga] of FUNCOES) {
  const r = rows.find((x) => x.nome === antiga);
  saida.push(`DROP FUNCTION IF EXISTS ${antiga}(${r ? r.args : ""});`);
}

console.log(saida.join("\n"));
console.error(`funções traduzidas: ${rows.length} — ${rows.map((r) => r.nome).join(", ")}`);
await c.end();
