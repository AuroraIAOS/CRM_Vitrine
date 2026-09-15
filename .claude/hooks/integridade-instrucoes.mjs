#!/usr/bin/env node
/**
 * H5 — integridade do `handoffs/instrucoes.md` (`instrucoes.md` §6).
 *
 * O arquivo já esteve colado dentro de si mesmo por dois commits, com uma
 * entrada partida ao meio (Subetapa 02.13.a, achado na 02.14). A conferência
 * é uma linha: `grep -c '^# INSTRUÇÕES'` tem que devolver 1.
 *
 * Roda depois de toda escrita nele e devolve o aviso para o modelo corrigir
 * na hora, em vez de o defeito viajar para o commit.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const entrada = JSON.parse(readFileSync(0, "utf-8"));
const caminho = String(entrada.tool_input?.file_path ?? entrada.tool_response?.filePath ?? "");
// Só o arquivo de lições, e pelo caminho inteiro: `leitor-instrucoes.md` (o
// subagente) termina em "instrucoes.md" e não tem nada a ver com isto — o
// hook o acusou na primeira execução ao vivo, em 2026-09-15.
if (!/(^|\/)handoffs\/instrucoes\.md$/i.test(caminho.replace(/\\/g, "/"))) process.exit(0);

let texto;
try {
  texto = readFileSync(caminho, "utf-8");
} catch {
  process.exit(0);
}

const cabecalhos = texto.split(/\r?\n/).filter((l) => l.startsWith("# INSTRUÇÕES")).length;
if (cabecalhos === 1) process.exit(0);

process.stdout.write(JSON.stringify({
  decision: "block",
  reason:
    `${path.basename(caminho)} tem ${cabecalhos} cabeçalhos "# INSTRUÇÕES" — o esperado é 1. ` +
    "O arquivo já esteve colado dentro de si mesmo (02.13.a, achado na 02.14). " +
    "Confira antes de seguir; nenhuma entrada antiga se apaga na correção.",
}));
