import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Config isolada dos testes (não carrega o plugin PWA do vite.config).
// A suíte RLS (a partir da Subetapa 01.2) fala direto com o Supabase via
// supabase-js (anon key + login), exercitando o caminho JWT real. Sem
// paralelismo entre arquivos para não embaralhar sessões/limpezas no banco
// compartilhado — mesmo padrão do CRM-Sindcom.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.spec.ts", "tests/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    // Autentica os 4 papeis UMA VEZ por execucao, no processo principal.
    // Sem isto sao ate 68 logins por rodada (17 arquivos x 4 papeis), porque
    // o cache de modulo de helpers.ts se esvazia a cada arquivo — ver o
    // cabecalho de tests/rls/globalSetup.ts. Subetapa 02.13.b.
    globalSetup: ["./tests/rls/globalSetup.ts"],
    globals: false,
  },
});
