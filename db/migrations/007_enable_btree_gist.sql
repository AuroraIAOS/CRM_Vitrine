-- ============================================================
-- 007_enable_btree_gist.sql — extensão exigida pela restrição de
-- exclusão por intervalo de aba_scheduling.agendamentos (Subetapa
-- 01.3, docs/02_MODELO_DE_DADOS.md §9/§10, conflito de agenda é
-- problema do banco, não da aplicação).
--
-- Instalada em `extensions`, nunca em `public` — objeto em `public` é
-- exposto pela API do Supabase por padrão, poluindo a superfície com
-- as funções internas gbt_*. É o remédio documentado do linter
-- `extension_in_public` (0014): `ALTER EXTENSION ... SET SCHEMA
-- extensions`. Padrão herdado do CRM_Maximus (migration 037), medido
-- lá contra o Postgres real: tabela de prova com `EXCLUDE USING gist`
-- aceitou o primeiro agendamento e recusou a sobreposição com SQLSTATE
-- 23P01 — exatamente o comportamento que aba_scheduling.agendamentos
-- (009_aba_scheduling.sql) depende.
--
-- Idempotente — seguro rodar mais de uma vez, inclusive num banco onde
-- uma execução anterior tenha deixado a extensão em `public`.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'btree_gist' AND n.nspname <> 'extensions'
  ) THEN
    ALTER EXTENSION btree_gist SET SCHEMA extensions;
  END IF;
END $$;
