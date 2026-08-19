/**
 * Redefine a senha dos usuários da conta de demonstração — Subetapa 02.13.a
 *
 * POR QUE ESTE SCRIPT EXISTE
 *
 * A primeira senha de demonstração foi gravada no `.env` **sem aspas e com
 * `#` no meio**. O `dotenv` trata `#` como início de comentário em valor sem
 * aspas, então ele leu apenas os 4 primeiros caracteres — e como o seed
 * CRIOU e o script de sessão USOU o mesmo valor truncado, tudo funcionou nos
 * meus testes. Só quem lesse a senha completa direto do arquivo (Max) seria
 * recusado com "Invalid login credentials".
 *
 * O sintoma era o de menos: o efeito real é que sete usuários de um site
 * público na internet ficaram com **senha de 4 caracteres**. Truncamento
 * silencioso de segredo não dá erro em lugar nenhum — ele só enfraquece.
 *
 * Duas defesas, e não uma:
 *  - a senha nova usa alfabeto sem `#`, `$`, aspas, espaço e barra invertida;
 *  - o valor vai **entre aspas simples** no `.env`, que é o que faz o dotenv
 *    respeitar a string inteira independentemente do conteúdo.
 *
 * E a conferência abaixo compara o que está no ARQUIVO com o que o dotenv
 * LEU, antes de tocar em qualquer usuário — se divergirem, aborta.
 */

import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV = path.resolve(__dirname, "../../.env");
config({ path: ENV });

const URL = process.env.SUPABASE__URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const SENHA = process.env.DEMO_SENHA;

// ---- guarda contra truncamento silencioso -------------------------------
const linha = fs.readFileSync(ENV, "utf8").split(/\r?\n/).find((l) => l.startsWith("DEMO_SENHA="));
if (!linha) throw new Error("DEMO_SENHA ausente do .env");
const noArquivo = linha.slice("DEMO_SENHA=".length).replace(/^'/, "").replace(/'$/, "");
if (noArquivo !== SENHA) {
  throw new Error(
    `DEMO_SENHA truncada pelo dotenv: ${noArquivo.length} caracteres no arquivo, ${SENHA?.length ?? 0} lidos. ` +
      `Envolva o valor em aspas simples e evite '#' no meio.`,
  );
}
if (SENHA.length < 12) throw new Error(`DEMO_SENHA curta demais (${SENHA.length}). Mínimo 12.`);

const db = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const EMAILS = [
  "proprietaria@vitrinedemo.local",
  "recepcao@vitrinedemo.local",
  "esteticista@vitrinedemo.local",
  "fisioterapeuta@vitrinedemo.local",
  "terapeuta@vitrinedemo.local",
  "afastado@vitrinedemo.local",
  "auxiliar@vitrinedemo.local",
];

const { data: lista, error: erroLista } = await db.auth.admin.listUsers({ perPage: 200 });
if (erroLista) throw new Error(`listar usuários: ${erroLista.message}`);

let trocadas = 0;
for (const email of EMAILS) {
  const u = lista.users.find((x) => x.email === email);
  if (!u) {
    console.log(`  ausente  ${email} — rode o seed antes`);
    continue;
  }
  const { error } = await db.auth.admin.updateUserById(u.id, { password: SENHA });
  if (error) throw new Error(`redefinir ${email}: ${error.message}`);
  trocadas++;
}
console.log(`\n${trocadas} senha(s) redefinida(s) com ${SENHA.length} caracteres.`);

// ---- prova: autenticar de verdade com o valor lido do arquivo -----------
const publico = createClient(URL, ANON, { auth: { persistSession: false } });
let verdes = 0;
for (const email of EMAILS) {
  const { error } = await publico.auth.signInWithPassword({ email, password: noArquivo });
  if (error) console.log(`  FALHOU  ${email}: ${error.message}`);
  else verdes++;
  await publico.auth.signOut();
}
console.log(`Login conferido: ${verdes}/${EMAILS.length} entram com a senha que está no .env.\n`);
if (verdes !== EMAILS.length) process.exit(1);
