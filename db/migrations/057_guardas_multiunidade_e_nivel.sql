-- =====================================================================
-- 057 — Guardas permanentes da multiunidade e da trava de nível
--       (Subetapa 03.9 — portão completo; molde do F01-b da 02.15)
--
-- POR QUE ELAS EXISTEM. As migrations 054–056 corrigem o banco de HOJE. A
-- próxima função que alguém escrever vai copiar o padrão mais comum que
-- encontrar no repositório — e, até a 03.9, esse padrão era
-- `SELECT account_id INTO ... FROM public.profiles WHERE user_id = auth.uid()`,
-- escrito em 30 funções. Uma correção sem guarda vale só até o próximo
-- `CREATE OR REPLACE`. O remédio da 02.15 para as chaves estrangeiras foi
-- uma função de auditoria por catálogo mais um teste que falha se ela
-- devolver qualquer linha (`fks_sem_isolamento_de_conta`, 039). Aqui são
-- quatro, uma por pergunta que a 03.9 aprendeu a fazer:
--
--   1. `politicas_sem_cerca_de_conta()` — política de tabela com `account_id`
--      que não passa por `is_account_member(account_id…)` nem por
--      `pode_acessar/pode_planejar(cliente_id…)`. Foi esta varredura que
--      achou `formularios_anamnese` aberta entre contas desde a 013.
--   2. `funcoes_sem_conta_ativa()` — função que lê `public.profiles` pelo
--      usuário do chamador sem passar por `active_account_id()`.
--   3. `atalhos_de_owner_sem_nivel()` — função com "owner → devolve TRUE"
--      que não consulta `licensing.module_enabled` ANTES do atalho.
--   4. `modulos_sem_linha_de_nivel()` — par nível × módulo sem linha: o
--      módulo novo ficaria invisível para todo mundo, sem aviso.
--
-- A LISTA DE SCHEMAS NÃO É CRAVADA. `fks_sem_isolamento_de_conta` nasceu com
-- os schemas da época escritos à mão e ficou cega para `aba_treatment`
-- (instrucoes.md §5, "Guarda por varredura de catálogo com a lista de
-- schemas CRAVADA nasce cega para o schema seguinte"). Estas varrem todo
-- schema que não seja de sistema.
--
-- EXCEÇÕES DECLARADAS, cada uma com o motivo no próprio corpo: as funções
-- que resolvem a conta ativa (não podem depender de si mesmas) e o convite,
-- que conta TODOS os perfis da pessoa de propósito (decisão 2 de Max).
--
-- Só `service_role` executa: são auditoria, não produto.
--
-- Idempotente — seguro rodar mais de uma vez.
-- =====================================================================

-- Schemas da aplicação = todos menos os de sistema e os da plataforma.
CREATE OR REPLACE FUNCTION public.schemas_da_aplicacao()
RETURNS SETOF name
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT n.nspname
  FROM pg_catalog.pg_namespace n
  WHERE n.nspname !~ '^(pg_|information_schema$)'
    AND n.nspname NOT IN ('auth', 'storage', 'realtime', 'extensions', 'graphql', 'graphql_public',
                          'vault', 'cron', 'net', 'pgsodium', 'pgsodium_masks', 'pgbouncer',
                          'supabase_functions', 'supabase_migrations', '_realtime', 'pgmq');
$$;

REVOKE ALL ON FUNCTION public.schemas_da_aplicacao() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schemas_da_aplicacao() FROM anon;
REVOKE ALL ON FUNCTION public.schemas_da_aplicacao() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.schemas_da_aplicacao() TO service_role;

-- ---------------------------------------------------------------------
-- 1. Política sem cerca de conta
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.politicas_sem_cerca_de_conta()
RETURNS TABLE (tabela TEXT, politica TEXT, comando TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pol.schemaname || '.' || pol.tablename, pol.policyname::text, pol.cmd
  FROM pg_catalog.pg_policies pol
  WHERE pol.schemaname IN (SELECT public.schemas_da_aplicacao())
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = pol.schemaname AND c.relname = pol.tablename
        AND a.attname = 'account_id' AND a.attnum > 0 AND NOT a.attisdropped)
    AND NOT (
      coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '') ~ 'is_account_member[(] *account_id'
      -- `pode_acessar`/`pode_planejar` com o cliente da linha conferem que o
      -- cliente é da conta ativa; a chave composta (035) garante que a linha
      -- é da mesma conta do cliente.
      OR coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '') ~ 'pode_(acessar|planejar)[(] *(p[.])?cliente_id'
    )
  ORDER BY 1, 2;
$$;

COMMENT ON FUNCTION public.politicas_sem_cerca_de_conta() IS
  'Auditoria (Subetapa 03.9): políticas de tabela com account_id que não comparam a linha com a conta ativa. Contrato: ZERO linhas. Verificado pela suíte de RLS (24).';

-- ---------------------------------------------------------------------
-- 2. Função que descobre a conta sem a conta ativa
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.funcoes_sem_conta_ativa()
RETURNS TABLE (funcao TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT n.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')'
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN (SELECT public.schemas_da_aplicacao())
    AND p.prokind = 'f'
    AND p.prosrc ~ 'public\.profiles'
    AND p.prosrc ~ 'user_id\s*=\s*(auth\.uid\(\)|v_user_id|v_ator|v_caller_id)'
    AND p.prosrc !~ 'active_account_id\(\)'
    AND (n.nspname || '.' || p.proname) NOT IN (
      -- a própria resolução: não pode depender de si mesma
      'public.active_account_id',
      -- valida o vínculo com QUALQUER conta da pessoa — é a porta da escolha
      'public.set_active_account',
      -- conta todos os perfis da pessoa de propósito (convite híbrido, 056)
      'public.resgatar_convite'
    )
  ORDER BY 1;
$$;

COMMENT ON FUNCTION public.funcoes_sem_conta_ativa() IS
  'Auditoria (Subetapa 03.9): funções que leem public.profiles pelo usuário do chamador sem passar por active_account_id() — com dois perfis, SELECT INTO pega a primeira linha e herda conta e papel de outra clínica. Contrato: ZERO linhas.';

-- ---------------------------------------------------------------------
-- 3. Atalho de owner antes da trava de nível
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atalhos_de_owner_sem_nivel()
RETURNS TABLE (funcao TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT n.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')'
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN (SELECT public.schemas_da_aplicacao())
    AND p.prokind = 'f'
    AND p.prosrc ~ '''owner''\s*THEN\s*RETURN\s+TRUE'
    -- A trava tem de aparecer ANTES do primeiro atalho, não só existir.
    AND (
      position('licensing.module_enabled' IN p.prosrc) = 0
      OR position('licensing.module_enabled' IN p.prosrc)
         > regexp_instr(p.prosrc, '''owner''\s*THEN\s*RETURN\s+TRUE')
    )
  ORDER BY 1;
$$;

COMMENT ON FUNCTION public.atalhos_de_owner_sem_nivel() IS
  'Auditoria (Subetapa 03.9): funções com atalho "owner → TRUE" que não consultam licensing.module_enabled antes do atalho — o corte de nível não valeria para quem contrata o nível. Contrato: ZERO linhas.';

-- ---------------------------------------------------------------------
-- 4. Módulo sem linha em algum nível
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.modulos_sem_linha_de_nivel()
RETURNS TABLE (nivel TEXT, modulo TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.key, m.key
  FROM licensing.tiers t
  CROSS JOIN access.modules m
  WHERE NOT EXISTS (SELECT 1 FROM licensing.tier_modules tm WHERE tm.tier_key = t.key AND tm.module_key = m.key)
  ORDER BY 1, 2;
$$;

COMMENT ON FUNCTION public.modulos_sem_linha_de_nivel() IS
  'Auditoria (Subetapa 03.9): par nível × módulo sem linha em licensing.tier_modules — o módulo ficaria invisível para toda conta daquele nível, sem aviso. Contrato: ZERO linhas.';

DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.politicas_sem_cerca_de_conta()', 'public.funcoes_sem_conta_ativa()',
                           'public.atalhos_de_owner_sem_nivel()', 'public.modulos_sem_linha_de_nivel()'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- VERIFICAÇÕES: as guardas nascem VERDES — se não, a correção não fechou
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_sobra TEXT;
BEGIN
  SELECT string_agg(tabela || ' ' || politica, ', ') INTO v_sobra FROM public.politicas_sem_cerca_de_conta();
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION 'Política sem cerca de conta: %', v_sobra; END IF;

  SELECT string_agg(funcao, ', ') INTO v_sobra FROM public.funcoes_sem_conta_ativa();
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION 'Função sem conta ativa: %', v_sobra; END IF;

  SELECT string_agg(funcao, ', ') INTO v_sobra FROM public.atalhos_de_owner_sem_nivel();
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION 'Atalho de owner sem trava de nível: %', v_sobra; END IF;

  SELECT string_agg(nivel || '×' || modulo, ', ') INTO v_sobra FROM public.modulos_sem_linha_de_nivel();
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION 'Módulo sem linha de nível: %', v_sobra; END IF;

  SELECT string_agg(f, ', ') INTO v_sobra
  FROM unnest(ARRAY['public.politicas_sem_cerca_de_conta()', 'public.funcoes_sem_conta_ativa()',
                    'public.atalhos_de_owner_sem_nivel()', 'public.modulos_sem_linha_de_nivel()',
                    'public.schemas_da_aplicacao()']) f
  WHERE has_function_privilege('authenticated', f, 'EXECUTE') OR has_function_privilege('anon', f, 'EXECUTE');
  IF v_sobra IS NOT NULL THEN RAISE EXCEPTION 'Auditoria executável por papel de conta: %', v_sobra; END IF;
END $$;
