-- ============================================================
-- 021_expose_aba_messaging_schema.sql — expõe aba_messaging ao
-- PostgREST
--
-- Mesmo achado das Subetapas 01.2-01.5: schema novo existe no banco
-- mas não no Data API do Supabase até ser adicionado a
-- pgrst.db_schemas. GRANT/RLS/tabela já foram tratados dentro de
-- 020_aba_messaging.sql.
--
-- ALTER ROLE authenticator SET pgrst.db_schemas SUBSTITUI a lista
-- inteira — repete aqui os dez schemas já expostos junto do novo.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

ALTER ROLE authenticator SET pgrst.db_schemas =
  'public, access, licensing, aba_people, aba_catalog, aba_scheduling, aba_finance, aba_health, aba_sales, aba_automations, aba_ai, aba_messaging';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
