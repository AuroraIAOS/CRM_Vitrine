#!/usr/bin/env node
/**
 * H4 — `CLAUDE.md` §13: merge nunca é decisão do CODE.
 *
 * Recusa `git merge`, `git rebase` sobre o `main`, `git push` que empurre para
 * o `main` e `git branch -f main`. O CODE executa, corrige e relata dentro do
 * bench ou da branch de trabalho; ordenar o merge é atribuição de Max.
 *
 * `git merge --abort` passa: desfazer não é fundir.
 */
import { readFileSync } from "node:fs";

const entrada = JSON.parse(readFileSync(0, "utf-8"));
if ((entrada.tool_name ?? "") !== "Bash" && (entrada.tool_name ?? "") !== "PowerShell") process.exit(0);

const comando = String(entrada.tool_input?.command ?? "");

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

const REGRA = "CLAUDE.md §13: fundir para o `main` é ordem exclusiva de Max. " +
  "Entregue o relatório e o parecer e pare — não funda por conta própria, nem com tudo verde.";

if (/(^|[|;&]|\s)git\s+merge(?!\s+--abort)/.test(comando)) negar(REGRA);
if (/(^|[|;&]|\s)git\s+rebase\s+[^|;&]*\b(main|origin\/main)\b/.test(comando)) negar(REGRA);
if (/(^|[|;&]|\s)git\s+push[^|;&]*\b(main|origin\s+main|HEAD:main|:main)\b/.test(comando)) negar(REGRA);
if (/(^|[|;&]|\s)git\s+branch\s+-[fM]+\s+main\b/.test(comando)) negar(REGRA);

process.exit(0);
