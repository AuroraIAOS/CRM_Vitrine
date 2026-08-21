-- =====================================================================
-- 039 — Auditoria de isolamento de conta, consultável (Subetapa 02.15)
--
-- POR QUE ISTO EXISTE: a `035` fechou 73 chaves estrangeiras. A 74ª —
-- escrita na Etapa 03 por alguém com pressa, ou na primeira clonagem de
-- CRM-filho — recria a classe inteira, e o sintoma é ZERO: nada falha,
-- nada avisa, nenhum teste fica vermelho. A falha só aparece quando
-- alguém a explora.
--
-- Esta função é a varredura da auditoria virada em consulta permanente:
-- devolve toda chave estrangeira entre duas tabelas multi-inquilino que
-- NÃO carrega `account_id`. O contrato é "devolve zero linhas", e a
-- suíte de RLS falha se devolver qualquer coisa.
--
-- Mesmo princípio da `005_harden_function_privileges.sql`: proteger por
-- varredura de catálogo em vez de lista mantida à mão. Lista manual
-- protege o que alguém lembrou; varredura protege o que ninguém viu.
--
-- SUPERFÍCIE: `service_role` apenas. Introspecção de catálogo conta o
-- desenho do banco a quem a chama — inclusive quais tabelas existem e
-- como se ligam. Não há motivo para o navegador poder perguntar isso.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fks_sem_isolamento_de_conta()
RETURNS TABLE (filho text, chave text, colunas text, pai text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH multi_inquilino AS (
    SELECT c.oid, n.nspname AS sch, c.relname AS tab
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname IN ('public','access','licensing','analytics','aba_people','aba_catalog',
                        'aba_scheduling','aba_finance','aba_health','aba_messaging',
                        'aba_sales','aba_automations','aba_ai')
      AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'account_id'
          AND a.attnum > 0 AND NOT a.attisdropped)
  )
  SELECT
    o.sch || '.' || o.tab AS filho,
    con.conname::text AS chave,
    (SELECT string_agg(a.attname::text, ', ' ORDER BY x.ord)
       FROM unnest(con.conkey) WITH ORDINALITY x(att, ord)
       JOIN pg_catalog.pg_attribute a
         ON a.attrelid = con.conrelid AND a.attnum = x.att) AS colunas,
    d.sch || '.' || d.tab AS pai
  FROM pg_catalog.pg_constraint con
  JOIN multi_inquilino o ON o.oid = con.conrelid
  JOIN multi_inquilino d ON d.oid = con.confrelid
  WHERE con.contype = 'f'
    AND NOT EXISTS (
      SELECT 1 FROM unnest(con.conkey) k
      JOIN pg_catalog.pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
      WHERE a.attname = 'account_id')
  ORDER BY 1, 2;
$function$;

COMMENT ON FUNCTION public.fks_sem_isolamento_de_conta() IS
  'Auditoria: chaves estrangeiras entre tabelas multi-inquilino que não carregam account_id — portanto atravessáveis entre contas, já que a verificação de integridade referencial ignora RLS. Contrato: deve devolver ZERO linhas. Verificado pela suíte de RLS.';

REVOKE ALL ON FUNCTION public.fks_sem_isolamento_de_conta() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fks_sem_isolamento_de_conta() FROM anon;
REVOKE ALL ON FUNCTION public.fks_sem_isolamento_de_conta() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fks_sem_isolamento_de_conta() TO service_role;
