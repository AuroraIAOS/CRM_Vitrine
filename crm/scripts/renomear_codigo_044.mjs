#!/usr/bin/env node
/**
 * Renome de IDENTIFICADORES no código — Subetapa 03.6.b
 * =====================================================
 * Companheiro de `db/migrations/044`. Só troca identificador: nome de
 * tabela em `.from(...)`, nome de coluna, nome e parâmetro de RPC, e o
 * símbolo TypeScript correspondente.
 *
 * **NÃO troca prosa.** "Serviço" continua sendo o guarda-chuva do
 * domínio (D-V1) e a palavra é legítima em texto de tela; e em
 * `features/health` "plano" já significa o planejamento clínico, que é
 * justamente o sentido que esta subetapa está preservando. Rótulo de
 * tela que precisa mudar é ajustado à mão, com o diff revisado.
 *
 * USO: node scripts/renomear_codigo_044.mjs [--conferir]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const conferir = process.argv.includes("--conferir");

/** `features/health` fica de fora: lá "plano" é o planejamento clínico. */
const EXCLUIDOS = [path.join("src", "features", "health")];

/** Ordem importa: o mais específico primeiro. */
const TROCAS = [
  // --- nomes de tabela como string ---
  [/"variantes_servico"/g, '"variantes_procedimento"'],
  [/"agendamento_servicos"/g, '"agendamento_procedimentos"'],
  [/"planos_cliente"/g, '"pacotes_cliente"'],
  [/"saldos_plano"/g, '"saldos_pacote"'],
  [/"extrato_plano"/g, '"extrato_pacote"'],
  [/"itens_plano"/g, '"itens_pacote"'],
  [/"servicos"/g, '"procedimentos"'],
  [/"planos"/g, '"pacotes"'],
  // --- nome de função/RPC e seus parâmetros ---
  [/\bplanos_vencendo_em\b/g, "pacotes_vencendo_em"],
  [/\bexpirar_planos\b/g, "expirar_pacotes"],
  [/\bvender_plano\b/g, "vender_pacote"],
  [/\bp_plano_cliente_id\b/g, "p_pacote_cliente_id"],
  [/\bp_plano_id\b/g, "p_pacote_id"],
  [/\bp_servico_id\b/g, "p_procedimento_id"],
  // --- colunas (snake_case, como o banco as devolve) ---
  [/\bvariante_servico_id\b/g, "variante_procedimento_id"],
  [/\bplano_cliente_id\b/g, "pacote_cliente_id"],
  [/\bservico_id\b/g, "procedimento_id"],
  [/\bplano_id\b/g, "pacote_id"],
  // --- símbolos TypeScript (camelCase e PascalCase) ---
  [/\bvarianteServicoId\b/g, "varianteProcedimentoId"],
  [/\bplanoClienteId\b/g, "pacoteClienteId"],
  [/\bservicoIds\b/g, "procedimentoIds"],
  [/\bservicoId\b/g, "procedimentoId"],
  [/\bplanoIds\b/g, "pacoteIds"],
  [/\bplanoId\b/g, "pacoteId"],
  [/\bplanoNome\b/g, "pacoteNome"],
  [/\bplanoCliente\b/g, "pacoteCliente"],
  [/\buseServicos\b/g, "useProcedimentos"],
  [/\buseCriarServico\b/g, "useCriarProcedimento"],
  [/\buseAlternarAtivoServico\b/g, "useAlternarAtivoProcedimento"],
  [/\busePlanos\b/g, "usePacotes"],
  [/\buseCriarPlano\b/g, "useCriarPacote"],
  [/\buseVenderPlano\b/g, "useVenderPacote"],
  [/\buseAdicionarItemPlano\b/g, "useAdicionarItemPacote"],
  [/\bServicosTab\b/g, "ProcedimentosTab"],
  [/\bPlanosTab\b/g, "PacotesTab"],
  [/\.\/ServicosTab\b/g, "./ProcedimentosTab"],
  [/\.\/PlanosTab\b/g, "./PacotesTab"],
];

function arquivos(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (nome === "node_modules" || nome === "dist") continue;
      saida.push(...arquivos(p));
    } else if (/\.(ts|tsx|mjs)$/.test(nome)) {
      saida.push(p);
    }
  }
  return saida;
}

const alvos = [
  ...arquivos(path.join(RAIZ, "src")),
  ...arquivos(path.join(RAIZ, "tests")),
  ...arquivos(path.join(RAIZ, "scripts")),
].filter((p) => {
  const rel = path.relative(RAIZ, p);
  if (rel.includes("renomear_codigo_044") || rel.includes("gerar_renome_044")) return false;
  return !EXCLUIDOS.some((e) => rel.startsWith(e));
});

let tocados = 0;
let trocasTotais = 0;
for (const p of alvos) {
  const antes = readFileSync(p, "utf-8");
  let depois = antes;
  for (const [re, para] of TROCAS) depois = depois.replace(re, para);
  if (depois !== antes) {
    tocados += 1;
    trocasTotais += antes.split(/\r?\n/).filter((l, i) => l !== depois.split(/\r?\n/)[i]).length;
    if (!conferir) writeFileSync(p, depois);
    console.log(`  ${path.relative(RAIZ, p)}`);
  }
}
console.log(`\n${tocados} arquivo(s) ${conferir ? "seriam alterados" : "alterados"}, ~${trocasTotais} linha(s).`);
console.log(`features/health preservado de propósito: lá "plano" é o planejamento clínico.`);
