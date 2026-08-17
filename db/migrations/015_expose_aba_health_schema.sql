-- ============================================================
-- 015_expose_aba_health_schema.sql — expõe aba_health ao PostgREST
--
-- Mesmo achado das Subetapas 01.2/01.3 (006/012): schema novo existe
-- no banco mas não no Data API do Supabase até ser adicionado a
-- pgrst.db_schemas. GRANT/RLS/tabela já foram tratados dentro de
-- 013_aba_health.sql (padrão "ALTER DEFAULT PRIVILEGES dentro da
-- própria migration que cria o schema").
--
-- ALTER ROLE authenticator SET pgrst.db_schemas SUBSTITUI a lista
-- inteira, não soma — por isso repete aqui os sete schemas já expostos
-- (public, access, licensing, aba_people, aba_catalog, aba_scheduling,
-- aba_finance) junto do novo. Esquecer um schema antigo nesta lista
-- derrubaria o Data API dele silenciosamente.
--
-- Bucket de anexo clínico (anexos-clinicos, 014) não precisa de
-- exposição aqui: Storage tem API própria, não passa por
-- pgrst.db_schemas.
--
-- As duas notificações, sempre, com um intervalo curto antes de testar
-- (achado da 006).
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

ALTER ROLE authenticator SET pgrst.db_schemas =
  'public, access, licensing, aba_people, aba_catalog, aba_scheduling, aba_finance, aba_health';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
