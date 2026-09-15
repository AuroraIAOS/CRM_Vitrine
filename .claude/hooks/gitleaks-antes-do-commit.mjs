#!/usr/bin/env node
/**
 * H1 — varredura de segredos antes de todo `git commit` (`CLAUDE.md` §4/§5).
 *
 * Roda `gitleaks protect --staged` sobre o que está no índice e recusa o
 * commit se achar alguma coisa. A varredura deixa de depender de alguém
 * lembrar dela.
 *
 * O binário não vem no PATH deste Windows depois da instalação por winget
 * (`instrucoes.md` §5): procura no PATH e, se não achar, no caminho do
 * winget. **Se não encontrar de jeito nenhum, o commit é BARRADO** — uma
 * varredura que falha em silêncio é pior que nenhuma.
 *
 * Falso positivo confirmado se suprime por fingerprint (`.gitleaksignore`),
 * nunca reescrevendo histórico por reflexo (`instrucoes.md` §6).
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

const entrada = JSON.parse(readFileSync(0, "utf-8"));
if ((entrada.tool_name ?? "") !== "Bash" && (entrada.tool_name ?? "") !== "PowerShell") process.exit(0);

const comando = String(entrada.tool_input?.command ?? "");
if (!/(^|[|;&]|\s)git\s+commit\b/.test(comando)) process.exit(0);

function responder(decisao, motivo) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decisao,
      permissionDecisionReason: motivo,
    },
  }));
  process.exit(0);
}

const doWinget = path.join(
  homedir(),
  "AppData/Local/Microsoft/WinGet/Packages",
  "Gitleaks.Gitleaks_Microsoft.Winget.Source_8wekyb3d8bbwe/gitleaks.exe",
);

const candidatos = ["gitleaks", doWinget, doWinget.replace(/\.exe$/, "")];
let binario = null;
for (const c of candidatos) {
  if (c !== "gitleaks" && !existsSync(c)) continue;
  const versao = spawnSync(c, ["version"], { encoding: "utf-8" });
  if (versao.status === 0) { binario = c; break; }
}

if (!binario) {
  responder("deny",
    "gitleaks não encontrado — e commit sem varredura de segredo não passa (CLAUDE.md §4). " +
    "Instale com `winget install --id Gitleaks.Gitleaks -e` e tente de novo " +
    "(o binário só entra no PATH depois de reiniciar o shell; o caminho completo do winget funciona na hora).");
}

const r = spawnSync(binario, ["protect", "--staged", "--no-banner", "--redact"], {
  cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
  encoding: "utf-8",
});

if (r.status === 0) process.exit(0);

const saida = `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").filter((l) => l.trim()).slice(-25).join("\n");
responder("deny",
  "gitleaks achou segredo no que está prestes a ser commitado — o commit foi barrado (CLAUDE.md §4).\n" +
  `${saida}\n` +
  "Se for falso positivo confirmado, suprima por fingerprint no `.gitleaksignore`; nunca reescreva histórico por reflexo.");
