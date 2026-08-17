-- ============================================================
-- 012_expose_new_module_schemas.sql — expõe aba_catalog/aba_scheduling/
-- aba_finance ao PostgREST
--
-- Mesmo achado da Subetapa 01.2 (006_expose_schemas_and_narrow_
-- grants.sql): schema novo existe no banco mas não no Data API do
-- Supabase até ser adicionado a pgrst.db_schemas. GRANT/RLS/tabela já
-- foram tratados dentro de cada migration de schema (008/009/010,
-- padrão "ALTER DEFAULT PRIVILEGES dentro da própria migration que
-- cria o schema", pendência fechada desta vez em vez de deixada para
-- trás — handoffs/instrucoes.md §5).
--
-- ALTER ROLE authenticator SET pgrst.db_schemas SUBSTITUI a lista
-- inteira, não soma — por isso repete aqui os quatro schemas já
-- expostos pela 006 (public, access, licensing, aba_people) junto dos
-- três novos. Esquecer um schema antigo nesta lista derrubaria o Data
-- API dele silenciosamente.
--
-- As duas notificações, sempre, com um intervalo curto antes de testar
-- (achado da 006: NOTIFY 'reload config' sozinho não bastou para o
-- cache de schema do PostgREST enxergar tabela nova).
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

ALTER ROLE authenticator SET pgrst.db_schemas =
  'public, access, licensing, aba_people, aba_catalog, aba_scheduling, aba_finance';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
