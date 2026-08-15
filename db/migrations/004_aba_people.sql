-- ============================================================
-- 004_aba_people.sql — schema aba_people (pessoas unificadas)
--
-- DDL de referência: docs/02_MODELO_DE_DADOS.md §3. Redesenho desta
-- sessão (não porte 1:1 do Maximus): pessoas é a identidade única,
-- leads/clientes/funcionarios/fornecedores são extensões 1:1 por
-- chave compartilhada (a própria pessoas.id como PK), não FK solta —
-- ver docs/02 §3.1. Resolve o problema real do Maximus onde tag/nota
-- presa em contacts.id não sobrevivia à conversão de lead pra cliente.
--
-- contato_id (em pessoas) é UUID SEM REFERENCES para aba_messaging —
-- aba_messaging só é aplicado na Subetapa 01.6 e aba_people precisa
-- continuar exportável sozinho para um CRM-filho sem mensageria. Ver
-- handoffs/instrucoes.md §5.
--
-- RLS no padrão obrigatório de docs/02 §2, module_key = 'people' em
-- toda tabela: is_account_member(papel_minimo) AND access.can('people',
-- ação), nunca uma no lugar da outra. tags/campos_customizados são
-- settings-class (admin+ escreve, como tags/custom_fields no Maximus);
-- o resto é dado operacional (agent+ escreve, viewer só lê).
--
-- set_updated_at() própria do schema (não reaproveita public.set_updated_at)
-- — mantém o módulo exportável sozinho, docs/02 §2.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS aba_people;

CREATE OR REPLACE FUNCTION aba_people.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION aba_people.set_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aba_people.set_updated_at() TO authenticated, service_role;

-- ============================================================
-- Tabela-mãe: identidade única, independente do(s) papel(is)
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_people.pessoas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contato_id     UUID,
  nome_exibicao  TEXT NOT NULL,
  email          TEXT,
  telefone       TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pessoas_account ON aba_people.pessoas(account_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_contato ON aba_people.pessoas(contato_id) WHERE contato_id IS NOT NULL;

ALTER TABLE aba_people.pessoas ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_people.pessoas;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_people.pessoas
  FOR EACH ROW EXECUTE FUNCTION aba_people.set_updated_at();

DROP POLICY IF EXISTS pessoas_select ON aba_people.pessoas;
CREATE POLICY pessoas_select ON aba_people.pessoas FOR SELECT
  USING (public.is_account_member(account_id) AND access.can('people', 'read'));
DROP POLICY IF EXISTS pessoas_insert ON aba_people.pessoas;
CREATE POLICY pessoas_insert ON aba_people.pessoas FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('people', 'create'));
DROP POLICY IF EXISTS pessoas_update ON aba_people.pessoas;
CREATE POLICY pessoas_update ON aba_people.pessoas FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('people', 'update'));
DROP POLICY IF EXISTS pessoas_delete ON aba_people.pessoas;
CREATE POLICY pessoas_delete ON aba_people.pessoas FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('people', 'delete'));

-- ============================================================
-- Papel: lead
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_people.leads (
  id             UUID PRIMARY KEY REFERENCES aba_people.pessoas(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  origem         TEXT NOT NULL DEFAULT 'manual'
                   CHECK (origem IN ('whatsapp','manual','importacao','api','indicacao','presencial')),
  como_encontrou TEXT,
  status         TEXT NOT NULL DEFAULT 'novo'
                   CHECK (status IN ('novo','qualificado','desqualificado','convertido')),
  responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_account_status ON aba_people.leads(account_id, status);

ALTER TABLE aba_people.leads ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_people.leads;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_people.leads
  FOR EACH ROW EXECUTE FUNCTION aba_people.set_updated_at();

DROP POLICY IF EXISTS leads_select ON aba_people.leads;
CREATE POLICY leads_select ON aba_people.leads FOR SELECT
  USING (public.is_account_member(account_id) AND access.can('people', 'read'));
DROP POLICY IF EXISTS leads_insert ON aba_people.leads;
CREATE POLICY leads_insert ON aba_people.leads FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('people', 'create'));
DROP POLICY IF EXISTS leads_update ON aba_people.leads;
CREATE POLICY leads_update ON aba_people.leads FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('people', 'update'));
DROP POLICY IF EXISTS leads_delete ON aba_people.leads;
CREATE POLICY leads_delete ON aba_people.leads FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('people', 'delete'));

-- ============================================================
-- Papel: cliente
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_people.clientes (
  id                UUID PRIMARY KEY REFERENCES aba_people.pessoas(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  lead_id           UUID REFERENCES aba_people.leads(id) ON DELETE SET NULL,
  razao_social      TEXT NOT NULL,
  nome_fantasia     TEXT,
  documento         TEXT,
  data_nascimento   DATE,
  endereco          JSONB NOT NULL DEFAULT '{}'::jsonb,
  status            TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clientes_account_status ON aba_people.clientes(account_id, status);

ALTER TABLE aba_people.clientes ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_people.clientes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_people.clientes
  FOR EACH ROW EXECUTE FUNCTION aba_people.set_updated_at();

DROP POLICY IF EXISTS clientes_select ON aba_people.clientes;
CREATE POLICY clientes_select ON aba_people.clientes FOR SELECT
  USING (public.is_account_member(account_id) AND access.can('people', 'read'));
DROP POLICY IF EXISTS clientes_insert ON aba_people.clientes;
CREATE POLICY clientes_insert ON aba_people.clientes FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('people', 'create'));
DROP POLICY IF EXISTS clientes_update ON aba_people.clientes;
CREATE POLICY clientes_update ON aba_people.clientes FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('people', 'update'));
DROP POLICY IF EXISTS clientes_delete ON aba_people.clientes;
CREATE POLICY clientes_delete ON aba_people.clientes FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('people', 'delete'));

-- ============================================================
-- Papel: funcionário
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_people.funcionarios (
  id             UUID PRIMARY KEY REFERENCES aba_people.pessoas(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  profile_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  documento      TEXT,
  cargo          TEXT,
  admitido_em    DATE,
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_funcionarios_account ON aba_people.funcionarios(account_id);

ALTER TABLE aba_people.funcionarios ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_people.funcionarios;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_people.funcionarios
  FOR EACH ROW EXECUTE FUNCTION aba_people.set_updated_at();

DROP POLICY IF EXISTS funcionarios_select ON aba_people.funcionarios;
CREATE POLICY funcionarios_select ON aba_people.funcionarios FOR SELECT
  USING (public.is_account_member(account_id) AND access.can('people', 'read'));
DROP POLICY IF EXISTS funcionarios_insert ON aba_people.funcionarios;
CREATE POLICY funcionarios_insert ON aba_people.funcionarios FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('people', 'create'));
DROP POLICY IF EXISTS funcionarios_update ON aba_people.funcionarios;
CREATE POLICY funcionarios_update ON aba_people.funcionarios FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('people', 'update'));
DROP POLICY IF EXISTS funcionarios_delete ON aba_people.funcionarios;
CREATE POLICY funcionarios_delete ON aba_people.funcionarios FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('people', 'delete'));

-- ============================================================
-- Papel: fornecedor (novo — não existia no Maximus)
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_people.fornecedores (
  id             UUID PRIMARY KEY REFERENCES aba_people.pessoas(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  razao_social   TEXT NOT NULL,
  documento      TEXT,
  categoria      TEXT,
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fornecedores_account ON aba_people.fornecedores(account_id);

ALTER TABLE aba_people.fornecedores ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS set_updated_at ON aba_people.fornecedores;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON aba_people.fornecedores
  FOR EACH ROW EXECUTE FUNCTION aba_people.set_updated_at();

DROP POLICY IF EXISTS fornecedores_select ON aba_people.fornecedores;
CREATE POLICY fornecedores_select ON aba_people.fornecedores FOR SELECT
  USING (public.is_account_member(account_id) AND access.can('people', 'read'));
DROP POLICY IF EXISTS fornecedores_insert ON aba_people.fornecedores;
CREATE POLICY fornecedores_insert ON aba_people.fornecedores FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('people', 'create'));
DROP POLICY IF EXISTS fornecedores_update ON aba_people.fornecedores;
CREATE POLICY fornecedores_update ON aba_people.fornecedores FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('people', 'update'));
DROP POLICY IF EXISTS fornecedores_delete ON aba_people.fornecedores;
CREATE POLICY fornecedores_delete ON aba_people.fornecedores FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('people', 'delete'));

-- ============================================================
-- Tags — settings-class (admin+ escreve), presas à pessoa
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_people.tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  cor        TEXT,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pt_tags_account ON aba_people.tags(account_id);

ALTER TABLE aba_people.tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pt_tags_select ON aba_people.tags;
CREATE POLICY pt_tags_select ON aba_people.tags FOR SELECT
  USING (public.is_account_member(account_id) AND access.can('people', 'read'));
DROP POLICY IF EXISTS pt_tags_insert ON aba_people.tags;
CREATE POLICY pt_tags_insert ON aba_people.tags FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin') AND access.can('people', 'create'));
DROP POLICY IF EXISTS pt_tags_update ON aba_people.tags;
CREATE POLICY pt_tags_update ON aba_people.tags FOR UPDATE
  USING (public.is_account_member(account_id, 'admin') AND access.can('people', 'update'));
DROP POLICY IF EXISTS pt_tags_delete ON aba_people.tags;
CREATE POLICY pt_tags_delete ON aba_people.tags FOR DELETE
  USING (public.is_account_member(account_id, 'admin') AND access.can('people', 'delete'));

CREATE TABLE IF NOT EXISTS aba_people.pessoa_tags (
  pessoa_id UUID NOT NULL REFERENCES aba_people.pessoas(id) ON DELETE CASCADE,
  tag_id    UUID NOT NULL REFERENCES aba_people.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (pessoa_id, tag_id)
);

ALTER TABLE aba_people.pessoa_tags ENABLE ROW LEVEL SECURITY;

-- Sem account_id próprio — resolve via join à pessoa, mesmo padrão do
-- contact_tags do Maximus (migration 017).
DROP POLICY IF EXISTS pessoa_tags_select ON aba_people.pessoa_tags;
CREATE POLICY pessoa_tags_select ON aba_people.pessoa_tags FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM aba_people.pessoas p WHERE p.id = pessoa_tags.pessoa_id
      AND public.is_account_member(p.account_id) AND access.can('people', 'read')
  ));
DROP POLICY IF EXISTS pessoa_tags_modify ON aba_people.pessoa_tags;
CREATE POLICY pessoa_tags_modify ON aba_people.pessoa_tags FOR ALL
  USING (EXISTS (
    SELECT 1 FROM aba_people.pessoas p WHERE p.id = pessoa_tags.pessoa_id
      AND public.is_account_member(p.account_id, 'agent') AND access.can('people', 'update')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM aba_people.pessoas p WHERE p.id = pessoa_tags.pessoa_id
      AND public.is_account_member(p.account_id, 'agent') AND access.can('people', 'update')
  ));

-- ============================================================
-- Campos customizados — settings-class (admin+ define o campo);
-- o VALOR na pessoa é dado operacional (agent+ preenche).
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_people.campos_customizados (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  tipo_campo TEXT NOT NULL CHECK (tipo_campo IN ('texto','numero','data','booleano','selecao')),
  opcoes     JSONB,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pt_campos_account ON aba_people.campos_customizados(account_id);

ALTER TABLE aba_people.campos_customizados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pt_campos_select ON aba_people.campos_customizados;
CREATE POLICY pt_campos_select ON aba_people.campos_customizados FOR SELECT
  USING (public.is_account_member(account_id) AND access.can('people', 'read'));
DROP POLICY IF EXISTS pt_campos_insert ON aba_people.campos_customizados;
CREATE POLICY pt_campos_insert ON aba_people.campos_customizados FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin') AND access.can('people', 'create'));
DROP POLICY IF EXISTS pt_campos_update ON aba_people.campos_customizados;
CREATE POLICY pt_campos_update ON aba_people.campos_customizados FOR UPDATE
  USING (public.is_account_member(account_id, 'admin') AND access.can('people', 'update'));
DROP POLICY IF EXISTS pt_campos_delete ON aba_people.campos_customizados;
CREATE POLICY pt_campos_delete ON aba_people.campos_customizados FOR DELETE
  USING (public.is_account_member(account_id, 'admin') AND access.can('people', 'delete'));

CREATE TABLE IF NOT EXISTS aba_people.pessoa_campos_customizados (
  pessoa_id UUID NOT NULL REFERENCES aba_people.pessoas(id) ON DELETE CASCADE,
  campo_id  UUID NOT NULL REFERENCES aba_people.campos_customizados(id) ON DELETE CASCADE,
  valor     JSONB,
  PRIMARY KEY (pessoa_id, campo_id)
);

ALTER TABLE aba_people.pessoa_campos_customizados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoa_campos_select ON aba_people.pessoa_campos_customizados;
CREATE POLICY pessoa_campos_select ON aba_people.pessoa_campos_customizados FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM aba_people.pessoas p WHERE p.id = pessoa_campos_customizados.pessoa_id
      AND public.is_account_member(p.account_id) AND access.can('people', 'read')
  ));
DROP POLICY IF EXISTS pessoa_campos_modify ON aba_people.pessoa_campos_customizados;
CREATE POLICY pessoa_campos_modify ON aba_people.pessoa_campos_customizados FOR ALL
  USING (EXISTS (
    SELECT 1 FROM aba_people.pessoas p WHERE p.id = pessoa_campos_customizados.pessoa_id
      AND public.is_account_member(p.account_id, 'agent') AND access.can('people', 'update')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM aba_people.pessoas p WHERE p.id = pessoa_campos_customizados.pessoa_id
      AND public.is_account_member(p.account_id, 'agent') AND access.can('people', 'update')
  ));

-- ============================================================
-- Notas — dado operacional, preso à pessoa
-- ============================================================
CREATE TABLE IF NOT EXISTS aba_people.pessoa_notas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id  UUID NOT NULL REFERENCES aba_people.pessoas(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  autor_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  conteudo   TEXT NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pessoa_notas_pessoa ON aba_people.pessoa_notas(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoa_notas_account ON aba_people.pessoa_notas(account_id);

ALTER TABLE aba_people.pessoa_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoa_notas_select ON aba_people.pessoa_notas;
CREATE POLICY pessoa_notas_select ON aba_people.pessoa_notas FOR SELECT
  USING (public.is_account_member(account_id) AND access.can('people', 'read'));
DROP POLICY IF EXISTS pessoa_notas_insert ON aba_people.pessoa_notas;
CREATE POLICY pessoa_notas_insert ON aba_people.pessoa_notas FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'agent') AND access.can('people', 'create'));
DROP POLICY IF EXISTS pessoa_notas_update ON aba_people.pessoa_notas;
CREATE POLICY pessoa_notas_update ON aba_people.pessoa_notas FOR UPDATE
  USING (public.is_account_member(account_id, 'agent') AND access.can('people', 'update'));
DROP POLICY IF EXISTS pessoa_notas_delete ON aba_people.pessoa_notas;
CREATE POLICY pessoa_notas_delete ON aba_people.pessoa_notas FOR DELETE
  USING (public.is_account_member(account_id, 'agent') AND access.can('people', 'delete'));

-- ============================================================
-- converter_lead() — docs/02 §3.4. SECURITY INVOKER de propósito: a
-- RLS de leads/clientes do próprio chamador se aplica normalmente, sem
-- abrir um caminho de escalação por trás da função. Idempotente por
-- construção (ON CONFLICT), não por EXCEPTION — clientes.id já É
-- leads.id (mesma identidade compartilhada), então não precisa do
-- índice único parcial nem do bloco EXCEPTION unique_violation que a
-- versão original do Maximus (migration 066) tinha.
-- ============================================================
CREATE OR REPLACE FUNCTION aba_people.converter_lead(p_lead_id UUID)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_lead aba_people.leads%ROWTYPE;
BEGIN
  SELECT * INTO v_lead FROM aba_people.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado' USING ERRCODE = '22023';
  END IF;
  IF v_lead.status = 'desqualificado' THEN
    RAISE EXCEPTION 'Lead desqualificado não é convertido' USING ERRCODE = '22023';
  END IF;

  INSERT INTO aba_people.clientes (id, account_id, lead_id, razao_social, status)
  SELECT v_lead.id, v_lead.account_id, v_lead.id, p.nome_exibicao, 'ativo'
  FROM aba_people.pessoas p WHERE p.id = v_lead.id
  ON CONFLICT (id) DO NOTHING;

  UPDATE aba_people.leads SET status = 'convertido' WHERE id = p_lead_id;

  RETURN v_lead.id;
END;
$$;

REVOKE ALL ON FUNCTION aba_people.converter_lead(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aba_people.converter_lead(UUID) TO authenticated, service_role;
