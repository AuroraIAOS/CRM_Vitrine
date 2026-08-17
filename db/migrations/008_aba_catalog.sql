-- ============================================================
-- 008_aba_catalog.sql — schema aba_catalog (serviços e planos)
--
-- Mapa de origem: db/migrations/README.md → catalog (044_catalog_
-- schema.sql, hardening 067_catalog_set_default_variant.sql já
-- embutido no DDL inicial, não como patch posterior). Nomes traduzidos
-- conforme docs/02_MODELO_DE_DADOS.md §7: categories→categorias,
-- services→servicos, service_variants→variantes_servico,
-- packages→planos, package_items→itens_plano.
--
-- Define O QUE o estabelecimento oferece. Não guarda venda nem
-- dinheiro recebido — plano vendido com saldo vive em aba_finance
-- (mantém aba_catalog exportável sozinho para quem não quer
-- financeiro).
--
-- RLS no padrão obrigatório de docs/02 §2, module_key = 'catalog' em
-- toda tabela: is_account_member(papel_minimo) AND access.can
-- ('catalog', ação).
--
-- Hardening dobrado desde a primeira migration (handoffs/instrucoes.md
-- §4): toda função nasce com REVOKE ALL FROM PUBLIC *e* FROM anon
-- (revogar de PUBLIC não desfaz concessão nominal de fábrica a anon —
-- achado da Subetapa 01.2, migration 005); GRANT de tabela estreito
-- (nunca TRUNCATE/TRIGGER/REFERENCES); ALTER DEFAULT PRIVILEGES já
-- reescrito nesta própria migration, para que tabela futura deste
-- schema nasça estreita sem depender de uma migration de correção
-- posterior (achado registrado em handoffs/instrucoes.md §5, pendência
-- explícita para 01.3+).
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS aba_catalog;

CREATE OR REPLACE FUNCTION aba_catalog.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION aba_catalog.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_catalog.set_updated_at() FROM anon;
GRANT EXECUTE ON FUNCTION aba_catalog.set_updated_at() TO authenticated, service_role;

-- ============================================================
-- Categorias
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_catalog.categorias (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  descricao     TEXT,
  cor           TEXT NOT NULL DEFAULT '#3b82f6',
  posicao       INTEGER NOT NULL DEFAULT 0,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_categorias_account ON aba_catalog.categorias(account_id);

ALTER TABLE aba_catalog.categorias ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_catalog.categorias;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_catalog.categorias
  FOR EACH ROW EXECUTE FUNCTION aba_catalog.set_updated_at();

DROP POLICY IF EXISTS categorias_select ON aba_catalog.categorias;
CREATE POLICY categorias_select ON aba_catalog.categorias FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('catalog', 'read'));
DROP POLICY IF EXISTS categorias_insert ON aba_catalog.categorias;
CREATE POLICY categorias_insert ON aba_catalog.categorias FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('catalog', 'create'));
DROP POLICY IF EXISTS categorias_update ON aba_catalog.categorias;
CREATE POLICY categorias_update ON aba_catalog.categorias FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('catalog', 'update'));
DROP POLICY IF EXISTS categorias_delete ON aba_catalog.categorias;
CREATE POLICY categorias_delete ON aba_catalog.categorias FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('catalog', 'delete'));

-- ============================================================
-- Serviços
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_catalog.servicos (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  -- RESTRICT, não CASCADE: apagar categoria com serviço vinculado deve
  -- ser bloqueado — a mensagem clara é responsabilidade da interface,
  -- a barreira é do banco (mesma decisão do Maximus, migration 044).
  categoria_id              UUID NOT NULL REFERENCES aba_catalog.categorias(id) ON DELETE RESTRICT,
  nome                      TEXT NOT NULL,
  descricao                 TEXT,
  duracao_padrao_minutos    INTEGER NOT NULL DEFAULT 60 CHECK (duracao_padrao_minutos > 0),
  preco_base                NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (preco_base >= 0),
  requer_profissional       BOOLEAN NOT NULL DEFAULT TRUE,
  requer_recurso            BOOLEAN NOT NULL DEFAULT FALSE,
  ativo                     BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_servicos_account ON aba_catalog.servicos(account_id);
CREATE INDEX IF NOT EXISTS idx_servicos_categoria ON aba_catalog.servicos(categoria_id);

ALTER TABLE aba_catalog.servicos ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_catalog.servicos;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_catalog.servicos
  FOR EACH ROW EXECUTE FUNCTION aba_catalog.set_updated_at();

DROP POLICY IF EXISTS servicos_select ON aba_catalog.servicos;
CREATE POLICY servicos_select ON aba_catalog.servicos FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('catalog', 'read'));
DROP POLICY IF EXISTS servicos_insert ON aba_catalog.servicos;
CREATE POLICY servicos_insert ON aba_catalog.servicos FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('catalog', 'create'));
DROP POLICY IF EXISTS servicos_update ON aba_catalog.servicos;
CREATE POLICY servicos_update ON aba_catalog.servicos FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('catalog', 'update'));
DROP POLICY IF EXISTS servicos_delete ON aba_catalog.servicos;
CREATE POLICY servicos_delete ON aba_catalog.servicos FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('catalog', 'delete'));

-- ============================================================
-- Variantes de serviço
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_catalog.variantes_servico (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  servico_id        UUID NOT NULL REFERENCES aba_catalog.servicos(id) ON DELETE CASCADE,
  nome              TEXT NOT NULL,
  preco             NUMERIC(12,2) NOT NULL CHECK (preco >= 0),
  duracao_minutos   INTEGER NOT NULL CHECK (duracao_minutos > 0),
  padrao            BOOLEAN NOT NULL DEFAULT FALSE,
  ativo             BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_variantes_servico_servico ON aba_catalog.variantes_servico(servico_id);

-- "Uma única variação padrão por serviço" (docs/02 §5 do Maximus,
-- preservado). Índice único parcial: garantido no banco, não na tela.
CREATE UNIQUE INDEX IF NOT EXISTS idx_variantes_servico_uma_padrao
  ON aba_catalog.variantes_servico(servico_id) WHERE padrao;

ALTER TABLE aba_catalog.variantes_servico ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_catalog.variantes_servico;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_catalog.variantes_servico
  FOR EACH ROW EXECUTE FUNCTION aba_catalog.set_updated_at();

DROP POLICY IF EXISTS variantes_servico_select ON aba_catalog.variantes_servico;
CREATE POLICY variantes_servico_select ON aba_catalog.variantes_servico FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('catalog', 'read'));
DROP POLICY IF EXISTS variantes_servico_insert ON aba_catalog.variantes_servico;
CREATE POLICY variantes_servico_insert ON aba_catalog.variantes_servico FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('catalog', 'create'));
DROP POLICY IF EXISTS variantes_servico_update ON aba_catalog.variantes_servico;
CREATE POLICY variantes_servico_update ON aba_catalog.variantes_servico FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('catalog', 'update'));
DROP POLICY IF EXISTS variantes_servico_delete ON aba_catalog.variantes_servico;
CREATE POLICY variantes_servico_delete ON aba_catalog.variantes_servico FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('catalog', 'delete'));

-- ============================================================
-- Planos
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_catalog.planos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  descricao      TEXT,
  preco_total    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (preco_total >= 0),
  dias_validade  INTEGER CHECK (dias_validade IS NULL OR dias_validade > 0),
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_planos_account ON aba_catalog.planos(account_id);

ALTER TABLE aba_catalog.planos ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_catalog.planos;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_catalog.planos
  FOR EACH ROW EXECUTE FUNCTION aba_catalog.set_updated_at();

DROP POLICY IF EXISTS planos_select ON aba_catalog.planos;
CREATE POLICY planos_select ON aba_catalog.planos FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('catalog', 'read'));
DROP POLICY IF EXISTS planos_insert ON aba_catalog.planos;
CREATE POLICY planos_insert ON aba_catalog.planos FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('catalog', 'create'));
DROP POLICY IF EXISTS planos_update ON aba_catalog.planos;
CREATE POLICY planos_update ON aba_catalog.planos FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('catalog', 'update'));
DROP POLICY IF EXISTS planos_delete ON aba_catalog.planos;
CREATE POLICY planos_delete ON aba_catalog.planos FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('catalog', 'delete'));

-- ============================================================
-- Itens do plano
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_catalog.itens_plano (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  plano_id              UUID NOT NULL REFERENCES aba_catalog.planos(id) ON DELETE CASCADE,
  servico_id            UUID NOT NULL REFERENCES aba_catalog.servicos(id) ON DELETE RESTRICT,
  variante_servico_id   UUID REFERENCES aba_catalog.variantes_servico(id) ON DELETE SET NULL,
  sessoes_incluidas     INTEGER NOT NULL CHECK (sessoes_incluidas > 0),
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_itens_plano_plano ON aba_catalog.itens_plano(plano_id);

ALTER TABLE aba_catalog.itens_plano ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS itens_plano_select ON aba_catalog.itens_plano;
CREATE POLICY itens_plano_select ON aba_catalog.itens_plano FOR SELECT
  USING (public.is_account_member(account_id, 'viewer') AND access.can('catalog', 'read'));
DROP POLICY IF EXISTS itens_plano_insert ON aba_catalog.itens_plano;
CREATE POLICY itens_plano_insert ON aba_catalog.itens_plano FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('catalog', 'create'));
DROP POLICY IF EXISTS itens_plano_update ON aba_catalog.itens_plano;
CREATE POLICY itens_plano_update ON aba_catalog.itens_plano FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('catalog', 'update'));
DROP POLICY IF EXISTS itens_plano_delete ON aba_catalog.itens_plano;
CREATE POLICY itens_plano_delete ON aba_catalog.itens_plano FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('catalog', 'delete'));

-- ============================================================
-- definir_variante_padrao() — troca a variação padrão em uma
-- transação (Maximus 067_catalog_set_default_variant.sql, já embutido
-- aqui em vez de patch posterior).
--
-- POR QUE UMA FUNÇÃO, E NÃO DOIS UPDATES SOLTOS DO CLIENTE
-- idx_variantes_servico_uma_padrao garante no banco que existe no
-- máximo uma variação padrão por serviço. Trocar a padrão exige
-- desligar a antiga e ligar a nova; dois UPDATEs soltos da aplicação
-- deixam janela de corrida (ordem errada esbarra no índice único;
-- dois clientes ao mesmo tempo podem deixar zero ou a errada como
-- padrão). Dentro de uma função é uma transação só.
--
-- SECURITY INVOKER: os dois UPDATEs continuam sob a RLS de
-- variantes_servico — quem não pode editar catálogo recebe 42501 do
-- próprio Postgres, não um bypass silencioso.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_catalog.definir_variante_padrao(
  p_variante_id UUID
) RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_servico_id UUID;
BEGIN
  SELECT servico_id INTO v_servico_id
  FROM aba_catalog.variantes_servico
  WHERE id = p_variante_id;

  IF v_servico_id IS NULL THEN
    RAISE EXCEPTION 'Variação não encontrada' USING ERRCODE = '22023';
  END IF;

  UPDATE aba_catalog.variantes_servico
  SET padrao = FALSE
  WHERE servico_id = v_servico_id
    AND padrao = TRUE
    AND id <> p_variante_id;

  UPDATE aba_catalog.variantes_servico
  SET padrao = TRUE
  WHERE id = p_variante_id;
END;
$$;

REVOKE ALL ON FUNCTION aba_catalog.definir_variante_padrao(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION aba_catalog.definir_variante_padrao(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION aba_catalog.definir_variante_padrao(UUID) TO authenticated, service_role;

-- ============================================================
-- GRANT estreito + ALTER DEFAULT PRIVILEGES — mesmo padrão de
-- 006_expose_schemas_and_narrow_grants.sql, dentro da própria migration
-- que cria o schema (pendência registrada em handoffs/instrucoes.md
-- §5: "repetir o padrão ALTER DEFAULT PRIVILEGES dentro da própria
-- migration que cria o schema"). GRANT ALL nunca — inclui TRUNCATE,
-- que não passa por RLS (achado G01 do Maximus, migration 052).
-- ============================================================
GRANT USAGE ON SCHEMA aba_catalog TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA aba_catalog TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA aba_catalog TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_catalog
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_catalog
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aba_catalog
  GRANT ALL ON TABLES TO service_role;
