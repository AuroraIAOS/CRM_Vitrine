import { createClient } from "@supabase/supabase-js";

// Nomes exatamente como gravados no .env real da raiz do repositório
// (VITE_SUPABASE__URL, com underscore duplo) — não normalizar aqui sem
// atualizar o .env junto, ou a app deixa de ler a variável.
const url = import.meta.env.VITE_SUPABASE__URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "VITE_SUPABASE__URL e VITE_SUPABASE_ANON_KEY são obrigatórios (.env da raiz do repo). " +
      "Somente a anon key vai no frontend — service_role nunca.",
  );
}

/**
 * Cliente único do app (anon key). Sem generic `Database<>` ainda — o
 * schema núcleo (public/access/licensing) só é aplicado na Subetapa 01.2;
 * regenerar tipos (`supabase gen types typescript`) e tipar o client
 * depois que o schema existir.
 */
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
