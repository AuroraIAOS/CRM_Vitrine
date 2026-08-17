-- ============================================================
-- 019_expose_sales_automations_ai_schemas.sql — expõe aba_sales/
-- aba_automations/aba_ai ao PostgREST
--
-- Mesmo achado das Subetapas 01.2/01.3/01.4 (006/012/015): schema
-- novo existe no banco mas não no Data API do Supabase até ser
-- adicionado a pgrst.db_schemas. GRANT/RLS/tabela já foram tratados
-- dentro de 016/017/018 (padrão "ALTER DEFAULT PRIVILEGES dentro da
-- própria migration que cria o schema").
--
-- ALTER ROLE authenticator SET pgrst.db_schemas SUBSTITUI a lista
-- inteira, não soma — por isso repete aqui os oito schemas já
-- expostos junto dos três novos.
--
-- As duas notificações, sempre, com um intervalo curto antes de
-- testar (achado da 006).
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

ALTER ROLE authenticator SET pgrst.db_schemas =
  'public, access, licensing, aba_people, aba_catalog, aba_scheduling, aba_finance, aba_health, aba_sales, aba_automations, aba_ai';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
