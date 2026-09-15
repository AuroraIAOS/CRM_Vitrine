#!/usr/bin/env node
/**
 * H3 — guarda do `.env` (CLAUDE.md §4: segredo nunca aparece em log, resposta ou commit).
 *
 * Recusa, ANTES de a ferramenta rodar:
 *   · comando de shell que lê ou imprime `.env` / `.env.test` / `.env.local`;
 *   · leitura ou escrita desses arquivos pelas ferramentas de arquivo.
 *
 * O que NÃO bloqueia, de propósito: `git check-ignore .env` e `ls`, que só
 * olham o nome; e scripts do projeto (`node scripts/...`), que leem o `.env`
 * por dentro sem devolver o conteúdo à conversa — é assim que a suíte e as
 * evidências funcionam.
 *
 * A guarda do banco de TESTES não mora aqui: ela já existe em
 * `crm/tests/rls/ambiente.ts` e lança erro (Subetapa 02.15).
 */
import { readFileSync } from "node:fs";

const entrada = JSON.parse(readFileSync(0, "utf-8"));
const ferramenta = entrada.tool_name ?? "";
const alvo = entrada.tool_input ?? {};

function negar(motivo) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: motivo,
    },
  }));
  process.exit(0);
}

const ARQUIVO_SEGREDO = /(^|[\\/])\.env(\.[A-Za-z0-9_-]+)?$/;

if (ferramenta === "Read" || ferramenta === "Edit" || ferramenta === "Write" || ferramenta === "NotebookEdit") {
  const caminho = String(alvo.file_path ?? alvo.notebook_path ?? "").replace(/["']/g, "");
  if (ARQUIVO_SEGREDO.test(caminho.trim())) {
    negar(`CLAUDE.md §4: \`${caminho}\` guarda segredo e não se lê nem se edita por ferramenta. ` +
      `Peça a Max o valor que faltar, ou use um script que leia o arquivo por dentro sem imprimir o conteúdo.`);
  }
  process.exit(0);
}

if (ferramenta === "Bash" || ferramenta === "PowerShell") {
  const comando = String(alvo.command ?? "");
  // Lê/imprime conteúdo: cat, type, more, less, head, tail, strings, grep, rg,
  // Get-Content, Select-String, source/.  — seguidos de um caminho .env
  const leitura = /(^|[|;&]|\s)(cat|type|more|less|head|tail|strings|grep|egrep|fgrep|rg|sed|awk|nl|od|xxd|Get-Content|gc|Select-String|sls|source|\.)\s+[^|;&]*\.env(\.[A-Za-z0-9_-]+)?(\s|$|["'|;&])/i;
  const redirecionado = /[<]\s*[^|;&]*\.env(\.[A-Za-z0-9_-]+)?(\s|$)/i;
  const copia = /(^|[|;&]|\s)(cp|copy|mv|move|scp|curl|Invoke-WebRequest)\s+[^|;&]*\.env(\.[A-Za-z0-9_-]+)?(\s|$)/i;
  if (leitura.test(comando) || redirecionado.test(comando) || copia.test(comando)) {
    negar("CLAUDE.md §4: este comando imprimiria ou copiaria o conteúdo de um `.env`. " +
      "O segredo nunca aparece em log, resposta ou commit. Para conferir se uma variável existe, " +
      "rode um script que leia o arquivo e imprima só o NOME da variável.");
  }
}

process.exit(0);
