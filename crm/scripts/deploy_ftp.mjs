/**
 * Deploy FTP para o subdomínio de demonstração — Subetapa 02.13.a
 * ================================================================
 *
 * Envia `dist/` para a Hostgator por FTPS. Segue o runbook do CRM-Sindcom
 * (`docs/deploy.md` de lá), que traz duas armadilhas MEDIDAS em produção e
 * que este script trata explicitamente:
 *
 * 1. **Host FTP não é `ftp.<dominio>`.** Esse nome resolve para a
 *    Cloudflare, que faz proxy só de HTTP/HTTPS e não repassa a porta 21 —
 *    a conexão simplesmente expira, sem erro que explique. Usar o servidor
 *    real da Hostgator (`brNNNN.hostgator.com.br`), que aparece na URL do
 *    cPanel. O `.env` deste projeto já traz o nome certo.
 *
 * 2. **`451` no canal de dados sob TLS.** O pure-ftpd da Hostgator às vezes
 *    aborta o canal de DADOS quando ele está cifrado, e o arquivo fica com
 *    0 bytes ou truncado — o pior tipo de falha, porque o upload "termina".
 *    Ao pegar 451, este script reenvia com `--ftp-ssl-control`: TLS apenas
 *    no canal de controle, dados em claro. **A senha continua protegida**;
 *    o que trafega em claro são assets públicos (JS, CSS, ícones), que
 *    qualquer visitante baixa do site de qualquer forma.
 *
 * Nenhuma credencial neste arquivo — tudo vem do `.env` da raiz, gitignorado.
 *
 * Uso:
 *   node scripts/deploy_ftp.mjs             # envia e verifica
 *   node scripts/deploy_ftp.mjs --verificar # só confere o que já está no ar
 */

import { config } from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "..");
config({ path: path.resolve(RAIZ, "../.env") });

const HOST = process.env.HOSTGATOR_VITRINE_FTP_HOST;
const PORTA = process.env.HOSTGATOR_VITRINE_FTP_PORT || "21";
const USUARIO = process.env.HOSTGATOR_VITRINE_FTP_USER;
const SENHA = process.env.HOSTGATOR_VITRINE_FTP_PASS;
const DOMINIO = process.env.HOSTGATOR_VITRINE_DOMINIO;

for (const [nome, v] of Object.entries({
  HOSTGATOR_VITRINE_FTP_HOST: HOST,
  HOSTGATOR_VITRINE_FTP_USER: USUARIO,
  HOSTGATOR_VITRINE_FTP_PASS: SENHA,
  HOSTGATOR_VITRINE_DOMINIO: DOMINIO,
})) {
  if (!v) throw new Error(`deploy_ftp: variável ausente (${nome}). Confira o .env da raiz.`);
}

const DIST = path.join(RAIZ, "dist");
const soVerificar = process.argv.includes("--verificar");

/** Lista recursiva de arquivos de `dist/`, com caminho relativo em POSIX. */
function arquivos(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const completo = path.join(dir, e.name);
    return e.isDirectory() ? arquivos(completo, base) : [path.relative(base, completo).split(path.sep).join("/")];
  });
}

/** curl com a senha via `--user`; nunca ecoada. */
async function curl(args) {
  try {
    const { stdout, stderr } = await execFileAsync("curl", args, { maxBuffer: 10 * 1024 * 1024 });
    return { ok: true, saida: stdout + stderr };
  } catch (e) {
    return { ok: false, saida: `${e.stdout ?? ""}${e.stderr ?? ""}`, codigo: e.code };
  }
}

async function enviar(rel) {
  const local = path.join(DIST, rel);
  const destino = `ftp://${HOST}:${PORTA}/${rel}`;
  const base = ["-sS", "--ftp-create-dirs", "--user", `${USUARIO}:${SENHA}`, "-T", local, destino];

  // Primeira tentativa: TLS no controle E nos dados.
  let r = await curl([...base, "--ssl-reqd"]);
  if (r.ok) return "tls";

  // 451: canal de dados sob TLS abortado. Reenviar com TLS só no controle.
  if (/451/.test(r.saida) || /data connection/i.test(r.saida)) {
    r = await curl([...base, "--ftp-ssl-control"]);
    if (r.ok) return "tls-controle";
  }
  throw new Error(`falha ao enviar ${rel}: ${r.saida.trim().slice(0, 200)}`);
}

/** Tamanho remoto por `curl -I` no FTP — a verificação de integridade do runbook. */
async function tamanhoRemoto(rel) {
  const r = await curl(["-sS", "-I", "--ftp-ssl-control", "--user", `${USUARIO}:${SENHA}`, `ftp://${HOST}:${PORTA}/${rel}`]);
  const m = r.saida.match(/Content-Length:\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

async function verificarHttp() {
  const alvos = ["/", "/configuracoes", "/prontuario"];
  const linhas = [];
  for (const caminho of alvos) {
    const r = await curl(["-sS", "-o", "/dev/null", "-w", "%{http_code}", `https://${DOMINIO}${caminho}`]);
    linhas.push(`  ${caminho.padEnd(16)} → HTTP ${r.saida.trim()}`);
  }
  // O HTML servido precisa trazer a âncora do app e os assets com hash.
  const html = await curl(["-sS", `https://${DOMINIO}/`]);
  const temRoot = /id="root"/.test(html.saida);
  const temAssets = /\/assets\/index-[^"]+\.js/.test(html.saida);
  linhas.push(`  HTML com id="root": ${temRoot ? "sim" : "NÃO"} · referência a /assets/index-*.js: ${temAssets ? "sim" : "NÃO"}`);
  return linhas.join("\n");
}

// ---------------------------------------------------------------- execução
if (!fs.existsSync(DIST)) throw new Error("deploy_ftp: `dist/` não existe. Rode `npm run build` antes.");

const lista = arquivos(DIST);
console.log(`\nDeploy → https://${DOMINIO}`);
console.log(`Origem: dist/ (${lista.length} arquivos)\n`);

if (!soVerificar) {
  const modos = { tls: 0, "tls-controle": 0 };
  for (const rel of lista) {
    const modo = await enviar(rel);
    modos[modo]++;
    process.stdout.write(`  enviado ${rel}${modo === "tls-controle" ? "  (reenviado: 451 no canal de dados)" : ""}\n`);
  }
  console.log(`\n${lista.length} arquivos enviados — ${modos.tls} com TLS pleno, ${modos["tls-controle"]} com TLS só no controle.`);
}

console.log("\nIntegridade (tamanho local × remoto):");
let divergencias = 0;
for (const rel of lista) {
  const local = fs.statSync(path.join(DIST, rel)).size;
  const remoto = await tamanhoRemoto(rel);
  if (remoto !== local) {
    divergencias++;
    console.log(`  DIVERGE ${rel}: local ${local} × remoto ${remoto ?? "ausente"}`);
  }
}
console.log(divergencias === 0 ? `  ${lista.length} arquivos conferidos, 0 divergências.` : `  ${divergencias} DIVERGÊNCIA(S) — reenviar.`);

console.log("\nHTTP:");
console.log(await verificarHttp());
console.log("");
