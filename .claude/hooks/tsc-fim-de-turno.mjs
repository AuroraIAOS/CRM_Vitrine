#!/usr/bin/env node
/**
 * H2 — `tsc --noEmit` uma vez por turno, e só quando o turno mexeu em `crm/src`.
 *
 * O projeto não tem lint: o typecheck é o único portão estático além dos
 * testes (`docs/CODEBASE_MAP.md`). Rodar a cada edição seria caro; rodar no
 * fim do turno custa uma vez e devolve o erro enquanto o assunto ainda está
 * aberto.
 *
 * O controle é o carimbo em `.claude/.tsc-carimbo`: se nenhum arquivo de
 * `crm/src` for mais novo que ele, o hook não roda nada e não fala nada.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

try { readFileSync(0, "utf-8"); } catch { /* o Stop não manda payload útil */ }

const raiz = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const fonte = path.join(raiz, "crm", "src");
const carimbo = path.join(raiz, ".claude", ".tsc-carimbo");

if (!existsSync(fonte)) process.exit(0);

const desde = existsSync(carimbo) ? statSync(carimbo).mtimeMs : 0;

function maisNovo(dir) {
  let maior = 0;
  for (const nome of readdirSync(dir)) {
    const cheio = path.join(dir, nome);
    const s = statSync(cheio);
    maior = Math.max(maior, s.isDirectory() ? maisNovo(cheio) : s.mtimeMs);
  }
  return maior;
}

if (maisNovo(fonte) <= desde) process.exit(0);

const r = spawnSync("npx", ["tsc", "--noEmit"], {
  cwd: path.join(raiz, "crm"),
  encoding: "utf-8",
  shell: process.platform === "win32",
});

writeFileSync(carimbo, new Date().toISOString());

if (r.status === 0) {
  process.stdout.write(JSON.stringify({ suppressOutput: true }));
  process.exit(0);
}

const erros = `${r.stdout ?? ""}${r.stderr ?? ""}`
  .split("\n").filter((l) => /error TS/.test(l)).slice(0, 12).join("\n");

process.stdout.write(JSON.stringify({
  decision: "block",
  reason: `\`tsc --noEmit\` está vermelho depois das edições deste turno — corrija antes de seguir:\n${erros}`,
}));
