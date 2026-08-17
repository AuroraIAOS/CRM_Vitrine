-- ============================================================
-- 016_aba_sales.sql — schema aba_sales (funil de vendas)
--
-- Schema NOVO — não existe no CRM Maximus como módulo próprio.
-- `pipelines`/`deals` nunca ganharam schema modular lá: ficaram soltas
-- em `public`, ainda no modelo antigo do fork (`user_id`/`auth.uid()`,
-- sem RBAC por conta). Nasce aqui já em português e já no padrão
-- RBAC/RLS correto — não é porte, é desenho novo a partir do DDL de
-- referência de docs/02_MODELO_DE_DADOS.md §4.
--
-- oportunidades referencia pessoa_id (nunca contact_id): uma
-- oportunidade de venda pode estar ligada a um lead ainda não
-- convertido ou a um cliente já ativo, sem distinção artificial — é a
-- vantagem direta da tabela-mãe pessoas (aba_people, Subetapa 01.2).
--
-- RLS no padrão obrigatório de docs/02 §2, module_key = 'sales' (já
-- seedado em access.modules desde 003_core_access.sql).
--
-- Hardening dobrado desde a primeira migration — mesmo padrão de
-- 008/009/010/013: REVOKE ALL FROM PUBLIC *e* FROM anon em toda
-- função; GRANT de tabela estreito (nunca TRUNCATE); ALTER DEFAULT
-- PRIVILEGES já nesta migration.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS aba_sales;

CREATE OR REPLACE FUNCTION aba_sales.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION aba_sales.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_sales.set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION aba_sales.set_updated_at() FROM authenticated;

-- ============================================================
-- Funis e etapas
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_sales.funis (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_funis_account ON aba_sales.funis(account_id);

ALTER TABLE aba_sales.funis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS funis_select ON aba_sales.funis;
CREATE POLICY funis_select ON aba_sales.funis FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('sales', 'read'));
DROP POLICY IF EXISTS funis_insert ON aba_sales.funis;
CREATE POLICY funis_insert ON aba_sales.funis FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('sales', 'create'));
DROP POLICY IF EXISTS funis_update ON aba_sales.funis;
CREATE POLICY funis_update ON aba_sales.funis FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('sales', 'update'));
DROP POLICY IF EXISTS funis_delete ON aba_sales.funis;
CREATE POLICY funis_delete ON aba_sales.funis FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('sales', 'delete'));

CREATE TABLE IF NOT EXISTS aba_sales.etapas_funil (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funil_id UUID NOT NULL REFERENCES aba_sales.funis(id) ON DELETE CASCADE,
  nome     TEXT NOT NULL,
  ordem    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_etapas_funil_funil ON aba_sales.etapas_funil(funil_id, ordem);

ALTER TABLE aba_sales.etapas_funil ENABLE ROW LEVEL SECURITY;

-- Sem account_id próprio — resolve via join ao funil, mesmo padrão de
-- aba_people.pessoa_tags (004_aba_people.sql).
DROP POLICY IF EXISTS etapas_funil_select ON aba_sales.etapas_funil;
CREATE POLICY etapas_funil_select ON aba_sales.etapas_funil FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM aba_sales.funis f WHERE f.id = etapas_funil.funil_id
      AND public.is_account_member(f.account_id, 'viewer') AND access.can('sales', 'read')
  ));
DROP POLICY IF EXISTS etapas_funil_modify ON aba_sales.etapas_funil;
CREATE POLICY etapas_funil_modify ON aba_sales.etapas_funil FOR ALL
  USING (EXISTS (
    SELECT 1 FROM aba_sales.funis f WHERE f.id = etapas_funil.funil_id
      AND public.is_account_member(f.account_id, 'agent') AND access.can('sales', 'update')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM aba_sales.funis f WHERE f.id = etapas_funil.funil_id
      AND public.is_account_member(f.account_id, 'agent') AND access.can('sales', 'update')
  ));

-- ============================================================
-- Oportunidades
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_sales.oportunidades (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  funil_id            UUID NOT NULL REFERENCES aba_sales.funis(id) ON DELETE CASCADE,
  etapa_id            UUID NOT NULL REFERENCES aba_sales.etapas_funil(id),
  -- pessoa_id, nunca contact_id: uma oportunidade pode estar ligada a
  -- um lead ainda não convertido ou a um cliente já ativo, sem
  -- distinção artificial (docs/02 §4, Qualidade da Subetapa 01.5).
  pessoa_id           UUID NOT NULL REFERENCES aba_people.pessoas(id),
  titulo              TEXT NOT NULL,
  valor               NUMERIC(12,2) NOT NULL DEFAULT 0,
  moeda               TEXT NOT NULL DEFAULT 'BRL' CHECK (moeda ~ '^[A-Z]{3}$'),
  previsao_fechamento DATE,
  status              TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'ganha', 'perdida')),
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oportunidades_account ON aba_sales.oportunidades(account_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_funil_etapa ON aba_sales.oportunidades(funil_id, etapa_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_pessoa ON aba_sales.oportunidades(pessoa_id);

ALTER TABLE aba_sales.oportunidades ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_sales.oportunidades;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_sales.oportunidades
  FOR EACH ROW EXECUTE FUNCTION aba_sales.set_updated_at();

DROP POLICY IF EXISTS oportunidades_select ON aba_sales.oportunidades;
CREATE POLICY oportunidades_select ON aba_sales.oportunidades FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('sales', 'read'));
DROP POLICY IF EXISTS oportunidades_insert ON aba_sales.oportunidades;
CREATE POLICY oportunidades_insert ON aba_sales.oportunidades FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('sales', 'create'));
DROP POLICY IF EXISTS oportunidades_update ON aba_sales.oportunidades;
CREATE POLICY oportunidades_update ON aba_sales.oportunidades FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('sales', 'update'));
DROP POLICY IF EXISTS oportunidades_delete ON aba_sales.oportunidades;
CREATE POLICY oportunidades_delete ON aba_sales.oportunidades FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('sales', 'delete'));

-- ============================================================
-- GRANT estreito + ALTER DEFAULT PRIVILEGES — mesmo padrão de
-- 008/009/010/013.
-- ============================================================
GRANT USAGE ON SCHEMA aba_sales TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA aba_sales TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA aba_sales TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_sales
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_sales
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_sales
  GRANT ALL ON TABLES TO service_role;
