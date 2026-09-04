-- ============================================================
-- 046_expose_aba_treatment_schema.sql — expõe `aba_treatment` ao
-- PostgREST (Subetapa 03.8)
--
-- Mesmo achado das Subetapas 01.2–01.5 e da 02.4: schema novo existe no
-- banco e NÃO existe no Data API do Supabase até entrar em
-- `pgrst.db_schemas`. O erro que ele produz sugere falta de permissão, e
-- manda a investigação para o lado errado — por isso a exposição é
-- migration própria, com nome que diz o que faz, e não uma linha
-- escondida no fim da migration do schema.
--
-- `ALTER ROLE authenticator SET pgrst.db_schemas` SUBSTITUI A LISTA
-- INTEIRA. A lista abaixo foi lida do catálogo dos DOIS bancos (produção
-- e testes) antes de ser escrita, e não copiada da migration anterior —
-- a partir do primeiro `ALTER ROLE` o Dashboard para de gerenciar essa
-- lista, e copiar de um arquivo velho é como se derruba `public` sem
-- perceber (`handoffs/instrucoes.md` §5).
--
-- SÃO DUAS NOTIFICAÇÕES, sempre. `NOTIFY pgrst, 'reload config'` sozinho
-- não fez o cache de schema do PostgREST enxergar as tabelas na 01.2 —
-- só funcionou com `reload schema` também, alguns segundos depois.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

ALTER ROLE authenticator SET pgrst.db_schemas =
  'public, access, licensing, aba_people, aba_catalog, aba_scheduling, aba_finance, aba_health, aba_sales, aba_automations, aba_ai, aba_messaging, aba_treatment';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
