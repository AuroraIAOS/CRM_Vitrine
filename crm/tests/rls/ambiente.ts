// ============================================================
// ambiente.ts — de qual banco a suíte de teste tem permissão de falar
// (Subetapa 02.15)
//
// O ACHADO QUE ORIGINOU ESTE ARQUIVO. O portão adversarial da Etapa 02
// encontrou 8 contas de teste vivas dentro do banco de PRODUÇÃO —
// `equipe-admin-...@crmvitrine.local`, `gestao-fundador-...` — restos de
// execuções que morreram no meio e nunca limparam. O entulho em si era
// inofensivo. O que ele revelava não era:
//
//   a suíte de testes rodava contra o MESMO banco que serve a vitrine
//   pública. Todo `createThrowawayUser`, todo ataque adversarial e todo
//   `DELETE` de fixture aconteciam ao lado dos dados reais.
//
// Enquanto isso for verdade, cada portão de segurança futuro ataca
// produção, e a Etapa 03 herda esse arranjo. Max mandou separar
// (2026-08-20), mesmo estourando o escopo da 02.15.
//
// POR QUE UM ERRO E NÃO UM AVISO. A tentação era fazer a suíte "preferir"
// o projeto de teste e cair para produção quando ele faltasse. Isso é
// pior que não separar: o dia em que a variável sumisse — máquina nova,
// `.env` recriado, CRM-filho clonado — a suíte voltaria a produção em
// silêncio, verde, sem ninguém notar. Falha silenciosa em portão de
// segurança é o pior defeito possível, e este projeto já pagou por essa
// lição três vezes (`handoffs/instrucoes.md` §6).
//
// Então: variável ausente PARA a suíte, com a instrução do que fazer. E
// se a URL de teste for igual à de produção, para também — porque
// apontar as duas para o mesmo lugar anularia a separação sem que nada
// no arquivo denunciasse.
// ============================================================
import { config } from "dotenv";
import path from "node:path";

// `import.meta.url` e não `__dirname`: este módulo é importado tanto
// pelos specs (onde o Vitest fornece `__dirname`) quanto por
// `globalSetup.ts`, que roda como ESM puro e não tem `__dirname` — foi
// por isso que aquele arquivo já calculava o próprio caminho assim. O
// `replace` remove a barra que o Windows põe antes da letra do drive.
const AQUI = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

config({ path: path.resolve(AQUI, "../../../.env") });
config({ path: path.resolve(AQUI, "../../.env.test") });

const INSTRUCAO = `
A suíte de RLS só roda contra o projeto Supabase DE TESTE
("CRM Vitrine — TESTES"), nunca contra o de produção.

Faltam variáveis no .env da raiz. No painel do projeto de teste,
em Settings > API e Settings > Database, copie:

  SUPABASE_TEST__URL=<Project URL do projeto de teste>
  SUPABASE_TEST_ANON_KEY=<chave anon/publishable do projeto de teste>
  SUPABASE_TEST_SERVICE_ROLE_KEY=<chave service_role do projeto de teste>

Depois rode: node scripts/seed_test_users.mjs
`.trim();

function exigir(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`${nome} ausente.\n\n${INSTRUCAO}`);
  return valor;
}

const url = exigir("SUPABASE_TEST__URL");
const anonKey = exigir("SUPABASE_TEST_ANON_KEY");
const serviceRoleKey = exigir("SUPABASE_TEST_SERVICE_ROLE_KEY");

// A trava que sustenta a separação. Sem ela, bastaria alguém copiar os
// valores de produção para dentro das variáveis de teste — por descuido
// ou por pressa — e tudo voltaria a apontar para lá, com o nome errado.
const urlDeProducao = process.env.SUPABASE__URL;
if (urlDeProducao && new URL(url).host === new URL(urlDeProducao).host) {
  throw new Error(
    `SUPABASE_TEST__URL aponta para o MESMO projeto de SUPABASE__URL (${new URL(url).host}).\n` +
      `A suíte cria contas descartáveis, executa ataques adversariais e apaga fixtures — ` +
      `nada disso pode acontecer no banco que serve a vitrine pública.\n\n${INSTRUCAO}`,
  );
}

export const AMBIENTE_DE_TESTE = { url, anonKey, serviceRoleKey } as const;
