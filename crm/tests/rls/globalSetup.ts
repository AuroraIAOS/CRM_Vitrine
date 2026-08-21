import { config } from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { AMBIENTE_DE_TESTE } from "./ambiente";

/**
 * Autentica os quatro papéis UMA VEZ por execução — Subetapa 02.13.b
 * ==================================================================
 *
 * O PROBLEMA QUE ISTO RESOLVE
 *
 * `helpers.ts` sempre teve um `roleClientCache`, mas ele é cache **de
 * módulo**, e o Vitest dá a cada arquivo de teste um registro de módulos
 * próprio. O cache nunca atravessou a fronteira entre arquivos — com 17
 * arquivos × até 4 papéis, a suíte fazia **até 68 `signInWithPassword` em
 * ~45 segundos**, muito acima do teto do endpoint de token do Supabase.
 *
 * O sintoma não parecia rate limit: as asserções falhavam como "conjunto
 * vazio onde deveria haver linha", exatamente o que uma RLS quebrada
 * produz. Sem token, o cliente cai para anônimo e a RLS nega tudo. Foram
 * três execuções bloqueadas na Subetapa 02.12 — inclusive uma **depois de 12
 * minutos de espera**, o que finalmente mostrou que o problema não era a
 * janela entre execuções, e sim a aritmética dentro de uma.
 *
 * `globalSetup` roda uma vez no processo principal, antes de qualquer
 * arquivo: **4 logins por execução, não 68.**
 *
 * E o cache em disco vai além: enquanto o token vale (1 hora), a execução
 * seguinte não faz login nenhum — que é a condição de que o portão
 * adversarial da 02.15 depende, porque ele reexecuta a suíte muitas vezes.
 *
 * O arquivo de cache é gitignorado e guarda token de sessão de usuário de
 * TESTE, nunca senha. A senha continua só no `.env`.
 */

const AQUI = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
config({ path: path.resolve(AQUI, "../../../.env") });
config({ path: path.resolve(AQUI, "../../.env.test") });

export const CAMINHO_CACHE = path.resolve(AQUI, ".sessoes-teste.json");

const PAPEIS = ["owner", "admin", "agent", "viewer"] as const;
type Papel = (typeof PAPEIS)[number];

export type SessaoCacheada = { access_token: string; refresh_token: string; expires_at: number };

/** Margem antes do vencimento: token que expira no meio da suíte é pior que login a mais. */
const MARGEM_SEGUNDOS = 10 * 60;

function emailDoPapel(papel: Papel): string | undefined {
  return {
    owner: process.env.TEST_OWNER_EMAIL,
    admin: process.env.TEST_ADMIN_EMAIL,
    agent: process.env.TEST_AGENT_EMAIL,
    viewer: process.env.TEST_VIEWER_EMAIL,
  }[papel];
}

function lerCache(): Partial<Record<Papel, SessaoCacheada>> {
  try {
    return JSON.parse(fs.readFileSync(CAMINHO_CACHE, "utf8"));
  } catch {
    return {};
  }
}

export default async function setup() {
  const url = AMBIENTE_DE_TESTE.url;
  const anon = AMBIENTE_DE_TESTE.anonKey;
  const senha = process.env.TEST_USER_PASSWORD;
  if (!url || !anon || !senha) {
    throw new Error("globalSetup: TEST_USER_PASSWORD e obrigatorio (crm/.env.test). URL e chave do projeto de TESTE vem de ambiente.ts.");
  }

  const agora = Math.floor(Date.now() / 1000);
  const cache = lerCache();
  let reaproveitados = 0;
  let novos = 0;

  for (const papel of PAPEIS) {
    const guardada = cache[papel];
    if (guardada && guardada.expires_at - agora > MARGEM_SEGUNDOS) {
      reaproveitados++;
      continue;
    }

    const email = emailDoPapel(papel);
    if (!email) throw new Error(`globalSetup: e-mail de teste ausente para o papel "${papel}".`);

    const cliente = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await cliente.auth.signInWithPassword({ email, password: senha });
    if (error) {
      throw new Error(
        `globalSetup: falha ao autenticar "${papel}" (${email}): ${error.message}. ` +
          `Se for rate limit, aguarde alguns minutos — o cache em disco evita que isso volte a acontecer.`,
      );
    }
    cache[papel] = {
      access_token: data.session!.access_token,
      refresh_token: data.session!.refresh_token,
      expires_at: data.session!.expires_at!,
    };
    novos++;
  }

  fs.writeFileSync(CAMINHO_CACHE, JSON.stringify(cache, null, 2));
  console.log(`\n[RLS] sessões prontas — ${novos} login(s) novo(s), ${reaproveitados} reaproveitada(s) do cache.\n`);
}
