-- ============================================================
-- 006_expose_schemas_and_narrow_grants.sql — expõe access/licensing/
-- aba_people ao PostgREST e fecha um privilégio de fábrica perigoso
-- em TODA tabela de `public` (achado novo, não só herdado do Maximus)
--
-- ACHADO 1 — schema não exposto
-- `access`, `licensing`, `aba_people` existem no banco mas não no
-- Data API do Supabase — medido ao vivo: `PGRST106`/schema inválido ao
-- tentar `admin.schema('licensing').from(...)`. Confirmado contra a
-- documentação oficial (docs/guides/api/using-custom-schemas): expor
-- um schema novo são DUAS ações — 1) Dashboard → Project Settings →
-- Data API → Exposed schemas, ou o equivalente por SQL
-- (`ALTER ROLE authenticator SET pgrst.db_schemas = ...`, documentado
-- oficialmente como caminho de "manual override" válido, não hack) —
-- e 2) GRANT nas tabelas. Sem sessão de navegador nesta subetapa para
-- usar o Dashboard, aplicado pelo caminho SQL oficial.
--
-- ACHADO 2 — GRANT de fábrica em `public` inclui TRUNCATE (mais sério
-- que o achado 1, e não veio de nenhuma migration nossa)
-- Medido por consulta a information_schema.role_table_grants ANTES
-- desta migration: toda tabela criada em `001_core_public.sql`
-- (accounts, profiles, account_invitations, api_keys,
-- webhook_endpoints, notifications, member_presence) tinha SELECT,
-- INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER e REFERENCES concedidos a
-- `anon`, `authenticated` E `service_role` — privilégio de fábrica do
-- projeto Supabase (comportamento "antigo": tabela nova em `public`
-- ganha ALL automaticamente; a plataforma está migrando o padrão para
-- revogado-por-padrão, mas este projeto ainda nasceu no modelo antigo).
--
-- TRUNCATE não passa por Row Level Security — é exatamente o achado
-- G01 que a auditoria adversarial do Maximus encontrou (migration 052),
-- só que lá surgiu de uma migration nossa (`GRANT ALL`) e aqui é
-- comportamento de fábrica do projeto, presente desde a primeira
-- tabela, sem que nenhuma migration tenha pedido. Mesmo remédio:
-- revogar tudo e reconceder só os quatro verbos de dado, e nunca a
-- `anon` — não existe caminho anônimo legítimo neste MVP (o único
-- candidato, agendamento online pelo cliente, é +1.0, fora do MVP;
-- docs/00_PLANO_E_CRITERIOS.md, backlog de versionamento).
--
-- `service_role` mantém ALL — é a identidade de servidor, já bypassa
-- RLS por natureza (mesma decisão do Maximus, migration 052).
--
-- ALTER DEFAULT PRIVILEGES reescrito nos quatro schemas para que
-- TABELA FUTURA (Subetapas 01.3+) já nasça estreita — mas só nestes
-- quatro; schema novo (aba_catalog, aba_scheduling, ...) precisa do
-- mesmo tratamento na própria migration que o cria. Registrado em
-- handoffs/instrucoes.md §4 como padrão a repetir.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

-- ---- exposição ao PostgREST -----------------------------------
-- `reload config` sozinho não bastou para o cache de schema do
-- PostgREST enxergar as tabelas novas (medido ao vivo: a chamada via
-- supabase-js só funcionou depois do `reload schema` explícito,
-- alguns segundos depois). Os dois juntos, sempre.
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, access, licensing, aba_people';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

-- ---- USAGE nos schemas novos ------------------------------------
GRANT USAGE ON SCHEMA access TO authenticated, service_role;
GRANT USAGE ON SCHEMA licensing TO authenticated, service_role;
GRANT USAGE ON SCHEMA aba_people TO authenticated, service_role;

-- ---- GRANT estreito em tabela existente, nos quatro schemas -----
DO $$
DECLARE
  s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'access', 'licensing', 'aba_people'] LOOP
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM anon', s);
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM authenticated', s);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', s
    );
    EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO service_role', s);

    -- Tabela futura nestes quatro schemas nasce já estreita.
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I REVOKE ALL ON TABLES FROM anon, authenticated', s
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I '
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated', s
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I GRANT ALL ON TABLES TO service_role', s
    );
  END LOOP;
END $$;

-- Sem sequences: toda PK é UUID via gen_random_uuid() nos quatro
-- schemas — no-op hoje, mantido de fora para não sugerir que existe
-- algo a proteger ali (mesma nota do Maximus, migration 052).
