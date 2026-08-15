-- ============================================================
-- 005_harden_function_privileges.sql — nenhuma função nossa executável
-- por `anon` ou por PUBLIC em bloco (varredura, não lista manual)
--
-- ACHADO (Subetapa 01.2, medido no advisor de segurança do Supabase
-- logo após aplicar 001-004): mesmo com REVOKE ALL ... FROM PUBLIC
-- explícito em cada função de 001-004, o advisor reportou
-- is_account_member, handle_new_user, touch_presence e
-- record_webhook_failure como executáveis pelo papel `anon` — chamador
-- NÃO autenticado, via /rest/v1/rpc/<nome>.
--
-- CAUSA: revogar de PUBLIC não revoga um GRANT nominal já concedido a
-- um papel específico por default privilege do projeto Supabase — e
-- este projeto (como o CRM Maximus antes dele) tem uma concessão de
-- fábrica de EXECUTE a anon/authenticated/service_role em função nova.
-- Documentar a causa não bastava: era preciso revogar de `anon`
-- nominalmente, não só de PUBLIC. Achado idêntico ao do CRM Maximus
-- (migrations 054/061) — mesma causa, mesmo remédio, portado aqui.
--
-- Por que varredura por catálogo (pg_proc) em vez de lista de REVOKE
-- manual por função: uma função nova que aparecer em qualquer um dos
-- quatro schemas e não entrar na lista de "chamável" fica fechada por
-- padrão — o comportamento que se quer. Editar 001-004 função a função
-- é exatamente o tipo de tarefa repetitiva onde uma linha esquecida
-- não aparece em revisão de código normal (é a lição do próprio achado
-- G04 do Maximus, migration 054).
--
-- Nenhuma função de gatilho (RETURNS trigger) precisa de EXECUTE de
-- authenticated — dispara com o privilégio do dono da tabela,
-- independente de quem fez o DML. Fica de fora da lista "chamável" e
-- some do PostgREST de qualquer forma (Supabase não expõe função que
-- retorna trigger via RPC).
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

DO $$
DECLARE
  r RECORD;
  v_sig TEXT;
  v_callable TEXT[] := ARRAY[
    'public.is_account_member',
    'public.touch_presence',
    'access.can',
    'access.default_permission',
    'access.readable_modules',
    'access.permission_matrix',
    'access.set_module_permission',
    'licensing.seat_usage',
    'aba_people.converter_lead'
  ];
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname  AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'access', 'licensing', 'aba_people')
      -- access/licensing/aba_people só têm função nossa. Em `public`,
      -- rls_auto_enable() é função de PLATAFORMA do Supabase (também
      -- dona postgres — ownership não distingue as duas) — excluída
      -- nominalmente para não mexer em infraestrutura que não é nossa.
      AND NOT (n.nspname = 'public' AND p.proname = 'rls_auto_enable')
  LOOP
    v_sig := format('%I.%I(%s)', r.schema_name, r.func_name, r.args);

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);

    IF (r.schema_name || '.' || r.func_name) = ANY (v_callable) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_sig);
    ELSE
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
    END IF;
  END LOOP;
END $$;
